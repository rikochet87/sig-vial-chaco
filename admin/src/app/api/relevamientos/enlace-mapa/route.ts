/**
 * La coordenada de un enlace corto de Google Maps.
 *
 *   GET /api/relevamientos/enlace-mapa?url=https://maps.app.goo.gl/…
 *     → { lat, lng, origen } | { error }
 *
 * Lo que se comparte desde el celular es un `maps.app.goo.gl/…`, que no trae
 * la coordenada: hay que seguir la redirección, y el navegador no puede (no
 * hay CORS). El enlace largo se lee en el navegador y no pasa por acá.
 *
 * - **Sólo sigue hosts de Google**, salto por salto con `redirect: 'manual'`:
 *   una ruta que sigue cualquier URL que le pasen es una puerta para que el
 *   servidor pida lo que sea a nombre de quien la llama.
 * - **No baja ninguna página**: lee la cabecera `Location` y nada más.
 * - Un enlace a un lugar por nombre puede no traer ningún número: se dice, en
 *   vez de devolver otra cosa.
 */

import { NextResponse } from 'next/server'
import { requirePermiso } from '@/lib/apiAuth'
import { coordenadaDeEnlace, esEnlaceCorto, esHostGoogle, HOSTS_CORTOS } from '@/lib/coordenadas'

export const dynamic = 'force-dynamic'

const SALTOS_MAX = 5
const TIEMPO_MS = 8000

const esDeGoogle = (u: URL) =>
  u.protocol === 'https:'
  && (esHostGoogle(u.hostname) || HOSTS_CORTOS.includes(u.hostname))

export async function GET(request: Request) {
  const auth = await requirePermiso('relevamientos')
  if (auth instanceof NextResponse) return auth

  const pedida = new URL(request.url).searchParams.get('url') ?? ''
  if (!esEnlaceCorto(pedida)) {
    return NextResponse.json({ error: 'No es un enlace corto de Google Maps' }, { status: 400 })
  }

  let actual = new URL(pedida.trim())
  try {
    for (let i = 0; i < SALTOS_MAX; i++) {
      const c = coordenadaDeEnlace(actual.toString())
      if (c) return NextResponse.json(c)

      const r = await fetch(actual, { redirect: 'manual', signal: AbortSignal.timeout(TIEMPO_MS) })
      await r.body?.cancel()
      const destino = r.headers.get('location')
      if (r.status < 300 || r.status >= 400 || !destino) break
      const siguiente = new URL(destino, actual)
      if (!esDeGoogle(siguiente)) {
        return NextResponse.json({ error: 'El enlace lleva fuera de Google Maps' }, { status: 422 })
      }
      actual = siguiente
    }
  } catch {
    return NextResponse.json({ error: 'No se pudo abrir el enlace. Probá de nuevo o pegá el enlace largo.' }, { status: 502 })
  }
  return NextResponse.json({
    error: 'El enlace no trae coordenadas (es un lugar por nombre). Abrilo, tocá el punto en el mapa y copiá las coordenadas que muestra Google.',
  }, { status: 422 })
}
