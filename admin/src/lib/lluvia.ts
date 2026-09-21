/**
 * Precipitaciones: clasificación, escala de color y consulta a Open-Meteo.
 *
 * Todo lo de acá son funciones puras salvo `consultarLluvia`, que es la única
 * que sale a la red. Así la clasificación se puede verificar contra números
 * conocidos sin depender del servicio.
 *
 * Sobre la fuente: la red oficial de la provincia son los 70 pluviómetros de la
 * APA en comisarías más 15 en establecimientos rurales, pero ese dato se levanta
 * por radio y se publica en PDF y prensa, no en un formato consultable. Hasta
 * que exista, Open-Meteo da cobertura de toda la provincia sin que nadie cargue
 * nada. Sirve reanálisis de Copernicus y ECMWF: observación real de estaciones,
 * radar y satélite, rellenada por un modelo físico donde no había nadie
 * midiendo — que en el interior de Chaco es casi todo. Sirve para el orden de
 * magnitud y el patrón espacial, no reemplaza al pluviómetro. Por eso la tabla
 * guarda `fuente`, para poder sumar mediciones reales sin mezclarlas.
 *
 * Dónde se mide cada consorcio: en varios puntos repartidos sobre su red vial,
 * no en la sede. La sede está en el pueblo, que suele quedar en el borde del
 * área — en 68 de 101 consorcios ni siquiera cae en la celda de la grilla donde
 * está el grueso del camino. Y como la red se extiende 45 km de mediana y toca
 * 13 celdas, un punto único tampoco alcanza: lo que se busca es cuánta agua
 * cayó sobre los caminos, así que se promedia ponderando por kilómetros. Ver
 * `scripts/build_puntos_lluvia.py`.
 */

import { PUNTOS_LLUVIA } from '@/data/puntosLluvia'
import { SEDES_CONSORCIOS } from '@/data/sedesConsorcios'

/**
 * El endpoint de archivo, no el de pronóstico.
 *
 * Los dos devuelven `precipitation_sum` diario, pero el de pronóstico deja en
 * null los días de más de unas semanas atrás, y el de archivo llega hasta hoy
 * igual. Con uno solo alcanza y no hay que decidir cuál usar según la fecha.
 */
const API = 'https://archive-api.open-meteo.com/v1/archive'

/** Coordenadas por pedido HTTP. Con 40 la respuesta vuelve en ~350 ms. */
const LOTE = 40

/**
 * Pedidos simultáneos.
 *
 * En secuencia, un rango largo se iba a los 50 y pico de segundos, demasiado
 * cerca del tope de la función. De a 3 baja bastante sin amontonar pedidos
 * contra el límite por minuto.
 */
const PARALELO = 3

/**
 * Reintentos ante un 429.
 *
 * Open-Meteo cuenta UNA llamada por ubicación, no por pedido HTTP: 500 puntos
 * son 500 llamadas contra un cupo de 600 por minuto. Entra, pero si alguien
 * apretó "Actualizar" hace un rato el contador todavía está cargado y salta el
 * límite. Antes eso tiraba la ingesta entera con un error críptico; ahora
 * espera y sigue.
 */
const REINTENTOS = 3
const ESPERA_429_MS = 20_000

const dormir = (ms: number) => new Promise(r => setTimeout(r, ms))

// ── Clasificación ─────────────────────────────────────────────────────────────

export type NivelLluvia = 'sin' | 'leve' | 'moderada' | 'fuerte' | 'muy_fuerte' | 'extrema'

/**
 * Umbrales en milímetros acumulados.
 *
 * Están pensados para camino de tierra, no para agronomía: lo que importa es a
 * partir de cuánto deja de ser transitable. Son un punto de partida razonable
 * para revisar contra lo que reporten los técnicos — si la experiencia en campo
 * dice otra cosa, se corrigen acá y cambia todo el sistema de una.
 */
export const UMBRALES: { nivel: NivelLluvia; desde: number; label: string; color: string; nota: string }[] = [
  { nivel: 'sin',        desde: 0,   label: 'Sin lluvia',   color: '#2a2a2a', nota: 'Sin registro' },
  { nivel: 'leve',       desde: 1,   label: 'Leve',         color: '#8FB8D8', nota: 'No afecta la transitabilidad' },
  { nivel: 'moderada',   desde: 15,  label: 'Moderada',     color: '#4A90C2', nota: 'Tierra blanda, precaución' },
  { nivel: 'fuerte',     desde: 40,  label: 'Fuerte',       color: '#F5C300', nota: 'Tierra intransitable, ripio con cuidado' },
  { nivel: 'muy_fuerte', desde: 80,  label: 'Muy fuerte',   color: '#E8833A', nota: 'Probables cortes y anegamientos' },
  { nivel: 'extrema',    desde: 150, label: 'Extrema',      color: '#D64545', nota: 'Daño de calzada y alcantarillas' },
]

export function clasificar(mm: number): typeof UMBRALES[number] {
  // De mayor a menor: el primero que alcanza es el que corresponde
  for (let i = UMBRALES.length - 1; i >= 0; i--) {
    if (mm >= UMBRALES[i].desde) return UMBRALES[i]
  }
  return UMBRALES[0]
}

export const colorLluvia = (mm: number) => clasificar(mm).color

/**
 * Radio del círculo en el mapa, en píxeles.
 *
 * Raíz cuadrada y no proporcional directo: el área del círculo es lo que el ojo
 * compara, así que escalar el radio de forma lineal exagera los valores altos.
 */
export function radioLluvia(mm: number): number {
  if (mm <= 0) return 4
  return Math.min(4 + Math.sqrt(mm) * 2.2, 30)
}

// ── Fechas ────────────────────────────────────────────────────────────────────

export const aISO = (d: Date) => d.toISOString().slice(0, 10)

export function hace(dias: number): string {
  return aISO(new Date(Date.now() - dias * 86_400_000))
}

/** Días entre dos fechas ISO, inclusive */
export function diasEntre(desde: string, hasta: string): number {
  const d = Date.parse(desde), h = Date.parse(hasta)
  if (Number.isNaN(d) || Number.isNaN(h)) return 0
  return Math.floor((h - d) / 86_400_000) + 1
}

// ── Consulta ──────────────────────────────────────────────────────────────────

export interface RegistroLluvia {
  consorcio_numero: number
  fecha: string
  mm: number
}

function lotes<T>(xs: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}

/**
 * Trae los milímetros diarios de cada consorcio para el rango pedido.
 *
 * Consulta los ~746 puntos de muestreo repartidos sobre las redes viales y
 * promedia los de cada consorcio ponderando por el peso de cada punto, que es
 * la fracción de camino que representa. El resultado es "cuánta agua cayó sobre
 * los caminos de este consorcio", no "cuánta cayó sobre su oficina".
 *
 * Open-Meteo acepta varios puntos por llamada separando las coordenadas por
 * coma y devuelve un arreglo en el mismo orden, así que los 746 puntos salen en
 * 19 llamadas.
 */
export async function consultarLluvia(desde: string, hasta: string): Promise<RegistroLluvia[]> {
  // consorcio → fecha → { suma ponderada, peso efectivamente consultado }
  const acum = new Map<number, Map<string, { mm: number; peso: number }>>()

  /**
   * Coordenadas únicas.
   *
   * Consorcios vecinos comparten celdas, así que la misma coordenada aparece
   * en varias filas. Preguntarla una sola vez ahorra llamadas contra el cupo,
   * que es el recurso escaso acá.
   */
  const clave = (p: { lat: number; lng: number }) => `${p.lat},${p.lng}`
  const porCoord = new Map<string, { lat: number; lng: number }>()
  for (const p of PUNTOS_LLUVIA) if (!porCoord.has(clave(p))) porCoord.set(clave(p), p)
  const coords = [...porCoord.values()]

  // coordenada → { fecha → mm }
  const mmPorCoord = new Map<string, Map<string, number>>()

  const grupos = lotes(coords, LOTE)

  const traer = async (grupo: typeof coords) => {
    const url = `${API}?latitude=${grupo.map(p => p.lat).join(',')}`
              + `&longitude=${grupo.map(p => p.lng).join(',')}`
              + `&start_date=${desde}&end_date=${hasta}`
              + `&daily=precipitation_sum&timezone=America%2FArgentina%2FCordoba`

    for (let intento = 0; ; intento++) {
      const res = await fetch(url)
      if (res.ok) {
        const json = await res.json()
        // Con un solo punto devuelve un objeto; con varios, un arreglo
        return { grupo, respuestas: Array.isArray(json) ? json : [json] }
      }
      const cuerpo = await res.text()
      if (res.status === 429 && intento < REINTENTOS) {
        // El cupo se libera por minuto: esperar es la respuesta correcta
        await dormir(ESPERA_429_MS)
        continue
      }
      if (res.status === 429) {
        throw new Error(
          'Se agotó el cupo por minuto del servicio de lluvia. Esperá un minuto y '
          + 'volvé a intentar, o cargá el rango en tramos más cortos.',
        )
      }
      throw new Error(`Open-Meteo respondió ${res.status} — ${cuerpo}`)
    }
  }

  // De a PARALELO pedidos por vez, acumulando a medida que llegan
  for (let i = 0; i < grupos.length; i += PARALELO) {
    const tanda = await Promise.all(grupos.slice(i, i + PARALELO).map(traer))

    for (const { grupo, respuestas } of tanda) {
      respuestas.forEach((r, k) => {
        const punto = grupo[k]
        if (!punto) return
        const fechas: string[] = r?.daily?.time ?? []
        const mms: (number | null)[] = r?.daily?.precipitation_sum ?? []

        const serie = new Map<string, number>()
        fechas.forEach((fecha, j) => {
          const mm = mms[j]
          // Un null es "el modelo no tiene ese día", que no es lo mismo que
          // cero: guardarlo como 0 sería inventar un día seco.
          if (mm != null) serie.set(fecha, mm)
        })
        mmPorCoord.set(clave(punto), serie)
      })
    }
  }

  // Repartir lo consultado entre los consorcios que comparten cada coordenada
  for (const punto of PUNTOS_LLUVIA) {
    const serie = mmPorCoord.get(clave(punto))
    if (!serie) continue

    let porFecha = acum.get(punto.cc)
    if (!porFecha) { porFecha = new Map(); acum.set(punto.cc, porFecha) }

    for (const [fecha, mm] of serie) {
      const a = porFecha.get(fecha) ?? { mm: 0, peso: 0 }
      a.mm += mm * punto.peso
      a.peso += punto.peso
      porFecha.set(fecha, a)
    }
  }

  const registros: RegistroLluvia[] = []
  for (const [cc, porFecha] of acum) {
    for (const [fecha, a] of porFecha) {
      // Se divide por el peso realmente consultado, no por 1: si a algún punto
      // le faltó el día, el promedio sale de los que sí respondieron en vez de
      // diluirse hacia abajo.
      if (a.peso <= 0) continue
      registros.push({
        consorcio_numero: cc,
        fecha,
        mm: Math.round((a.mm / a.peso) * 100) / 100,
      })
    }
  }
  return registros
}

// ── Agregación ────────────────────────────────────────────────────────────────

export interface ResumenConsorcio {
  numero: number
  nombre: string
  zona: string
  lat: number
  lng: number
  /** Acumulado del período */
  mm: number
  /** El día más intenso del período — una tormenta de 60 mm no es lo mismo que 60 mm en un mes */
  mmMaxDia: number
  fechaMaxDia: string | null
  dias: number
  /**
   * Cuántos puntos de la red se promediaron.
   *
   * Se expone para poder avisar en pantalla cuando un consorcio se mide en un
   * solo punto: hoy le pasa al CC 96, que no tiene traza en el bundle y cae al
   * centroide. Un número que se va a citar tiene que poder decir de dónde sale.
   */
  puntos: number
}

/** Cuántos puntos de muestreo tiene cada consorcio */
const PUNTOS_POR_CC = PUNTOS_LLUVIA.reduce<Record<number, number>>((acc, p) => {
  acc[p.cc] = (acc[p.cc] ?? 0) + 1
  return acc
}, {})

export function resumirPorConsorcio(registros: RegistroLluvia[]): ResumenConsorcio[] {
  const porNumero = new Map<number, RegistroLluvia[]>()
  for (const r of registros) {
    const arr = porNumero.get(r.consorcio_numero) ?? []
    arr.push(r)
    porNumero.set(r.consorcio_numero, arr)
  }

  return SEDES_CONSORCIOS.map(s => {
    const rs = porNumero.get(s.numero) ?? []
    let mm = 0, mmMaxDia = 0, fechaMaxDia: string | null = null
    let dias = 0
    for (const r of rs) {
      mm += r.mm
      if (r.mm > 0) dias++
      if (r.mm > mmMaxDia) { mmMaxDia = r.mm; fechaMaxDia = r.fecha }
    }
    return {
      numero: s.numero, nombre: s.nombre, zona: s.zona, lat: s.lat, lng: s.lng,
      mm: Math.round(mm * 10) / 10,
      mmMaxDia: Math.round(mmMaxDia * 10) / 10,
      fechaMaxDia, dias,
      puntos: PUNTOS_POR_CC[s.numero] ?? 0,
    }
  })
}

/**
 * Detecta los episodios de lluvia del período: rachas de días consecutivos con
 * agua, separadas por al menos un día seco.
 *
 * Sirve para el selector "última tormenta": lo que el usuario quiere ver no es
 * un rango de fechas arbitrario sino el evento, que puede haber durado dos o
 * tres días.
 */
export interface Episodio {
  desde: string
  hasta: string
  /** Máximo acumulado del episodio entre todos los consorcios */
  mmPico: number
  /** Cuántos consorcios superaron el umbral de "fuerte" */
  consorciosFuertes: number
}

export function detectarEpisodios(registros: RegistroLluvia[], mmMinimo = 5): Episodio[] {
  // Por fecha: cuánto es el máximo provincial de ese día
  const porFecha = new Map<string, number[]>()
  for (const r of registros) {
    const arr = porFecha.get(r.fecha) ?? []
    arr.push(r.mm)
    porFecha.set(r.fecha, arr)
  }

  const fechas = [...porFecha.keys()].sort()
  const episodios: Episodio[] = []
  let actual: { desde: string; hasta: string; acum: Map<number, number> } | null = null

  const cerrar = () => {
    if (!actual) return
    const rango = registros.filter(r => r.fecha >= actual!.desde && r.fecha <= actual!.hasta)
    const porCons = new Map<number, number>()
    for (const r of rango) porCons.set(r.consorcio_numero, (porCons.get(r.consorcio_numero) ?? 0) + r.mm)
    const valores = [...porCons.values()]
    episodios.push({
      desde: actual.desde, hasta: actual.hasta,
      mmPico: Math.round(Math.max(0, ...valores) * 10) / 10,
      consorciosFuertes: valores.filter(v => v >= 40).length,
    })
    actual = null
  }

  for (const f of fechas) {
    const maxDia = Math.max(...(porFecha.get(f) ?? [0]))
    if (maxDia >= mmMinimo) {
      if (actual) actual.hasta = f
      else actual = { desde: f, hasta: f, acum: new Map() }
    } else {
      cerrar()
    }
  }
  cerrar()

  return episodios.reverse()   // el más reciente primero
}
