/**
 * El registro diario de la crecida desde Brasil: guardarlo, saber cómo viene
 * y medir cuánto acierta. Sólo servidor. La tabla está en
 * `docs/sql/15-pronostico-crecida.sql`; lo puro, en `crecidaAcierto.ts`.
 *
 * Lo llama el cron de las 09:00 (`/api/rio/crecida/registro`) y, a mano, un
 * administrador.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { calcularCrecida } from './crecidaCalculo'
import { aciertoCrecida, filaDeCrecida, type AciertoPlazo, type FilaCrecida } from './crecidaAcierto'

const TABLA = 'pronostico_crecida'

/**
 * Calcula y guarda la de hoy. Si ya se guardó hoy, la reemplaza: vale la
 * última del día.
 */
export async function registrarCrecida(supabase: SupabaseClient) {
  const fila = filaDeCrecida(await calcularCrecida())
  const { error } = await supabase.from(TABLA).upsert(fila, { onConflict: 'emitido' })
  if (error) throw Object.assign(new Error(error.message), { code: error.code })
  return { emitido: fila.emitido, alturaHoy: fila.altura_hoy, corridas: fila.corridas, dias: fila.dias }
}

export interface EstadoCrecida {
  /** Días con pronóstico guardado */
  dias: number
  primero: string | null
  ultimo: string | null
  ultimoConsultado: string | null
  acierto: AciertoPlazo[]
}

const COLUMNAS = 'emitido, altura_hoy, altura_fecha, dia0, dias, corridas, alturas, sin_lluvia, consultado'

/**
 * Lo guardado y su acierto. Pagina con `order`: una fila por día no llega a
 * mil en años, pero en este repo toda lectura que pueda pasar de mil filas va
 * con `range()`.
 */
export async function estadoCrecida(supabase: SupabaseClient): Promise<EstadoCrecida> {
  const filas: (Parameters<typeof aciertoCrecida>[0][number] & { consultado: string })[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase.from(TABLA).select(COLUMNAS)
      .order('emitido', { ascending: true }).range(desde, desde + 999)
    if (error) throw Object.assign(new Error(error.message), { code: error.code })
    filas.push(...((data ?? []) as unknown as typeof filas))
    if (!data || data.length < 1000) break
  }
  return {
    dias: filas.length,
    primero: filas[0]?.emitido ?? null,
    ultimo: filas.at(-1)?.emitido ?? null,
    ultimoConsultado: filas.at(-1)?.consultado ?? null,
    acierto: aciertoCrecida(filas),
  }
}

export type { FilaCrecida }
