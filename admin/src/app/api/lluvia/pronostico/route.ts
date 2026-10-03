/**
 * Pronóstico de lluvia por conjuntos sobre la provincia.
 *
 *   GET /api/lluvia/pronostico → Pronostico (ver lib/pronostico.ts)
 *
 * La consulta está en `lib/pronosticoFuente.ts`, compartida con el cron que lo
 * guarda cada día para medir cuánto acierta.
 *
 * **Pasa por el servidor y se cachea 3 horas**, por lo mismo que el río:
 * Open-Meteo cobra el cupo por ubicación consultada, y si cada navegador pidiera
 * sus ~140 puntos el cupo se iría en una mañana. ECMWF publica una corrida cada
 * 6 horas; con 3 horas de caché nunca se queda más de una atrás.
 */

import { NextResponse } from 'next/server'
import { requirePermiso } from '@/lib/apiAuth'
import { consultarPronostico, CACHE_PRONOSTICO_S } from '@/lib/pronosticoFuente'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requirePermiso('lluvia')
  if (auth instanceof NextResponse) return auth

  try {
    return NextResponse.json(await consultarPronostico(), {
      headers: { 'cache-control': `s-maxage=${CACHE_PRONOSTICO_S}, stale-while-revalidate=${CACHE_PRONOSTICO_S}` },
    })
  } catch (e) {
    console.error('[pronostico]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'No se pudo consultar el pronóstico' }, { status: 502 })
  }
}
