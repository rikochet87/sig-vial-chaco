/**
 * Las consultas del tiempo: Open-Meteo para el pronóstico y el SMN para las
 * alertas. Sólo servidor. La lectura de cada respuesta está en lib/tiempo.ts.
 *
 * - **El pronóstico va en la sede de cada consorcio**, las 103 de
 *   `sedesConsorcios.ts`, en un solo pedido. El modelo tiene celdas de ~10 a 25
 *   km: dos consorcios vecinos van a dar parecido, y es lo que el modelo sabe.
 * - **Las alertas salen del índice CAP del SMN** (`ssl.smn.gob.ar/CAP/AR.php`),
 *   que lista un XML por aviso. Se piden todos y se quedan los que tocan el
 *   Chaco. El índice no está documentado como API: si cambia de forma, la ruta
 *   lo dice en vez de mostrar "sin alertas", que sería la peor respuesta falsa.
 */
import { SEDES_CONSORCIOS } from '@/data/sedesConsorcios'
import { CONTORNO_CHACO } from '@/data/contornoChaco'
import {
  alcanceEnChaco, diasDe, ordenarAlertas, parsearCap, vigente, VARIABLES_DIARIAS,
  type Alerta, type PronosticoTiempo,
} from './tiempo'

export const CACHE_TIEMPO_S = 3600
/** Los avisos a muy corto plazo duran dos horas: diez minutos de caché es lo más que se puede */
export const CACHE_ALERTAS_S = 600
const DIAS = 7

export async function consultarTiempo(): Promise<PronosticoTiempo> {
  const s = SEDES_CONSORCIOS
  const q = new URLSearchParams({
    latitude: s.map(x => x.lat.toFixed(3)).join(','),
    longitude: s.map(x => x.lng.toFixed(3)).join(','),
    daily: VARIABLES_DIARIAS.join(','),
    timezone: 'America/Argentina/Cordoba',
    forecast_days: String(DIAS),
  })
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`, { next: { revalidate: CACHE_TIEMPO_S } })
  if (!r.ok) throw new Error(`Open-Meteo respondió ${r.status}`)
  const j = await r.json()
  const lista = (Array.isArray(j) ? j : [j]) as { daily?: Parameters<typeof diasDe>[0] }[]
  if (lista.length !== s.length || lista.some(x => !x.daily)) throw new Error('Respuesta incompleta de Open-Meteo')
  return {
    consultado: new Date().toISOString(),
    modelo: 'Open-Meteo, mejor modelo disponible para la zona',
    consorcios: s.map((c, i) => ({ numero: c.numero, nombre: c.nombre, zona: c.zona, lat: c.lat, lng: c.lng, dias: diasDe(lista[i].daily!) })),
  }
}

const INDICE_CAP = 'https://ssl.smn.gob.ar/CAP/AR.php'
const CONCURRENCIA = 8

export async function consultarAlertas(ahora = Date.now()): Promise<{ alertas: Alerta[]; revisados: number; fallaron: number }> {
  const r = await fetch(INDICE_CAP, { next: { revalidate: CACHE_ALERTAS_S }, headers: { 'user-agent': 'Mozilla/5.0' } })
  if (!r.ok) throw new Error(`El SMN respondió ${r.status}`)
  const html = await r.text()
  const urls = [...new Set([...html.matchAll(/href="(https:\/\/ssl\.smn\.gob\.ar\/feeds\/CAP\/[^"]+\.xml)"/g)].map(m => m[1]))]
  // Un índice que responde pero sin ningún enlace no es "no hay alertas": es que cambió
  if (!urls.length && !/RSS CAP/i.test(html)) throw new Error('El índice de alertas del SMN cambió de forma')

  const alertas = new Map<string, Alerta>()
  let siguiente = 0, fallaron = 0
  const trabajador = async () => {
    while (siguiente < urls.length) {
      const url = urls[siguiente++]
      try {
        const x = await fetch(url, { next: { revalidate: CACHE_ALERTAS_S }, headers: { 'user-agent': 'Mozilla/5.0' } })
        if (!x.ok) { fallaron++; continue }
        const a = parsearCap(await x.text(), url)
        if (!a || !vigente(a, ahora)) continue
        const enChaco = alcanceEnChaco(a, SEDES_CONSORCIOS, CONTORNO_CHACO)
        if (!enChaco) continue
        // El SMN parte un aviso en varios XML por región: se juntan por título y vigencia
        const clave = `${enChaco.titulo}|${enChaco.inicio}|${enChaco.fin}`
        const previa = alertas.get(clave)
        alertas.set(clave, previa
          ? { ...previa, consorcios: [...new Set([...previa.consorcios, ...enChaco.consorcios])].sort((p, q) => p - q),
              poligonos: [...previa.poligonos, ...enChaco.poligonos] }
          : enChaco)
      } catch {
        // Un aviso que no se pudo leer no tira los demás, pero se cuenta: la
        // pantalla dice cuántos faltan en vez de mostrarse completa
        fallaron++
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCIA }, trabajador))
  return { alertas: ordenarAlertas([...alertas.values()]), revisados: urls.length, fallaron }
}
