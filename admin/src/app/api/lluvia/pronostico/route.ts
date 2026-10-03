/**
 * Pronóstico de lluvia por conjuntos sobre la provincia.
 *
 *   GET /api/lluvia/pronostico → Pronostico (ver lib/pronostico.ts)
 *
 * ECMWF IFS 0,25°, 51 corridas, 15 días, de `ensemble-api.open-meteo.com`, en
 * los nodos de la grilla de 0,25° que caen dentro del contorno provincial.
 *
 * - **Pasa por el servidor y se cachea 3 horas**, por lo mismo que el río:
 *   Open-Meteo cobra el cupo por ubicación consultada, y si cada navegador
 *   pidiera sus ~140 puntos el cupo se iría en una mañana. ECMWF publica una
 *   corrida cada 6 horas; con 3 horas de caché nunca se queda más de una atrás.
 * - **No pasa por `consultarPuntos()`** de `lib/lluvia.ts`, que es el único que
 *   habla con la API de archivo: esta es otra API (la de conjuntos), sin la
 *   deduplicación de puntos de la red ni la espera ante el 429 de las ingestas
 *   largas. Es un pedido por consulta, cacheado.
 * - **Se descarta el día de hoy** (ver lib/pronostico.ts).
 * - **Los mm van en décimas enteras**: son ~100 mil números y así la respuesta
 *   pesa la mitad.
 */

import { NextResponse } from 'next/server'
import { requirePermiso } from '@/lib/apiAuth'
import { CONTORNO_CHACO } from '@/data/contornoChaco'
import { grillaEn, type Pronostico, type PuntoPronostico } from '@/lib/pronostico'

export const dynamic = 'force-dynamic'

const URL_ENSEMBLE = 'https://ensemble-api.open-meteo.com/v1/ensemble'
const MODELO = 'ecmwf_ifs025'
const CACHE_S = 3 * 3600
/** Puntos por pedido: un URL con 140 pares de coordenadas entra holgado, pero se parte por las dudas */
const POR_PEDIDO = 50

type Diario = Record<string, (number | null)[]> & { time: string[] }

async function pedir(puntos: { lat: number; lng: number }[]): Promise<Diario[]> {
  const q = new URLSearchParams({
    latitude: puntos.map(p => p.lat).join(','),
    longitude: puntos.map(p => p.lng).join(','),
    daily: 'precipitation_sum,et0_fao_evapotranspiration',
    models: MODELO,
    timezone: 'America/Argentina/Cordoba',
    forecast_days: '15',
  })
  const r = await fetch(`${URL_ENSEMBLE}?${q}`, { next: { revalidate: CACHE_S } })
  if (!r.ok) throw new Error(`Open-Meteo respondió ${r.status}`)
  const j = await r.json()
  const lista = (Array.isArray(j) ? j : [j]) as { daily?: Diario }[]
  if (lista.length !== puntos.length || lista.some(x => !x.daily)) throw new Error('Respuesta incompleta de Open-Meteo')
  return lista.map(x => x.daily!)
}

const decimas = (v: number | null | undefined) => Math.round((v ?? 0) * 10)

export async function GET() {
  const auth = await requirePermiso('lluvia')
  if (auth instanceof NextResponse) return auth

  const grilla = grillaEn(CONTORNO_CHACO)
  try {
    const tandas: { lat: number; lng: number }[][] = []
    for (let i = 0; i < grilla.length; i += POR_PEDIDO) tandas.push(grilla.slice(i, i + POR_PEDIDO))
    const diarios = (await Promise.all(tandas.map(pedir))).flat()

    // Desde mañana: el índice 0 es hoy
    const dias = diarios[0].time.slice(1)
    const puntos: PuntoPronostico[] = diarios.map((d, i) => {
      // La corrida de control (`precipitation_sum`) más los 50 miembros
      const claves = Object.keys(d).filter(k => k === 'precipitation_sum' || k.startsWith('precipitation_sum_member'))
      const clavesEt0 = Object.keys(d).filter(k => k.startsWith('et0_fao_evapotranspiration'))
      return {
        lat: grilla[i].lat, lng: grilla[i].lng,
        mm: dias.map((_, k) => claves.map(c => decimas(d[c][k + 1]))),
        et0: dias.map((_, k) => decimas(clavesEt0.reduce((s, c) => s + (d[c][k + 1] ?? 0), 0) / (clavesEt0.length || 1))),
      }
    })

    const cuerpo: Pronostico = { modelo: 'ECMWF IFS 0,25° — 51 corridas', consultado: new Date().toISOString(), dias, puntos }
    return NextResponse.json(cuerpo, {
      headers: { 'cache-control': `s-maxage=${CACHE_S}, stale-while-revalidate=${CACHE_S}` },
    })
  } catch (e) {
    console.error('[pronostico]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'No se pudo consultar el pronóstico' }, { status: 502 })
  }
}
