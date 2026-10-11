/**
 * Verifica el archivo de anegamiento por cuenca,
 * `public/lluvia/anegamiento_cuencas.json`, y su lector.
 *
 * No sale a la red. No hay una superficie anegada oficial contra la cual
 * comparar, así que afirma:
 *
 * - el lector, sobre un archivo armado a mano donde la respuesta se sabe;
 * - que el archivo es lo que dice ser, contra las cuencas de `geo_cuencas.json`;
 * - que los picos caen en crecidas que se conocen por otro lado: enero de 2019
 *   en el este y el sur, y las del Paraná de 2016 y 2023 en su valle;
 * - lo que justifica cómo se lee: que hay una joroba de invierno, y que
 *   sacándola el número sigue a la lluvia de CHIRPS mejor que en bruto.
 *
 * **No afirma que la clasificación acierte**: es automática, sobre imágenes.
 *
 *   npx tsx scripts/verificar-anegamiento.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  anomalias, csvAnegamiento, leerAnegamiento, mayorAnegamiento, MINIMO_DETECTABLE_KM2, normalAnegamiento, quincenaSiguiente,
  quincenasUtiles, RESERVAS, serieAnegamiento, ultimaLectura, VISTO_MINIMO, type AnegamientoCuencas,
} from '../src/lib/anegamiento'
import { acumulado, cuantil, indiceChirps, type ChirpsCuencas } from '../src/lib/chirps'

let fallos = 0
const fmt = (v: unknown) =>
  typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(3)) : JSON.stringify(v)

function ok(que: string, valor: unknown, esperado?: unknown) {
  const bien = esperado === undefined ? valor === true : valor === esperado
  if (!bien) fallos++
  console.log(`${bien ? '  ok  ' : '  ✗   '} ${que.padEnd(66)} ${fmt(valor)}`
    + (bien ? '' : `   (esperaba ${fmt(esperado)})`))
}
const info = (s: string) => console.log(`       ${s}`)
const titulo = (s: string) => console.log(`\n— ${s} —`)

// ── El lector, sobre un archivo armado a mano ───────────────────────────────
titulo('El lector')

ok('la quincena que sigue al 1 empieza el 16', quincenaSiguiente('2019-02-01'), '2019-02-16')
ok('y la que sigue al 16, el 1 del mes siguiente', quincenaSiguiente('2019-12-16'), '2020-01-01')

// Una cuenca de 1.000 km², desde el 16/12/2017. Cuatro eneros: 2018 a 2021.
const quincenasMini = (hasta: string) => { let n = 0; for (let f = '2017-12-16'; f < hasta; f = quincenaSiguiente(f)) n++; return n }
const N = quincenasMini('2021-02-01')
const visto = new Array(N).fill(1000), veg = new Array(N).fill(10)
const pos = (f: string) => quincenasMini(f)
veg[pos('2018-01-01')] = 20; veg[pos('2019-01-01')] = 40; veg[pos('2020-01-01')] = 60; veg[pos('2021-01-01')] = 80
// Media cuenca a la vista, y toda ella clasificada: no tiene que contar
visto[pos('2019-01-16')] = 500; veg[pos('2019-01-16')] = 500
// Justo en el mínimo: cuenta, y se lleva a la cuenca entera
visto[pos('2020-01-16')] = 900; veg[pos('2020-01-16')] = 90
// Sin ninguna imagen
visto[pos('2021-01-16')] = 0; veg[pos('2021-01-16')] = 0
const mini: AnegamientoCuencas = {
  fuente: 'prueba', variable: 'prueba', generado: '2021-02-01', desde: '2017-12-16', hasta: '2021-01-31', escalaM: 30,
  cuencas: { '1': { km2: 1000, visto, veg } },
}
const sm = serieAnegamiento(mini, 1)
ok('una quincena por posición', sm.length, N)
ok('la primera va del 16 al 31 de diciembre', `${sm[0].desde} ${sm[0].hasta}`, '2017-12-16 2017-12-31')
ok('la segunda quincena de febrero termina el 28', sm[pos('2019-02-16')].hasta, '2019-02-28')
ok('y el 29 en un bisiesto', sm[pos('2020-02-16')].hasta, '2020-02-29')
ok('con media cuenca a la vista no hay número', sm[pos('2019-01-16')].km2, null)
ok('sin imágenes tampoco, y no es cero', sm[pos('2021-01-16')].km2, null)
ok('en el mínimo cuenta, llevada a la cuenca entera', Math.round(sm[pos('2020-01-16')].km2 ?? -1), 100)
ok('una cuenca que no está no tiene serie', serieAnegamiento(mini, 9).length, 0)
ok('lo anterior a 2018 no entra en lo normal', quincenasUtiles(sm).every(q => q.anio >= 2018))

// Eneros útiles: 20, 10 · 40 · 60, 100 · 80  →  10 20 40 60 80 100
const enero = normalAnegamiento(sm)[0]
ok('lo normal de enero cuenta las seis quincenas útiles', enero.quincenas, 6)
ok('su mediana', enero.mediana, 50)
ok('un mes parejo tiene la mediana en su valor', normalAnegamiento(sm)[5].mediana, 10)
const l2021 = leerAnegamiento(sm, quincenasUtiles(sm).find(q => q.desde === '2021-01-01')!)
ok('80 km² es la segunda de seis en enero', `${l2021.puesto} de ${l2021.de}`, '2 de 6')
ok('y queda dentro del rango de ocho de cada diez', l2021.contra, 'dentro')
ok('la mayor es la de 100, llevada a la cuenca entera', mayorAnegamiento(sm)?.desde, '2020-01-16')
ok('la última lectura es la última útil, no la última', ultimaLectura(sm)?.quincena.desde, '2021-01-01')
const an = anomalias(sm)
ok('la anomalía es contra la mediana del mes', an.find(x => x.quincena.desde === '2021-01-01')?.km2, 30)
ok('y cero en un mes parejo', an.find(x => x.quincena.desde === '2019-06-01')?.km2, 0)
const csv = csvAnegamiento(mini, [{ cod: 1, nombre: 'Prueba' }]).split('\r\n')
ok('el CSV trae una línea por quincena', csv.length, 4 + N)
ok('y deja vacía la que no se vio', csv[4 + pos('2019-01-16')], '2019-01-16;2019-01-31;;50')

// ── El archivo real ──────────────────────────────────────────────────────────
titulo('El archivo')

const RAIZ = join(__dirname, '..')
const a: AnegamientoCuencas = JSON.parse(readFileSync(join(RAIZ, 'public', 'lluvia', 'anegamiento_cuencas.json'), 'utf8'))
const geo = JSON.parse(readFileSync(join(RAIZ, 'public', 'geo', 'geo_cuencas.json'), 'utf8')) as
  { features: { properties: { cod: number; nombre: string; ha: number } }[] }
const cods = geo.features.map(f => f.properties.cod).sort((x, y) => x - y)

ok('trae las trece cuencas', Object.keys(a.cuencas).map(Number).sort((x, y) => x - y).join(), cods.join())
ok('arranca con la primera quincena de Dynamic World', a.desde, '2015-06-16')
const largos = cods.map(c => a.cuencas[c].veg.length)
ok('todas tienen las mismas quincenas', new Set(largos).size, 1)
ok('y son al menos las 271 que había el 11/10/2026', largos[0] >= 271)
ok('visto y clasificado van de a pares', cods.every(c => a.cuencas[c].visto.length === a.cuencas[c].veg.length))
ok('la superficie es la de geo_cuencas.json',
  geo.features.every(f => Math.abs(a.cuencas[f.properties.cod].km2 - f.properties.ha / 100) < 0.01))
ok('nunca se vio más que la cuenca (con 1 % de holgura)',
  cods.every(c => a.cuencas[c].visto.every(v => v <= a.cuencas[c].km2 * 1.01)))
ok('ni se clasificó más de lo que se vio', cods.every(c => a.cuencas[c].veg.every((v, i) => v <= a.cuencas[c].visto[i])))
const series = new Map(cods.map(c => [c, serieAnegamiento(a, c)]))
const ultima = series.get(6)!.at(-1)!
ok('el archivo termina donde termina su última quincena', a.hasta, ultima.hasta)
ok('y no trae una quincena sin terminar', ultima.hasta < a.generado)

const utilesPorCuenca = cods.map(c => quincenasUtiles(series.get(c)!).length)
ok('cada cuenca tiene más de 140 quincenas útiles desde 2018', Math.min(...utilesPorCuenca) > 140)
info(`útiles por cuenca: ${utilesPorCuenca.join(' ')}`)
const antes = series.get(6)!.filter(q => q.anio < 2018 && q.visto >= VISTO_MINIMO).length
ok('antes de 2018, Negro - Salado tiene menos de diez', antes < 10)
info(`son ${antes}: por eso lo normal se cuenta desde 2018`)

// ── Los picos, contra crecidas que se conocen por otro lado ─────────────────
titulo('Los picos')

// Enero de 2019: 588 mm en Resistencia, el evento de lluvia de la pestaña Gran Resistencia
for (const c of [6, 7, 8, 9, 10]) {
  ok(`la mayor de la cuenca ${c} es la quincena del 16/01/2019`, mayorAnegamiento(series.get(c)!)?.desde, '2019-01-16')
}
// El valle del Paraná lo moja el río: 7,23 m en Barranqueras en 01/2016 y la crecida de 11/2023
const valle = [...quincenasUtiles(series.get(12)!)].sort((x, y) => y.km2 - x.km2).slice(0, 2).map(q => q.desde).sort()
ok('en el valle del Paraná, la crecida de 11/2023 está entre las dos mayores',
  valle.includes('2023-11-01'))
info(`las dos mayores del valle desde 2018: ${valle.join(' y ')}`)
const valleTodo = series.get(12)!.filter(q => q.km2 !== null).sort((x, y) => y.km2! - x.km2!)[0]
ok('y contando lo anterior a 2018, la mayor es la crecida de 2016', valleTodo.desde, '2016-03-01')
ok('el Impenetrable no llega al mínimo detectable', mayorAnegamiento(series.get(13)!)!.km2 < MINIMO_DETECTABLE_KM2)
ok('y es la única', cods.filter(c => mayorAnegamiento(series.get(c)!)!.km2 < MINIMO_DETECTABLE_KM2).join(), '13')
ok('y tiene su reserva escrita', typeof RESERVAS[13] === 'string' && typeof RESERVAS[1] === 'string')

// ── Por qué se lee contra el mismo mes ───────────────────────────────────────
titulo('La joroba de invierno y la lluvia')

const normal6 = normalAnegamiento(series.get(6)!)
const invierno = cuantil([4, 5, 6].map(i => normal6[i].mediana), 0.5), verano = cuantil([9, 10, 0, 1].map(i => normal6[i].mediana), 0.5)
ok('en Negro - Salado, mayo a julio da más del triple que octubre a febrero', invierno > 3 * verano)
info(`medianas: ${normal6.map(m => Math.round(m.mediana)).join(' ')} (enero a diciembre, km²)`)

const chirps: ChirpsCuencas = JSON.parse(readFileSync(join(RAIZ, 'public', 'lluvia', 'chirps_cuencas.json'), 'utf8'))
const pearson = (xs: number[], ys: number[]) => {
  const n = xs.length, mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n
  let sxy = 0, sx = 0, sy = 0
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sx += (xs[i] - mx) ** 2; sy += (ys[i] - my) ** 2 }
  return sxy / Math.sqrt(sx * sy)
}
const rangos = (xs: number[]) => { const r: number[] = []; xs.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]).forEach(([, i], k) => { r[i] = k }); return r }
const spearman = (xs: number[], ys: number[]) => pearson(rangos(xs), rangos(ys))

/** Anegamiento contra la lámina de CHIRPS de los 90 días que terminan con la quincena: en bruto y sin la estación */
function contraLluvia(cod: number) {
  const ac = acumulado(chirps, cod, 90)
  const filas = anomalias(series.get(cod)!).map(x => ({ ...x, mm: ac[indiceChirps(chirps, x.quincena.hasta)] }))
    .filter((x): x is typeof x & { mm: number } => typeof x.mm === 'number')
  const porMes = Array.from({ length: 12 }, (_, m) => cuantil(filas.filter(x => x.quincena.mes === m + 1).map(x => x.mm), 0.5))
  return {
    n: filas.length,
    bruto: spearman(filas.map(x => x.quincena.km2), filas.map(x => x.mm)),
    sinEstacion: spearman(filas.map(x => x.km2), filas.map(x => x.mm - porMes[x.quincena.mes - 1])),
  }
}
const r = new Map(cods.map(c => [c, contraLluvia(c)]))
for (const c of cods) info(`${String(c).padStart(2)}  n ${r.get(c)!.n}  en bruto ${r.get(c)!.bruto.toFixed(2)}  sin la estación ${r.get(c)!.sinEstacion.toFixed(2)}`)
ok('sin la estación sigue a la lluvia mejor que en bruto en diez cuencas o más',
  cods.filter(c => r.get(c)!.sinEstacion > r.get(c)!.bruto).length >= 10)
ok('en Línea Paraná, sin la estación, pasa de 0,6', r.get(10)!.sinEstacion > 0.6)
ok('en bruto, ninguna pasa de 0,6', cods.every(c => r.get(c)!.bruto < 0.6))
ok('Bermejo - Bermejito no sigue a la lluvia de su cuenca', r.get(1)!.sinEstacion < 0.2)

console.log(fallos === 0 ? '\nTodo bien.' : `\n${fallos} afirmaciones fallaron.`)
process.exit(fallos === 0 ? 0 : 1)
