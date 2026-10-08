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

/** Sube, baja o está quieto, según la variación del último día */
export type Sentido = 'sube' | 'baja' | 'quieto' | 'sin_dato'

export function sentidoDe(cambio1: number | null): Sentido {
  if (cambio1 === null) return 'sin_dato'
  if (cambio1 >= QUIETO_M) return 'sube'
  if (cambio1 <= -QUIETO_M) return 'baja'
  return 'quieto'
}
