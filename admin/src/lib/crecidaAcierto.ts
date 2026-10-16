/**
 * El registro diario de la crecida desde Brasil y la medida de su acierto.
 * Puro: sin red ni base. La tabla está en `docs/sql/15-pronostico-crecida.sql`
 * y la escribe `lib/crecidaRegistro.ts`.
 *
 * ── Qué se guarda ─────────────────────────────────────────────────────────────
 *
 * **Las 51 corridas enteras**, no la banda: con las corridas se puede calcular
 * después cualquier medida de acierto, no sólo las de hoy. Y **la lluvia de
 * cada corrida por cuenca**, que es lo que permite separar después cuánto del
 * error vino del pronóstico de lluvia y cuánto de la cadena: se la compara
 * contra la lluvia que cayó, que se puede volver a pedir cuando haga falta.
 *
 * ── Contra qué se mide ────────────────────────────────────────────────────────
 *
 * **Contra la altura de hoy de los registros siguientes.** Cada emisión guarda
 * la altura con la que arrancó, con su fecha; la medida del día D es la de la
 * emisión cuya lectura es del día D. Así la medida es la misma lectura que usa
 * la cadena —Prefectura a las 00:00, o el INA— y no hace falta otra fuente. Si
 * el cron se salta un día, ese día no se mide.
 *
 * **Contra la persistencia**, que es «el río sigue como hoy»: un pronóstico que
 * no le gana a eso no sirve. Y contra la curva sin más lluvia, que dice cuánto
 * aportó mirar la lluvia pronosticada.
 */

import { diaDe, isoDe } from './crecida'

/** Una fila de `pronostico_crecida`, tal como va a la base */
export interface FilaCrecida {
  emitido: string
  altura_hoy: number
  altura_fecha: string
  altura_fuente: string
  /** Primer día de `alturas`: el de emisión */
  dia0: string
  dias: number
  corridas: number
  /** cm; la altura del día d y la corrida m está en [d * corridas + m] */
  alturas: (number | null)[]
  /** cm, uno por día */
  sin_lluvia: (number | null)[]
  determinado_hasta: string | null
  ultimo_ons: string
  /** Días de lluvia pronosticada por corrida */
  dias_lluvia: number
  /** Décimas de mm; el día d y la corrida m en [d * corridas + m] */
  lluvia_iguacu: number[]
  lluvia_itaipu_inc: number[]
  /** Itaipú + Iguazú, m³/s, un día por posición desde `itaipu_iguazu_desde` */
  itaipu_iguazu_desde: string
  itaipu_iguazu: number[]
  /** Cuántos de los primeros valores de `itaipu_iguazu` son medidos; el resto es la mediana del ensamble */
  itaipu_iguazu_medidos: number
  calibracion: string
  modelo: string
  avisos: string[]
}

/** Lo que hace falta del cálculo para armar la fila */
export interface EntradaFila {
  respuesta: {
    emitido: string
    alturaHoy: { m: number; fecha: string; fuente: string }
    fechas: string[]
    sinLluvia: (number | null)[]
    determinadoHasta: string | null
    itaipuIguazu: { fecha: string; m3s: number; medido: boolean }[]
    ultimoOns: string
    calibracion: string
    avisos: string[]
  }
  alturas: (number | null)[][]
  lluviaCorridas: { iguacu: number[][]; itaipu_inc: number[][] }
  modelo: string
}

const cm = (m: number | null) => (m === null || !Number.isFinite(m) ? null : Math.round(m * 100))
const decimas = (mm: number) => Math.round(mm * 10)

/** El cálculo del día, a una fila */
export function filaDeCrecida(c: EntradaFila): FilaCrecida {
  const r = c.respuesta
  const dias = r.fechas.length, corridas = c.alturas.length
  const alturas: (number | null)[] = []
  for (let d = 0; d < dias; d++) for (let m = 0; m < corridas; m++) alturas.push(cm(c.alturas[m][d] ?? null))
  const diasLluvia = c.lluviaCorridas.iguacu[0]?.length ?? 0
  const plano = (x: number[][]) => {
    const out: number[] = []
    for (let d = 0; d < diasLluvia; d++) for (let m = 0; m < corridas; m++) out.push(decimas(x[m][d]))
    return out
  }
  // Itaipú + Iguazú: los medidos van primero y el resto es proyección; se
  // guarda como serie continua y se dice cuántos son medidos
  const ii = r.itaipuIguazu
  const i0 = ii.length ? diaDe(ii[0].fecha) : diaDe(r.emitido)
  const serieII: number[] = []
  for (const x of ii) {
    const k = diaDe(x.fecha) - i0
    while (serieII.length < k) serieII.push(serieII.at(-1) ?? x.m3s)
    serieII[k] = x.m3s
  }
  return {
    emitido: r.emitido,
    altura_hoy: r.alturaHoy.m,
    altura_fecha: r.alturaHoy.fecha,
    altura_fuente: r.alturaHoy.fuente,
    dia0: r.fechas[0],
    dias,
    corridas,
    alturas,
    sin_lluvia: r.sinLluvia.map(cm),
    determinado_hasta: r.determinadoHasta,
    ultimo_ons: r.ultimoOns,
    dias_lluvia: diasLluvia,
    lluvia_iguacu: plano(c.lluviaCorridas.iguacu),
    lluvia_itaipu_inc: plano(c.lluviaCorridas.itaipu_inc),
    itaipu_iguazu_desde: isoDe(i0),
    itaipu_iguazu: serieII,
    itaipu_iguazu_medidos: ii.filter(x => x.medido).length,
    calibracion: r.calibracion,
    modelo: c.modelo,
    avisos: r.avisos,
  }
}

/** Las alturas de una fila, en m, por día: una lista con las corridas que tienen valor */
export function corridasDe(f: Pick<FilaCrecida, 'dias' | 'corridas' | 'alturas'>): number[][] {
  return Array.from({ length: f.dias }, (_, d) =>
    f.alturas.slice(d * f.corridas, (d + 1) * f.corridas).filter((v): v is number => v !== null).map(v => v / 100))
}

/** Plazos que se informan, en días desde la emisión */
export const PLAZOS = [1, 2, 3, 5, 7, 10, 14] as const

export interface AciertoPlazo {
  dias: number
  /** Cuántos pares pronóstico–medida hay */
  n: number
  /** Error medio absoluto de la mediana, m */
  maeMediana: number | null
  /** Media de (mediana − medido), m: positivo es que se pasa */
  sesgo: number | null
  /** Error medio absoluto de «el río sigue como hoy», m */
  maePersistencia: number | null
  /** Error medio absoluto de la curva sin más lluvia, m */
  maeSinLluvia: number | null
  /** CRPS del ensamble, m: para la persistencia es igual a su error medio */
  crps: number | null
  /** Qué parte de las medidas cayó entre el 10 y el 90 % de las corridas: lo ideal es 0,8 */
  cobertura: number | null
}

const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null)

function percentil(s: number[], q: number) {
  const i = (s.length - 1) * q, a = Math.floor(i), b = Math.ceil(i)
  return s[a] + (s[b] - s[a]) * (i - a)
}

/** CRPS de un ensamble contra una medida: E|X − y| − ½ E|X − X'| */
export function crpsEnsamble(x: number[], y: number): number {
  const n = x.length
  if (!n) return NaN
  const s = [...x].sort((a, b) => a - b)
  let a = 0
  for (const v of s) a += Math.abs(v - y)
  // Σ|xi − xj| sobre todos los pares, con la lista ordenada: Σ (2i − n + 1)·x(i)
  let b = 0
  for (let i = 0; i < n; i++) b += (2 * i - n + 1) * s[i]
  return a / n - b / (n * n)
}

/**
 * La medida de cada día: la altura con la que arrancó la emisión cuya lectura
 * es de ese día. Si hay dos, la primera emitida.
 */
export function medidasDe(filas: Pick<FilaCrecida, 'emitido' | 'altura_hoy' | 'altura_fecha'>[]): Map<number, number> {
  const out = new Map<number, number>()
  for (const f of [...filas].sort((a, b) => a.emitido.localeCompare(b.emitido))) {
    const d = diaDe(f.altura_fecha)
    if (!out.has(d)) out.set(d, f.altura_hoy)
  }
  return out
}

/** El acierto por plazo sobre todas las emisiones que ya se pueden medir */
export function aciertoCrecida(
  filas: Pick<FilaCrecida, 'emitido' | 'altura_hoy' | 'altura_fecha' | 'dia0' | 'dias' | 'corridas' | 'alturas' | 'sin_lluvia'>[],
): AciertoPlazo[] {
  const medida = medidasDe(filas)
  return PLAZOS.map(k => {
    const ePer: number[] = [], eMed: number[] = [], sesgo: number[] = [], eSin: number[] = [], crps: number[] = [], dentro: number[] = []
    for (const f of filas) {
      // La emisión sólo se mide si arrancó con la altura de ese día
      if (diaDe(f.altura_fecha) !== diaDe(f.emitido)) continue
      const i = diaDe(f.emitido) + k - diaDe(f.dia0)
      if (i < 0 || i >= f.dias) continue
      const y = medida.get(diaDe(f.emitido) + k)
      if (y === undefined) continue
      const x = corridasDe({ dias: f.dias, corridas: f.corridas, alturas: f.alturas.slice(i * f.corridas, (i + 1) * f.corridas) })[0]
      if (!x?.length) continue
      const s = [...x].sort((a, b) => a - b)
      const p50 = percentil(s, 0.5)
      ePer.push(Math.abs(f.altura_hoy - y))
      eMed.push(Math.abs(p50 - y))
      sesgo.push(p50 - y)
      crps.push(crpsEnsamble(s, y))
      dentro.push(y >= percentil(s, 0.1) && y <= percentil(s, 0.9) ? 1 : 0)
      const sl = f.sin_lluvia[i]
      if (sl !== null && sl !== undefined) eSin.push(Math.abs(sl / 100 - y))
    }
    return {
      dias: k, n: eMed.length,
      maeMediana: media(eMed), sesgo: media(sesgo), maePersistencia: media(ePer),
      maeSinLluvia: media(eSin), crps: media(crps), cobertura: media(dentro),
    }
  })
}
