// Mide cada capa que el panel muestra, sobre las grillas y no sobre los
// polígonos: superficie fuera del agua de siempre, y cuánto cae sobre lo
// construido hoy dentro del recuadro urbano. El panel no puede calcular esto
// en el navegador —es polígono contra polígono— así que va precalculado.
//   node capas-resumen.mjs <carpeta serie-analizar> <carpeta máscaras Landsat> <carpeta Sentinel-2> <salida.json>
import { readFileSync, writeFileSync } from 'node:fs'
import { G } from './grilla.mjs'

const [, , DIR_SERIE, DIR_L, DIR_S2, SALIDA] = process.argv
const N = G.N
const moja = readFileSync(`${DIR_SERIE}/moja.bin`), hoy = readFileSync(`${DIR_SERIE}/urbano-hoy.bin`)
/** Agua de siempre: lo que se moja con el río a menos de 4 m */
const siempre = i => moja[i] === 1

function medir(esAgua) {
  let km2 = 0, urb = 0, cons = 0
  for (let i = 0; i < N; i++) {
    if (!G.enAoi[i] || !esAgua(i) || siempre(i)) continue
    km2++
    if (G.enUrbano[i]) { urb++; if (hoy[i]) cons++ }
  }
  const r = v => +(v * G.KM2).toFixed(2)
  return { km2: r(km2), urbanoKm2: r(urb), construidoKm2: r(cons) }
}

const out = {}
// Zonas por altura, acumuladas
;[['rio-4', 1], ['rio-5', 2], ['rio-6', 3], ['rio-7', 4]].forEach(([id, k]) => { out[id] = medir(i => moja[i] >= 1 && moja[i] <= k) })
// Landsat: MSS vale 2 = agua; TM vale 2 o 3 = agua por infrarrojo cercano
for (const [id, escena] of [
  ['obs-1982-08-14', 'LM03_L1TP_243079_19820814_02_T2'], ['obs-1983-02-28', 'LM04_L1TP_226079_19830228_02_T2'],
  ['obs-1983-07-22', 'LM04_L1TP_226079_19830722_02_T2'], ['obs-1983-06-20', 'LM04_L1TP_226079_19830620_02_T2'],
  ['obs-1998-05-20', 'LT05_L2SP_226079_19980520_02_T1'], ['obs-2016-01-14', 'LC08_L2SP_226079_20160114_02_T1'],
  ['lluvia-2019-01-22', 'LC08_L2SP_226079_20190122_02_T1'],
]) { const m = readFileSync(`${DIR_L}/mascara_${escena}.bin`); out[id] = medir(i => m[i] === 2 || m[i] === 3) }
// Sentinel-2, a 10 m: una celda de 30 m es agua si lo es la mayoría de sus nueve
const W = G.ANCHO * 3
for (const [id, fecha] of [['obs-2023-11-12', '2023-11-12'], ['obs-2018-01-27', '2018-01-27'], ['lluvia-2019-01-17', '2019-01-17']]) {
  const m = readFileSync(`${DIR_S2}/s2_${fecha}.bin`)
  out[id] = medir(i => { const f = Math.floor(i / G.ANCHO), c = i % G.ANCHO; let a = 0; for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) if (m[(f * 3 + y) * W + c * 3 + x] === 2) a++; return a >= 5 })
}
let cons = 0, urb = 0; for (let i = 0; i < N; i++) if (G.enUrbano[i]) { urb++; if (hoy[i]) cons++ }
out._recuadro = { urbanoKm2: +(urb * G.KM2).toFixed(1), construidoHoyKm2: +(cons * G.KM2).toFixed(1), aoi: G.AOI, urbano: G.URBANO }
writeFileSync(SALIDA, JSON.stringify(out, null, 1))
for (const [k, v] of Object.entries(out)) console.log(k, JSON.stringify(v))
