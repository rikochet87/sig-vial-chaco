import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, requireAdminRole, dbError, requireFields } from '@/lib/apiAuth'

/**
 * Catálogo de equipos.
 *
 * El costo se guarda en dólares a propósito: el valor en pesos se recalcula con
 * la cotización de cada análisis. Si se guardara en pesos, actualizar el
 * catálogo distorsionaría los presupuestos ya presentados.
 */

export async function GET() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('equipos')
    .select('*')
    .eq('activo', true)
    .order('nombre', { ascending: true })
    .order('hp', { ascending: true })

  if (error) return dbError(error)
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminRole()
  if (auth instanceof NextResponse) return auth
  const body = await req.json()
  const invalid = requireFields(body, ['nombre'])
  if (invalid) return invalid
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('equipos')
    .insert({
      numero:    body.numero ?? null,
      nombre:    body.nombre,
      modelo:    body.modelo ?? null,
      marca:     body.marca ?? null,
      hp:        body.hp ?? 0,
      costo_usd: body.costo_usd ?? 0,
    })
    .select()
    .single()

  if (error) return dbError(error)
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdminRole()
  if (auth instanceof NextResponse) return auth
  const body = await req.json()
  const { id, ...campos } = body
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const permitidos = ['numero', 'nombre', 'modelo', 'marca', 'hp', 'costo_usd', 'activo']
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of permitidos) if (campos[k] !== undefined) patch[k] = campos[k]

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('equipos').update(patch).eq('id', id).select().single()

  if (error) return dbError(error)
  return NextResponse.json(data)
}
