import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, dbError } from '@/lib/apiAuth'
import { tienePermiso } from '@/lib/permisos'
import { COOKIE_ENLACE, enlaceVigente } from '@/lib/enlacePublico'
import {
  ajusteNeto, capaDe, leerTramo, longitudKm, partes, propiedadesDe, ubicarBase,
  validarGeometria, validarTramo, zonaDeCapa, ZONAS,
  type Cambio, type Linea, type Operacion, type Red, type TipoRed, type Tramo, type Zona,
} from '@/lib/redVial'

/**
 * Lo que comparten las rutas de `/api/red-vial`: quién pide, el archivo de la
 * red tal como lo ve el navegador, y cómo se arma una fila.
 *
 * **Los km y el tramo original salen del servidor, nunca del navegador.** El
 * navegador dice qué tramo del archivo edita (capa, posición, huella); el
 * servidor baja el archivo, lo busca y toma de ahí cómo era. Si el original
 * viniera en el pedido, alcanzaría con mandar uno inventado para mover los km
 * de cualquier consorcio.
 */

export interface AccesoRed {
  userId: string
  nombre: string | null
}

/** Escribir exige el permiso `red_vial` (el admin siempre puede) */
export async function accesoEdicion(): Promise<AccesoRed | NextResponse> {
  const auth = await requireAdmin()   // pese al nombre, sólo valida la sesión
  if (auth instanceof NextResponse) return auth
  const { data: perfil, error } = await createServiceClient()
    .from('profiles').select('nombre, rol, permisos').eq('id', auth.userId).maybeSingle()
  if (error) return dbError(error, 500, 'leer el perfil')
  const p = { rol: perfil?.rol as string | undefined, permisos: perfil?.permisos as string[] | undefined }
  if (!tienePermiso(p, 'red_vial')) {
    return NextResponse.json({ error: 'Se requiere el permiso «Editar red vial»' }, { status: 403 })
  }
  return { userId: auth.userId, nombre: (perfil?.nombre as string | undefined) ?? null }
}

/**
 * Leer los cambios: con sesión o con un enlace público vigente, el mismo
 * criterio que el middleware usa para servir `public/geo`. Los cambios son
 * parte de la red y la red la ve quien ve el archivo.
 */
export async function accesoLectura(): Promise<{ userId: string | null } | NextResponse> {
  const enlace = (await cookies()).get(COOKIE_ENLACE)?.value
  if (await enlaceVigente(enlace)) return { userId: null }
  return requireAdmin()
}

/**
 * El archivo de la red, bajado del propio sitio con la cookie del pedido (el
 * middleware no sirve `public/geo` sin sesión). Se recuerda diez minutos por
 * proceso: pesa 8,6 MB y no cambia entre despliegues.
 */
const cacheArchivo = new Map<TipoRed, { hasta: number; red: Promise<Red> }>()
const ARCHIVO: Record<TipoRed, string> = { cc: '/geo/geo_cc.json', rp: '/geo/geo_rp.json' }

export function archivoRed(request: NextRequest, tipo: TipoRed): Promise<Red> {
  const c = cacheArchivo.get(tipo)
  if (c && c.hasta > Date.now()) return c.red
  const red = fetch(new URL(ARCHIVO[tipo], request.nextUrl.origin), {
    headers: { cookie: request.headers.get('cookie') ?? '' },
    cache: 'no-store',
  }).then(async r => {
    if (!r.ok) throw new Error(`el archivo de la red respondió ${r.status}`)
    return (await r.json()) as Red
  })
  red.catch(() => cacheArchivo.delete(tipo))
  cacheArchivo.set(tipo, { hasta: Date.now() + 10 * 60_000, red })
  return red
}

/** La tabla o las funciones de docs/sql/18 todavía no se aplicaron */
export function faltaScript(error: { code?: string; message?: string }): boolean {
  return ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(error.code ?? '')
}

export function errorDeBase(error: { code?: string; message: string; details?: string }, donde: string) {
  if (faltaScript(error)) {
    return NextResponse.json({
      error: 'Falta crear la tabla de cambios de la red: hay que aplicar docs/sql/18-red-vial-cambios.sql en Supabase',
      codigo: 'sin_tabla',
    }, { status: 503 })
  }
  return dbError(error, 500, donde)
}

const aMulti = (g: Linea | { type: string; coordinates: unknown }): Linea =>
  ({ type: 'MultiLineString', coordinates: partes(g as Linea) })

/** El tramo del archivo al que apunta un pedido, leído del archivo */
export async function originalDelArchivo(
  request: NextRequest,
  tipo: TipoRed,
  ref: unknown,
): Promise<{ capa: string; indice: number; huella: string | null; original: NonNullable<Cambio['original']> } | NextResponse> {
  const r = ref as { capa?: unknown; indice?: unknown; huella?: unknown } | null
  const capa = typeof r?.capa === 'string' ? r.capa : null
  const indice = Number.isInteger(r?.indice) ? (r!.indice as number) : null
  const hue = typeof r?.huella === 'string' ? r.huella : null
  if (!capa || indice === null || indice < 0 || !hue) {
    return NextResponse.json({ error: 'Falta indicar qué tramo del archivo se edita' }, { status: 400 })
  }
  let red: Red
  try { red = await archivoRed(request, tipo) } catch (e) {
    console.error('[red-vial] archivo', e)
    return NextResponse.json({ error: 'No se pudo leer el archivo de la red' }, { status: 502 })
  }
  const i = ubicarBase(red, { base_capa: capa, base_indice: indice, base_huella: hue })
  const f = i === null ? undefined : red[capa]?.features[i]
  if (i === null || !f) {
    return NextResponse.json({
      error: 'Ese tramo ya no está en el archivo de la red (¿se regeneró desde QGIS?). Recargá la página.',
    }, { status: 409 })
  }
  return {
    capa, indice: i, huella: hue,
    original: { propiedades: f.properties ?? {}, geometria: aMulti(f.geometry as Linea) },
  }
}

/**
 * Valida lo que llega y arma la fila de `red_vial_cambios`. La zona de un tramo
 * de consorcio es la del consorcio, leída de la base; la de un tramo de la DVP
 * la elige quien carga.
 */
export async function armarFila(
  tipo: TipoRed,
  operacion: Operacion,
  body: { tramo?: unknown; geometria?: unknown },
  base: { capa: string; original: NonNullable<Cambio['original']> } | null,
  quien: AccesoRed,
): Promise<Record<string, unknown> | NextResponse> {
  const original = base
    ? { tramo: leerTramo(tipo, base.capa, base.original.propiedades), km: longitudKm(base.original.geometria) }
    : null

  if (operacion === 'baja') {
    if (!base || !original) return NextResponse.json({ error: 'Sólo se puede quitar un tramo del archivo' }, { status: 400 })
    return {
      red: tipo, operacion, capa: base.capa,
      propiedades: base.original.propiedades, geometria: base.original.geometria,
      gestion: original.tramo.gestion, consorcio_numero: original.tramo.consorcio, zona: original.tramo.zona,
      km: Math.round(original.km * 1000) / 1000,
      ajuste: ajusteNeto(original, null),
      actualizado_por: quien.userId, actualizado_por_nombre: quien.nombre,
    }
  }

  const g = validarGeometria(body.geometria)
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: 400 })
  const v = validarTramo(body.tramo, tipo)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  let zona: Zona | null = v.datos.zona
  if (v.datos.gestion === 'consorcio') {
    const { data: c, error } = await createServiceClient()
      .from('consorcios').select('numero, zona').eq('numero', v.datos.consorcio!).limit(1).maybeSingle()
    if (error) return dbError(error, 500, 'buscar el consorcio')
    if (!c) return NextResponse.json({ error: `El consorcio ${v.datos.consorcio} no existe` }, { status: 400 })
    const z = String(c.zona ?? '').trim().toUpperCase()
    zona = (ZONAS as string[]).includes(z) ? (z as Zona) : zona
  }
  if (!zona && base) zona = zonaDeCapa(base.capa) ?? original?.tramo.zona ?? null
  if (!zona) return NextResponse.json({ error: 'Elegí la zona' }, { status: 400 })

  const tramo: Tramo = { ...v.datos, zona }
  const km = longitudKm(g.datos)
  return {
    red: tipo, operacion, capa: capaDe(tramo),
    propiedades: propiedadesDe(tramo), geometria: g.datos,
    gestion: tramo.gestion, consorcio_numero: tramo.consorcio, zona,
    km: Math.round(km * 1000) / 1000,
    ajuste: ajusteNeto(original, { tramo, km }),
    actualizado_por: quien.userId, actualizado_por_nombre: quien.nombre,
  }
}

export const tipoDe = (v: unknown): TipoRed | null => (v === 'cc' || v === 'rp' ? v : null)
