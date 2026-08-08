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
      precio_unitario:    body.precio_unitario ?? null,
      datos_calculadora:  body.datos_calculadora ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data, { status: 201 })
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const supabase = createServiceClient()

  if (id) {
    const { data, error } = await supabase.from('obras').select('*').eq('id', id).single()
    if (error) return NextResponse.json({ error: error.message }, { status: 404 })
    return NextResponse.json(data)
  }

  const { data, error } = await supabase
    .from('obras')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, ...fields } = body
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('obras')
    .update({
      tipo:               fields.tipo,
      jurisdiccion:       fields.jurisdiccion,
      consorcio_numero:   fields.consorcio_numero ?? null,
      ubicacion:          fields.ubicacion ?? null,
      descripcion:        fields.descripcion ?? null,
      estado:             fields.estado,
      fecha_inicio:       fields.fecha_inicio ?? null,
      fecha_fin_estimada: fields.fecha_fin_estimada ?? null,
      cantidad:           fields.cantidad ?? null,
      unidad:             fields.unidad ?? null,
      presupuesto_total:  fields.presupuesto_total ?? null,
      aporte_dvp:         fields.aporte_dvp ?? null,
      aporte_ccc:         fields.aporte_ccc ?? null,
      precio_unitario:    fields.precio_unitario ?? null,
      datos_calculadora:  fields.datos_calculadora ?? null,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const supabase = createServiceClient()
  const { error } = await supabase.from('obras').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
