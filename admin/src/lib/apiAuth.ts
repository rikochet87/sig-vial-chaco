import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

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
 * Verifica que el request tenga sesión válida Y rol === 'admin'.
 * Usar en endpoints que solo pueden ejecutar administradores.
 */
export async function requireAdminRole(): Promise<{ userId: string } | NextResponse> {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const supabase = createServiceClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('rol')
    .eq('id', auth.userId)
    .single()
  if (profile?.rol !== 'admin') {
    return NextResponse.json({ error: 'Se requiere rol de administrador' }, { status: 403 })
  }
  return auth
}

/**
 * Verifica que el caller sea admin o el dueño del recurso.
 * Devuelve NextResponse 403 si no tiene acceso, null si está permitido.
 */
export async function checkOwnerOrAdmin(
  callerId: string,
  ownerId: string | null | undefined
): Promise<NextResponse | null> {
  const supabase = createServiceClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('rol')
    .eq('id', callerId)
    .single()
  if (profile?.rol === 'admin') return null
  if (ownerId && ownerId === callerId) return null
  return NextResponse.json({ error: 'No tenés permisos para esta operación' }, { status: 403 })
}

/**
 * Sanitiza errores de Supabase antes de enviarlos al cliente.
 *
 * En desarrollo muestra el mensaje original; en producción lo reemplaza por uno
 * genérico, porque el mensaje de Postgres puede describir el esquema.
 *
 * **Pero "Error en la operación" a secas no se puede diagnosticar.** Pasó
 * exactamente eso con el recálculo de lluvia: fallaba y no había forma de saber
 * dónde ni por qué. Así que ahora van dos cosas más, y ninguna filta el esquema:
 *
 * - `donde`: qué estaba haciendo la ruta, escrito por quien la programó.
 * - `codigo`: el código de error de Postgres (`57014` es tiempo agotado,
 *   `23505` clave duplicada, `23503` clave foránea). Son cinco caracteres
 *   públicos y documentados, no dicen nada de las tablas.
 *
 * Además el error completo va a `console.error`, que en Vercel queda en el log
 * del servidor sin pasar por el navegador.
 */
export function dbError(
  error: { message: string; code?: string; details?: string },
  status = 400,
  donde?: string,
): NextResponse {
  console.error('[dbError]', donde ?? '', error.code ?? '', error.message, error.details ?? '')

  const msg = process.env.NODE_ENV === 'development'
    ? error.message
    : donde
      ? `Error en la operación al ${donde}`
      : 'Error en la operación'
  return NextResponse.json({ error: msg, codigo: error.code ?? null }, { status })
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
