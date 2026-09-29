import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdminRole, dbError, authError } from '@/lib/apiAuth'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminRole()
  if (auth instanceof NextResponse) return auth
  const { id } = await params
  const body = await req.json()
  const { nombre, zona, rol, permisos } = body
  const supabase = createServiceClient()

  // Si solo vienen permisos (ej: "Quitar acceso al panel"), hacer update parcial
  if (permisos !== undefined && !nombre && !rol) {
    const { error } = await supabase
      .from('profiles')
      .update({ permisos })
      .eq('id', id)
    if (error) return dbError(error)
    return NextResponse.json({ success: true })
  }

  // zona solo aplica a técnicos; para otros roles se guarda null
  const zonaFinal = rol === 'tecnico' ? (zona || null) : null

  const { error } = await supabase
    .from('profiles')
    .update({
      nombre,
      zona:     zonaFinal,
      rol,
      permisos: rol === 'admin' ? [] : (permisos ?? []),
    })
    .eq('id', id)

  if (error) return dbError(error)
  return NextResponse.json({ success: true })
}

/**
 * Borra a un usuario: primero la cuenta de Auth, después el perfil.
 *
 * **El orden es el arreglo.** Antes iba al revés —perfil y después cuenta— con
 * el borrado del perfil sin siquiera mirar si había fallado. Si el segundo paso
 * fallaba quedaba una cuenta de Auth **sin perfil**, y ese estado es el peor de
 * los dos posibles: la lista de usuarios se arma desde `profiles`, así que la
 * persona desaparecía del panel mientras seguía pudiendo iniciar sesión.
 * Invisible para el administrador y viva para quien tenía la contraseña.
 *
 * **Y con este orden el borrado lo hace la base, no nosotros.** Verificado en el
 * catálogo el 29/09/2026: `profiles_id_fkey` es `references auth.users(id) on
 * delete cascade`, así que eliminar la cuenta borra el perfil en la misma
 * transacción de Postgres. El `delete` de `profiles` de abajo pasa a ser
 * limpieza del caso contrario —un perfil que quedó sin cuenta de un borrado
 * viejo— y no encuentra nada en el caso normal.
 *
 * Con el orden anterior la cascada nunca llegaba a actuar: el perfil ya se
 * había borrado a mano. O sea que el código estaba haciendo a mano, y mal, algo
 * que el esquema ya garantizaba.
 */
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminRole()
  if (auth instanceof NextResponse) return auth
  const { id } = await params
  const supabase = createServiceClient()

  const { error: authErr } = await supabase.auth.admin.deleteUser(id)
  // Que la cuenta ya no exista no es un fallo: puede quedar un perfil huérfano
  // de un borrado anterior a medias, y hay que poder terminar de limpiarlo.
  if (authErr && authErr.status !== 404) return authError(authErr, 'eliminar la cuenta')

  const { error } = await supabase.from('profiles').delete().eq('id', id)
  if (error) return dbError(error, 400, 'eliminar el perfil')

  return NextResponse.json({ success: true })
}
