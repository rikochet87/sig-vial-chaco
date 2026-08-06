import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('obras')
    .insert({
      tipo:              body.tipo,
      jurisdiccion:      body.jurisdiccion,
      consorcio_numero:  body.consorcio_numero ?? null,
      ubicacion:         body.ubicacion ?? null,
      descripcion:       body.descripcion ?? null,
      estado:            body.estado ?? 'planificada',
      fecha_inicio:      body.fecha_inicio ?? null,
      fecha_fin_estimada: body.fecha_fin_estimada ?? null,
      cantidad:          body.cantidad ?? null,
      unidad:            body.unidad ?? null,
      presupuesto_total: body.presupuesto_total ?? null,
      aporte_dvp:        body.aporte_dvp ?? null,
      aporte_ccc:        body.aporte_ccc ?? null,
      precio_unitario:   body.precio_unitario ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data, { status: 201 })
}

export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('obras')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
