/**
 * Verifica la cadena de crecida en Barranqueras (`src/lib/gr4j.ts` y
 * `src/lib/crecida.ts`). No sale a la red.
 *
 * Tres partes:
 *
 * 1. **GR4J contra `airGR`.** `scripts/gr4j-airgr-referencia.json` tiene el
 *    caudal que da el núcleo Fortran de `airGR` (INRAE), la implementación de
 *    referencia, sobre 1.500 días y cuatro juegos de parámetros. Lo genera
 *    `scripts/referencia_gr4j_airgr.py`. Tiene que dar lo mismo a la
 *    diezmilésima de mm/d. Además, el balance de agua de cada corrida tiene
 *    que cerrar a cero.
 * 2. **Casos que se saben sin calcular**: una respuesta armada a mano se
 *    recupera, la curva va y vuelve, la mezcla con α = 0 es la persistencia.
 * 3. **Sobre los datos reales**, si están (`ons_represas.json`,
 *    `crecida_parametros.json`): el balance de Itaipú cierra, los pesos de la
 *    respuesta suman uno y la cadena mejora a la persistencia en aguas altas.
 *
 *   npx tsx scripts/verificar-crecida.ts
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gr4j, ordenadas, mmDiaAM3s } from '../src/lib/gr4j'
import {
  diaDe, isoDe, lector, minimosCuadrados, ajustarRespuesta, caudalRespuesta, DEMORAS_RESPUESTA,
  armarCurva, alturaDe, caudalDe, alfaEn, proyectarI, nse, kge, type Curva,
} from '../src/lib/crecida'

let fallos = 0
const fmt = (v: unknown) =>
  typeof v === 'number' ? (Number.isInteger(v) ? String(v) : Math.abs(v) < 1e-3 && v !== 0 ? v.toExponential(2) : v.toFixed(4)) : JSON.stringify(v)
function ok(que: string, valor: unknown, esperado?: unknown) {
  const bien = esperado === undefined ? valor === true : valor === esperado
  if (!bien) fallos++
  console.log(`${bien ? '  ok  ' : '  ✗   '} ${que.padEnd(64)} ${fmt(valor)}` + (bien ? '' : `   (esperaba ${fmt(esperado)})`))
}
const cerca = (que: string, valor: number, esperado: number, tol: number) => {
  const bien = Math.abs(valor - esperado) <= tol
  if (!bien) fallos++
  console.log(`${bien ? '  ok  ' : '  ✗   '} ${que.padEnd(64)} ${fmt(valor)}` + (bien ? '' : `   (esperaba ${fmt(esperado)} ± ${tol})`))
}
const titulo = (s: string) => console.log(`\n— ${s} —`)
const RIO = join(__dirname, '..', 'public', 'rio')

// ── 1. GR4J contra airGR ──────────────────────────────────────────────────────
titulo('GR4J contra el núcleo de airGR')

const ref = JSON.parse(readFileSync(join(__dirname, 'gr4j-airgr-referencia.json'), 'utf8'))
for (const c of ref.casos) {
  const r = gr4j(ref.lluvia, ref.etp, { x1: c.x1, x2: c.x2, x3: c.x3, x4: c.x4 })
  let dif = 0
  for (let i = 0; i < c.q.length; i++) dif = Math.max(dif, Math.abs(r.q[i] - c.q[i]))
  cerca(`${c.nombre}: mayor diferencia de caudal (mm/d)`, dif, 0, 1e-4)
  cerca(`${c.nombre}: suelo al final (mm)`, r.estado.s, c.sFinal, 1e-3)
  cerca(`${c.nombre}: tránsito al final (mm)`, r.estado.r, c.rFinal, 1e-3)
  cerca(`${c.nombre}: el balance de agua cierra (mm)`, r.balance.residuo, 0, 1e-6)
}
ok('los casos pasan por intercambio negativo', ref.casos.some((c: { x2: number }) => c.x2 < 0))
ok('y por un x4 de más de una semana', ref.casos.some((c: { x4: number }) => c.x4 > 7))

titulo('Hidrogramas unitarios')
for (const x4 of [0.7, 2.2, 6.5, 19.9]) {
  const { uh1, uh2 } = ordenadas(x4)
  cerca(`x4 = ${x4}: el primero suma 1`, uh1.reduce((a, b) => a + b, 0), 1, 1e-12)
  cerca(`x4 = ${x4}: el segundo suma 1`, uh2.reduce((a, b) => a + b, 0), 1, 1e-12)
}

titulo('Sin lluvia el río sólo baja')
{
  const n = 200
  const r = gr4j(new Array(n).fill(0), new Array(n).fill(3), { x1: 300, x2: 0, x3: 90, x4: 2 })
  let baja = true
  for (let i = 1; i < n; i++) if (r.q[i] > r.q[i - 1] + 1e-12) baja = false
  ok('cada día menos que el anterior', baja)
  cerca('el balance cierra igual', r.balance.residuo, 0, 1e-9)
  cerca('1 mm/d sobre 86,4 km² es 1 m³/s', mmDiaAM3s(1, 86.4), 1, 1e-12)
}

// ── 2. Casos armados a mano ───────────────────────────────────────────────────
titulo('Mínimos cuadrados recupera una recta conocida')
{
  const X: number[][] = [], y: number[] = []
  for (let i = 0; i < 50; i++) { const a = Math.sin(i), b = Math.cos(i * 0.7); X.push([a, b, 1]); y.push(3 * a - 2 * b + 5) }
  const c = minimosCuadrados(X, y)
  cerca('primer coeficiente', c[0], 3, 1e-9); cerca('segundo', c[1], -2, 1e-9); cerca('constante', c[2], 5, 1e-9)
}

titulo('La respuesta se recupera de un río armado')
{
  const N = 3000
  const d0 = diaDe('2000-01-01')
  // Un río con ruido —generador congruencial de semilla fija—: con dos senos
  // los once desfases son casi colineales y la regresión no los separa
  let semilla = 7
  const azar = () => { semilla = (1664525 * semilla + 1013904223) % 4294967296; return semilla / 4294967296 }
  const Iv = Array.from({ length: N }, (_, t) => 15000 + 6000 * Math.sin(t / 37) + 3000 * azar())
  const Pv = Array.from({ length: N }, (_, t) => 3000 + 800 * Math.sin(t / 90 + 1))
  const I = (dia: number) => Iv[dia - d0] ?? null
  const P = (dia: number) => Pv[dia - d0] ?? null
  const media = (dia: number) => { let s = 0; for (let k = 5; k <= 14; k++) s += Pv[dia - d0 - k]; return s / 10 }
  const B = (dia: number) => {
    const t = dia - d0
    if (t < 20 || t >= N) return null
    return 0.3 * Iv[t - 4] + 0.7 * Iv[t - 6] + 1.1 * media(dia) + 1500
  }
  const { respuesta: r } = ajustarRespuesta(I, P, B, d0 + 20, d0 + N)
  const peso = (j: number) => r.pesos[DEMORAS_RESPUESTA.indexOf(j as never)]
  cerca('peso a 4 días', peso(4), 0.3, 1e-6)
  cerca('peso a 6 días', peso(6), 0.7, 1e-6)
  cerca('los pesos suman 1', r.pesos.reduce((a, b) => a + b, 0), 1, 1e-6)
  cerca('coeficiente del Paraguay', r.paraguay, 1.1, 1e-6)
  cerca('aporte fijo', r.constante, 1500, 1e-3)
  cerca('y reproduce el caudal', caudalRespuesta(r, d0 + 500, I, P)!, B(d0 + 500)!, 1e-6)
}

titulo('Curva altura–caudal')
{
  const pares: [number, number][] = []
  for (let h = 1; h <= 7.5; h += 0.01) pares.push([h, 9000 + 3000 * h + 50 * h * h])
  const c: Curva = armarCurva(pares, 0.25, 1, 9)
  let creciente = true
  for (let i = 1; i < c.length; i++) if (!(c[i][0] > c[i - 1][0] && c[i][1] > c[i - 1][1])) creciente = false
  ok('crece en altura y en caudal', creciente)
  for (const h of [2.3, 6.05, 8.6]) cerca(`ida y vuelta en ${h} m`, alturaDe(c, caudalDe(c, h)), h, 1e-9)
  ok('se prolonga hasta el tope pedido', c[c.length - 1][0] >= 9 - 1e-9)
}

titulo('Mezcla con la persistencia')
{
  cerca('α se interpola entre días', alfaEn([[1, 0.2], [5, 0.6]], 3), 0.4, 1e-12)
  cerca('antes del primero, el primero', alfaEn([[1, 0.2], [5, 0.6]], 0), 0.2, 1e-12)
  cerca('después del último, el último', alfaEn([[1, 0.2], [5, 0.6]], 30), 0.6, 1e-12)

  const hoy = diaDe('2020-06-15'), L = hoy - 2
  const medido = (v: number) => (dia: number) => (dia <= L ? v : null)
  const base = {
    hoy, I: medido(30000), itaipu: medido(20000), iguazu: medido(10000), altoParana: medido(8000), incItaipu: medido(12000),
    incModelo: () => 15000, iguazuModelo: () => 9000, razonIguazu: 1,
  }
  const quieto = proyectarI({ ...base, alfa: [[0, 0], [99, 0]] })!
  cerca('con α = 0 es lo último medido', quieto(hoy + 7)!, 30000, 1e-9)
  ok('y hasta el último día medido devuelve lo medido', quieto(L) === 30000)
  // Con α = 1 y el modelo ya corregido al dato, lejos de la corrección queda el modelo
  const conModelo = proyectarI({ ...base, incModelo: () => 12000, iguazuModelo: () => 10000, alfa: [[0, 1], [99, 1]] })!
  cerca('con α = 1 y el modelo igual a lo medido, sigue igual', conModelo(hoy + 10)!, 30000, 1e-9)
}

titulo('Métricas')
{
  const o = [1, 2, 3, 4, 5]
  cerca('NSE perfecto', nse(o, o), 1, 1e-12)
  cerca('NSE del promedio es 0', nse(o, [3, 3, 3, 3, 3]), 0, 1e-12)
  cerca('KGE perfecto', kge(o, o), 1, 1e-12)
  ok('fechas ida y vuelta', isoDe(diaDe('2026-10-16')) === '2026-10-16')
}

// ── 3. Datos reales ───────────────────────────────────────────────────────────
const archivoOns = join(RIO, 'ons_represas.json')
if (existsSync(archivoOns)) {
  titulo('Balance de Itaipú con los datos del ONS')
  const ons = JSON.parse(readFileSync(archivoOns, 'utf8'))
  const s = (k: string, v: string) => lector({ desde: ons.desde, valores: ons.series[k][v] })
  const pri = s('primavera', 'def'), ros = s('rosana', 'def')
  // Lo que larga Itaipú es lo que llega de arriba, dos días después, más lo que escurre de su cuenca propia
  const def = s('itaipu', 'def'), inc = s('itaipu', 'inc')
  const X: number[][] = [], y: number[] = []
  for (let t = diaDe('2008-01-10'); t < diaDe(ons.hasta); t++) {
    const a = pri(t - 2), b = ros(t - 2), c = inc(t), o = def(t)
    if (a !== null && b !== null && c !== null && o !== null) { X.push([a, b, c, 1]); y.push(o) }
  }
  const co = minimosCuadrados(X, y)
  const m = y.reduce((p, q) => p + q, 0) / y.length
  let se = 0, st = 0
  X.forEach((x, i) => { const p = x.reduce((acc, v, j) => acc + v * co[j], 0); se += (y[i] - p) ** 2; st += (y[i] - m) ** 2 })
  ok('Itaipú = Porto Primavera(t−2) + Rosana(t−2) + incremental: R² > 0,95', 1 - se / st > 0.95)
  cerca('el coeficiente de Porto Primavera es ~1', co[0], 1, 0.1)
  cerca('el del incremental es ~1', co[2], 1, 0.1)
}

const archivoParam = join(RIO, 'crecida_parametros.json')
if (existsSync(archivoParam)) {
  titulo('Parámetros congelados')
  const p = JSON.parse(readFileSync(archivoParam, 'utf8'))
  const suma = p.respuesta.pesos.reduce((a: number, b: number) => a + b, 0)
  cerca('los pesos de la respuesta suman ~1: el agua llega entera', suma, 1, 0.1)
  ok('GR4J del Iguazú valida con NSE > 0,6', p.gr4j.iguacu.nseVal > 0.6)
  ok('GR4J de la incremental valida con NSE > 0,5', p.gr4j.itaipu_inc.nseVal > 0.5)
  cerca('la curva da ~27.300 m³/s para el alerta (6,00 m)', caudalDe(p.curva, 6), 27300, 1000)
  const a10 = p.validacion.todo.find((f: { dias: number }) => f.dias === 10)
  ok('en aguas altas, a 10 días la cadena mejora a la persistencia', a10.mejora > 0.2)
  ok('y a 10 días mejora a usar sólo lo medido', a10.mejora > a10.mejoraSoloMedido)
}

console.log(`\n${fallos ? `✗ ${fallos} fallos` : '✓ todo bien'}`)
process.exit(fallos ? 1 : 0)
