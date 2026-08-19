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

/**
 * Sanitiza errores de Supabase antes de enviarlos al cliente.
 * En desarrollo muestra el mensaje original; en producción devuelve un mensaje genérico.
 */
export function dbError(error: { message: string }, status = 400): NextResponse {
  const msg = process.env.NODE_ENV === 'development'
    ? error.message
    : 'Error en la operación'
  return NextResponse.json({ error: msg }, { status })
}

/**
 * Valida que los campos requeridos estén presentes y no vacíos en el body.
 * Devuelve un NextResponse 400 si falta alguno, o null si todo está bien.
 */
export function requireFields(
  body: Record<string, unknown>,
  fields: string[]
): NextResponse | null {
  for (const f of fields) {
    const v = body[f]
    if (v === undefined || v === null || v === '') {
      return NextResponse.json({ error: `Campo requerido: ${f}` }, { status: 400 })
    }
  }
  return null
}
