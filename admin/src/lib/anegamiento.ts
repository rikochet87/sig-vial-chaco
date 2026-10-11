/**
 * La superficie que se ve anegada en cada cuenca, quincena por quincena: el
 * tipo del archivo que genera `scripts/build_anegamiento.mjs` y cómo leerlo.
 *
 * Sale de Dynamic World, una clasificación automática de cada imagen de
 * Sentinel-2. De sus nueve clases se usa una, «vegetación inundada».
 *
 * ── Tres cosas que hay que saber antes de usarla ──────────────────────────────
 *
 * **Se compara contra el mismo mes de otros años, no un mes contra otro.** De
 * mayo a julio da varias veces más que en verano —en Negro - Salado la mediana
 * es de unos 100 km² contra 17 en enero—, y la lluvia de los meses anteriores
 * no lo explica. No se sabe si es agua que en invierno tarda en irse o un sesgo
 * de la clasificación con el sol bajo y la vegetación seca. Lo que sí se midió
 * es que **sacándole a cada quincena la mediana de su mes, sigue a la lluvia**:
 * contra la lámina de CHIRPS de los 90 días anteriores correlaciona de 0,0 a
 * 0,5 en bruto y de 0,4 a 0,7 así (Spearman, desde 2018).
 *
 * **Una quincena nublada no es una quincena seca.** Sentinel-2 es óptico. Sólo
 * cuentan las quincenas en que se vio el 90 % de la cuenca o más
 * (`VISTO_MINIMO`), y lo clasificado se lleva a la cuenca entera en proporción
 * a lo visto.
 *
 * **Lo normal se cuenta desde 2018.** Antes volaba un solo satélite y hay de
 * una a ocho quincenas útiles por año; desde 2018, de catorce a veintidós.
 *
 * No es una mancha de inundación: no ve agua abierta —la clase «agua» del
 * mismo producto se probó y no sirve— ni lo que queda debajo del monte.
 */

import { cuantil } from './chirps'

export interface AnegamientoCuencas {
  fuente: string
  variable: string
  generado: string
  /** Primer día de la primera quincena */
  desde: string
  /** Último día de la última quincena que tienen todas las cuencas */
  hasta: string | null
  escalaM: number
  /** Código de cuenca → una quincena por posición desde `desde`, en km² */
  cuencas: Record<string, { km2: number; visto: number[]; veg: number[] }>
}

/** Con menos de esta parte de la cuenca a la vista, la quincena no cuenta */
export const VISTO_MINIMO = 0.9

/** Lo normal de cada mes se cuenta desde este año: antes hay un solo satélite */
export const ANIO_NORMAL_DESDE = 2018

/**
 * Si la mayor quincena de una cuenca no llega a esto, ahí no se detecta nada y
 * no se compara contra lo normal: «dentro de lo normal» sobre cero no dice nada.
 * Hoy es sólo el Impenetrable, que nunca pasó de 4 km² sobre 18.800.
 */
export const MINIMO_DETECTABLE_KM2 = 10

/**
 * Lo que se sabe de las cuencas donde el número no dice lo que parece.
 *
 * Medido el 11/10/2026 sobre once años. Va con el dato a pantalla.
 */
export const RESERVAS: Record<number, string> = {
  1: 'No sigue a la lluvia de la cuenca. Puede seguir al río Bermejo, que trae agua de los Andes: no se comparó.',
  12: 'Acá el agua la pone el Paraná, no la lluvia de la cuenca.',
  13: 'No se detecta nada: en once años, nunca más de 4 km². Es monte cerrado, y lo que queda debajo no se ve.',
}

/** El primer día de la quincena que sigue a la que empieza en `f` */
export function quincenaSiguiente(f: string): string {
  const a = Number(f.slice(0, 4)), m = Number(f.slice(5, 7))
  return (f.slice(8, 10) === '01' ? new Date(Date.UTC(a, m - 1, 16)) : new Date(Date.UTC(a, m, 1)))
    .toISOString().slice(0, 10)
}

export interface Quincena {
  /** Primer día */
  desde: string
  /** Último día */
  hasta: string
  anio: number
  /** 1 a 12 */
  mes: number
  /** Parte de la cuenca que se vio al menos una vez, de 0 a 1 */
  visto: number
  /**
   * Vegetación inundada, en km², llevada a la cuenca entera.
   * `null` si se vio menos de `VISTO_MINIMO`: no es cero, es que no se sabe.
   */
  km2: number | null
}

const DIA_MS = 86_400_000

/** La serie de una cuenca, una quincena por elemento */
export function serieAnegamiento(a: AnegamientoCuencas, cod: number): Quincena[] {
  const c = a.cuencas[String(cod)]
  if (!c) return []
  const out: Quincena[] = []
  let desde = a.desde
  for (let i = 0; i < c.veg.length; i++) {
    const sig = quincenaSiguiente(desde)
    const visto = Math.min(1, c.visto[i] / c.km2)
    out.push({
      desde, hasta: new Date(Date.parse(sig) - DIA_MS).toISOString().slice(0, 10),
      anio: Number(desde.slice(0, 4)), mes: Number(desde.slice(5, 7)), visto,
      km2: visto >= VISTO_MINIMO ? (c.veg[i] / c.visto[i]) * c.km2 : null,
    })
    desde = sig
  }
  return out
}

type Util = Quincena & { km2: number }
const util = (q: Quincena): q is Util => q.km2 !== null

/** Las quincenas con la cuenca a la vista, desde `ANIO_NORMAL_DESDE` */
export const quincenasUtiles = (serie: Quincena[]): Util[] =>
  serie.filter(util).filter(q => q.anio >= ANIO_NORMAL_DESDE)

export interface NormalMes {
  /** 1 a 12 */
  mes: number
  /** Cuántas quincenas útiles tiene ese mes entre todos los años */
  quincenas: number
  /** La mediana y el rango en que cae ocho de cada diez veces, en km² */
  mediana: number
  p10: number
  p90: number
}

/** Lo normal de cada mes: todas las quincenas útiles de ese mes, de todos los años */
export function normalAnegamiento(serie: Quincena[]): NormalMes[] {
  const utiles = quincenasUtiles(serie)
  return Array.from({ length: 12 }, (_, i) => {
    const v = utiles.filter(q => q.mes === i + 1).map(q => q.km2)
    return { mes: i + 1, quincenas: v.length, mediana: cuantil(v, 0.5), p10: cuantil(v, 0.1), p90: cuantil(v, 0.9) }
  })
}

export interface LecturaAnegamiento {
  quincena: Util
  normal: NormalMes
  /** Qué lugar ocupa entre las quincenas útiles de su mes, de la más anegada (1) a la menos */
  puesto: number
  de: number
  /** Dónde cae contra el rango de ocho de cada diez */
  contra: 'sobre' | 'dentro' | 'bajo'
}

/** Una quincena contra lo normal de su mes */
export function leerAnegamiento(serie: Quincena[], q: Util): LecturaAnegamiento {
  const normal = normalAnegamiento(serie)[q.mes - 1]
  const delMes = quincenasUtiles(serie).filter(x => x.mes === q.mes).map(x => x.km2)
  return {
    quincena: q, normal,
    puesto: 1 + delMes.filter(v => v > q.km2).length, de: delMes.length,
    contra: q.km2 > normal.p90 ? 'sobre' : q.km2 < normal.p10 ? 'bajo' : 'dentro',
  }
}

/** La última quincena con la cuenca a la vista, contra lo normal de su mes */
export function ultimaLectura(serie: Quincena[]): LecturaAnegamiento | null {
  const q = quincenasUtiles(serie).at(-1)
  return q ? leerAnegamiento(serie, q) : null
}

/** La quincena útil más anegada; si dos empatan, la más reciente */
export function mayorAnegamiento(serie: Quincena[]): Util | null {
  const utiles = quincenasUtiles(serie)
  return utiles.length ? utiles.reduce((a, q) => (q.km2 >= a.km2 ? q : a)) : null
}

/**
 * Cada quincena útil menos la mediana de su mes, en km².
 *
 * Es lo que se puede comparar entre una época y otra, y contra la lluvia.
 */
export function anomalias(serie: Quincena[]): { quincena: Util; km2: number }[] {
  const normal = normalAnegamiento(serie)
  return quincenasUtiles(serie).map(q => ({ quincena: q, km2: q.km2 - normal[q.mes - 1].mediana }))
}

/** Todas las quincenas de todas las cuencas, para descargar */
export function csvAnegamiento(a: AnegamientoCuencas, cuencas: { cod: number; nombre: string }[]): string {
  const series = cuencas.map(k => serieAnegamiento(a, k.cod))
  const n = Math.max(0, ...series.map(s => s.length))
  const dec = (v: number) => v.toFixed(1).replace('.', ',')
  const lineas = [
    `Vegetación inundada por cuenca y por quincena, en km² llevados a la cuenca entera;${a.desde};${a.hasta ?? ''}`,
    `${a.fuente}. Clasificación automática de imágenes, no medición. Vacío: se vio menos del ${VISTO_MINIMO * 100} % de la cuenca`,
    '',
    ['Desde', 'Hasta', ...cuencas.flatMap(k => [`${k.cod} ${k.nombre}`, `${k.cod} visto %`])].join(';'),
  ]
  for (let i = 0; i < n; i++) {
    const q0 = series.find(s => s[i])?.[i]
    if (!q0) continue
    lineas.push([q0.desde, q0.hasta, ...series.flatMap(s => {
      const q = s[i]
      return q ? [q.km2 === null ? '' : dec(q.km2), String(Math.round(q.visto * 100))] : ['', '']
    })].join(';'))
  }
  return lineas.join('\r\n')
}
