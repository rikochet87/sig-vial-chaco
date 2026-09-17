import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, dbError, requireFields } from '@/lib/apiAuth'

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const body = await req.json()
  const invalid = requireFields(body, ['tipo', 'jurisdiccion'])
  if (invalid) return invalid
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('obras')
    .insert({
      tipo:              body.tipo,
      jurisdiccion:      body.jurisdiccion,
      consorcio_numero:  body.consorcio_numero ?? null,
      ubicacion:         body.ubicacion ?? null,
      descripcion:       body.descripcion ?? null,
      estado:            body.estado ?? 'planificada',
      fecha_inicio:      body.fecha_inicio ?? null,
      fecha_fin_estimada: body.fecha_fin_estimada ?? null,
      cantidad:          body.cantidad ?? null,
      unidad:            body.unidad ?? null,
      presupuesto_total: body.presupuesto_total ?? null,
      aporte_dvp:        body.aporte_dvp ?? null,
      aporte_ccc:        body.aporte_ccc ?? null,
      precio_unitario:    body.precio_unitario ?? null,
      datos_calculadora:  body.datos_calculadora ?? null,
      lat:                body.lat ?? null,
      lng:                body.lng ?? null,
      coords_linea:       body.coords_linea ?? null,
      proyecto_ripio_id:  body.proyecto_ripio_id ?? null,
      created_by:         auth.userId,
    })
    .select()
    .single()

  if (error) return dbError(error)
  return NextResponse.json(data, { status: 201 })
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const supabase = createServiceClient()

  // Admin ve todas las obras; los demás solo ven las propias
  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', auth.userId).single()
  const isAdmin = profile?.rol === 'admin'

  if (id) {
    const { data, error } = await supabase.from('obras').select('*').eq('id', id).single()
    if (error) return NextResponse.json({ error: error.message }, { status: 404 })
    // Non-admin no puede ver obras ajenas
    if (!isAdmin && data.created_by !== auth.userId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }
    return NextResponse.json(data)
  }

  // ?archivadas=1 → la papelera. Por defecto la lista muestra sólo las activas.
  const soloArchivadas = searchParams.get('archivadas') === '1'

  let query = supabase
    .from('obras')
    .select('*')
    .order(soloArchivadas ? 'archivado_en' : 'created_at', { ascending: false })

  if (soloArchivadas) query = query.not('archivado_en', 'is', null)
  else                query = query.is('archivado_en', null)

  // ?proyecto_ripio_id= → qué obras ya guardó ese proyecto, para ofrecer
  // sobrescribir en vez de duplicar
  const proyectoRipioId = searchParams.get('proyecto_ripio_id')
  if (proyectoRipioId) query = query.eq('proyecto_ripio_id', proyectoRipioId)

  if (!isAdmin) query = query.eq('created_by', auth.userId)

  const { data, error } = await query
  if (error) return dbError(error)

  // En la vista de archivadas interesa quién archivó. Se resuelve acá y no con
  // un join porque `obras.archivado_por` apunta a auth.users, no a profiles.
  if (soloArchivadas && data?.length) {
    const ids = [...new Set(data.map(o => o.archivado_por).filter(Boolean))] as string[]
    let nombres = new Map<string, string>()
    if (ids.length) {
      const { data: perfiles } = await supabase
        .from('profiles').select('id, nombre').in('id', ids)
      nombres = new Map((perfiles ?? []).map(p => [p.id as string, (p.nombre as string) ?? '']))
    }
    return NextResponse.json(data.map(o => ({
      ...o,
      archivado_por_nombre: o.archivado_por ? (nombres.get(o.archivado_por) || null) : null,
    })))
  }

  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const body = await req.json()
  const { id, ...fields } = body
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const supabase = createServiceClient()

  // Verificar propiedad (solo el creador o admin puede editar)
  const { data: obraActual } = await supabase.from('obras').select('created_by').eq('id', id).single()
  if (!obraActual) return NextResponse.json({ error: 'Obra no encontrada' }, { status: 404 })
  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', auth.userId).single()
  if (profile?.rol !== 'admin' && obraActual.created_by !== auth.userId) {
    return NextResponse.json({ error: 'No tenés permisos para editar esta obra' }, { status: 403 })
  }

  // Restaurar desde archivadas. Va antes del update general porque ése pisa
  // cada campo con `?? null`: llamarlo con sólo el id vaciaría la obra entera.
  if (fields.restaurar === true) {
    const { data, error } = await supabase
      .from('obras')
      .update({ archivado_en: null, archivado_por: null })
      .eq('id', id)
      .select()
      .single()
    if (error) return dbError(error)
    return NextResponse.json(data)
  }

  const { data, error } = await supabase
    .from('obras')
    .update({
      tipo:               fields.tipo,
      jurisdiccion:       fields.jurisdiccion,
      consorcio_numero:   fields.consorcio_numero ?? null,
      ubicacion:          fields.ubicacion ?? null,
      descripcion:        fields.descripcion ?? null,
      estado:             fields.estado,
      fecha_inicio:       fields.fecha_inicio ?? null,
      fecha_fin_estimada: fields.fecha_fin_estimada ?? null,
      cantidad:           fields.cantidad ?? null,
      unidad:             fields.unidad ?? null,
      presupuesto_total:  fields.presupuesto_total ?? null,
      aporte_dvp:         fields.aporte_dvp ?? null,
      aporte_ccc:         fields.aporte_ccc ?? null,
      precio_unitario:    fields.precio_unitario ?? null,
      datos_calculadora:  fields.datos_calculadora ?? null,
      lat:                fields.lat ?? null,
      lng:                fields.lng ?? null,
      coords_linea:       fields.coords_linea ?? null,
      // Sólo se pisa si viene: editar una obra a mano no debe desvincularla
      // del proyecto del que salió.
      ...(fields.proyecto_ripio_id !== undefined
        ? { proyecto_ripio_id: fields.proyecto_ripio_id }
        : {}),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return dbError(error)
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const supabase = createServiceClient()

  // Verificar propiedad (solo el creador o admin puede eliminar)
  const { data: obraActual } = await supabase
    .from('obras').select('created_by, archivado_en').eq('id', id).single()
  if (!obraActual) return NextResponse.json({ error: 'Obra no encontrada' }, { status: 404 })
  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', auth.userId).single()
  const isAdmin = profile?.rol === 'admin'
  if (!isAdmin && obraActual.created_by !== auth.userId) {
    return NextResponse.json({ error: 'No tenés permisos para eliminar esta obra' }, { status: 403 })
  }

  // ?purgar=1 → borrado definitivo. Sólo admin y sólo sobre una obra ya
  // archivada: dos pasos deliberados antes de perder documentación presentada.
  if (searchParams.get('purgar') === '1') {
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Sólo un administrador puede eliminar una obra definitivamente' },
        { status: 403 },
      )
    }
    if (!obraActual.archivado_en) {
      return NextResponse.json(
        { error: 'La obra tiene que estar archivada antes de eliminarla definitivamente' },
        { status: 409 },
      )
    }
    const { error } = await supabase.from('obras').delete().eq('id', id)
    if (error) return dbError(error)
    return NextResponse.json({ ok: true, purgada: true })
  }

  // Borrado normal = archivar. La obra desaparece de la lista pero queda en la
  // base y se puede restaurar desde la vista de archivadas.
  const { error } = await supabase
    .from('obras')
    .update({ archivado_en: new Date().toISOString(), archivado_por: auth.userId })
    .eq('id', id)

  if (error) return dbError(error)
  return NextResponse.json({ ok: true, archivada: true })
}
