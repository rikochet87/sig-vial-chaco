/**
 * Los ríos y canales de adentro de la provincia: la altura que mide el INA en
 * siete escalas, para ponerla al lado de la lluvia de su cuenca.
 *
 * ── Para qué ──────────────────────────────────────────────────────────────────
 *
 * Hasta acá de una cuenca se sabía cuánta lámina le cayó. No había ninguna
 * observación de **qué hizo el agua después**. Estas escalas son eso: el río
 * que sube uno o dos días después de la lluvia y tarda semanas en bajar. Es lo
 * que el plan del balance hídrico pide antes de cualquier modelo — una
 * observación contra la cual verificar.
 *
 * No es el río Paraná (`lib/ina.ts`): aquél trae agua de miles de kilómetros y
 * no responde a lo que llueve en el Chaco. Éstos sí.
 *
 * ── Cuáles estaciones, y cuáles no ────────────────────────────────────────────
 *
 * El INA lista más de veinte escalas en la provincia. Se eligieron las siete
 * cuya serie **se lee como un río**: crecida tras la lluvia y bajante lenta,
 * sin puntas sueltas. Se miró la serie de cada una desde 09/2024 antes de
 * decidir, y quedaron afuera:
 *
 * | Estación | Por qué no |
 * |---|---|
 * | Negro, Obra de Control aguas abajo | piso fijo en 1,21 m: no baja de ahí nunca |
 * | Canal Soberanía, Obra de Control | es una compuerta que se opera: sube y baja metros de un día al otro |
 * | Laguna María Cristina | puntas de −8 m y −2 m entre lecturas de 3,5 |
 * | Bajo Chorotis, RN 95 | piso en −2,50 m y una punta de 12 m |
 * | PF El Aguará | escalones, no una crecida: no es un curso de agua |
 * | Bermejo (Lavalle, El Colorado, Velaz) | las dos primeras con puntas de varios metros; y el Bermejo trae agua de los Andes, no del Chaco |
 *
 * **No se filtra nada de las que quedaron.** Mostrar la serie tal como la
 * publica la fuente es más honesto que limpiarla con una regla propia, y por
 * eso el criterio fue elegir estaciones y no corregir lecturas. Si una de las
 * siete empieza a traer basura, se va a ver.
 *
 * ── Qué no afirma ─────────────────────────────────────────────────────────────
 *
 * - **La altura es sobre el cero de cada escala**, y ninguna tiene el cero
 *   vinculado. No se puede comparar una estación con otra en metros, ni contra
 *   el terreno. Sirve para ver cuándo sube, cuánto y cuánto tarda en bajar.
 * - **No hay niveles de alerta.** El INA no publica ninguno para estas escalas
 *   y acá no se inventan: mismo criterio que con el Paraná.
 * - **La escala no ve toda la cuenca**, sólo lo que drena aguas arriba de ella.
 *   La lámina que va al lado es la de la cuenca entera, que es lo que hay.
 */

import type { LecturaRio } from './ina'

export interface EstacionInterna {
  /** Id de la estación en el Alerta Hidrológico del INA */
  id: number
  /** Id de la serie «Altura hidrométrica media diaria» */
  serie: number
  /** El curso de agua */
  curso: string
  /** El lugar de la escala */
  lugar: string
  lat: number
  lng: number
  /** Código de la cuenca (1 a 13) con cuya lluvia se la compara */
  cuenca: number
  /**
   * `true` cuando la escala está fuera del polígono de la cuenca: sobre el
   * límite o ya en Santa Fe, midiendo el agua que sale. La pantalla lo dice.
   */
  aLaSalida?: boolean
}

/**
 * Las siete, por cuenca y de aguas arriba hacia abajo.
 *
 * Las tres del Negro van en el orden en que corre el río: Philipon, Laguna
 * Blanca y San Fernando, que ya es Resistencia.
 */
export const ESTACIONES_INTERNAS: EstacionInterna[] = [
  { id: 7295, serie: 38276, curso: 'Río Negro', lugar: 'Philipon', lat: -27.17417, lng: -59.26139, cuenca: 6 },
  { id: 6432, serie: 38058, curso: 'Río Negro', lugar: 'Laguna Blanca', lat: -27.26333, lng: -59.19611, cuenca: 6 },
  { id: 7296, serie: 38277, curso: 'Río Negro', lugar: 'San Fernando', lat: -27.43556, lng: -58.98222, cuenca: 6 },
  { id: 6633, serie: 38041, curso: 'Río Salado', lugar: 'RN 11', lat: -27.54139, lng: -59.13083, cuenca: 6 },
  { id: 7184, serie: 38205, curso: 'Arroyo Tapenagá', lugar: 'Estancia Tapenagá', lat: -27.56722, lng: -59.65889, cuenca: 8 },
  { id: 7190, serie: 38211, curso: 'Canal Línea Paraná', lugar: 'Tramo IV', lat: -27.99778, lng: -60.71556, cuenca: 10, aLaSalida: true },
  { id: 7193, serie: 38214, curso: 'Canal Línea Paraná', lugar: 'Los Amores', lat: -28.11028, lng: -59.97556, cuenca: 10, aLaSalida: true },
]

/** Cuántos días sin lectura hacen que una estación se marque como atrasada */
export const DIAS_ATRASO = 3

/** Cuántos días hacia atrás se mide el cambio */
export const DIAS_CAMBIO = 7

const DIA_MS = 86_400_000
const isoDe = (t: number) => new Date(t).toISOString().slice(0, 10)

/** Un día de la serie de una escala; `m: null` = el INA no tiene lectura */
export interface DiaAltura {
  fecha: string
  m: number | null
}

/**
 * De lecturas sueltas a un día por posición entre `desde` y `hasta`.
 *
 * La fecha es el día de la lectura leído en UTC, sin convertir: el INA marca la
 * media diaria en la medianoche local, que cae a las 03:00 UTC del mismo día.
 * Un hueco queda en `null`: no se interpola.
 */
export function serieDeAlturas(lecturas: LecturaRio[], desde: string, hasta: string): DiaAltura[] {
  const porFecha = new Map<string, number>()
  for (const l of lecturas) porFecha.set(l.fecha.slice(0, 10), l.m)
  const out: DiaAltura[] = []
  for (let t = Date.parse(desde); t <= Date.parse(hasta); t += DIA_MS) {
    const fecha = isoDe(t)
    out.push({ fecha, m: porFecha.get(fecha) ?? null })
  }
  return out
}

export interface ResumenAltura {
  /** La última lectura */
  ultima: { fecha: string; m: number }
  /** Cuántos días pasaron entre la última lectura y `hoy` */
  atraso: number
  /**
   * Cuánto cambió respecto de `DIAS_CAMBIO` días antes de la última lectura.
   * `null` si ese día no tiene lectura: no se toma la más cercana.
   */
  cambio: number | null
  minima: { fecha: string; m: number }
  maxima: { fecha: string; m: number }
  /** Días con lectura, y días de la ventana */
  conDato: number
  dias: number
}

/**
 * Lo que se dice de una escala en una línea. `null` si no hay ninguna lectura
 * en la ventana: una estación sin datos no tiene resumen, y no es altura cero.
 */
export function resumirAlturas(serie: DiaAltura[], hoy: string): ResumenAltura | null {
  const con = serie.filter((d): d is { fecha: string; m: number } => d.m !== null)
  if (con.length === 0) return null

  const ultima = con[con.length - 1]
  const antes = isoDe(Date.parse(ultima.fecha) - DIAS_CAMBIO * DIA_MS)
  const previa = serie.find(d => d.fecha === antes)?.m ?? null

  let minima = con[0], maxima = con[0]
  for (const d of con) {
    if (d.m < minima.m) minima = d
    // Si la máxima se repite, la más reciente: es la que importa hoy
    if (d.m >= maxima.m) maxima = d
  }

  return {
    ultima,
    atraso: Math.round((Date.parse(hoy) - Date.parse(ultima.fecha)) / DIA_MS),
    cambio: previa === null ? null : Math.round((ultima.m - previa) * 100) / 100,
    minima, maxima,
    conDato: con.length, dias: serie.length,
  }
}

/** Lo que devuelve `/api/lluvia/rios-internos` por estación */
export interface EstacionInternaConSerie extends EstacionInterna {
  lecturas: LecturaRio[]
}

export interface RespuestaRiosInternos {
  desde: string
  hasta: string
  estaciones: EstacionInternaConSerie[]
  /** Las que no contestaron, por nombre: una estación ausente se tiene que ver ausente */
  sinRespuesta: string[]
  motivos: string[]
  fuente: string
}

export const nombreDe = (e: EstacionInterna) => `${e.curso}, ${e.lugar}`
