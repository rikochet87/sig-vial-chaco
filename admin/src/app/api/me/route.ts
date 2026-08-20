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

  return NextResponse.json({
    id:       user.id,
    email:    user.email ?? '',
    nombre:   profile?.nombre ?? null,
    rol:      profile?.rol ?? 'admin',
    permisos: profile?.permisos ?? [],
  })
}
