/**
 * Cuánto tarda la crecida en recorrer el tramo: el desfase, en días, entre cada
 * estación y Corrientes.
 *
 * ── Para qué sirve ────────────────────────────────────────────────────────────
 *
 * Las seis estaciones van de aguas arriba hacia abajo, y lo que hoy se ve en la
 * primera llega después a las otras. Saber **cuánto después** es anticipación
 * que no depende de ningún pronóstico: sale de mirar cómo se movió el río en
 * medio siglo.
 *
 * ── Se mide de dos maneras, y contestan cosas distintas ───────────────────────
 *
 * | | Qué mira | Qué contesta |
 * |---|---|---|
 * | **Variaciones diarias** | la correlación entre lo que subió o bajó cada día en dos estaciones, con desfase | cuánto tarda en llegar un cambio cualquiera |
 * | **Pico anual** | la diferencia entre las fechas del máximo de cada año | cuánto tarda en llegar el máximo de una crecida |
 *
 * No comparten cálculo —una es estadística sobre veinte mil días, la otra una
 * cuenta sobre cincuenta crecidas— y por eso coincidir en el orden y en el
 * signo es verificación, no redundancia. **El pico da un desfase algo mayor**:
 * la cresta de una crecida es chata y se demora más que una variación común.
 * Para una crecida, el que vale es el del pico.
 *
 * ── Por qué se correlacionan los cambios y no las alturas ─────────────────────
 *
 * La altura de hoy se parece muchísimo a la de ayer, así que dos series de
 * alturas correlacionan arriba de 0,9 con cualquier desfase de una semana y el
 * máximo queda en una meseta. El cambio diario no tiene esa memoria: la
 * correlación cae rápido a los costados del desfase verdadero.
 *
 * ── El desfase tiene decimales y la serie es diaria ───────────────────────────
 *
 * La correlación se evalúa en días enteros y el máximo se afina ajustando una
 * parábola por los tres puntos de la cima. Es una estimación del orden de medio
 * día, no una medición: con datos diarios no se puede saber más.
 *
 * ── Qué no afirma ─────────────────────────────────────────────────────────────
 *
 * **Itá Ibaté no ve todo lo que llega a Corrientes.** Entre las dos entra el
 * río Paraguay, así que Corrientes recibe dos ríos e Itá Ibaté mide uno. El
 * desfase se mide bien, pero la correlación es más baja y una crecida que venga
 * por el Paraguay no se anuncia ahí.
 *
 * Y es el tiempo de traslado típico, no un pronóstico de altura: no dice a
 * cuánto va a llegar el río, dice cuándo.
 */

import { anioHidrologico, DIAS_MINIMOS } from './rioHistorico'

/** El archivo que genera `scripts/build_rio_historico.mjs` */
export interface TramoDiario {
  fuente: string
  generado: string
  desde: string
  hasta: string
  /** Estación → id de la serie del INA */
  series: Record<string, number>
  /** Estación → un día por posición desde `desde`, en cm; `null` = sin dato */
  estaciones: Record<string, (number | null)[]>
}

/** La estación contra la que se mide todo */
export const ESTACION_REFERENCIA = 19

/** Desfases que se prueban, en días. Negativo = antes que la referencia */
export const DESFASE_MIN = -6
export const DESFASE_MAX = 10

/**
 * Cuánto pueden diferir dos picos para tomarlos como el mismo evento.
 *
 * Hay años con dos crecidas parecidas, y entonces el máximo de una estación
 * puede caer en la primera y el de la otra en la segunda, con meses de
 * diferencia. Eso no es traslado. Quince días deja entrar cualquier demora real
 * del tramo —la mayor es de unos cinco— y saca los cruces.
 */
export const VENTANA_PICO_DIAS = 15

type Serie = (number | null)[]

const DIA_MS = 86_400_000

/**
 * Correlación entre el cambio diario de `x` y el de `y` corrido `k` días.
 *
 * Con `k` positivo se compara lo que hizo `x` un día con lo que hizo `y` `k`
 * días **después**. Se usan sólo los días en que las dos tienen dato, y el
 * anterior también: un hueco no se rellena.
 */
export function correlacionCambios(x: Serie, y: Serie, k: number): { r: number; n: number } {
  let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0
  const hasta = Math.min(x.length, y.length)
  for (let t = 1; t < hasta; t++) {
    const u = t + k
    if (u < 1 || u >= hasta) continue
    const x1 = x[t], x0 = x[t - 1], y1 = y[u], y0 = y[u - 1]
    if (x1 === null || x0 === null || y1 === null || y0 === null) continue
    const a = x1 - x0, b = y1 - y0
    n++; sx += a; sy += b; sxx += a * a; syy += b * b; sxy += a * b
  }
  if (n < 2) return { r: NaN, n }
  const den = Math.sqrt((sxx - sx * sx / n) * (syy - sy * sy / n))
  return { r: den > 0 ? (sxy - sx * sy / n) / den : NaN, n }
}

export interface DesfaseCambios {
  /** La correlación para cada desfase probado, de `DESFASE_MIN` a `DESFASE_MAX` */
  curva: { k: number; r: number; n: number }[]
  /** El desfase entero de mayor correlación */
  k: number
  /** El desfase afinado con la parábola, en días */
  dias: number
  /** La correlación en el máximo */
  r: number
  /** Días que entraron en la cuenta */
  n: number
}

/**
 * El desfase de `y` respecto de `x` que mejor alinea sus variaciones diarias.
 *
 * Devuelve `null` si no hay días en común suficientes o si el máximo cae en el
 * borde del rango probado: ahí no hay cima, y decir un número sería inventarlo.
 */
export function desfasePorCambios(x: Serie, y: Serie): DesfaseCambios | null {
  const curva: DesfaseCambios['curva'] = []
  for (let k = DESFASE_MIN; k <= DESFASE_MAX; k++) curva.push({ k, ...correlacionCambios(x, y, k) })
  if (curva.some(c => !Number.isFinite(c.r))) return null

  let b = 0
  curva.forEach((c, i) => { if (c.r > curva[b].r) b = i })
  if (b === 0 || b === curva.length - 1) return null

  // Vértice de la parábola por los tres puntos de la cima
  const a = curva[b - 1].r, m = curva[b].r, c = curva[b + 1].r
  const den = a - 2 * m + c
  const frac = den !== 0 ? 0.5 * (a - c) / den : 0

  return { curva, k: curva[b].k, dias: curva[b].k + frac, r: m, n: curva[b].n }
}

export interface DesfasePicos {
  /** Años en que las dos estaciones tienen el año completo */
  anios: number
  /** Los que entraron: el pico de las dos cae dentro de `VENTANA_PICO_DIAS` */
  usados: number
  /** Mediana de la diferencia de fechas, en días */
  mediana: number
  p25: number
  p75: number
}

/** Índice del máximo de cada año hidrológico completo */
function picosAnuales(s: Serie, desde: string): Map<number, number> {
  const t0 = Date.parse(desde + 'T00:00:00Z')
  const mejor = new Map<number, { cm: number; i: number }>()
  const dias = new Map<number, number>()
  for (let i = 0; i < s.length; i++) {
    const cm = s[i]
    if (cm === null) continue
    const anio = anioHidrologico(new Date(t0 + i * DIA_MS).toISOString().slice(0, 10))
    dias.set(anio, (dias.get(anio) ?? 0) + 1)
    const m = mejor.get(anio)
    if (!m || cm > m.cm) mejor.set(anio, { cm, i })
  }
  const picos = new Map<number, number>()
  for (const [anio, m] of mejor) if ((dias.get(anio) ?? 0) >= DIAS_MINIMOS) picos.set(anio, m.i)
  return picos
}

/**
 * Cuántos días después que en `x` cae el máximo anual en `y`.
 *
 * Mediana y cuartiles sobre los años en que las dos tienen el año completo y
 * los picos son del mismo evento. Devuelve `null` con menos de diez años.
 */
export function desfasePorPicos(x: Serie, y: Serie, desde: string): DesfasePicos | null {
  const px = picosAnuales(x, desde)
  const py = picosAnuales(y, desde)
  const todos: number[] = []
  for (const [anio, i] of px) {
    const j = py.get(anio)
    if (j !== undefined) todos.push(j - i)
  }
  const d = todos.filter(v => Math.abs(v) <= VENTANA_PICO_DIAS).sort((a, b) => a - b)
  if (d.length < 10) return null
  const q = (p: number) => d[Math.round(p * (d.length - 1))]
  return { anios: todos.length, usados: d.length, mediana: q(0.5), p25: q(0.25), p75: q(0.75) }
}

export interface TrasladoEstacion {
  estacion: number
  cambios: DesfaseCambios | null
  picos: DesfasePicos | null
  /** Días con dato de esta estación en el archivo */
  dias: number
}

/** El traslado de cada estación del archivo respecto de la de referencia */
export function trasladoDelTramo(t: TramoDiario): TrasladoEstacion[] {
  const ref = t.estaciones[String(ESTACION_REFERENCIA)]
  if (!ref) return []
  return Object.keys(t.estaciones)
    .map(Number)
    .filter(e => e !== ESTACION_REFERENCIA)
    .map(e => {
      const s = t.estaciones[String(e)]
      return {
        estacion: e,
        cambios: desfasePorCambios(ref, s),
        picos: desfasePorPicos(ref, s, t.desde),
        dias: s.filter(v => v !== null).length,
      }
    })
}
