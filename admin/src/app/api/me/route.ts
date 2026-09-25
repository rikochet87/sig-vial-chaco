import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service
    .from('profiles')
    .select('nombre, rol, permisos')
    .eq('id', user.id)
    .single()

  // Sin fila de perfil, el menor privilegio — no el mayor.
  //
  // Antes esto caía a 'admin'. El servidor no se dejaba engañar, porque
  // `requireAdminRole()` vuelve a consultar el perfil, pero la interfaz sí le
  // mostraba los controles de administrador a alguien sin perfil. El default de
  // un dato ausente tiene que ser no poder hacer nada.
  return NextResponse.json({
    id:       user.id,
    email:    user.email ?? '',
    nombre:   profile?.nombre ?? null,
    rol:      profile?.rol ?? 'usuario',
    permisos: profile?.permisos ?? [],
  })
}
