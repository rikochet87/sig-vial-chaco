/**
 * Imágenes satelitales históricas: Esri World Imagery Wayback.
 *
 * Esri guarda cada versión publicada de su mosaico World Imagery desde 2014
 * (~200 versiones) y sirve cada una como una capa de tiles propia. Es lo más
 * parecido al deslizador histórico de Google Earth que se puede usar desde
 * afuera: el archivo histórico de Google no está en ninguna API.
 *
 * Una versión nueva sólo cambia donde Esri cargó imagen nueva, así que en un
 * lugar dado la mayoría de las versiones repiten la misma foto. Para que el
 * deslizador muestre sólo imágenes distintas hay dos pasos:
 *
 * 1. **La cadena de duenos.** `tilemap/{versión}/{z}/{y}/{x}` contesta, en
 *    `select`, de qué versión anterior viene realmente ese tile. Se arranca en
 *    la última y se salta al dueño, y a la anterior a él, hasta llegar a 2014.
 *    Son 12 a 22 pedidos en el Chaco en vez de 200.
 * 2. **La fecha de captura.** Que el tile haya cambiado no quiere decir que
 *    haya foto nueva: a veces Esri reprocesa la misma. El servicio de
 *    metadatos de cada versión dice la fecha real de toma y el proveedor, y se
 *    colapsan las versiones que muestran la misma toma. Medido en Castelli: 12
 *    duenos, 7 fotos distintas; en Resistencia, 22 duenos y 4 fotos.
 *
 * La fecha que se muestra es la **de captura**, no la de publicación: es la que
 * dice cuándo el terreno estaba así.
 *
 * Todo corre en el navegador: los tres servicios responden con
 * `Access-Control-Allow-Origin: *` y no piden clave.
 */

const CONFIG_URL = 'https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json'
const BASE = 'https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery'

/** Nivel de tile sobre el que se arma la cadena. A 16 un tile cubre ~550 m en el Chaco. */
export const Z_CADENA = 16

/**
 * Capas del servicio de metadatos que se consultan, en orden. La 6 es la de
 * 1,2 m y la tienen todas las tomas de alta resolución de la provincia; las
 * más gruesas quedan de respaldo. Las finas (0 a 5) sólo existen en algunas
 * ciudades y consultarlas en todo el resto sería un pedido vacío por versión.
 */
const CAPAS_META = [6, 8, 10]

/** Pedidos de metadatos en simultáneo. Con 20 juntos el servicio tardó 58 s. */
const CONCURRENCIA_META = 4

export interface Version {
  /** Número de versión: es el que va en la URL de los tiles. */
  n: number
  /** Fecha en que Esri publicó la versión, AAAA-MM-DD. */
  publicada: string
  metaUrl: string
}

export interface Imagen {
  n: number
  publicada: string
  /** Fecha de toma, AAAA-MM-DD. null mientras no llega o si la versión no la informa. */
  captura: string | null
  fuente: string | null
  /** Resolución de la toma, en metros. */
  resolucionM: number | null
}

export const urlTiles = (n: number) =>
  `${BASE}/WMTS/1.0.0/default028mm/MapServer/tile/${n}/{z}/{y}/{x}`

export const ATRIBUCION = 'Imágenes &copy; Esri World Imagery Wayback · Vantor, Maxar, Earthstar Geographics'

// ── Versiones ────────────────────────────────────────────────────────────────

let versionesCache: Promise<Version[]> | null = null

/** Todas las versiones, de la más nueva a la más vieja. Se baja una sola vez. */
export function cargarVersiones(): Promise<Version[]> {
  if (!versionesCache) {
    versionesCache = fetch(CONFIG_URL)
      .then(r => {
        if (!r.ok) throw new Error(`Wayback respondió ${r.status}`)
        return r.json()
      })
      .then(parsearVersiones)
    // Un fallo no queda cacheado: el próximo intento puede reintentar.
    versionesCache.catch(() => { versionesCache = null })
  }
  return versionesCache
}

export function parsearVersiones(cfg: Record<string, { itemTitle: string; metadataLayerUrl: string }>): Version[] {
  const out: Version[] = []
  for (const [n, v] of Object.entries(cfg)) {
    const f = v.itemTitle.match(/\d{4}-\d{2}-\d{2}/)
    if (f) out.push({ n: Number(n), publicada: f[0], metaUrl: v.metadataLayerUrl })
  }
  return out.sort((a, b) => b.publicada.localeCompare(a.publicada))
}

// ── Geometría ────────────────────────────────────────────────────────────────

/** Tile que contiene el punto, en el esquema de Web Mercator (el de Leaflet). */
export function tileDe(lat: number, lon: number, z: number): { z: number; y: number; x: number } {
  const n = 2 ** z
  const r = lat * Math.PI / 180
  return {
    z,
    x: Math.floor((lon + 180) / 360 * n),
    y: Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n),
  }
}

// ── Qué fotos distintas hay en un lugar ──────────────────────────────────────

const resultadosCache = new Map<string, Imagen[]>()

/**
 * Las fotos distintas en un punto, ordenadas de la más vieja a la más nueva
 * por fecha de captura.
 *
 * `onParcial` recibe la lista a medida que se completa: primero la cadena de
 * duenos con las fechas de publicación —que ya alcanza para mover el
 * deslizador— y después cada fecha de captura que llega. El colapso por
 * captura se hace recién al final, una sola vez, para que las marcas del
 * deslizador no se reacomoden bajo el dedo de quien lo está usando.
 */
export async function fechasEn(
  lat: number, lon: number,
  opts: { signal?: AbortSignal; onParcial?: (l: Imagen[]) => void } = {},
): Promise<Imagen[]> {
  const t = tileDe(lat, lon, Z_CADENA)
  const clave = `${t.z}/${t.y}/${t.x}`
  const cacheada = resultadosCache.get(clave)
  if (cacheada) return cacheada

  const versiones = await cargarVersiones()
  const duenos = await cadenaDeDuenos(versiones, t, opts.signal)
  const imgs: Imagen[] = duenos.map(v => ({
    n: v.n, publicada: v.publicada, captura: null, fuente: null, resolucionM: null,
  }))
  opts.onParcial?.(ordenar(imgs))

  let siguiente = 0
  const trabajador = async () => {
    while (siguiente < duenos.length) {
      const i = siguiente++
      const m = await metadatos(duenos[i].metaUrl, lat, lon, opts.signal).catch(e => {
        if (opts.signal?.aborted) throw e
        return null // una versión sin metadatos queda con su fecha de publicación
      })
      if (m) imgs[i] = { ...imgs[i], ...m }
      opts.onParcial?.(ordenar(imgs))
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCIA_META }, trabajador))

  const final = colapsarPorCaptura(imgs)
  resultadosCache.set(clave, final)
  return final
}

async function cadenaDeDuenos(
  versiones: Version[], t: { z: number; y: number; x: number }, signal?: AbortSignal,
): Promise<Version[]> {
  const indice = new Map(versiones.map((v, i) => [v.n, i]))
  const out: Version[] = []
  let i = 0
  while (i < versiones.length) {
    const r = await fetch(`${BASE}/MapServer/tilemap/${versiones[i].n}/${t.z}/${t.y}/${t.x}`, { signal })
    if (!r.ok) throw new Error(`Wayback tilemap respondió ${r.status}`)
    const j = await r.json() as { data?: number[]; select?: number[] }
    if (!j.data?.[0]) break // de acá para atrás no hay imagen en este tile
    const k = indice.get(j.select?.[0] ?? versiones[i].n)
    if (k === undefined) break
    out.push(versiones[k])
    i = k + 1
  }
  return out
}

async function metadatos(
  metaUrl: string, lat: number, lon: number, signal?: AbortSignal,
): Promise<Pick<Imagen, 'captura' | 'fuente' | 'resolucionM'> | null> {
  for (const capa of CAPAS_META) {
    const q = new URLSearchParams({
      f: 'json', geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects', outFields: 'SRC_DATE,NICE_DESC,SRC_RES',
      returnGeometry: 'false',
    })
    const r = await fetch(`${metaUrl}/${capa}/query?${q}`, { signal })
    if (!r.ok) continue
    const j = await r.json() as { features?: { attributes: Record<string, string | number | null> }[] }
    const a = j.features?.[0]?.attributes
    const captura = fechaSrc(a?.SRC_DATE)
    if (a && captura) {
      const res = Number(a.SRC_RES)
      return { captura, fuente: typeof a.NICE_DESC === 'string' ? a.NICE_DESC : null, resolucionM: Number.isFinite(res) ? res : null }
    }
  }
  return null
}

/**
 * 20250922 → '2025-09-22'. **El servicio manda la fecha como número**, no como
 * texto —el campo es esriFieldTypeInteger—; se acepta de las dos formas. Donde
 * no hay fecha viene null o 'Null'.
 */
export function fechaSrc(s: string | number | null | undefined): string | null {
  const m = String(s ?? '').match(/^(\d{4})(\d{2})(\d{2})$/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

const fechaDe = (i: Imagen) => i.captura ?? i.publicada

function ordenar(l: Imagen[]): Imagen[] {
  return [...l].sort((a, b) => fechaDe(a).localeCompare(fechaDe(b)) || a.publicada.localeCompare(b.publicada))
}

/**
 * Una entrada por toma. De las versiones que muestran la misma foto queda la
 * de publicación más nueva: es la misma toma, a veces con mejor procesamiento.
 * Las que no informan captura no se colapsan: no hay con qué compararlas.
 */
export function colapsarPorCaptura(l: Imagen[]): Imagen[] {
  const porToma = new Map<string, Imagen>()
  const sinFecha: Imagen[] = []
  for (const i of l) {
    if (!i.captura) { sinFecha.push(i); continue }
    const previa = porToma.get(i.captura)
    if (!previa || i.publicada > previa.publicada) porToma.set(i.captura, i)
  }
  return ordenar([...porToma.values(), ...sinFecha])
}

/**
 * Qué entrada de la lista corresponde a una versión que ya no está en ella
 * —pasa al mover el mapa, porque cada lugar tiene su propia lista—.
 *
 * Por cómo funciona la cadena, lo que la versión `n` muestra en este lugar es
 * lo de su dueño: la entrada más nueva publicada hasta la fecha de `n`. Si no
 * hay ninguna tan vieja, la más vieja de la lista.
 */
export function entradaVigente(lista: Imagen[], publicadaN: string): Imagen | null {
  if (!lista.length) return null
  let mejor: Imagen | null = null
  for (const i of lista) {
    if (i.publicada <= publicadaN && (!mejor || i.publicada > mejor.publicada)) mejor = i
  }
  return mejor ?? lista.reduce((a, b) => (a.publicada < b.publicada ? a : b))
}
