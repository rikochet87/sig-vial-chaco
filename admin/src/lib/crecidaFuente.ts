/**
 * Lo que la ruta de crecida trae de afuera, del lado del servidor:
 *
 * - **ONS**: el CSV de datos hidrológicos del año en curso (~9 MB), filtrado a
 *   las represas que usa la cadena. Lo de años anteriores está congelado en
 *   `public/rio/ons_represas.json`.
 * - **Lluvia reciente**: lo que pasó desde que termina `lluvia_brasil.json`
 *   hasta ayer, con la API de pronóstico de Open-Meteo (`past_days`), que es el
 *   mismo análisis del IFS que trae `best_match` en la serie larga.
 * - **Ensamble**: las 51 corridas del ECMWF para los próximos 15 días.
 *
 * Cada una en una sola consulta: Open-Meteo acepta varias ubicaciones juntas,
 * y el cupo se cuenta por ubicación, no por pedido. La ruta cachea tres horas
 * (el ECMWF corre cada seis), así que son ~40 ubicaciones × 3 consultas cada
 * tres horas como mucho.
 *
 * El formato del CSV del ONS cambió en 2022 (ver `build_crecida.mjs`): se lee
 * por encabezado, nunca por posición.
 */

const ONS = 'https://ons-aws-prod-opendata.s3.amazonaws.com/dataset/dados_hidrologicos_di'
const PRONOSTICO = 'https://api.open-meteo.com/v1/forecast'
const ENSAMBLE = 'https://ensemble-api.open-meteo.com/v1/ensemble'
const ESPERA_MS = 25_000

/** Lo mismo que guarda `build_crecida.mjs`, por código del ONS */
export const REPRESAS_ONS = {
  itaipu: 'PNITAI', baixoiguacu: 'IGUHBI', caxias: 'IGSCAX', primavera: 'PNPPRI', rosana: 'PPROSA',
} as const
export type RepresaOns = keyof typeof REPRESAS_ONS
export interface FilaOns { def: number | null; inc: number | null }

async function traer(url: string, ms = ESPERA_MS): Promise<Response> {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms), cache: 'no-store' })
  if (!r.ok) throw new Error(`${new URL(url).host} respondió ${r.status}`)
  return r
}

/** Represa → fecha → defluente e incremental, del CSV de un año */
export function leerCsvOns(texto: string): Map<RepresaOns, Map<string, FilaOns>> {
  const porId = new Map<string, RepresaOns>((Object.keys(REPRESAS_ONS) as RepresaOns[]).map(k => [REPRESAS_ONS[k], k]))
  const lineas = texto.split('\n')
  const enc = lineas[0].trim().split(';')
  const col = (n: string) => enc.indexOf(n)
  const iId = col('id_reservatorio') >= 0 ? col('id_reservatorio') : enc.length - 1
  const iFecha = col('din_instante'), iDef = col('val_vazaodefluente'), iInc = col('val_vazaoincremental')
  if (iFecha < 0 || iDef < 0 || iInc < 0) throw new Error('el CSV del ONS no trae las columnas esperadas')
  const num = (x: string | undefined) => { const v = parseFloat(x ?? ''); return Number.isFinite(v) ? v : null }
  const out = new Map<RepresaOns, Map<string, FilaOns>>()
  for (let j = 1; j < lineas.length; j++) {
    const c = lineas[j].trim().split(';')
    const k = porId.get((c[iId] ?? '').trim())
    if (!k) continue
    if (!out.has(k)) out.set(k, new Map())
    out.get(k)!.set(c[iFecha].slice(0, 10), { def: num(c[iDef]), inc: num(c[iInc]) })
  }
  return out
}

/** El año en curso, y el anterior en enero, cuando el año recién empieza */
export async function onsReciente(hoy: Date): Promise<Map<RepresaOns, Map<string, FilaOns>>> {
  const anio = hoy.getUTCFullYear()
  const anios = hoy.getUTCMonth() === 0 ? [anio - 1, anio] : [anio]
  const total = new Map<RepresaOns, Map<string, FilaOns>>()
  for (const a of anios) {
    const m = leerCsvOns(await (await traer(`${ONS}/DADOS_HIDROLOGICOS_RES_${a}.csv`, 40_000)).text())
    for (const [k, filas] of m) {
      if (!total.has(k)) total.set(k, new Map())
      for (const [f, v] of filas) total.get(k)!.set(f, v)
    }
  }
  return total
}

type Punto = [number, number]
const coords = (pts: Punto[]) =>
  `latitude=${pts.map(p => p[0]).join(',')}&longitude=${pts.map(p => p[1]).join(',')}`

/**
 * Lluvia y ETP diarias de cada punto entre `desde` y `hasta`, de la API de
 * pronóstico con `past_days`. Devuelve, por punto, fecha → [lluvia, etp].
 */
export async function lluviaReciente(pts: Punto[], desde: string, hasta: string): Promise<Map<string, [number, number]>[]> {
  const dias = Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000) + 2
  if (dias > 92) throw new Error(`faltan ${dias} días de lluvia y la API alcanza 92: hay que regenerar lluvia_brasil.json`)
  const url = `${PRONOSTICO}?${coords(pts)}&daily=precipitation_sum,et0_fao_evapotranspiration`
    + `&past_days=${dias}&forecast_days=1&timezone=GMT`
  const j = await (await traer(url)).json()
  const lista = Array.isArray(j) ? j : [j]
  return lista.map((x: { daily: { time: string[]; precipitation_sum: (number | null)[]; et0_fao_evapotranspiration: (number | null)[] } }) => {
    const m = new Map<string, [number, number]>()
    x.daily.time.forEach((f, i) => {
      const p = x.daily.precipitation_sum[i], e = x.daily.et0_fao_evapotranspiration[i]
      if (f >= desde && f <= hasta && p !== null && e !== null) m.set(f, [p, e])
    })
    return m
  })
}

/**
 * Las corridas del ensamble del ECMWF, desde `desde` y por 15 días: por
 * punto, una lista de corridas, cada una con un valor por día.
 */
export async function ensamble(pts: Punto[], desde: string): Promise<{ fechas: string[]; corridas: number[][][] }> {
  const url = `${ENSAMBLE}?${coords(pts)}&daily=precipitation_sum&models=ecmwf_ifs025&forecast_days=15&timezone=GMT`
  const j = await (await traer(url)).json()
  const lista: { daily: Record<string, (number | null)[] | string[]> }[] = Array.isArray(j) ? j : [j]
  const tiempo = lista[0].daily.time as string[]
  const i0 = tiempo.indexOf(desde)
  if (i0 < 0) throw new Error(`el ensamble no trae el día ${desde}`)
  const fechas = tiempo.slice(i0)
  const claves = Object.keys(lista[0].daily).filter(k => k.startsWith('precipitation_sum')).sort()
  const corridas = lista.map(x => claves.map(k => (x.daily[k] as (number | null)[]).slice(i0).map(v => v ?? 0)))
  return { fechas, corridas }
}
