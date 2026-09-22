/**
 * Lo que midió cada pluviómetro en el período, para dibujar las isohietas.
 *
 *   GET /api/lluvia/estaciones?desde=&hasta=  → [{ nombre, lat, lng, mm, dias }]
 *
 * Devuelve **todas las estaciones activas**, incluidas las que sumaron cero.
 * Eso no es relleno: sin los ceros la interpolación pintaría lluvia sobre toda
 * la provincia, porque no tendría con qué saber dónde no llovió. La APA nunca
 * publica un cero —mínimo 1 mm— así que hay que deducirlo, y está fundado: la
 * tasa de reporte sube del 11 % al 86 % según cuánta lluvia hubo. Ver
 * `ESTACIONES_ACTIVAS` en `data/estacionesApa.ts`.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, dbError } from '@/lib/apiAuth'
import { hace, aISO } from '@/lib/lluvia'
import { ESTACIONES_ACTIVAS } from '@/data/estacionesApa'

const PAGINA = 1000

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(req.url)
  const desde = searchParams.get('desde') ?? hace(30)
  const hasta = searchParams.get('hasta') ?? aISO(new Date())
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    return NextResponse.json({ error: 'Fechas inválidas: se espera AAAA-MM-DD' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const total = new Map<string, { mm: number; dias: number }>()
  const fechas = new Set<string>()

  for (let off = 0; ; off += PAGINA) {
    const { data, error } = await supabase
      .from('mediciones_lluvia')
      .select('estacion, fecha, mm')
      .gte('fecha', desde).lte('fecha', hasta)
      .range(off, off + PAGINA - 1)
    if (error) return dbError(error)
    if (!data?.length) break
    for (const r of data) {
      fechas.add(r.fecha as string)
      const a = total.get(r.estacion as string) ?? { mm: 0, dias: 0 }
      a.mm += Number(r.mm)
      a.dias++
      total.set(r.estacion as string, a)
    }
    if (data.length < PAGINA) break
  }

  // Sin ningún parte en el rango no se puede afirmar nada: mejor decirlo que
  // devolver 71 ceros y que el mapa dibuje una provincia seca que no se midió.
  if (fechas.size === 0) {
    return NextResponse.json({
      desde, hasta, fechasConParte: 0, estaciones: [],
      aviso: 'No hay mediciones de la APA cargadas en ese período.',
    })
  }

  const estaciones = ESTACIONES_ACTIVAS.map(e => {
    const a = total.get(e.nombre)
    return {
      nombre: e.nombre,
      lat: e.lat,
      lng: e.lng,
      mm: a ? Math.round(a.mm * 10) / 10 : 0,
      dias: a?.dias ?? 0,
    }
  })

  return NextResponse.json({
    desde, hasta,
    fechasConParte: fechas.size,
    estaciones,
    conLluvia: estaciones.filter(e => e.mm > 0).length,
  })
}
