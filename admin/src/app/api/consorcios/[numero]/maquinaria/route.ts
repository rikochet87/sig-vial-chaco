import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requirePermiso, dbError } from '@/lib/apiAuth'
import { validarMaquina, numeroDe } from '@/lib/maquinaria'

/**
 * La maquinaria de un consorcio: GET lista, POST carga una.
 *
 * `maquinaria` tiene RLS sin políticas: sólo se llega con la clave de servicio,
 * así que la autorización es ésta. El permiso es el de la pantalla que la
 * muestra, `consorcios`, para leer y para escribir.
 */

async function existeConsorcio(supabase: ReturnType<typeof createServiceClient>, numero: number) {
  const { data, error } = await supabase.from('consorcios').select('numero').eq('numero', numero).limit(1)
  return { existe: !error && (data?.length ?? 0) > 0, error }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ numero: string }> },
) {
  const auth = await requirePermiso('consorcios')
  if (auth instanceof NextResponse) return auth

  const numero = numeroDe((await params).numero)
  if (numero == null) return NextResponse.json({ error: 'Número de consorcio inválido' }, { status: 400 })

  // Un consorcio tiene decenas de máquinas, no miles: no hace falta paginar
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('maquinaria')
    .select('*')
    .eq('consorcio_numero', numero)
    .order('tipo_id')
    .order('created_at')
  if (error) return dbError(error, 500, 'leer la maquinaria')

  return NextResponse.json({ maquinas: data ?? [] })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ numero: string }> },
) {
  const auth = await requirePermiso('consorcios')
  if (auth instanceof NextResponse) return auth

  const numero = numeroDe((await params).numero)
  if (numero == null) return NextResponse.json({ error: 'Número de consorcio inválido' }, { status: 400 })

  const v = validarMaquina(await request.json().catch(() => null), new Date().getFullYear())
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const supabase = createServiceClient()
  const { existe, error: e1 } = await existeConsorcio(supabase, numero)
  if (e1) return dbError(e1, 500, 'buscar el consorcio')
  if (!existe) return NextResponse.json({ error: 'El consorcio no existe' }, { status: 404 })

  const { data, error } = await supabase.from('maquinaria')
    // `creado_por` sale de la sesión, no del navegador
    .insert({ ...v.datos, consorcio_numero: numero, creado_por: auth.userId })
    .select('*')
    .single()
  if (error) return dbError(error, 400, 'guardar la máquina')

  return NextResponse.json({ maquina: data }, { status: 201 })
}
