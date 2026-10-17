import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { accesoEdicion, armarFila, errorDeBase } from '@/lib/redVialServidor'
import type { Cambio, Operacion } from '@/lib/redVial'

/**
 * Un cambio de la red: PATCH lo modifica, DELETE lo descarta.
 *
 * Descartar no es borrar el tramo: es **deshacer el cambio**. Un alta
 * desaparece; una edición o una baja devuelven el tramo del archivo tal como
 * era. En los tres casos `red_vial_descartar` le devuelve a cada consorcio los
 * km que ese cambio le había movido.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const quien = await accesoEdicion()
  if (quien instanceof NextResponse) return quien
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Id inválido' }, { status: 400 })

  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: previo, error: e1 } = await supabase.from('red_vial_cambios').select('*').eq('id', id).maybeSingle()
  if (e1) return errorDeBase(e1, 'leer el cambio')
  if (!previo) return NextResponse.json({ error: 'Ese cambio ya no existe. Recargá la página.' }, { status: 404 })
  const c = previo as Cambio

  // Un alta sigue siendo alta (quitarla es descartarla); a un tramo del
  // archivo se lo puede editar o quitar
  let operacion: Operacion = c.operacion === 'alta' ? 'alta' : 'edicion'
  if (body.operacion === 'baja') {
    if (c.operacion === 'alta') {
      return NextResponse.json({ error: 'Un tramo nuevo se quita descartándolo' }, { status: 400 })
    }
    operacion = 'baja'
  }

  // El original es el que se guardó al crear la fila, leído del archivo
  const base = c.operacion === 'alta' || !c.original || !c.base_capa
    ? null
    : { capa: c.base_capa, original: c.original }
  const fila = await armarFila(c.red, operacion, body, base, quien)
  if (fila instanceof NextResponse) return fila

  const { data, error } = await supabase.rpc('red_vial_guardar', { p_id: id, p_fila: fila })
  if (error) return errorDeBase(error, 'guardar el tramo')
  return NextResponse.json({ cambio: data })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const quien = await accesoEdicion()
  if (quien instanceof NextResponse) return quien
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Id inválido' }, { status: 400 })

  const { data, error } = await createServiceClient().rpc('red_vial_descartar', { p_id: id })
  if (error) {
    if (error.code === 'P0002') return NextResponse.json({ error: 'Ese cambio ya no existe' }, { status: 404 })
    return errorDeBase(error, 'descartar el cambio')
  }
  return NextResponse.json({ cambio: data })
}
