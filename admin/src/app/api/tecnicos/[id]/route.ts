import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { nombre, zona, rol } = await req.json()
  const supabase = createServiceClient()

  // zona solo aplica a técnicos; para otros roles se guarda null
  const zonaFinal = rol === 'tecnico' ? (zona || null) : null

  const { error } = await supabase
    .from('profiles')
    .update({ nombre, zona: zonaFinal, rol })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()
  await supabase.from('profiles').delete().eq('id', id)
  const { error } = await supabase.auth.admin.deleteUser(id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
