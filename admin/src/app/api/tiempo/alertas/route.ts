/**
 * Las alertas vigentes del SMN que tocan el Chaco.
 *
 *   GET /api/tiempo/alertas → { alertas, revisados, fallaron, consultado }
 *
 * Diez minutos de caché: los avisos a muy corto plazo duran dos horas.
 *
 * **Si el SMN no contesta, se dice.** Una lista vacía por error se leería como
 * "no hay alertas", que es la respuesta falsa más peligrosa que puede dar esta
 * ruta. Por eso un fallo es un 502 y no una lista vacía, y `fallaron` cuenta
 * los avisos sueltos que no se pudieron leer.
 */
import { NextResponse } from 'next/server'
import { requireAlgunPermiso } from '@/lib/apiAuth'
import { consultarAlertas, CACHE_ALERTAS_S } from '@/lib/tiempoFuente'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAlgunPermiso(['dashboard', 'lluvia'])
  if (auth instanceof NextResponse) return auth
  try {
    const r = await consultarAlertas()
    return NextResponse.json({ ...r, consultado: new Date().toISOString() }, {
      headers: { 'cache-control': `s-maxage=${CACHE_ALERTAS_S}, stale-while-revalidate=${CACHE_ALERTAS_S}` },
    })
  } catch (e) {
    console.error('[alertas smn]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'No se pudo consultar al SMN' }, { status: 502 })
  }
}
