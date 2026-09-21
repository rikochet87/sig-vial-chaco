/**
 * Consulta de precipitaciones ya ingeridas.
 *
 *   GET /api/lluvia?desde=&hasta=            → resumen por consorcio + episodios
 *   GET /api/lluvia?desde=&hasta=&consorcio= → la serie diaria de uno solo
 *
 * Lee de la tabla, no de Open-Meteo: la ingesta ya trajo el dato y acá interesa
 * que la pantalla responda rápido y que el número sea el mismo que se citó en un
 * expediente la semana pasada, aunque el modelo lo haya reajustado después.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, dbError } from '@/lib/apiAuth'
import { resumirPorConsorcio, detectarEpisodios, hace, aISO, type RegistroLluvia } from '@/lib/lluvia'

/** Supabase corta en 1000 filas por defecto; 103 consorcios × 400 días no entran. */
const PAGINA = 1000

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(req.url)
  const desde = searchParams.get('desde') ?? hace(30)
  const hasta = searchParams.get('hasta') ?? aISO(new Date())
  const consorcio = searchParams.get('consorcio')

  const supabase = createServiceClient()

  // ── Serie de un consorcio ────────────────────────────────────────────────
  if (consorcio) {
    const n = Number(consorcio)
    if (!Number.isInteger(n)) {
      return NextResponse.json({ error: 'consorcio tiene que ser un número' }, { status: 400 })
    }
    const { data, error } = await supabase
      .from('precipitaciones')
      .select('fecha, mm, fuente')
      .eq('consorcio_numero', n)
      .gte('fecha', desde).lte('fecha', hasta)
      .order('fecha')
    if (error) return dbError(error)
    const total = (data ?? []).reduce((s, r) => s + Number(r.mm), 0)
    return NextResponse.json({
      desde, hasta, consorcio: n,
      total: Math.round(total * 10) / 10,
      serie: data ?? [],
    })
  }

  // ── Provincia entera ─────────────────────────────────────────────────────
  const registros: RegistroLluvia[] = []
  for (let desplazamiento = 0; ; desplazamiento += PAGINA) {
    const { data, error } = await supabase
      .from('precipitaciones')
      .select('consorcio_numero, fecha, mm')
      .gte('fecha', desde).lte('fecha', hasta)
      .order('fecha')
      .range(desplazamiento, desplazamiento + PAGINA - 1)
    if (error) return dbError(error)
    if (!data?.length) break
    registros.push(...data.map(r => ({
      consorcio_numero: r.consorcio_numero as number,
      fecha: r.fecha as string,
      mm: Number(r.mm),
    })))
    if (data.length < PAGINA) break
  }

  // Última fecha con dato: sirve para avisar en pantalla si la ingesta se atrasó
  const { data: ultima } = await supabase
    .from('precipitaciones')
    .select('fecha')
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({
    desde, hasta,
    consorcios: resumirPorConsorcio(registros),
    episodios: detectarEpisodios(registros),
    ultimaFechaCargada: ultima?.fecha ?? null,
    filas: registros.length,
  })
}
