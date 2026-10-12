/**
 * Enlaces públicos de Hidrología: listar y crear. Sólo administradores —se
 * manejan desde Usuarios—. Qué abre un enlace está en `lib/enlacePublico.ts`.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdminRole, dbError } from '@/lib/apiAuth'
import { nuevoToken } from '@/lib/enlacePublico'

export const dynamic = 'force-dynamic'

const NOMBRE_MAX = 80
const CAMPOS = 'id, token, nombre, creado_en, revocado_en'

export async function GET() {
  const auth = await requireAdminRole()
  if (auth instanceof NextResponse) return auth

  const { data, error } = await createServiceClient()
    .from('enlaces_publicos')
    .select(CAMPOS)
    .order('creado_en', { ascending: false })
  if (error) return dbError(error, 400, 'leer los enlaces públicos')
  return NextResponse.json({ enlaces: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminRole()
  if (auth instanceof NextResponse) return auth

  const body = await req.json().catch(() => ({}))
  const nombre = typeof body?.nombre === 'string' ? body.nombre.trim().slice(0, NOMBRE_MAX) : ''
  if (!nombre) {
    return NextResponse.json({ error: 'Poné para quién es el enlace' }, { status: 400 })
  }

  const { data, error } = await createServiceClient()
    .from('enlaces_publicos')
    .insert({ token: nuevoToken(), nombre, creado_por: auth.userId })
    .select(CAMPOS)
    .single()
  if (error) return dbError(error, 400, 'crear el enlace público')
  return NextResponse.json({ enlace: data })
}
