/**
 * Verifica el reparto de la red vial y las obras de arte por cuenca.
 *
 * Lo que tiene que dar: **repartir no crea ni pierde kilómetros.** La suma de
 * las cuencas más lo que cae fuera de todas es la red entera, y eso vale tanto
 * para el largo como para los kilómetros sobre cada umbral de lluvia — que
 * tienen que coincidir con `kmSobre`, el número de la red sin partir.
 *
 *   npx tsx scripts/verificar-red-cuencas.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { dentroDe, parsearCuencas } from '../src/lib/cuencas'
import {
  extraerTramos, kmSobre, lluviaPorTramo, type RedVial, type TramoRed,
} from '../src/lib/redLluvia'
import {
  csvRedCuencas, cuencaDeMuestras, obrasPorCuenca, redPorCuenca, UMBRALES_KM,
  type ObraRelevada,
} from '../src/lib/redCuencas'
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

const GEO = join(__dirname, '..', 'public', 'geo')
const cuencas = parsearCuencas(JSON.parse(readFileSync(join(GEO, 'geo_cuencas.json'), 'utf8')))
const tramos = extraerTramos(JSON.parse(readFileSync(join(GEO, 'geo_cc.json'), 'utf8')) as RedVial)

// ── El reparto ──────────────────────────────────────────────────────────────
titulo('Cada muestra de la red va a una cuenca')

let t0 = Date.now()
const asignacion = cuencaDeMuestras(cuencas, tramos)
const nMuestras = tramos.reduce((s, t) => s + t.muestras.length, 0)
info(`${nMuestras.toLocaleString('es-AR')} muestras de ${tramos.length.toLocaleString('es-AR')} tramos en ${Date.now() - t0} ms`)

ok('una asignación por muestra', asignacion.every((a, i) => a.length === tramos[i].muestras.length))
ok('todas apuntan a una cuenca que existe, o a ninguna',
  asignacion.every(a => a.every(j => j >= -1 && j < cuencas.length)))

const est = (mm: (e: { lat: number; lng: number }) => number) =>
  ESTACIONES_ACTIVAS.map(e => ({ nombre: e.nombre, lat: e.lat, lng: e.lng, mm: mm(e) }))

const kmRed = tramos.reduce((s, t) => s + t.km, 0)
const lluvia = lluviaPorTramo(tramos, est(e => (e.lng > -60 ? 80 : 20)))
const red = redPorCuenca(cuencas, tramos, lluvia, asignacion)

titulo('Repartir no crea ni pierde kilómetros')

const suma = (f: (r: typeof red[number]) => number) => red.reduce((s, r) => s + f(r), 0)
ok('trece cuencas más la fila de lo que cae afuera', red.length, 14)
ok('la suma de las filas es la red entera (±1 km)', Math.abs(suma(r => r.km) - kmRed) < 1)
info(`${Math.round(kmRed).toLocaleString('es-AR')} km de traza · ${red[13].km} km fuera de las cuencas`)

/*
 * Con la contención a secas quedaban 483 km afuera: caminos que corren sobre el
 * límite provincial, unos cientos de metros por fuera del contorno de las
 * cuencas. Con la tolerancia del borde se asignan a la cuenca de al lado y
 * queda afuera sólo lo que está lejos de verdad. Si este número creciera
 * querría decir que las cuencas están corridas.
 */
ok('lo que cae fuera es menos del 0,1 % de la red', red[13].km / kmRed < 0.001)

const sinTolerancia = tramos.reduce((s, t) => s + t.muestras.reduce((x, m) =>
  x + (cuencas.some(c => c.partes.some(p => dentroDe(p, m.lat, m.lng))) ? 0 : m.peso), 0), 0)
info(`sin la tolerancia del borde serían ${Math.round(sinTolerancia)} km`)
ok('la tolerancia recupera los caminos del límite provincial', sinTolerancia > 400 && red[13].km < 20)

/*
 * La que importa: los km sobre cada umbral, sumados por cuenca, tienen que ser
 * el `kmSobre` de la red sin partir. Son dos tablas de la misma pantalla y no
 * pueden contradecirse.
 */
for (let u = 0; u < UMBRALES_KM.length; u++) {
  const porCuencas = suma(r => r.kmDesde[u])
  const entera = kmSobre(tramos, lluvia, UMBRALES_KM[u])
  ok(`los km con ${UMBRALES_KM[u]} mm o más suman lo de la red entera`, Math.abs(porCuencas - entera) < 1)
  info(`${Math.round(porCuencas).toLocaleString('es-AR')} km por cuencas · ${Math.round(entera).toLocaleString('es-AR')} km la red entera`)
}

ok('los umbrales son acumulativos: más mm, menos km',
  red.every(r => r.kmDesde.every((v, i, a) => i === 0 || v <= a[i - 1] + 0.05)))
ok('en ninguna cuenca los km con lluvia superan a los de la red',
  red.every(r => r.kmDesde[0] + r.kmSinDato <= r.km + 0.2))
ok('la tierra nunca es más que la red', red.every(r => r.kmTierra <= r.km + 0.05))

const tierra = suma(r => r.kmTierra)
info(`${(tierra / kmRed * 100).toFixed(1)} % de la red es de tierra`)
ok('la red es mayormente de tierra, como se sabe', tierra / kmRed > 0.9)

titulo('Un tramo que cruza dos cuencas se reparte entre las dos')

/*
 * El motivo de repartir por muestra. Se arma un tramo recto entre los rótulos
 * de dos cuencas vecinas: asignado entero a una, la otra perdería su parte.
 */
const a = cuencas.find(c => c.cod === 8)!, b = cuencas.find(c => c.cod === 6)!
const N = 40
const puntos = Array.from({ length: N + 1 }, (_, i) => [
  a.rotulo[0] + (b.rotulo[0] - a.rotulo[0]) * i / N,
  a.rotulo[1] + (b.rotulo[1] - a.rotulo[1]) * i / N,
] as [number, number])
const kmPaso = 111.32 * Math.hypot(
  (b.rotulo[0] - a.rotulo[0]) / N,
  (b.rotulo[1] - a.rotulo[1]) / N * Math.cos(a.rotulo[0] * Math.PI / 180))
const cruza: TramoRed = {
  cc: 1, ruta: 'prueba', jurisdiccion: '', material: 'TIERRA', km: kmPaso * N, puntos,
  muestras: puntos.slice(0, N).map(([lat, lng], i) => ({
    lat: (lat + puntos[i + 1][0]) / 2, lng: (lng + puntos[i + 1][1]) / 2, peso: kmPaso,
  })),
}
const partido = redPorCuenca(cuencas, [cruza], [{ mm: 30 } as never], cuencaDeMuestras(cuencas, [cruza]))
const conKm = partido.filter(r => r.km > 0)
ok('le toca a más de una cuenca', conKm.length >= 2)
ok('las dos de las puntas tienen su parte',
  partido.find(r => r.cod === 8)!.km > 0 && partido.find(r => r.cod === 6)!.km > 0)
ok('y entre todas suman el tramo', Math.abs(conKm.reduce((s, r) => s + r.km, 0) - cruza.km) < 0.3)
info(conKm.map(r => `${r.nombre}: ${r.km} km`).join(' · '))

// ── Obras de arte ───────────────────────────────────────────────────────────
titulo('Las obras de arte caen en su cuenca')

const obra = (id: string, tipo: string, lat: number, lng: number): ObraRelevada =>
  ({ id, tipo: tipo as ObraRelevada['tipo'], lat, lng, rutaTramo: null, fecha: null })
const obras: ObraRelevada[] = [
  obra('a', 'Puente', a.rotulo[0], a.rotulo[1]),
  obra('b', 'Alcantarilla', a.rotulo[0] + 0.01, a.rotulo[1]),
  obra('c', 'Tubos', b.rotulo[0], b.rotulo[1]),
  obra('d', 'Alcantarilla', -34.6, -58.4),          // Buenos Aires
  obra('e', 'Otro', a.rotulo[0], a.rotulo[1]),      // no es una obra de drenaje
  obra('f', 'Puente', NaN, NaN),                    // relevamiento sin coordenada
]
const medic = est(e => (e.lng > -60 ? 80 : 20))
const porCuenca = obrasPorCuenca(cuencas, obras, medic)
const de = (cod: number) => porCuenca.find(o => o.cod === cod)!

ok('el Tapenagá tiene un puente y una alcantarilla', de(8).cuenta.join(','), '1,1,0')
ok('el Negro - Salado tiene un tubo', de(6).cuenta.join(','), '0,0,1')
ok('la de Buenos Aires va a la fila de afuera', de(0).cuenta.join(','), '0,1,0')
ok('lo que no es obra de drenaje no se cuenta',
  porCuenca.reduce((s, o) => s + o.obras.length, 0), 4)
ok('cada obra lleva la lámina de su punto', de(8).obras.every(o => o.mm !== null && o.mm >= 20 && o.mm <= 80))
ok('lejos de todo pluviómetro la lámina es null, no cero', de(0).obras[0].mm, null)

const sinLluvia = obrasPorCuenca(cuencas, obras, [])
ok('sin mediciones la cuenta sigue valiendo', sinLluvia.find(o => o.cod === 8)!.cuenta.join(','), '1,1,0')
ok('y ninguna obra tiene lámina', sinLluvia.every(o => o.obras.every(x => x.mm === null)))

const mojada = obra('g', 'Puente', a.rotulo[0] + 0.02, a.rotulo[1])
const orden = obrasPorCuenca(cuencas, [obras[0], mojada], [
  { lat: mojada.lat, lng: mojada.lng, mm: 90 }, { lat: a.rotulo[0] - 0.3, lng: a.rotulo[1], mm: 5 },
]).find(o => o.cod === 8)!
ok('dentro de una cuenca van de la más llovida a la menos', orden.obras[0].mm! >= orden.obras[1].mm!)

titulo('La descarga')

const csv = csvRedCuencas(red, porCuenca, { desde: '2026-09-22', hasta: '2026-09-24' }).split('\r\n')
ok('una fila por cuenca, la de afuera y el encabezado', csv.length, 4 + 14)
ok('con coma decimal', csv.slice(4).every(l => !/\d\.\d/.test(l)))
ok('sin obras, las columnas de obras no van',
  csvRedCuencas(red, null, { desde: 'a', hasta: 'b' }).split('\r\n')[3].split(';').length, 5 + UMBRALES_KM.length)

console.log(fallos === 0 ? '\n✓ Todo bien.' : `\n✗ ${fallos} fallo(s).`)
process.exit(fallos === 0 ? 0 : 1)
