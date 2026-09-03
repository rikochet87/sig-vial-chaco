import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, dbError, requireFields } from '@/lib/apiAuth'

export async function GET() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const supabase = createServiceClient()

  // Admin ve todos; los demás solo ven sus propios proyectos
  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', auth.userId).single()
  const isAdmin = profile?.rol === 'admin'

  let query = supabase
    .from('proyectos_ripio')
    .select('*, ripios(*)')
    .order('created_at', { ascending: true })
    .order('orden', { ascending: true, referencedTable: 'ripios' })

  if (!isAdmin) query = query.eq('user_id', auth.userId)

  const { data, error } = await query
  if (error) return dbError(error)
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const body = await req.json()
  const invalid = requireFields(body, ['nombre'])
  if (invalid) return invalid
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('proyectos_ripio')
    .insert({ nombre: body.nombre, user_id: auth.userId })
    .select()
    .single()
  if (error) return dbError(error)
  return NextResponse.json(data, { status: 201 })
}
