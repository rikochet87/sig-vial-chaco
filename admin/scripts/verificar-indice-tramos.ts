/**
 * Verifica el índice espacial de tramos contra fuerza bruta.
 *
 * Es el chequeo que importa: un índice que se saltea tramos **no falla, sólo
 * contesta mal**, y en pantalla eso se ve como un camino que a veces responde
 * al cursor y a veces no. Por eso se compara contra recorrer todos los
 * segmentos, que es lento pero no se puede equivocar.
 *
 *   npx tsx scripts/verificar-indice-tramos.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { IndiceTramos } from '../src/lib/indiceTramos'
import { CELDA_GRADOS, distanciaAlSegmentoKm } from '../src/lib/redFondo'
import { extraerTramos, type RedVial, type TramoRed } from '../src/lib/redLluvia'

let fallos = 0
function ok(que: string, valor: unknown, esperado?: unknown) {
  const bien = esperado === undefined ? valor === true : JSON.stringify(valor) === JSON.stringify(esperado)
  if (!bien) fallos++
  console.log(`${bien ? '  ok  ' : '  ✗   '} ${que.padEnd(56)} ${JSON.stringify(valor)}`
    + (bien ? '' : `   (esperaba ${JSON.stringify(esperado)})`))
}
const info = (s: string) => console.log(`       ${s}`)
const titulo = (s: string) => console.log(`\n— ${s} —`)

/** Lo mismo que hace el índice, pero mirando todos los segmentos */
function fuerzaBruta(
  tramos: TramoRed[], punto: { lat: number; lng: number }, tolKm: number,
): { indice: number; km: number } | null {
  let mejor: { indice: number; km: number } | null = null
  for (let t = 0; t < tramos.length; t++) {
    const pts = tramos[t].puntos
    for (let i = 0; i + 1 < pts.length; i++) {
      const d = distanciaAlSegmentoKm(punto, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1])
      if (d <= tolKm && (mejor === null || d < mejor.km)) mejor = { indice: t, km: d }
    }
  }
  return mejor
}

const red = JSON.parse(
  readFileSync(join(process.cwd(), 'public/geo/geo_cc.json'), 'utf8')) as RedVial

titulo('Armar el índice')
const t0 = Date.now()
const tramos = extraerTramos(red)
const msExtraer = Date.now() - t0

const t1 = Date.now()
const indice = new IndiceTramos(tramos)
const msIndice = Date.now() - t1

info(`${tramos.length.toLocaleString('es-AR')} tramos en ${msExtraer} ms`)
info(`${indice.celdasOcupadas.toLocaleString('es-AR')} celdas ocupadas, indexado en ${msIndice} ms`)
ok('hay tramos', tramos.length > 9000)
ok('el índice ocupa celdas', indice.celdasOcupadas > 100)
ok('armarlo cuesta menos que partir la red', msIndice <= msExtraer * 2)

titulo('La celda tiene que ser más grande que la tolerancia')
// Si no, mirar las ocho vecinas no alcanzaría para garantizar que no se escapa
// un tramo cercano. Es la misma invariante que en redFondo.
const celdaKm = CELDA_GRADOS * 111.32
info(`la celda mide ${celdaKm.toFixed(3)} km de lado`)
ok('la celda supera holgadamente la tolerancia de trabajo', celdaKm > 2)

titulo('Contra fuerza bruta, sobre puntos de la red real')
// Puntos tomados de las propias trazas: garantizan que hay algo cerca.
const muestras: { lat: number; lng: number }[] = []
for (let i = 0; i < tramos.length && muestras.length < 40; i += Math.floor(tramos.length / 40)) {
  const pts = tramos[i].puntos
  const p = pts[Math.floor(pts.length / 2)]
  if (p) muestras.push({ lat: p[0], lng: p[1] })
}
// Y algunos lejos de todo, para chequear que no invente
muestras.push({ lat: -24.0, lng: -63.5 }, { lat: -29.5, lng: -57.0 })

const TOL = 0.5
let iguales = 0
for (const m of muestras) {
  const conIndice = indice.tramoEn(m, TOL)
  const bruto = fuerzaBruta(tramos, m, TOL)
  const mismo = conIndice === null && bruto === null
    ? true
    : conIndice !== null && bruto !== null && Math.abs(conIndice.km - bruto.km) < 1e-9
  if (mismo) iguales++
  else console.log(`  ✗   discrepan en ${m.lat},${m.lng}: `
    + `${JSON.stringify(conIndice)} contra ${JSON.stringify(bruto)}`)
}
ok(`el índice coincide con fuerza bruta en las ${muestras.length} muestras`, iguales, muestras.length)

/*
 * Los dos tiempos se miden en bloques separados y no adentro del mismo bucle.
 * La primera versión de este test los cronometraba juntos y le atribuía al
 * índice los 10 ms por consulta que en realidad gastaba la fuerza bruta: el
 * número decía que el índice era lento cuando lo que medía era el control.
 */
const t2 = Date.now()
for (const m of muestras) indice.tramoEn(m, TOL)
const msIndice2 = Date.now() - t2

const t3 = Date.now()
for (const m of muestras) fuerzaBruta(tramos, m, TOL)
const msBruto = Date.now() - t3

info(`${msIndice2} ms con índice contra ${msBruto} ms por fuerza bruta, `
  + `${muestras.length} consultas`)
ok('una consulta con índice tarda menos de 2 ms', msIndice2 / muestras.length < 2)
ok('y es mucho más rápido que recorrer todo', msIndice2 * 10 < msBruto)

titulo('Parado sobre un camino conocido')
const alMedio = tramos[0].puntos[Math.floor(tramos[0].puntos.length / 2)]
const hit = indice.tramoEn({ lat: alMedio[0], lng: alMedio[1] }, TOL)
ok('devuelve algo', hit !== null)
ok('y prácticamente a distancia cero', (hit?.km ?? 1) < 0.001)
info(`da el tramo ${hit?.indice} — ${tramos[hit?.indice ?? 0]?.ruta || 'sin designación'} `
  + `· CC ${tramos[hit?.indice ?? 0]?.cc}`)

titulo('Nada cerca, nada se inventa')
ok('lejos de todo devuelve null', indice.tramoEn({ lat: -24, lng: -63.5 }, TOL), null)
ok('con tolerancia cero devuelve null',
  indice.tramoEn({ lat: alMedio[0] + 0.01, lng: alMedio[1] + 0.01 }, 0), null)

titulo('Un tramo largo responde en todo su recorrido')
// Ésta es la que atrapa el error de indexar por tramo en vez de por segmento:
// un tramo de 50 km metido en la celda de su primer vértice sería invisible en
// casi todo su largo.
const masLargo = tramos.reduce((a, b, i) => (b.km > tramos[a].km ? i : a), 0)
const pts = tramos[masLargo].puntos
info(`el más largo son ${tramos[masLargo].km.toFixed(1)} km con ${pts.length} vértices`)
let respondieron = 0
const aProbar = [0, 0.25, 0.5, 0.75, 0.999]
for (const f of aProbar) {
  const p = pts[Math.min(pts.length - 1, Math.floor(f * pts.length))]
  if (indice.tramoEn({ lat: p[0], lng: p[1] }, TOL) !== null) respondieron++
}
ok('responde en los cinco puntos del recorrido', respondieron, aProbar.length)

console.log(fallos === 0 ? '\n✓ Todo bien.' : `\n✗ ${fallos} fallo(s).`)
process.exit(fallos === 0 ? 0 : 1)
