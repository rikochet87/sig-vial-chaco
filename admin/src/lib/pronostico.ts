/**
 * Pronóstico de lluvia por cuenca: el pronóstico por conjuntos de ECMWF, de
 * Open-Meteo, llevado a las 13 cuencas.
 *
 * **Es un modelo, no una medición, y se muestra como un rango.** El pronóstico
 * por conjuntos son 51 corridas del mismo modelo con condiciones iniciales
 * apenas distintas; la dispersión entre ellas es la incertidumbre. Dar sólo la
 * mediana sería presentar como certeza lo que la fuente entrega como rango —el
 * mismo criterio que con la banda del INA para el río—.
 *
 * Tres decisiones que cambian el número si se pierden:
 *
 * - **Se promedia por corrida y recién después se saca el rango.** La lámina de
 *   una cuenca en la corrida 17 es el promedio de sus puntos en la corrida 17;
 *   el rango sale de las 51 láminas así armadas. Promediar los percentiles de
 *   cada punto daría un rango más ancho que el real, porque supone que todos
 *   los puntos tienen su peor caso en la misma corrida y no es así: en cada
 *   corrida la tormenta cae en un lugar.
 * - **Lo mismo para las ventanas de varios días**: se suma por corrida y se
 *   saca el rango de las sumas. Sumar las medianas de cada día no es la mediana
 *   de la suma.
 * - **El día de hoy no entra.** El pronóstico diario de hoy cubre desde las
 *   00:00, horas que ya pasaron y que el modelo "pronostica" igual. Lo de hoy
 *   lo cuentan los pluviómetros mañana.
 *
 * Grilla de 0,25°, que es la resolución nativa del modelo: más fino no agrega
 * información, sólo gasta cupo. Una cuenca chica puede no tener ningún punto
 * adentro; ahí se usa el más cercano a su rótulo y la pantalla lo dice.
 */

import type { Cuenca } from './cuencas'
import { cuencaEn } from './cuencas'

/** Paso de la grilla, en grados — la resolución de ECMWF IFS 0,25° */
export const PASO_GRADOS = 0.25

/** Lo que devuelve /api/lluvia/pronostico */
export interface Pronostico {
  modelo: string
  /** Cuándo se consultó, ISO. Open-Meteo no informa la hora de la corrida. */
  consultado: string
  /** Los días pronosticados, AAAA-MM-DD, desde mañana */
  dias: string[]
  puntos: PuntoPronostico[]
}

export interface PuntoPronostico {
  lat: number
  lng: number
  /** mm por día y por corrida, en décimas: `mm[día][corrida]` */
  mm: number[][]
  /** ET₀ FAO-56 media de las corridas, por día, en décimas de mm */
  et0: number[]
}

// ── La grilla ────────────────────────────────────────────────────────────────

/** Punto en polígono, anillo en `[lng, lat]` */
function adentro(anillo: [number, number][], lat: number, lng: number): boolean {
  let dentro = false
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i], [xj, yj] = anillo[j]
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro
  }
  return dentro
}

/**
 * Los nodos de la grilla de 0,25° que caen dentro del contorno, anclados a
 * múltiplos del paso para que coincidan con las celdas del modelo.
 */
export function grillaEn(contorno: [number, number][], paso = PASO_GRADOS): { lat: number; lng: number }[] {
  const lngs = contorno.map(p => p[0]), lats = contorno.map(p => p[1])
  const out: { lat: number; lng: number }[] = []
  for (let lat = Math.ceil(Math.min(...lats) / paso) * paso; lat <= Math.max(...lats); lat += paso) {
    for (let lng = Math.ceil(Math.min(...lngs) / paso) * paso; lng <= Math.max(...lngs); lng += paso) {
      const p = { lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100 }
      if (adentro(contorno, p.lat, p.lng)) out.push(p)
    }
  }
  return out
}

// ── De los puntos a las cuencas ──────────────────────────────────────────────

export interface PuntosDeCuenca {
  cod: number
  /** Índices en `Pronostico.puntos` */
  indices: number[]
  /** Si no tenía ningún punto adentro y se tomó el más cercano */
  prestado: boolean
}

export function asignarPuntos(cuencas: Cuenca[], puntos: { lat: number; lng: number }[]): PuntosDeCuenca[] {
  const porCuenca = new Map<number, number[]>(cuencas.map(c => [c.cod, []]))
  puntos.forEach((p, i) => {
    const c = cuencaEn(cuencas, p.lat, p.lng)
    if (c) porCuenca.get(c.cod)!.push(i)
  })
  return cuencas.map(c => {
    const indices = porCuenca.get(c.cod)!
    if (indices.length || !puntos.length) return { cod: c.cod, indices, prestado: false }
    const [la, ln] = c.rotulo
    let mejor = 0, d = Infinity
    puntos.forEach((p, i) => {
      const dd = (p.lat - la) ** 2 + ((p.lng - ln) * Math.cos(la * Math.PI / 180)) ** 2
      if (dd < d) { d = dd; mejor = i }
    })
    return { cod: c.cod, indices: [mejor], prestado: true }
  })
}

/**
 * La lámina areal de un conjunto de puntos, por día y por corrida, en mm.
 * Promedio simple: los nodos de una grilla regular representan la misma
 * superficie, salvo el coseno de la latitud, que en el ancho del Chaco cambia
 * menos del 5 %.
 */
export function laminaPorCorrida(p: Pronostico, indices: number[]): number[][] {
  return p.dias.map((_, d) => {
    const corridas = p.puntos[indices[0]]?.mm[d]?.length ?? 0
    return Array.from({ length: corridas }, (_, m) => {
      let s = 0
      for (const i of indices) s += p.puntos[i].mm[d][m]
      return s / indices.length / 10
    })
  })
}

/** ET₀ areal por día, en mm */
export function et0Areal(p: Pronostico, indices: number[]): number[] {
  return p.dias.map((_, d) => indices.reduce((s, i) => s + p.puntos[i].et0[d], 0) / indices.length / 10)
}

// ── Resúmenes ────────────────────────────────────────────────────────────────

/** Percentil con interpolación lineal, sobre un arreglo ya ordenado */
export function cuantil(ordenado: number[], q: number): number {
  if (!ordenado.length) return NaN
  const x = q * (ordenado.length - 1)
  const i = Math.floor(x), f = x - i
  return i + 1 < ordenado.length ? ordenado[i] * (1 - f) + ordenado[i + 1] * f : ordenado[i]
}

export interface Rango {
  p10: number
  mediana: number
  p90: number
  /** Las sumas de cada corrida, ordenadas, para calcular probabilidades */
  corridas: number[]
}

/** La lámina de `n` días a partir del día `desde`: suma por corrida, después el rango */
export function ventana(porCorrida: number[][], desde: number, n: number): Rango | null {
  const dias = porCorrida.slice(desde, desde + n)
  if (dias.length < n || !dias[0]?.length) return null
  const sumas = dias[0].map((_, m) => dias.reduce((s, d) => s + d[m], 0)).sort((a, b) => a - b)
  return { p10: cuantil(sumas, 0.1), mediana: cuantil(sumas, 0.5), p90: cuantil(sumas, 0.9), corridas: sumas }
}

/** Qué parte de las corridas da al menos `umbral` mm, en [0, 1] */
export function probSuperar(r: Rango, umbral: number): number {
  return r.corridas.filter(v => v >= umbral).length / r.corridas.length
}

/** Lo que se muestra por cuenca */
export interface PronosticoCuenca {
  cod: number
  prestado: boolean
  puntos: number
  /** Lámina por día y por corrida — para el hietograma */
  porCorrida: number[][]
  et0: number[]
  manana: Rango | null
  tres: Rango | null
  siete: Rango | null
  /** ET₀ de los próximos 7 días, mm */
  et0Siete: number
}

export function pronosticoPorCuenca(p: Pronostico, asignados: PuntosDeCuenca[]): PronosticoCuenca[] {
  return asignados.map(a => {
    if (!a.indices.length) {
      return { cod: a.cod, prestado: false, puntos: 0, porCorrida: [], et0: [], manana: null, tres: null, siete: null, et0Siete: 0 }
    }
    const porCorrida = laminaPorCorrida(p, a.indices)
    const et0 = et0Areal(p, a.indices)
    return {
      cod: a.cod, prestado: a.prestado, puntos: a.indices.length, porCorrida, et0,
      manana: ventana(porCorrida, 0, 1),
      tres: ventana(porCorrida, 0, 3),
      siete: ventana(porCorrida, 0, 7),
      et0Siete: et0.slice(0, 7).reduce((s, v) => s + v, 0),
    }
  })
}
