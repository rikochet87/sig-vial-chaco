/**
 * Las escenas Landsat de CUALQUIER órbita tomadas con el río alto.
 *
 * La serie y las manchas elegidas a mano usaron sólo la órbita 226/079, que
 * cubre el recuadro entero. La 227/079 cubre el oeste —Fontana, Resistencia y
 * el sur hasta el Canal 16, tres cuartos del recuadro urbano— y pasa en otras
 * fechas: de ahí salen escenas limpias con el río sobre 7 m que la otra órbita
 * no tiene.
 *
 *   node crecidas-altas.mjs <lista.json> <carpeta> [traza.geojson]
 *
 * `lista.json`: [{ coleccion, fecha, orbita: '227/079', altura }]. Por escena
 * deja `<fecha>_<órbita>.bin` (0 sin dato, 1 tierra, 2 agua sólo por infrarrojo
 * cercano, 3 agua por los dos criterios, 4 agua sólo por MNDWI; en MSS sólo 0,
 * 1 y 2: los mismos códigos que landsat-eventos.mjs) y un `.png` en falso color
 * del recuadro urbano con margen, para mirarla antes de creerle: **una escena
 * mal georreferenciada no se nota en ningún número** (la 227/079 del
 * 27/05/1998 muestra otro lugar).
 *
 * Mismas dependencias que landsat-eventos.mjs; se corre fuera del repo.
 */
import { fromUrl } from 'geotiff'
import proj4 from 'proj4'
import { PNG } from 'pngjs'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { G, json, aUtm } from './grilla.mjs'

const LISTA = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const DIR = process.argv[3]
const traza = process.argv[4] ? JSON.parse(readFileSync(process.argv[4], 'utf8')).geometry.coordinates : []
mkdirSync(DIR, { recursive: true })

const puntos = []
for (const l of traza) for (let i = 1; i < l.length; i++) {
  const a = aUtm(...l[i - 1]), b = aUtm(...l[i]), n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 30))
  for (let k = 0; k <= n; k++) {
    const x = a[0] + (b[0] - a[0]) * k / n, y = a[1] + (b[1] - a[1]) * k / n
    puntos.push([Math.floor((x - G.X0) / G.PASO), Math.floor((G.Y1 - y) / G.PASO)])
  }
}

const STAC = 'https://planetarycomputer.microsoft.com/api/stac/v1'
let permiso = null
const firmar = async href => { permiso ??= json('https://planetarycomputer.microsoft.com/api/sas/v1/token/landsateuwest/landsat-c2').then(t => t.token); return href + '?' + await permiso }

async function banda(item, nombre) {
  const a = item.assets[nombre]
  if (!a) throw new Error(`no tiene la banda ${nombre}`)
  const tiff = await fromUrl(await firmar(a.href))
  const img = await tiff.getImage()
  const zona = img.getGeoKeys()?.ProjectedCSTypeGeoKey - 32600
  if (!(zona >= 19 && zona <= 22)) throw new Error('proyección inesperada')
  const aEscena = zona === 21 ? null : proj4('+proj=utm +zone=21 +datum=WGS84 +units=m +no_defs', `+proj=utm +zone=${zona} +datum=WGS84 +units=m +no_defs`)
  const [ox, oy] = img.getOrigin(), [rx, ry] = img.getResolution()
  const w = img.getWidth(), h = img.getHeight()
  const esq = [[G.X0, G.Y0], [G.X0, G.Y1], [G.X1, G.Y0], [G.X1, G.Y1]].map(p => (aEscena ? aEscena.forward(p) : p))
  const c0 = Math.max(0, Math.floor((Math.min(...esq.map(e => e[0])) - ox) / rx) - 2), c1 = Math.min(w, Math.ceil((Math.max(...esq.map(e => e[0])) - ox) / rx) + 2)
  const f0 = Math.max(0, Math.floor((Math.max(...esq.map(e => e[1])) - oy) / ry) - 2), f1 = Math.min(h, Math.ceil((Math.min(...esq.map(e => e[1])) - oy) / ry) + 2)
  const out = new Float32Array(G.N).fill(NaN)
  if (c1 <= c0 || f1 <= f0) return out
  const [d] = await img.readRasters({ window: [c0, f0, c1, f1] })
  const ww = c1 - c0, hh = f1 - f0
  for (let f = 0; f < G.ALTO; f++) for (let c = 0; c < G.ANCHO; c++) {
    let x = G.X0 + (c + 0.5) * G.PASO, y = G.Y1 - (f + 0.5) * G.PASO
    if (aEscena) [x, y] = aEscena.forward([x, y])
    const cx = Math.floor((x - ox) / rx) - c0, fy = Math.floor((y - oy) / ry) - f0
    if (cx >= 0 && cx < ww && fy >= 0 && fy < hh) out[f * G.ANCHO + c] = d[fy * ww + cx]
  }
  return out
}

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

const pct = (a, de) => (de ? Math.round(100 * a / de) : null)
const filas = []
for (const e of LISTA) {
  const [path, row] = e.orbita.split('/'), nombre = `${e.fecha}_${path}${row}`
  try {
    const r = await json(`${STAC}/search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ collections: [e.coleccion], bbox: [G.URBANO.oeste, G.URBANO.sur, G.URBANO.este, G.URBANO.norte], datetime: `${e.fecha}T00:00:00Z/${e.fecha}T23:59:59Z`, limit: 20 }) })
    const item = r.features.find(f => String(f.properties['landsat:wrs_path']).padStart(3, '0') === path && String(f.properties['landsat:wrs_row']).padStart(3, '0') === row)
    if (!item) throw new Error('no está en el catálogo')
    const mss = e.coleccion === 'landsat-c2-l1'
    const qa = await banda(item, 'qa_pixel')
    const nir = await banda(item, mss ? 'nir09' : 'nir08')
    const rojo = await banda(item, 'red')
    const verde = await banda(item, 'green')
    const swir = mss ? null : await banda(item, 'swir16')
    const valido = new Uint8Array(G.N), cubre = new Uint8Array(G.N)
    for (let i = 0; i < G.N; i++) {
      const q = qa[i]
      if (!G.enAoi[i] || Number.isNaN(q) || (q & 1) || !(nir[i] > 0)) continue
      cubre[i] = 1
      valido[i] = (q & 26) ? 0 : 1
    }
    const umbral = otsu(nir, valido)
    const m = new Uint8Array(G.N)
    for (let i = 0; i < G.N; i++) {
      if (!valido[i]) continue
      const aguaNir = nir[i] < umbral
      if (mss) { m[i] = aguaNir ? 2 : 1; continue }
      const g = verde[i] * 2.75e-5 - 0.2, s = swir[i] * 2.75e-5 - 0.2
      const agua = verde[i] > 0 && swir[i] > 0 && g + s > 0 && (g - s) / (g + s) > 0
      m[i] = agua && aguaNir ? 3 : agua ? 4 : aguaNir ? 2 : 1
    }
    writeFileSync(`${DIR}/${nombre}.bin`, m)

    let aoi = 0, urb = 0, nCubre = 0, nVal = 0, uCubre = 0, uVal = 0, aNir = 0, aAb = 0, uNir = 0, uAb = 0
    for (let i = 0; i < G.N; i++) {
      if (!G.enAoi[i]) continue
      aoi++; nCubre += cubre[i]; if (m[i]) nVal++
      const nirA = m[i] === 2 || m[i] === 3, ab = m[i] >= 3
      if (nirA) aNir++; if (ab) aAb++
      if (G.enUrbano[i]) { urb++; uCubre += cubre[i]; if (m[i]) uVal++; if (nirA) uNir++; if (ab) uAb++ }
    }
    // La traza: cuántos puntos se ven y cuántos tienen agua a ±90 m, por cada criterio
    let tv = 0, tn = 0, ta = 0
    for (const [c, f] of puntos) {
      if (c < 3 || f < 3 || c >= G.ANCHO - 3 || f >= G.ALTO - 3 || !m[f * G.ANCHO + c]) continue
      tv++
      let n = false, a = false
      for (let df = -3; df <= 3; df++) for (let dc = -3; dc <= 3; dc++) { const v = m[(f + df) * G.ANCHO + c + dc]; if (v === 2 || v === 3) n = true; if (v >= 3) a = true }
      if (n) tn++
      if (a) ta++
    }
    const fila = {
      ...e, id: item.id, sensor: mss ? 'MSS' : 'TM', nubes: item.properties['eo:cloud_cover'],
      cubrePct: pct(nCubre, aoi), validoPct: pct(nVal, aoi), urbanoCubrePct: pct(uCubre, urb), urbanoValidoPct: pct(uVal, urb),
      aguaNirKm2: +(aNir * G.KM2).toFixed(1), aguaNirUrbanoKm2: +(uNir * G.KM2).toFixed(1),
      ...(mss ? {} : { abiertaKm2: +(aAb * G.KM2).toFixed(1), abiertaUrbanoKm2: +(uAb * G.KM2).toFixed(1) }),
      trazaVistaPct: pct(tv, puntos.length), trazaAguaNirPct: pct(tn, tv), ...(mss ? {} : { trazaAbiertaPct: pct(ta, tv) }),
    }
    filas.push(fila)
    console.log(JSON.stringify(fila))

    // Falso color del recuadro urbano con 3 km de margen; el agua por infrarrojo, con borde celeste
    const [ux0, uy0] = aUtm(G.URBANO.oeste - 0.03, G.URBANO.sur - 0.03), [ux1, uy1] = aUtm(G.URBANO.este + 0.03, G.URBANO.norte + 0.03)
    const C0 = Math.max(0, Math.floor((ux0 - G.X0) / G.PASO)), C1 = Math.min(G.ANCHO, Math.ceil((ux1 - G.X0) / G.PASO))
    const F0 = Math.max(0, Math.floor((G.Y1 - uy1) / G.PASO)), F1 = Math.min(G.ALTO, Math.ceil((G.Y1 - uy0) / G.PASO))
    const estirar = (v, b) => { // percentiles 2 y 98 de la banda dentro de la vista
      const s = []; for (let f = F0; f < F1; f += 3) for (let c = C0; c < C1; c += 3) { const x = b[f * G.ANCHO + c]; if (x > 0) s.push(x) }
      s.sort((p, q) => p - q); const lo = s[Math.floor(s.length * 0.02)] ?? 0, hi = s[Math.floor(s.length * 0.98)] ?? 1
      return x => Math.max(0, Math.min(255, Math.round(255 * (x - lo) / (hi - lo || 1))))
    }
    const R = mss ? nir : swir, Gv = mss ? rojo : nir, B = mss ? verde : rojo
    const tr = estirar(0, R), tg = estirar(0, Gv), tb = estirar(0, B)
    const enTraza = new Set(puntos.map(([c, f]) => f * G.ANCHO + c))
    const E = 2, png = new PNG({ width: (C1 - C0) * E, height: (F1 - F0) * E })
    const agua = i => (process.env.VISTA === 'abierta' ? m[i] >= 3 : m[i] === 2 || m[i] === 3)
    for (let f = F0; f < F1; f++) for (let c = C0; c < C1; c++) {
      const i = f * G.ANCHO + c
      let col = !cubre[i] ? [40, 0, 40] : [tr(R[i]), tg(Gv[i]), tb(B[i])]
      if (process.env.VISTA && agua(i) && (!agua(i - 1) || !agua(i + 1) || !agua(i - G.ANCHO) || !agua(i + G.ANCHO))) col = [0, 230, 255]
      if (enTraza.has(i)) col = [255, 235, 0]
      for (let dy = 0; dy < E; dy++) for (let dx = 0; dx < E; dx++) {
        const o = (((f - F0) * E + dy) * png.width + (c - C0) * E + dx) * 4
        png.data[o] = col[0]; png.data[o + 1] = col[1]; png.data[o + 2] = col[2]; png.data[o + 3] = 255
      }
    }
    writeFileSync(`${DIR}/${nombre}.png`, PNG.sync.write(png))
  } catch (err) { console.log('FALLA', nombre, err.message, err.cause?.code ?? '') }
}
writeFileSync(`${DIR}/crecidas-altas-resultado.json`, JSON.stringify(filas, null, 1))
