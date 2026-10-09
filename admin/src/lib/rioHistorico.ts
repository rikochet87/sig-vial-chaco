/**
 * El Paraná en Barranqueras, mirado sobre 120 años: máximos anuales,
 * recurrencia y permanencia.
 *
 * ── Barranqueras, y de dónde sale su serie larga ──────────────────────────────
 *
 * Barranqueras es la que decide en el área metropolitana: sus umbrales son los
 * que valen de este lado del río. **Todo lo de este módulo está en metros de la
 * escala de Barranqueras y se compara contra los umbrales de Barranqueras.**
 *
 * Hasta el 06/10/2026 esto se calculaba con la escala de Corrientes, porque la
 * media diaria de Barranqueras arranca en 1970 y la de Corrientes en 1901. Las
 * dos están enfrentadas y la frecuencia de las crecidas es la misma, pero los
 * metros no se trasladan —cada escala tiene su cero— y los umbrales tampoco:
 * la pantalla contestaba cada cuánto se supera el alerta *de Corrientes*.
 *
 * La serie larga de Barranqueras existe, en otra serie del INA: las lecturas
 * directas de la escala, desde el 02/03/1906 y a razón de una por día. Donde
 * las dos series existen, coinciden al centímetro. El archivo las junta con una
 * sola regla —la media diaria donde existe, y si no la lectura del día—; el
 * detalle y la comprobación están en `scripts/build_rio_barranqueras.mjs`.
 *
 * ── Qué afirma y qué no ───────────────────────────────────────────────────────
 *
 * Hay dos clases de número acá y conviene no mezclarlas:
 *
 * - **Lo contado**: en cuántos años se superó una altura, qué porcentaje de los
 *   días el río estuvo por encima, cuándo fue la última vez. Sale de contar
 *   sobre lo medido y no supone nada.
 * - **Lo ajustado**: la altura de 50 o 100 años de recurrencia. Sale de una
 *   distribución de Gumbel ajustada a los máximos anuales, y es una
 *   extrapolación: se informa con su error.
 *
 * Donde las dos responden lo mismo —cada cuánto se supera el alerta— se
 * muestran las dos. Si difieren, la contada es la que pasó.
 *
 * ── El año hidrológico ────────────────────────────────────────────────────────
 *
 * De septiembre a agosto, nombrado por el año en que termina. Con el año
 * calendario, una crecida que arranca en diciembre y culmina en julio —la de
 * 1982/83— aporta el máximo de dos años seguidos y la muestra deja de ser de
 * eventos independientes. Septiembre es el mes con menos picos del registro:
 * uno en 125 años, igual que agosto.
 *
 * ── El régimen cambió, y hay que decir con qué período se calcula ─────────────
 *
 * Medido sobre esta serie: el **mínimo** anual promedia 0,79 m hasta 1970 y
 * 1,96 m desde 1971. El río dejó de bajar como bajaba — coincide con la
 * regulación por los embalses de aguas arriba. Con los **máximos** el cambio es
 * menos claro: 5,61 m hasta 1970, 6,35 entre 1971 y 2000, y 5,69 desde 2001.
 *
 * Por eso todo se puede calcular sobre la serie completa o sólo desde 1971, y
 * la pantalla dice cuál se está mirando. Es el mismo criterio que con los
 * kilómetros de red: hay dos números y hay que decir cuál es.
 */

/** El archivo que genera `scripts/build_rio_barranqueras.mjs` */
export interface SerieDiariaRio {
  estacion: number
  /** La serie de altura media diaria */
  serie: number
  /** La de lecturas de la escala, de donde sale lo que la media diaria no tiene */
  serieLecturas?: number
  /** De qué serie salió cada parte del registro */
  origen?: {
    /** Desde qué fecha existe la media diaria; antes, todo son lecturas */
    mediaDesde: string
    deMedia: number
    deLecturaAntes: number
    deLecturaDespues: number
    /** Días en que existen las dos series, y cuánto difieren ahí */
    comunes: number
    sesgoCm: number
    maeCm: number
  }
  fuente: string
  generado: string
  /** Fecha del primer elemento de `cm` */
  desde: string
  hasta: string
  /** Un día por posición, en centímetros sobre el cero de escala; `null` = sin dato */
  cm: (number | null)[]
}

/** Mes en que arranca el año hidrológico */
export const MES_INICIO = 9

/**
 * Días con dato que tiene que tener un año para que su máximo cuente.
 *
 * Con menos, el pico pudo haber caído en el hueco. Deja afuera 1905/06 —el
 * registro arranca en marzo—, 1911/12, 1989/90 y 1990/91 —327 y 319 días— y el
 * año en curso; 2009/10, al que le falta enero entero, queda adentro con 335.
 *
 * **1989/90 es una crecida grande que no entra en el ajuste**: lo que hay de
 * ese año llega a 7,66 m. La pantalla lo lista entre los incompletos.
 */
export const DIAS_MINIMOS = 330

/** Desde qué año hidrológico cuenta el período reciente */
export const ANIO_REGIMEN = 1971

export type PeriodoRio = 'completo' | 'reciente'

const DIA_MS = 86_400_000

/** La fecha del día `i` de la serie, 'AAAA-MM-DD' */
export function fechaDe(s: SerieDiariaRio, i: number): string {
  return new Date(Date.parse(s.desde + 'T00:00:00Z') + i * DIA_MS).toISOString().slice(0, 10)
}

/** El año hidrológico de una fecha: el año en que termina */
export function anioHidrologico(fecha: string): number {
  const anio = Number(fecha.slice(0, 4))
  return Number(fecha.slice(5, 7)) >= MES_INICIO ? anio + 1 : anio
}

/** 1983 → '1982/83' */
export const etiquetaAnio = (anio: number) =>
  `${anio - 1}/${String(anio % 100).padStart(2, '0')}`

export interface AnioRio {
  /** Año hidrológico, por el año en que termina */
  anio: number
  /** Días con dato */
  dias: number
  /** Si alcanza `DIAS_MINIMOS` y por lo tanto entra en el ajuste */
  completo: boolean
  max: number
  fechaMax: string
  min: number
  fechaMin: string
  /** Días en que la altura igualó o superó cada umbral pedido, en el mismo orden */
  diasSobre: number[]
}

/**
 * El máximo y el mínimo de cada año hidrológico.
 *
 * Los años incompletos **se devuelven marcados, no se tiran**: la pantalla
 * tiene que poder decir cuáles quedaron afuera del ajuste y por qué.
 */
export function extremosAnuales(s: SerieDiariaRio, umbrales: number[] = []): AnioRio[] {
  const porAnio = new Map<number, AnioRio>()
  const t0 = Date.parse(s.desde + 'T00:00:00Z')

  for (let i = 0; i < s.cm.length; i++) {
    const cm = s.cm[i]
    if (cm === null) continue
    const m = cm / 100
    const fecha = new Date(t0 + i * DIA_MS).toISOString().slice(0, 10)
    const anio = anioHidrologico(fecha)

    let a = porAnio.get(anio)
    if (!a) {
      a = { anio, dias: 0, completo: false, max: m, fechaMax: fecha, min: m, fechaMin: fecha,
        diasSobre: umbrales.map(() => 0) }
      porAnio.set(anio, a)
    }
    a.dias++
    if (m > a.max) { a.max = m; a.fechaMax = fecha }
    if (m < a.min) { a.min = m; a.fechaMin = fecha }
    for (let u = 0; u < umbrales.length; u++) if (m >= umbrales[u]) a.diasSobre[u]++
  }

  const lista = [...porAnio.values()].sort((a, b) => a.anio - b.anio)
  for (const a of lista) a.completo = a.dias >= DIAS_MINIMOS
  return lista
}

/** Los años que entran en un período */
export function delPeriodo(anios: AnioRio[], periodo: PeriodoRio): AnioRio[] {
  return periodo === 'reciente' ? anios.filter(a => a.anio >= ANIO_REGIMEN) : anios
}

// ── Gumbel ───────────────────────────────────────────────────────────────────

/** Constante de Euler-Mascheroni */
const EULER = 0.5772156649

export interface Gumbel {
  n: number
  media: number
  desvio: number
  /** Parámetro de posición: la moda */
  u: number
  /** Parámetro de escala */
  alfa: number
}

/**
 * Ajusta una distribución de Gumbel a los máximos anuales, por momentos.
 *
 * Es el método de manual para máximos anuales y el que alguien puede rehacer
 * con una calculadora: la escala sale del desvío y la posición de la media. Se
 * probó también por momentos L, que pesa menos los extremos: la altura de 100
 * años cambia de 8,96 a 9,10 m, menos que su propio error.
 *
 * Devuelve `null` con menos de diez años: con tan pocos el ajuste no dice nada.
 */
export function ajustarGumbel(maximos: number[]): Gumbel | null {
  const n = maximos.length
  if (n < 10) return null
  const media = maximos.reduce((a, b) => a + b, 0) / n
  const desvio = Math.sqrt(maximos.reduce((a, b) => a + (b - media) ** 2, 0) / (n - 1))
  if (!(desvio > 0)) return null
  const alfa = desvio * Math.sqrt(6) / Math.PI
  return { n, media, desvio, u: media - EULER * alfa, alfa }
}

/** Probabilidad de que el máximo de un año **no** supere `h` */
const noExcedencia = (g: Gumbel, h: number) => Math.exp(-Math.exp(-(h - g.u) / g.alfa))

/** La altura que se supera, en promedio, una vez cada `T` años */
export function alturaDeRecurrencia(g: Gumbel, T: number): number {
  return g.u - g.alfa * Math.log(-Math.log(1 - 1 / T))
}

/** Cada cuántos años, en promedio, el máximo anual iguala o supera `h` */
export function recurrenciaDe(g: Gumbel, h: number): number {
  return 1 / (1 - noExcedencia(g, h))
}

/**
 * El error estándar de la altura de recurrencia `T`, en metros.
 *
 * Crece con `T`: la altura de 100 años sale de extrapolar la cola y se conoce
 * peor que la de 5. La fórmula es la del ajuste por momentos, con el factor de
 * frecuencia K de Chow.
 */
export function errorEstandar(g: Gumbel, T: number): number {
  const K = -(Math.sqrt(6) / Math.PI) * (EULER + Math.log(Math.log(T / (T - 1))))
  return (g.desvio / Math.sqrt(g.n)) * Math.sqrt(1 + 1.1396 * K + 1.1 * K * K)
}

/**
 * Qué tan bien describe Gumbel a los máximos: la mayor distancia entre la
 * frecuencia observada y la ajustada (Kolmogorov-Smirnov).
 *
 * **El valor crítico es indicativo.** 1,36/√n supone que los parámetros no
 * salieron de la misma muestra, y acá sí salieron: la prueba real es algo más
 * exigente. Sirve para detectar un ajuste malo, no para certificar uno bueno.
 */
export function bondadKS(maximos: number[], g: Gumbel): { d: number; critico: number; pasa: boolean } {
  const x = [...maximos].sort((a, b) => a - b)
  const n = x.length
  let d = 0
  for (let i = 0; i < n; i++) {
    const f = noExcedencia(g, x[i])
    d = Math.max(d, Math.abs(f - (i + 1) / n), Math.abs(f - i / n))
  }
  const critico = 1.36 / Math.sqrt(n)
  return { d, critico, pasa: d < critico }
}

/** En cuántos de los años el máximo igualó o superó `h`. Contado, sin ajuste */
export function aniosSobre(maximos: number[], h: number): { veces: number; de: number } {
  return { veces: maximos.filter(m => m >= h).length, de: maximos.length }
}

// ── Permanencia ──────────────────────────────────────────────────────────────

export interface Permanencia {
  /** Días con dato que entraron */
  dias: number
  /** Promedio de la altura de todos esos días, en metros; `NaN` si no hay ninguno */
  media: number
  /** Fracción de los días en que la altura igualó o superó `h`, de 0 a 1 */
  sobre: (h: number) => number
  /** La altura igualada o superada la fracción `p` del tiempo */
  alturaDe: (p: number) => number
}

/**
 * La curva de permanencia: qué fracción del tiempo el río estuvo a una altura
 * o por encima.
 *
 * Es una cuenta sobre todos los días medidos, no un ajuste. Los días sin dato
 * no entran ni como cero ni interpolados.
 */
export function permanencia(s: SerieDiariaRio, periodo: PeriodoRio): Permanencia {
  // El período reciente arranca con su año hidrológico, no el 1 de enero
  const desde = periodo === 'reciente'
    ? `${ANIO_REGIMEN - 1}-${String(MES_INICIO).padStart(2, '0')}-01`
    : s.desde
  const i0 = Math.max(0, Math.round(
    (Date.parse(desde + 'T00:00:00Z') - Date.parse(s.desde + 'T00:00:00Z')) / DIA_MS))

  const orden: number[] = []
  for (let i = i0; i < s.cm.length; i++) {
    const cm = s.cm[i]
    if (cm !== null) orden.push(cm / 100)
  }
  orden.sort((a, b) => b - a)   // de mayor a menor
  const n = orden.length

  return {
    dias: n,
    media: n ? orden.reduce((a, b) => a + b, 0) / n : NaN,
    sobre(h) {
      if (n === 0) return 0
      // Primer índice con altura menor que h: todo lo anterior la iguala o supera
      let lo = 0, hi = n
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (orden[mid] >= h) lo = mid + 1
        else hi = mid
      }
      return lo / n
    },
    alturaDe(p) {
      if (n === 0) return NaN
      return orden[Math.min(n - 1, Math.max(0, Math.round(p * (n - 1))))]
    },
  }
}

/**
 * El último día del registro en que la altura igualó o superó `h`, o `null` si
 * nunca pasó. Es lo que permite decir "no se veía desde…".
 */
export function ultimaVezSobre(s: SerieDiariaRio, h: number): string | null {
  const umbral = h * 100
  for (let i = s.cm.length - 1; i >= 0; i--) {
    const cm = s.cm[i]
    if (cm !== null && cm >= umbral) return fechaDe(s, i)
  }
  return null
}

/** Las recurrencias que se tabulan */
export const RECURRENCIAS = [2, 5, 10, 25, 50, 100] as const

/** Los años completos de un período, como CSV */
export function csvAnios(anios: AnioRio[], umbrales: { nombre: string }[]): string {
  const n = (v: number) => v.toFixed(2).replace('.', ',')
  const cab = ['Año hidrológico', 'Días con dato', 'Máximo (m)', 'Fecha del máximo',
    'Mínimo (m)', 'Fecha del mínimo', ...umbrales.map(u => `Días sobre ${u.nombre}`)]
  const filas = anios.map(a => [
    etiquetaAnio(a.anio), a.dias, n(a.max), a.fechaMax, n(a.min), a.fechaMin, ...a.diasSobre,
  ].join(';'))
  return [cab.join(';'), ...filas].join('\n')
}
