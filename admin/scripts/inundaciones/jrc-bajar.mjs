// Baja del Global Surface Water del JRC (v1.4, 1984-2021) la ocurrencia de
// agua sobre el recuadro y la lleva a la grilla común. Un byte por píxel:
// 0 a 100 = % de las observaciones válidas con agua; 255 = sin dato.
//   node jrc-bajar.mjs <salida.bin>
import { fromUrl } from 'geotiff'
import { writeFileSync } from 'node:fs'
import { G, aGeo } from './grilla.mjs'

// Tesela de 10° × 10° con la esquina noroeste en 60° O, 20° S
const URL = 'https://storage.googleapis.com/global-surface-water/downloads2021/occurrence/occurrence_60W_20Sv1_4_2021.tif'
const tiff = await fromUrl(URL)
const img = await tiff.getImage()
const [ox, oy] = img.getOrigin(), [rx, ry] = img.getResolution()
console.log('origen', ox, oy, 'paso', rx, ry, 'tamaño', img.getWidth(), img.getHeight(), 'bloque', img.getTileWidth(), img.getTileHeight())
const c0 = Math.floor((G.AOI.oeste - 0.02 - ox) / rx), c1 = Math.ceil((G.AOI.este + 0.02 - ox) / rx)
const f0 = Math.floor((G.AOI.norte + 0.02 - oy) / ry), f1 = Math.ceil((G.AOI.sur - 0.02 - oy) / ry)
const [d] = await img.readRasters({ window: [c0, f0, c1, f1] })
const ww = c1 - c0, out = new Uint8Array(G.N).fill(255)
for (let f = 0; f < G.ALTO; f++) for (let c = 0; c < G.ANCHO; c++) {
  const [lon, lat] = aGeo(G.X0 + (c + 0.5) * G.PASO, G.Y1 - (f + 0.5) * G.PASO)
  const cx = Math.floor((lon - ox) / rx) - c0, fy = Math.floor((lat - oy) / ry) - f0
  if (cx >= 0 && cx < ww && fy >= 0 && fy < f1 - f0) out[f * G.ANCHO + c] = d[fy * ww + cx]
}
writeFileSync(process.argv[2], out)
const h = new Array(6).fill(0); let n = 0
for (let i = 0; i < G.N; i++) if (G.enAoi[i] && out[i] !== 255) { n++; const v = out[i]; h[v === 0 ? 0 : v < 10 ? 1 : v < 25 ? 2 : v < 50 ? 3 : v < 90 ? 4 : 5]++ }
console.log('km2 por ocurrencia [0, 1-9, 10-24, 25-49, 50-89, 90-100]:', h.map(x => (x * G.KM2).toFixed(1)).join(' | '), '· total', (n * G.KM2).toFixed(0))
