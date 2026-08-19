import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Verifica que el request tenga una sesión de Supabase válida.
 * Usar en todos los API routes del admin.
 *
 * Uso:
 *   const auth = await requireAdmin()
 *   if (auth instanceof NextResponse) return auth   // 401
 *   // auth.userId disponible si se necesita
 */
export async function requireAdmin(): Promise<{ userId: string } | NextResponse> {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    return { userId: user.id }
  } catch {
    return NextResponse.json({ error: 'Error de autenticación' }, { status: 401 })
  }
}
