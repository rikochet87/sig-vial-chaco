import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, dbError, checkOwnerOrAdmin } from '@/lib/apiAuth'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { id } = await params
  const supabase = createServiceClient()

  // Verificar ownership
  const { data: proyecto } = await supabase.from('proyectos_ripio').select('user_id').eq('id', id).single()
  const denied = await checkOwnerOrAdmin(auth.userId, proyecto?.user_id)
  if (denied) return denied

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
  const supabase = createServiceClient()

  // Verificar ownership
  const { data: proyecto } = await supabase.from('proyectos_ripio').select('user_id').eq('id', id).single()
  const denied = await checkOwnerOrAdmin(auth.userId, proyecto?.user_id)
  if (denied) return denied

  // Actualización parcial: el análisis se guarda con autosave y no manda el
  // nombre en cada tecla, así que no se puede exigir.
  const patch: Record<string, unknown> = {}
  if (typeof body.nombre === 'string' && body.nombre.trim()) patch.nombre = body.nombre.trim()
  if (body.analisis !== undefined) {
    patch.analisis = body.analisis
    patch.actualizado_en = new Date().toISOString()
  }
  if (body.precios_base_id !== undefined) patch.precios_base_id = body.precios_base_id

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('proyectos_ripio')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) return dbError(error)
  return NextResponse.json(data)
}
