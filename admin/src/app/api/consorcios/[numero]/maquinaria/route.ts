import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { dbError } from '@/lib/apiAuth'
import { validarMaquina, numeroDe } from '@/lib/maquinaria'
import { accesoMaquinaria, NO_VER, NO_CARGAR } from '@/lib/maquinariaAcceso'

/**
 * La maquinaria de un consorcio: GET lista, POST carga una.
 *
 * `maquinaria` tiene RLS sin políticas: sólo se llega con la clave de servicio,
 * así que la autorización es ésta (`lib/maquinariaAcceso.ts`). Ver: permiso
 * `consorcios`. Cargar: el administrador, o un técnico de la zona del consorcio.
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ numero: string }> },
) {
  const numero = numeroDe((await params).numero)
  if (numero == null) return NextResponse.json({ error: 'Número de consorcio inválido' }, { status: 400 })

  const acceso = await accesoMaquinaria(numero)
  if (acceso instanceof NextResponse) return acceso
  if (!acceso.ver) return NO_VER()

  // Un consorcio tiene decenas de máquinas, no miles: no hace falta paginar
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('maquinaria')
    .select('*')
    .eq('consorcio_numero', numero)
    .order('tipo_id')
    .order('created_at')
  if (error) return dbError(error, 500, 'leer la maquinaria')

  return NextResponse.json({
    maquinas: data ?? [],
    // La pantalla muestra u oculta los botones con esto; la ruta igual lo vuelve a decidir
    puede: { cargar: acceso.cargar, borrar: acceso.borrar },
    zona: acceso.zonaConsorcio,
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ numero: string }> },
) {
  const numero = numeroDe((await params).numero)
  if (numero == null) return NextResponse.json({ error: 'Número de consorcio inválido' }, { status: 400 })

  const acceso = await accesoMaquinaria(numero)
  if (acceso instanceof NextResponse) return acceso
  if (!acceso.cargar) return NO_CARGAR(acceso.zonaConsorcio)

  const v = validarMaquina(await request.json().catch(() => null), new Date().getFullYear())
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const ahora = new Date().toISOString()
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('maquinaria')
    // Quién y cuándo salen de la sesión y del servidor, no del navegador
    .insert({
      ...v.datos,
      consorcio_numero: numero,
      creado_por: acceso.userId,
      creado_por_nombre: acceso.nombre,
      created_at: ahora,
      actualizado_por: acceso.userId,
      actualizado_por_nombre: acceso.nombre,
      updated_at: ahora,
    })
    .select('*')
    .single()
  if (error) return dbError(error, 400, 'guardar la máquina')

  return NextResponse.json({ maquina: data }, { status: 201 })
}
