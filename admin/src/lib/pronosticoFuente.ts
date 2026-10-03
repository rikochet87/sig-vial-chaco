/**
 * La consulta del pronóstico por conjuntos a Open-Meteo. Sólo servidor.
 *
 * La comparten la ruta que lo muestra (`/api/lluvia/pronostico`) y el cron que
 * lo guarda (`/api/lluvia/ingesta`, rama de las 12:00): tienen que ver el mismo
 * pronóstico, o lo que se verifica no sería lo que se mostró.
 *
 * ECMWF IFS 0,25°, 51 corridas, 15 días, en los nodos de la grilla de 0,25° que
 * caen dentro del contorno provincial. El día de hoy se descarta (ver
 * lib/pronostico.ts). Los mm van en décimas enteras.
 *
 * **No pasa por `consultarPuntos()`** de `lib/lluvia.ts`, que habla con la API
 * de archivo y trae la deduplicación de la red y la espera ante el 429 de las
 * ingestas largas. Ésta es otra API y son tres pedidos.
 */
import { CONTORNO_CHACO } from '@/data/contornoChaco'
import { grillaEn, type Pronostico, type PuntoPronostico } from './pronostico'

const URL_ENSEMBLE = 'https://ensemble-api.open-meteo.com/v1/ensemble'
const MODELO = 'ecmwf_ifs025'
export const NOMBRE_MODELO = 'ECMWF IFS 0,25° — 51 corridas'
/** Cuánto se cachea la respuesta de Open-Meteo: ECMWF corre cada 6 horas */
export const CACHE_PRONOSTICO_S = 3 * 3600
/** Puntos por pedido: entran holgados en un URL, pero se parte por las dudas */
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
  const r = await fetch(`${URL_ENSEMBLE}?${q}`, { next: { revalidate: CACHE_PRONOSTICO_S } })
  if (!r.ok) throw new Error(`Open-Meteo respondió ${r.status}`)
  const j = await r.json()
  const lista = (Array.isArray(j) ? j : [j]) as { daily?: Diario }[]
  if (lista.length !== puntos.length || lista.some(x => !x.daily)) throw new Error('Respuesta incompleta de Open-Meteo')
  return lista.map(x => x.daily!)
}

const decimas = (v: number | null | undefined) => Math.round((v ?? 0) * 10)

export async function consultarPronostico(): Promise<Pronostico> {
  const grilla = grillaEn(CONTORNO_CHACO)
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
  return { modelo: NOMBRE_MODELO, consultado: new Date().toISOString(), dias, puntos }
}
