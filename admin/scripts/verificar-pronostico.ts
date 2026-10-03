/**
 * Verifica el pronóstico por cuenca (lib/pronostico.ts).
 *
 * No sale a la red, por el mismo motivo que `verificar-wayback.ts`: que
 * Open-Meteo cambie una respuesta no tiene que romper un commit. Lo que se
 * afirma son casos donde la respuesta se sabe sin calcular:
 *
 * - con la misma lluvia en todos los puntos y todas las corridas, toda cuenca
 *   tiene esa lluvia y el rango se cierra;
 * - **el rango se saca después de promediar por corrida**: dos puntos que se
 *   compensan corrida a corrida dan una cuenca sin incertidumbre, aunque cada
 *   punto por separado tenga un rango enorme;
 * - **la ventana de varios días suma por corrida**: no es la suma de los
 *   percentiles de cada día;
 * - la grilla cae adentro de la provincia y toda cuenca recibe algún punto.
 *
 *   npx tsx scripts/verificar-pronostico.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parsearCuencas } from '../src/lib/cuencas'
import { CONTORNO_CHACO } from '../src/data/contornoChaco'
import {
  asignarPuntos, cuantil, grillaEn, laminaPorCorrida, probSuperar, pronosticoPorCuenca, ventana,
  PASO_GRADOS, type Pronostico,
} from '../src/lib/pronostico'

let fallos = 0
const fmt = (v: unknown) =>
  typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(3)) : JSON.stringify(v)
function ok(que: string, valor: unknown, esperado?: unknown) {
  const bien = esperado === undefined ? valor === true : valor === esperado
  if (!bien) fallos++
  console.log(`${bien ? '  ok  ' : '  ✗   '} ${que.padEnd(64)} ${fmt(valor)}`
    + (bien ? '' : `   (esperaba ${fmt(esperado)})`))
}
const info = (s: string) => console.log(`       ${s}`)
const cerca = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol

// ── Percentiles y probabilidades ─────────────────────────────────────────────
console.log('\nPercentiles')
ok('la mediana de [0, 10] es 5 (interpola)', cuantil([0, 10], 0.5), 5)
ok('el p90 de 0..10 es 9', cuantil([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9), 9)
ok('una sola corrida: todos los percentiles son ella', cuantil([7], 0.1) === 7 && cuantil([7], 0.9) === 7)
const cincuentaYUno = { p10: 0, mediana: 0, p90: 0, corridas: Array.from({ length: 51 }, (_, i) => i) }
ok('de 51 corridas 0..50, 26 llegan a 25 mm', cerca(probSuperar(cincuentaYUno, 25), 26 / 51))

// ── Un pronóstico armado a mano ──────────────────────────────────────────────
/** `f(punto, día, corrida)` en mm */
function armar(puntos: { lat: number; lng: number }[], dias: number, corridas: number,
  f: (p: number, d: number, m: number) => number, et0 = 4): Pronostico {
  return {
    modelo: 'prueba', consultado: '', dias: Array.from({ length: dias }, (_, d) => `2026-10-${String(3 + d).padStart(2, '0')}`),
    puntos: puntos.map((pt, p) => ({
      ...pt,
      mm: Array.from({ length: dias }, (_, d) => Array.from({ length: corridas }, (_, m) => Math.round(f(p, d, m) * 10))),
      et0: Array.from({ length: dias }, () => et0 * 10),
    })),
  }
}

console.log('\nPromediar por corrida, después el rango')
{
  // Dos puntos que se compensan: en la corrida m, A recibe 10·m y B 10·(10−m)
  const p = armar([{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }], 1, 11, (pt, _d, m) => (pt === 0 ? 10 * m : 10 * (10 - m)))
  const r = ventana(laminaPorCorrida(p, [0, 1]), 0, 1)!
  ok('cada corrida da 50 mm en la cuenca: p10 = 50', cerca(r.p10, 50))
  ok('y p90 = 50, aunque cada punto tenga p90 = 90', cerca(r.p90, 50))
  const soloA = ventana(laminaPorCorrida(p, [0]), 0, 1)!
  info(`el punto A solo: p10 ${soloA.p10} · p90 ${soloA.p90} — promediar percentiles daría un rango de 10 a 90`)
}

console.log('\nLa ventana suma por corrida')
{
  // Día 1: m mm; día 2: 10−m mm. En toda corrida la suma es 10.
  const p = armar([{ lat: 0, lng: 0 }], 2, 11, (_p, d, m) => (d === 0 ? m : 10 - m))
  const pc = laminaPorCorrida(p, [0])
  const dos = ventana(pc, 0, 2)!
  const p90dia = ventana(pc, 0, 1)!.p90 + ventana(pc, 1, 1)!.p90
  ok('la suma de dos días tiene p90 = 10', cerca(dos.p90, 10))
  info(`sumar el p90 de cada día daría ${p90dia}`)
  ok('una ventana más larga que el pronóstico no da número', ventana(pc, 0, 3), null)
}

// ── Sobre las cuencas reales ─────────────────────────────────────────────────
console.log('\nLa grilla y las cuencas')
const raiz = join(__dirname, '..')
const cuencas = parsearCuencas(JSON.parse(readFileSync(join(raiz, 'public/geo/geo_cuencas.json'), 'utf8')))
const grilla = grillaEn(CONTORNO_CHACO)
info(`${grilla.length} nodos de ${PASO_GRADOS}° dentro de la provincia`)
// 99.633 km² / (27,8 km × 25 km por celda) ≈ 143
ok('entre 120 y 170 nodos', grilla.length >= 120 && grilla.length <= 170)
ok('todos en múltiplos del paso', grilla.every(p => cerca((p.lat / PASO_GRADOS) % 1, 0, 1e-6) || cerca(Math.abs((p.lat / PASO_GRADOS) % 1), 1, 1e-6)))

const asignados = asignarPuntos(cuencas, grilla)
ok('las 13 cuencas reciben al menos un punto', asignados.every(a => a.indices.length > 0))
const prestadas = asignados.filter(a => a.prestado)
info(`con punto prestado del vecino: ${prestadas.map(a => cuencas.find(c => c.cod === a.cod)!.nombre).join(', ') || 'ninguna'}`)
const propios = asignados.reduce((s, a) => s + (a.prestado ? 0 : a.indices.length), 0)
info(`${propios} de ${grilla.length} nodos caen adentro de alguna cuenca`)
ok('ningún nodo en dos cuencas', new Set(asignados.filter(a => !a.prestado).flatMap(a => a.indices)).size === propios)

{
  // Lluvia pareja de 20 mm por día en todo: toda cuenca da 20, 60 y 140
  const p = armar(grilla, 14, 51, () => 20)
  const filas = pronosticoPorCuenca(p, asignados)
  ok('lluvia pareja: mañana da 20 en todas', filas.every(f => cerca(f.manana!.mediana, 20)))
  ok('tres días dan 60', filas.every(f => cerca(f.tres!.mediana, 60)))
  ok('siete días dan 140 y el rango se cierra', filas.every(f => cerca(f.siete!.p10, 140) && cerca(f.siete!.p90, 140)))
  ok('la ET₀ de siete días es 7 × 4 = 28', filas.every(f => cerca(f.et0Siete, 28)))
}

console.log(fallos ? `\n✗ ${fallos} fallo(s).` : '\n✓ Todo bien.')
process.exit(fallos ? 1 : 0)
