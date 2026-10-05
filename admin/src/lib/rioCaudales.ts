/**
 * De dónde viene el caudal que pasa por Corrientes: el balance en la
 * confluencia del Paraná con el Paraguay.
 *
 * ── Qué agrega a lo que ya había ──────────────────────────────────────────────
 *
 * `rioTraslado.ts` mide el aporte del Paraguay con alturas, y por eso sólo puede
 * decir cuánto *se parece* lo que hace Corrientes a lo que hizo el Paraguay.
 * Una altura no se suma. Un caudal sí:
 *
 *     Corrientes(t) = Yacyretá(t − a) + Paraguay(t − b) + Bermejo(t − c) + resto
 *
 * Con eso se puede decir **qué parte del agua viene por cada río**, en m³/s.
 *
 * ── Por qué se puede creer ────────────────────────────────────────────────────
 *
 * Las cuatro series salen de lugares que no se conocen entre sí: lo que larga
 * una represa y tres curvas de gasto de tres escalas distintas. Nada obliga a
 * que tres de ellas sumen la cuarta. **Que sumen —con un resto del orden del
 * 1 al 2 % del caudal medio— es la verificación**, y el test lo afirma.
 *
 * Hay además un control: el Paraguay se puede tomar en Puerto Pilcomayo o en
 * Puerto Formosa, más abajo sobre el mismo río. Las dos cuentas tienen
 * que dar la misma parte.
 *
 * ── Qué es el resto ───────────────────────────────────────────────────────────
 *
 * Lo que no se mide —el Tebicuary y los demás afluentes que entran entre las
 * estaciones y la confluencia— más el error de las curvas de gasto. No se
 * reparte entre los tres ríos: va en su propia columna.
 *
 * ── Qué no afirma ─────────────────────────────────────────────────────────────
 *
 * **Son caudales de curva de gasto, no aforos.** Salvo en Yacyretá, cada número
 * es una altura pasada por una curva; con el río fuera de cauce las curvas
 * valen menos. Los promedios son firmes; un día suelto, no tanto.
 *
 * Y es de dónde vino el agua, no un pronóstico: no dice a cuánto va a llegar
 * Corrientes.
 */

type Serie = (number | null)[]

/** Las series del archivo que genera `scripts/build_rio_caudales.mjs` */
export type ClaveCaudal = 'corrientes' | 'yacyreta' | 'paraguay' | 'formosa' | 'bermejo'

export interface CaudalConfluencia {
  fuente: string
  variable: string
  generado: string
  desde: string
  hasta: string
  series: Record<ClaveCaudal, { estacion: number; serie: number }>
  /** Un día por posición desde `desde`, en m³/s; `null` = sin dato */
  m3s: Record<ClaveCaudal, Serie>
}

/** Dónde se toma el Paraguay: Puerto Pilcomayo, o Puerto Formosa como control */
export type ParaguayEn = 'paraguay' | 'formosa'

/** Cuántos días antes que en Corrientes se toma cada río */
export interface Desfases {
  yacyreta: number
  paraguay: number
  bermejo: number
}

/**
 * El desfase del Bermejo, fijo.
 *
 * No se ajusta como los otros dos porque no hay con qué: el Bermejo es el 2 %
 * del caudal de Corrientes, y moverlo de un día a una semana no cambia el resto
 * de forma que se pueda medir. Tres días es un valor supuesto, no medido, para
 * el agua que va de El Colorado a la confluencia.
 */
export const DESFASE_BERMEJO = 3

/** Desfases que se prueban para Yacyretá y para el Paraguay, en días */
export const DESFASE_YACYRETA_MAX = 8
export const DESFASE_PARAGUAY_MAX = 16

/** Con menos días que éstos no se informa nada */
export const DIAS_MINIMOS_BALANCE = 365

const DIA_MS = 86_400_000

/** Las partes de un caudal, en m³/s */
export interface Partes {
  corrientes: number
  yacyreta: number
  paraguay: number
  bermejo: number
  /** Corrientes menos los otros tres. Puede ser negativo */
  resto: number
}

export interface BalanceMes extends Partes {
  /** 1 a 12 */
  mes: number
  dias: number
}

export interface Balance {
  desfases: Desfases
  /** Días en que están las cuatro series, cada una con su desfase */
  dias: number
  /** Primer y último día que entraron */
  desde: string
  hasta: string
  /** El promedio de cada parte sobre esos días */
  medias: Partes
  /** Qué parte de la variación diaria de Corrientes explica la suma (R²) */
  r2: number
  /** Desvío del resto diario alrededor de su media, en m³/s */
  desvioResto: number
  /** El promedio por mes del año, de enero a diciembre */
  porMes: BalanceMes[]
  /**
   * Lo que entra por el Paraguay —con el Bermejo, que desemboca en él— como
   * parte del caudal de Corrientes, día por día.
   */
  porElParaguay: { p5: number; mediana: number; p95: number; max: number; fechaMax: string }
}

/** Los cuatro caudales de cada día en que están todos, con su índice */
function filas(c: CaudalConfluencia, d: Desfases, en: ParaguayEn): { t: number; q: [number, number, number, number] }[] {
  const C = c.m3s.corrientes, Y = c.m3s.yacyreta, P = c.m3s[en], B = c.m3s.bermejo
  const out: { t: number; q: [number, number, number, number] }[] = []
  for (let t = 0; t < C.length; t++) {
    const qc = C[t], qy = Y[t - d.yacyreta], qp = P[t - d.paraguay], qb = B[t - d.bermejo]
    if (qc == null || qy == null || qp == null || qb == null) continue
    out.push({ t, q: [qc, qy, qp, qb] })
  }
  return out
}

const fechaDe = (desde: string, t: number) =>
  new Date(Date.parse(desde + 'T00:00:00Z') + t * DIA_MS).toISOString().slice(0, 10)

function promediar(fs: { q: [number, number, number, number] }[]): Partes {
  const s = [0, 0, 0, 0]
  for (const f of fs) for (let i = 0; i < 4; i++) s[i] += f.q[i]
  const [corrientes, yacyreta, paraguay, bermejo] = s.map(v => v / fs.length)
  return { corrientes, yacyreta, paraguay, bermejo, resto: corrientes - yacyreta - paraguay - bermejo }
}

/**
 * El balance con los desfases dados.
 *
 * Devuelve `null` si los días en que coinciden las cuatro series no llegan a
 * `DIAS_MINIMOS_BALANCE`: un promedio de pocos días no es de dónde viene el
 * agua, es qué pasó esa semana.
 */
export function balance(c: CaudalConfluencia, desfases: Desfases, en: ParaguayEn = 'paraguay'): Balance | null {
  const fs = filas(c, desfases, en)
  if (fs.length < DIAS_MINIMOS_BALANCE) return null

  const medias = promediar(fs)

  let sse = 0, sst = 0
  for (const { q } of fs) {
    const r = q[0] - q[1] - q[2] - q[3]
    sse += r * r
    sst += (q[0] - medias.corrientes) ** 2
  }
  const varResto = sse / fs.length - medias.resto ** 2

  const porMes: BalanceMes[] = []
  for (let mes = 1; mes <= 12; mes++) {
    const delMes = fs.filter(f => Number(fechaDe(c.desde, f.t).slice(5, 7)) === mes)
    if (delMes.length > 0) porMes.push({ mes, dias: delMes.length, ...promediar(delMes) })
  }

  const fr = fs.map(f => ({ t: f.t, v: (f.q[2] + f.q[3]) / f.q[0] })).sort((a, b) => a.v - b.v)
  const q = (p: number) => fr[Math.round(p * (fr.length - 1))].v
  const ultimo = fr[fr.length - 1]

  return {
    desfases,
    dias: fs.length,
    desde: fechaDe(c.desde, fs[0].t),
    hasta: fechaDe(c.desde, fs[fs.length - 1].t),
    medias,
    r2: sst > 0 ? 1 - sse / sst : NaN,
    desvioResto: Math.sqrt(Math.max(0, varResto)),
    porMes,
    porElParaguay: { p5: q(0.05), mediana: q(0.5), p95: q(0.95), max: ultimo.v, fechaMax: fechaDe(c.desde, ultimo.t) },
  }
}

/**
 * Los desfases de Yacyretá y del Paraguay con los que la suma mejor sigue a
 * Corrientes: los que dejan el resto con menos variación.
 *
 * Se mira la variación del resto y no su tamaño a propósito. El tamaño medio
 * casi no depende del desfase —correr una serie unos días no le cambia el
 * promedio—; lo que cambia es cuánto sube y baja el resto, que es mínimo cuando
 * cada onda está restada en su día.
 *
 * **El de Yacyretá queda bien determinado y el del Paraguay no.** El Paraguay
 * se mueve despacio: su caudal de hoy es casi el de hace una semana, y entonces
 * restarlo con seis días o con diez da casi lo mismo. Sirve para armar el
 * balance, no para decir cuánto tarda el Paraguay en llegar.
 *
 * Devuelve `null` si el mínimo cae en el borde del rango probado.
 */
export function desfasesQueCierran(c: CaudalConfluencia, en: ParaguayEn = 'paraguay'): Desfases | null {
  let mejor: { d: Desfases; v: number } | null = null
  for (let a = 0; a <= DESFASE_YACYRETA_MAX; a++) {
    for (let b = 0; b <= DESFASE_PARAGUAY_MAX; b++) {
      const d: Desfases = { yacyreta: a, paraguay: b, bermejo: DESFASE_BERMEJO }
      const fs = filas(c, d, en)
      if (fs.length < DIAS_MINIMOS_BALANCE) continue
      let s = 0, ss = 0
      for (const { q } of fs) {
        const r = q[0] - q[1] - q[2] - q[3]
        s += r; ss += r * r
      }
      const v = ss / fs.length - (s / fs.length) ** 2
      if (!mejor || v < mejor.v) mejor = { d, v }
    }
  }
  if (!mejor) return null
  const { yacyreta, paraguay } = mejor.d
  if (yacyreta === 0 || yacyreta === DESFASE_YACYRETA_MAX) return null
  if (paraguay === 0 || paraguay === DESFASE_PARAGUAY_MAX) return null
  return mejor.d
}

/** El balance con los desfases que mejor cierran */
export function balanceDeLaConfluencia(c: CaudalConfluencia, en: ParaguayEn = 'paraguay'): Balance | null {
  const d = desfasesQueCierran(c, en)
  return d ? balance(c, d, en) : null
}
