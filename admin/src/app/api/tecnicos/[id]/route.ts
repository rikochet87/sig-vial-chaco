import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, dbError } from '@/lib/apiAuth'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { id } = await params
  const { nombre, zona, rol, permisos } = await req.json()
  const supabase = createServiceClient()

  // zona solo aplica a técnicos; para otros roles se guarda null
  const zonaFinal = rol === 'tecnico' ? (zona || null) : null

  const { error } = await supabase
    .from('profiles')
    .update({
      nombre,
      zona:     zonaFinal,
      rol,
      permisos: rol === 'usuario' ? (permisos ?? []) : [],
    })
    .eq('id', id)

  if (error) return dbError(error)
  return NextResponse.json({ success: true })
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { id } = await params
  const supabase = createServiceClient()
  await supabase.from('profiles').delete().eq('id', id)
  const { error } = await supabase.auth.admin.deleteUser(id)
  if (error) return dbError(error)
  return NextResponse.json({ success: true })
}
