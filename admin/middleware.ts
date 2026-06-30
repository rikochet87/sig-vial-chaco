import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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
    const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
    if (profile?.rol !== 'admin') {
      return NextResponse.redirect(new URL('/acceso-denegado', request.url))
    }
  }
  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
}
