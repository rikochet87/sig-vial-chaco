import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, dbError, requireFields } from '@/lib/apiAuth'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { id } = await params
  const supabase = createServiceClient()

  // Primero eliminar todos los ripios del proyecto (evita error de FK)
  const { error: errRipios } = await supabase
    .from('ripios')
    .delete()
    .eq('proyecto_id', id)
  if (errRipios) return dbError(errRipios)

  // Luego eliminar el proyecto
  const { error } = await supabase
    .from('proyectos_ripio')
    .delete()
    .eq('id', id)
  if (error) return dbError(error)

  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { id } = await params
  const body = await req.json()
  const invalid = requireFields(body, ['nombre'])
  if (invalid) return invalid
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('proyectos_ripio')
    .update({ nombre: body.nombre })
    .eq('id', id)
    .select()
    .single()
  if (error) return dbError(error)
  return NextResponse.json(data)
}
