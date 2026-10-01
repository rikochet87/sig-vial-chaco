/**
 * Las obras de arte relevadas —puentes, alcantarillas y tubos— con su ubicación,
 * para cruzarlas con las cuencas y la lluvia.
 *
 *   GET /api/lluvia/obras-de-arte → { obras: [{ id, tipo, lat, lng, rutaTramo, fecha }] }
 *
 * ── Por qué una ruta y no una consulta desde el navegador ─────────────────────
 *
 * Las demás pantallas leen `relevamientos` con el cliente del navegador, y ahí
 * lo que ve cada uno lo decide RLS. Esta pantalla es la de Lluvias: quien tiene
 * ese permiso puede no tener el de Relevamientos. Acá se entrega **sólo lo que
 * hace falta para ubicar la obra en una cuenca** —tipo y coordenada— y no el
 * relevamiento: ni las fotos, ni las observaciones, ni quién lo cargó.
 *
 * El guard es el permiso de la pantalla que la consume.
 *
 * ── Qué no es ─────────────────────────────────────────────────────────────────
 *
 * **No es un inventario de obras de arte.** Son las que algún técnico relevó
 * con la app móvil. Una cuenca que devuelve tres alcantarillas puede tener
 * trescientas.
 */

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requirePermiso, dbError } from '@/lib/apiAuth'
import { TIPOS_OBRA, type ObraRelevada, type TipoObra } from '@/lib/redCuencas'

export const dynamic = 'force-dynamic'

const PAGINA = 1000

export async function GET() {
  const auth = await requirePermiso('lluvia')
  if (auth instanceof NextResponse) return auth

  const supabase = createServiceClient()
  const obras: ObraRelevada[] = []
  let sinCoordenada = 0

  for (let off = 0; ; off += PAGINA) {
    const { data, error } = await supabase
      .from('relevamientos')
      .select('id, tipo, coords_lat, coords_lng, ruta_tramo, fecha')
      .in('tipo', [...TIPOS_OBRA])
      // Sin `order` el paginado no es estable y se pierden o repiten filas
      .order('id')
      .range(off, off + PAGINA - 1)
    if (error) return dbError(error, 400, 'leer las obras de arte relevadas')
    if (!data?.length) break

    for (const r of data) {
      const lat = Number(r.coords_lat), lng = Number(r.coords_lng)
      // Un relevamiento sin coordenada existe, pero no se puede ubicar en una
      // cuenca. Se cuenta aparte en vez de perderlo en silencio.
      if (r.coords_lat === null || r.coords_lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        sinCoordenada++
        continue
      }
      obras.push({
        id: r.id as string,
        tipo: r.tipo as TipoObra,
        lat, lng,
        rutaTramo: (r.ruta_tramo as string | null) || null,
        fecha: (r.fecha as string | null) ?? null,
      })
    }
    if (data.length < PAGINA) break
  }

  return NextResponse.json({ obras, sinCoordenada })
}
