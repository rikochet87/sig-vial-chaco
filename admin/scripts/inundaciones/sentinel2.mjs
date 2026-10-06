/**
 * Mancha de agua en el Gran Resistencia con Sentinel-2 (10 m, desde 2016),
 * para los eventos recientes. Complementa a landsat-eventos.mjs:
 * misma grilla, mismo recuadro, tres veces más detalle.
 *
 * Exploración, fuera de `npm run verificar`, con las mismas dependencias que
 * el de Landsat (geotiff, proj4, d3-contour, pngjs) y junto a grilla.mjs:
 *
 *   node sentinel2.mjs <barranqueras_diario.json> <salida> \
 *        2021-08-19:base 2019-01-17:lluvia 2023-11-12:crecida ...
 *
 * Agua = verde (B03) mayor que infrarrojo medio (B11), que es MNDWI > 0. No
 * depende del corrimiento de −1000 que Sentinel-2 aplica desde 2022: se suma a
 * las dos bandas y la comparación no cambia. Nubes, sombras y cirros salen de
 * la clasificación de escena (SCL) del propio producto.
 *
 * El recuadro cae sobre dos teselas (21JTK y 21JUK); se juntan las de la fecha.
 */
import { fromUrl } from 'geotiff'
import { contours } from 'd3-contour'
import { PNG } from 'pngjs'
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { G, json, aGeo } from './grilla.mjs'

const rio = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const SALIDA = process.argv[3]
mkdirSync(SALIDA, { recursive: true })
const t0 = Date.parse(rio.desde + 'T00:00:00Z')
const altura = f => { const v = rio.cm[Math.round((Date.parse(f + 'T00:00:00Z') - t0) / 864e5)]; return v == null ? null : v / 100 }

const F = 3, P = G.PASO / F // 10 m
const W = G.ANCHO * F, H = G.ALTO * F
const STAC = 'https://planetarycomputer.microsoft.com/api/stac/v1'
let permiso = null
// Una sola vez, como promesa compartida: pedido en cada lectura da 429
const firmar = async href => { permiso ??= json('https://planetarycomputer.microsoft.com/api/sas/v1/token/sentinel-2-l2a').then(t => t.token); return href + '?' + await permiso }

/** Lee una banda de una tesela y la vuelca en `out` donde haya dato */
async function banda(item, nombre, out) {
  const tiff = await fromUrl(await firmar(item.assets[nombre].href))
  const img = await tiff.getImage()
  const epsg = img.getGeoKeys()?.ProjectedCSTypeGeoKey
  // Sentinel-2 usa la zona sur (32721): mismo este, norte corrido 10.000 km
  const dy = epsg === 32721 ? 1e7 : epsg === 32621 ? 0 : null
  if (dy === null) throw new Error(`${item.id}: EPSG ${epsg}`)
  const [ox, oy0] = img.getOrigin(), [rx, ry] = img.getResolution(), oy = oy0 - dy
  const w = img.getWidth(), h = img.getHeight()
  const c0 = Math.max(0, Math.floor((G.X0 - ox) / rx)), c1 = Math.min(w, Math.ceil((G.X1 - ox) / rx))
  const f0 = Math.max(0, Math.floor((G.Y1 - oy) / ry)), f1 = Math.min(h, Math.ceil((G.Y0 - oy) / ry))
  if (c1 <= c0 || f1 <= f0) return
  const [d] = await img.readRasters({ window: [c0, f0, c1, f1] })
  const ww = c1 - c0
  for (let f = 0; f < H; f++) {
    const fy = Math.floor((G.Y1 - (f + 0.5) * P - oy) / ry) - f0
    if (fy < 0 || fy >= f1 - f0) continue
    for (let c = 0; c < W; c++) {
      const cx = Math.floor((G.X0 + (c + 0.5) * P - ox) / rx) - c0
      if (cx < 0 || cx >= ww) continue
      const v = d[fy * ww + cx]
      if (v > 0) out[f * W + c] = v
    }
  }
}

/** 0 sin dato o nube, 1 tierra, 2 agua. A 10 m. */
async function clasificar(fecha) {
  const cache = `${SALIDA}/s2_${fecha}.bin`
  if (existsSync(cache)) return new Uint8Array(readFileSync(cache))
  const j = await json(`${STAC}/search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ collections: ['sentinel-2-l2a'], bbox: [G.AOI.oeste, G.AOI.sur, G.AOI.este, G.AOI.norte], datetime: `${fecha}T00:00:00Z/${fecha}T23:59:59Z`, limit: 20 }) })
  if (!j.features.length) throw new Error('sin escenas el ' + fecha)
  const verde = new Uint16Array(W * H), swir = new Uint16Array(W * H), scl = new Uint8Array(W * H)
  for (const item of j.features) await Promise.all([banda(item, 'B03', verde), banda(item, 'B11', swir), banda(item, 'SCL', scl)])
  const m = new Uint8Array(W * H)
  for (let i = 0; i < m.length; i++) {
    const s = scl[i]
    // SCL: 0 sin dato, 1 saturado, 3 sombra de nube, 8 y 9 nube, 10 cirro
    if (!s || s === 1 || s === 3 || s === 8 || s === 9 || s === 10 || !verde[i] || !swir[i]) continue
    m[i] = verde[i] > swir[i] ? 2 : 1
  }
  writeFileSync(cache, m)
  return m
}

/** Lleva la máscara de 10 m a la grilla de 30 m: agua si lo es la mayoría de los 9 */
function a30(m) {
  const o = new Uint8Array(G.N)
  for (let f = 0; f < G.ALTO; f++) for (let c = 0; c < G.ANCHO; c++) {
    let agua = 0, val = 0
    for (let a = 0; a < F; a++) for (let b = 0; b < F; b++) { const v = m[(f * F + a) * W + c * F + b]; if (v) val++; if (v === 2) agua++ }
    o[f * G.ANCHO + c] = val < 5 ? 0 : agua * 2 > val ? 2 : 1
  }
  return o
}

function poligonos(bin, props) {
  // bin a 10 m; se contornea a 30 m con la fracción de agua de cada celda
  const v = new Float64Array(G.N)
  for (let f = 0; f < G.ALTO; f++) for (let c = 0; c < G.ANCHO; c++) { let s = 0; for (let a = 0; a < F; a++) for (let b = 0; b < F; b++) s += bin[(f * F + a) * W + c * F + b]; v[f * G.ANCHO + c] = s / 9 }
  const [geo] = contours().size([G.ANCHO, G.ALTO]).thresholds([0.5])(v)
  const minPx = 22 // ~2 ha
  const area = an => { let s = 0; for (let i = 0; i < an.length - 1; i++) s += an[i][0] * an[i + 1][1] - an[i + 1][0] * an[i][1]; return Math.abs(s / 2) }
  const coords = geo.coordinates.filter(p => area(p[0]) >= minPx).map(p => p.filter((an, k) => k === 0 || area(an) >= minPx).map(an => an.map(([x, y]) => { const [lon, lat] = aGeo(G.X0 + x * G.PASO, G.Y1 - y * G.PASO); return [+lon.toFixed(5), +lat.toFixed(5)] })))
  return { type: 'Feature', properties: props, geometry: { type: 'MultiPolygon', coordinates: coords } }
}

const pedidos = process.argv.slice(4).map(a => { const [fecha, rol] = a.split(':'); return { fecha, rol } })
const res = []
for (const p of pedidos) {
  try { p.m = await clasificar(p.fecha) } catch (e) { console.log('FALLA', p.fecha, e.message); continue }
  const m30 = a30(p.m)
  let agua = 0, val = 0, aguaU = 0, valU = 0, tot = 0, totU = 0
  for (let i = 0; i < G.N; i++) {
    if (G.enAoi[i]) { tot++; if (m30[i]) val++; if (m30[i] === 2) agua++ }
    if (G.enUrbano[i]) { totU++; if (m30[i]) valU++; if (m30[i] === 2) aguaU++ }
  }
  p.m30 = m30
  const fila = { fecha: p.fecha, rol: p.rol, altura: altura(p.fecha), aguaKm2: +(agua * G.KM2).toFixed(1), validoPct: Math.round(100 * val / tot), aguaUrbanoKm2: +(aguaU * G.KM2).toFixed(1), validoUrbanoPct: Math.round(100 * valU / totU) }
  res.push(fila); console.log(JSON.stringify(fila))
  const png = new PNG({ width: G.ANCHO, height: G.ALTO })
  for (let i = 0; i < G.N; i++) png.data.set(m30[i] === 2 ? [40, 110, 220, 255] : m30[i] === 1 ? [60, 60, 60, 255] : [0, 0, 0, 255], i * 4)
  writeFileSync(`${SALIDA}/s2_${p.fecha}.png`, PNG.sync.write(png))
}
writeFileSync(`${SALIDA}/sentinel2-resultado.json`, JSON.stringify(res, null, 1))

// Agua permanente = agua en todas las escenas `base`; las demás se le restan
const base = pedidos.filter(p => p.rol === 'base' && p.m)
const fc = { type: 'FeatureCollection', features: [] }
if (base.length) {
  const perm = new Uint8Array(W * H)
  for (let i = 0; i < perm.length; i++) perm[i] = base.every(b => b.m[i] === 2 || b.m[i] === 0) && base.some(b => b.m[i] === 2) ? 1 : 0
  fc.features.push(poligonos(perm, { capa: 'agua permanente', criterio: `agua el ${base.map(b => b.fecha).join(' y ')}` }))
  for (const p of pedidos.filter(p => p.rol !== 'base' && p.m)) {
    const bin = new Uint8Array(W * H); for (let i = 0; i < bin.length; i++) bin[i] = p.m[i] === 2 && !perm[i] ? 1 : 0
    fc.features.push(poligonos(bin, { capa: p.rol, fecha: p.fecha, alturaBarranquerasM: altura(p.fecha), sensor: 'Sentinel-2 10 m', criterio: 'MNDWI > 0' }))
  }
  writeFileSync(`${SALIDA}/manchas-sentinel2.geojson`, JSON.stringify(fc))
}
