/**
 * Exploración: el agua que detecta Sentinel-1 por cuenca, según el producto
 * Global Flood Monitoring (GFM) de Copernicus.
 *
 *   node scripts/explorar-gfm.mjs [desde] [hasta]     (AAAA-MM-DD)
 *
 * **No alimenta ninguna pantalla.** Está en el repo para poder repetir la
 * medición que llevó a no usar el producto: ver «Sentinel-1: lo que se probó»
 * en el CLAUDE.md. Si GFM cambia de versión, o se quiere probar otra cuenca,
 * se corre de nuevo y se mira si la conclusión se sostiene.
 *
 * ── De dónde sale ─────────────────────────────────────────────────────────────
 *
 * El catálogo STAC de EODC (stac.eodc.eu, colección GFM) y sus archivos en
 * data.eodc.eu: abiertos, sin cuenta. Cada pasada de Sentinel-1 trae, por
 * mosaico de 300 km, el agua observada, lo inundado (el agua menos la de
 * referencia) y la máscara de exclusión.
 *
 * ── Cómo se lee, sin dependencias ─────────────────────────────────────────────
 *
 * Los archivos son TIFF en mosaicos de 512 px, uint8, comprimidos con ZSTD,
 * que Node trae desde la versión 22. Se lee el tercer nivel de la pirámide
 * (80 m): alcanza para sumar superficie por cuenca y son 14 millones de
 * píxeles en vez de 225.
 *
 * La grilla es Equi7 de Sudamérica: azimutal equidistante sobre el elipsoide,
 * centrada en 14° S, 60,5° O. En vez de invertirla píxel por píxel se
 * proyectan los vértices de las cuencas hacia la grilla (Vincenty inverso
 * desde el centro) y se rasterizan ahí. Control: la esquina sudoeste del
 * mosaico E072N039, que el catálogo da en −61,0815 / −29,2797, cae en
 * x = 7.200.000, y = 3.900.004.
 *
 * Mira un solo mosaico, el E072N039 (el este de la provincia, al sur de
 * Resistencia). Las pasadas se arman juntando las escenas de la misma hora, y
 * un píxel se cuenta una sola vez por pasada aunque dos escenas lo pisen.
 *
 * El nombre no empieza con `verificar-` a propósito: sale a la red y tarda
 * unos diez minutos por año.
 */
import { readFileSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'

const ISO = /^\d{4}-\d{2}-\d{2}$/
const DESDE = ISO.test(process.argv[2] ?? '') ? process.argv[2] : '2025-09-01'
const HASTA = ISO.test(process.argv[3] ?? '') ? process.argv[3] : new Date().toISOString().slice(0, 10)


// ── TIFF en mosaicos, uint8, ZSTD ──
function leerTiff(buf, nivel) {
  if (buf.toString('latin1', 0, 2) !== 'II' || buf.readUInt16LE(2) !== 42) throw new Error('no es un TIFF little-endian')
  let ifd = buf.readUInt32LE(4)
  for (let n = 0; ifd; n++) {
    const cnt = buf.readUInt16LE(ifd), t = {}
    for (let i = 0; i < cnt; i++) {
      const e = ifd + 2 + i * 12, tag = buf.readUInt16LE(e), tipo = buf.readUInt16LE(e + 2), c = buf.readUInt32LE(e + 4)
      const tam = ({ 1: 1, 2: 1, 3: 2, 4: 4, 12: 8 })[tipo] ?? 1
      const off = tam * c <= 4 ? e + 8 : buf.readUInt32LE(e + 8)
      const leer = k => tipo === 3 ? buf.readUInt16LE(off + 2 * k) : tipo === 4 ? buf.readUInt32LE(off + 4 * k) : tipo === 12 ? buf.readDoubleLE(off + 8 * k) : buf[off + k]
      t[tag] = { c, leer }
    }
    if (n === nivel) {
      const W = t[256].leer(0), H = t[257].leer(0), tw = t[322].leer(0), th = t[323].leer(0)
      if (t[259].leer(0) !== 50000 || t[258].leer(0) !== 8) throw new Error('se esperaba uint8 con ZSTD')
      const nx = Math.ceil(W / tw), ny = Math.ceil(H / th), out = new Uint8Array(W * H).fill(255)
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const k = j * nx + i, o = t[324].leer(k), b = t[325].leer(k)
        if (!b) continue
        const d = zstdDecompressSync(buf.subarray(o, o + b))
        const w = Math.min(tw, W - i * tw), h = Math.min(th, H - j * th)
        for (let y = 0; y < h; y++) out.set(d.subarray(y * tw, y * tw + w), (j * th + y) * W + i * tw)
      }
      return { W, H, datos: out }
    }
    ifd = buf.readUInt32LE(ifd + 2 + cnt * 12)
  }
  throw new Error('el archivo no tiene el nivel ' + nivel)
}

// ── Equi7 Sudamérica: azimutal equidistante sobre el elipsoide WGS84 ──
const A = 6378137, F = 1 / 298.257223563, B = A * (1 - F)
const LAT0 = -14, LON0 = -60.5, FE = 7257179.23559, FN = 5592024.44605
const rad = g => g * Math.PI / 180
/** Vincenty inverso: distancia y acimut desde el centro */
function aEqui7(lat, lng) {
  const U1 = Math.atan((1 - F) * Math.tan(rad(LAT0))), U2 = Math.atan((1 - F) * Math.tan(rad(lat))), L = rad(lng - LON0)
  const sU1 = Math.sin(U1), cU1 = Math.cos(U1), sU2 = Math.sin(U2), cU2 = Math.cos(U2)
  let lam = L, sS, cS, sig, sA, c2A, c2SM
  for (let i = 0; i < 100; i++) {
    const sl = Math.sin(lam), cl = Math.cos(lam)
    sS = Math.hypot(cU2 * sl, cU1 * sU2 - sU1 * cU2 * cl)
    if (sS === 0) return [FE, FN]
    cS = sU1 * sU2 + cU1 * cU2 * cl; sig = Math.atan2(sS, cS)
    sA = cU1 * cU2 * sl / sS; c2A = 1 - sA * sA; c2SM = c2A ? cS - 2 * sU1 * sU2 / c2A : 0
    const C = F / 16 * c2A * (4 + F * (4 - 3 * c2A)), ant = lam
    lam = L + (1 - C) * F * sA * (sig + C * sS * (c2SM + C * cS * (-1 + 2 * c2SM * c2SM)))
    if (Math.abs(lam - ant) < 1e-12) break
  }
  const u2 = c2A * (A * A - B * B) / (B * B)
  const AA = 1 + u2 / 16384 * (4096 + u2 * (-768 + u2 * (320 - 175 * u2))), BB = u2 / 1024 * (256 + u2 * (-128 + u2 * (74 - 47 * u2)))
  const dS = BB * sS * (c2SM + BB / 4 * (cS * (-1 + 2 * c2SM * c2SM) - BB / 6 * c2SM * (-3 + 4 * sS * sS) * (-3 + 4 * c2SM * c2SM)))
  const s = B * AA * (sig - dS)
  const az = Math.atan2(cU2 * Math.sin(lam), cU1 * sU2 - sU1 * cU2 * Math.cos(lam))
  return [FE + s * Math.sin(az), FN + s * Math.cos(az)]
}

/** Rasteriza polígonos (anillos [lng,lat]) sobre el mosaico: 0 = afuera, cod = adentro */
function rasterizar(cuencas, x0, y1, paso, W, H) {
  const m = new Uint8Array(W * H)
  for (const c of cuencas) for (const anillo of c.anillos) {
    const p = anillo.map(([lng, lat]) => { const [x, y] = aEqui7(lat, lng); return [(x - x0) / paso, (y1 - y) / paso] })
    let ymin = Infinity, ymax = -Infinity
    for (const q of p) { ymin = Math.min(ymin, q[1]); ymax = Math.max(ymax, q[1]) }
    for (let j = Math.max(0, Math.floor(ymin)); j <= Math.min(H - 1, Math.ceil(ymax)); j++) {
      const yc = j + 0.5, xs = []
      for (let k = 0, n = p.length; k < n; k++) {
        const a = p[k], b = p[(k + 1) % n]
        if ((a[1] <= yc) !== (b[1] <= yc)) xs.push(a[0] + (yc - a[1]) / (b[1] - a[1]) * (b[0] - a[0]))
      }
      xs.sort((u, v) => u - v)
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const i0 = Math.max(0, Math.ceil(xs[k] - 0.5)), i1 = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5))
        for (let i = i0; i <= i1; i++) m[j * W + i] = c.cod
      }
    }
  }
  return m
}

function cargarCuencas(geo) {
  return geo.features.map(f => ({
    cod: f.properties.cod, nombre: f.properties.nombre, ha: f.properties.ha,
    // sólo anillos exteriores: el script de cuencas afirma que no hay huecos
    anillos: f.geometry.type === 'Polygon' ? [f.geometry.coordinates[0]] : f.geometry.coordinates.map(p => p[0]),
  }))
}

// ── La corrida ──
const cuencas = cargarCuencas(JSON.parse(readFileSync('public/geo/geo_cuencas.json', 'utf8')))
const TILE = 'SA020M_E072N039T3', x0 = 7200000, y1 = 4200000, W = 3750
const mask = rasterizar(cuencas, x0, y1, 80, W, W)
const px = new Array(14).fill(0); for (const v of mask) px[v]++
// buscar items del mosaico, paginando
let items = [], body = { collections: ['GFM'], bbox: [-60.5, -28.5, -58.6, -27.0], datetime: `${DESDE}T00:00:00Z/${HASTA}T23:59:59Z`, limit: 200 }
let url = 'https://stac.eodc.eu/api/v1/search', req = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
for (let p = 0; p < 40; p++) {
  const j = await (await fetch(url, req)).json()
  items.push(...j.features.filter(f => f.properties.Equi7Tile === TILE).map(f => ({ t: f.properties.datetime, agua: f.assets.ensemble_water_extent?.href, inun: f.assets.ensemble_flood_extent?.href })))
  const next = j.links?.find(l => l.rel === 'next'); if (!next || !j.features.length) break
  url = next.href; req = next.method === 'POST' ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(next.body) } : {}
}
items.sort((a, b) => a.t.localeCompare(b.t))
console.error(items.length, 'escenas del mosaico')
const pasadas = new Map()
for (const it of items) { const k = it.t.slice(0, 13); (pasadas.get(k) ?? pasadas.set(k, []).get(k)).push(it) }
const bajar = async u => { for (let i = 0; i < 3; i++) { try { const r = await fetch(u, { signal: AbortSignal.timeout(60000) }); if (r.ok) return Buffer.from(await r.arrayBuffer()) } catch {} } return null }
const out = []
for (const [k, its] of pasadas) {
  const visto = new Uint8Array(W * W), val = new Array(14).fill(0), agua = new Array(14).fill(0), inun = new Array(14).fill(0)
  for (const it of its) {
    const ba = it.agua && await bajar(it.agua), bi = it.inun && await bajar(it.inun)
    if (!ba) continue
    const a = leerTiff(ba, 2).datos, f = bi ? leerTiff(bi, 2).datos : null
    for (let i = 0; i < mask.length; i++) { const c = mask[i]; if (!c || a[i] === 255 || visto[i]) continue; visto[i] = 1; val[c]++; if (a[i] === 1) agua[c]++; if (f && f[i] === 1) inun[c]++ }
  }
  out.push({ k, val, agua, inun })
  console.error(k, its.length)
}
for (const c of [6, 8, 7, 9, 5, 10]) {
  console.log(`\n== cuenca ${c} ${cuencas.find(x => x.cod === c).nombre}: ${(px[c] * .0064).toFixed(0)} km² en el mosaico. Pasadas con ≥90 % cubierto:`)
  const f = out.filter(o => o.val[c] / px[c] >= 0.9)
  console.log(f.map(o => `${o.k.slice(5, 10)} ${o.k.slice(11)}h agua ${(o.agua[c] * .0064).toFixed(1)} inund ${(o.inun[c] * .0064).toFixed(1)}`).join('\n'))
}
