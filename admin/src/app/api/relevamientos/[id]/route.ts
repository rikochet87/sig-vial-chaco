import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()

  const supabase = createServiceClient()

  // Build the update object — only include known editable fields
  const update: Record<string, unknown> = {}

  if ('fecha' in body)         update.fecha          = body.fecha
  if ('estado_calzada' in body) update.estado_calzada = body.estado_calzada
  if ('ruta_tramo' in body)    update.ruta_tramo     = body.ruta_tramo
  if ('zona' in body)          update.zona           = body.zona
  if ('cc_asociado' in body)   update.cc_asociado    = body.cc_asociado
  if ('observaciones' in body) update.observaciones  = body.observaciones
  if ('datos_especificos' in body) update.datos_especificos = body.datos_especificos

  const { error } = await supabase
    .from('relevamientos')
    .update(update)
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
