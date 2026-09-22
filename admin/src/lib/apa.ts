/**
 * Cliente de la API pública del Mapa Hidrometeorológico de la APA.
 *
 * La Administración Provincial del Agua publica en `mapas.apachaco.gob.ar` los
 * milímetros que midió cada pluviómetro de su red. Hasta ahora esos números
 * llegaban por la prensa y había que leerlos de un texto en prosa; el mapa los
 * sirve en JSON, por fecha, sin clave ni registro.
 *
 * Tres endpoints, todos GET y sin autenticación:
 *
 *   /public/localidades                 → las 111 estaciones con coordenadas
 *   /public/precipitaciones/fechas      → las fechas que tienen parte cargado
 *   /public/precipitaciones?fecha=...   → un FeatureCollection con los mm
 *
 * Cosas que conviene saber antes de usarlo:
 *
 * - **Sólo vienen las estaciones que reportaron lluvia.** En un día grande
 *   responden unas 56 de 111; en uno chico, una sola. Una estación ausente
 *   puede ser "no llovió" o "no informó", y desde afuera no se distingue. Por
 *   eso la importación guarda únicamente lo que vino, y nunca completa ceros:
 *   un cero inventado ensucia la comparación contra el modelo más que un dato
 *   faltante.
 *
 * - **El período no es el día calendario.** `meta.periodo` viene `"17-07"`, que
 *   el propio mapa explica como "acumuladas desde las 17:00 hasta las 7:00".
 *   Se probó comparar contra esa ventana horaria del modelo en vez del día
 *   calendario y el resultado empeoró (correlación 0,23 contra 0,30; sesgo
 *   −48 % contra +28 %), así que la comparación se sigue haciendo por día
 *   calendario, que es la que mejor ajusta. Se guarda el período igual, porque
 *   el campo es del organismo y puede cambiar.
 *
 * - **`meta.periodo` es global, no por fecha.** La API devuelve el mismo valor
 *   para todas, así que no sirve para saber bajo qué ventana se tomó un parte
 *   viejo.
 *
 * - **No hay endpoint de rango.** Una llamada por fecha; `desde`/`hasta`
 *   responde 400.
 */

const BASE = 'https://mapas.apachaco.gob.ar'
const ESPERA_MS = 15_000

export interface LocalidadApa {
  id: number
  nombre: string
  lat: number
  lng: number
  depto: string
}

export interface LecturaApa {
  /** Id de la estación en la APA */
  id: number
  nombre: string
  lat: number
  lng: number
  fecha: string
  mm: number
  /** Cómo la APA atribuye el dato, p. ej. "Estudios Básicos - APA" */
  fuente: string
}

async function traer(ruta: string): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(BASE + ruta, {
      signal: AbortSignal.timeout(ESPERA_MS),
      headers: { accept: 'application/json' },
      cache: 'no-store',
    })
  } catch {
    // Un organismo provincial se cae, y cuando se cae el panel tiene que decir
    // qué pasó en vez de mostrar cero milímetros como si no hubiera llovido.
    throw new Error('No se pudo contactar al mapa de la APA. Puede estar fuera de servicio.')
  }
  if (!res.ok) throw new Error(`El mapa de la APA respondió ${res.status}`)
  return res.json()
}

/** Fechas con parte cargado, de la más reciente a la más vieja */
export async function fechasApa(): Promise<string[]> {
  const j = await traer('/public/precipitaciones/fechas')
  if (!Array.isArray(j)) return []
  return j.filter((f): f is string => typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f))
}

/** Las 111 localidades con las que la APA informa, con sus coordenadas */
export async function localidadesApa(): Promise<LocalidadApa[]> {
  const j = await traer('/public/localidades')
  if (!Array.isArray(j)) return []
  return j
    .filter(l => l && typeof l.nombre === 'string' && Number.isFinite(l.lat) && Number.isFinite(l.lon))
    .map(l => ({
      id: Number(l.id),
      nombre: String(l.nombre),
      lat: Number(l.lat),
      lng: Number(l.lon),
      depto: String(l.depto ?? ''),
    }))
}

/**
 * Lecturas de una fecha. Devuelve sólo las estaciones que informaron; si la
 * fecha no tiene parte, el arreglo viene vacío (la API responde 200 igual).
 */
export async function lecturasApa(fecha: string): Promise<{
  fecha: string
  periodo: string
  lecturas: LecturaApa[]
}> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error(`Fecha inválida: ${fecha}`)

  const j = await traer(`/public/precipitaciones?fecha=${fecha}`) as {
    features?: { geometry?: { coordinates?: number[] }; properties?: Record<string, unknown> }[]
    meta?: { periodo?: string }
  }

  const lecturas: LecturaApa[] = []
  for (const f of j?.features ?? []) {
    const c = f?.geometry?.coordinates
    const p = f?.properties
    if (!Array.isArray(c) || c.length < 2 || !p) continue

    const mm = Number(p.mm)
    // 600 mm en un día sería un récord nacional: por encima de eso es un error
    // de carga en el origen y no se guarda.
    if (!Number.isFinite(mm) || mm < 0 || mm > 600) continue

    lecturas.push({
      id: Number(p.id),
      nombre: String(p.nombre ?? '').trim(),
      lng: Number(c[0]),
      lat: Number(c[1]),
      fecha: typeof p.fecha === 'string' ? p.fecha : fecha,
      mm,
      fuente: String(p.fuente ?? 'APA'),
    })
  }

  return { fecha, periodo: String(j?.meta?.periodo ?? ''), lecturas }
}

/** Página del mapa para citar como origen de un dato guardado */
export const urlParteApa = (fecha: string) => `${BASE}/?fecha=${fecha}`
