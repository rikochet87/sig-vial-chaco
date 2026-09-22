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
  //
  // `mm_fusion` es la interpolación de los pluviómetros de la APA y es el número
  // que se muestra; `mm` es el modelo y queda de respaldo para las fechas que
  // todavía no se fusionaron —las anteriores a que esto existiera, o aquellas en
  // que la APA no publicó parte.
  const registros: RegistroLluvia[] = []
  const proc = new Map<number, { peor: string; dist: number; n: number; fusionadas: number }>()
  // `sin_calcular` es la peor de todas: significa que el número que se está
  // mostrando ni siquiera pasó por los pluviómetros todavía.
  const ORDEN: Record<string, number> = {
    medido: 0, interpolado: 1, estimado: 2, sin_calcular: 3,
  }

  for (let desplazamiento = 0; ; desplazamiento += PAGINA) {
    const { data, error } = await supabase
      .from('precipitaciones')
      .select('consorcio_numero, fecha, mm, mm_fusion, procedencia, dist_pluviometro_km')
      .gte('fecha', desde).lte('fecha', hasta)
      .order('fecha')
      .range(desplazamiento, desplazamiento + PAGINA - 1)
    if (error) return dbError(error)
    if (!data?.length) break

    for (const r of data) {
      const cc = r.consorcio_numero as number
      registros.push({
        consorcio_numero: cc,
        fecha: r.fecha as string,
        mm: Number(r.mm_fusion ?? r.mm),
      })
      // La procedencia del período es la peor de sus días: si algún día del
      // rango salió del modelo, el acumulado no es enteramente medido.
      //
      // Sin `mm_fusion` la fila nunca se cruzó con los pluviómetros, y eso NO
      // es lo mismo que "no había ninguno cerca". Etiquetarlo como `estimado`
      // hacía que el mapa afirmara "sin pluviómetro a menos de 60 km" sobre
      // consorcios que tienen uno a 12 km.
      const p = r.mm_fusion == null
        ? 'sin_calcular'
        : ((r.procedencia as string) ?? 'sin_calcular')
      let a = proc.get(cc)
      if (!a) { a = { peor: 'medido', dist: 0, n: 0, fusionadas: 0 }; proc.set(cc, a) }
      if (ORDEN[p] > ORDEN[a.peor]) a.peor = p
      if (r.dist_pluviometro_km != null) { a.dist += Number(r.dist_pluviometro_km); a.n++ }
      if (r.mm_fusion != null) a.fusionadas++
    }
    if (data.length < PAGINA) break
  }

  // Última fecha con dato: sirve para avisar en pantalla si la ingesta se atrasó
  const { data: ultima } = await supabase
    .from('precipitaciones')
    .select('fecha')
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle()

  const consorcios = resumirPorConsorcio(registros).map(c => {
    const a = proc.get(c.numero)
    return {
      ...c,
      procedencia: a?.peor ?? 'sin_calcular',
      distanciaKm: a && a.n ? Math.round((a.dist / a.n) * 10) / 10 : null,
    }
  })

  return NextResponse.json({
    desde, hasta,
    consorcios,
    episodios: detectarEpisodios(registros),
    ultimaFechaCargada: ultima?.fecha ?? null,
    filas: registros.length,
    // Cuántas de las filas del rango ya tienen la interpolación calculada
    fusionadas: [...proc.values()].reduce((s, a) => s + a.fusionadas, 0),
  })
}
