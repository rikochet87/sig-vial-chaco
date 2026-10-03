/**
 * El registro diario del pronóstico.
 *
 *   GET  /api/lluvia/pronostico/registro → EstadoRegistro
 *   POST /api/lluvia/pronostico/registro → guarda el de hoy (sólo admin)
 *
 * Lo normal es que lo guarde el cron de las 12:00. El GET existe para que la
 * pantalla diga cuántos días hay guardados y **si el cron dejó de andar**: un
 * registro que se corta en silencio se descubre meses después, cuando se va a
 * medir y faltan los datos.
 *
 * El POST es para la primera vez —probar que la tabla existe y se escribe— y
 * para reponer un día que el cron se saltó. Pide rol admin y no sólo el permiso
 * de la pantalla: gasta cupo de Open-Meteo.
 */
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdminRole, requirePermiso, dbError } from '@/lib/apiAuth'
import { estadoRegistro, registrarPronostico } from '@/lib/pronosticoRegistro'

export const dynamic = 'force-dynamic'

const errorDe = (e: unknown, donde: string) => {
  const err = e as { message?: string; code?: string }
  // 42P01: la tabla no existe — falta correr el SQL
  if (err.code === '42P01') {
    return NextResponse.json({ error: 'Falta crear la tabla: docs/sql/13-pronostico-registro.sql', codigo: err.code }, { status: 503 })
  }
  if (err.code) return dbError({ message: err.message ?? '', code: err.code }, 500, donde)
  console.error('[registro pronostico]', e)
  return NextResponse.json({ error: err.message ?? 'Error' }, { status: 502 })
}

export async function GET() {
  const auth = await requirePermiso('lluvia')
  if (auth instanceof NextResponse) return auth
  try {
    return NextResponse.json(await estadoRegistro(createServiceClient()))
  } catch (e) {
    return errorDe(e, 'leer el registro del pronóstico')
  }
}

export async function POST() {
  const auth = await requireAdminRole()
  if (auth instanceof NextResponse) return auth
  try {
    return NextResponse.json(await registrarPronostico(createServiceClient()))
  } catch (e) {
    return errorDe(e, 'guardar el pronóstico')
  }
}
