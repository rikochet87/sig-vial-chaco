/**
 * Altura en Barranqueras para los próximos ~16 días, a partir de la lluvia
 * medida y pronosticada en el Paraná brasileño. La cadena está en
 * `lib/crecida.ts`; el método y su validación, en
 * `docs/pronostico-crecida-barranqueras.md`.
 *
 * Qué junta, en este orden:
 *
 * 1. **La altura de hoy en Barranqueras**, de Prefectura; si no contesta, la
 *    última del INA. Sin altura de hoy no hay pronóstico: la cadena calcula el
 *    cambio desde ahí.
 * 2. **El ONS**: lo congelado en `ons_represas.json` más el CSV del año en
 *    curso. Llega con dos días de atraso.
 * 3. **La lluvia**: lo congelado en `lluvia_brasil.json`, lo que falta hasta
 *    ayer con `past_days`, y las 51 corridas del ensamble del ECMWF.
 *
 * El Paraguay va con lo congelado en `confluencia_caudal.json` y, después,
 * quieto: pesa poco en el cambio de altura y su serie del INA se carga con
 * días de atraso.
 *
 * **No es un pronóstico oficial**, y la respuesta lo dice: el del INA lo es.
 *
 * Guard: `requireLecturaHidrologia()`, como las demás lecturas del río: entra
 * en los enlaces públicos.
 */

import { NextResponse } from 'next/server'
import { requireLecturaHidrologia } from '@/lib/apiAuth'
import {
  diaDe, isoDe, lector, pronosticoDeCrecida, CUENCAS_BRASIL,
  type CuencaBrasil, type ParametrosCrecida,
} from '@/lib/crecida'
import { onsReciente, lluviaReciente, ensamble, type RepresaOns } from '@/lib/crecidaFuente'
import { prefecturaOAviso, filaDe } from '@/lib/prefectura'
import { estadoCompleto, ESTACIONES } from '@/lib/ina'
import parametros from '../../../../../public/rio/crecida_parametros.json'
import onsCongelado from '../../../../../public/rio/ons_represas.json'
import lluviaCongelada from '../../../../../public/rio/lluvia_brasil.json'
import confluencia from '../../../../../public/rio/confluencia_caudal.json'

export const dynamic = 'force-dynamic'
/** El CSV del ONS son ~9 MB */
export const maxDuration = 60
/** Tres horas: el ECMWF corre cada seis y el ONS publica una vez por día */
const CACHE_S = 10_800

const BARRANQUERAS = 20

/** Hoy en la Argentina (UTC−3), como día entero */
const hoyLocal = () => diaDe(new Date(Date.now() - 3 * 3_600_000).toISOString())

type Lluvia = { desde: string; hasta: string; cuencas: Record<CuencaBrasil, { nombre: string; puntos: [number, number][]; lluvia: (number | null)[]; etp: (number | null)[] }> }
type Ons = { desde: string; hasta: string; series: Record<string, Record<string, (number | null)[] | string>> }

export async function GET() {
  const auth = await requireLecturaHidrologia()
  if (auth instanceof NextResponse) return auth

  const avisos: string[] = []
  const hoy = hoyLocal()
  const ayer = isoDe(hoy - 1)

  // ── 1. Altura de hoy ──────────────────────────────────────────────────────
  let alturaHoy: { m: number; fecha: string; fuente: string } | null = null
  const pna = await prefecturaOAviso()
  const fila = pna.filas ? filaDe(pna.filas, BARRANQUERAS) : null
  if (fila?.ultimo) alturaHoy = { m: fila.ultimo.m, fecha: fila.ultimo.fecha, fuente: 'Prefectura Naval Argentina' }
  else {
    try {
      const ina = await estadoCompleto(BARRANQUERAS, isoDe(hoy - 4), isoDe(hoy))
      const u = ina.observado[ina.observado.length - 1]
      if (u) alturaHoy = { m: u.m, fecha: u.fecha, fuente: 'Instituto Nacional del Agua' }
    } catch { /* se informa abajo */ }
  }
  if (!alturaHoy) {
    return NextResponse.json({ error: 'No se pudo leer la altura de hoy en Barranqueras: ni Prefectura ni el INA contestaron' }, { status: 502 })
  }
  if (diaDe(alturaHoy.fecha) < hoy - 1) avisos.push(`La última altura de Barranqueras es del ${alturaHoy.fecha.slice(0, 10)}.`)

  // ── 2. ONS ────────────────────────────────────────────────────────────────
  const ons = onsCongelado as unknown as Ons
  let reciente: Awaited<ReturnType<typeof onsReciente>> | null = null
  try { reciente = await onsReciente(new Date()) }
  catch (e) { avisos.push(`No se pudo leer el ONS (${e instanceof Error ? e.message : 'error'}): se usa lo congelado hasta el ${ons.hasta}.`) }
  const serie = (k: RepresaOns, v: 'def' | 'inc') => {
    const fija = lector({ desde: ons.desde, valores: ons.series[k][v] as (number | null)[] })
    return (d: number) => reciente?.get(k)?.get(isoDe(d))?.[v] ?? fija(d)
  }
  const itaipu = serie('itaipu', 'def'), incItaipu = serie('itaipu', 'inc')
  const baixo = serie('baixoiguacu', 'def'), caxias = serie('caxias', 'def')
  const primavera = serie('primavera', 'def'), rosana = serie('rosana', 'def')
  const iguazu = (d: number) => { const b = baixo(d); return b !== null && b > 0 ? b : caxias(d) }
  const altoParana = (d: number) => { const a = primavera(d), b = rosana(d); return a === null || b === null ? null : a + b }
  let ultimoOns: string | null = null
  for (let d = hoy; d > hoy - 30; d--) if (itaipu(d) !== null && iguazu(d) !== null) { ultimoOns = isoDe(d); break }
  if (!ultimoOns) return NextResponse.json({ error: 'No hay datos del ONS del último mes' }, { status: 502 })
  if (diaDe(ultimoOns) < hoy - 2) avisos.push(`El último dato del ONS es del ${ultimoOns}; la cadena lo da por quieto desde ahí.`)

  // ── 3. Lluvia ─────────────────────────────────────────────────────────────
  const ll = lluviaCongelada as unknown as Lluvia
  const desdeFaltante = isoDe(diaDe(ll.hasta) + 1)
  const lluvia = {} as Record<CuencaBrasil, { P: number[]; E: number[] }>
  const escenariosPorCuenca = {} as Record<CuencaBrasil, number[][]>
  let fechasEnsamble: string[] = []
  try {
    for (const c of CUENCAS_BRASIL) {
      const cu = ll.cuencas[c]
      const P = cu.lluvia.map(v => (v ?? 0) / 10), E = cu.etp.map(v => (v ?? 0) / 10)
      if (desdeFaltante <= ayer) {
        const porPunto = await lluviaReciente(cu.puntos, desdeFaltante, ayer)
        for (let d = diaDe(desdeFaltante); d <= hoy - 1; d++) {
          const f = isoDe(d)
          const v = porPunto.map(m => m.get(f)).filter((x): x is [number, number] => !!x)
          if (!v.length) throw new Error(`no hay lluvia del ${f}`)
          P.push(v.reduce((a, x) => a + x[0], 0) / v.length)
          E.push(v.reduce((a, x) => a + x[1], 0) / v.length)
        }
      }
      lluvia[c] = { P, E }
      const ens = await ensamble(cu.puntos, isoDe(hoy))
      fechasEnsamble = ens.fechas
      const nCorr = ens.corridas[0].length
      escenariosPorCuenca[c] = Array.from({ length: nCorr }, (_, m) =>
        ens.fechas.map((_, k) => ens.corridas.reduce((a, punto) => a + punto[m][k], 0) / ens.corridas.length))
    }
  } catch (e) {
    return NextResponse.json({ error: `No se pudo leer la lluvia de Open-Meteo: ${e instanceof Error ? e.message : 'error'}` }, { status: 502 })
  }
  const nCorridas = escenariosPorCuenca.iguacu.length
  const escenarios = Array.from({ length: nCorridas }, (_, m) => ({
    nombre: `corrida ${m}`,
    lluvia: Object.fromEntries(CUENCAS_BRASIL.map(c => [c, escenariosPorCuenca[c][m]])) as Record<CuencaBrasil, number[]>,
  }))

  // ── 4. La cadena ──────────────────────────────────────────────────────────
  const paraguay = lector({ desde: confluencia.desde, valores: confluencia.m3s.paraguay as (number | null)[] })
  const p = parametros as unknown as ParametrosCrecida & { validacion: unknown; generado: string }
  const r = pronosticoDeCrecida({
    p, hoy, alturaHoy: alturaHoy.m, desdeLluvia: ll.desde, lluvia, escenarios,
    itaipu, iguazu, altoParana, incItaipu, paraguay,
  })

  const red = (x: number | null) => (x === null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100)
  const resumenLluvia = Object.fromEntries(CUENCAS_BRASIL.map(c => {
    const P = lluvia[c].P
    const ult7 = P.slice(-7).reduce((a, b) => a + b, 0)
    const totales = escenariosPorCuenca[c].map(s => s.reduce((a, b) => a + b, 0)).sort((a, b) => a - b)
    const q = (f: number) => Math.round(totales[Math.floor(f * (totales.length - 1))])
    const mediana = fechasEnsamble.map((_, k) => {
      const v = escenariosPorCuenca[c].map(s => s[k]).sort((a, b) => a - b)
      return Math.round(v[Math.floor(v.length / 2)] * 10) / 10
    })
    return [c, { nombre: ll.cuencas[c].nombre, ultimos7: Math.round(ult7), proximos15: { p10: q(0.1), p50: q(0.5), p90: q(0.9) }, medianaDiaria: mediana }]
  }))
  const umbral = fila && fila.alerta !== null && fila.evacuacion !== null
    ? { alerta: fila.alerta, evacuacion: fila.evacuacion }
    : { alerta: ESTACIONES.find(e => e.id === BARRANQUERAS)!.alerta, evacuacion: ESTACIONES.find(e => e.id === BARRANQUERAS)!.evacuacion }

  return NextResponse.json(
    {
      emitido: isoDe(hoy),
      alturaHoy,
      umbral,
      fechas: r.fechas,
      banda: r.banda.map(b => ({ p10: red(b.p10), p50: red(b.p50), p90: red(b.p90), min: red(b.min), max: red(b.max) })),
      sinLluvia: r.sinLluvia.map(red),
      determinadoHasta: r.determinadoHasta,
      itaipuIguazu: r.itaipuIguazu,
      ultimoOns,
      lluvia: { fechas: fechasEnsamble, cuencas: resumenLluvia, corridas: nCorridas },
      calibracion: p.generado,
      validacion: p.validacion,
      avisos,
      fuente: 'ONS (represas de Brasil), Open-Meteo (lluvia observada y ensamble del ECMWF), Prefectura Naval Argentina e INA (altura de hoy). Cálculo propio: no es un pronóstico oficial.',
    },
    { headers: { 'cache-control': `s-maxage=${CACHE_S}, stale-while-revalidate=${CACHE_S}` } },
  )
}
