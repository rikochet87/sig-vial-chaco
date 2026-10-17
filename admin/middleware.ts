import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { puedeAcceder, rutaInicialPara } from '@/lib/permisos'
import {
  COOKIE_ENLACE, RUTA_SIN_ACCESO, enlaceVigente, esDatoDeHidrologia,
} from '@/lib/enlacePublico'

export async function middleware(request: NextRequest) {
  const ruta = request.nextUrl.pathname
  const enlace = request.cookies.get(COOKIE_ENLACE)?.value

  // El enlace público de Hidrología: `/p/<clave>` valida y deja la cookie, y
  // `/publico/*` se abre con ella, haya o no sesión. Ver `lib/enlacePublico.ts`.
  if (ruta.startsWith('/p/') || ruta === RUTA_SIN_ACCESO) return NextResponse.next()
  if (ruta.startsWith('/publico')) {
    return (await enlaceVigente(enlace))
      ? NextResponse.next()
      : NextResponse.redirect(new URL(RUTA_SIN_ACCESO, request.url))
  }

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
    // Los archivos de `public/` que baja la pantalla pública
    if (esDatoDeHidrologia(pathname) && await enlaceVigente(enlace)) return supabaseResponse
    // `/` es el `start_url` del panel instalado: quien lo instaló desde el
    // enlace público vuelve a Hidrología, no al login
    if (pathname === '/' && await enlaceVigente(enlace)) {
      return NextResponse.redirect(new URL('/publico/hidrologia', request.url))
    }
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
  // Lo del panel instalado (manifiesto, íconos, service worker y la página sin
  // conexión) se sirve sin sesión: el navegador lo pide antes del login, y el
  // service worker no se puede registrar si su archivo redirige.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/|manifest.webmanifest|sw.js|sin-conexion.html|iconos/).*)'],
}
