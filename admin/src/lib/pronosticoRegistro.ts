/**
 * El registro diario del pronóstico: guardarlo y saber cómo viene. Sólo servidor.
 *
 * Lo llama el cron de las 12:00 y, a mano, un administrador. La tabla está en
 * `docs/sql/13-pronostico-registro.sql`.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { CONTORNO_CHACO } from '@/data/contornoChaco'
import { consultarPronostico } from './pronosticoFuente'
import { filasRegistro, grillaEn, hoyArgentina } from './pronostico'

export interface ResultadoRegistro { emitido: string; nodos: number }

/**
 * Guarda el pronóstico de hoy. Si ya se guardó hoy, lo reemplaza: vale el
 * último del día, que es el de la corrida más nueva.
 */
export async function registrarPronostico(supabase: SupabaseClient): Promise<ResultadoRegistro> {
  const p = await consultarPronostico()
  const emitido = hoyArgentina()
  const filas = filasRegistro(p, emitido)
  if (!filas.length) throw new Error('El pronóstico llegó vacío')
  const { error } = await supabase.from('pronostico_lluvia').upsert(filas, { onConflict: 'emitido,lat,lng' })
  if (error) throw Object.assign(new Error(error.message), { code: error.code })
  return { emitido, nodos: filas.length }
}

export interface EstadoRegistro {
  /** Días con pronóstico guardado */
  dias: number
  primero: string | null
  ultimo: string | null
  ultimoConsultado: string | null
}

/**
 * Cuántos días hay guardados. Se cuenta sobre un solo nodo —el primero de la
 * grilla— porque cada emisión guarda todos: contar filas de la tabla entera
 * serían 137 por día para responder lo mismo.
 */
export async function estadoRegistro(supabase: SupabaseClient): Promise<EstadoRegistro> {
  const nodo = grillaEn(CONTORNO_CHACO)[0]
  const { data, error } = await supabase.from('pronostico_lluvia')
    .select('emitido, consultado')
    .eq('lat', nodo.lat).eq('lng', nodo.lng)
    .order('emitido', { ascending: true })
  if (error) throw Object.assign(new Error(error.message), { code: error.code })
  const filas = data ?? []
  return {
    dias: filas.length,
    primero: filas[0]?.emitido ?? null,
    ultimo: filas.at(-1)?.emitido ?? null,
    ultimoConsultado: filas.at(-1)?.consultado ?? null,
  }
}
