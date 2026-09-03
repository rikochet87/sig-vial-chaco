import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdminRole, dbError, requireFields } from '@/lib/apiAuth'

// GET /api/tecnicos — devuelve todos los usuarios con nombre, email y permisos
export async function GET() {
  const auth = await requireAdminRole()
  if (auth instanceof NextResponse) return auth
  const supabase = createServiceClient()
  const [profilesRes, authRes] = await Promise.all([
    supabase.from('profiles').select('id,nombre,zona,rol,permisos'),
    supabase.auth.admin.listUsers({ perPage: 1000 }),
  ])
  const emailById: Record<string, string> = {}
  const authUsers = (authRes.data?.users ?? []) as { id: string; email?: string }[]
  authUsers.forEach(u => { emailById[u.id] = u.email ?? '' })
  type ProfileRow = { id: string; nombre: string | null; zona: string | null; rol: string; permisos: string[] | null }
  const profiles = (profilesRes.data ?? []) as ProfileRow[]
  const result = profiles.map(p => ({
    id:       p.id,
    nombre:   p.nombre || emailById[p.id] || p.id,
    email:    emailById[p.id] || '',
    zona:     p.zona,
    rol:      p.rol,
    permisos: p.permisos ?? [],
  }))
  return NextResponse.json(result)
}

// POST /api/tecnicos — crea usuario con link de invitación (sin password)
export async function POST(request: NextRequest) {
  const auth = await requireAdminRole()
  if (auth instanceof NextResponse) return auth
  const body = await request.json()
  const invalid = requireFields(body, ['email'])
  if (invalid) return invalid

  const { nombre, email, password, zona, rol, permisos } = body
  const supabase = createServiceClient()
  const esApp = rol === 'tecnico' || rol === 'usuario'

  const profileData = {
    nombre:   nombre || null,
    zona:     rol === 'tecnico' ? (zona || null) : null,
    rol:      rol ?? 'panel',
    permisos: rol === 'admin' ? [] : (permisos ?? []),
  }

  // ── Usuarios de app (tecnico/usuario): crear con contraseña ─────────────────
  if (esApp) {
    const { data: userData, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (createError) return dbError(createError)

    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({ id: userData.user.id, ...profileData }, { onConflict: 'id' })
    if (profileError) return dbError(profileError)

    return NextResponse.json({ success: true }, { status: 201 })
  }

  // ── Usuarios de panel (panel/admin): generar link de invitación ─────────────
  const { data, error: linkError } = await supabase.auth.admin.generateLink({
    type: 'invite',
    email,
  })

  // Si el email ya existe, solo actualizar perfil
  if (linkError) {
    const { data: authData } = await supabase.auth.admin.listUsers({ perPage: 1000 })
    const existing = (authData?.users ?? []).find(u => u.email === email)
    if (!existing) return dbError(linkError)

    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({ id: existing.id, ...profileData }, { onConflict: 'id' })
    if (profileError) return dbError(profileError)

    return NextResponse.json({ success: true, existing: true }, { status: 200 })
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({ id: data.user.id, ...profileData }, { onConflict: 'id' })
  if (profileError) return dbError(profileError)

  return NextResponse.json({
    success:    true,
    inviteLink: data.properties.action_link,
  }, { status: 201 })
}
