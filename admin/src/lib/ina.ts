/**
 * El río Paraná, desde el Alerta Hidrológico del Instituto Nacional del Agua.
 *
 * ── Por qué el río es otra amenaza, no la misma ───────────────────────────────
 *
 * La lluvia local y la crecida del Paraná **son casi independientes en causa**.
 * La crecida se genera en las cuencas altas —Paranaíba, Grande, Iguazú, y el
 * Paraguay por el Pantanal—, a miles de kilómetros y con días o semanas de
 * retardo. Lo que llueve en Chaco no mueve la altura en Barranqueras.
 *
 * Por eso **no se predice una de la otra y este módulo no mezcla nada** con
 * `lib/fusion.ts`. Se traen las dos series y se las muestra sobre el mismo eje
 * de tiempo; la coincidencia la lee el que mira.
 *
 * Que sean independientes es justamente lo que las vuelve peligrosas juntas: con
 * el río en cota alta, el agua de una tormenta local **no tiene dónde ir**,
 * porque el río le pone condición de borde al drenaje. No se suman, se
 * condicionan. Modelar eso requiere cotas y un modelo hidráulico, que hoy no
 * tenemos; hasta entonces el sistema muestra las dos series y no afirma nada
 * sobre su combinación.
 *
 * ── Una inversión de la intuición ─────────────────────────────────────────────
 *
 * **El río se pronostica mejor que la lluvia.** El INA emite a ~11 días porque
 * el agua ya está en tránsito y se la ve venir; la tormenta de mañana a la
 * tarde, no. Para anticipar, esta serie es el dato más fuerte disponible.
 *
 * ── Los umbrales los pone el organismo ────────────────────────────────────────
 *
 * `nivel_alerta` y `nivel_evacuacion` vienen en la ficha de cada estación. **No
 * se inventa ningún umbral acá**: es el mismo criterio que rige la pantalla de
 * lluvia — el número y la autoridad que lo respalda salen juntos de la fuente.
 *
 * ── El pronóstico es una banda, no una línea ──────────────────────────────────
 *
 * Cada punto pronosticado trae `qualifier`: `inferior`, `medio` o `superior`.
 * El INA publica su incertidumbre y **hay que dibujarla como banda**. Mostrar
 * sólo el valor medio sería presentar como certeza algo que la fuente entrega
 * como rango.
 *
 * ── La API ────────────────────────────────────────────────────────────────────
 *
 * `alerta.ina.gob.ar/a5` — lectura abierta, sin token (la `apiUI` de gestión sí
 * pide sesión, pero no hace falta para leer). Verificado el 26/09/2026.
 */

/** Raíz de la API del Alerta Hidrológico */
const BASE = 'https://alerta.ina.gob.ar/a5'

/** Un organismo público se cae; cuando se cae hay que decirlo, no mostrar cero */
const ESPERA_MS = 20_000

/**
 * Estaciones del tramo que nos interesa, relevadas contra la API.
 *
 * Van fijas y no se descubren en caliente: el catálogo tiene **4.683**
 * estaciones y recorrerlo en cada consulta para quedarse con seis no tiene
 * sentido. `scripts/relevar-ina.ts` regenera esta lista.
 *
 * El orden es de aguas arriba hacia aguas abajo, que es el orden en que pasa la
 * onda de crecida: lo que hoy se ve en Itá Ibaté llega después acá. Esa
 * progresión es, en sí misma, anticipación.
 */
export const ESTACIONES = [
  { id: 16, nombre: 'Itá Ibaté',    rio: 'Paraná',      alerta: 7,    evacuacion: 7.5, ceroIgn: 52.42 },
  { id: 19, nombre: 'Corrientes',   rio: 'Paraná',      alerta: 6.5,  evacuacion: 7,   ceroIgn: 42.39 },
  { id: 20, nombre: 'Barranqueras', rio: 'Barranqueras', alerta: 6,   evacuacion: 6.5, ceroIgn: null  },
  { id: 21, nombre: 'Empedrado',    rio: 'Paraná',      alerta: 6.5,  evacuacion: 6.7, ceroIgn: 39.68 },
  { id: 22, nombre: 'Bella Vista',  rio: 'Paraná',      alerta: 6,    evacuacion: 6.4, ceroIgn: 34.74 },
  { id: 23, nombre: 'Goya',         rio: 'Paraná',      alerta: 5.2,  evacuacion: 5.7, ceroIgn: 29.67 },
] as const

export type EstacionIna = (typeof ESTACIONES)[number]

/**
 * La estación de referencia para el área metropolitana.
 *
 * **Barranqueras no tiene `cero_ign`** y eso importa para más adelante: sin el
 * cero de escala referido al datum del IGN, "6,5 m en la escala" y la cota de un
 * modelo de elevación están en dos sistemas verticales distintos y no se pueden
 * comparar. Corrientes, sobre el mismo tramo, sí lo tiene (42,39), así que
 * cualquier simulación futura se ancla ahí hasta que se consiga el de
 * Barranqueras — es un pedido al INA o a Prefectura, no un desarrollo.
 */
export const REFERENCIA = 20

export interface LecturaRio {
  /** Fecha en ISO, como la devuelve la API */
  fecha: string
  /** Altura hidrométrica en metros sobre el cero de escala */
  m: number
}

export interface PuntoPronostico extends LecturaRio {
  /** La banda que publica el INA. `medio` es el valor central, no el único */
  banda: 'inferior' | 'medio' | 'superior'
}

export interface Pronostico {
  /** Cuándo emitió el INA esta corrida — un pronóstico viejo es otra cosa */
  emitido: string
  puntos: PuntoPronostico[]
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
    throw new Error('No se pudo contactar al Alerta Hidrológico del INA. Puede estar fuera de servicio.')
  }
  if (!res.ok) throw new Error(`El Alerta Hidrológico del INA respondió ${res.status}`)
  return res.json()
}

/** Todas las series de una estación, para saber qué hay antes de pedir datos */
interface FilaSerie {
  id: number
  var: { var: string }
  procedimiento: { abrev: string }
  date_range?: { timestart: string | null; timeend: string | null; count: number | null }
  pronosticos?: { series_id: number; cal_id: number; forecast_date: string }[] | null
}

async function seriesDe(estacionId: number): Promise<FilaSerie[]> {
  const j = await traer(`/obs/puntual/series?estacion_id=${estacionId}&format=json`) as { rows?: FilaSerie[] }
  return j?.rows ?? []
}

/**
 * La serie de altura hidrométrica medida de una estación.
 *
 * Se busca la de **medición directa**, no la simulada: el número que se muestra
 * tiene que ser el que leyó alguien en la escala. Mismo criterio que con los
 * pluviómetros frente al modelo.
 */
async function serieMedida(estacionId: number): Promise<FilaSerie | null> {
  const s = await seriesDe(estacionId)
  return s.find(r => r.var?.var === 'H' && r.procedimiento?.abrev === 'medicion') ?? null
}

/**
 * Alturas observadas de una estación entre dos fechas.
 *
 * Corrientes tiene serie desde **1901** —casi 48 mil registros— así que acá el
 * histórico profundo ya existe y no hay que construirlo: al revés de lo que
 * pasa con la lluvia, donde tenemos un año.
 */
export async function alturasObservadas(
  estacionId: number, desde: string, hasta: string,
): Promise<LecturaRio[]> {
  return observadasDeSerie(await serieMedida(estacionId), desde, hasta)
}

async function observadasDeSerie(
  serie: FilaSerie | null, desde: string, hasta: string,
): Promise<LecturaRio[]> {
  if (!serie) return []
  const j = await traer(
    `/obs/puntual/series/${serie.id}/observaciones`
    + `?timestart=${desde}&timeend=${hasta}&format=json`,
  ) as { timestart: string; valor: number | null }[]
  if (!Array.isArray(j)) return []
  return j
    .filter(o => typeof o?.valor === 'number')
    .map(o => ({ fecha: o.timestart, m: o.valor as number }))
}

/**
 * El pronóstico vigente de una estación, con su banda.
 *
 * Devuelve `null` cuando la estación no tiene corrida publicada — que es un
 * estado legítimo y distinto de "el río no va a subir". No se rellena con el
 * último valor observado ni con nada: mismo criterio que `mm: null` en la red
 * vial, donde la falta de dato se dibuja como falta de dato.
 */
export async function pronosticoDe(estacionId: number): Promise<Pronostico | null> {
  return pronosticoDeSerie(await serieMedida(estacionId))
}

async function pronosticoDeSerie(serie: FilaSerie | null): Promise<Pronostico | null> {
  const p = serie?.pronosticos?.[0]
  if (!p) return null

  const j = await traer(
    `/sim/calibrados/${p.cal_id}/corridas/last`
    + `?series_id=${p.series_id}&includeProno=true&format=json`,
  ) as {
    forecast_date?: string
    series?: { pronosticos?: { timestart: string; valor: number | null; qualifier?: string }[] }[]
  }

  const puntos: PuntoPronostico[] = []
  for (const s of j?.series ?? []) {
    for (const q of s.pronosticos ?? []) {
      if (typeof q?.valor !== 'number') continue
      const banda = q.qualifier === 'inferior' || q.qualifier === 'superior' ? q.qualifier : 'medio'
      puntos.push({ fecha: q.timestart, m: q.valor, banda })
    }
  }
  if (puntos.length === 0) return null

  puntos.sort((a, b) => a.fecha.localeCompare(b.fecha))
  return { emitido: j?.forecast_date ?? p.forecast_date, puntos }
}

/** Cómo está una altura respecto de los umbrales que publica el INA */
export type EstadoRio = 'aguas_bajas' | 'normal' | 'alerta' | 'evacuacion'

/**
 * Clasifica una altura contra los umbrales **de esa estación**.
 *
 * Los umbrales son por estación y no hay uno provincial: Goya evacúa a 5,7 m y
 * Corrientes a 7. Comparar una altura contra el umbral equivocado da un estado
 * equivocado, así que la función exige la estación y no acepta un número suelto.
 */
export function estadoDe(est: EstacionIna, m: number): EstadoRio {
  if (m >= est.evacuacion) return 'evacuacion'
  if (m >= est.alerta) return 'alerta'
  return 'normal'
}

export const ETIQUETA_ESTADO: Record<EstadoRio, string> = {
  aguas_bajas: 'Aguas bajas',
  normal: 'Normal',
  alerta: 'Sobre nivel de alerta',
  evacuacion: 'Sobre nivel de evacuación',
}

export const COLOR_ESTADO: Record<EstadoRio, string> = {
  aguas_bajas: '#8a8a8a',
  normal: '#5DCAA5',
  alerta: '#EF9F27',
  evacuacion: '#C0392B',
}

/**
 * Lo observado y lo pronosticado de una estación, **con una sola consulta de
 * series**.
 *
 * `alturasObservadas()` y `pronosticoDe()` piden cada una el catálogo de series
 * de la estación. Llamarlas juntas duplica la consulta más pesada, y con seis
 * estaciones en paralelo eso eran **24 pedidos simultáneos** contra el
 * Alerta Hidrológico: el organismo dejaba de contestar y el panel mostraba las
 * seis como "sin responder". El relevamiento por consola no lo notaba porque va
 * de a una.
 *
 * Las dos funciones sueltas quedan para uso puntual; **el panel usa ésta**.
 */
export async function estadoCompleto(
  estacionId: number, desde: string, hasta: string,
): Promise<{ observado: LecturaRio[]; pronostico: Pronostico | null }> {
  const serie = await serieMedida(estacionId)
  return {
    observado: await observadasDeSerie(serie, desde, hasta),
    pronostico: await pronosticoDeSerie(serie),
  }
}
