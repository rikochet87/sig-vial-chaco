import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, dbError } from '@/lib/apiAuth'
import { tienePermiso } from '@/lib/permisos'
import { puedeCargar, puedeBorrar } from '@/lib/maquinaria'

/**
 * Quién es el que pide y qué puede hacer con la maquinaria de un consorcio.
 * Lo usan las dos rutas de `/api/consorcios/[numero]/maquinaria`.
 *
 * Las reglas están en `lib/maquinaria.ts` (`puedeCargar`, `puedeBorrar`); acá
 * se leen el perfil y la zona del consorcio **de la base**, nunca del navegador.
 *
 * Para **ver** alcanza con el permiso `consorcios`, el de la pantalla. Para
 * **cargar** no se exige además ese permiso: lo que decide es ser técnico de
 * la zona o administrador. Un técnico igual necesita `consorcios` para llegar
 * a la página, porque el middleware lo pide por ruta.
 */

export interface AccesoMaquinaria {
  userId: string
  nombre: string | null
  zonaConsorcio: string | null
  ver: boolean
  cargar: boolean
  borrar: boolean
}

export async function accesoMaquinaria(numero: number): Promise<AccesoMaquinaria | NextResponse> {
  const auth = await requireAdmin()   // pese al nombre, sólo valida la sesión
  if (auth instanceof NextResponse) return auth

  const supabase = createServiceClient()
  const [{ data: perfil, error: e1 }, { data: consorcio, error: e2 }] = await Promise.all([
    supabase.from('profiles').select('nombre, rol, zona, permisos').eq('id', auth.userId).maybeSingle(),
    supabase.from('consorcios').select('zona').eq('numero', numero).limit(1).maybeSingle(),
  ])
  if (e1) return dbError(e1, 500, 'leer el perfil')
  if (e2) return dbError(e2, 500, 'buscar el consorcio')
  if (!consorcio) return NextResponse.json({ error: 'El consorcio no existe' }, { status: 404 })

  // Sin fila de perfil, nada: un dato ausente no puede dar permisos
  const p = {
    rol: (perfil?.rol as string | undefined) ?? null,
    zona: (perfil?.zona as string | undefined) ?? null,
    permisos: (perfil?.permisos as string[] | undefined) ?? null,
  }
  const zonaConsorcio = (consorcio.zona as string | null) ?? null
  const cargar = puedeCargar(p, zonaConsorcio)
  return {
    userId: auth.userId,
    nombre: (perfil?.nombre as string | undefined) ?? null,
    zonaConsorcio,
    // Quien puede cargar, puede ver lo que carga
    ver: cargar || tienePermiso(p, 'consorcios'),
    cargar,
    borrar: puedeBorrar(p),
  }
}

export const NO_VER = () =>
  NextResponse.json({ error: 'Se requiere el permiso «consorcios»' }, { status: 403 })

export const NO_CARGAR = (zona: string | null) =>
  NextResponse.json(
    { error: `Sólo los técnicos de la zona ${zona ?? 'del consorcio'} y el administrador cargan maquinaria acá` },
    { status: 403 },
  )

export const NO_BORRAR = () =>
  NextResponse.json({ error: 'Sólo el administrador borra equipos' }, { status: 403 })
