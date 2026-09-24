/**
 * Ingesta de precipitaciones.
 *
 * Dos disparadores:
 *   · el cron diario de Vercel, con `Authorization: Bearer $CRON_SECRET`
 *   · un admin desde la pantalla de lluvia, para rellenar hacia atrás
 *
 * Es reejecutable: la tabla tiene clave (consorcio, fecha) y se hace upsert, así
 * que correrla dos veces sobre el mismo rango actualiza en vez de duplicar. Eso
 * también sirve para corregir: el modelo afina los últimos días, y volver a
 * pedir la semana pisa los valores viejos con los definitivos.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, dbError } from '@/lib/apiAuth'
import { consultarLluvia, hace, aISO, diasEntre } from '@/lib/lluvia'
import { estimarPorConsorcio, type Medicion, type PuntoRed } from '@/lib/fusion'
import { PUNTOS_LLUVIA } from '@/data/puntosLluvia'
import { ESTACIONES_ACTIVAS, estacionPorId } from '@/data/estacionesApa'
import { fechasApa, lecturasApa } from '@/lib/apa'

/**
 * Tope de días por corrida.
 *
 * Open-Meteo cuenta una llamada por ubicación, y además cobra más caro los
 * rangos de más de dos semanas: dos semanas valen 1, cuatro valen 3. Con 453
 * puntos, una ventana de 14 días son ~453 llamadas contra el cupo de 600 por
 * minuto. Pedir un mes ya duplicaría el costo y saltaría el límite.
 *
 * Los rangos largos no se rechazan: la pantalla los parte en ventanas de 14
 * días y las manda de a una. Ver `ingerirPorVentanas` en la página de Lluvias.
 */
export const MAX_DIAS = 14

export const maxDuration = 60

async function autorizado(req: NextRequest): Promise<true | NextResponse> {
  const secreto = process.env.CRON_SECRET
  const cabecera = req.headers.get('authorization')
  if (secreto && cabecera === `Bearer ${secreto}`) return true

  // Sin secreto válido, tiene que ser una sesión de panel
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  return true
}

/**
 * Tope de días para el recálculo de fusión.
 *
 * Éste no toca Open-Meteo —los milímetros del modelo ya están guardados— así que
 * el límite no es el cupo sino el minuto que da Vercel. Cada fecha con parte es
 * una llamada corta a la APA; con 90 días entran de sobra.
 */
const MAX_DIAS_FUSION = 90

export async function POST(req: NextRequest) {
  const ok = await autorizado(req)
  if (ok instanceof NextResponse) return ok

  const { searchParams } = new URL(req.url)

  // Recalcular la fusión sin volver a pedir el modelo
  if (searchParams.get('soloFusion') === '1') {
    return recalcularFusion(
      searchParams.get('desde') ?? hace(30),
      searchParams.get('hasta') ?? aISO(new Date()),
    )
  }
  // Por defecto, la última semana. El cron corre todos los días y repisa: si un
  // día falló, la corrida siguiente lo recupera sin que nadie intervenga.
  const desde = searchParams.get('desde') ?? hace(7)
  const hasta = searchParams.get('hasta') ?? aISO(new Date())

  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    return NextResponse.json({ error: 'Fechas inválidas: se espera AAAA-MM-DD' }, { status: 400 })
  }
  const dias = diasEntre(desde, hasta)
  if (dias <= 0) {
    return NextResponse.json({ error: 'El rango está al revés o vacío' }, { status: 400 })
  }
  if (dias > MAX_DIAS) {
    return NextResponse.json(
      {
        error: `El rango es de ${dias} días y el máximo por corrida es ${MAX_DIAS}, `
             + 'por el cupo del servicio de lluvia.',
        maxDias: MAX_DIAS,
      },
      { status: 400 },
    )
  }

  let registros
  try {
    registros = await consultarLluvia(desde, hasta)
  } catch (e) {
    // El servicio externo caído no debe verse como un error de la base
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No se pudo consultar el servicio de lluvia' },
      { status: 502 },
    )
  }

  if (registros.length === 0) {
    return NextResponse.json({ ok: true, desde, hasta, filas: 0, aviso: 'El servicio no devolvió datos para ese rango' })
  }

  // ── La fusión con los pluviómetros ───────────────────────────────────────
  const fusion = await fusionar(registros, desde, hasta)

  const supabase = createServiceClient()

  // De a tandas: un upsert de 40 mil filas de una se cae por tamaño de payload
  const TANDA = 2000
  const ahora = new Date().toISOString()
  const conFusion = registros.map(r => ({
    ...r,
    fuente: 'open-meteo',
    actualizado_en: ahora,
    ...(fusion.porClave.get(`${r.consorcio_numero}|${r.fecha}`)
        ?? (fusion.sinParte.has(r.fecha) ? SIN_PARTE : {})),
  }))

  let filas = 0
  for (let i = 0; i < conFusion.length; i += TANDA) {
    const { error } = await supabase
      .from('precipitaciones')
      .upsert(conFusion.slice(i, i + TANDA), { onConflict: 'consorcio_numero,fecha' })
    if (error) return dbError(error)
    filas += Math.min(TANDA, conFusion.length - i)
  }

  return NextResponse.json({
    ok: true, desde, hasta, dias, filas,
    fusion: {
      fechasConParte: fusion.fechasConParte,
      fechasSinParte: fusion.fechasSinParte,
      filasConPluviometro: fusion.conPluviometro,
      aviso: fusion.aviso,
    },
  })
}

/**
 * Recalcula `mm_fusion` sobre lo que ya está guardado.
 *
 * El motivo de que exista aparte: la ingesta completa vuelve a consultar
 * Open-Meteo en 452 puntos por cada ventana de 14 días, y para arreglar la
 * fusión de tres meses eso son siete vueltas con pausas de 20 segundos —
 * gastando cupo para traer números que ya están en la tabla. Acá sólo se leen
 * las filas existentes, se cruzan con los partes de la APA y se actualizan las
 * columnas de fusión.
 */
async function recalcularFusion(desde: string, hasta: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    return NextResponse.json({ error: 'Fechas inválidas: se espera AAAA-MM-DD' }, { status: 400 })
  }
  const dias = diasEntre(desde, hasta)
  if (dias <= 0) return NextResponse.json({ error: 'El rango está al revés o vacío' }, { status: 400 })
  if (dias > MAX_DIAS_FUSION) {
    return NextResponse.json({
      error: `El rango es de ${dias} días y el máximo por recálculo es ${MAX_DIAS_FUSION}.`,
      maxDias: MAX_DIAS_FUSION,
    }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Lo que ya está guardado del modelo, que es lo que se usa de respaldo
  const registros: { consorcio_numero: number; fecha: string; mm: number }[] = []
  for (let off = 0; ; off += 1000) {
    const { data, error } = await supabase
      .from('precipitaciones')
      .select('consorcio_numero, fecha, mm')
      .gte('fecha', desde).lte('fecha', hasta)
      // Sin `order` el paginado no es estable y se pierden o repiten filas
      .order('fecha').order('consorcio_numero')
      .range(off, off + 999)
    if (error) return dbError(error)
    if (!data?.length) break
    for (const r of data) {
      registros.push({
        consorcio_numero: r.consorcio_numero as number,
        fecha: r.fecha as string,
        mm: Number(r.mm),
      })
    }
    if (data.length < 1000) break
  }

  if (registros.length === 0) {
    return NextResponse.json({
      ok: true, filas: 0,
      aviso: 'No hay milímetros guardados en ese rango. Primero hay que ingerir el modelo.',
    })
  }

  const fusion = await fusionar(registros, desde, hasta)
  if (fusion.porClave.size === 0 && fusion.sinParte.size === 0) {
    return NextResponse.json({
      ok: true, filas: 0,
      aviso: fusion.aviso
        ?? 'La APA no tiene partes en ese rango, así que no hay con qué cruzar.',
    })
  }

  // Sólo se tocan las columnas de fusión: `mm` no se pisa
  const ahora = new Date().toISOString()
  const filas = registros
    .filter(r => fusion.porClave.has(`${r.consorcio_numero}|${r.fecha}`)
              || fusion.sinParte.has(r.fecha))
    .map(r => ({
      consorcio_numero: r.consorcio_numero,
      fecha: r.fecha,
      mm: r.mm,
      actualizado_en: ahora,
      ...(fusion.porClave.get(`${r.consorcio_numero}|${r.fecha}`) ?? SIN_PARTE),
    }))

  for (let i = 0; i < filas.length; i += 2000) {
    const { error } = await supabase
      .from('precipitaciones')
      .upsert(filas.slice(i, i + 2000), { onConflict: 'consorcio_numero,fecha' })
    if (error) return dbError(error)
  }

  return NextResponse.json({
    ok: true,
    desde, hasta, dias,
    filas: filas.length,
    fechasConParte: fusion.fechasConParte,
    fechasSinParte: fusion.fechasSinParte,
    aviso: fusion.aviso,
  })
}

interface FilaFusion {
  mm_fusion: number
  procedencia: string
  dist_pluviometro_km: number | null
  fraccion_estimada: number
  estaciones_usadas: number
}

/**
 * Interpola los pluviómetros de la APA sobre la red vial de cada consorcio.
 *
 * Dos reglas que no son obvias:
 *
 * 1. **Una estación activa que no figura en el parte midió cero.** La APA nunca
 *    publica ceros, así que hay que deducirlos, y sin ellos no se puede
 *    interpolar: quedaría lloviendo en toda la provincia. Se completa con cero
 *    sólo sobre las 71 que efectivamente reportan, nunca sobre las 111 del
 *    catálogo.
 *
 * 2. **Eso vale únicamente para fechas que tienen parte.** Si la APA no publicó
 *    nada ese día, no se puede concluir que no llovió en ningún lado, así que
 *    esa fecha se deja sin fusión y en pantalla sigue el modelo.
 *
 * Si el mapa de la APA está caído, la ingesta del modelo igual se guarda: la
 * fusión se completa sola en la próxima corrida, porque es reejecutable.
 */
async function fusionar(
  registros: { consorcio_numero: number; fecha: string; mm: number }[],
  desde: string,
  hasta: string,
) {
  const porClave = new Map<string, FilaFusion>()
  /** Fechas del rango para las que la APA no publicó parte */
  const sinParte = new Set<string>()
  const vacio = {
    porClave, sinParte, fechasConParte: 0, fechasSinParte: 0, conPluviometro: 0,
    aviso: null as string | null,
  }

  let conParte: string[]
  try {
    conParte = (await fechasApa()).filter(f => f >= desde && f <= hasta)
  } catch (e) {
    return { ...vacio, aviso: `Sin fusión: ${(e as Error).message}` }
  }

  const fechasPedidas = [...new Set(registros.map(r => r.fecha))]
  const hay = new Set(conParte)

  /**
   * El modelo, para el respaldo fuera de radio.
   *
   * Es el promedio del consorcio, no el valor en cada punto: `consultarLluvia`
   * ya agregó. Se le pasa el mismo número a todos los puntos del consorcio, que
   * es una aproximación — pero sólo pesa donde no hay ningún pluviómetro a
   * menos de 60 km, que son tres consorcios.
   */
  const modelo = new Map<string, number>()   // "cc|fecha" → mm
  for (const r of registros) modelo.set(`${r.consorcio_numero}|${r.fecha}`, r.mm)

  let usadas = 0
  for (const fecha of fechasPedidas) {
    // Sin parte no hay nada con qué cruzar, y eso **no** es lo mismo que "no se
    // recalculó todavía": recalcular no lo puede arreglar porque el dato no
    // existe. Se marca aparte para que la pantalla no ofrezca un botón inútil.
    if (!hay.has(fecha)) { sinParte.add(fecha); continue }

    let lecturas
    try {
      lecturas = (await lecturasApa(fecha)).lecturas
    } catch {
      continue   // esa fecha queda sin fusión; la próxima corrida la toma
    }

    const medido = new Map<number, number>()
    for (const l of lecturas) if (estacionPorId(l.id)) medido.set(l.id, l.mm)

    // Las activas que no informaron midieron cero
    const mediciones: Medicion[] = ESTACIONES_ACTIVAS.map(e => ({
      lat: e.lat, lng: e.lng, mm: medido.get(e.id) ?? 0,
    }))

    const puntos: PuntoRed[] = PUNTOS_LLUVIA.map(p => ({
      ...p, mmModelo: modelo.get(`${p.cc}|${fecha}`) ?? null,
    }))

    for (const c of estimarPorConsorcio(puntos, mediciones)) {
      porClave.set(`${c.consorcio}|${fecha}`, {
        mm_fusion: c.mm,
        procedencia: c.procedencia,
        dist_pluviometro_km: c.distanciaKm,
        fraccion_estimada: c.fraccionEstimada,
        estaciones_usadas: medido.size,
      })
    }
    usadas++
  }

  return {
    porClave,
    sinParte,
    fechasConParte: usadas,
    fechasSinParte: sinParte.size,
    conPluviometro: porClave.size,
    aviso: null,
  }
}

/** Marca de una fila cuya fecha no tiene parte de la APA */
const SIN_PARTE = {
  mm_fusion: null,
  procedencia: 'sin_parte',
  dist_pluviometro_km: null,
  fraccion_estimada: 1,
  estaciones_usadas: 0,
} as const

/** El cron de Vercel pega con GET. Mismo trabajo, rango por defecto. */
export async function GET(req: NextRequest) {
  return POST(req)
}
