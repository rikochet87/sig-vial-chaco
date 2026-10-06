// Paso 2 de la serie: con las máscaras de landsat-serie-bajar.mjs arma
//  - la superficie de agua de cada escena contra la altura de Barranqueras,
//  - a qué altura del río se moja cada lugar,
//  - el control contra el Global Surface Water del JRC,
//  - la mancha urbana por época y cuánto de las crecidas cae sobre ella.
//   node landsat-serie-analizar.mjs <barranqueras_diario.json> <carpeta serie> <gsw.bin> <carpeta máscaras MSS> <salida>
import { contours } from 'd3-contour'
import { PNG } from 'pngjs'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { G, aGeo } from './grilla.mjs'

const [, , fRio, DIR, fGsw, DIR_MSS, SALIDA] = process.argv
mkdirSync(SALIDA, { recursive: true })
const rio = JSON.parse(readFileSync(fRio, 'utf8'))
const t0 = Date.parse(rio.desde + 'T00:00:00Z')
const idx = f => Math.round((Date.parse(f + 'T00:00:00Z') - t0) / 864e5)
const alt = f => { const v = rio.cm[idx(f)]; return v == null ? null : v / 100 }
/** Máximo de los 30 días anteriores, sin contar el día */
const max30 = f => { const i = idx(f); let m = -Infinity; for (let k = i - 30; k < i; k++) if (rio.cm[k] != null && rio.cm[k] > m) m = rio.cm[k]; return m === -Infinity ? null : m / 100 }

/** Una escena cuenta para "a qué altura se moja" si el río no viene bajando */
const TOLERANCIA_BAJANTE_M = 0.3
const CLASES = [{ k: 'menos de 4 m', min: -9, max: 4 }, { k: '4 a 5 m', min: 4, max: 5 }, { k: '5 a 6 m', min: 5, max: 6 }, { k: '6 a 7 m', min: 6, max: 7 }, { k: '7 m o más', min: 7, max: 99 }]
const EPOCAS = [{ k: '1984-1989', a: 1984, b: 1989 }, { k: '1998-2002', a: 1998, b: 2002 }, { k: '2009-2013', a: 2009, b: 2013 }, { k: '2020-2025', a: 2020, b: 2025 }]
/** Para entrar en las tablas de superficie, la escena tiene que verse casi entera */
const VALIDO_MIN = 85

// El índice de la pasada general y, si existe, el de las fechas de crecida
const indice = [...new Map(['indice.json', 'indice-crecidas.json'].filter(f => existsSync(`${DIR}/${f}`)).flatMap(f => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'))).map(e => [e.id, e])).values()].sort((a, b) => a.fecha < b.fecha ? -1 : 1)
const N = G.N
const cl = CLASES.map(() => ({ val: new Uint16Array(N), agua: new Uint16Array(N), n: 0 }))
const ep = EPOCAS.map(() => ({ val: new Uint16Array(N), bajo: new Uint16Array(N), agua: new Uint16Array(N), n: 0 }))
const todoVal = new Uint16Array(N), todoAgua = new Uint16Array(N) // hasta 2021, para comparar con el JRC
const filas = [], malas = []
let aoi = 0, urb = 0
for (let i = 0; i < N; i++) { aoi += G.enAoi[i]; urb += G.enUrbano[i] }

for (const e of indice) {
  const arch = `${DIR}/${e.fecha}_${e.plataforma}.bin`
  if (!existsSync(arch)) continue
  const m = readFileSync(arch)
  let val = 0, agua = 0, valU = 0, aguaU = 0
  for (let i = 0; i < N; i++) { const b = m[i]; if (b & 1) { val++; if (b & 2) agua++; if (G.enUrbano[i]) { valU++; if (b & 2) aguaU++ } } }
  // Escenas imposibles: con el río en 0,34 m hay 61 km² de agua, así que menos
  // de 45 con la escena entera a la vista es una escena mala; y más de 600 es
  // más que el máximo de 1983. Son productos fallados, no inundaciones.
  const km2 = agua * G.KM2
  if (km2 > 600 || (val >= 0.85 * aoi && km2 < 45)) { malas.push(`${e.fecha} (${km2.toFixed(0)} km2)`); continue }
  const a = alt(e.fecha), mx = max30(e.fecha)
  const subiendo = a != null && mx != null && a >= mx - TOLERANCIA_BAJANTE_M
  const fila = { fecha: e.fecha, plataforma: e.plataforma, altura: a, max30: mx, subiendo, validoPct: Math.round(100 * val / aoi), aguaKm2: +(agua * G.KM2).toFixed(1), validoUrbanoPct: Math.round(100 * valU / urb), aguaUrbanoKm2: +(aguaU * G.KM2).toFixed(1) }
  filas.push(fila)
  const anio = +e.fecha.slice(0, 4)
  const c = a == null || !subiendo ? -1 : CLASES.findIndex(x => a >= x.min && a < x.max)
  const p = EPOCAS.findIndex(x => anio >= x.a && anio <= x.b)
  if (c >= 0) cl[c].n++
  if (p >= 0) ep[p].n++
  for (let i = 0; i < N; i++) {
    const b = m[i]; if (!(b & 1)) continue
    if (c >= 0) { cl[c].val[i]++; if (b & 2) cl[c].agua[i]++ }
    if (p >= 0) { ep[p].val[i]++; if (b & 8) ep[p].bajo[i]++; if (b & 2) ep[p].agua[i]++ }
    if (anio <= 2021) { todoVal[i]++; if (b & 2) todoAgua[i]++ }
  }
}
writeFileSync(`${SALIDA}/serie-resultado.json`, JSON.stringify(filas))
console.log('descartadas por imposibles:', malas.join(', ') || 'ninguna')
console.log('por década:', JSON.stringify(filas.reduce((o, f) => { const d = f.fecha.slice(0, 3) + '0'; o[d] = (o[d] ?? 0) + 1; return o }, {})))
console.log('escenas leídas:', filas.length, '· por clase (río sin bajar):', CLASES.map((c, k) => `${c.k}: ${cl[k].n}`).join(' · '))

// ── Superficie contra altura ────────────────────────────────────────────────
const rangos = a => { const o = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = []; o.forEach(([, i], k) => r[i] = k); return r }
const spearman = (a, b) => { const x = rangos(a), y = rangos(b), n = a.length; let d = 0; for (let i = 0; i < n; i++) d += (x[i] - y[i]) ** 2; return 1 - 6 * d / (n * (n * n - 1)) }
const mediana = v => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null }
const limpias = filas.filter(f => f.validoPct >= VALIDO_MIN && f.altura != null)
console.log(`\nSUPERFICIE CONTRA ALTURA · escenas con ${VALIDO_MIN} % visible o más: ${limpias.length}`)
console.log('correlación de rangos, todas:', spearman(limpias.map(f => f.altura), limpias.map(f => f.aguaKm2)).toFixed(2), '· sólo con el río sin bajar:', (() => { const s = limpias.filter(f => f.subiendo); return `${spearman(s.map(f => f.altura), s.map(f => f.aguaKm2)).toFixed(2)} (n ${s.length})` })(), '· contra el máximo de 30 días:', spearman(limpias.map(f => Math.max(f.altura, f.max30 ?? 0)), limpias.map(f => f.aguaKm2)).toFixed(2))
console.log('clase | n | agua mediana km2 (mín–máx) | urbano mediana | bajando: n, mediana')
for (const c of CLASES) {
  const s = limpias.filter(f => f.subiendo && f.altura >= c.min && f.altura < c.max), b = limpias.filter(f => !f.subiendo && f.altura >= c.min && f.altura < c.max)
  console.log(`${c.k} | ${s.length} | ${mediana(s.map(f => f.aguaKm2))} (${Math.min(...s.map(f => f.aguaKm2))}–${Math.max(...s.map(f => f.aguaKm2))}) | ${mediana(s.map(f => f.aguaUrbanoKm2))} | ${b.length}, ${mediana(b.map(f => f.aguaKm2))}`)
}
console.log('las 12 con más agua:', limpias.slice().sort((a, b) => b.aguaKm2 - a.aguaKm2).slice(0, 12).map(f => `${f.fecha} ${f.aguaKm2} km2 a ${f.altura} m (máx30 ${f.max30})`).join(' · '))

// ── A qué altura se moja cada lugar ─────────────────────────────────────────
// La clase más baja en la que hubo agua en la mitad o más de las escenas
// válidas (con tres como mínimo). 0 = nunca, 1..5 = clase, 255 = sin dato.
const MIN_OBS = 3
const moja = new Uint8Array(N)
for (let i = 0; i < N; i++) {
  if (!G.enAoi[i]) { moja[i] = 255; continue }
  let visto = false
  for (let k = 0; k < CLASES.length; k++) { if (cl[k].val[i] >= MIN_OBS) { visto = true; if (cl[k].agua[i] * 2 >= cl[k].val[i]) { moja[i] = k + 1; break } } }
  if (!visto) moja[i] = 255
}
console.log('\nA QUÉ ALTURA SE MOJA · km2 en el recuadro | en el recuadro urbano')
for (let k = 0; k <= CLASES.length; k++) { let a = 0, u = 0; for (let i = 0; i < N; i++) if (moja[i] === k) { a++; if (G.enUrbano[i]) u++ } console.log(k === 0 ? 'no se moja en ninguna clase' : CLASES[k - 1].k, '|', (a * G.KM2).toFixed(1), '|', (u * G.KM2).toFixed(1)) }

// ── Control contra el JRC ───────────────────────────────────────────────────
const gsw = readFileSync(fGsw)
{ let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0; const iou = { 10: [0, 0], 50: [0, 0], 90: [0, 0] }
  for (let i = 0; i < N; i++) {
    if (!G.enAoi[i] || gsw[i] === 255 || todoVal[i] < 10) continue
    const x = 100 * todoAgua[i] / todoVal[i], y = gsw[i]
    n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y
    for (const u of [10, 50, 90]) { const a = x >= u, b = y >= u; if (a && b) iou[u][0]++; if (a || b) iou[u][1]++ }
  }
  const r = (n * sxy - sx * sy) / Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy))
  let propio = [0, 0, 0], jrc = [0, 0, 0]
  for (let i = 0; i < N; i++) { if (!G.enAoi[i] || gsw[i] === 255 || todoVal[i] < 10) continue; const x = 100 * todoAgua[i] / todoVal[i]; [10, 50, 90].forEach((u, k) => { if (x >= u) propio[k]++; if (gsw[i] >= u) jrc[k]++ }) }
  console.log(`\nCONTROL JRC (1984-2021) · píxeles ${n} · correlación ${r.toFixed(3)} · media propia ${(sx / n).toFixed(2)} % contra ${(sy / n).toFixed(2)} %`)
  for (const [k, u] of [10, 50, 90].entries()) console.log(`ocurrencia >= ${u} %: propio ${(propio[k] * G.KM2).toFixed(1)} km2, JRC ${(jrc[k] * G.KM2).toFixed(1)} km2, coincidencia ${(iou[u][0] / iou[u][1]).toFixed(2)}`)
}

// ── Mancha urbana por época ─────────────────────────────────────────────────
// Urbano = poca vegetación (NDVI < 0,4) en el 80 % o más de las escenas de la
// época, con seis como mínimo, y que no sea agua. Lo que sólo está pelado una
// temporada —un rastrojo, un bajo seco— no llega al 80 %.
const urbano = EPOCAS.map((_, p) => { const u = new Uint8Array(N); for (let i = 0; i < N; i++) { const v = ep[p].val[i]; u[i] = G.enAoi[i] && v >= 6 && ep[p].bajo[i] >= 0.8 * v && ep[p].agua[i] < 0.2 * v ? 1 : 0 } return u })
console.log('\nMANCHA URBANA · época | escenas | km2 en el recuadro | en el recuadro urbano')
EPOCAS.forEach((e, p) => { let a = 0, u = 0; for (let i = 0; i < N; i++) if (urbano[p][i]) { a++; if (G.enUrbano[i]) u++ } console.log(e.k, '|', ep[p].n, '|', (a * G.KM2).toFixed(1), '|', (u * G.KM2).toFixed(1)) })
const hoy = urbano.at(-1), antes = urbano[0]
console.log('\nLO CONSTRUIDO HOY (2020-2025), por la altura a la que se moja:')
// Sólo adentro del recuadro urbano: el recuadro grande incluye a la ciudad de
// Corrientes y los bancos de arena del río, que también son "poca vegetación"
for (let k = 0; k <= CLASES.length; k++) { let a = 0; for (let i = 0; i < N; i++) if (G.enUrbano[i] && hoy[i] && moja[i] === k) a++; console.log(k === 0 ? 'no se moja' : CLASES[k - 1].k, (a * G.KM2).toFixed(2), 'km2') }
// Crecidas de 1982-83 (MSS, infrarrojo cercano) sobre lo construido entonces y hoy
for (const id of ['LM03_L1TP_243079_19820814_02_T2', 'LM04_L1TP_226079_19830228_02_T2', 'LM04_L1TP_226079_19830620_02_T2', 'LM04_L1TP_226079_19830722_02_T2']) {
  const f = `${DIR_MSS}/mascara_${id}.bin`; if (!existsSync(f)) continue
  const m = readFileSync(f); let aH = 0, aA = 0, nuevo = 0
  for (let i = 0; i < N; i++) if (G.enUrbano[i] && m[i] === 2) { if (hoy[i]) aH++; if (antes[i]) aA++; if (hoy[i] && !antes[i]) nuevo++ }
  console.log(`agua del ${id.split('_')[3]}: ${(aH * G.KM2).toFixed(1)} km2 sobre lo construido hoy · ${(aA * G.KM2).toFixed(1)} sobre lo construido en 1984-89 · ${(nuevo * G.KM2).toFixed(1)} sobre lo que se construyó después`)
}

// ── Imágenes y vectores ─────────────────────────────────────────────────────
function png(nombre, pintar) {
  const p = new PNG({ width: G.ANCHO, height: G.ALTO })
  for (let i = 0; i < N; i++) p.data.set([...pintar(i), 255], i * 4)
  for (let i = 0; i < N; i++) { const f = Math.floor(i / G.ANCHO), c = i % G.ANCHO; if (G.enUrbano[i] && (!G.enUrbano[i - 1] || !G.enUrbano[i + 1] || !G.enUrbano[(f - 1) * G.ANCHO + c] || !G.enUrbano[(f + 1) * G.ANCHO + c])) p.data.set([245, 195, 0, 255], i * 4) }
  writeFileSync(`${SALIDA}/${nombre}.png`, PNG.sync.write(p))
}
const COLOR = [[50, 50, 50], [20, 40, 90], [200, 40, 40], [240, 130, 40], [240, 210, 80], [150, 200, 230]]
png('altura-de-mojado', i => moja[i] === 255 ? [0, 0, 0] : hoy[i] && moja[i] === 0 ? [110, 110, 110] : COLOR[moja[i]])
png('urbano', i => !G.enAoi[i] ? [0, 0, 0] : antes[i] ? [230, 230, 230] : urbano[1][i] ? [240, 200, 90] : urbano[2][i] ? [240, 140, 50] : hoy[i] ? [220, 60, 50] : todoVal[i] && todoAgua[i] * 2 >= todoVal[i] ? [20, 40, 90] : [45, 45, 45])

function poligonos(bin, props, F = 3, minPx = 10) {
  const w = Math.floor(G.ANCHO / F), h = Math.floor(G.ALTO / F), v = new Float64Array(w * h)
  for (let f = 0; f < h; f++) for (let c = 0; c < w; c++) { let s = 0; for (let a = 0; a < F; a++) for (let b = 0; b < F; b++) s += bin[(f * F + a) * G.ANCHO + c * F + b]; v[f * w + c] = s / (F * F) }
  const [geo] = contours().size([w, h]).thresholds([0.5])(v)
  const area = an => { let s = 0; for (let i = 0; i < an.length - 1; i++) s += an[i][0] * an[i + 1][1] - an[i + 1][0] * an[i][1]; return Math.abs(s / 2) }
  const coords = geo.coordinates.filter(p => area(p[0]) >= minPx).map(p => p.filter((an, k) => k === 0 || area(an) >= minPx).map(an => an.map(([x, y]) => { const [lon, lat] = aGeo(G.X0 + x * F * G.PASO, G.Y1 - y * F * G.PASO); return [+lon.toFixed(5), +lat.toFixed(5)] })))
  return { type: 'Feature', properties: props, geometry: { type: 'MultiPolygon', coordinates: coords } }
}
const fc = { type: 'FeatureCollection', features: [] }
for (let k = 1; k <= CLASES.length; k++) {
  const bin = new Uint8Array(N); for (let i = 0; i < N; i++) bin[i] = moja[i] >= 1 && moja[i] <= k ? 1 : 0
  fc.features.push(poligonos(bin, { capa: 'se moja con el río en', hasta: CLASES[k - 1].k, escenas: cl[k - 1].n, criterio: 'agua abierta (MNDWI > 0) en la mitad o más de las escenas de esa clase o de una más baja, con el río sin bajar' }))
}
EPOCAS.forEach((e, p) => fc.features.push(poligonos(urbano[p], { capa: 'mancha urbana', epoca: e.k, escenas: ep[p].n, criterio: 'NDVI < 0,4 en el 80 % o más de las escenas de la época' }, 2, 6)))
writeFileSync(`${SALIDA}/zonas-serie.geojson`, JSON.stringify(fc))
console.log('\ngeojson', JSON.stringify(fc).length)
