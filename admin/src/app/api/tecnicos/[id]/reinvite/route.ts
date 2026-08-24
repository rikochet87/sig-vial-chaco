import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, dbError } from '@/lib/apiAuth'

export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const supabase = createServiceClient()

  // Obtener email del usuario desde auth
  const { data: userData, error: userError } = await supabase.auth.admin.getUserById(id)
  if (userError || !userData.user?.email) {
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
  }

  // Intentar invite; si el usuario ya está confirmado, usar recovery
  let result = await supabase.auth.admin.generateLink({
    type: 'invite',
    email: userData.user.email,
  })

  if (result.error) {
    result = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: userData.user.email,
    })
  }

  if (result.error) return dbError(result.error)

  return NextResponse.json({ inviteLink: result.data.properties.action_link })
}
