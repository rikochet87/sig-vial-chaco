// ¿Sirve un modelo de elevación de 30 m para decir qué se moja a cierta altura
// del río? Se lo enfrenta al agua observada: si sirve, "terreno por debajo de
// la cota del río" tiene que parecerse a la mancha de ese día.
//   node dem-contra-agua.mjs <traza.geojson> <carpeta de máscaras> <dem.bin>...
import { readFileSync, readdirSync } from 'node:fs'
import { G, aUtm } from './grilla.mjs'

const CERO_IGN = 41.25 // cero de la escala de Barranqueras, cota IGN
const traza = JSON.parse(readFileSync(process.argv[2], 'utf8')).geometry.coordinates
const DIR = process.argv[3]
const dems = process.argv.slice(4).map(f => ({ nombre: f, z: new Float32Array(readFileSync(f).buffer.slice(0)) }))

const puntos = []
for (const l of traza) for (let i = 1; i < l.length; i++) {
  const a = aUtm(...l[i - 1]), b = aUtm(...l[i]), n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 30))
  for (let k = 0; k <= n; k++) puntos.push(Math.floor((G.Y1 - (a[1] + (b[1] - a[1]) * k / n)) / G.PASO) * G.ANCHO + Math.floor((a[0] + (b[0] - a[0]) * k / n - G.X0) / G.PASO))
}
const q = (v, p) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))] }
const f1 = v => v.toFixed(1)

for (const d of dems) {
  console.log('\n══', d.nombre)
  const zc = puntos.map(i => d.z[i]).filter(v => v > 0)
  console.log(`Canal 16, cota del terreno: mín ${f1(Math.min(...zc))} · p10 ${f1(q(zc, 0.1))} · mediana ${f1(q(zc, 0.5))} · p90 ${f1(q(zc, 0.9))} · máx ${f1(Math.max(...zc))}`)
  // de noroeste a sudeste, en ocho tramos
  const tr = []; for (let k = 0; k < 8; k++) { const s = zc.slice(Math.floor(k * zc.length / 8), Math.floor((k + 1) * zc.length / 8)); tr.push(f1(q(s, 0.5))) }
  console.log('  mediana por tramo, de NO a SE:', tr.join(' '))
  for (const h of [7.07, 7.22, 7.80, 8.17, 8.59]) console.log(`  río en ${h} m = cota ${f1(CERO_IGN + h)}: ${Math.round(100 * zc.filter(v => v < CERO_IGN + h).length / zc.length)} % del canal por debajo`)

  console.log('Contra el agua observada (recuadro entero, sólo celdas válidas):')
  for (const arch of readdirSync(DIR).filter(f => f.endsWith('.bin')).sort()) {
    const m = readFileSync(`${DIR}/${arch}`)
    let val = 0, agua = 0
    const za = [], zs = []
    for (let i = 0; i < G.N; i++) { if (!(m[i] & 1) || !(d.z[i] > 0)) continue; val++; if (m[i] & 2) { agua++; if (i % 7 === 0) za.push(d.z[i]) } else if (i % 23 === 0) zs.push(d.z[i]) }
    if (val < G.N * 0.4 || agua < 1000) continue
    // El nivel que mejor separa agua de no agua, y cuánto coincide
    let mejor = { iou: 0, L: 0 }
    for (let L = 40; L <= 56; L += 0.25) {
      let inter = 0, uni = 0
      for (let i = 0; i < G.N; i += 3) { if (!(m[i] & 1) || !(d.z[i] > 0)) continue; const a = (m[i] & 2) > 0, b = d.z[i] < L; if (a && b) inter++; if (a || b) uni++ }
      if (inter / uni > mejor.iou) mejor = { iou: inter / uni, L }
    }
    console.log(`  ${arch.slice(0, 17)}  agua ${f1(agua * G.KM2)} km²  cota del agua: p10 ${f1(q(za, 0.1))} med ${f1(q(za, 0.5))} p90 ${f1(q(za, 0.9))}  | seco: p10 ${f1(q(zs, 0.1))} med ${f1(q(zs, 0.5))}  | mejor corte ${mejor.L} m, coincide ${mejor.iou.toFixed(2)}`)
  }
}
if (dems.length === 2) {
  let n = 0, s = 0, s2 = 0
  for (let i = 0; i < G.N; i += 5) { const a = dems[0].z[i], b = dems[1].z[i]; if (a > 0 && b > 0 && G.enUrbano[i]) { n++; s += a - b; s2 += (a - b) ** 2 } }
  console.log(`\nDiferencia entre los dos modelos en el recuadro urbano: media ${f1(s / n)} m, RMS ${f1(Math.sqrt(s2 / n))} m`)
}
