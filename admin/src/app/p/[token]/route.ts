/**
 * El enlace público de Hidrología: `/p/<clave>`.
 *
 * Valida la clave, la deja en una cookie y pasa a la pantalla. De ahí en más
 * la cookie es lo que autoriza —la página, los archivos y las rutas de
 * lectura—, así la clave no viaja en cada dirección. Ver
 * `lib/enlacePublico.ts`.
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  COOKIE_DIAS, COOKIE_ENLACE, RUTA_PUBLICA, RUTA_SIN_ACCESO, enlaceVigente,
} from '@/lib/enlacePublico'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!(await enlaceVigente(token))) {
    return NextResponse.redirect(new URL(RUTA_SIN_ACCESO, req.url))
  }
  const res = NextResponse.redirect(new URL(RUTA_PUBLICA, req.url))
  res.cookies.set(COOKIE_ENLACE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_DIAS * 86_400,
  })
  return res
}
