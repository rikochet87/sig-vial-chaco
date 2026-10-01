#!/usr/bin/env node
/**
 * Genera `public/geo/geo_cuencas.json` desde el shapefile de cuencas.
 *
 *   node scripts/build_cuencas.mjs
 *
 * El origen es `docs/geo/cuencas/lh cuencas 1 totales.shp`: 13 cuencas que
 * cubren la provincia entera, con código, nombre y hectáreas.
 *
 * Va en Node y sin dependencias —lee el .shp y el .dbf a mano y reproyecta con
 * la serie de Krüger— porque en la máquina donde se trabaja este repo no hay
 * Python, y un shapefile de polígonos son cuarenta líneas de leer.
 *
 * ── El shapefile no trae .prj, y hay que decir qué se supuso ─────────────────
 *
 * Las coordenadas son planas, con X entre 5.156.000 y 5.661.000: falso este de
 * 5.500.000, o sea **Gauss-Krüger faja 5** (meridiano central 60° O). Eso sale
 * de los números y no admite otra lectura.
 *
 * **El datum sí es una suposición: POSGAR (≡ WGS84), no Campo Inchauspe.** Son
 * unos 200 m de diferencia en el Chaco. Se compararon las dos hipótesis contra
 * el límite provincial de `geo_bundle.json`:
 *
 * |                        | POSGAR      | Campo Inchauspe |
 * |------------------------|-------------|-----------------|
 * | Extremo norte          | a 44 m      | a 254 m         |
 * | Extremo este           | a 33 m      | a 90 m          |
 * | Corrimiento sistemático| 0 m, 0 m    | 30 m, 30 m      |
 *
 * Las tres medidas favorecen a POSGAR, pero **la evidencia es débil**: el
 * límite del bundle tiene 955 vértices y el borde de las cuencas se le aparta
 * 335 m de mediana con cualquiera de los dos datums, así que la diferencia
 * entre hipótesis está cerca del ruido. Para lo que se usa —promediar lluvia de
 * pluviómetros que están a decenas de km— 200 m no cambian ningún número. Si
 * aparece el .prj, se corrige `ELIPSOIDE` y se regenera.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const ORIGEN = join(AQUI, '..', '..', 'docs', 'geo', 'cuencas', 'lh cuencas 1 totales')
const DESTINO = join(AQUI, '..', 'public', 'geo', 'geo_cuencas.json')

/** GRS80, el elipsoide de POSGAR. Ver la nota del datum más arriba. */
const ELIPSOIDE = { a: 6378137, f: 1 / 298.257222101 }
const MERIDIANO_CENTRAL = -60
const FALSO_ESTE = 5_500_000

/**
 * El .dbf viene sin tildes. Se corrigen acá los trece nombres, que son
 * topónimos conocidos; el original queda en `nombreOrigen`.
 */
const NOMBRES = {
  1: 'Bermejo - Bermejito',
  2: 'Oro',
  3: 'Guaycurú - Iné',
  4: 'Quiá',
  5: 'Tragadero',
  6: 'Negro - Salado',
  7: 'Polvorín - Palometa',
  8: 'Tapenagá',
  9: 'La Rica - Sábalo',
  10: 'Línea Paraná',
  11: 'Bajos de Chorotis',
  12: 'Valle de inundación del río Paraná',
  13: 'Impenetrable',
}

// ── Lectura ──────────────────────────────────────────────────────────────────

function leerShp(ruta) {
  const b = readFileSync(ruta)
  const formas = []
  for (let o = 100; o < b.length;) {
    const largo = b.readInt32BE(o + 4) * 2
    const c = o + 8
    const tipo = b.readInt32LE(c)
    if (tipo !== 5) throw new Error(`Se esperaban polígonos (tipo 5) y hay tipo ${tipo}`)
    const nPartes = b.readInt32LE(c + 36), nPuntos = b.readInt32LE(c + 40)
    const p0 = c + 44 + 4 * nPartes
    const anillos = []
    for (let i = 0; i < nPartes; i++) {
      const desde = b.readInt32LE(c + 44 + 4 * i)
      const hasta = i + 1 < nPartes ? b.readInt32LE(c + 48 + 4 * i) : nPuntos
      const anillo = []
      for (let k = desde; k < hasta; k++) {
        anillo.push([b.readDoubleLE(p0 + 16 * k), b.readDoubleLE(p0 + 16 * k + 8)])
      }
      anillos.push(anillo)
    }
    formas.push(anillos)
    o = c + largo
  }
  return formas
}

function leerDbf(ruta) {
  const b = readFileSync(ruta)
  const n = b.readUInt32LE(4), cabecera = b.readUInt16LE(8), largo = b.readUInt16LE(10)
  const campos = []
  for (let o = 32; b[o] !== 0x0d; o += 32) {
    campos.push({
      nombre: b.toString('latin1', o, o + 11).replace(/\0.*$/, ''),
      numerico: 'NF'.includes(String.fromCharCode(b[o + 11])),
      largo: b[o + 16],
    })
  }
  return Array.from({ length: n }, (_, i) => {
    let o = cabecera + i * largo + 1
    const fila = {}
    for (const c of campos) {
      const crudo = b.toString('latin1', o, o + c.largo).trim()
      fila[c.nombre] = c.numerico && crudo !== '' ? Number(crudo) : crudo
      o += c.largo
    }
    return fila
  })
}

// ── Reproyección ─────────────────────────────────────────────────────────────

/**
 * Gauss-Krüger → geográficas, por la serie de Krüger.
 *
 * En las fajas argentinas el origen de las Y es el polo sur, así que la
 * distancia al ecuador es Y menos un cuarto de meridiano.
 */
function aGeograficas(este, norte) {
  const { a, f } = ELIPSOIDE
  const n = f / (2 - f)
  const A = a / (1 + n) * (1 + n * n / 4 + n ** 4 / 64)
  const xi = (norte - A * Math.PI / 2) / A, eta = (este - FALSO_ESTE) / A
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
  const lng = MERIDIANO_CENTRAL + Math.atan2(Math.sinh(eta1), Math.cos(xi1)) * 180 / Math.PI
  return [lng, lat * 180 / Math.PI]
}

const areaConSigno = anillo => {
  let s = 0
  for (let i = 0; i < anillo.length - 1; i++) s += anillo[i][0] * anillo[i + 1][1] - anillo[i + 1][0] * anillo[i][1]
  return s / 2
}

// ── Armado ───────────────────────────────────────────────────────────────────

const formas = leerShp(ORIGEN + '.shp')
const filas = leerDbf(ORIGEN + '.dbf')
if (formas.length !== filas.length) throw new Error('El .shp y el .dbf no tienen la misma cantidad de registros')

const features = formas.map((anillos, i) => {
  const fila = filas[i]
  const cod = fila.COD_CUENCA
  if (!NOMBRES[cod]) throw new Error(`Cuenca ${cod} (${fila.N_CUENCA}) sin nombre corregido`)

  // En un shapefile el anillo exterior va en sentido horario. Acá no hay
  // huecos: si algún día aparece uno, este armado lo trataría como otra parte
  // de la cuenca y hay que enterarse.
  if (anillos.some(a => areaConSigno(a) > 0)) throw new Error(`La cuenca ${cod} tiene un hueco, y este script no los arma`)

  // GeoJSON pide el exterior antihorario; 5 decimales son ~1 m.
  const partes = anillos.map(a =>
    [[...a].reverse().map(([e, n]) => aGeograficas(e, n).map(v => Math.round(v * 1e5) / 1e5))])

  return {
    type: 'Feature',
    properties: {
      cod,
      nombre: NOMBRES[cod],
      nombreOrigen: fila.N_CUENCA,
      ha: Math.round(fila.HECTARES),
    },
    geometry: partes.length === 1
      ? { type: 'Polygon', coordinates: partes[0] }
      : { type: 'MultiPolygon', coordinates: partes },
  }
}).sort((a, b) => a.properties.cod - b.properties.cod)

writeFileSync(DESTINO, JSON.stringify({ type: 'FeatureCollection', features }))

const vertices = features.reduce((s, f) => s + JSON.stringify(f.geometry).split('],[').length, 0)
console.log(`${features.length} cuencas · ~${vertices} vértices · ${(readFileSync(DESTINO).length / 1024).toFixed(0)} KB`)
for (const f of features) {
  const p = f.properties
  console.log(`  ${String(p.cod).padStart(2)}  ${p.nombre.padEnd(36)} ${p.ha.toLocaleString('es-AR').padStart(10)} ha`
    + (f.geometry.type === 'MultiPolygon' ? `   (${f.geometry.coordinates.length} partes)` : ''))
}
console.log(`→ ${DESTINO}`)
