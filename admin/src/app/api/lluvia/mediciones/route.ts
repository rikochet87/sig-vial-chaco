/**
 * Mediciones de pluviómetro: cargarlas y medir cuánto se equivoca el modelo.
 *
 *   POST { importar: true, desde, hasta }  → trae los partes de la API de la APA
 *   POST { fecha, texto }                  → lee un parte en prosa y muestra lo reconocido
 *   POST { fecha, lecturas, guardar }      → guarda las lecturas revisadas
 *   GET                                     → métricas acumuladas y factor sugerido
 *
 * El camino normal es el primero: la APA publica sus mediciones en JSON y no
 * hay que transcribir nada. Los otros dos quedan como respaldo para cuando el
 * mapa del organismo no responde y el dato sólo está en la prensa, que es
 * exactamente el momento en que uno lo necesita.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requirePermiso, requireAdminRole, dbError } from '@/lib/apiAuth'
import {
  leerParteApa, metricas, ajustarFactor, evaluarCorreccion, type Par,
} from '@/lib/calibracion'
import { ESTACIONES_APA } from '@/data/estacionesApa'
import { hace, aISO, CENTROS_CONSORCIO } from '@/lib/lluvia'
import { importarPartes, ErrorImportacion } from '@/lib/importarPartes'

const PAGINA = 1000

export async function POST(req: NextRequest) {
  // Cargar mediciones es escribir verdad de campo: sólo admin
  const auth = await requireAdminRole()
  if (auth instanceof NextResponse) return auth

  const body = await req.json().catch(() => ({}))

  if (body.importar) return importar(body, auth.userId)

  const fecha: string = body.fecha ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: 'Falta la fecha del parte (AAAA-MM-DD)' }, { status: 400 })
  }

  // ── Leer un parte en prosa y devolver lo reconocido ──────────────────────
  if (typeof body.texto === 'string' && !body.guardar) {
    const { lecturas, desconocidos } = leerParteApa(body.texto)
    return NextResponse.json({ fecha, lecturas, desconocidos })
  }

  // ── Guardar lo revisado a mano ───────────────────────────────────────────
  const lecturas: { estacion: string; mm: number }[] = Array.isArray(body.lecturas) ? body.lecturas : []
  if (lecturas.length === 0) {
    return NextResponse.json({ error: 'No hay lecturas para guardar' }, { status: 400 })
  }

  const conocidas = new Set(ESTACIONES_APA.map(e => e.nombre))
  const filas = lecturas
    .filter(l => conocidas.has(l.estacion) && Number.isFinite(l.mm) && l.mm >= 0 && l.mm <= 600)
    .map(l => ({
      estacion: l.estacion,
      fecha,
      mm: l.mm,
      red: 'apa',
      fuente_url: typeof body.fuenteUrl === 'string' ? body.fuenteUrl : null,
      cargado_por: auth.userId,
      cargado_en: new Date().toISOString(),
    }))

  if (filas.length === 0) {
    return NextResponse.json({ error: 'Ninguna lectura es válida' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('mediciones_lluvia')
    .upsert(filas, { onConflict: 'estacion,fecha' })
  if (error) return dbError(error)

  return NextResponse.json({ ok: true, fecha, guardadas: filas.length })
}

/**
 * Importación desde el mapa de la APA. La lógica está en
 * `lib/importarPartes.ts`, que también usa el cron de las 12:00.
 */
async function importar(
  body: { desde?: string; hasta?: string; soloNuevas?: boolean },
  userId: string,
) {
  try {
    return NextResponse.json(await importarPartes(createServiceClient(), { ...body, userId }))
  } catch (e) {
    if (e instanceof ErrorImportacion) {
      // Un error de la base no se muestra tal cual: puede describir el esquema
      if (e.codigo) return dbError({ message: e.message, code: e.codigo }, e.status, 'importar los partes')
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    throw e
  }
}

/**
 * Métricas: cada medición contra lo que dijo el modelo ese día.
 *
 * Para las filas importadas la comparación es exacta: `mm_modelo` se resolvió
 * en la coordenada de la estación. Para las cargadas a mano antes de tener la
 * API se cae al valor del consorcio cuyo centro de medición está más cerca —
 * una aproximación, pero es el número que el panel muestra y el que se va a
 * citar, así que tampoco es el peor sustituto.
 */
export async function GET() {
  const auth = await requirePermiso('lluvia')
  if (auth instanceof NextResponse) return auth
  const supabase = createServiceClient()

  /*
   * Paginado: `.limit(5000)` no alcanza, porque Supabase corta en mil filas por
   * pedido. Con más de mil mediciones las métricas se calculaban sobre las mil
   * más recientes —56 eventos de 168— y la pantalla lo mostraba como el total.
   */
  type Medicion = { estacion: string; fecha: string; mm: number; mm_modelo: number | null }
  const meds: Medicion[] = []
  for (let off = 0; ; off += PAGINA) {
    const { data, error } = await supabase
      .from('mediciones_lluvia')
      .select('estacion, fecha, mm, mm_modelo')
      .order('fecha', { ascending: false }).order('estacion')
      .range(off, off + PAGINA - 1)
    if (error) return dbError(error, 400, 'leer las mediciones')
    if (!data?.length) break
    meds.push(...(data as Medicion[]))
    if (data.length < PAGINA) break
  }

  if (!meds.length) {
    return NextResponse.json({
      mediciones: 0, eventos: 0, metricas: null, factor: null, evaluacion: null,
      aviso: 'Todavía no hay mediciones cargadas.',
    })
  }

  const fechas = [...new Set(meds.map(m => m.fecha as string))]
  const faltaModelo = meds.filter(m => m.mm_modelo == null)

  // Sólo para las viejas: el modelo por consorcio y fecha
  const modelo = new Map<string, number>()   // "consorcio|fecha" → mm
  if (faltaModelo.length) {
    const fechasViejas = [...new Set(faltaModelo.map(m => m.fecha as string))]
    for (let off = 0; ; off += PAGINA) {
      const { data, error } = await supabase
        .from('precipitaciones')
        .select('consorcio_numero, fecha, mm')
        .in('fecha', fechasViejas)
        // Sin `order` el paginado no es estable y se pierden o repiten filas
        .order('fecha').order('consorcio_numero')
        .range(off, off + PAGINA - 1)
      if (error) return dbError(error)
      if (!data?.length) break
      for (const r of data) modelo.set(`${r.consorcio_numero}|${r.fecha}`, Number(r.mm))
      if (data.length < PAGINA) break
    }
  }

  const cercano = new Map<string, number>()
  for (const e of ESTACIONES_APA) {
    let mejor = -1, dist = Infinity
    for (const c of CENTROS_CONSORCIO) {
      const d = (c.lat - e.lat) ** 2 + (c.lng - e.lng) ** 2
      if (d < dist) { dist = d; mejor = c.numero }
    }
    if (mejor > 0) cercano.set(e.nombre, mejor)
  }

  const pares: Par[] = []
  const porEvento = new Map<string, Par[]>()
  let exactos = 0
  for (const m of meds) {
    let mod: number | null | undefined = m.mm_modelo == null ? null : Number(m.mm_modelo)
    if (mod != null) exactos++
    else {
      const cc = cercano.get(m.estacion as string)
      mod = cc == null ? null : modelo.get(`${cc}|${m.fecha}`)
    }
    if (mod == null) continue

    const par: Par = { medido: Number(m.mm), modelo: mod }
    pares.push(par)
    const arr = porEvento.get(m.fecha as string) ?? []
    arr.push(par)
    porEvento.set(m.fecha as string, arr)
  }

  return NextResponse.json({
    mediciones: meds.length,
    eventos: fechas.length,
    comparables: pares.length,
    enCoordenadaExacta: exactos,
    metricas: pares.length ? metricas(pares) : null,
    factor: ajustarFactor(pares),
    evaluacion: evaluarCorreccion(porEvento),
    rango: { desde: fechas[fechas.length - 1], hasta: fechas[0] },
    sugerido: { desde: hace(30), hasta: aISO(new Date()) },
  })
}
