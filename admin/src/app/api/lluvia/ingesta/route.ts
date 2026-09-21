/**
 * Ingesta de precipitaciones.
 *
 * Dos disparadores:
 *   · el cron diario de Vercel, con `Authorization: Bearer $CRON_SECRET`
 *   · un admin desde la pantalla de lluvia, para rellenar hacia atrás
 *
 * Es reejecutable: la tabla tiene clave (consorcio, fecha) y se hace upsert, así
 * que correrla dos veces sobre el mismo rango actualiza en vez de duplicar. Eso
 * también sirve para corregir: el modelo afina los últimos días, y volver a
 * pedir la semana pisa los valores viejos con los definitivos.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, dbError } from '@/lib/apiAuth'
import { consultarLluvia, hace, aISO, diasEntre } from '@/lib/lluvia'

/**
 * Tope de días por corrida.
 *
 * Un año son 102 consorcios × 370 días ≈ 38 mil filas, y del lado del servicio
 * 746 puntos × 370 días. Con las llamadas en paralelo eso entra cómodo en el
 * minuto que tiene la función; pedir más es arriesgarse a un corte a la mitad.
 */
const MAX_DIAS = 370

export const maxDuration = 60

async function autorizado(req: NextRequest): Promise<true | NextResponse> {
  const secreto = process.env.CRON_SECRET
  const cabecera = req.headers.get('authorization')
  if (secreto && cabecera === `Bearer ${secreto}`) return true

  // Sin secreto válido, tiene que ser una sesión de panel
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  return true
}

export async function POST(req: NextRequest) {
  const ok = await autorizado(req)
  if (ok instanceof NextResponse) return ok

  const { searchParams } = new URL(req.url)
  // Por defecto, la última semana. El cron corre todos los días y repisa: si un
  // día falló, la corrida siguiente lo recupera sin que nadie intervenga.
  const desde = searchParams.get('desde') ?? hace(7)
  const hasta = searchParams.get('hasta') ?? aISO(new Date())

  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    return NextResponse.json({ error: 'Fechas inválidas: se espera AAAA-MM-DD' }, { status: 400 })
  }
  const dias = diasEntre(desde, hasta)
  if (dias <= 0) {
    return NextResponse.json({ error: 'El rango está al revés o vacío' }, { status: 400 })
  }
  if (dias > MAX_DIAS) {
    return NextResponse.json(
      { error: `El rango es de ${dias} días y el máximo por corrida es ${MAX_DIAS}. Partilo en tramos.` },
      { status: 400 },
    )
  }

  let registros
  try {
    registros = await consultarLluvia(desde, hasta)
  } catch (e) {
    // El servicio externo caído no debe verse como un error de la base
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No se pudo consultar el servicio de lluvia' },
      { status: 502 },
    )
  }

  if (registros.length === 0) {
    return NextResponse.json({ ok: true, desde, hasta, filas: 0, aviso: 'El servicio no devolvió datos para ese rango' })
  }

  const supabase = createServiceClient()

  // De a tandas: un upsert de 40 mil filas de una se cae por tamaño de payload
  const TANDA = 2000
  let filas = 0
  for (let i = 0; i < registros.length; i += TANDA) {
    const { error } = await supabase
      .from('precipitaciones')
      .upsert(
        registros.slice(i, i + TANDA).map(r => ({ ...r, fuente: 'open-meteo', actualizado_en: new Date().toISOString() })),
        { onConflict: 'consorcio_numero,fecha' },
      )
    if (error) return dbError(error)
    filas += Math.min(TANDA, registros.length - i)
  }

  return NextResponse.json({ ok: true, desde, hasta, dias, filas })
}

/** El cron de Vercel pega con GET. Mismo trabajo, rango por defecto. */
export async function GET(req: NextRequest) {
  return POST(req)
}
