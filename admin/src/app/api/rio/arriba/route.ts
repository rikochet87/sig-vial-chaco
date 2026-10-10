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
 * Las alturas son las de Prefectura y el pronóstico el del INA
 * (`lib/rioFuente.ts`); Las Palmas e Isla del Cerrito sólo están en Prefectura.
 *
 * La tendencia (`lib/rioArriba.ts`): cuánto cambió en un día y en siete,
 * contra la lectura de la misma hora, y cuántos días lleva sin informar. Aguas arriba lo que
 * importa es hacia dónde va el río, no sólo cuánto le falta al alerta.
 *
 * No calcula cuántos días tarda el agua en llegar: eso es historia, no el dato
 * del día, y sale del registro congelado (`anticipaciones()` en
 * `lib/rioArriba.ts`, sobre `public/rio/tramo_diario.json`), que el navegador
 * ya tiene. Pedírselo al INA en cada visita sería bajar medio siglo para
 * recalcular siempre lo mismo.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requirePermiso } from '@/lib/apiAuth'
import {
  ESTACIONES_ARRIBA, estadoDe,
  type LecturaRio, type PuntoPronostico, type EstadoRio,
} from '@/lib/ina'
import { tendenciaEnHoras, type Tendencia } from '@/lib/rioArriba'
import {
  ESCALAS_SOLO_PREFECTURA, prefecturaOAviso, type LecturaPrefectura,
} from '@/lib/prefectura'
import { escalaDelDia } from '@/lib/rioFuente'

export const dynamic = 'force-dynamic'

/** Once escalas en serie, contra dos organismos que a veces tardan */
export const maxDuration = 60

/** Media hora, como `/api/rio` */
const CACHE_S = 1800

/** Tope de días hacia atrás */
const MAX_DIAS = 400

export interface EstacionArribaConRio {
  id: number
  nombre: string
  rio: 'Paraná' | 'Paraguay' | 'Bermejo'
  /** Los de Prefectura si los publica; si no, los del INA. `null` donde no hay ninguno */
  alerta: number | null
  evacuacion: number | null
  observado: LecturaRio[]
  /** `null` cuando la estación no tiene corrida diaria publicada — varias no la tienen */
  pronostico: { emitido: string; puntos: PuntoPronostico[] } | null
  ultima: { fecha: string; m: number; estado: EstadoRio } | null
  /** Cuántos metros le faltan al alerta. Negativo si ya lo pasó */
  margen: number | null
  tendencia: Tendencia | null
  /** Lecturas que publicó el INA y no se usaron por salto imposible */
  descartadas: LecturaRio[]
  /** La última lectura, cuando es de Prefectura; `null` si es la del INA */
  prefectura: LecturaPrefectura | null
  /** Lecturas de Prefectura que no se usaron, por salto imposible o fecha futura */
  descartadasPrefectura: LecturaRio[]
  /** La escala no está en el INA: no tiene pronóstico ni anticipación medida */
  soloPrefectura: boolean
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

  // Las últimas alturas de todas las escalas, en un pedido. Si falla, sigue el INA solo y se dice.
  const pna = await prefecturaOAviso()
  const ahora = Date.now()
  const sinHistorico: string[] = []
  const sinIna: string[] = []

  /*
   * Las del INA y, después de Puerto Bermejo, las dos que sólo tiene
   * Prefectura: Las Palmas e Isla del Cerrito. El grupo del Paraguay queda en
   * el orden del agua.
   */
  const escalas = [
    ...ESTACIONES_ARRIBA.map(e => ({ ...e, enIna: true })),
    ...ESCALAS_SOLO_PREFECTURA.map(e => ({ ...e, alerta: null, evacuacion: null, enIna: false })),
  ]
  const orden = (rio: string) => (rio === 'Paraná' ? 0 : rio === 'Paraguay' ? 1 : 2)
  escalas.sort((a, b) => orden(a.rio) - orden(b.rio))

  for (const e of escalas) {
    try {
      const r = await escalaDelDia(e.id, e.enIna, pna.filas, d, h, ahora)
      if (r.sinHistorico) sinHistorico.push(e.nombre)
      if (r.sinIna) sinIna.push(e.nombre)
      const alerta = r.umbralPrefectura?.alerta ?? e.alerta
      const evacuacion = r.umbralPrefectura?.evacuacion ?? e.evacuacion
      const u = r.observado[r.observado.length - 1] ?? null
      estaciones.push({
        id: e.id,
        nombre: e.nombre,
        rio: e.rio,
        alerta,
        evacuacion,
        observado: r.observado,
        pronostico: r.pronostico,
        ultima: u
          ? {
              fecha: u.fecha, m: u.m,
              estado: alerta !== null && evacuacion !== null
                ? estadoDe({ alerta, evacuacion }, u.m)
                : 'sin_umbral',
            }
          : null,
        // Sin umbral publicado no hay margen: no se inventa uno
        margen: u && alerta !== null ? Math.round((alerta - u.m) * 100) / 100 : null,
        // Contra la lectura de la misma hora: Prefectura lee dos veces por día
        tendencia: tendenciaEnHoras(r.observado, h),
        descartadas: r.descartadas,
        prefectura: r.prefectura,
        descartadasPrefectura: r.descartadasPrefectura,
        soloPrefectura: !e.enIna,
      })
    } catch (err) {
      motivos.push(`${e.nombre}: ${err instanceof Error ? err.message : 'error'}`)
    }
  }

  // Si no contestó ninguna, es la fuente: se dice como error, no como lista vacía
  if (estaciones.length === 0) {
    return NextResponse.json(
      { error: motivos[0] ?? 'No se pudo consultar el río', motivos },
      { status: 502 },
    )
  }

  const llegaron = new Set(estaciones.map(e => e.id))
  const sinRespuesta = escalas.filter(e => !llegaron.has(e.id)).map(e => e.nombre)

  return NextResponse.json(
    {
      desde: d, hasta: h, dias,
      estaciones,
      sinRespuesta,
      motivos,
      fuente: 'Prefectura Naval Argentina (alturas y niveles) e Instituto Nacional del Agua (pronóstico)',
      prefectura: { ok: pna.filas !== null, motivo: pna.motivo, sinHistorico },
      sinIna,
    },
    { headers: { 'cache-control': `s-maxage=${CACHE_S}, stale-while-revalidate=${CACHE_S * 2}` } },
  )
}
