import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdminRole, dbError, authError, requireFields } from '@/lib/apiAuth'

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

  /*
   * ── Se busca la cuenta ANTES de crearla, y eso es el arreglo ────────────────
   *
   * Una cuenta de Auth puede sobrevivir al perfil: el borrado eliminaba el
   * perfil primero, así que si el borrado en Auth fallaba quedaba una cuenta sin
   * perfil — invisible en la lista de usuarios, que se arma desde `profiles`.
   *
   * Con ese estado, recrear a la persona desde el panel era **imposible**: la
   * rama de usuarios de app llamaba directo a `createUser`, Supabase contestaba
   * que el email ya estaba registrado, y la pantalla mostraba «Error en la
   * operación» sin más. La rama de usuarios de panel sí contemplaba el caso; la
   * de app no, y la diferencia no respondía a ninguna razón.
   *
   * Preguntando primero, las dos ramas quedan **idempotentes**: crear un usuario
   * que ya existe pasa a ser reusar su cuenta y reponer su perfil, que es lo que
   * el administrador está queriendo hacer cuando repite la operación.
   */
  const { data: listado, error: errLista } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  if (errLista) return dbError(errLista, 400, 'buscar la cuenta')
  const existente = (listado?.users ?? []).find(u => u.email?.toLowerCase() === String(email).toLowerCase())

  // ── Usuarios de app (tecnico/usuario): entran con contraseña ────────────────
  if (esApp) {
    let id: string

    if (existente) {
      /*
       * La cuenta sigue viva. Se le fija la contraseña que acaba de tipear el
       * administrador —que es lo que le va a dar a la persona— y se confirma el
       * email, porque una cuenta sin confirmar no puede iniciar sesión.
       */
      const { error } = await supabase.auth.admin.updateUserById(existente.id, {
        ...(password ? { password } : {}),
        email_confirm: true,
      })
      if (error) return authError(error, 'reactivar la cuenta existente')
      id = existente.id
    } else {
      if (!password) {
        return NextResponse.json(
          { error: 'Hace falta una contraseña para un usuario de la app.' }, { status: 400 })
      }
      const { data: userData, error } = await supabase.auth.admin.createUser({
        email, password, email_confirm: true,
      })
      if (error) return authError(error, 'crear la cuenta')
      id = userData.user.id
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({ id, ...profileData }, { onConflict: 'id' })
    if (profileError) return dbError(profileError, 400, 'guardar el perfil')

    return NextResponse.json({ success: true, existing: !!existente }, { status: existente ? 200 : 201 })
  }

  // ── Usuarios de panel (panel/admin): entran por link de invitación ──────────
  if (existente) {
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({ id: existente.id, ...profileData }, { onConflict: 'id' })
    if (profileError) return dbError(profileError, 400, 'guardar el perfil')
    return NextResponse.json({ success: true, existing: true }, { status: 200 })
  }

  const { data, error: linkError } = await supabase.auth.admin.generateLink({
    type: 'invite',
    email,
  })
  if (linkError) return authError(linkError, 'generar la invitación')

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({ id: data.user.id, ...profileData }, { onConflict: 'id' })
  if (profileError) return dbError(profileError)

  return NextResponse.json({
    success:    true,
    inviteLink: data.properties.action_link,
  }, { status: 201 })
}
