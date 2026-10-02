#!/usr/bin/env node
/**
 * Genera `public/geo/geo_hidro.json`: los cursos de agua y los canales de la
 * provincia, en un solo archivo.
 *
 *   node scripts/build_hidrografia.mjs
 *
 * Va en Node y sin dependencias, como `build_cuencas.mjs` y por el mismo
 * motivo: en la máquina donde se trabaja este repo no hay Python.
 *
 * ── De dónde sale ─────────────────────────────────────────────────────────────
 *
 * Dos orígenes que no se pisan, los dos en `docs/geo/hidrografia/`:
 *
 * | | Qué es | Escala | Dónde |
 * |---|---|---|---|
 * | `rios_ign.kml` | la hidrografía del IGN: ríos, arroyos, riachos, cañadas | 1:250.000 | toda la provincia |
 * | `canales/` | shapefiles del sistema de canales de la Línea Paraná | de obra | el sudoeste |
 *
 * **Se complementan justo donde hace falta.** El IGN casi no tiene cursos en el
 * sudoeste —91 km en los Bajos de Chorotis, 179 en la Línea Paraná— porque ahí
 * no hay drenaje natural organizado: el agua sale por canales, y los canales
 * son la otra capa.
 *
 * ── Qué se toma de la carpeta de canales, y qué no ────────────────────────────
 *
 * Trae siete capas que en buena parte son versiones de lo mismo:
 *
 * - **`posgar_canales`** (106 canales, con módulo y clasificación): se usa. Es
 *   la única con `.prj`.
 * - **`linea parana`** (los tramos I a IV del canal troncal y el río Muerto,
 *   410 km): se usa. Es el canal principal y no está en la anterior.
 * - `canales` es `posgar_canales` en otro datum, vértice por vértice.
 * - `Canales/canales` es una versión anterior, sin clasificación. De ahí se
 *   toma **sólo el canal Paralelo 28º Este**, 54 km que no están en ninguna de
 *   las dos de arriba.
 * - `Canales_2do/canales` es una exportación de CAD de la misma red, a unos
 *   70 m de la otra: no se usa. Tiene unos 130 km de colectores que no están
 *   en las demás y que quedan afuera, porque no hay cómo saber cuál de las dos
 *   trazas vale.
 * - `rio_muerto` repite el río Muerto de `linea parana`.
 * - `parteaguas` son tres líneas sin atributos. No se usa.
 *
 * ── El datum de los shapefiles sin .prj ───────────────────────────────────────
 *
 * `canales.shp` y `posgar_canales.shp` son la misma capa en dos sistemas, y
 * comparándolas vértice por vértice (3.652 pares) el corrimiento es constante:
 * **−59,9 m al este y −214,0 m al norte**, con 20 cm de variación en toda la
 * zona. Es el salto de Campo Inchauspe a POSGAR. `linea parana` y
 * `Canales/canales` comparten coordenadas con `canales.shp` —se superponen al
 * metro—, así que están en Campo Inchauspe y se les aplica ese corrimiento
 * antes de pasar a geográficas.
 *
 * **Eso dice algo del shapefile de cuencas**, que tampoco trae .prj y se
 * supuso en POSGAR con evidencia débil: en esta carpeta, lo que viene sin .prj
 * está en Campo Inchauspe. No son el mismo archivo ni se sabe si son del mismo
 * origen, así que no se cambió nada allá; queda anotado.
 *
 * ── Lo que se le hace a los datos ─────────────────────────────────────────────
 *
 * - **La Ñ.** El KML llegó con el carácter roto (CA�ADA): se perdió al
 *   exportarlo. Se repone.
 * - **Los nombres.** El IGN los trae en mayúsculas y sin tildes. Se pasan a
 *   minúsculas y se les pone la tilde a los topónimos conocidos (`TILDES`). Un
 *   curso «SIN NOMBRE» queda con `nombre: null`.
 * - **Los nombres de los canales están cortados a 16 caracteres** por el .dbf.
 *   Se completan sólo los que no admiten otra lectura (`CANALES_COMPLETOS`); el
 *   resto queda cortado, que es más honesto que adivinar.
 * - **Se simplifica la traza** con Douglas-Peucker a {@link TOLERANCIA_M} m. La
 *   del IGN tiene 188 mil vértices para una escala en la que la posición vale
 *   al centenar de metros.
 * - **No se recorta a la provincia.** Los ríos limítrofes —Bermejo, Teuco,
 *   Paraná, Paraguay— son parte de la hidrografía del Chaco aunque corran por
 *   el borde.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const ORIGEN = join(AQUI, '..', '..', 'docs', 'geo', 'hidrografia')
const DESTINO = join(AQUI, '..', 'public', 'geo', 'geo_hidro.json')

/** Cuánto puede apartarse la traza simplificada de la original, en metros */
const TOLERANCIA_M = 10

/** De Campo Inchauspe a POSGAR en faja 5, medido entre las dos versiones de `canales` */
const CORRIMIENTO_INCHAUSPE = { este: -59.9, norte: -214.0 }

/** Un canal más corto que esto es un resto de edición, no un canal */
const LARGO_MINIMO_M = 50

const TIPOS_CURSO = {
  RIO: 'Río', ARROYO: 'Arroyo', RIACHO: 'Riacho', ZANJON: 'Zanjón',
  'CAÑADA': 'Cañada', 'CAÑADON': 'Cañadón', 'CANAL DE RIEGO': 'Canal de riego',
}

/** Topónimos a los que el IGN les sacó la tilde. Palabra por palabra */
const TILDES = {
  guaycuru: 'Guaycurú', guayeuru: 'Guaycurú', tapenaga: 'Tapenagá', parana: 'Paraná',
  mini: 'Miní', polvorin: 'Polvorín', quia: 'Quiá', timbo: 'Timbó', tacuari: 'Tacuarí',
  chaja: 'Chajá', zapiran: 'Zapirán', cangui: 'Cangüí', union: 'Unión', ine: 'Iné',
  aguara: 'Aguará', curundu: 'Curundú', rio: 'Río', zanjon: 'Zanjón',
}
const MINUSCULAS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y'])

const SISTEMAS = {
  'Modulo I': 'Módulo I', 'Modulo II': 'Módulo II', 'Modulo III': 'Módulo III',
  'Rio Muerto': 'Río Muerto', 'Bajos de Choroti': 'Bajos de Chorotis',
}

const CANALES_COMPLETOS = {
  'Paralelo 28º Oes': 'Paralelo 28º Oeste', 'Paralelo 28º Est': 'Paralelo 28º Este',
  'San Bernardo Oes': 'San Bernardo Oeste', 'San Bernardo Est': 'San Bernardo Este',
  'Aliviador Rio Mu': 'Aliviador Río Muerto', 'Caburé-Golondrin': 'Caburé-Golondrina',
  'Rio Muerto': 'Río Muerto', Clolector: 'Colector', Colector1: 'Colector',
  'Tramo III 1ra Se': 'Tramo III, 1.ª sección', 'Tramo III 2da Se': 'Tramo III, 2.ª sección',
  'Tramo IV 1era Se': 'Tramo IV, 1.ª sección', 'Tramo IV 2da Sec': 'Tramo IV, 2.ª sección',
  'Tramo IV 3ra Sec': 'Tramo IV, 3.ª sección', 'Tramo IV 4ta Sec': 'Tramo IV, 4.ª sección',
}

// ── Lectura ──────────────────────────────────────────────────────────────────

/** Las polilíneas de un .shp: por cada forma, sus partes en coordenadas planas */
function leerShp(ruta) {
  const b = readFileSync(ruta)
  const formas = []
  for (let o = 100; o < b.length;) {
    const largo = b.readInt32BE(o + 4) * 2
    const c = o + 8
    const tipo = b.readInt32LE(c)
    if (tipo !== 3) throw new Error(`Se esperaban polilíneas (tipo 3) y hay tipo ${tipo} en ${ruta}`)
    const nPartes = b.readInt32LE(c + 36), nPuntos = b.readInt32LE(c + 40)
    const p0 = c + 44 + 4 * nPartes
    const partes = []
    for (let i = 0; i < nPartes; i++) {
      const desde = b.readInt32LE(c + 44 + 4 * i)
      const hasta = i + 1 < nPartes ? b.readInt32LE(c + 48 + 4 * i) : nPuntos
      const linea = []
      for (let k = desde; k < hasta; k++) linea.push([b.readDoubleLE(p0 + 16 * k), b.readDoubleLE(p0 + 16 * k + 8)])
      partes.push(linea)
    }
    formas.push(partes)
    o = c + largo
  }
  return formas
}

function leerDbf(ruta) {
  const b = readFileSync(ruta)
  const n = b.readUInt32LE(4), cabecera = b.readUInt16LE(8), largo = b.readUInt16LE(10)
  const campos = []
  for (let o = 32; b[o] !== 0x0d; o += 32) {
    campos.push({ nombre: b.toString('latin1', o, o + 11).replace(/\0.*$/, ''), largo: b[o + 16] })
  }
  return Array.from({ length: n }, (_, i) => {
    let o = cabecera + i * largo + 1
    const fila = {}
    for (const c of campos) { fila[c.nombre] = b.toString('latin1', o, o + c.largo).trim(); o += c.largo }
    return fila
  })
}

/** Una capa de canales: cada forma con su fila */
function leerCapa(nombre) {
  const base = join(ORIGEN, 'canales', nombre)
  const dbf = existsSync(base + '.dbf') ? base + '.dbf' : base + '.DBF'
  const formas = leerShp(base + '.shp'), filas = leerDbf(dbf)
  if (formas.length !== filas.length) throw new Error(`${nombre}: el .shp y el .dbf no tienen la misma cantidad de registros`)
  return formas.map((partes, i) => ({ ...filas[i], partes }))
}

// ── Geometría ────────────────────────────────────────────────────────────────

/** Gauss-Krüger faja 5 sobre GRS80 → geográficas. La misma serie de `build_cuencas.mjs` */
function aGeograficas(este, norte) {
  const a = 6378137, f = 1 / 298.257222101
  const n = f / (2 - f)
  const A = a / (1 + n) * (1 + n * n / 4 + n ** 4 / 64)
  const xi = (norte - A * Math.PI / 2) / A, eta = (este - 5_500_000) / A
  const beta = [n / 2 - 2 * n * n / 3 + 37 * n ** 3 / 96, n * n / 48 + n ** 3 / 15, 17 * n ** 3 / 480]
  let xi1 = xi, eta1 = eta
  beta.forEach((bj, j) => {
    const k = 2 * (j + 1)
    xi1 -= bj * Math.sin(k * xi) * Math.cosh(k * eta)
    eta1 -= bj * Math.cos(k * xi) * Math.sinh(k * eta)
  })
  const chi = Math.asin(Math.sin(xi1) / Math.cosh(eta1))
  const delta = [2 * n - 2 * n * n / 3 - 2 * n ** 3, 7 * n * n / 3 - 8 * n ** 3 / 5, 56 * n ** 3 / 15]
  let lat = chi
  delta.forEach((dj, j) => { lat += dj * Math.sin(2 * (j + 1) * chi) })
  return [-60 + Math.atan2(Math.sinh(eta1), Math.cos(xi1)) * 180 / Math.PI, lat * 180 / Math.PI]
}

const M_POR_GRADO = 111_320
/** Metros entre dos puntos `[lng, lat]`, en plano local */
const metros = (p, q) => {
  const f = Math.cos(((p[1] + q[1]) / 2) * Math.PI / 180)
  return Math.hypot((q[0] - p[0]) * f, q[1] - p[1]) * M_POR_GRADO
}
const largoM = linea => { let s = 0; for (let i = 1; i < linea.length; i++) s += metros(linea[i - 1], linea[i]); return s }

/** Douglas-Peucker sobre `[lng, lat]`, con la tolerancia en metros */
function simplificar(linea, tolM) {
  if (linea.length < 3) return linea
  const f = Math.cos(linea[0][1] * Math.PI / 180)
  const pl = linea.map(([x, y]) => [x * f * M_POR_GRADO, y * M_POR_GRADO])
  const queda = new Uint8Array(linea.length)
  queda[0] = queda[linea.length - 1] = 1
  const pila = [[0, linea.length - 1]]
  while (pila.length) {
    const [a, b] = pila.pop()
    const [ax, ay] = pl[a], [bx, by] = pl[b]
    const vx = bx - ax, vy = by - ay, L = vx * vx + vy * vy
    let peor = -1, dMax = tolM
    for (let i = a + 1; i < b; i++) {
      let t = L ? ((pl[i][0] - ax) * vx + (pl[i][1] - ay) * vy) / L : 0
      t = Math.max(0, Math.min(1, t))
      const d = Math.hypot(pl[i][0] - ax - t * vx, pl[i][1] - ay - t * vy)
      if (d > dMax) { dMax = d; peor = i }
    }
    if (peor >= 0) { queda[peor] = 1; pila.push([a, peor], [peor, b]) }
  }
  return linea.filter((_, i) => queda[i])
}

/** 5 decimales son ~1 m; y sin vértices repetidos seguidos */
const redondear = linea => {
  const out = []
  for (const [x, y] of linea) {
    const p = [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5]
    const u = out[out.length - 1]
    if (!u || u[0] !== p[0] || u[1] !== p[1]) out.push(p)
  }
  return out
}

const geometria = partes => {
  const lineas = partes.map(l => redondear(simplificar(l, TOLERANCIA_M))).filter(l => l.length >= 2)
  if (lineas.length === 0) return null
  return lineas.length === 1
    ? { type: 'LineString', coordinates: lineas[0] }
    : { type: 'MultiLineString', coordinates: lineas }
}

// ── Nombres ──────────────────────────────────────────────────────────────────

/**
 * «SALTO DE LA VIEJA» → «Salto de la Vieja», con las tildes que se conocen.
 *
 * El nombre va siempre detrás del tipo —«Río de Oro», «Zanjón del Río Negro»—,
 * así que un «de» o un «del» inicial queda en minúscula. Un artículo no: es
 * «Arroyo El Asustado».
 */
function nombrar(crudo) {
  return crudo.toLowerCase().split(/\s+/).map((p, i) => {
    if (TILDES[p]) return TILDES[p]
    if (MINUSCULAS.has(p) && (i > 0 || p === 'de' || p === 'del')) return p
    return p.charAt(0).toUpperCase() + p.slice(1)
  }).join(' ')
}

// ── Los cursos del IGN ───────────────────────────────────────────────────────

const kml = readFileSync(join(ORIGEN, 'rios_ign.kml'), 'utf8').replaceAll('�', 'Ñ')
const cursos = []
let verticesOrigen = 0
for (const m of kml.matchAll(/<Placemark[\s\S]*?<\/Placemark>/g)) {
  const d = {}
  for (const q of m[0].matchAll(/<SimpleData name="(.*?)">([\s\S]*?)<\/SimpleData>/g)) d[q[1]] = q[2].trim()
  const tipo = TIPOS_CURSO[d.TIPO]
  if (!tipo) throw new Error(`Tipo de curso sin traducir: «${d.TIPO}»`)
  if (d.REGIMEN !== 'PERMANENTE' && d.REGIMEN !== 'NO PERMANENTE') throw new Error(`Régimen desconocido: «${d.REGIMEN}»`)

  const partes = [...m[0].matchAll(/<coordinates>([\s\S]*?)<\/coordinates>/g)].map(c =>
    c[1].trim().split(/\s+/).map(t => t.split(',').slice(0, 2).map(Number)))
  verticesOrigen += partes.reduce((s, l) => s + l.length, 0)
  const geometry = geometria(partes)
  if (!geometry) continue

  cursos.push({
    type: 'Feature',
    properties: {
      clase: 'curso',
      tipo,
      nombre: d.NOMBRE && d.NOMBRE !== 'SIN NOMBRE' ? nombrar(d.NOMBRE) : null,
      permanente: d.REGIMEN === 'PERMANENTE',
    },
    geometry,
  })
}

// ── Los canales ──────────────────────────────────────────────────────────────

const canales = []
function sumarCanal(fila, { tipo, sistema, inchauspe }) {
  const de = inchauspe ? CORRIMIENTO_INCHAUSPE : { este: 0, norte: 0 }
  const partes = fila.partes.map(l => l.map(([e, n]) => aGeograficas(e + de.este, n + de.norte)))
  if (partes.reduce((s, l) => s + largoM(l), 0) < LARGO_MINIMO_M) return
  const geometry = geometria(partes)
  if (!geometry) return
  const crudo = fila.NOMBRE || ''
  canales.push({
    type: 'Feature',
    properties: { clase: 'canal', tipo, nombre: CANALES_COMPLETOS[crudo] ?? (crudo || null), sistema },
    geometry,
  })
}

for (const f of leerCapa('linea parana')) {
  sumarCanal(f, { tipo: 'Principal', sistema: 'Línea Paraná', inchauspe: true })
}
for (const f of leerCapa('posgar_canales')) {
  // Las formas sin módulo ni clasificación son restos de largo cero, y caen solas
  sumarCanal(f, { tipo: f.CLASIFI || 'Sin clasificar', sistema: SISTEMAS[f.CUENCA_SAN] ?? (f.CUENCA_SAN || null), inchauspe: false })
}
{
  const p28 = leerCapa('Canales/canales').filter(f => f.NOMBRE === 'Paralelo 28º Est')
  if (p28.length !== 1) throw new Error(`Se esperaba un canal Paralelo 28º Este en la versión anterior y hay ${p28.length}`)
  sumarCanal(p28[0], { tipo: 'Sin clasificar', sistema: SISTEMAS[p28[0].CUENCA_SAN] ?? null, inchauspe: true })
}

// ── Salida ───────────────────────────────────────────────────────────────────

const features = [...cursos, ...canales]
writeFileSync(DESTINO, JSON.stringify({
  type: 'FeatureCollection',
  fuentes: {
    curso: 'Instituto Geográfico Nacional, hidrografía 1:250.000',
    canal: 'Shapefiles del sistema de canales de la Línea Paraná',
  },
  features,
}))

const vertices = f => (f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates)
const km = fs => fs.reduce((s, f) => s + vertices(f).reduce((t, l) => t + largoM(l), 0), 0) / 1000
const nVert = fs => fs.reduce((s, f) => s + vertices(f).reduce((t, l) => t + l.length, 0), 0)
const porClave = (fs, clave) => {
  const g = new Map()
  for (const f of fs) { const k = clave(f); g.set(k, [...(g.get(k) ?? []), f]) }
  return [...g.entries()].sort((a, b) => km(b[1]) - km(a[1]))
}

console.log(`${cursos.length} cursos · ${km(cursos).toFixed(0)} km · ${nVert(cursos)} vértices (de ${verticesOrigen} en el origen)`)
for (const [k, fs] of porClave(cursos, f => f.properties.tipo)) {
  const perm = fs.filter(f => f.properties.permanente)
  console.log(`  ${k.padEnd(16)} ${String(fs.length).padStart(4)} · ${km(fs).toFixed(0).padStart(5)} km · permanentes ${km(perm).toFixed(0).padStart(5)} km`)
}
console.log(`${canales.length} canales · ${km(canales).toFixed(0)} km · ${nVert(canales)} vértices`)
for (const [k, fs] of porClave(canales, f => f.properties.sistema ?? '—')) {
  console.log(`  ${k.padEnd(20)} ${String(fs.length).padStart(4)} · ${km(fs).toFixed(0).padStart(5)} km`)
}
for (const [k, fs] of porClave(canales, f => f.properties.tipo)) {
  console.log(`  ${k.padEnd(20)} ${String(fs.length).padStart(4)} · ${km(fs).toFixed(0).padStart(5)} km`)
}
console.log(`${(readFileSync(DESTINO).length / 1024).toFixed(0)} KB → ${DESTINO}`)
