/**
 * La altura de los ríos y canales internos de la provincia, del INA.
 *
 *   GET /api/lluvia/rios-internos?desde=&hasta=  → una serie diaria por estación
 *
 * Alimenta la vista «Ríos internos» de la pestaña Cuencas. Las estaciones y por
 * qué son ésas están en `lib/riosInternos.ts`.
 *
 * ── Por qué pasa por el servidor ──────────────────────────────────────────────
 *
 * Lo mismo que `/api/rio`: son siete pedidos a un organismo público, y desde
 * acá se hacen una vez y se cachean en vez de repetirse en cada navegador.
 *
 * **Van de a una, no en paralelo.** El Alerta Hidrológico deja de contestar
 * ante una ráfaga —pasó con el panel del Paraná—, y la primera consulta de una
 * serie puede tardar varios segundos. Cada estación se envuelve aparte: una
 * caída no tira abajo las otras seis, y la que falta se informa por nombre.
 *
 * ── El guard ──────────────────────────────────────────────────────────────────
 *
 * `requirePermiso('lluvia')`, el permiso de la pantalla que la consume.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requirePermiso } from '@/lib/apiAuth'
import { observacionesDeSerie } from '@/lib/ina'
import { hace, aISO } from '@/lib/lluvia'
import {
  ESTACIONES_INTERNAS, nombreDe,
  type EstacionInternaConSerie, type RespuestaRiosInternos,
} from '@/lib/riosInternos'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Cuánto vale la respuesta. Son medias diarias: el INA carga una por día, así
 * que una hora no deja a nadie mirando un dato viejo.
 */
const CACHE_S = 3600

/** Tope de días, para que nadie pida la serie entera sin querer */
const MAX_DIAS = 400

const ISO = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: NextRequest) {
  const auth = await requirePermiso('lluvia')
  if (auth instanceof NextResponse) return auth

  const sp = new URL(req.url).searchParams
  const hasta = ISO.test(sp.get('hasta') ?? '') ? sp.get('hasta')! : aISO(new Date())
  const desde = ISO.test(sp.get('desde') ?? '') ? sp.get('desde')! : hace(89)
  const dias = Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000) + 1
  if (!(dias >= 1)) return NextResponse.json({ error: 'El rango está al revés' }, { status: 400 })
  if (dias > MAX_DIAS) {
    return NextResponse.json({ error: `El rango es de ${dias} días y el máximo es ${MAX_DIAS}` }, { status: 400 })
  }

  // El INA toma `timeend` como instante: con la fecha a secas se pierde la
  // lectura de ese día, que está marcada a las 03:00 UTC.
  const fin = aISO(new Date(Date.parse(hasta) + 86_400_000))

  const estaciones: EstacionInternaConSerie[] = []
  const sinRespuesta: string[] = []
  const motivos: string[] = []

  for (const e of ESTACIONES_INTERNAS) {
    try {
      const lecturas = await observacionesDeSerie(e.serie, desde, fin)
      estaciones.push({ ...e, lecturas: lecturas.filter(l => l.fecha.slice(0, 10) <= hasta) })
    } catch (err) {
      sinRespuesta.push(nombreDe(e))
      motivos.push(`${nombreDe(e)}: ${err instanceof Error ? err.message : 'error'}`)
    }
  }

  // Si no contestó ninguna es un error, no una lista vacía que la pantalla
  // pueda leer como «los ríos no tienen datos».
  if (estaciones.length === 0) {
    return NextResponse.json(
      { error: motivos[0] ?? 'No se pudo consultar el Alerta Hidrológico del INA' },
      { status: 502 },
    )
  }

  const cuerpo: RespuestaRiosInternos = {
    desde, hasta, estaciones, sinRespuesta, motivos,
    fuente: 'Alerta Hidrológico — Instituto Nacional del Agua',
  }
  return NextResponse.json(cuerpo, {
    headers: { 'cache-control': `s-maxage=${CACHE_S}, stale-while-revalidate=${CACHE_S * 2}` },
  })
}
