/**
 * Cuánto tarda la crecida en recorrer el tramo: el desfase, en días, entre cada
 * estación y **Barranqueras**.
 *
 * ── La referencia es Barranqueras ─────────────────────────────────────────────
 *
 * Hasta el 08/10/2026 todo se medía contra Corrientes, que tiene la media
 * diaria más larga del tramo. Se cambió porque **la escala que decide en el
 * Gran Resistencia es la de Barranqueras**: es la de los umbrales de este lado
 * y la del registro histórico, y la pregunta que se hace es «cuántos días antes
 * que acá». Corrientes, que está enfrente, queda en la tabla como control: su
 * desfase tiene que dar cero, y si no da cero alguna serie tiene las fechas
 * corridas. Las dos series arrancan en 1970, así que no se pierde período.
 *
 * ── Para qué sirve ────────────────────────────────────────────────────────────
 *
 * Las diez escalas del Paraná van de aguas arriba hacia abajo, de Posadas a
 * Goya, y lo que hoy se ve en las primeras llega después a las otras. Saber **cuánto después** es anticipación
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
 * **Itá Ibaté no ve todo lo que llega a Barranqueras.** Entre las dos entra el
 * río Paraguay, así que Barranqueras recibe dos ríos e Itá Ibaté mide uno. El
 * desfase se mide bien, pero la correlación es más baja y una crecida que venga
 * por el Paraguay no se anuncia ahí.
 *
 * Y es el tiempo de traslado típico, no un pronóstico de altura: no dice a
 * cuánto va a llegar el río, dice cuándo.
 *
 * ── El río Paraguay no es una estación más del tramo ──────────────────────────
 *
 * Se sumaron Puerto Pilcomayo y Puerto Bermejo esperando que anunciaran a
 * Barranqueras como lo hace Itá Ibaté, y **no lo hacen**. Medido con los dos
 * métodos de arriba, sus variaciones diarias casi no correlacionan con las de
 * Barranqueras y en más de la mitad de los años su máximo anual es otra
 * crecida, a meses de distancia: el Paraguay crece en invierno, con el agua
 * del Pantanal, y el Paraná en verano. Puerto Formosa, que se sumó el
 * 08/10/2026, dice lo mismo.
 *
 * Lo que sí se le puede medir es **el aporte**: qué parte de lo que
 * Barranqueras hace *y que Itá Ibaté no explica* se parece a lo que hizo el
 * Paraguay unos días antes. Es `aporteNoExplicado()`, más abajo, y se mide sobre cambios de
 * quince días porque el Paraguay es un río lento: de un día para el otro se
 * mueve un par de centímetros y eso se pierde en el ruido.
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
  /** Lo mismo para las del río Paraguay, que no son del tramo */
  paraguay?: Record<string, (number | null)[]>
  /** Y para el Bermejo en El Colorado, que desemboca en el Paraguay */
  bermejo?: Record<string, (number | null)[]>
}

/** La estación contra la que se mide todo: Barranqueras */
export const ESTACION_REFERENCIA = 20

/** La que está enfrente: su desfase tiene que dar cero */
export const ESTACION_CONTROL = 19

/** La del Paraná aguas arriba de la confluencia con el Paraguay */
export const ESTACION_ARRIBA = 16

/**
 * Desfases que se prueban, en días. Negativo = antes que la referencia.
 *
 * Hacia atrás llega a doce desde que entraron Posadas e Ituzaingó: con −6, una
 * escala que se adelantara siete días quedaría en el borde y sin número.
 */
export const DESFASE_MIN = -12
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

// ── El río Paraguay ──────────────────────────────────────────────────────────

/**
 * Sobre cuántos días se mide el cambio para buscar el aporte del Paraguay.
 *
 * Con cambios de un día el Paraguay no se ve: se mueve muy poco por día. La
 * correlación crece al alargar la ventana, sin que el desfase se corra. Quince
 * días es además del orden de lo que dura la subida de una crecida suya.
 */
export const VENTANA_APORTE_DIAS = 15

/** Desfases que se prueban para el aporte. Negativo = antes que la referencia */
export const APORTE_MIN = -25
export const APORTE_MAX = 10

/** Cuánto cambió la serie en `w` días. `null` si falta alguna de las dos puntas */
export function cambioEn(s: Serie, w: number): Serie {
  return s.map((v, t) => {
    const antes = t >= w ? s[t - w] : null
    return v === null || antes === null ? null : v - antes
  })
}

/** Correlación entre `x` y `y` corrida `k` días: `x[t]` contra `y[t + k]` */
export function correlacionCorrida(x: Serie, y: Serie, k: number): { r: number; n: number } {
  let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0
  const hasta = Math.min(x.length, y.length)
  for (let t = 0; t < hasta; t++) {
    const u = t + k
    if (u < 0 || u >= hasta) continue
    const a = x[t], b = y[u]
    if (a === null || b === null) continue
    n++; sx += a; sy += b; sxx += a * a; syy += b * b; sxy += a * b
  }
  if (n < 2) return { r: NaN, n }
  const den = Math.sqrt((sxx - sx * sx / n) * (syy - sy * sy / n))
  return { r: den > 0 ? (sxy - sx * sy / n) / den : NaN, n }
}

/** La serie corrida: en `t`, lo que valía en `t + k` */
const corrida = (s: Serie, k: number): Serie => s.map((_, t) => s[t + k] ?? null)

/**
 * Con qué desfases entra la estación de aguas arriba en el ajuste.
 *
 * **Con uno solo no alcanza, y se midió** (con Corrientes de referencia, antes
 * del cambio a Barranqueras; los controles del test siguen dando lo mismo con
 * Barranqueras). Ajustando Corrientes contra Itá Ibaté dos días antes —su
 * desfase— el resto correlaciona 0,42 con la propia
 * Itá Ibaté de diez días antes: la onda se aplasta al viajar, y lo que entró
 * en dos días por una punta sale repartido en más por la otra. Ese resto se
 * parecía a cualquier cosa que se moviera despacio, y le daba a Puerto Bermejo
 * cuatro días de adelanto que no tiene. Con estos seis el resto queda sin
 * relación con Itá Ibaté en todos ellos, y a los diez días correlaciona 0,07.
 */
export const DESFASES_ARRIBA = [-1, -2, -3, -4, -6, -8]

/**
 * Mínimos cuadrados de `y` contra las columnas `xs` más una constante, sobre
 * los días en que están todas. Devuelve `null` si no se puede resolver.
 */
function ajustar(y: Serie, xs: Serie[]): { r2: number; resto: Serie; n: number } | null {
  const p = xs.length + 1
  const a = Array.from({ length: p }, () => new Array<number>(p + 1).fill(0))
  const filas: number[] = []
  for (let t = 0; t < y.length; t++) {
    const yt = y[t]
    if (yt === null || xs.some(x => x[t] === null)) continue
    filas.push(t)
    const v = [1, ...xs.map(x => x[t] as number)]
    for (let i = 0; i < p; i++) {
      for (let j = 0; j < p; j++) a[i][j] += v[i] * v[j]
      a[i][p] += v[i] * yt
    }
  }
  if (filas.length <= p) return null

  // Gauss-Jordan con pivote parcial sobre las ecuaciones normales
  for (let c = 0; c < p; c++) {
    let m = c
    for (let f = c + 1; f < p; f++) if (Math.abs(a[f][c]) > Math.abs(a[m][c])) m = f
    if (Math.abs(a[m][c]) < 1e-9) return null
    ;[a[c], a[m]] = [a[m], a[c]]
    for (let f = 0; f < p; f++) {
      if (f === c) continue
      const q = a[f][c] / a[c][c]
      for (let j = c; j <= p; j++) a[f][j] -= q * a[c][j]
    }
  }
  const coef = a.map((fila, i) => fila[p] / fila[i])

  const resto: Serie = new Array(y.length).fill(null)
  let sy = 0, syy = 0, sse = 0
  for (const t of filas) {
    const yt = y[t] as number
    const r = yt - coef[0] - xs.reduce((s, x, j) => s + coef[j + 1] * (x[t] as number), 0)
    resto[t] = r
    sse += r * r; sy += yt; syy += yt * yt
  }
  const total = syy - sy * sy / filas.length
  if (!(total > 0)) return null
  return { r2: 1 - sse / total, resto, n: filas.length }
}

export interface Aporte {
  /** Qué parte del cambio de la referencia explica la de aguas arriba sola (R²) */
  explicadoSin: number
  /** Y sumando la otra estación en su mejor desfase, sobre los mismos días */
  explicadoCon: number
  /** La correlación del resto con la otra estación, por desfase */
  curva: { k: number; r: number; n: number }[]
  /** El desfase de mayor correlación, en días. Negativo = antes */
  k: number
  r: number
  n: number
  /** Entre qué desfases la correlación queda a menos del 10 % de la máxima */
  desde: number
  hasta: number
}

/**
 * Cuánto de lo que la referencia hace, y que la estación de aguas arriba no
 * explica, se parece a lo que hizo `otra`, y con qué desfase.
 *
 * Tres pasos, todos sobre cambios de `VENTANA_APORTE_DIAS`:
 *
 * 1. Se ajusta el cambio de la referencia contra el de `arriba` en los
 *    desfases de `DESFASES_ARRIBA`.
 * 2. Lo que ese ajuste no explica es el resto.
 * 3. Se correlaciona el resto con el cambio de `otra`, desfase por desfase.
 *
 * **La cima es ancha y por eso se informa un rango.** Las ventanas de quince
 * días se pisan entre sí, así que la correlación cambia despacio de un desfase
 * al siguiente: el máximo dice alrededor de cuándo, no qué día. Por lo mismo,
 * los `n` días que entran no son `n` observaciones independientes.
 *
 * Es una descripción de cómo se movieron los dos ríos, no un modelo: no dice
 * cuántos centímetros va a subir Barranqueras por una crecida del Paraguay.
 */
export function aporteNoExplicado(ref: Serie, arriba: Serie, otra: Serie): Aporte | null {
  const dRef = cambioEn(ref, VENTANA_APORTE_DIAS)
  const dArr = cambioEn(arriba, VENTANA_APORTE_DIAS)
  const dOtra = cambioEn(otra, VENTANA_APORTE_DIAS)
  const columnas = DESFASES_ARRIBA.map(k => corrida(dArr, k))

  const base = ajustar(dRef, columnas)
  if (!base) return null

  const curva: Aporte['curva'] = []
  for (let k = APORTE_MIN; k <= APORTE_MAX; k++) curva.push({ k, ...correlacionCorrida(base.resto, dOtra, k) })
  if (curva.some(c => !Number.isFinite(c.r))) return null

  let b = 0
  curva.forEach((c, i) => { if (c.r > curva[b].r) b = i })
  if (b === 0 || b === curva.length - 1) return null

  // Hasta dónde se extiende la cima, a cada lado y sin saltar
  const piso = curva[b].r * 0.9
  let i0 = b, i1 = b
  while (i0 > 0 && curva[i0 - 1].r >= piso) i0--
  while (i1 < curva.length - 1 && curva[i1 + 1].r >= piso) i1++

  // Los dos R² sobre los mismos días, o no se pueden comparar
  const deOtra = corrida(dOtra, curva[b].k)
  const con = ajustar(dRef, [...columnas, deOtra])
  const sin = ajustar(dRef.map((y, t) => (deOtra[t] === null ? null : y)), columnas)
  if (!con || !sin) return null

  return {
    explicadoSin: sin.r2, explicadoCon: con.r2, curva,
    k: curva[b].k, r: curva[b].r, n: curva[b].n,
    desde: curva[i0].k, hasta: curva[i1].k,
  }
}

export interface TrasladoParaguay extends TrasladoEstacion {
  aporte: Aporte | null
}

/**
 * Las escalas de un afluente contra Barranqueras: los dos métodos del tramo,
 * que acá sirven para mostrar que **no** es un traslado, y el aporte.
 */
function aportesDe(t: TramoDiario, grupo: Record<string, Serie> | undefined): TrasladoParaguay[] {
  const ref = t.estaciones[String(ESTACION_REFERENCIA)]
  const arriba = t.estaciones[String(ESTACION_ARRIBA)]
  if (!ref || !arriba || !grupo) return []
  return Object.keys(grupo).map(Number).map(e => {
    const s = grupo[String(e)]
    return {
      estacion: e,
      cambios: desfasePorCambios(ref, s),
      picos: desfasePorPicos(ref, s, t.desde),
      aporte: aporteNoExplicado(ref, arriba, s),
      dias: s.filter(v => v !== null).length,
    }
  })
}

/** Las del río Paraguay: Puerto Pilcomayo, Puerto Formosa y Puerto Bermejo */
export function trasladoDelParaguay(t: TramoDiario): TrasladoParaguay[] {
  return aportesDe(t, t.paraguay)
}

/**
 * El Bermejo en El Colorado, antes de desembocar en el Paraguay.
 *
 * Se le mide lo mismo que al Paraguay —por el que pasa su agua antes de llegar
 * a la confluencia—, sobre lo que Itá Ibaté no explica. Es un río de otro
 * régimen —crece con las lluvias de verano en la alta cuenca, en Salta y
 * Bolivia— y pesa poco en caudal: un 2,4 % del que pasa frente a Barranqueras,
 * hasta un 6 % en marzo (`lib/rioCaudales.ts`). Tiene media diaria desde 2001 y
 * se carga con meses de atraso.
 *
 * **Medido el 08/10/2026, en la altura de Barranqueras no se distingue**: la
 * correlación sobre lo que Itá Ibaté no explica es 0,11, y sumarlo no mueve lo
 * explicado (0,91 → 0,91). Su agua llega mezclada con la del Paraguay, que
 * pesa siete veces más, y la escala de El Colorado mide un río de cauce móvil.
 * Se muestra igual, con el número, para que se vea que se miró.
 */
export function trasladoDelBermejo(t: TramoDiario): TrasladoParaguay[] {
  return aportesDe(t, t.bermejo)
}
