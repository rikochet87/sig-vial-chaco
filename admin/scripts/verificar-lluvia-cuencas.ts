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
import {
  csvCuencas, csvMaximas, laminaMaxima, laminaPorCuenca, leerPunto, muestrasDe, partesFaltantes, pesosIdw, serieDiaria,
  totalCuencas, PASO_KM, VENTANAS_DIAS, type DiaCuenca,
} from '../src/lib/lluviaCuencas'
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

// ── La serie diaria ─────────────────────────────────────────────────────────
titulo('Los pesos por cuenca dan lo mismo que el IDW punto por punto')

/*
 * La serie diaria no corre el IDW cada día: usa que es lineal y calcula una
 * sola vez cuánto pesa cada pluviómetro en cada cuenca. Eso repite las reglas
 * de `estimarPunto` en otro lugar, así que acá se comprueba que los dos caminos
 * coinciden. Si alguien cambia el radio, la potencia o la regla de la estación
 * pegada en uno solo de los dos, esto falla.
 *
 * El campo de prueba es deliberadamente irregular —cada estación con un valor
 * distinto— para que un peso mal puesto no se compense con otro.
 */
t0 = Date.now()
const pesos = pesosIdw(muestras, ESTACIONES_ACTIVAS)
info(`pesos de 13 cuencas × ${ESTACIONES_ACTIVAS.length} pluviómetros en ${Date.now() - t0} ms`)

const irregular = est(e => Math.round(Math.abs(Math.sin(e.lat * 37 + e.lng * 11)) * 1200) / 10)
const porPuntos = laminaPorCuenca(cuencas, muestras, irregular)
let peorPeso = 0
for (let i = 0; i < cuencas.length; i++) {
  const lineal = pesos[i].pesos.reduce((s, w, j) => s + w * irregular[j].mm, 0)
  peorPeso = Math.max(peorPeso, Math.abs(lineal - porPuntos[i].mm!))
}
// `estimarPunto` redondea cada punto a dos decimales; de ahí la tolerancia
ok('la lámina coincide en las trece (±0,02 mm)', peorPeso < 0.02)
info(`la mayor diferencia: ${peorPeso.toFixed(4)} mm`)
ok('y la cobertura es la misma',
  cuencas.every((_, i) => Math.abs(pesos[i].cobertura - porPuntos[i].cobertura) < 0.0001))
ok('los pesos de cada cuenca suman 1',
  pesos.every(p => Math.abs(p.pesos.reduce((s, w) => s + w, 0) - 1) < 1e-9))

titulo('La serie de una cuenca, día por día')

/*
 * Tres días con parte dentro de una semana. Los otros cuatro no tienen parte:
 * no son ceros medidos, y la serie los tiene que dejar distinguir.
 */
const N = ESTACIONES_ACTIVAS.length
const tresPartes = [
  { fecha: '2026-09-22', mm: new Array<number>(N).fill(20) },
  { fecha: '2026-09-23', mm: new Array<number>(N).fill(50) },
  { fecha: '2026-09-26', mm: new Array<number>(N).fill(0) },
]
const serie = serieDiaria(pesos[7], tresPartes, '2026-09-20', '2026-09-26')
ok('trae los siete días del rango', serie.length, 7)
ok('los días con parte llevan su lámina', serie.filter(d => d.mm !== null).map(d => d.mm).join(','), '20,50,0')
ok('los días sin parte van en null, no en cero', serie.filter(d => d.mm === null).length, 4)
ok('un cero medido sigue siendo cero', serie[6].mm, 0)

/*
 * La suma de la serie es la lámina del período: es lo que garantiza que esta
 * tabla y la del acumulado, que se calculan por caminos distintos, no puedan
 * decir números distintos para lo mismo.
 */
const dosDias = [
  { fecha: '2026-09-22', mm: irregular.map(e => e.mm) },
  { fecha: '2026-09-23', mm: irregular.map(e => Math.round(e.mm * 4) / 10) },
]
const acumulado = est(() => 0).map((e, j) => ({ ...e, mm: dosDias[0].mm[j] + dosDias[1].mm[j] }))
const delPeriodo = laminaPorCuenca(cuencas, muestras, acumulado)
let peorSuma = 0
for (let i = 0; i < cuencas.length; i++) {
  const suma = serieDiaria(pesos[i], dosDias, '2026-09-22', '2026-09-23').reduce((s, d) => s + (d.mm ?? 0), 0)
  peorSuma = Math.max(peorSuma, Math.abs(suma - delPeriodo[i].mm!))
}
ok('la suma de los días es la lámina del período (±0,05 mm)', peorSuma < 0.05)

const sinCobertura = serieDiaria({ pesos: new Array<number>(N).fill(0), cobertura: 0 }, tresPartes, '2026-09-20', '2026-09-26')
ok('una cuenca sin cobertura no tiene serie', sinCobertura.every(d => d.mm === null))

titulo('La lámina máxima en varios días corridos')

const D = (fecha: string, mm: number | null): DiaCuenca => ({ fecha, mm })
//                     01    02    03    04    05    06    07    08    09    10
const hecha = [10, null, 0, 40, 30, null, 5, 0, 60, null].map((mm, i) =>
  D(`2026-09-${String(i + 1).padStart(2, '0')}`, mm))

ok('en 1 día: el pico', laminaMaxima(hecha, 1)?.mm, 60)
ok('y dice qué día fue', laminaMaxima(hecha, 1)?.desde, '2026-09-09')
/*
 * Lo que justifica mirar varios días: el mayor acumulado de 3 días NO es el que
 * contiene al pico. El día 9 cayeron 60 mm solos; del 3 al 5 cayeron 70.
 */
ok('en 3 días: gana la tormenta larga, no la que tiene el pico', laminaMaxima(hecha, 3)?.mm, 70)
// Del 3 al 5 y del 4 al 6 empatan —los dos días de afuera son secos—, y con
// cualquiera de las dos la ventana contiene los dos días que llovió.
const m3 = laminaMaxima(hecha, 3)!
ok('y la ventana contiene los dos días de esa tormenta', m3.desde <= '2026-09-04' && m3.hasta >= '2026-09-05')
ok('en 7 días', laminaMaxima(hecha, 7)?.mm, 135)
ok('los días sin parte suman cero y no cortan la ventana', laminaMaxima(hecha, 5)?.mm, 95)
ok('la máxima crece con la duración',
  VENTANAS_DIAS.map(d => laminaMaxima(hecha, d)!.mm).every((v, i, a) => i === 0 || v >= a[i - 1]))

ok('una serie más corta que la ventana no tiene máxima', laminaMaxima(hecha.slice(0, 4), 5), null)
ok('una serie sin ningún parte tampoco, y no es cero',
  laminaMaxima(hecha.map(d => D(d.fecha, null)), 3), null)
ok('si no llovió nunca, la máxima es cero', laminaMaxima(hecha.map(d => D(d.fecha, 0)), 3)?.mm, 0)

const empate = [5, 5, 0, 5, 5].map((mm, i) => D(`2026-10-0${i + 1}`, mm))
ok('si dos ventanas empatan, se informa la más reciente', laminaMaxima(empate, 2)?.desde, '2026-10-04')

const csvMax = csvMaximas(
  [{ cod: 8, nombre: 'Tapenagá', maximas: VENTANAS_DIAS.map(d => laminaMaxima(hecha, d)) }],
  { desde: '2026-09-01', hasta: '2026-09-10' }).split('\r\n')
ok('la descarga lleva las cuatro duraciones con sus fechas', csvMax[4].split(';').length, 2 + 4 * 3)
ok('y coma decimal', csvMax[4].includes('60,0'))

// ── La lectura de un punto ──────────────────────────────────────────────────
titulo('La lectura de un punto es la lámina antes de promediar')

/*
 * Una tormenta con gradiente: llueve más hacia el este. Con todos los
 * pluviómetros iguales cualquier promedio da lo mismo y no se probaría nada.
 */
const gradiente = est(e => Math.round(Math.max(0, 20 + 25 * (e.lng + 62))))
const filasG = laminaPorCuenca(cuencas, muestras, gradiente)

/*
 * La que importa: pasar el cursor por adentro de una cuenca es ver, punto por
 * punto, lo que la tabla promedió. Si la lectura usara otro cálculo que la
 * lámina, el mapa y la tabla dirían cosas distintas de la misma cuenca.
 */
let peorPromedio = 0
let fueraDeSuCuenca = 0
for (let i = 0; i < cuencas.length; i++) {
  const lecturas = muestras[i].map(p => leerPunto(p.lat, p.lng, gradiente, cuencas, filasG))
  fueraDeSuCuenca += lecturas.filter(l => l.cuenca?.cod !== cuencas[i].cod).length
  const conDato = lecturas.filter(l => l.mm !== null)
  if (conDato.length === 0 || filasG[i].mm === null) continue
  const promedio = conDato.reduce((s, l) => s + l.mm!, 0) / conDato.length
  peorPromedio = Math.max(peorPromedio, Math.abs(promedio - filasG[i].mm!))
}
ok('el promedio de las lecturas sobre la grilla es la lámina', peorPromedio < 0.02)
info(`mayor diferencia: ${peorPromedio.toFixed(4)} mm`)
ok('cada punto de la grilla se lee en su propia cuenca', fueraDeSuCuenca, 0)

const unaEstacion = gradiente.find(e => e.mm > 0)!
const encima = leerPunto(unaEstacion.lat, unaEstacion.lng, gradiente, cuencas, filasG)
ok('encima de un pluviómetro, es lo que midió', encima.medido && encima.mm === unaEstacion.mm)
ok('y el más cercano es ése', encima.cercano?.nombre, unaEstacion.nombre)

const p8 = muestras[7][Math.floor(muestras[7].length / 2)]
const enLaOcho = leerPunto(p8.lat, p8.lng, gradiente, cuencas, filasG)
ok('la lectura trae la lámina de su cuenca', enLaOcho.lamina?.cod, cuencas[7].cod)
ok('sin la lámina calculada, la lectura sale igual',
  leerPunto(p8.lat, p8.lng, gradiente, cuencas, null).mm, enLaOcho.mm)

const sinNada = leerPunto(p8.lat, p8.lng, [], cuencas, null)
ok('sin pluviómetros no hay dato, y no es cero', sinNada.mm, null)
ok('ni pluviómetro más cercano', sinNada.cercano, null)

// Buenos Aires: lejos de toda cuenca y de todo pluviómetro
const puntoLejano = leerPunto(-34.6, -58.4, gradiente, cuencas, filasG)
ok('fuera de las cuencas no hay cuenca', puntoLejano.cuenca, null)
ok('fuera del radio no hay dato', puntoLejano.mm, null)
ok('pero se dice cuál es el pluviómetro más cercano y a cuánto', (puntoLejano.cercano?.km ?? 0) > 60)

// ── Los partes sin importar ──────────────────────────────────────────────────
titulo('Los partes que la APA publicó y no están cargados')

const publicadas = ['2026-10-03', '2026-09-28', '2026-08-03', '2026-08-01', '2026-06-30']
ok('lo publicado y no cargado, de la más vieja a la más nueva',
  partesFaltantes(publicadas, ['2026-09-28', '2026-10-03'], '2026-07-08', '2026-10-05').join(','), '2026-08-01,2026-08-03')
ok('lo que está fuera del rango no cuenta',
  partesFaltantes(publicadas, [], '2026-09-01', '2026-10-05').join(','), '2026-09-28,2026-10-03')
ok('las dos puntas del rango entran',
  partesFaltantes(publicadas, [], '2026-08-01', '2026-08-03').length, 2)
ok('con todo cargado no falta nada', partesFaltantes(publicadas, publicadas, '2026-01-01', '2026-12-31').length, 0)
ok('una fecha cargada que la APA no lista no es un faltante',
  partesFaltantes(publicadas, ['2026-07-15'], '2026-07-01', '2026-07-31').length, 0)
ok('una fecha repetida en la lista se cuenta una vez',
  partesFaltantes(['2026-08-01', '2026-08-01'], [], '2026-08-01', '2026-08-01').length, 1)

console.log(fallos === 0 ? '\n✓ Todo bien.' : `\n✗ ${fallos} fallo(s).`)
process.exit(fallos === 0 ? 0 : 1)
