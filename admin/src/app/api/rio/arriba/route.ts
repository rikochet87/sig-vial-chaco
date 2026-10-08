/**
 * Las escalas aguas arriba de Resistencia, para el bloque «Aguas arriba» del
 * panel del río.
 *
 * ── Por qué una ruta aparte y no más estaciones en `/api/rio` ────────────────
 *
 * `/api/rio` va de a una estación, a propósito (ver ahí): con ráfagas el INA
 * deja de contestar. Sumarle ocho estaciones más duplicaría lo que tarda la
 * franja de Barranqueras, que es lo primero que se mira. Separadas, el panel
 * principal aparece igual que antes y este bloque llega cuando llega; si el INA
 * se cae a mitad de camino, se pierde sólo uno de los dos.
 *
 * Adentro va **de a una también**, por el mismo motivo, y con el mismo guard,
 * la misma caché y la misma depuración de lecturas imposibles (`depurar()` vía
 * `estadoCompleto()`): son escalas del Paraná y del Paraguay, ríos grandes y
 * lentos, donde un salto de dos metros en un día no es una crecida.
 *
 * ── Qué agrega sobre `/api/rio` ───────────────────────────────────────────────
 *
 * La tendencia (`lib/rioArriba.ts`): cuánto cambió en un día y en siete,
 * contra el día exacto, y cuántos días lleva sin informar. Aguas arriba lo que
 * importa es hacia dónde va el río, no sólo cuánto le falta al alerta.
 *
 * No calcula cuántos días tarda el agua en llegar. Eso está medido sólo para
 * Itá Ibaté (`lib/rioTraslado.ts`); para el resto no hay medición y no se
 * inventa.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requirePermiso } from '@/lib/apiAuth'
import {
  ESTACIONES_ARRIBA, estadoCompleto, estadoDe,
  type LecturaRio, type PuntoPronostico, type EstadoRio,
} from '@/lib/ina'
import { tendenciaDe, type Tendencia } from '@/lib/rioArriba'

export const dynamic = 'force-dynamic'

/** Ocho estaciones en serie, contra un organismo que a veces tarda */
export const maxDuration = 60

/** Media hora, como `/api/rio` */
const CACHE_S = 1800

/** Tope de días hacia atrás */
const MAX_DIAS = 400

export interface EstacionArribaConRio {
  id: number
  nombre: string
  rio: 'Paraná' | 'Paraguay'
  alerta: number
  evacuacion: number
  observado: LecturaRio[]
  /** `null` cuando la estación no tiene corrida diaria publicada — varias no la tienen */
  pronostico: { emitido: string; puntos: PuntoPronostico[] } | null
  ultima: { fecha: string; m: number; estado: EstadoRio } | null
  /** Cuántos metros le faltan al alerta. Negativo si ya lo pasó */
  margen: number | null
  tendencia: Tendencia | null
  /** Lecturas que publicó el INA y no se usaron por salto imposible */
  descartadas: LecturaRio[]
}

export async function GET(req: NextRequest) {
  const auth = await requirePermiso('lluvia')
  if (auth instanceof NextResponse) return auth

  const sp = new URL(req.url).searchParams
  const pedido = Number(sp.get('dias') ?? 90)
  const dias = Number.isFinite(pedido)
    ? Math.min(Math.max(Math.round(pedido), 8), MAX_DIAS)
    : 90

  const hasta = new Date()
  const desde = new Date(hasta)
  desde.setDate(desde.getDate() - (dias - 1))
  const d = desde.toISOString().slice(0, 10)
  const h = hasta.toISOString().slice(0, 10)

  const estaciones: EstacionArribaConRio[] = []
  const motivos: string[] = []

  for (const e of ESTACIONES_ARRIBA) {
    try {
      const { observado, descartadas, pronostico } = await estadoCompleto(e.id, d, h)
      const u = observado[observado.length - 1] ?? null
      estaciones.push({
        id: e.id,
        nombre: e.nombre,
        rio: e.rio,
        alerta: e.alerta,
        evacuacion: e.evacuacion,
        observado,
        pronostico,
        ultima: u ? { fecha: u.fecha, m: u.m, estado: estadoDe(e, u.m) } : null,
        margen: u ? Math.round((e.alerta - u.m) * 100) / 100 : null,
        tendencia: tendenciaDe(observado, h),
        descartadas,
      })
    } catch (err) {
      motivos.push(`${e.nombre}: ${err instanceof Error ? err.message : 'error'}`)
    }
  }

  // Si no contestó ninguna, es la fuente: se dice como error, no como lista vacía
  if (estaciones.length === 0) {
    return NextResponse.json(
      { error: motivos[0] ?? 'No se pudo consultar el Alerta Hidrológico', motivos },
      { status: 502 },
    )
  }

  const llegaron = new Set(estaciones.map(e => e.id))
  const sinRespuesta = ESTACIONES_ARRIBA.filter(e => !llegaron.has(e.id)).map(e => e.nombre)

  return NextResponse.json(
    {
      desde: d, hasta: h, dias,
      estaciones,
      sinRespuesta,
      motivos,
      fuente: 'Alerta Hidrológico — Instituto Nacional del Agua',
    },
    { headers: { 'cache-control': `s-maxage=${CACHE_S}, stale-while-revalidate=${CACHE_S * 2}` } },
  )
}
