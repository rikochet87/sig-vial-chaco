import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServiceClient()

  // Primero eliminar todos los ripios del proyecto (evita error de FK)
  const { error: errRipios } = await supabase
    .from('ripios')
    .delete()
    .eq('proyecto_id', params.id)
  if (errRipios) return NextResponse.json({ error: errRipios.message }, { status: 400 })

  // Luego eliminar el proyecto
  const { error } = await supabase
    .from('proyectos_ripio')
    .delete()
    .eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('proyectos_ripio')
    .update({ nombre: body.nombre })
    .eq('id', params.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
