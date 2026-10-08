/**
 * Arma el recinto defendido del Gran Resistencia: el polígono que encierran la
 * defensa del Área Metropolitana, la RN 11 y la Av. Soberanía Nacional.
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
 *   norte toca la RN 11 (a 20 m) y la sur termina sobre la Av. Soberanía
 *   Nacional, a 40 m del canal que corre junto a ella.
 * - **Oeste: la RN 11**, que actúa como defensa por indicación del usuario
 *   (08/10/2026). Sale de `admin/public/geo/geo_rn.json`.
 * - **Sur: el canal de la Av. Soberanía Nacional** (`soberania-nacional.geojson`,
 *   de OpenStreetMap), desde la punta sur de la defensa hasta su extremo
 *   oeste, y de ahí 0,5 km hasta la RN 11.
 *
 * **El anillo no cierra.** Entre la punta sur de la defensa y la RN 11 no hay
 * terraplén: el sur de Resistencia queda abierto al valle del Paraná, y es la
 * parte más expuesta del Gran Resistencia a una crecida extraordinaria. Que la
 * Av. Soberanía Nacional sea el límite es una decisión del usuario
 * (08/10/2026), no una obra: al norte no se dibuja el agua del río, al sur sí.
 * Por eso va aparte en `corte`, para que la pantalla lo dibuje a rayas y lo
 * diga. Si aparece la traza de una defensa sur, va en el KML y esto se vuelve
 * a correr.
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

// El canal de la Av. Soberanía Nacional, de oeste a este
const soberania = JSON.parse(readFileSync(join(ORIGEN, 'soberania-nacional.geojson'), 'utf8')).geometry.coordinates
if (soberania[0][0] > soberania[soberania.length - 1][0]) throw new Error('soberania-nacional.geojson tiene que ir de oeste a este')

const norte = defensa[0], sur = defensa[defensa.length - 1]

// Dónde toca el canal la punta sur de la defensa
let enCanal = null
for (let i = 0; i + 1 < soberania.length; i++) {
  const q = alSegmento(sur, soberania[i], soberania[i + 1]), d = km(sur, q)
  if (!enCanal || d < enCanal.d) enCanal = { i, q, d }
}
if (enCanal.d > 0.2) throw new Error(`La punta sur de la defensa está a ${enCanal.d.toFixed(2)} km de la Av. Soberanía Nacional: se esperaba que la tocara`)
// Del punto de la defensa hacia el oeste, hasta el extremo del canal
const corte = [enCanal.q, ...soberania.slice(0, enCanal.i + 1).reverse()]
const oeste = corte[corte.length - 1]

const enNorte = masCercano(norte), enOeste = masCercano(oeste)
if (enNorte.d > 0.2) throw new Error(`La punta norte de la defensa está a ${enNorte.d.toFixed(2)} km de la RN 11: se esperaba que la tocara`)
if (enOeste.d > 1) throw new Error(`El extremo oeste del canal está a ${enOeste.d.toFixed(2)} km de la RN 11`)

// De la RN 11 frente al canal subiendo hasta la punta norte. Si caen en
// líneas distintas, en el medio hay pedacitos de autovía de pocos cientos de
// metros que no se recorren: se salta de una línea a la otra por el extremo
// más cercano.
const extremoHacia = (l, p) => km(l[0], p) < km(l[l.length - 1], p) ? 'inicio' : 'fin'
let rn11
if (enOeste.l === enNorte.l) {
  const l = enOeste.l
  rn11 = enOeste.i <= enNorte.i
    ? [enOeste.q, ...l.slice(enOeste.i + 1, enNorte.i + 1), enNorte.q]
    : [enOeste.q, ...l.slice(enNorte.i + 1, enOeste.i + 1).reverse(), enNorte.q]
} else {
  const lS = enOeste.l, lN = enNorte.l
  const deSur = extremoHacia(lS, norte) === 'fin' ? lS.slice(enOeste.i + 1) : lS.slice(0, enOeste.i + 1).reverse()
  const deNorte = extremoHacia(lN, oeste) === 'inicio' ? lN.slice(0, enNorte.i + 1) : lN.slice(enNorte.i + 1).reverse()
  const salto = km(deSur[deSur.length - 1], deNorte[0])
  if (salto > 2) throw new Error(`Entre las dos líneas de la RN 11 quedan ${salto.toFixed(2)} km`)
  rn11 = [enOeste.q, ...deSur, ...deNorte, enNorte.q]
}

const red = p => [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5]
const anillo = [...defensa, ...corte.slice(1), ...rn11.slice(0, -1), defensa[0]].map(red)
const largo = l => l.slice(1).reduce((s, p, i) => s + km(l[i], p), 0)

// Área en plano local, para tener la escala
let a = 0
for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
  a += (anillo[j][0] * 111.32 * K) * (anillo[i][1] * 110.57) - (anillo[i][0] * 111.32 * K) * (anillo[j][1] * 110.57)
}

const salida = {
  type: 'Feature',
  properties: {
    nombre: 'Área defendida del Gran Resistencia',
    defensaKm: Math.round(largo(defensa) * 10) / 10,
    rn11Km: Math.round(largo(rn11) * 10) / 10,
    corteKm: Math.round(largo(corte) * 10) / 10,
    enlaceKm: Math.round(enOeste.d * 10) / 10,
    areaKm2: Math.round(Math.abs(a) / 2 * 10) / 10,
    nota: 'Este y sur: la defensa (Defensa AMGR.kmz). Oeste: la RN 11. Sur: la Av. Soberanía Nacional, que no es una defensa: el anillo no cierra y al sur de la avenida el río entra.',
  },
  corte: [...corte, enOeste.q].map(red),
  geometry: { type: 'Polygon', coordinates: [anillo] },
}
writeFileSync(join(ORIGEN, 'recinto-amgr.geojson'), JSON.stringify(salida))
console.log(salida.properties, 'vértices', anillo.length)
