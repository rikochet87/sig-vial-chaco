/**
 * Verifica los archivos de lluvia de ERA5 congelados en `public/lluvia/era5/`.
 *
 * No sale a la red: mira lo que ya está bajado. Afirma que los archivos son lo
 * que dicen ser —los nodos de la grilla, un valor por día y por nodo, en las
 * unidades que se declaran— y que la lluvia que traen se parece a la del
 * Chaco, que se conoce sin estos datos: llueve más al este que al oeste, y
 * entre 500 y 1.800 mm por año.
 *
 * Con las unidades cruzadas (mm en vez de décimas), los ejes dados vuelta o
 * los nodos en otro orden, eso no cierra.
 *
 * **No afirma que ERA5 acierte.** Es un modelo; cuánto se parece a los
 * pluviómetros es otra medición, y ya se sabe que no mucho.
 *
 *   npx tsx scripts/verificar-era5.ts
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CONTORNO_CHACO } from '../src/data/contornoChaco'
import { grillaEn } from '../src/lib/pronostico'
import { fechaDe, laminaDiaria, laminaTotal, type AnioEra5, type IndiceEra5 } from '../src/lib/era5'

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
titulo('La lámina sobre un grupo de nodos')

const mini: AnioEra5 = {
  anio: 2000, modelo: 'prueba', desde: '2000-01-01', hasta: '2000-01-03', dias: 3, nodos: 3,
  //    día 1          día 2             día 3
  mm: [100, 200, 300, 0, null, 50, null, null, null],
}
ok('el promedio de dos nodos, en mm', laminaDiaria(mini, [0, 1])[0], 15)
ok('un nodo sin dato no entra en el promedio', laminaDiaria(mini, [1, 2])[1], 5)
ok('un día sin ningún dato es null, no cero', laminaDiaria(mini, [0, 1, 2])[2], null)
ok('el total suma los días con dato', laminaTotal(mini, [0]), 10)
ok('sin ningún día con dato no hay total', laminaTotal({ ...mini, mm: mini.mm.map(() => null) }, [0]), null)
ok('la fecha de cada día', fechaDe(mini, 2), '2000-01-03')

// ── Los archivos ────────────────────────────────────────────────────────────
titulo('El índice')

const DIR = join(__dirname, '..', 'public', 'lluvia', 'era5')
const indice: IndiceEra5 = JSON.parse(readFileSync(join(DIR, 'indice.json'), 'utf8'))
const grilla = grillaEn(CONTORNO_CHACO)
const anios = Object.keys(indice.anios).map(Number).sort((a, b) => a - b)

info(`${indice.modelo} · ${indice.nodos.length} nodos · ${anios.length} año(s): ${anios[0]} a ${anios[anios.length - 1]}`)
ok('es ERA5 solo, no la mezcla de modelos', indice.modelo, 'era5')
ok('los nodos son los de la grilla del pronóstico, en el mismo orden',
  indice.nodos.length === grilla.length && indice.nodos.every((n, i) => n.lat === grilla[i].lat && n.lng === grilla[i].lng))
ok('hay al menos un año', anios.length > 0)
ok('cada año del índice tiene su archivo', anios.every(a => existsSync(join(DIR, `${a}.json`))))

titulo('Cada año')

const N = indice.nodos.length
const este = indice.nodos.map((n, i) => (n.lng > -59.5 ? i : -1)).filter(i => i >= 0)
const oeste = indice.nodos.map((n, i) => (n.lng < -61.5 ? i : -1)).filter(i => i >= 0)
const todos = indice.nodos.map((_, i) => i)
const bisiesto = (a: number) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0
const leidos = new Map<number, AnioEra5>()

for (const anio of anios) {
  const a: AnioEra5 = JSON.parse(readFileSync(join(DIR, `${anio}.json`), 'utf8'))
  leidos.set(anio, a)
  const en = indice.anios[String(anio)]
  const total = laminaTotal(a, todos) ?? 0
  const tE = laminaTotal(a, este) ?? 0, tO = laminaTotal(a, oeste) ?? 0
  let max = 0
  for (const v of a.mm) if (v !== null && v > max) max = v
  info(`${anio}: ${a.desde} a ${a.hasta}, ${a.dias} días · provincia ${total.toFixed(0)} mm`
    + ` · este ${tE.toFixed(0)} · oeste ${tO.toFixed(0)} · mayor día en un nodo ${(max / 10).toFixed(0)} mm`)

  ok(`${anio}: un valor por día y por nodo`, a.mm.length, a.dias * N)
  ok(`${anio}: el archivo y el índice dicen lo mismo`,
    a.anio === anio && a.nodos === N && a.hasta === en.hasta && a.dias === en.dias && a.modelo === indice.modelo)
  ok(`${anio}: empieza el 1º de enero y las fechas cierran`,
    a.desde === `${anio}-01-01` && fechaDe(a, a.dias - 1) === a.hasta)
  ok(`${anio}: décimas de mm enteras, sin negativos`,
    a.mm.every(v => v === null || (Number.isInteger(v) && v >= 0)))
  ok(`${anio}: el último día tiene dato`, laminaDiaria(a, todos)[a.dias - 1] !== null)
  ok(`${anio}: ningún día pasa de 400 mm en un nodo`, max < 4000)

  if (en.completo) {
    ok(`${anio}: el año entero son ${bisiesto(anio) ? 366 : 365} días`, a.dias, bisiesto(anio) ? 366 : 365)
    ok(`${anio}: no le falta ningún valor`, a.mm.every(v => v !== null))
    /*
     * Lo que se sabe del Chaco sin mirar estos datos: de unos 600 mm en el
     * oeste a 1.300 en el este. Los márgenes son anchos a propósito —un año
     * seco o uno Niño se van lejos de la media— y aun así atrapan un archivo
     * en milímetros en vez de décimas, que daría diez veces menos.
     */
    ok(`${anio}: la provincia junta entre 500 y 1.800 mm`, total > 500 && total < 1800)
    ok(`${anio}: llueve más al este que al oeste`, tE > tO)
  } else {
    ok(`${anio}: es el año en curso, incompleto`, anio === Math.max(...anios) && a.dias < 366)
  }
}

/*
 * El evento que la APA no tiene: entre el 20 y el 26/12/2025 subieron a la vez
 * el Negro, el Tapenagá y el canal Línea Paraná, y no hay un solo parte de ese
 * mes. Si ERA5 tampoco lo viera, sería una fuente que no sirve para tapar ese
 * hueco. Lo ve.
 */
const a2025 = leidos.get(2025)
if (a2025) {
  titulo('Diciembre de 2025, el mes sin partes de la APA')
  const serie = laminaDiaria(a2025, todos)
  const dia = (f: string) => Math.round((Date.parse(f) - Date.parse(a2025.desde)) / 86_400_000)
  let suma = 0
  for (let d = dia('2025-12-20'); d <= dia('2025-12-26'); d++) suma += serie[d] ?? 0
  let previa = 0
  for (let d = dia('2025-12-10'); d <= dia('2025-12-16'); d++) previa += serie[d] ?? 0
  info(`media de la provincia: ${suma.toFixed(0)} mm del 20 al 26/12, ${previa.toFixed(0)} mm del 10 al 16/12`)
  ok('la semana de la crecida trae lluvia: más de 30 mm de media', suma > 30)
}

console.log(fallos === 0 ? '\n✓ Todo bien.' : `\n✗ ${fallos} fallo(s).`)
process.exit(fallos === 0 ? 0 : 1)
