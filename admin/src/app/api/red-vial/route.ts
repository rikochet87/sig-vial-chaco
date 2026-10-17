import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import {
  accesoEdicion, accesoLectura, armarFila, errorDeBase, originalDelArchivo, tipoDe,
} from '@/lib/redVialServidor'
import type { Operacion } from '@/lib/redVial'

/**
 * Los cambios de la red vial: GET los lista, POST carga uno.
 *
 * `red_vial_cambios` tiene RLS sin políticas: se llega sólo con la clave de
 * servicio y la autorización es ésta. Leer: con sesión o enlace público, como
 * el archivo de la red. Escribir: permiso `red_vial`.
 *
 * La fila y los km de los consorcios se guardan juntos en `red_vial_guardar`
 * (docs/sql/18), en una transacción: no puede quedar el tramo guardado y los
 * km sin mover, ni al revés.
 */

export const dynamic = 'force-dynamic'

export async function GET() {
  const acceso = await accesoLectura()
  if (acceso instanceof NextResponse) return acceso

  // Son decenas o cientos de filas, pero el tope de PostgREST es 1.000 por
  // pedido: se pagina para que no se corte en silencio el día que crezca
  const supabase = createServiceClient()
  const cambios: unknown[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase.from('red_vial_cambios')
      .select('*').order('created_at').order('id').range(desde, desde + 999)
    if (error) return errorDeBase(error, 'leer los cambios de la red')
    cambios.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return NextResponse.json({ cambios }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  const quien = await accesoEdicion()
  if (quien instanceof NextResponse) return quien

  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const tipo = tipoDe(body.red)
  if (!tipo) return NextResponse.json({ error: 'Red inválida' }, { status: 400 })
  const operacion = body.operacion as Operacion
  if (!['alta', 'edicion', 'baja'].includes(operacion)) {
    return NextResponse.json({ error: 'Operación inválida' }, { status: 400 })
  }

  const base = operacion === 'alta' ? null : await originalDelArchivo(request, tipo, body.base)
  if (base instanceof NextResponse) return base

  const fila = await armarFila(tipo, operacion, body, base, quien)
  if (fila instanceof NextResponse) return fila
  if (base) Object.assign(fila, {
    base_capa: base.capa, base_indice: base.indice, base_huella: base.huella, original: base.original,
  })

  const { data, error } = await createServiceClient().rpc('red_vial_guardar', { p_id: null, p_fila: fila })
  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Ese tramo ya tiene un cambio cargado. Recargá la página.' }, { status: 409 })
    }
    return errorDeBase(error, 'guardar el tramo')
  }
  return NextResponse.json({ cambio: data }, { status: 201 })
}
