#!/usr/bin/env node
/**
 * Genera `public/geo/cuencas_brasil.json` con dos cuencas brasileñas del ONS:
 * el **Iguazú** y el **Paraná** (el tramo propio del río, sin el Grande, el
 * Paranaíba, el Tietê ni el Paranapanema, que el ONS da aparte).
 *
 *   node scripts/build_cuencas_brasil.mjs
 *
 * El origen es `docs/geo/cuencas-ons/Bacias_Hidrograficas_SIN.shp`, el
 * shapefile «Contorno das bacias hidrográficas com aproveitamentos no SIN» del
 * ONS (dados.ons.org.br/dataset/bacia_contorno), bajado el 16/10/2026. Trae
 * .prj: WGS84 en grados, así que no hay que reproyectar. El .dbf viene en
 * UTF-8 (lo dice el .cpg), a diferencia de los shapefiles de la provincia.
 *
 * Lo usa `build_crecida.mjs` para elegir los puntos de lluvia. **Las medidas
 * que sí da la cuenca son las de la tabla**, sobre una grilla de 0,05°:
 *
 * | | km² |
 * |---|---|
 * | Iguazú | 67.705 |
 * | Paraná (ONS) | 342.430 |
 * | Paraná aguas abajo de Porto Primavera (el corte de `build_crecida.mjs`) | 155.218 |
 *
 * La traza se simplifica a 0,005° (~500 m): para elegir puntos cada medio
 * grado sobra, y el archivo baja de 2 MB a unas decenas de KB.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const ORIGEN = join(AQUI, '..', '..', 'docs', 'geo', 'cuencas-ons', 'Bacias_Hidrograficas_SIN')
const DESTINO = join(AQUI, '..', 'public', 'geo', 'cuencas_brasil.json')
const TOLERANCIA = 0.005

const ELEGIDAS = { 'Iguaçu': 'iguacu', 'Paraná': 'parana' }

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
      for (let k = desde; k < hasta; k++) anillo.push([b.readDoubleLE(p0 + 16 * k), b.readDoubleLE(p0 + 16 * k + 8)])
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
    campos.push({ nombre: b.toString('latin1', o, o + 11).replace(/\0.*$/, ''), largo: b[o + 16] })
  }
  return Array.from({ length: n }, (_, i) => {
    let o = cabecera + i * largo + 1
    const fila = {}
    for (const c of campos) { fila[c.nombre] = b.toString('utf8', o, o + c.largo).trim(); o += c.largo }
    return fila
  })
}

/** Douglas–Peucker sobre [lon, lat] */
function simplificar(pts, tol) {
  if (pts.length < 3) return pts
  const guardar = new Uint8Array(pts.length)
  guardar[0] = guardar[pts.length - 1] = 1
  const pila = [[0, pts.length - 1]]
  while (pila.length) {
    const [a, b] = pila.pop()
    const [x1, y1] = pts[a], [x2, y2] = pts[b]
    const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy
    let max = 0, imax = -1
    for (let i = a + 1; i < b; i++) {
      const [x, y] = pts[i]
      let t = l2 ? ((x - x1) * dx + (y - y1) * dy) / l2 : 0
      t = Math.max(0, Math.min(1, t))
      const d = Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))
      if (d > max) { max = d; imax = i }
    }
    if (max > tol) { guardar[imax] = 1; pila.push([a, imax], [imax, b]) }
  }
  return pts.filter((_, i) => guardar[i])
}

const formas = leerShp(ORIGEN + '.shp')
const filas = leerDbf(ORIGEN + '.dbf')
if (formas.length !== filas.length) throw new Error('El .shp y el .dbf no tienen la misma cantidad de registros')

const cuencas = {}
filas.forEach((f, i) => {
  const clave = ELEGIDAS[f.Nome_Bacia]
  if (!clave) return
  if (formas[i].length !== 1) throw new Error(`${f.Nome_Bacia}: se esperaba un solo anillo y hay ${formas[i].length}`)
  const anillo = simplificar(formas[i][0], TOLERANCIA).map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)])
  cuencas[clave] = { nombre: f.Nome_Bacia, idOns: Number(f.ID), anillo }
  console.log(`${f.Nome_Bacia}: ${formas[i][0].length} → ${anillo.length} vértices`)
})
for (const c of Object.values(ELEGIDAS)) if (!cuencas[c]) throw new Error(`Falta la cuenca ${c} en el shapefile`)

mkdirSync(dirname(DESTINO), { recursive: true })
writeFileSync(DESTINO, JSON.stringify({
  fuente: 'ONS — Contorno das bacias hidrográficas com aproveitamentos no SIN (dados.ons.org.br/dataset/bacia_contorno)',
  coordenadas: 'WGS84, [lon, lat]',
  simplificado: `Douglas–Peucker, ${TOLERANCIA}°`,
  cuencas,
}))
console.log(`${DESTINO}: ${(readFileSync(DESTINO).length / 1024).toFixed(0)} KB`)
