import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { puedeAcceder, rutaInicialPara } from '@/lib/permisos'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname
  if (!user && !pathname.startsWith('/login') && !pathname.startsWith('/acceso-denegado')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  if (user && pathname.startsWith('/dashboard')) {
    const { data: profile } = await supabase.from('profiles').select('rol,permisos').eq('id', user.id).single()

    const perfil = {
      rol:      profile?.rol as string | undefined,
      permisos: profile?.permisos as string[] | undefined,
    }

    // ¿Tiene acceso al panel en general?
    const tieneAcceso = perfil.rol === 'admin' || perfil.rol === 'panel' ||
      (Array.isArray(perfil.permisos) && perfil.permisos.length > 0)
    if (!tieneAcceso) {
      return NextResponse.redirect(new URL('/acceso-denegado', request.url))
    }

    // ¿Y a esta ruta en particular? Antes esto no se chequeaba: el Sidebar
    // ocultaba el link pero la página cargaba igual escribiendo la URL.
    if (!puedeAcceder(perfil, pathname)) {
      const destino = rutaInicialPara(perfil)
      // Evitar bucle si la ruta de destino tampoco es accesible
      if (destino === pathname) {
        return NextResponse.redirect(new URL('/acceso-denegado', request.url))
      }
      return NextResponse.redirect(new URL(destino, request.url))
    }
  }
  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
}
