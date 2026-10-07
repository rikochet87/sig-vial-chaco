/**
 * Verifica el archivo de lluvia de CHIRPS por cuenca,
 * `public/lluvia/chirps_cuencas.json`.
 *
 * No sale a la red. Afirma que el archivo es lo que dice ser —trece series
 * diarias desde 1981, en décimas de milímetro— y que la lluvia que trae se
 * parece a la del Chaco, que se conoce sin estos datos:
 *
 * - llueve más en el este que en el oeste;
 * - llueve en verano y casi nada en invierno;
 * - 2020, 2021 y 2022, los tres años seguidos de La Niña, fueron secos.
 *
 * Con las unidades cruzadas, las fechas corridas un mes o las cuencas en otro
 * orden, eso no cierra.
 *
 * **No afirma que CHIRPS acierte**: es una estimación de satélite. Cuánto se
 * parece a los pluviómetros es otra medición, y está anotada en `lib/chirps.ts`.
 *
 *   npx tsx scripts/verificar-chirps.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  acumulado, csvAnualChirps, cuantil, fechaChirps, frecuenciaVentana, indiceChirps, maximasPorTemporada,
  normalMensual, totalesAnuales, ultimosDoceMeses, VENTANAS_CHIRPS, type ChirpsCuencas,
} from '../src/lib/chirps'

let fallos = 0
const fmt = (v: unknown) =>
  typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(3)) : JSON.stringify(v)

function ok(que: string, valor: unknown, esperado?: unknown) {
  const bien = esperado === undefined ? valor === true : valor === esperado
  if (!bien) fallos++
  console.log(`${bien ? '  ok  ' : '  ✗   '} ${que.padEnd(62)} ${fmt(valor)}`
    + (bien ? '' : `   (esperaba ${fmt(esperado)})`))
}
const info = (s: string) => console.log(`       ${s}`)
const titulo = (s: string) => console.log(`\n— ${s} —`)

// ── El lector, sobre un archivo armado a mano ───────────────────────────────
titulo('El lector')

const mini: ChirpsCuencas = {
  fuente: 'prueba', variable: 'prueba', generado: '2000-01-01', desde: '1999-12-30', hasta: '2000-01-04',
  cuencas: { '1': [100, 0, 50, null, 30, 20] },
}
ok('la fecha de cada posición', fechaChirps(mini, 2), '2000-01-01')
ok('y la posición de cada fecha', indiceChirps(mini, '2000-01-01'), 2)

const tot = totalesAnuales(mini, 1)
ok('el total de cada año, en mm', tot.map(t => `${t.anio}:${t.mm}`).join(' '), '1999:10 2000:10')
ok('un año al que le faltan días no figura como entero', tot.every(t => !t.completo))
ok('una cuenca que no está no tiene totales', totalesAnuales(mini, 9).length, 0)

const ac2 = acumulado(mini, 1, 2)
ok('la ventana de dos días suma el día y el anterior', ac2[1], 10)
ok('el primer día no tiene ventana completa', ac2[0], null)
ok('una ventana con un hueco no da número', ac2[3] === null && ac2[4] === null)
ok('y vuelve a dar cuando el hueco salió', ac2[5], 5)

// ── Temporadas, meses y cuantiles, sobre tres años armados a mano ───────────
titulo('Lo que alimenta la vista «Histórico»')

ok('la mediana de cinco valores es el del medio', cuantil([5, 1, 3, 2, 4], 0.5), 3)
ok('un cuantil entre dos valores se interpola', cuantil([0, 10], 0.8), 8)

/*
 * 2000 a 2002, todo seco salvo 10 mm el 31/12/2000 y 10 mm el 01/01/2001: un
 * solo evento a caballo del cambio de año.
 */
const tresAnios: ChirpsCuencas = {
  fuente: 'prueba', variable: 'prueba', generado: '2003-01-01', desde: '2000-01-01', hasta: '2002-12-31',
  cuencas: { '1': new Array<number | null>(1096).fill(0) },
}
tresAnios.cuencas['1'][indiceChirps(tresAnios, '2000-12-31')] = 100
tresAnios.cuencas['1'][indiceChirps(tresAnios, '2001-01-01')] = 100

const temporadas = maximasPorTemporada(tresAnios, 1, 2)
ok('las temporadas van de julio a junio', temporadas.map(t => t.temporada).join(','), '1999,2000,2001,2002')
ok('y sólo las del medio están enteras', temporadas.filter(t => t.completa).map(t => t.temporada).join(','), '2000,2001')
const t2000 = temporadas.find(t => t.temporada === 2000)!
ok('el evento de fin de año es de una sola temporada', t2000.mm, 20)
ok('con las fechas de la ventana', `${t2000.desde} ${t2000.hasta}`, '2000-12-31 2001-01-01')
ok('y no aparece en la siguiente', temporadas.find(t => t.temporada === 2001)!.mm, 0)
ok('por año calendario, en cambio, queda partido en dos',
  totalesAnuales(tresAnios, 1).map(t => t.mm).join(','), '10,10,0')
ok('con dos temporadas no se informa una frecuencia', frecuenciaVentana(tresAnios, 1, 2), null)

const normal = normalMensual(tresAnios, 1)
ok('doce meses, cada uno con sus tres años', normal.length === 12 && normal.every(m => m.anios === 3))
ok('enero: 0, 10 y 0 mm dan mediana cero', normal[0].mediana, 0)
ok('y nueve de cada diez años quedan bajo 8 mm', normal[0].p90, 8)
ok('el último diciembre es el de 2002', `${normal[11].ultimo?.anio}:${normal[11].ultimo?.mm}`, '2002:0')

const doce = ultimosDoceMeses(tresAnios, 1)!
ok('los doce meses a diciembre de 2002 no juntaron nada', doce.mm, 0)
// 2000 es bisiesto: los 365 días que terminan el 31/12/2000 entran enteros
ok('se comparan contra los que terminan el mismo día de cada año', doce.de, 3)
ok('y quedan últimos, detrás de 2000 y 2001, que tienen 10 mm cada uno', doce.puesto, 3)
ok('un archivo con un hueco en el último año no da número',
  ultimosDoceMeses({ ...tresAnios, cuencas: { '1': tresAnios.cuencas['1'].map((v, i) => (i === 1000 ? null : v)) } }, 1), null)

const csv = csvAnualChirps(tresAnios, [{ cod: 1, nombre: 'Prueba' }]).split('\r\n')
ok('el CSV trae una fila por año entero', csv.slice(-3).join(' | '), '2000;10,0 | 2001;10,0 | 2002;0,0')

// ── El archivo ──────────────────────────────────────────────────────────────
titulo('El archivo')

const c: ChirpsCuencas = JSON.parse(
  readFileSync(join(__dirname, '..', 'public', 'lluvia', 'chirps_cuencas.json'), 'utf8'))
const cods = Object.keys(c.cuencas).map(Number).sort((a, b) => a - b)
const n = Math.round((Date.parse(c.hasta) - Date.parse(c.desde)) / 86_400_000) + 1

info(`${c.desde} a ${c.hasta}: ${n} días · ${cods.length} cuencas`)
ok('están las trece cuencas', cods.join(','), '1,2,3,4,5,6,7,8,9,10,11,12,13')
ok('arranca en 1981', c.desde, '1981-01-01')
ok('todas con un valor por día', cods.every(k => c.cuencas[String(k)].length === n))
ok('décimas de mm enteras, sin negativos',
  cods.every(k => c.cuencas[String(k)].every(v => v === null || (Number.isInteger(v) && v >= 0))))
ok('el último día tiene dato en todas', cods.every(k => c.cuencas[String(k)][n - 1] !== null))

const huecos = cods.map(k => c.cuencas[String(k)].filter(v => v === null).length)
info(`días sin dato por cuenca: ${huecos.join(', ')}`)
ok('a ninguna le falta más del 1 % de los días', huecos.every(h => h < n * 0.01))

const maximos = cods.map(k => Math.max(...c.cuencas[String(k)].map(v => v ?? 0)) / 10)
info(`mayor lámina diaria por cuenca, mm: ${maximos.map(v => v.toFixed(0)).join(', ')}`)
ok('ningún día pasa de 300 mm de media sobre una cuenca', maximos.every(v => v < 300))

titulo('La lluvia que trae se parece a la del Chaco')

const completos = (cod: number) => totalesAnuales(c, cod).filter(t => t.completo)
const media = (cod: number) => { const t = completos(cod); return t.reduce((s, x) => s + x.mm, 0) / t.length }
for (const k of cods) {
  const t = completos(k)
  const mm = t.map(x => x.mm)
  info(`cuenca ${String(k).padStart(2)}: ${t.length} años enteros · media ${media(k).toFixed(0)} mm`
    + ` · de ${Math.min(...mm).toFixed(0)} (${t.find(x => x.mm === Math.min(...mm))!.anio})`
    + ` a ${Math.max(...mm).toFixed(0)} (${t.find(x => x.mm === Math.max(...mm))!.anio})`)
}

ok('hay al menos cuarenta años enteros por cuenca', cods.every(k => completos(k).length >= 40))
ok('todas juntan entre 500 y 1.700 mm por año de media', cods.every(k => media(k) > 500 && media(k) < 1700))

/*
 * El gradiente: el valle del Paraná (12) y el Tragadero (5) están en el este;
 * el Impenetrable (13) y los Bajos de Chorotis (11), en el oeste. La diferencia
 * es de cientos de milímetros y no depende del año.
 */
ok('el este junta más que el oeste: el valle del Paraná más que el Impenetrable', media(12) > media(13) + 200)
ok('y el Tragadero más que los Bajos de Chorotis', media(5) > media(11) + 200)

/* El régimen: en toda la provincia el verano trae varias veces lo del invierno. */
const porMes = (cod: number) => {
  const s = c.cuencas[String(cod)], m = new Array<number>(12).fill(0)
  s.forEach((v, i) => { if (v !== null) m[Number(fechaChirps(c, i).slice(5, 7)) - 1] += v / 10 })
  return m
}
ok('en todas, enero trae al menos el doble que julio', cods.every(k => porMes(k)[0] > 2 * porMes(k)[6]))

/*
 * 2020 a 2022, tres años seguidos de La Niña: la sequía más larga del período
 * reciente. Si las fechas estuvieran corridas no caería ahí.
 */
const trienio = (cod: number) => {
  const t = completos(cod).filter(x => x.anio >= 2020 && x.anio <= 2022)
  return t.reduce((s, x) => s + x.mm, 0) / t.length
}
const secas = cods.filter(k => trienio(k) < media(k))
info(`cuencas con 2020–2022 por debajo de su media: ${secas.length} de ${cods.length}`)
ok('2020 a 2022 quedaron bajo la media en casi todas', secas.length >= 11)

titulo('Diciembre de 2025, el mes sin partes de la APA')

/*
 * Entre el 20 y el 26/12/2025 subieron a la vez el Negro, el Tapenagá y el
 * canal Línea Paraná, y la APA no tiene un solo parte de ese mes. CHIRPS tiene
 * que ver esa lluvia en las tres cuencas, o no serviría para tapar el hueco.
 */
const i26 = indiceChirps(c, '2025-12-26')
for (const k of [6, 8, 10]) {
  const semana = acumulado(c, k, 7)[i26]
  info(`cuenca ${k}: ${semana?.toFixed(0)} mm del 20 al 26/12/2025`)
  ok(`cuenca ${k}: la semana de la crecida trae más de 40 mm`, (semana ?? 0) > 40)
}

titulo('Temporadas, frecuencias y lo normal, sobre el archivo')

/* La temporada se corta en julio porque es el mes más seco: se afirma, no se supone. */
const masSeco = cods.map(k => { const m = porMes(k); return m.indexOf(Math.min(...m)) + 1 })
info(`mes más seco por cuenca: ${masSeco.join(', ')}`)
ok('julio o agosto es el mes más seco en todas', masSeco.every(m => m === 7 || m === 8))

const frec = cods.map(k => VENTANAS_CHIRPS.map(d => frecuenciaVentana(c, k, d)!))
ok('hay frecuencia para las tres ventanas de las trece', frec.every(f => f.every(Boolean)))
info(`temporadas enteras: ${frec[0][0].temporadas}`)
ok('entran al menos cuarenta y cuatro temporadas enteras', frec.every(f => f.every(x => x.temporadas >= 44)))
ok('una de cada dos < una de cada cinco < una de cada diez ≤ la mayor',
  frec.every(f => f.every(x => x.mediana < x.unoEnCinco && x.unoEnCinco < x.unoEnDiez && x.unoEnDiez <= x.mayor.mm)))
ok('más días juntan más: 3 ≤ 7 ≤ 30, en la mediana y en la mayor',
  frec.every(f => f[0].mediana <= f[1].mediana && f[1].mediana <= f[2].mediana
    && f[0].mayor.mm <= f[1].mayor.mm && f[1].mayor.mm <= f[2].mayor.mm))
for (const k of [6, 13]) {
  const f = frec[cods.indexOf(k)][1]
  info(`cuenca ${k}, 7 días: mediana ${f.mediana.toFixed(0)} · 1 de 5 ${f.unoEnCinco.toFixed(0)} · 1 de 10 ${f.unoEnDiez.toFixed(0)}`
    + ` · la mayor ${f.mayor.mm.toFixed(0)} mm, ${f.mayor.desde} a ${f.mayor.hasta}`)
}

/* La semana de diciembre de 2025 tiene que estar en la temporada 2025/26, no partida. */
const t2526 = maximasPorTemporada(c, 6, 7).find(t => t.temporada === 2025)!
info(`Negro - Salado, 2025/26: ${t2526.mm.toFixed(0)} mm en 7 días, ${t2526.desde} a ${t2526.hasta}`)
ok('la mayor semana de 2025/26 en Negro - Salado es al menos la de la crecida',
  t2526.mm >= (acumulado(c, 6, 7)[i26] ?? Infinity))

const normales = cods.map(k => normalMensual(c, k))
ok('cada mes tiene al menos cuarenta y cinco años', normales.every(n => n.every(m => m.anios >= 45)))
ok('p10 ≤ mediana ≤ p90 en todos los meses', normales.every(n => n.every(m => m.p10 <= m.mediana && m.mediana <= m.p90)))
const razon = cods.map((k, i) => normales[i].reduce((s, m) => s + m.mediana, 0) / media(k))
info(`suma de las doce medianas sobre la media anual: de ${Math.min(...razon).toFixed(2)} a ${Math.max(...razon).toFixed(2)}`)
ok('las doce medianas suman algo menos que la media anual', razon.every(r => r > 0.7 && r < 1.02))
ok('el último mes entero es de 2025 o 2026', normales.every(n => n.every(m => m.ultimo !== null && m.ultimo.anio >= 2025)))

const doces = cods.map(k => ultimosDoceMeses(c, k)!)
info(`últimos doce meses, mm: ${doces.map(d => d.mm.toFixed(0)).join(', ')}`)
info(`puesto entre ${doces[0].de}: ${doces.map(d => d.puesto).join(', ')}`)
ok('terminan en el último día del archivo', doces.every(d => d.hasta === c.hasta))
ok('se comparan contra al menos cuarenta y cinco años', doces.every(d => d.de >= 45))
ok('el puesto está entre 1 y la cantidad de años', doces.every(d => d.puesto >= 1 && d.puesto <= d.de))

console.log(fallos === 0 ? '\n✓ Todo bien.' : `\n✗ ${fallos} fallo(s).`)
process.exit(fallos === 0 ? 0 : 1)
