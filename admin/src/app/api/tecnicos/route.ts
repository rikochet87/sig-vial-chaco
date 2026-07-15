import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// GET /api/tecnicos — devuelve todos los usuarios con nombre + email (usa service role)
export async function GET() {
  const supabase = createServiceClient()
  const [profilesRes, authRes] = await Promise.all([
    supabase.from('profiles').select('id,nombre,zona,rol'),
    supabase.auth.admin.listUsers({ perPage: 1000 }),
  ])
  const emailById: Record<string, string> = {}
  const authUsers = (authRes.data?.users ?? []) as { id: string; email?: string }[]
  authUsers.forEach(u => { emailById[u.id] = u.email ?? '' })
  type ProfileRow = { id: string; nombre: string | null; zona: string | null; rol: string }
  const profiles = (profilesRes.data ?? []) as ProfileRow[]
  const result = profiles.map(p => ({
    id: p.id,
    nombre: p.nombre || emailById[p.id] || p.id,
    email: emailById[p.id] || '',
    zona: p.zona,
    rol: p.rol,
  }))
  return NextResponse.json(result)
}

export async function POST(request: NextRequest) {
  const { nombre, email, password, zona, rol } = await request.json()
  const supabase = createServiceClient()
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email, password, email_confirm: true
  })
  if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })
  const { error: profileError } = await supabase.from('profiles').insert({
    id: authData.user.id, nombre, zona, rol
  })
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
