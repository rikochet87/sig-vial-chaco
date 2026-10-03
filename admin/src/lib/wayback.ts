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
 *    `select`, de qué versión anterior viene realmente ese tile. Del dueño se
 *    salta a la anterior a él, y así hasta 2014: en el Chaco son 12 a 22
 *    dueños entre ~200 versiones. Se recorre por tandas en paralelo —ver
 *    {@link cadenaPorTandas}— porque de a un pedido por vez eran 6 segundos.
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
 * 1,2 m —la del zoom 17, el máximo que se muestra— y la tienen todas las tomas
 * de alta resolución de la provincia; las más gruesas quedan de respaldo para
 * las de baja, que sólo figuran ahí (la de 2,5 m de Castelli aparece recién en
 * la 10). Las finas (0 a 5) sólo existen en algunas ciudades.
 *
 * **No cambiarla por la 7 para ganar velocidad: se probó y no es eso.** La 7
 * pareció contestar en 0,3 s contra los 0,4 a 14 s de la 6, pero era el orden
 * de la prueba — ver {@link CONCURRENCIA_META}. Y no dicen lo mismo: en Sáenz
 * Peña, para la misma versión, la 7 da una toma de 2007 y la 6 una de 2009.
 */
const CAPAS_META = [6, 8, 10]

/**
 * Pedidos de metadatos en simultáneo.
 *
 * **Las fechas de toma son lentas y no se arregla desde acá.** La primera
 * consulta en una zona tarda entre 0,3 y 30 s por pedido, sin patrón por
 * versión ni por capa; repetida, o hecha a 10 km, tarda 0,3 s. Es del lado de
 * Esri. El total de un lugar frío se midió entre 9 y 98 s, y no baja de forma
 * confiable con más pedidos en vuelo: con 4, con 8 y con 24 dio tiempos que se
 * pisan entre sí. Queda en 8, que alcanza para pedir un lugar típico casi de
 * una y no le tira 24 consultas juntas a un servicio público por cada
 * movimiento del mapa.
 *
 * Por eso nada de la pantalla espera a estas fechas: la lista sale de la
 * cadena, que tarda 1 a 3 s, y cada fecha se muestra cuando llega.
 */
const CONCURRENCIA_META = 8

/**
 * Cada cuántas versiones se toma una muestra en la primera tanda de la cadena.
 * Con 8 son ~25 pedidos en paralelo y en Castelli encuentran 11 de los 12
 * dueños de una; la segunda tanda trae el que falta.
 */
const PASO_MUESTRA = 8

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

/**
 * Clave del tile de la cadena que contiene el punto. Dos centros con la misma
 * clave tienen la misma lista de fotos: es la unidad de búsqueda.
 */
export function claveTile(lat: number, lon: number): string {
  const t = tileDe(lat, lon, Z_CADENA)
  return `${t.z}/${t.y}/${t.x}`
}

// ── Qué fotos distintas hay en un lugar ──────────────────────────────────────

const resultadosCache = new Map<string, Imagen[]>()

/**
 * Metadatos ya consultados, por tile y versión. Las fechas de toma son lo
 * lento —segundos por pedido en una zona fría— y una búsqueda cortada al mover
 * el mapa no tiene que perder las que ya trajo: al volver al mismo tile se
 * retoman. `null` es "la versión no la informa", que también es una respuesta.
 */
const metaCache = new Map<string, Pick<Imagen, 'captura' | 'fuente' | 'resolucionM'> | null>()

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
  const clave = claveTile(lat, lon)
  const cacheada = resultadosCache.get(clave)
  if (cacheada) return cacheada

  const versiones = await cargarVersiones()
  const duenos = await cadenaDeDuenos(versiones, t, opts.signal)
  const imgs: Imagen[] = duenos.map(v => ({
    n: v.n, publicada: v.publicada, captura: null, fuente: null, resolucionM: null,
    ...metaCache.get(`${clave}#${v.n}`),
  }))
  // Mientras llegan las fechas de toma el orden es el de publicación, que no
  // cambia: si cada fecha que llega reordenara la lista, el cursor del
  // deslizador se correría solo, sin que nadie lo toque. Se ordena por toma
  // una sola vez, al final, junto con el colapso.
  opts.onParcial?.(ordenarPorPublicacion(imgs))

  const pendientes = duenos.map((_, i) => i).filter(i => !metaCache.has(`${clave}#${duenos[i].n}`))
  let siguiente = 0
  const trabajador = async () => {
    while (siguiente < pendientes.length) {
      const i = pendientes[siguiente++]
      const m = await metadatos(duenos[i].metaUrl, lat, lon, opts.signal).catch(e => {
        if (opts.signal?.aborted) throw e
        return undefined // falló el pedido: no se cachea, el próximo intento pregunta de nuevo
      })
      if (m !== undefined) metaCache.set(`${clave}#${duenos[i].n}`, m)
      if (m) imgs[i] = { ...imgs[i], ...m }
      opts.onParcial?.(ordenarPorPublicacion(imgs))
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
  const pedir = async (i: number) => {
    const r = await fetch(`${BASE}/MapServer/tilemap/${versiones[i].n}/${t.z}/${t.y}/${t.x}`, { signal })
    if (!r.ok) throw new Error(`Wayback tilemap respondió ${r.status}`)
    const j = await r.json() as { data?: number[]; select?: number[] }
    if (!j.data?.[0]) return null // esta versión no tiene imagen en este tile
    return indice.get(j.select?.[0] ?? versiones[i].n) ?? null
  }
  // Por tandas son ~35 pedidos en vez de 12, y uno solo que falle tira la
  // búsqueda entera: se reintenta una vez antes de darla por perdida.
  const duenoDe = (i: number) => pedir(i).catch(e => {
    if (signal?.aborted) throw e
    return pedir(i)
  })
  return (await cadenaPorTandas(versiones.length, duenoDe)).map(i => versiones[i])
}

/**
 * Los índices de todos los dueños, de menor a mayor, pidiendo en paralelo.
 *
 * La cadena en serie —preguntar por una versión, saltar a la anterior a su
 * dueño, preguntar de nuevo— es mínima en pedidos pero cada uno espera al
 * anterior: 12 pedidos de medio segundo son 6 segundos antes de mostrar nada.
 *
 * Acá la primera tanda pregunta por una versión de cada `paso`, todas juntas.
 * Cualquier versión contesta con su dueño, así que esa muestra ya descubre casi
 * todos. Lo que garantiza que no falte ninguno es la regla de las tandas
 * siguientes: **por cada dueño nuevo se pregunta por la versión anterior a
 * él**, que es exactamente el paso de la cadena en serie. Se termina cuando
 * ningún dueño tiene su anterior sin preguntar. Mismo resultado, en dos o tres
 * esperas en vez de doce.
 *
 * @param duenoDe  índice del dueño de la versión `i`, o null si no tiene imagen
 */
export async function cadenaPorTandas(
  total: number,
  duenoDe: (i: number) => Promise<number | null>,
  paso = PASO_MUESTRA,
): Promise<number[]> {
  const preguntadas = new Set<number>()
  const duenos = new Set<number>()
  let tanda: number[] = []
  for (let i = 0; i < total; i += paso) tanda.push(i)

  while (tanda.length) {
    for (const i of tanda) preguntadas.add(i)
    const respuestas = await Promise.all(tanda.map(duenoDe))
    const siguiente = new Set<number>()
    for (const k of respuestas) {
      if (k === null || duenos.has(k)) continue
      duenos.add(k)
      if (k + 1 < total && !preguntadas.has(k + 1)) siguiente.add(k + 1)
    }
    tanda = [...siguiente]
  }
  return [...duenos].sort((a, b) => a - b)
}

async function metadatos(
  metaUrl: string, lat: number, lon: number, signal?: AbortSignal,
): Promise<Pick<Imagen, 'captura' | 'fuente' | 'resolucionM'> | null> {
  let fallo = false
  for (const capa of CAPAS_META) {
    const q = new URLSearchParams({
      f: 'json', geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects', outFields: 'SRC_DATE,NICE_DESC,SRC_RES',
      returnGeometry: 'false',
    })
    const r = await fetch(`${metaUrl}/${capa}/query?${q}`, { signal })
    if (!r.ok) { fallo = true; continue }
    const j = await r.json() as { features?: { attributes: Record<string, string | number | null> }[] }
    const a = j.features?.[0]?.attributes
    const captura = fechaSrc(a?.SRC_DATE)
    if (a && captura) {
      const res = Number(a.SRC_RES)
      return { captura, fuente: typeof a.NICE_DESC === 'string' ? a.NICE_DESC : null, resolucionM: Number.isFinite(res) ? res : null }
    }
  }
  // Una capa que no contestó no es "no informa": no se puede cachear como tal.
  if (fallo) throw new Error('Wayback metadatos no respondió')
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

function ordenarPorPublicacion(l: Imagen[]): Imagen[] {
  return [...l].sort((a, b) => a.publicada.localeCompare(b.publicada))
}

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
