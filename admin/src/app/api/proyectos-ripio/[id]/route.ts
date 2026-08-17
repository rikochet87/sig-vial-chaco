import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()

  // Primero eliminar todos los ripios del proyecto (evita error de FK)
  const { error: errRipios } = await supabase
    .from('ripios')
    .delete()
    .eq('proyecto_id', id)
  if (errRipios) return NextResponse.json({ error: errRipios.message }, { status: 400 })

  // Luego eliminar el proyecto
  const { error } = await supabase
    .from('proyectos_ripio')
    .delete()
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('proyectos_ripio')
    .update({ nombre: body.nombre })
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
