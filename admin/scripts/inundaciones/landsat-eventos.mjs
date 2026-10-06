/**
 * Mancha de agua en el Gran Resistencia en cada crecida con imagen Landsat,
 * de 1981 a 2023.
 *
 * Es una exploración, no parte del panel: no entra en `npm run verificar` y
 * sus dependencias NO están en package.json. Para correrlo, fuera del repo:
 *
 *   mkdir landsat && cd landsat && npm init -y
 *   npm i geotiff proj4 d3-contour pngjs
 *   (copiar ahí esta carpeta y docs/geo/inundaciones/landsat-escenas.json)
 *   node landsat-eventos.mjs landsat-escenas.json ./salida
 *
 * La lista de escenas trae la altura de Barranqueras de cada fecha, tomada de
 * public/rio/barranqueras_diario.json, y el rol de cada una: `base` (aguas
 * bajas, define el agua permanente), `crecida`, `lluvia` (río bajo, agua de
 * lluvia) o `descartada` (sombras de nube contadas como agua; se procesa y se
 * informa, pero no entra al compuesto). Lo que sale está en
 * docs/geo/inundaciones/ y se lee en docs/inundaciones-gran-resistencia.md.
 *
 * Fuente: Landsat Collection 2 en Microsoft Planetary Computer, sin cuenta ni
 * clave: el catálogo STAC es abierto y el permiso de lectura se pide anónimo.
 *
 * ── Dos sensores, dos criterios ────────────────────────────────────────────
 *
 *  - Infrarrojo cercano por debajo del umbral de Otsu de la escena. Es el
 *    único posible en MSS (1972-1984, 60 m, sin infrarrojo medio) y por eso es
 *    el criterio COMÚN a toda la serie. Incluye suelo saturado, vegetación
 *    inundada rala y sombra de nube: es generoso.
 *  - MNDWI > 0 (verde contra infrarrojo medio), sólo desde 1984 (TM, ETM+,
 *    OLI, 30 m). Es agua abierta: conservador.
 *
 * En las escenas modernas se calculan los dos y se informa cuánto coinciden.
 * No coinciden mucho, y eso es parte del resultado: la superficie depende del
 * criterio tanto como de la crecida.
 *
 * Lo que NINGUNO ve: agua debajo de monte o camalotal cerrado, y debajo de
 * nubes. MSS no detecta sombras de nube: en escenas con nubes sueltas el
 * infrarrojo las cuenta como agua.
 */
import { fromUrl } from 'geotiff'
import proj4 from 'proj4'
import { contours } from 'd3-contour'
import { PNG } from 'pngjs'
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'

const ESCENAS = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const SALIDA = process.argv[3] ?? './salida'
mkdirSync(SALIDA, { recursive: true })

/** Recuadro de trabajo: el área metropolitana y el valle hasta el cauce principal */
const AOI = { oeste: -59.12, este: -58.78, sur: -27.60, norte: -27.30 }
/** Recuadro urbano: Fontana, Resistencia, Barranqueras y Vilelas */
const URBANO = { oeste: -59.06, este: -58.92, sur: -27.53, norte: -27.40 }
const PASO = 30
const UTM = '+proj=utm +zone=21 +datum=WGS84 +units=m +no_defs' // al sur, norte negativo
const aUtm = (lon, lat) => proj4('WGS84', UTM, [lon, lat])
const aGeo = (x, y) => proj4(UTM, 'WGS84', [x, y])

const esquinas = [[AOI.oeste, AOI.sur], [AOI.oeste, AOI.norte], [AOI.este, AOI.sur], [AOI.este, AOI.norte]].map(c => aUtm(...c))
const X0 = Math.floor(Math.min(...esquinas.map(e => e[0])) / PASO) * PASO
const X1 = Math.ceil(Math.max(...esquinas.map(e => e[0])) / PASO) * PASO
const Y0 = Math.floor(Math.min(...esquinas.map(e => e[1])) / PASO) * PASO
const Y1 = Math.ceil(Math.max(...esquinas.map(e => e[1])) / PASO) * PASO
const ANCHO = (X1 - X0) / PASO, ALTO = (Y1 - Y0) / PASO
const KM2 = PASO * PASO / 1e6

const enUrbano = new Uint8Array(ANCHO * ALTO), enAoi = new Uint8Array(ANCHO * ALTO)
for (let f = 0; f < ALTO; f++) for (let c = 0; c < ANCHO; c++) {
  const [lon, lat] = aGeo(X0 + (c + 0.5) * PASO, Y1 - (f + 0.5) * PASO)
  const i = f * ANCHO + c
  enAoi[i] = lon >= AOI.oeste && lon <= AOI.este && lat >= AOI.sur && lat <= AOI.norte ? 1 : 0
  enUrbano[i] = lon >= URBANO.oeste && lon <= URBANO.este && lat >= URBANO.sur && lat <= URBANO.norte ? 1 : 0
}

const STAC = 'https://planetarycomputer.microsoft.com/api/stac/v1'
async function json(url) {
  for (let i = 0; i < 4; i++) {
    try { const r = await fetch(url); if (r.ok) return await r.json(); if (r.status < 500 && r.status !== 429) throw new Error(`${r.status} ${url}`) } catch (e) { if (i === 3) throw e }
    await new Promise(r => setTimeout(r, 1500 * (i + 1)))
  }
  throw new Error('sin respuesta: ' + url)
}
// Un solo permiso de lectura para todo el contenedor, en vez de firmar archivo por archivo
let permiso = null
const firmar = async href => { permiso ??= (await json('https://planetarycomputer.microsoft.com/api/sas/v1/token/landsateuwest/landsat-c2')).token; return href + '?' + permiso }

/** Lee una banda y la lleva a la grilla común por vecino más cercano */
async function banda(item, nombre) {
  const a = item.assets[nombre]
  if (!a) throw new Error(`${item.id}: no tiene la banda ${nombre}`)
  const tiff = await fromUrl(await firmar(a.href))
  const img = await tiff.getImage()
  const epsg = img.getGeoKeys()?.ProjectedCSTypeGeoKey
  if (epsg !== 32621) throw new Error(`${item.id}: está en EPSG ${epsg}, se esperaba 32621`)
  const [ox, oy] = img.getOrigin(), [rx, ry] = img.getResolution() // ry negativo
  const w = img.getWidth(), h = img.getHeight()
  const c0 = Math.max(0, Math.floor((X0 - ox) / rx)), c1 = Math.min(w, Math.ceil((X1 - ox) / rx))
  const f0 = Math.max(0, Math.floor((Y1 - oy) / ry)), f1 = Math.min(h, Math.ceil((Y0 - oy) / ry))
  const out = new Float32Array(ANCHO * ALTO).fill(NaN)
  if (c1 <= c0 || f1 <= f0) return out
  const [datos] = await img.readRasters({ window: [c0, f0, c1, f1] })
  const ww = c1 - c0
  for (let f = 0; f < ALTO; f++) {
    const fy = Math.floor((Y1 - (f + 0.5) * PASO - oy) / ry) - f0
    if (fy < 0 || fy >= f1 - f0) continue
    for (let c = 0; c < ANCHO; c++) {
      const cx = Math.floor((X0 + (c + 0.5) * PASO - ox) / rx) - c0
      if (cx < 0 || cx >= ww) continue
      out[f * ANCHO + c] = datos[fy * ww + cx]
    }
  }
  return out
}

/** Umbral de Otsu sobre los valores válidos */
function otsu(v, valido) {
  let min = Infinity, max = -Infinity
  for (let i = 0; i < v.length; i++) if (valido[i]) { if (v[i] < min) min = v[i]; if (v[i] > max) max = v[i] }
  const N = 256, h = new Float64Array(N); let n = 0
  for (let i = 0; i < v.length; i++) if (valido[i]) { h[Math.min(N - 1, Math.floor((v[i] - min) / (max - min || 1) * N))]++; n++ }
  let suma = 0; for (let k = 0; k < N; k++) suma += k * h[k]
  let wB = 0, sB = 0, mejor = -1, kMejor = 0
  for (let k = 0; k < N; k++) {
    wB += h[k]; if (!wB) continue
    const wF = n - wB; if (!wF) break
    sB += k * h[k]
    const d = sB / wB - (suma - sB) / wF, entre = wB * wF * d * d
    if (entre > mejor) { mejor = entre; kMejor = k }
  }
  return min + (kMejor + 1) / N * (max - min)
}

/**
 * 0 = sin dato (fuera de escena o nube), 1 = tierra, 2 = agua sólo por
 * infrarrojo cercano, 3 = agua por los dos criterios, 4 = agua sólo por MNDWI.
 * En MSS sólo hay 0, 1 y 2.
 */
const esAgua = v => v === 2 || v === 3 // infrarrojo cercano: el criterio común
const esAbierta = v => v >= 3 // MNDWI: agua abierta, sólo desde 1984

async function clasificar(e) {
  const cache = `${SALIDA}/mascara_${e.id}.bin`
  if (existsSync(cache)) return { m: new Uint8Array(readFileSync(cache)), info: JSON.parse(readFileSync(cache + '.json', 'utf8')) }
  const item = await json(`${STAC}/collections/${e.coleccion}/items/${e.id}`)
  const mss = e.coleccion === 'landsat-c2-l1'
  const qa = await banda(item, 'qa_pixel')
  const nir = await banda(item, mss ? 'nir09' : 'nir08')
  const valido = new Uint8Array(ANCHO * ALTO)
  // qa_pixel: bit 0 relleno, 1 nube dilatada, 3 nube, 4 sombra de nube
  for (let i = 0; i < valido.length; i++) {
    const q = qa[i]
    valido[i] = enAoi[i] && !Number.isNaN(q) && !Number.isNaN(nir[i]) && !(q & 1) && !(q & 2) && !(q & 8) && !(q & 16) && nir[i] > 0 ? 1 : 0
  }
  const umbral = otsu(nir, valido)
  const m = new Uint8Array(ANCHO * ALTO)
  const info = { sensor: mss ? 'MSS' : 'TM', umbralNir: Math.round(umbral) }
  if (mss) {
    for (let i = 0; i < m.length; i++) m[i] = !valido[i] ? 0 : nir[i] < umbral ? 2 : 1
  } else {
    const verde = await banda(item, 'green'), swir = await banda(item, 'swir16')
    let ambos = 0, soloIndice = 0, soloNir = 0
    for (let i = 0; i < m.length; i++) {
      if (!valido[i] || Number.isNaN(verde[i]) || Number.isNaN(swir[i])) continue
      // Reflectancia de superficie: DN × 0,0000275 − 0,2
      const g = verde[i] * 2.75e-5 - 0.2, s = swir[i] * 2.75e-5 - 0.2
      const agua = g + s > 0 && (g - s) / (g + s) > 0
      const aguaNir = nir[i] < umbral
      m[i] = agua && aguaNir ? 3 : agua ? 4 : aguaNir ? 2 : 1
      if (agua && aguaNir) ambos++; else if (agua) soloIndice++; else if (aguaNir) soloNir++
    }
    // Acuerdo entre los dos criterios: intersección sobre unión
    info.acuerdo = +(ambos / (ambos + soloIndice + soloNir || 1)).toFixed(2)
  }
  writeFileSync(cache, m); writeFileSync(cache + '.json', JSON.stringify(info))
  return { m, info }
}

function png(nombre, pintar) {
  const p = new PNG({ width: ANCHO, height: ALTO })
  for (let i = 0; i < ANCHO * ALTO; i++) { const [r, g, b] = pintar(i); p.data.set([r, g, b, 255], i * 4) }
  for (let i = 0; i < ANCHO * ALTO; i++) {
    const f = Math.floor(i / ANCHO), c = i % ANCHO
    if (enUrbano[i] && (!enUrbano[i - 1] || !enUrbano[i + 1] || !enUrbano[(f - 1) * ANCHO + c] || !enUrbano[(f + 1) * ANCHO + c])) p.data.set([245, 195, 0, 255], i * 4)
  }
  writeFileSync(`${SALIDA}/${nombre}.png`, PNG.sync.write(p))
}

/** Polígonos de una máscara binaria, en lon/lat, con la grilla achicada a 90 m */
function poligonos(binaria, props) {
  const F = 3, w = Math.floor(ANCHO / F), h = Math.floor(ALTO / F), v = new Float64Array(w * h)
  for (let f = 0; f < h; f++) for (let c = 0; c < w; c++) {
    let s = 0
    for (let a = 0; a < F; a++) for (let b = 0; b < F; b++) s += binaria[(f * F + a) * ANCHO + c * F + b]
    v[f * w + c] = s / (F * F)
  }
  const [geo] = contours().size([w, h]).thresholds([0.5])(v)
  const minPx = 10 // descarta manchas de menos de ~8 ha
  const area = an => { let s = 0; for (let i = 0; i < an.length - 1; i++) s += an[i][0] * an[i + 1][1] - an[i + 1][0] * an[i][1]; return Math.abs(s / 2) }
  const coords = geo.coordinates.filter(pol => area(pol[0]) >= minPx).map(pol => pol.filter((an, k) => k === 0 || area(an) >= minPx).map(an => an.map(([x, y]) => {
    const [lon, lat] = aGeo(X0 + x * F * PASO, Y1 - y * F * PASO)
    return [+lon.toFixed(5), +lat.toFixed(5)]
  })))
  return { type: 'Feature', properties: props, geometry: { type: 'MultiPolygon', coordinates: coords } }
}

const filas = [], mascaras = []
for (const e of ESCENAS) {
  try {
    const { m, info } = await clasificar(e)
    let agua = 0, valido = 0, aguaU = 0, validoU = 0, totalAoi = 0, totalU = 0, abierta = 0, abiertaU = 0
    for (let i = 0; i < m.length; i++) {
      if (enAoi[i]) { totalAoi++; if (m[i]) valido++; if (esAgua(m[i])) agua++; if (esAbierta(m[i])) abierta++ }
      if (enUrbano[i]) { totalU++; if (m[i]) validoU++; if (esAgua(m[i])) aguaU++; if (esAbierta(m[i])) abiertaU++ }
    }
    const fila = {
      ...e, ...info,
      aguaKm2: +(agua * KM2).toFixed(1), validoPct: Math.round(100 * valido / totalAoi),
      aguaUrbanoKm2: +(aguaU * KM2).toFixed(1), validoUrbanoPct: Math.round(100 * validoU / totalU),
      ...(info.sensor === 'TM' ? { abiertaKm2: +(abierta * KM2).toFixed(1), abiertaUrbanoKm2: +(abiertaU * KM2).toFixed(1) } : {}),
    }
    filas.push(fila); mascaras.push({ e, m })
    png(`mascara_${e.fecha}`, i => esAbierta(m[i]) ? [40, 110, 220] : m[i] === 2 ? [90, 190, 230] : m[i] === 1 ? [60, 60, 60] : [0, 0, 0])
    console.log(JSON.stringify(fila))
  } catch (err) { console.log('FALLA', e.id, err.message) }
}
writeFileSync(`${SALIDA}/escenas-resultado.json`, JSON.stringify(filas, null, 1))

// ── Compuesto: en cuántas escenas de crecida estuvo bajo agua cada lugar ──
const base = mascaras.filter(x => x.e.rol === 'base'), crecidas = mascaras.filter(x => x.e.rol === 'crecida')
const permanente = new Uint8Array(ANCHO * ALTO)
for (let i = 0; i < permanente.length; i++) permanente[i] = base.length && base.every(x => x.m[i] >= 2 || x.m[i] === 0) && base.some(x => x.m[i] >= 2) ? 1 : 0
/** En cuántas escenas de crecida tiene que haber agua para entrar en cada clase */
const CORTES = [3, 6, 10]
const veces = new Uint8Array(ANCHO * ALTO)
for (const { m } of crecidas) for (let i = 0; i < m.length; i++) if (esAgua(m[i])) veces[i]++
png('frecuencia', i => {
  if (!enAoi[i]) return [0, 0, 0]
  if (permanente[i]) return [20, 40, 90]
  // Una o dos veces no se pinta: es donde caen los artefactos de una escena sola
  const v = veces[i]
  return v >= CORTES[2] ? [230, 60, 50] : v >= CORTES[1] ? [240, 150, 40] : v >= CORTES[0] ? [235, 215, 90] : [50, 50, 50]
})

const fc = { type: 'FeatureCollection', features: [] }
fc.features.push(poligonos(permanente, { capa: 'agua permanente', criterio: `agua en las ${base.length} escenas de aguas bajas` }))
// Al GeoJSON van sólo las escenas marcadas `mapa`: todas juntas pesan 14 MB
for (const { e, m } of mascaras.filter(x => x.e.mapa)) {
  const bin = new Uint8Array(m.length); for (let i = 0; i < m.length; i++) bin[i] = esAgua(m[i]) && !permanente[i] ? 1 : 0
  fc.features.push(poligonos(bin, { capa: e.rol, fecha: e.fecha, alturaBarranquerasM: e.altura, sensor: e.coleccion === 'landsat-c2-l1' ? 'MSS 60 m' : 'TM/ETM+/OLI 30 m', criterio: 'infrarrojo cercano bajo el umbral de Otsu', escena: e.id, nota: e.nota ?? null }))
}
for (const n of CORTES) {
  const bin = new Uint8Array(veces.length); let km2 = 0, km2U = 0
  for (let i = 0; i < bin.length; i++) { bin[i] = veces[i] >= n && !permanente[i] ? 1 : 0; km2 += bin[i] * KM2; km2U += bin[i] * enUrbano[i] * KM2 }
  console.log(`frecuencia >= ${n} de ${crecidas.length}: ${km2.toFixed(1)} km2, ${km2U.toFixed(1)} en el recuadro urbano`)
  fc.features.push(poligonos(bin, { capa: 'frecuencia', minimo: n, de: crecidas.length, criterio: `bajo agua en ${n} o más de las ${crecidas.length} escenas de crecida` }))
}
{ let p = 0, pU = 0, a = 0, u = 0; for (let i = 0; i < permanente.length; i++) { p += permanente[i]; pU += permanente[i] * enUrbano[i]; a += enAoi[i]; u += enUrbano[i] }
  console.log(`permanente: ${(p * KM2).toFixed(1)} km2, ${(pU * KM2).toFixed(1)} urbano · recuadro ${(a * KM2).toFixed(0)} km2, urbano ${(u * KM2).toFixed(0)} km2`) }
writeFileSync(`${SALIDA}/manchas.geojson`, JSON.stringify(fc))
console.log('grilla', ANCHO, 'x', ALTO, '· crecidas', crecidas.length, '· base', base.length)
