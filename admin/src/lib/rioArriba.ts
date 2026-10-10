/**
 * Aguas arriba de Resistencia: hacia dónde va el río en cada escala.
 *
 * El bloque «Aguas arriba» del panel del río contesta una pregunta distinta de
 * las franjas grandes. Éstas dicen **cuánto le falta al alerta**; aquél dice
 * **qué está subiendo allá arriba**, que es lo que después pasa por
 * Barranqueras. Por eso lo central acá es la tendencia: cuánto cambió en un día
 * y en una semana.
 *
 * Mismo criterio que la vista «Ríos internos» (`lib/riosInternos.ts`):
 *
 * - **El cambio es contra el día exacto**, no contra la lectura más cercana. Si
 *   ese día no hay lectura, no hay cambio: `null`, no cero. Un cambio contra
 *   otro día mediría otra cosa con el mismo rótulo.
 * - **Un día por fecha**, la última lectura de ese día leído en UTC, sin
 *   convertir (`serieDeAlturas`).
 * - **Una estación atrasada se ve atrasada**: `atraso` son los días entre la
 *   última lectura y hoy, y la pantalla avisa desde `DIAS_ATRASO_ARRIBA`.
 *
 * Funciones puras, sin red: las verifica `scripts/verificar-rio-arriba.ts`.
 */
import type { LecturaRio } from './ina'
import { serieDeAlturas } from './riosInternos'
import {
  trasladoDelTramo, trasladoDelParaguay, trasladoDelBermejo, type TramoDiario,
} from './rioTraslado'

const DIA_MS = 86_400_000

/**
 * Desde cuántos días sin lectura se avisa. Las escalas de Prefectura se leen
 * todos los días; dos días sin dato ya es una estación que no está informando.
 */
export const DIAS_ATRASO_ARRIBA = 2

/**
 * Desde qué variación diaria se dice que el río sube o baja, en metros.
 *
 * Por debajo de 2 cm es el orden de la lectura de una escala a ojo: decir
 * «sube» por un centímetro sería leer ruido.
 */
export const QUIETO_M = 0.02

export interface Tendencia {
  /** La última lectura del período */
  ultima: { fecha: string; m: number }
  /** Días entre la última lectura y `hoy` */
  atraso: number
  /** Cambio contra el día anterior a la última lectura. `null` si ese día no tiene lectura */
  cambio1: number | null
  /** Cambio contra siete días antes de la última lectura. `null` si ese día no tiene lectura */
  cambio7: number | null
}

const isoDe = (t: number) => new Date(t).toISOString().slice(0, 10)
const cm = (v: number) => Math.round(v * 100) / 100

/**
 * La tendencia de una escala a partir de sus lecturas. `null` si no hay
 * ninguna: una estación sin datos no tiene tendencia, y no es un río quieto.
 */
export function tendenciaDe(lecturas: LecturaRio[], hoy: string): Tendencia | null {
  if (lecturas.length === 0) return null
  const ordenadas = [...lecturas].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const desde = ordenadas[0].fecha.slice(0, 10)
  const hasta = ordenadas[ordenadas.length - 1].fecha.slice(0, 10)
  const serie = serieDeAlturas(ordenadas, desde, hasta)

  const ultimo = serie[serie.length - 1]
  if (ultimo.m === null) return null
  const ultima = { fecha: ultimo.fecha, m: ultimo.m }

  const enDia = (dias: number): number | null => {
    const f = isoDe(Date.parse(ultima.fecha) - dias * DIA_MS)
    return serie.find(d => d.fecha === f)?.m ?? null
  }
  const ayer = enDia(1)
  const semana = enDia(7)

  return {
    ultima,
    atraso: Math.round((Date.parse(hoy.slice(0, 10)) - Date.parse(ultima.fecha)) / DIA_MS),
    cambio1: ayer === null ? null : cm(ultima.m - ayer),
    cambio7: semana === null ? null : cm(ultima.m - semana),
  }
}

/**
 * Cuánto puede apartarse de «la misma hora» la lectura contra la que se
 * compara. Prefectura lee a las 00:00 y a las 12:00, con alguna a la 01:00.
 */
const MISMA_HORA_MS = 3 * 3_600_000

/**
 * La tendencia cuando hay más de una lectura por día: **contra la lectura de la
 * misma hora**, un día y siete días antes de la última.
 *
 * Es lo que hace falta con las lecturas de Prefectura, que son dos por día.
 * `tendenciaDe()` toma una por fecha —la última del día—, así que con la última
 * a las 00:00 compararía contra las 12:00 de ayer y «24 h» mediría doce.
 *
 * Mismo criterio que aquélla: el cambio es siempre entre dos lecturas de la
 * misma hora. No se compara contra la del otro turno ni la del día de al lado.
 *
 * **Si la última no tiene pareja, se mide desde la anterior que sí la tenga**,
 * dentro del último día. Pasa todas las tardes: la última es la de las 12:00 y
 * el registro de Prefectura todavía no trae la de las 12:00 de ayer, así que el
 * cambio es el de las 00:00 de hoy contra las 00:00 de ayer. Son 24 horas
 * exactas, terminadas hasta doce horas antes de la última lectura; `ultima` y
 * `atraso` siguen hablando de la última.
 */
export function tendenciaEnHoras(lecturas: LecturaRio[], hoy: string): Tendencia | null {
  if (lecturas.length === 0) return null
  const ordenadas = [...lecturas].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const ultima = ordenadas[ordenadas.length - 1]
  const tUltima = Date.parse(ultima.fecha)

  /** La lectura de la misma hora, `dias` antes de `base` */
  const hace = (base: LecturaRio, dias: number): number | null => {
    const objetivo = Date.parse(base.fecha) - dias * DIA_MS
    let mejor: LecturaRio | null = null
    for (const l of ordenadas) {
      const d = Math.abs(Date.parse(l.fecha) - objetivo)
      if (d <= MISMA_HORA_MS && (!mejor || d < Math.abs(Date.parse(mejor.fecha) - objetivo))) mejor = l
    }
    return mejor ? mejor.m : null
  }

  let base = ultima
  for (let i = ordenadas.length - 1; i >= 0; i--) {
    const l = ordenadas[i]
    if (tUltima - Date.parse(l.fecha) >= DIA_MS) break
    if (hace(l, 1) !== null) { base = l; break }
  }
  const ayer = hace(base, 1)
  const semana = hace(base, 7)

  return {
    ultima: { fecha: ultima.fecha, m: ultima.m },
    atraso: Math.round((Date.parse(hoy.slice(0, 10)) - Date.parse(ultima.fecha.slice(0, 10))) / DIA_MS),
    cambio1: ayer === null ? null : cm(base.m - ayer),
    cambio7: semana === null ? null : cm(base.m - semana),
  }
}

/** Sube, baja o está quieto, según la variación del último día */
export type Sentido = 'sube' | 'baja' | 'quieto' | 'sin_dato'

export function sentidoDe(cambio1: number | null): Sentido {
  if (cambio1 === null) return 'sin_dato'
  if (cambio1 >= QUIETO_M) return 'sube'
  if (cambio1 <= -QUIETO_M) return 'baja'
  return 'quieto'
}

// ── Cuánto antes que en Barranqueras ─────────────────────────────────────────

/**
 * Debajo de esta correlación, el aporte de un afluente no se distingue en la
 * altura de Barranqueras. Pilcomayo, Formosa y Puerto Bermejo dan de 0,48 a
 * 0,68; El Colorado, sobre el Bermejo, 0,11.
 */
export const APORTE_MIN_R = 0.3

/**
 * Lo que se sabe, medido, de cómo llega a Barranqueras lo que pasa por una
 * escala. Hay tres respuestas distintas y la pantalla no las mezcla:
 *
 * - **traslado**: es el mismo río. El máximo de una crecida pasa por acá
 *   `mediana` días antes (negativo) que por Barranqueras, con la mitad de los
 *   años entre `p25` y `p75`. Es lo que vale para el Paraná.
 * - **aporte**: es un afluente. No anuncia la crecida —crece en otra época—,
 *   pero sus cambios de quince días se parecen a lo que Barranqueras hace y
 *   Itá Ibaté no explica, con la mejor coincidencia `k` días antes (negativo),
 *   en una cima ancha entre `desde` y `hasta`.
 * - **no_se_distingue**: se miró y en la altura de Barranqueras no se ve.
 */
export type Anticipacion =
  | { tipo: 'traslado'; mediana: number; p25: number; p75: number; usados: number; anios: number }
  | { tipo: 'aporte'; k: number; desde: number; hasta: number; r: number }
  | { tipo: 'no_se_distingue'; r: number }

/**
 * Lo ya calculado, por archivo. Son ~0,5 s sobre veinte mil días y catorce
 * escalas, y el bloque se vuelve a montar cada vez que se abre el panel.
 */
const calculadas = new WeakMap<TramoDiario, Map<number, Anticipacion>>()

/**
 * La anticipación de cada escala, por id, a partir del registro del tramo.
 * Sale de las mismas funciones que la tabla «Traslado de la crecida»
 * (`lib/rioTraslado.ts`): dos lugares de la misma pantalla no pueden dar dos
 * números distintos para lo mismo.
 */
export function anticipaciones(t: TramoDiario): Map<number, Anticipacion> {
  const hecho = calculadas.get(t)
  if (hecho) return hecho
  const m = new Map<number, Anticipacion>()
  calculadas.set(t, m)
  for (const e of trasladoDelTramo(t)) {
    if (e.picos) {
      m.set(e.estacion, {
        tipo: 'traslado', mediana: e.picos.mediana, p25: e.picos.p25, p75: e.picos.p75,
        usados: e.picos.usados, anios: e.picos.anios,
      })
    }
  }
  for (const e of [...trasladoDelParaguay(t), ...trasladoDelBermejo(t)]) {
    const a = e.aporte
    if (!a) continue
    m.set(e.estacion, a.r >= APORTE_MIN_R
      ? { tipo: 'aporte', k: a.k, desde: a.desde, hasta: a.hasta, r: a.r }
      : { tipo: 'no_se_distingue', r: a.r })
  }
  return m
}
