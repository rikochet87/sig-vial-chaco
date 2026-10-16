/**
 * El registro diario de la crecida desde Brasil.
 *
 *   GET  /api/rio/crecida/registro → EstadoCrecida: cuántos días hay y el acierto
 *   GET  con la cabecera del cron  → guarda el de hoy
 *   POST /api/rio/crecida/registro → guarda el de hoy (sólo admin)
 *
 * **Un pronóstico que no se guarda no se puede verificar nunca**: Open-Meteo no
 * ofrece el ensamble de días pasados, y la validación que hay —con la lluvia
 * que cayó— es un techo. Esto es lo que va a decir cuánto vale de verdad.
 *
 * Tiene su propio cron (`0 12 * * *`, las 09:00) y no va en el de las 12:00 de
 * la lluvia: el cálculo baja ~9 MB del ONS y tres consultas a Open-Meteo, y ese
 * cron ya tiene el minuto repartido. A las 09:00 Prefectura ya publicó la
 * lectura de las 00:00 y el ECMWF de las 00 UTC está en Open-Meteo.
 *
 * El GET sin cabecera entra con `requireLecturaHidrologia()`, como la ruta que
 * muestra el cálculo: es lectura.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdminRole, requireLecturaHidrologia, dbError } from '@/lib/apiAuth'
import { estadoCrecida, registrarCrecida } from '@/lib/crecidaRegistro'
import { ErrorCrecida } from '@/lib/crecidaCalculo'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Tiene que coincidir con `vercel.json` */
const CRON = '0 12 * * *'

const errorDe = (e: unknown, donde: string) => {
  if (e instanceof ErrorCrecida) return NextResponse.json({ error: e.message }, { status: e.status })
  const err = e as { message?: string; code?: string }
  // 42P01: la tabla no existe — falta correr el SQL
  if (err.code === '42P01') {
    return NextResponse.json({ error: 'Falta crear la tabla: docs/sql/15-pronostico-crecida.sql', codigo: err.code }, { status: 503 })
  }
  if (err.code) return dbError({ message: err.message ?? '', code: err.code }, 500, donde)
  console.error('[registro crecida]', e)
  return NextResponse.json({ error: err.message ?? 'Error' }, { status: 502 })
}

async function guardar(donde: string) {
  try {
    const r = await registrarCrecida(createServiceClient())
    console.log('[registro crecida] guardado', r.emitido, r.alturaHoy, 'm')
    return NextResponse.json(r)
  } catch (e) {
    return errorDe(e, donde)
  }
}

export async function GET(req: NextRequest) {
  if (req.headers.get('x-vercel-cron-schedule') === CRON) {
    const secreto = process.env.CRON_SECRET
    if (!secreto || req.headers.get('authorization') !== `Bearer ${secreto}`) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    return guardar('guardar la crecida (cron)')
  }
  const auth = await requireLecturaHidrologia()
  if (auth instanceof NextResponse) return auth
  try {
    return NextResponse.json(await estadoCrecida(createServiceClient()))
  } catch (e) {
    return errorDe(e, 'leer el registro de la crecida')
  }
}

export async function POST() {
  const auth = await requireAdminRole()
  if (auth instanceof NextResponse) return auth
  return guardar('guardar la crecida')
}
