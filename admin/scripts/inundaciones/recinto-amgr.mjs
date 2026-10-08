/**
 * Arma el recinto defendido del Gran Resistencia: el polígono que encierran la
 * defensa del Área Metropolitana y la RN 11.
 *
 *   node scripts/inundaciones/recinto-amgr.mjs
 *
 * Deja `docs/geo/inundaciones/recinto-amgr.geojson`, que lee
 * `build_inundaciones.mjs`. Node puro, sin dependencias (a diferencia del resto
 * de esta carpeta).
 *
 * ── De qué está hecho ─────────────────────────────────────────────────────────
 *
 * - **Este y sur: la defensa** (`defensa-amgr.kml`), de norte a sur. Su punta
 *   norte toca la RN 11 (a 20 m).
 * - **Oeste: la RN 11**, que actúa como defensa por indicación del usuario
 *   (08/10/2026). Sale de `admin/public/geo/geo_rn.json`.
 * - **Entre la punta sur de la defensa y la RN 11 hay 7,9 km sin traza.** Se
 *   cierran con una recta hasta el punto de la RN 11 más cercano, que es
 *   además la dirección en que viene el último tramo de la defensa (hacia el
 *   noroeste). **Ese cierre es una suposición** y va aparte en `cierre`, para
 *   que la pantalla lo dibuje a rayas y lo diga. Si aparece la traza real, va
 *   en el KML de la defensa y esto se vuelve a correr.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const ORIGEN = join(AQUI, '..', '..', '..', 'docs', 'geo', 'inundaciones')
const RN = join(AQUI, '..', '..', 'public', 'geo', 'geo_rn.json')

const kml = readFileSync(join(ORIGEN, 'defensa-amgr.kml'), 'utf8')
const defensa = kml.match(/<coordinates>([\s\S]*?)<\/coordinates>/)[1].trim().split(/\s+/)
  .map(t => t.split(',').slice(0, 2).map(Number))

const K = Math.cos(27.45 * Math.PI / 180)
const km = (a, b) => Math.hypot((a[0] - b[0]) * 111.32 * K, (a[1] - b[1]) * 110.57)
/** El punto de un segmento más cercano a `p` */
const alSegmento = (p, a, b) => {
  const dx = (b[0] - a[0]) * K, dy = b[1] - a[1], n = dx * dx + dy * dy
  const t = n ? Math.max(0, Math.min(1, (((p[0] - a[0]) * K) * dx + (p[1] - a[1]) * dy) / n)) : 0
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]
}

// La RN 11 cerca del recinto, en líneas sueltas como vienen en el archivo
const rn = JSON.parse(readFileSync(RN, 'utf8'))
const lineas = rn.features.filter(f => f.properties.Numero === '11').flatMap(f =>
  f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates])
  .map(l => l.map(p => [p[0], p[1]]))
  .filter(l => l.some(([x, y]) => x > -59.2 && x < -58.8 && y > -27.6 && y < -27.25))

/** La línea y el lugar más cercanos a un punto */
function masCercano(p) {
  let mejor = null
  for (const l of lineas) for (let i = 0; i + 1 < l.length; i++) {
    const q = alSegmento(p, l[i], l[i + 1]), d = km(p, q)
    if (!mejor || d < mejor.d) mejor = { l, i, q, d }
  }
  return mejor
}

const norte = defensa[0], sur = defensa[defensa.length - 1]
const enNorte = masCercano(norte), enSur = masCercano(sur)
if (enNorte.d > 0.2) throw new Error(`La punta norte de la defensa está a ${enNorte.d.toFixed(2)} km de la RN 11: se esperaba que la tocara`)
if (enNorte.l === enSur.l) throw new Error('Las dos puntas caen en la misma línea de la RN 11: revisar el armado')

// De la punta sur (sobre la línea de la RN que va al sudoeste) subiendo hasta
// la punta norte. En el medio hay pedacitos de autovía de pocos cientos de
// metros que no se recorren: se salta de una línea a la otra por el extremo
// más cercano.
const tramo = (linea, desdeIdx, haciaExtremo) => {
  const out = []
  if (haciaExtremo === 'fin') for (let k = desdeIdx + 1; k < linea.length; k++) out.push(linea[k])
  else for (let k = desdeIdx; k >= 0; k--) out.push(linea[k])
  return out
}
const lS = enSur.l, lN = enNorte.l
// Hacia qué punta de cada línea está la otra
const extremoHacia = (l, otra) => {
  const c = [otra[0], otra[otra.length - 1]]
  const dIni = Math.min(...c.map(p => km(l[0], p))), dFin = Math.min(...c.map(p => km(l[l.length - 1], p)))
  return dIni < dFin ? 'inicio' : 'fin'
}
const deSur = tramo(lS, enSur.i, extremoHacia(lS, lN))
const haciaN = extremoHacia(lN, lS)
// En la línea norte se entra por la punta que mira al sur y se sube hasta el punto de la defensa
const deNorte = haciaN === 'inicio'
  ? lN.slice(0, enNorte.i + 1)
  : lN.slice(enNorte.i + 1).reverse()
const salto = km(deSur[deSur.length - 1], deNorte[0])
if (salto > 2) throw new Error(`Entre las dos líneas de la RN 11 quedan ${salto.toFixed(2)} km`)

const red = p => [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5]
const rn11 = [enSur.q, ...deSur, ...deNorte, enNorte.q]
const anillo = [...defensa, enSur.q, ...rn11.slice(1, -1), defensa[0]].map(red)
const largo = l => l.slice(1).reduce((s, p, i) => s + km(l[i], p), 0)

// Área en plano local, para tener la escala
let a = 0
for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
  a += (anillo[j][0] * 111.32 * K) * (anillo[i][1] * 110.57) - (anillo[i][0] * 111.32 * K) * (anillo[j][1] * 110.57)
}

const salida = {
  type: 'Feature',
  properties: {
    nombre: 'Recinto defendido del Gran Resistencia',
    defensaKm: Math.round(largo(defensa) * 10) / 10,
    rn11Km: Math.round(largo(rn11) * 10) / 10,
    cierreKm: Math.round(enSur.d * 10) / 10,
    areaKm2: Math.round(Math.abs(a) / 2 * 10) / 10,
    nota: 'Este y sur: la defensa (Defensa AMGR.kmz). Oeste: la RN 11. Entre la punta sur de la defensa y la RN 11, una recta supuesta.',
  },
  cierre: [red(sur), red(enSur.q)],
  geometry: { type: 'Polygon', coordinates: [anillo] },
}
writeFileSync(join(ORIGEN, 'recinto-amgr.geojson'), JSON.stringify(salida))
console.log(salida.properties, 'vértices', anillo.length)
