import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, dbError, checkOwnerOrAdmin } from '@/lib/apiAuth'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { id } = await params
  const supabase = createServiceClient()

  // Verificar ownership
  const { data: proyecto } = await supabase.from('proyectos_ripio').select('user_id').eq('id', id).single()
  const denied = await checkOwnerOrAdmin(auth.userId, proyecto?.user_id)
  if (denied) return denied

  /**
   * Borrado lógico, no físico.
   *
   * El proyecto desaparece de la calculadora pero el registro queda: la obra
   * que se guardó a partir de él sigue completa en Obras → Lista, y el cálculo
   * es recuperable. Borrarlo de verdad dejaba esa obra sin nada que abrir al
   * querer editarla.
   */
  const ahora = new Date().toISOString()
  const marca = { archivado_en: ahora, archivado_por: auth.userId }

  const { error: errRipios } = await supabase
    .from('ripios').update(marca).eq('proyecto_id', id).is('archivado_en', null)
  if (errRipios) return dbError(errRipios)

  const { error } = await supabase
    .from('proyectos_ripio').update(marca).eq('id', id)
  if (error) return dbError(error)

  return NextResponse.json({ ok: true, archivado: true })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { id } = await params
  const body = await req.json()
  const supabase = createServiceClient()

  // Verificar ownership
  const { data: proyecto } = await supabase.from('proyectos_ripio').select('user_id').eq('id', id).single()
  const denied = await checkOwnerOrAdmin(auth.userId, proyecto?.user_id)
  if (denied) return denied

  /**
   * Restaurar: devuelve a la calculadora un proyecto archivado, con sus tramos.
   * Lo usa la edición de obras — si alguien quitó el proyecto del cómputo y
   * después va a editar la obra, tiene que volver a encontrar el dibujo y los
   * cálculos, no una obra vacía.
   */
  if (body.restaurar === true) {
    const marca = { archivado_en: null, archivado_por: null }

    // Sólo vuelven los tramos que se archivaron junto con el proyecto, no los
    // que se habían borrado antes de a uno: restaurar el proyecto no debe
    // resucitar un tramo que alguien había sacado a propósito.
    const { data: prev } = await supabase
      .from('proyectos_ripio').select('archivado_en').eq('id', id).single()

    if (prev?.archivado_en) {
      const { error: errR } = await supabase
        .from('ripios').update(marca)
        .eq('proyecto_id', id).eq('archivado_en', prev.archivado_en)
      if (errR) return dbError(errR)
    }

    const { data, error: errP } = await supabase
      .from('proyectos_ripio').update(marca).eq('id', id).select().single()
    if (errP) return dbError(errP)
    return NextResponse.json({ ...data, restaurado: true })
  }

  // Actualización parcial: el análisis se guarda con autosave y no manda el
  // nombre en cada tecla, así que no se puede exigir.
  const patch: Record<string, unknown> = {}
  if (typeof body.nombre === 'string' && body.nombre.trim()) patch.nombre = body.nombre.trim()
  if (body.analisis !== undefined) {
    patch.analisis = body.analisis
    patch.actualizado_en = new Date().toISOString()
  }
  if (body.precios_base_id !== undefined) patch.precios_base_id = body.precios_base_id

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('proyectos_ripio')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) return dbError(error)
  return NextResponse.json(data)
}
