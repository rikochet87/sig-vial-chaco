import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const { nombre, email, password, zona, rol } = await request.json()
  const supabase = createServiceClient()
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email, password, email_confirm: true
  })
  if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })
  const { error: profileError } = await supabase.from('profiles').insert({
    id: authData.user.id, email, nombre, zona, rol
  })
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
