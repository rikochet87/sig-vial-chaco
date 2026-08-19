import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/apiAuth'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { id } = await params
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('ripios')
    .select('*')
    .eq('proyecto_id', id)
    .order('orden', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { id } = await params
  const body = await req.json()
  const supabase = createServiceClient()

  // Determinar el siguiente orden
  const { count } = await supabase
    .from('ripios')
    .select('*', { count: 'exact', head: true })
    .eq('proyecto_id', id)

  const orden = (count ?? 0)

  const { data, error } = await supabase
    .from('ripios')
    .insert({
      proyecto_id:     id,
      nombre:          body.nombre,
      orden,
      an:              body.an   ?? 6.0,
      e:               body.e    ?? 0.15,
      rho:             body.rho  ?? 2.10,
      l_m:             body.l_m  ?? 0,
      coords:          body.coords ?? null,
      empresa:         body.empresa ?? '',
      fecha_ejecucion: body.fecha_ejecucion ?? null,
      precio_unitario: body.precio_unitario ?? 0,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data, { status: 201 })
}
