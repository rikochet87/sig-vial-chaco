/**
 * Verifica la precipitación media areal por cuenca.
 *
 * No hay un valor oficial contra el cual comparar —nadie publicó la lámina por
 * cuenca de un evento—, así que lo que se afirma son **casos donde la respuesta
 * se sabe sin calcular** y la coincidencia entre los dos caminos:
 *
 * - si todos los pluviómetros midieron lo mismo, toda cuenca tiene esa lámina;
 * - si no hay pluviómetros, no hay lámina — y no es cero;
 * - la cobertura que da la grilla de IDW y la que da el recorte de Thiessen son
 *   la misma superficie medida de dos formas que no comparten geometría.
 *
 *   npx tsx scripts/verificar-lluvia-cuencas.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parsearCuencas } from '../src/lib/cuencas'
import { csvCuencas, laminaPorCuenca, muestrasDe, totalCuencas, PASO_KM } from '../src/lib/lluviaCuencas'
import { arealPorPartes, arealPorSuperficie, type MedicionConNombre } from '../src/lib/thiessenAreal'
import { ESTACIONES_ACTIVAS } from '../src/data/estacionesApa'

let fallos = 0
const fmt = (v: unknown) =>
  typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(3)) : JSON.stringify(v)

function ok(que: string, valor: unknown, esperado?: unknown) {
  const bien = esperado === undefined ? valor === true : valor === esperado
  if (!bien) fallos++
  console.log(`${bien ? '  ok  ' : '  ✗   '} ${que.padEnd(60)} ${fmt(valor)}`
    + (bien ? '' : `   (esperaba ${fmt(esperado)})`))
}
const info = (s: string) => console.log(`       ${s}`)
const titulo = (s: string) => console.log(`\n— ${s} —`)

const cuencas = parsearCuencas(JSON.parse(
  readFileSync(join(__dirname, '..', 'public', 'geo', 'geo_cuencas.json'), 'utf8')))

// ── La grilla ───────────────────────────────────────────────────────────────
titulo('La grilla de muestreo llena cada cuenca')

let t0 = Date.now()
const muestras = cuencas.map(c => muestrasDe(c))
const msGrilla = Date.now() - t0
const totalPuntos = muestras.reduce((s, m) => s + m.length, 0)
info(`${totalPuntos.toLocaleString('es-AR')} puntos en ${msGrilla} ms`)

/*
 * Cada punto representa PASO² km², así que contar puntos es medir el área. Si
 * la grilla dejara huecos, repitiera filas o se saliera del borde, la cuenta no
 * daría la superficie declarada.
 */
let peor = 0
for (let i = 0; i < cuencas.length; i++) {
  const estimada = muestras[i].length * PASO_KM * PASO_KM
  const dif = Math.abs(estimada / (cuencas[i].ha / 100) - 1)
  if (dif > peor) peor = dif
}
ok('contando puntos se recupera el área de cada cuenca (±3 %)', peor < 0.03)
info(`la que más se aparta: ${(peor * 100).toFixed(2)} %`)

const claves = new Set<string>()
let repetidos = 0
for (const m of muestras) for (const p of m) {
  const k = `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`
  if (claves.has(k)) repetidos++
  claves.add(k)
}
ok('ningún punto cae en dos cuencas', repetidos, 0)

// ── Los casos de respuesta conocida ─────────────────────────────────────────
const est = (mm: (e: { lat: number; lng: number }) => number): MedicionConNombre[] =>
  ESTACIONES_ACTIVAS.map(e => ({ nombre: e.nombre, lat: e.lat, lng: e.lng, mm: mm(e) }))

titulo('Si todos los pluviómetros midieron 30 mm, toda cuenca tiene 30 mm')

t0 = Date.now()
const parejo = laminaPorCuenca(cuencas, muestras, est(() => 30))
const msCalculo = Date.now() - t0
info(`${ESTACIONES_ACTIVAS.length} pluviómetros · 13 cuencas en ${msCalculo} ms`)

ok('por IDW, las que tienen dato dan 30', parejo.every(f => f.mm === null || f.mm === 30))
ok('por Thiessen también', parejo.every(f => f.thiessen.mm === null || f.thiessen.mm === 30))
ok('y el punto máximo es 30', parejo.every(f => f.mmMax === null || f.mmMax === 30))
ok('las trece tienen algún pluviómetro en el radio', parejo.every(f => f.mm !== null))

/*
 * El volumen es aritmética, pero es el número que se va a citar: 30 mm sobre
 * los km² cubiertos, y un milímetro sobre un km² son mil m³.
 */
const tapenaga = parejo.find(f => f.cod === 8)!
ok('el volumen es lámina × superficie cubierta',
  Math.abs(tapenaga.hm3! - (30 * tapenaga.km2 * tapenaga.cobertura) / 1000) < 0.06)
info(`Tapenagá: 30 mm × ${Math.round(tapenaga.km2).toLocaleString('es-AR')} km² × `
  + `${(tapenaga.cobertura * 100).toFixed(1)} % = ${tapenaga.hm3} hm³`)

const total = totalCuencas(parejo)
ok('el total de la provincia también da 30 mm', total.mm, 30)
ok('y su volumen es la suma de los de las cuencas',
  Math.abs(total.hm3! - parejo.reduce((s, f) => s + (f.hm3 ?? 0), 0)) < 1)
info(`provincia: ${Math.round(total.km2).toLocaleString('es-AR')} km² · cobertura `
  + `${(total.cobertura * 100).toFixed(1)} % · ${total.hm3} hm³`)

titulo('Los dos caminos miden la misma cobertura')

/*
 * La prueba fuerte. La grilla cuenta puntos con pluviómetro en el radio; el
 * recorte de Thiessen mide el área de los polígonos. No comparten geometría,
 * así que si coinciden no es por construcción.
 */
let peorCob = 0, cualCob = ''
for (const f of parejo) {
  const d = Math.abs(f.cobertura - f.thiessen.cobertura)
  if (d > peorCob) { peorCob = d; cualCob = f.nombre }
  info(`${String(f.cod).padStart(2)} ${f.nombre.padEnd(36)} grilla ${(f.cobertura * 100).toFixed(1).padStart(5)} %  ·  Thiessen ${(f.thiessen.cobertura * 100).toFixed(1).padStart(5)} %`)
}
ok('coinciden a menos de 3 puntos en las trece', peorCob < 0.03)
info(`la mayor diferencia: ${(peorCob * 100).toFixed(2)} puntos, en ${cualCob}`)
ok('hay cuencas con cobertura parcial: el hueco es real', parejo.some(f => f.cobertura < 0.99))

titulo('Sin pluviómetros no hay lámina, y no es cero')

const nada = laminaPorCuenca(cuencas, muestras, [])
ok('la lámina es null en las trece', nada.every(f => f.mm === null))
ok('la cobertura es cero', nada.every(f => f.cobertura === 0))
ok('y el volumen es null, no cero', nada.every(f => f.hm3 === null))
ok('el total tampoco inventa nada', totalCuencas(nada).mm, null)

const lejos = laminaPorCuenca(cuencas, muestras, [{ nombre: 'Buenos Aires', lat: -34.6, lng: -58.4, mm: 80 }])
ok('un pluviómetro a 700 km no le da lámina a ninguna', lejos.every(f => f.mm === null))

titulo('Una tormenta en el este no moja las cuencas del oeste')

/*
 * 100 mm al este del meridiano 59,5° O y cero en el resto. El valle de
 * inundación del Paraná, que es el borde este de la provincia, tiene que quedar
 * arriba, y el Impenetrable —en la otra punta— en cero.
 *
 * La primera versión de esta prueba esperaba la lluvia en la «Línea Paraná»
 * por el nombre, y falló: esa cuenca no está sobre el río sino tierra adentro.
 * El nombre de una cuenca no dice dónde queda.
 */
const tormenta = laminaPorCuenca(cuencas, muestras, est(e => (e.lng > -59.5 ? 100 : 0)))
const de = (cod: number) => tormenta.find(f => f.cod === cod)!
ok('el valle del Paraná recibe más de 90 mm', de(12).mm! > 90)
ok('el Impenetrable no recibe nada', de(13).mm, 0)
ok('toda lámina queda entre 0 y 100', tormenta.every(f => f.mm === null || (f.mm >= 0 && f.mm <= 100)))
ok('el máximo puntual nunca es menor que la media', tormenta.every(f => f.mm === null || f.mmMax! >= f.mm))
ok('IDW y Thiessen ordenan igual las dos puntas',
  de(12).thiessen.mm! > 90 && de(13).thiessen.mm === 0)
/*
 * En una cuenca partida por el frente de la tormenta los dos métodos difieren,
 * y tienen que diferir: IDW suaviza el borde y Thiessen lo corta en seco. Lo
 * que no puede pasar es que se vayan lejos uno del otro.
 */
ok('donde el frente parte la cuenca, difieren pero no se alejan',
  tormenta.every(f => f.mm === null || Math.abs(f.mm - f.thiessen.mm!) < 10))
for (const f of [...tormenta].sort((a, b) => (b.mm ?? -1) - (a.mm ?? -1)).slice(0, 5)) {
  info(`${String(f.cod).padStart(2)} ${f.nombre.padEnd(36)} IDW ${String(f.mm).padStart(6)}  ·  Thiessen ${String(f.thiessen.mm).padStart(6)}  ·  ${f.hm3} hm³`)
}

titulo('Una región en varias partes se promedia junta, no parte por parte')

/*
 * El valle del Paraná son doce polígonos. Sumar los km² de todas las partes
 * antes de dividir no es lo mismo que promediar los promedios: eso pesaría
 * igual una isla chica que una grande.
 */
const valle = cuencas.find(c => c.cod === 12)!
const partes = valle.partes.map(p => p.map(([lat, lng]) => [lng, lat] as [number, number]))
// Mitad norte del valle con 60 mm y mitad sur con 10, para que las partes difieran
const latCorte = (valle.caja[0] + valle.caja[2]) / 2
const medic = est(e => (e.lat > latCorte ? 60 : 10))
const junto = arealPorPartes(medic, partes)
const sueltas = partes.map(p => arealPorSuperficie(medic, p)).filter(m => m.mm !== null)
const aMano = sueltas.reduce((s, m) => s + m.mm! * m.pesoTotal, 0) / sueltas.reduce((s, m) => s + m.pesoTotal, 0)
const promedioDePromedios = sueltas.reduce((s, m) => s + m.mm!, 0) / sueltas.length
ok('coincide con pesar cada parte por sus km²', Math.abs(junto.mm! - aMano) < 0.05)
ok('y no con el promedio simple de las partes', Math.abs(junto.mm! - promedioDePromedios) > 0.5)
info(`junto ${junto.mm} mm · pesando a mano ${aMano.toFixed(2)} · promedio de promedios ${promedioDePromedios.toFixed(2)}`)
ok('con una sola parte da lo mismo que arealPorSuperficie',
  arealPorPartes(medic, [partes[0]]).mm, arealPorSuperficie(medic, partes[0]).mm)

titulo('La descarga')

const csv = csvCuencas(tormenta, { desde: '2026-09-22', hasta: '2026-09-24' }).split('\r\n')
ok('una fila por cuenca más el encabezado', csv.length, 4 + 13)
ok('con coma decimal, para Excel en español', csv.slice(4).every(l => !/\d\.\d/.test(l)))
ok('una cuenca sin dato va con la celda vacía, no con cero',
  csvCuencas(nada, { desde: 'a', hasta: 'b' }).split('\r\n')[4].split(';')[3], '')

console.log(fallos === 0 ? '\n✓ Todo bien.' : `\n✗ ${fallos} fallo(s).`)
process.exit(fallos === 0 ? 0 : 1)
