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
import { requireAdmin, requireAdminRole, dbError } from '@/lib/apiAuth'
import {
  leerParteApa, metricas, ajustarFactor, evaluarCorreccion, type Par,
} from '@/lib/calibracion'
import { ESTACIONES_APA, estacionPorId } from '@/data/estacionesApa'
import { fechasApa, lecturasApa, urlParteApa, type LecturaApa } from '@/lib/apa'
import { hace, aISO, consultarPuntos, claveCoord, CENTROS_CONSORCIO } from '@/lib/lluvia'

const PAGINA = 1000

/**
 * Tope de fechas por corrida.
 *
 * Open-Meteo factura por ubicación y por largo del rango, y la APA quiere una
 * llamada por fecha. Sin tope, pedir "todo el histórico" son 162 llamadas a la
 * APA y un rango de un año sobre 111 estaciones, que se come el cupo diario.
 * Con tope, el backfill se hace en varias corridas y cada una termina.
 */
const MAX_FECHAS = 25

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
 * Importación automática desde el mapa de la APA.
 *
 * Trae los partes del rango pedido y, en la misma corrida, consulta el modelo
 * en la coordenada exacta de cada estación que informó. El par queda armado y
 * congelado en la fila: no depende de que después se haya ingerido el consorcio
 * correspondiente, ni se mueve si mañana el modelo revisa sus números.
 */
async function importar(
  body: { desde?: string; hasta?: string; soloNuevas?: boolean },
  userId: string,
) {
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(body.desde ?? '') ? body.desde! : hace(30)
  const hasta = /^\d{4}-\d{2}-\d{2}$/.test(body.hasta ?? '') ? body.hasta! : aISO(new Date())
  if (desde > hasta) {
    return NextResponse.json({ error: 'El rango está al revés' }, { status: 400 })
  }

  const supabase = createServiceClient()

  let disponibles: string[]
  try {
    disponibles = (await fechasApa()).filter(f => f >= desde && f <= hasta).sort()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }

  if (disponibles.length === 0) {
    return NextResponse.json({
      ok: true, fechas: 0, guardadas: 0,
      aviso: 'La APA no tiene partes cargados en ese rango.',
    })
  }

  // Saltear lo ya importado, salvo que se pida explícitamente rehacerlo
  if (body.soloNuevas !== false) {
    const { data } = await supabase
      .from('mediciones_lluvia')
      .select('fecha')
      .gte('fecha', desde).lte('fecha', hasta)
      .not('importado_en', 'is', null)
    const ya = new Set((data ?? []).map(r => r.fecha as string))
    disponibles = disponibles.filter(f => !ya.has(f))
  }

  // De las más recientes hacia atrás: si hay que cortar, que quede lo último
  const fechas = disponibles.slice(-MAX_FECHAS)
  if (fechas.length === 0) {
    return NextResponse.json({
      ok: true, fechas: 0, guardadas: 0,
      aviso: 'Todas las fechas del rango ya estaban importadas.',
    })
  }

  // ── Los partes ───────────────────────────────────────────────────────────
  const porFecha = new Map<string, LecturaApa[]>()
  let periodo = ''
  const sinReconocer = new Set<string>()

  for (const f of fechas) {
    let r
    try {
      r = await lecturasApa(f)
    } catch (e) {
      // Si se cae a mitad de camino, se guarda lo que ya vino
      if (porFecha.size === 0) return NextResponse.json({ error: (e as Error).message }, { status: 502 })
      break
    }
    periodo = r.periodo || periodo
    const validas = r.lecturas.filter(l => {
      const e = estacionPorId(l.id)
      if (!e) { sinReconocer.add(`${l.nombre} (id ${l.id})`); return false }
      return true
    })
    if (validas.length) porFecha.set(f, validas)
  }

  if (porFecha.size === 0) {
    return NextResponse.json({
      ok: true, fechas: 0, guardadas: 0,
      aviso: 'Las fechas del rango vinieron sin ninguna estación informada.',
    })
  }

  // ── El modelo, en la coordenada de cada estación que informó ─────────────
  const traidas = [...porFecha.keys()].sort()
  const estaciones = new Map<number, { lat: number; lng: number }>()
  for (const ls of porFecha.values()) {
    for (const l of ls) {
      const e = estacionPorId(l.id)
      if (e) estaciones.set(l.id, { lat: e.lat, lng: e.lng })
    }
  }

  let modelo = new Map<string, Map<string, number>>()
  let avisoModelo: string | null = null
  try {
    modelo = await consultarPuntos([...estaciones.values()], traidas[0], traidas[traidas.length - 1])
  } catch (e) {
    // Sin el modelo la medición sigue valiendo: se guarda igual y el par se
    // completa en la próxima corrida.
    avisoModelo = `Se guardaron las mediciones pero no se pudo consultar el modelo: ${(e as Error).message}`
  }

  // ── Guardar ──────────────────────────────────────────────────────────────
  const ahora = new Date().toISOString()
  const filas = []
  for (const [f, ls] of porFecha) {
    for (const l of ls) {
      const e = estacionPorId(l.id)!
      const mm = modelo.get(claveCoord({ lat: e.lat, lng: e.lng }))?.get(f)
      filas.push({
        estacion: e.nombre,
        fecha: f,
        mm: l.mm,
        mm_modelo: mm == null ? null : Math.round(mm * 100) / 100,
        red: 'apa',
        periodo: periodo || null,
        fuente_url: urlParteApa(f),
        cargado_por: userId,
        cargado_en: ahora,
        importado_en: ahora,
      })
    }
  }

  const { error } = await supabase
    .from('mediciones_lluvia')
    .upsert(filas, { onConflict: 'estacion,fecha' })
  if (error) return dbError(error)

  return NextResponse.json({
    ok: true,
    fechas: porFecha.size,
    guardadas: filas.length,
    conModelo: filas.filter(f => f.mm_modelo != null).length,
    periodo,
    rango: { desde: traidas[0], hasta: traidas[traidas.length - 1] },
    pendientes: Math.max(0, disponibles.length - fechas.length),
    sinReconocer: [...sinReconocer],
    aviso: avisoModelo,
  })
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
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const supabase = createServiceClient()

  const { data: meds, error: e1 } = await supabase
    .from('mediciones_lluvia')
    .select('estacion, fecha, mm, mm_modelo')
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
