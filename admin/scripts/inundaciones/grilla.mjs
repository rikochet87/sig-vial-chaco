// La grilla común de los scripts de inundaciones del Gran Resistencia: 30 m,
// UTM 21 con el norte negativo al sur del ecuador (EPSG:32621, que es como
// vienen las escenas Landsat de esta zona).
import proj4 from 'proj4'

const AOI = { oeste: -59.12, este: -58.78, sur: -27.60, norte: -27.30 }
const URBANO = { oeste: -59.06, este: -58.92, sur: -27.53, norte: -27.40 }
const PASO = 30
const UTM = '+proj=utm +zone=21 +datum=WGS84 +units=m +no_defs'
export const aUtm = (lon, lat) => proj4('WGS84', UTM, [lon, lat])
export const aGeo = (x, y) => proj4(UTM, 'WGS84', [x, y])

const esq = [[AOI.oeste, AOI.sur], [AOI.oeste, AOI.norte], [AOI.este, AOI.sur], [AOI.este, AOI.norte]].map(c => aUtm(...c))
const X0 = Math.floor(Math.min(...esq.map(e => e[0])) / PASO) * PASO
const X1 = Math.ceil(Math.max(...esq.map(e => e[0])) / PASO) * PASO
const Y0 = Math.floor(Math.min(...esq.map(e => e[1])) / PASO) * PASO
const Y1 = Math.ceil(Math.max(...esq.map(e => e[1])) / PASO) * PASO
const ANCHO = (X1 - X0) / PASO, ALTO = (Y1 - Y0) / PASO, N = ANCHO * ALTO

const enAoi = new Uint8Array(N), enUrbano = new Uint8Array(N)
for (let f = 0; f < ALTO; f++) for (let c = 0; c < ANCHO; c++) {
  const [lon, lat] = aGeo(X0 + (c + 0.5) * PASO, Y1 - (f + 0.5) * PASO), i = f * ANCHO + c
  enAoi[i] = lon >= AOI.oeste && lon <= AOI.este && lat >= AOI.sur && lat <= AOI.norte ? 1 : 0
  enUrbano[i] = lon >= URBANO.oeste && lon <= URBANO.este && lat >= URBANO.sur && lat <= URBANO.norte ? 1 : 0
}

export const G = { AOI, URBANO, PASO, X0, X1, Y0, Y1, ANCHO, ALTO, N, KM2: PASO * PASO / 1e6, enAoi, enUrbano }

export async function json(url, opciones) {
  for (let i = 0; i < 4; i++) {
    try { const r = await fetch(url, opciones); if (r.ok) return await r.json(); if (r.status < 500 && r.status !== 429) throw new Error(`${r.status} ${url}`) } catch (e) { if (i === 3) throw e }
    await new Promise(r => setTimeout(r, 1500 * (i + 1)))
  }
  throw new Error('sin respuesta: ' + url)
}
