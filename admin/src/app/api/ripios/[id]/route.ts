import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const supabase = createServiceClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = {}
  const fields = ['nombre','an','e','rho','l_m','coords','empresa','fecha_ejecucion','precio_unitario','color']
  for (const f of fields) {
    if (body[f] !== undefined) update[f] = body[f]
  }

  const { data, error } = await supabase
    .from('ripios')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('ripios')
    .delete()
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
