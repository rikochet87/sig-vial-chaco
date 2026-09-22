/**
 * Mediciones de pluviómetro: cargarlas y consultar cuánto se equivoca el modelo.
 *
 *   POST  { fecha, texto }            → lee el parte y devuelve lo reconocido
 *   POST  { fecha, lecturas, guardar} → guarda las lecturas revisadas
 *   GET                                → métricas acumuladas y factor sugerido
 *
 * El guardado va en dos pasos a propósito: el parte viene en prosa y el lector,
 * por más cuidado que tenga, puede equivocarse. Primero se muestra lo que
 * entendió, recién después se guarda.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, requireAdminRole, dbError } from '@/lib/apiAuth'
import {
  leerParteApa, metricas, ajustarFactor, evaluarCorreccion, type Par,
} from '@/lib/calibracion'
import { ESTACIONES_APA } from '@/data/estacionesApa'
import { hace, aISO, CENTROS_CONSORCIO } from '@/lib/lluvia'

const PAGINA = 1000

export async function POST(req: NextRequest) {
  // Cargar mediciones es escribir verdad de campo: sólo admin
  const auth = await requireAdminRole()
  if (auth instanceof NextResponse) return auth

  const body = await req.json().catch(() => ({}))
  const fecha: string = body.fecha ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: 'Falta la fecha del parte (AAAA-MM-DD)' }, { status: 400 })
  }

  // ── Paso 1: leer el texto y devolver lo reconocido ───────────────────────
  if (typeof body.texto === 'string' && !body.guardar) {
    const { lecturas, desconocidos } = leerParteApa(body.texto)
    return NextResponse.json({ fecha, lecturas, desconocidos })
  }

  // ── Paso 2: guardar lo revisado ──────────────────────────────────────────
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
 * Métricas: compara cada medición con lo que dijo el modelo ese día en el
 * consorcio cuyo centro de medición está más cerca de la estación.
 *
 * Es una aproximación —lo ideal sería consultar el modelo en la coordenada
 * exacta de la estación— pero es la comparación que importa: el número del
 * consorcio es el que se muestra y el que se va a citar.
 */
export async function GET() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const supabase = createServiceClient()

  const { data: meds, error: e1 } = await supabase
    .from('mediciones_lluvia')
    .select('estacion, fecha, mm')
    .order('fecha', { ascending: false })
    .limit(5000)
  if (e1) return dbError(e1)

  if (!meds?.length) {
    return NextResponse.json({
      mediciones: 0, eventos: 0, metricas: null, factor: null, evaluacion: null,
      aviso: 'Todavía no hay mediciones cargadas.',
    })
  }

  const fechas = [...new Set(meds.map(m => m.fecha as string))]

  // El modelo, por consorcio y fecha, para las fechas que tienen medición
  const modelo = new Map<string, number>()   // "consorcio|fecha" → mm
  for (let off = 0; ; off += PAGINA) {
    const { data, error } = await supabase
      .from('precipitaciones')
      .select('consorcio_numero, fecha, mm')
      .in('fecha', fechas)
      .range(off, off + PAGINA - 1)
    if (error) return dbError(error)
    if (!data?.length) break
    for (const r of data) modelo.set(`${r.consorcio_numero}|${r.fecha}`, Number(r.mm))
    if (data.length < PAGINA) break
  }

  // Estación → consorcio más cercano, por su centro de medición
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
  for (const m of meds) {
    const cc = cercano.get(m.estacion as string)
    if (cc == null) continue
    const mod = modelo.get(`${cc}|${m.fecha}`)
    if (mod == null) continue          // esa fecha todavía no se ingirió
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
    metricas: pares.length ? metricas(pares) : null,
    factor: ajustarFactor(pares),
    evaluacion: evaluarCorreccion(porEvento),
    rango: { desde: fechas[fechas.length - 1], hasta: fechas[0] },
    sugerido: { desde: hace(30), hasta: aISO(new Date()) },
  })
}
