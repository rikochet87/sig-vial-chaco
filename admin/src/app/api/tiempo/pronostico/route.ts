/**
 * El pronóstico del tiempo por consorcio, 7 días.
 *
 *   GET /api/tiempo/pronostico → PronosticoTiempo (ver lib/tiempo.ts)
 *
 * Pasa por el servidor y se cachea una hora: son 103 ubicaciones contra el cupo
 * de Open-Meteo, que se cuenta por ubicación, y la pantalla del Dashboard la
 * abre cualquiera que entra al panel.
 */
import { NextResponse } from 'next/server'
import { requireAlgunPermiso } from '@/lib/apiAuth'
import { consultarTiempo, CACHE_TIEMPO_S } from '@/lib/tiempoFuente'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAlgunPermiso(['dashboard', 'lluvia'])
  if (auth instanceof NextResponse) return auth
  try {
    return NextResponse.json(await consultarTiempo(), {
      headers: { 'cache-control': `s-maxage=${CACHE_TIEMPO_S}, stale-while-revalidate=${CACHE_TIEMPO_S}` },
    })
  } catch (e) {
    console.error('[tiempo]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'No se pudo consultar el pronóstico' }, { status: 502 })
  }
}
