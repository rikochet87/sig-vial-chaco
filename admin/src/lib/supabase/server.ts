import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabase } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch (e) {
            // En Server Components el set() lanza en contextos read-only — es esperado.
            // Logueamos en desarrollo para detectar problemas reales.
            if (process.env.NODE_ENV === 'development') {
              console.warn('[supabase/server] cookie setAll:', e)
            }
          }
        },
      },
    }
  )
}

export function createServiceClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
