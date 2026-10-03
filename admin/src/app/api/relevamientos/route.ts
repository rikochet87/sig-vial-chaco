/**
 * Alta de un relevamiento de gabinete: cargado desde el panel, no en el lugar.
 *
 *   POST /api/relevamientos → { id }
 *
 * La app móvil no pasa por acá: escribe directo en Supabase con su sesión y
 * RLS. Esta ruta es para la carga desde la computadora, con la clave de
 * servicio, así que la autorización la hace `requirePermiso` y la forma de la
 * fila la decide esta ruta, no el navegador.
 *
 * Tres cosas que no son obvias:
 *
 * - **El relevamiento queda marcado `datos_especificos.origen = 'gabinete'`.**
 *   Una alcantarilla cargada mirando el satélite no es lo mismo que una medida
 *   con cinta en el lugar, y quien lea la ficha tiene que poder saberlo. Va en
 *   el JSON y no en una columna para no depender de un `alter table` aplicado a
 *   mano en el editor de Supabase; la app ignora la clave.
 * - **`tecnico_id` es quien está logueado**, sacado de la sesión. El navegador
 *   no lo manda: si lo mandara, cualquiera podría cargar a nombre de otro.
 * - **Es `insert`, no `upsert`.** El id lo genera el navegador con el mismo
 *   formato que la app (`Date.now()`); si chocara con uno existente, un upsert
 *   lo pisaría en silencio. Con insert, el choque es un error 23505.
 */

import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { requirePermiso, dbError } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

const TIPOS = ['Puente', 'Alcantarilla', 'Tubos', 'Lineal', 'Otro'] as const
const CLAVE: Record<(typeof TIPOS)[number], string> = {
  Puente: 'puente', Alcantarilla: 'alcantarilla', Tubos: 'tubos', Lineal: 'ripio', Otro: 'otro',
}
const ESTADOS = ['Bueno', 'Regular', 'Malo']
const ZONAS = ['ZI', 'ZII', 'ZIII', 'ZIV', 'ZV']

/** El Chaco con margen: una coordenada afuera es un error de carga, no un relevamiento */
const dentroDelChaco = (lat: number, lng: number) =>
  lat > -29 && lat < -23.5 && lng > -63.5 && lng < -57.5

const texto = (v: unknown, max = 2000): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null

export async function POST(request: Request) {
  const auth = await requirePermiso('relevamientos')
  if (auth instanceof NextResponse) return auth

  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const id = String(body.id ?? '')
  if (!/^\d{10,16}$/.test(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 })

  const tipo = body.tipo as (typeof TIPOS)[number]
  if (!TIPOS.includes(tipo)) return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })

  // ── Geometría ──
  let lat: number, lng: number
  let linea: { lat: number; lng: number; prog: number }[] | null = null
  if (tipo === 'Lineal') {
    const pts = Array.isArray(body.coords_linea) ? body.coords_linea as { lat: unknown; lng: unknown; prog?: unknown }[] : []
    linea = pts.map(p => ({ lat: Number(p.lat), lng: Number(p.lng), prog: Number(p.prog) || 0 }))
    if (linea.length < 2 || linea.length > 5000 || linea.some(p => !dentroDelChaco(p.lat, p.lng))) {
      return NextResponse.json({ error: 'El tramo necesita al menos dos puntos dentro de la provincia' }, { status: 400 })
    }
    ;({ lat, lng } = linea[0])
  } else {
    lat = Number(body.coords_lat); lng = Number(body.coords_lng)
    if (!dentroDelChaco(lat, lng)) {
      return NextResponse.json({ error: 'La ubicación tiene que estar dentro de la provincia' }, { status: 400 })
    }
  }

  // ── Fotos: sólo las de nuestro bucket y de esta carpeta ──
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/relevamiento-fotos/${id}/`
  const fotos = (Array.isArray(body.fotos) ? body.fotos : [])
    .filter((u): u is string => typeof u === 'string' && u.startsWith(base))
    .slice(0, 10)

  const datos = body.datos && typeof body.datos === 'object' ? body.datos as Record<string, unknown> : {}
  const fecha = typeof body.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.fecha)
    ? `${body.fecha}T12:00:00.000Z`
    : new Date().toISOString()

  const fila = {
    id,
    tecnico_id: auth.userId,
    tipo,
    estado_calzada: ESTADOS.includes(String(body.estado_calzada)) ? body.estado_calzada : null,
    coords_lat: lat,
    coords_lng: lng,
    coords_linea: linea,
    ruta_tramo: texto(body.ruta_tramo, 200) ?? '',
    cc_asociado: texto(body.cc_asociado, 200),
    zona: ZONAS.includes(String(body.zona)) ? body.zona : null,
    observaciones: texto(body.observaciones) ?? '',
    fotos,
    datos_especificos: { [CLAVE[tipo]]: datos, origen: 'gabinete' },
    fecha,
  }

  const supabase = createServiceClient()
  const { error } = await supabase.from('relevamientos').insert(fila)
  if (error) return dbError(error, error.code === '23505' ? 409 : 500, 'guardar el relevamiento')

  return NextResponse.json({ id })
}
