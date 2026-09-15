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
    .is('archivado_en', null)
    .order('created_at', { ascending: true })
    .order('orden', { ascending: true, referencedTable: 'ripios' })

  if (!isAdmin) query = query.eq('user_id', auth.userId)

  const { data: crudo, error } = await query
  if (error) return dbError(error)

  // Los tramos archivados se filtran acá y no en la consulta: filtrar un
  // recurso embebido en PostgREST cambia la semántica del join, y el volumen
  // es chico como para no complicarlo.
  const data = (crudo ?? []).map(p => ({
    ...p,
    ripios: Array.isArray(p.ripios)
      ? (p.ripios as Record<string, unknown>[]).filter(r => !r.archivado_en)
      : [],
  }))

  // Adjuntar el nombre de quien creó cada proyecto. Se resuelve acá y no con un
  // join porque `profiles` no tiene FK declarada desde `proyectos_ripio`, y una
  // sola consulta por lote es más barata que una por fila.
  const ids = Array.from(new Set(
    (data ?? []).map(p => p.user_id).filter((v): v is string => typeof v === 'string')
  ))
  let nombres = new Map<string, string>()
  if (ids.length > 0) {
    const { data: perfiles } = await supabase
      .from('profiles').select('id, nombre').in('id', ids)
    nombres = new Map((perfiles ?? []).map(p => [p.id as string, (p.nombre as string) ?? '']))
  }

  const conCreador = (data ?? []).map(p => ({
    ...p,
    creador: p.user_id ? (nombres.get(p.user_id) || null) : null,
  }))

  return NextResponse.json(conCreador)
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
