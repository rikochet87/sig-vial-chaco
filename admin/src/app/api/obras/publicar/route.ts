import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// PATCH /api/obras/publicar
// Body: { obra_id: string, tipo: 'todos' | 'seleccion' | 'despublicar', user_ids?: string[] }
export async function PATCH(req: NextRequest) {
  const { obra_id, tipo, user_ids = [] } = await req.json()
  if (!obra_id || !tipo) {
    return NextResponse.json({ error: 'obra_id y tipo son requeridos' }, { status: 400 })
  }

  const supabase = createServiceClient()

  if (tipo === 'despublicar') {
    // Quitar publicación: limpiar visible_para y destinatarios
    const [u, d] = await Promise.all([
      supabase.from('obras').update({ visible_para: null }).eq('id', obra_id),
      supabase.from('obra_destinatarios').delete().eq('obra_id', obra_id),
    ])
    if (u.error) return NextResponse.json({ error: u.error.message }, { status: 400 })
    if (d.error) return NextResponse.json({ error: d.error.message }, { status: 400 })
    return NextResponse.json({ ok: true, visible_para: null })
  }

  if (tipo === 'todos') {
    // Publicar para todos: setear visible_para = 'todos', limpiar destinatarios específicos
    const [u, d] = await Promise.all([
      supabase.from('obras').update({ visible_para: 'todos' }).eq('id', obra_id),
      supabase.from('obra_destinatarios').delete().eq('obra_id', obra_id),
    ])
    if (u.error) return NextResponse.json({ error: u.error.message }, { status: 400 })
    if (d.error) return NextResponse.json({ error: d.error.message }, { status: 400 })
    return NextResponse.json({ ok: true, visible_para: 'todos' })
  }

  if (tipo === 'seleccion') {
    if (!user_ids.length) {
      return NextResponse.json({ error: 'Seleccioná al menos un usuario' }, { status: 400 })
    }
    // 1. Actualizar visible_para = 'seleccion'
    const { error: uErr } = await supabase
      .from('obras')
      .update({ visible_para: 'seleccion' })
      .eq('id', obra_id)
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 400 })

    // 2. Reemplazar destinatarios: borrar los anteriores e insertar los nuevos
    const { error: dErr } = await supabase
      .from('obra_destinatarios')
      .delete()
      .eq('obra_id', obra_id)
    if (dErr) return NextResponse.json({ error: dErr.message }, { status: 400 })

    const rows = (user_ids as string[]).map(uid => ({ obra_id, user_id: uid }))
    const { error: iErr } = await supabase.from('obra_destinatarios').insert(rows)
    if (iErr) return NextResponse.json({ error: iErr.message }, { status: 400 })

    return NextResponse.json({ ok: true, visible_para: 'seleccion', count: rows.length })
  }

  return NextResponse.json({ error: 'tipo inválido' }, { status: 400 })
}
