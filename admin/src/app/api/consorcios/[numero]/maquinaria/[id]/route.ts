import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { dbError } from '@/lib/apiAuth'
import { validarMaquina, numeroDe } from '@/lib/maquinaria'
import { accesoMaquinaria, NO_CARGAR, NO_BORRAR } from '@/lib/maquinariaAcceso'

/**
 * Una máquina: PATCH la edita (administrador o técnico de la zona), DELETE la
 * borra (sólo el administrador).
 *
 * **Se filtra por id y por consorcio a la vez.** Con el id solo, un técnico de
 * una zona podría editar la máquina de un consorcio de otra pasando el número
 * de uno suyo en la dirección; así, una máquina que no es de ese consorcio da
 * 404.
 */

type Ctx = { params: Promise<{ numero: string; id: string }> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function leerParams(params: Ctx['params']) {
  const p = await params
  const numero = numeroDe(p.numero)
  return numero != null && UUID.test(p.id) ? { numero, id: p.id } : null
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const p = await leerParams(params)
  if (!p) return NextResponse.json({ error: 'Máquina inválida' }, { status: 400 })

  const acceso = await accesoMaquinaria(p.numero)
  if (acceso instanceof NextResponse) return acceso
  if (!acceso.cargar) return NO_CARGAR(acceso.zonaConsorcio)

  const supabase = createServiceClient()
  const { data: actual, error: e1 } = await supabase.from('maquinaria')
    .select('tipo_id')
    .eq('id', p.id).eq('consorcio_numero', p.numero)
    .maybeSingle()
  if (e1) return dbError(e1, 500, 'buscar la máquina')
  if (!actual) return NextResponse.json({ error: 'La máquina no existe' }, { status: 404 })

  const v = validarMaquina(
    await request.json().catch(() => null),
    new Date().getFullYear(),
    actual.tipo_id as number,
  )
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  // Quién cargó y cuándo no se tocan; sólo quién modificó por última vez
  const { data, error } = await supabase.from('maquinaria')
    .update({
      ...v.datos,
      actualizado_por: acceso.userId,
      actualizado_por_nombre: acceso.nombre,
      updated_at: new Date().toISOString(),
    })
    .eq('id', p.id).eq('consorcio_numero', p.numero)
    .select('*')
    .single()
  if (error) return dbError(error, 400, 'actualizar la máquina')

  return NextResponse.json({ maquina: data })
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const p = await leerParams(params)
  if (!p) return NextResponse.json({ error: 'Máquina inválida' }, { status: 400 })

  const acceso = await accesoMaquinaria(p.numero)
  if (acceso instanceof NextResponse) return acceso
  if (!acceso.borrar) return NO_BORRAR()

  const supabase = createServiceClient()
  const { data, error } = await supabase.from('maquinaria')
    .delete()
    .eq('id', p.id).eq('consorcio_numero', p.numero)
    .select('id')
  if (error) return dbError(error, 400, 'borrar la máquina')
  if (!data?.length) return NextResponse.json({ error: 'La máquina no existe' }, { status: 404 })

  return NextResponse.json({ success: true })
}
