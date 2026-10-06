// Paso 1 de la serie: clasifica TODAS las escenas Landsat limpias de 1984 en
// adelante sobre el recuadro del Gran Resistencia y guarda una máscara por
// escena. Un byte por píxel: bit 0 válido, 1 agua (MNDWI > 0), 2 NDVI < 0,3,
// 3 NDVI < 0,4, 4 NDVI < 0,5.
//   node landsat-serie-bajar.mjs <barranqueras_diario.json> <carpeta>
import { fromUrl } from 'geotiff'
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { G, json } from './grilla.mjs'

const rio = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const DIR = process.argv[3]
mkdirSync(DIR, { recursive: true })
const t0 = Date.parse(rio.desde + 'T00:00:00Z')
const altura = f => { const v = rio.cm[Math.round((Date.parse(f + 'T00:00:00Z') - t0) / 864e5)]; return v == null ? null : v / 100 }

const STAC = 'https://planetarycomputer.microsoft.com/api/stac/v1'
/** Nubes de la escena entera: el filtro fino es el porcentaje válido del recuadro */
const NUBES_MAX = +(process.env.NUBES_MAX ?? 10)
const ALTURA_MIN = process.env.ALTURA_MIN ? +process.env.ALTURA_MIN : null

async function buscar() {
  const items = []
  for (let a = 1984; a <= 2026; a += 3) {
    const r = await fetch(`${STAC}/search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ collections: ['landsat-c2-l2'], bbox: [G.AOI.oeste, G.AOI.sur, G.AOI.este, G.AOI.norte], datetime: `${a}-01-01T00:00:00Z/${a + 2}-12-31T23:59:59Z`, limit: 1000 }) })
    const j = await r.json()
    if (j.links?.some(l => l.rel === 'next')) throw new Error('hay más de una página en ' + a)
    items.push(...j.features)
  }
  return items.filter(f => {
    const p = f.properties, fecha = p.datetime.slice(0, 10)
    if (String(p['landsat:wrs_path']) !== '226' || String(p['landsat:wrs_row']) !== '079') return false
    if (p['eo:cloud_cover'] > NUBES_MAX) return false
    // Segunda pasada: con el río alto casi nunca hay una escena limpia, así
    // que se aceptan más nubes pero sólo para las fechas de crecida
    if (ALTURA_MIN != null && !(altura(fecha) >= ALTURA_MIN)) return false
    // Landsat 7 perdió el corrector de barrido el 31/05/2003: desde ahí viene rayado
    if (p.platform === 'landsat-7' && fecha > '2003-05-31') return false
    return true
  }).sort((a, b) => a.properties.datetime < b.properties.datetime ? -1 : 1)
}

// El permiso se pide UNA vez y se comparte como promesa: con cuatro escenas en
// paralelo y cinco bandas cada una, pedirlo en cada lectura son veinte pedidos
// juntos y el servicio contesta 429 a todos, para siempre.
let permiso = null
const firmar = async href => { permiso ??= json('https://planetarycomputer.microsoft.com/api/sas/v1/token/landsateuwest/landsat-c2').then(t => t.token); return href + '?' + await permiso }

async function banda(item, nombre) {
  const tiff = await fromUrl(await firmar(item.assets[nombre].href))
  const img = await tiff.getImage()
  if (img.getGeoKeys()?.ProjectedCSTypeGeoKey !== 32621) throw new Error('proyección inesperada')
  const [ox, oy] = img.getOrigin(), [rx, ry] = img.getResolution()
  const w = img.getWidth(), h = img.getHeight()
  const c0 = Math.max(0, Math.floor((G.X0 - ox) / rx)), c1 = Math.min(w, Math.ceil((G.X1 - ox) / rx))
  const f0 = Math.max(0, Math.floor((G.Y1 - oy) / ry)), f1 = Math.min(h, Math.ceil((G.Y0 - oy) / ry))
  const out = new Float32Array(G.N).fill(NaN)
  if (c1 <= c0 || f1 <= f0) return out
  const [d] = await img.readRasters({ window: [c0, f0, c1, f1] })
  const ww = c1 - c0
  for (let f = 0; f < G.ALTO; f++) {
    const fy = Math.floor((G.Y1 - (f + 0.5) * G.PASO - oy) / ry) - f0
    if (fy < 0 || fy >= f1 - f0) continue
    for (let c = 0; c < G.ANCHO; c++) {
      const cx = Math.floor((G.X0 + (c + 0.5) * G.PASO - ox) / rx) - c0
      if (cx >= 0 && cx < ww) out[f * G.ANCHO + c] = d[fy * ww + cx]
    }
  }
  return out
}

async function procesar(item) {
  const fecha = item.properties.datetime.slice(0, 10), arch = `${DIR}/${fecha}_${item.properties.platform}.bin`
  if (existsSync(arch)) return null
  // De a una banda: en paralelo las conexiones al almacenamiento se cortan
  // (UND_ERR_CONNECT_TIMEOUT) y no baja ninguna.
  const b5 = []
  for (const b of ['qa_pixel', 'green', 'red', 'nir08', 'swir16']) b5.push(await banda(item, b))
  return guardar(arch, fecha, ...b5)
}

function guardar(arch, fecha, qa, verde, rojo, nir, swir) {
  const m = new Uint8Array(G.N)
  const sr = v => v * 2.75e-5 - 0.2
  for (let i = 0; i < G.N; i++) {
    const q = qa[i]
    // qa_pixel: bit 0 relleno, 1 nube dilatada, 3 nube, 4 sombra de nube
    if (!G.enAoi[i] || Number.isNaN(q) || (q & 27) || !(verde[i] > 0) || !(swir[i] > 0) || !(nir[i] > 0) || !(rojo[i] > 0)) continue
    const g = sr(verde[i]), s = sr(swir[i]), r = sr(rojo[i]), n = sr(nir[i])
    let b = 1
    if (g + s > 0 && (g - s) / (g + s) > 0) b |= 2
    const ndvi = n + r > 0 ? (n - r) / (n + r) : 1
    if (ndvi < 0.3) b |= 4
    if (ndvi < 0.4) b |= 8
    if (ndvi < 0.5) b |= 16
    m[i] = b
  }
  writeFileSync(arch, m)
  return fecha
}

const items = await buscar()
console.log('escenas candidatas:', items.length)
writeFileSync(`${DIR}/indice${ALTURA_MIN != null ? '-crecidas' : ''}.json`, JSON.stringify(items.map(i => ({ fecha: i.properties.datetime.slice(0, 10), plataforma: i.properties.platform, nubes: i.properties['eo:cloud_cover'], id: i.id, altura: altura(i.properties.datetime.slice(0, 10)) })), null, 0))
let hechas = 0, fallas = 0
// En un orden revuelto pero fijo (por un hash del id): si la corrida se corta,
// lo que bajó es una muestra pareja de todos los años y no "los 80 primero".
// PARTE=k/m reparte la cola entre varios procesos: con varias escenas a la vez
// en un mismo proceso las lecturas fallan.
const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0 }
const [parte, partes] = (process.env.PARTE ?? '0/1').split('/').map(Number)
const cola = [...items].sort((a, b) => hash(a.id) - hash(b.id)).filter((_, i) => i % partes === parte)
await Promise.all(Array.from({ length: +(process.env.HILOS ?? 2) }, async () => {
  for (let it; (it = cola.shift());) {
    for (let k = 0; k < 3; k++) {
      try { await procesar(it); hechas++; break } catch (e) { if (k === 2) { fallas++; console.log('FALLA', it.id, e.message, e.cause?.code ?? e.cause?.message ?? '') } else await new Promise(r => setTimeout(r, 3000)) }
    }
    if (hechas % 25 === 0) console.log('van', hechas, 'de', items.length)
  }
}))
console.log('listo:', hechas, 'fallas:', fallas)
