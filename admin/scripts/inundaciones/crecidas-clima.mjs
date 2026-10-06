// Cruza cada crecida de Barranqueras con el ENSO (ONI de la NOAA) y con la
// lluvia local modelada (ERA5 en Resistencia), y al revés: los mayores
// eventos de lluvia local con la altura del río ese día.
//
// Es una exploración: no entra en `npm run verificar` y sale a la red para
// bajar sus dos entradas. Lo que dio está en docs/inundaciones-gran-resistencia.md.
//
//   curl -o oni.txt https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt
//   curl -o era5.json "https://archive-api.open-meteo.com/v1/archive?latitude=-27.45&longitude=-58.99&start_date=1940-01-01&end_date=2026-09-28&daily=precipitation_sum&models=era5&timezone=America%2FArgentina%2FCordoba"
//   node scripts/inundaciones/crecidas-clima.mjs public/rio/barranqueras_diario.json oni.txt era5.json
//
// OJO con la lluvia: ERA5 dio la mitad de lo medido en los tres meses que se
// pudieron controlar contra el SMN (ver el CONTROL al final). Sirve para decir
// si un período fue húmedo o seco, no para rankear tormentas.
import { readFileSync } from 'node:fs'
const [, , fRio, fOni, fEra] = process.argv
const rio = JSON.parse(readFileSync(fRio, 'utf8'))
const t0 = Date.parse(rio.desde + 'T00:00:00Z')
const idx = f => Math.round((Date.parse(f + 'T00:00:00Z') - t0) / 864e5)
const alt = f => { const v = rio.cm[idx(f)]; return v == null ? null : v / 100 }

// ONI: trimestre móvil; se indexa por el mes central
const MESES = { DJF: 1, JFM: 2, FMA: 3, MAM: 4, AMJ: 5, MJJ: 6, JJA: 7, JAS: 8, ASO: 9, SON: 10, OND: 11, NDJ: 12 }
const oni = new Map()
for (const l of readFileSync(fOni, 'utf8').split('\n').slice(1)) {
  const p = l.trim().split(/\s+/); if (p.length < 4) continue
  oni.set(`${p[1]}-${String(MESES[p[0]]).padStart(2, '0')}`, +p[3])
}
const fase = v => v == null ? 's/d' : v >= 1.5 ? 'Niño fuerte' : v >= 1 ? 'Niño moderado' : v >= 0.5 ? 'Niño débil' : v <= -1 ? 'Niña mod/fuerte' : v <= -0.5 ? 'Niña débil' : 'neutro'
/** ONI máximo en los 9 meses previos al mes dado (la crecida llega con retardo) */
function oniPrevio(f) {
  let [y, m] = f.split('-').map(Number), max = -9, min = 9
  for (let k = 0; k < 9; k++) { const v = oni.get(`${y}-${String(m).padStart(2, '0')}`); if (v != null) { max = Math.max(max, v); min = Math.min(min, v) } if (--m === 0) { m = 12; y-- } }
  return max === -9 ? null : Math.abs(max) >= Math.abs(min) ? max : min
}

const era = JSON.parse(readFileSync(fEra, 'utf8')).daily
const e0 = Date.parse(era.time[0] + 'T00:00:00Z')
const lluvia = (f, dias) => { const i = Math.round((Date.parse(f + 'T00:00:00Z') - e0) / 864e5); if (i - dias + 1 < 0 || i >= era.time.length) return null; let s = 0; for (let k = i - dias + 1; k <= i; k++) s += era.precipitation_sum[k] ?? 0; return s }

// Normal de lluvia de 30 y 90 días por día del año (1961-2020), para decir cuánto se aparta
const normal = (f, dias) => { const md = f.slice(5); let s = 0, n = 0; for (let y = 1961; y <= 2020; y++) { const v = lluvia(`${y}-${md === '02-29' ? '02-28' : md}`, dias); if (v != null) { s += v; n++ } } return s / n }

// ── Crecidas: máximo de cada año hidrológico sobre 6,50 m ──
const anios = new Map()
rio.cm.forEach((v, i) => {
  if (v == null) return
  const f = new Date(t0 + i * 864e5).toISOString().slice(0, 10), y = +f.slice(0, 4), m = +f.slice(5, 7), h = m >= 9 ? y + 1 : y
  const a = anios.get(h) ?? { h, max: -1e9, f: '', d650: 0 }; anios.set(h, a)
  if (v > a.max) { a.max = v; a.f = f } if (v >= 650) a.d650++
})
console.log('CRECIDAS >= 6,50 m desde 1950 (ONI existe desde 1950)')
console.log('año | máx | fecha | días>=6,50 | ONI extremo 9 meses previos | fase | ERA5 Resistencia 30 d (normal) | 90 d (normal)')
const filas = [...anios.values()].filter(a => a.max >= 650 && a.h >= 1951).sort((a, b) => a.h - b.h)
const cuenta = {}
for (const a of filas) {
  const o = oniPrevio(a.f.slice(0, 7)), fa = fase(o); cuenta[fa] = (cuenta[fa] ?? 0) + 1
  console.log(`${a.h - 1}/${String(a.h).slice(2)} | ${(a.max / 100).toFixed(2)} | ${a.f} | ${a.d650} | ${o?.toFixed(1)} | ${fa} | ${lluvia(a.f, 30)?.toFixed(0)} (${normal(a.f, 30).toFixed(0)}) | ${lluvia(a.f, 90)?.toFixed(0)} (${normal(a.f, 90).toFixed(0)})`)
}
console.log('fases en crecidas:', JSON.stringify(cuenta))
// Todas las fases en todos los años, para comparar la base
const base = {}; let nA = 0
for (const a of anios.values()) if (a.h >= 1951 && a.h <= 2025) { const fa = fase(oniPrevio(a.f.slice(0, 7))); base[fa] = (base[fa] ?? 0) + 1; nA++ }
console.log('fases en todos los años', nA, JSON.stringify(base))
// Máximo anual medio por fase
const porFase = {}
for (const a of anios.values()) if (a.h >= 1951 && a.h <= 2025) { const fa = fase(oniPrevio(a.f.slice(0, 7))).split(' ')[0]; (porFase[fa] ??= []).push(a.max / 100) }
for (const [k, v] of Object.entries(porFase)) console.log('máximo anual medio', k, 'n', v.length, (v.reduce((s, x) => s + x, 0) / v.length).toFixed(2), 'sobre 6,50:', v.filter(x => x >= 6.5).length)

// ── Lluvia local: los mayores acumulados de ERA5 y el río ese día ──
function mayores(dias, n) {
  const acc = []
  for (let i = dias - 1; i < era.time.length; i++) { let s = 0; for (let k = i - dias + 1; k <= i; k++) s += era.precipitation_sum[k] ?? 0; acc.push([s, i]) }
  acc.sort((a, b) => b[0] - a[0])
  const out = []
  for (const [s, i] of acc) { if (out.every(o => Math.abs(o[1] - i) > Math.max(dias, 20))) out.push([s, i]); if (out.length === n) break }
  return out
}
for (const d of [1, 5, 30]) {
  console.log(`\nMAYORES LLUVIAS ERA5 en ${d} día(s): mm | hasta | altura Barranqueras | ONI`)
  for (const [s, i] of mayores(d, 12)) { const f = era.time[i]; console.log(`${s.toFixed(0)} | ${f} | ${alt(f) ?? 's/d'} | ${fase(oniPrevio(f.slice(0, 7)))}`) }
}
// Control de ERA5 contra tres totales mensuales que publicó la prensa con datos del SMN
const mes = (y, m) => { let s = 0; era.time.forEach((t, i) => { if (t.startsWith(`${y}-${String(m).padStart(2, '0')}`)) s += era.precipitation_sum[i] ?? 0 }); return s }
console.log('\nCONTROL mensual ERA5: ene-2019', mes(2019, 1).toFixed(0), '(SMN 588 al 17/01) · ene-2018', mes(2018, 1).toFixed(0), '(465) · abr-1989', mes(1989, 4).toFixed(0), '(557)')
// Lluvia anual media ERA5
let tot = 0, ny = 0; for (let y = 1961; y <= 2020; y++) { let s = 0; for (let m = 1; m <= 12; m++) s += mes(y, m); tot += s; ny++ } console.log('media anual ERA5 1961-2020', (tot / ny).toFixed(0))
// Días de coincidencia: río >= 6,00 y lluvia de 5 días >= 100 mm
let co = 0; const lista = []
for (let i = 4; i < era.time.length; i++) { const f = era.time[i], a = alt(f); if (a == null || a < 6) continue; let s = 0; for (let k = i - 4; k <= i; k++) s += era.precipitation_sum[k] ?? 0; if (s >= 100) { co++; if (!lista.length || Date.parse(f) - Date.parse(lista.at(-1)[0]) > 15 * 864e5) lista.push([f, a, s.toFixed(0)]) } }
console.log('\nCOINCIDENCIAS río >= 6,00 m con 100 mm o más en 5 días (ERA5):', co, 'días ·', JSON.stringify(lista))
