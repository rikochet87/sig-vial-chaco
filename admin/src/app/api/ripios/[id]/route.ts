import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, dbError, checkOwnerOrAdmin } from '@/lib/apiAuth'

async function getRipioOwner(supabase: ReturnType<typeof createServiceClient>, ripioId: string) {
  const { data: ripio } = await supabase
    .from('ripios')
    .select('proyecto_id')
    .eq('id', ripioId)
    .single()
  if (!ripio) return null
  const { data: proyecto } = await supabase
    .from('proyectos_ripio')
    .select('user_id')
    .eq('id', ripio.proyecto_id)
    .single()
  return proyecto?.user_id ?? null
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { id } = await params
  const body = await req.json()
  const supabase = createServiceClient()

  // Verificar ownership a través del proyecto
  const ownerId = await getRipioOwner(supabase, id)
  const denied = await checkOwnerOrAdmin(auth.userId, ownerId)
  if (denied) return denied

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

  if (error) return dbError(error)
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { id } = await params
  const supabase = createServiceClient()

  // Verificar ownership a través del proyecto
  const ownerId = await getRipioOwner(supabase, id)
  const denied = await checkOwnerOrAdmin(auth.userId, ownerId)
  if (denied) return denied

  const { error } = await supabase
    .from('ripios')
    .delete()
    .eq('id', id)
  if (error) return dbError(error)
  return NextResponse.json({ ok: true })
}
