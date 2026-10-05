/**
 * Importar los partes de la APA a `mediciones_lluvia`. Sólo servidor.
 *
 * Lo llaman el botón Importar de la pestaña Precisión y el cron de las 12:00.
 * Estaba adentro de la ruta; se sacó acá para que los dos hagan exactamente lo
 * mismo.
 *
 * ── Por qué también el cron ───────────────────────────────────────────────────
 *
 * Esta tabla se llenaba sólo a mano, y la serie diaria por cuenca sale de ella:
 * un parte que la APA publicó y nadie importó se lee como un día sin parte. El
 * 05/10/2026 tenía 11 fechas de 168 y nadie lo había notado. **Un paso manual
 * que hay que hacer cada vez que llueve es un paso que se olvida** — el mismo
 * motivo por el que existe el cron que reinterpola.
 *
 * ── Qué trae ──────────────────────────────────────────────────────────────────
 *
 * Los partes del rango y, en la misma corrida, el modelo en la coordenada
 * exacta de cada estación que informó. El par queda armado y congelado en la
 * fila: no depende de que después se haya ingerido el consorcio
 * correspondiente, ni se mueve si mañana el modelo revisa sus números.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { estacionPorId } from '@/data/estacionesApa'
import { fechasApa, lecturasApa, urlParteApa, type LecturaApa } from './apa'
import { hace, aISO, consultarPuntos, claveCoord } from './lluvia'

const PAGINA = 1000

/**
 * Tope de fechas por corrida.
 *
 * Open-Meteo factura por ubicación y por largo del rango, y la APA quiere una
 * llamada por fecha. Sin tope, pedir "todo el histórico" son 168 llamadas a la
 * APA y un rango de un año sobre 111 estaciones, que se come el cupo diario.
 * Con tope, el backfill se hace en varias corridas y cada una termina.
 */
export const MAX_FECHAS = 25

export interface PedidoImportacion {
  /** AAAA-MM-DD. Por defecto, hace 30 días */
  desde?: string
  /** AAAA-MM-DD. Por defecto, hoy */
  hasta?: string
  /** `false` vuelve a traer también lo ya importado */
  soloNuevas?: boolean
  /** Quién lo pidió. `null` cuando es el cron */
  userId: string | null
}

export interface ResultadoImportacion {
  ok: true
  fechas: number
  guardadas: number
  conModelo?: number
  periodo?: string
  rango?: { desde: string; hasta: string }
  /** Fechas del rango que quedaron para otra corrida */
  pendientes?: number
  sinReconocer?: string[]
  aviso: string | null
}

/** Un fallo de la importación, con el estado HTTP que le corresponde */
export class ErrorImportacion extends Error {
  constructor(mensaje: string, readonly status: number, readonly codigo?: string) {
    super(mensaje)
  }
}

const ISO = /^\d{4}-\d{2}-\d{2}$/

export async function importarPartes(
  supabase: SupabaseClient, pedido: PedidoImportacion,
): Promise<ResultadoImportacion> {
  const desde = ISO.test(pedido.desde ?? '') ? pedido.desde! : hace(30)
  const hasta = ISO.test(pedido.hasta ?? '') ? pedido.hasta! : aISO(new Date())
  if (desde > hasta) throw new ErrorImportacion('El rango está al revés', 400)

  let disponibles: string[]
  try {
    disponibles = (await fechasApa()).filter(f => f >= desde && f <= hasta).sort()
  } catch (e) {
    throw new ErrorImportacion((e as Error).message, 502)
  }

  if (disponibles.length === 0) {
    return { ok: true, fechas: 0, guardadas: 0, aviso: 'La APA no tiene partes cargados en ese rango.' }
  }

  // Saltear lo ya importado, salvo que se pida explícitamente rehacerlo
  if (pedido.soloNuevas !== false) {
    /*
     * **Paginado y con `order`, y sin eso la importación no termina nunca.**
     *
     * La consulta trae una fila por medición, no por fecha, y Supabase corta en
     * mil. Con más de mil mediciones importadas el conjunto de «ya está» venía
     * incompleto: las fechas que quedaban afuera se volvían a traer en cada
     * corrida, siempre las mismas 25, y las más viejas no entraban jamás. No
     * fallaba nada —cada corrida decía que había guardado— y el contador de
     * pendientes se quedaba clavado. Se encontró el 05/10/2026 queriendo
     * completar el histórico: la tabla tenía 11 fechas de 168.
     */
    const ya = new Set<string>()
    for (let off = 0; ; off += PAGINA) {
      const { data, error } = await supabase
        .from('mediciones_lluvia')
        .select('fecha')
        .gte('fecha', desde).lte('fecha', hasta)
        .not('importado_en', 'is', null)
        .order('fecha').order('estacion')
        .range(off, off + PAGINA - 1)
      if (error) throw new ErrorImportacion(error.message, 400, error.code)
      for (const r of data ?? []) ya.add(r.fecha as string)
      if (!data || data.length < PAGINA) break
    }
    disponibles = disponibles.filter(f => !ya.has(f))
  }

  // De las más recientes hacia atrás: si hay que cortar, que quede lo último
  const fechas = disponibles.slice(-MAX_FECHAS)
  if (fechas.length === 0) {
    return { ok: true, fechas: 0, guardadas: 0, aviso: 'Todas las fechas del rango ya estaban importadas.' }
  }

  // ── Los partes ───────────────────────────────────────────────────────────
  const porFecha = new Map<string, LecturaApa[]>()
  let periodo = ''
  const sinReconocer = new Set<string>()

  for (const f of fechas) {
    let r
    try {
      r = await lecturasApa(f)
    } catch (e) {
      // Si se cae a mitad de camino, se guarda lo que ya vino
      if (porFecha.size === 0) throw new ErrorImportacion((e as Error).message, 502)
      break
    }
    periodo = r.periodo || periodo
    const validas = r.lecturas.filter(l => {
      const e = estacionPorId(l.id)
      if (!e) { sinReconocer.add(`${l.nombre} (id ${l.id})`); return false }
      return true
    })
    if (validas.length) porFecha.set(f, validas)
  }

  if (porFecha.size === 0) {
    return {
      ok: true, fechas: 0, guardadas: 0,
      aviso: 'Las fechas del rango vinieron sin ninguna estación informada.',
    }
  }

  // ── El modelo, en la coordenada de cada estación que informó ─────────────
  const traidas = [...porFecha.keys()].sort()
  const estaciones = new Map<number, { lat: number; lng: number }>()
  for (const ls of porFecha.values()) {
    for (const l of ls) {
      const e = estacionPorId(l.id)
      if (e) estaciones.set(l.id, { lat: e.lat, lng: e.lng })
    }
  }

  let modelo = new Map<string, Map<string, number>>()
  let avisoModelo: string | null = null
  try {
    modelo = await consultarPuntos([...estaciones.values()], traidas[0], traidas[traidas.length - 1])
  } catch (e) {
    // Sin el modelo la medición sigue valiendo: se guarda igual
    avisoModelo = `Se guardaron las mediciones pero no se pudo consultar el modelo: ${(e as Error).message}`
  }

  // ── Guardar ──────────────────────────────────────────────────────────────
  const ahora = new Date().toISOString()
  const filas = []
  for (const [f, ls] of porFecha) {
    for (const l of ls) {
      const e = estacionPorId(l.id)!
      const mm = modelo.get(claveCoord({ lat: e.lat, lng: e.lng }))?.get(f)
      filas.push({
        estacion: e.nombre,
        fecha: f,
        mm: l.mm,
        mm_modelo: mm == null ? null : Math.round(mm * 100) / 100,
        red: 'apa',
        periodo: periodo || null,
        fuente_url: urlParteApa(f),
        cargado_por: pedido.userId,
        cargado_en: ahora,
        importado_en: ahora,
      })
    }
  }

  const { error } = await supabase
    .from('mediciones_lluvia')
    .upsert(filas, { onConflict: 'estacion,fecha' })
  if (error) throw new ErrorImportacion(error.message, 400, error.code)

  return {
    ok: true,
    fechas: porFecha.size,
    guardadas: filas.length,
    conModelo: filas.filter(f => f.mm_modelo != null).length,
    periodo,
    rango: { desde: traidas[0], hasta: traidas[traidas.length - 1] },
    pendientes: Math.max(0, disponibles.length - fechas.length),
    sinReconocer: [...sinReconocer],
    aviso: avisoModelo,
  }
}
