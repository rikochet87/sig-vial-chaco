/**
 * La lámina máxima diaria de la provincia, para la línea de tiempo.
 *
 * ── Por qué una ruta aparte ───────────────────────────────────────────────────
 *
 * La línea de tiempo muestra **más días que el rango elegido**: su gracia es ver
 * dónde cae el período que uno está mirando dentro de los últimos meses. Pedirle
 * eso a `/api/lluvia` significaría traer el resumen de los 103 consorcios para
 * 90 días sólo para quedarse con un número por fecha.
 *
 * Acá se devuelve una fila por día y nada más.
 *
 * ── Qué número es ─────────────────────────────────────────────────────────────
 *
 * El **máximo** entre consorcios de ese día, no el promedio. La línea existe
 * para encontrar los eventos, y un temporal que cae sobre tres consorcios
 * desaparece en un promedio de 103. Se prefiere `mm_fusion` cuando está, que es
 * el criterio de toda la pantalla.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, dbError } from '@/lib/apiAuth'
import { hace, aISO } from '@/lib/lluvia'

export const dynamic = 'force-dynamic'

/** Tope de días, para que nadie pida el histórico entero sin querer */
const MAX_DIAS = 400
const PAGINA = 1000

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const pedido = Number(new URL(req.url).searchParams.get('dias') ?? 90)
  const dias = Number.isFinite(pedido) ? Math.min(Math.max(Math.round(pedido), 1), MAX_DIAS) : 90

  // `dias - 1`: el rango incluye las dos puntas, así que de hoy menos 89 a hoy
  // hay 90 días. Es el mismo criterio que los presets de la pantalla.
  const desde = hace(dias - 1)
  const hasta = aISO(new Date())

  const supabase = createServiceClient()
  const maximo = new Map<string, number>()

  for (let off = 0; ; off += PAGINA) {
    const { data, error } = await supabase
      .from('precipitaciones')
      .select('fecha, mm, mm_fusion')
      .gte('fecha', desde).lte('fecha', hasta)
      // Sin `order` el paginado no es estable y se pierden o repiten filas
      .order('fecha')
      .range(off, off + PAGINA - 1)
    if (error) return dbError(error)
    if (!data?.length) break

    for (const r of data) {
      const f = r.fecha as string
      const mm = Number(r.mm_fusion ?? r.mm)
      if (!Number.isFinite(mm)) continue
      const previo = maximo.get(f)
      if (previo === undefined || mm > previo) maximo.set(f, mm)
    }
    if (data.length < PAGINA) break
  }

  // Una fila por día del rango, incluso los que no tienen dato: la línea de
  // tiempo tiene que mostrar los huecos, no comprimirlos.
  const serie: { fecha: string; mm: number | null }[] = []
  const dia = 86_400_000
  for (let t = Date.parse(desde); t <= Date.parse(hasta); t += dia) {
    const f = aISO(new Date(t))
    serie.push({ fecha: f, mm: maximo.has(f) ? Math.round(maximo.get(f)! * 10) / 10 : null })
  }

  return NextResponse.json({ desde, hasta, dias: serie.length, serie })
}
