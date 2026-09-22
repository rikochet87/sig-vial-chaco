/**
 * Polígonos de Thiessen: qué pluviómetro manda en cada parte de la provincia.
 *
 * ── Qué afirma esta capa y qué no ─────────────────────────────────────────────
 *
 * Es un **diagnóstico de cobertura**, no el campo de lluvia. Responde una sola
 * pregunta: *si paro en este punto, ¿cuál es el pluviómetro más cercano?* Cada
 * polígono es la zona de una estación, y la frontera entre dos polígonos es la
 * línea donde las dos quedan a la misma distancia.
 *
 * **Los milímetros NO se calculan así.** El número que se muestra sale de IDW,
 * que promedia varios pluviómetros pesando más a los cercanos. Thiessen usa uno
 * solo, y medido sobre los datos reales sale peor (MAE 4,47 contra 3,98). Se
 * dibuja igual porque para *mirar* la cobertura es insuperable: de un vistazo se
 * ve si la red de un consorcio cae dentro de un polígono o está partida entre
 * tres, y dónde no hay nada.
 *
 * Que el polígono no sea el método de cálculo no lo vuelve mentira: bajo IDW el
 * pluviómetro más cercano es también el que más pesa, así que la pregunta que
 * contesta el dibujo sigue siendo cierta.
 *
 * ── Cómo está hecho ───────────────────────────────────────────────────────────
 *
 * Por fuerza bruta sobre una grilla, no con un Voronoi analítico. Para cada nodo
 * se busca la estación más cercana y se guarda su índice; las fronteras son los
 * nodos cuyo dueño difiere del vecino. Con 71 estaciones y una grilla de 5 km
 * son unos 800 mil cálculos de distancia, que en el navegador tardan menos de lo
 * que tarda en pintarse el mapa — y evita una dependencia nueva.
 *
 * Fuera del radio de búsqueda no hay dueño: ese hueco es información y tiene que
 * verse vacío, igual que en las isohietas.
 */

import { distanciaKm, RADIO_KM, type Medicion } from './fusion'

/** A quién pertenece cada nodo de la grilla */
export interface RasterThiessen {
  nx: number
  ny: number
  lat0: number
  lng0: number
  dLat: number
  dLng: number
  /** Índice de la estación más cercana por nodo; −1 si está fuera de radio */
  duenio: Int16Array
  /** Cuántas estaciones terminaron con al menos un nodo propio */
  conZona: number
}

/**
 * Paso de la grilla, en km.
 *
 * Más fino que el de las isohietas: acá lo que se mira es el borde entre
 * polígonos, y con 5 km los bordes salen escalonados a simple vista.
 */
export const PASO_KM = 3

export function rasterThiessen(estaciones: Medicion[], pasoKm = PASO_KM): RasterThiessen | null {
  if (estaciones.length === 0) return null

  const lats = estaciones.map(e => e.lat)
  const lngs = estaciones.map(e => e.lng)
  const latMedia = (Math.min(...lats) + Math.max(...lats)) / 2
  const kmPorGradoLng = 111.32 * Math.cos((latMedia * Math.PI) / 180)

  const margenLat = RADIO_KM / 111.32
  const margenLng = RADIO_KM / kmPorGradoLng
  const lat0 = Math.min(...lats) - margenLat
  const lng0 = Math.min(...lngs) - margenLng
  const dLat = pasoKm / 111.32
  const dLng = pasoKm / kmPorGradoLng
  const nx = Math.max(2, Math.ceil(((Math.max(...lngs) + margenLng) - lng0) / dLng) + 1)
  const ny = Math.max(2, Math.ceil(((Math.max(...lats) + margenLat) - lat0) / dLat) + 1)

  const duenio = new Int16Array(nx * ny).fill(-1)
  const vistas = new Set<number>()

  for (let j = 0; j < ny; j++) {
    const lat = lat0 + j * dLat
    for (let i = 0; i < nx; i++) {
      const p = { lat, lng: lng0 + i * dLng }
      let mejor = -1
      let dMin = RADIO_KM
      for (let k = 0; k < estaciones.length; k++) {
        const d = distanciaKm(p, estaciones[k])
        if (d < dMin) { dMin = d; mejor = k }
      }
      duenio[j * nx + i] = mejor
      if (mejor >= 0) vistas.add(mejor)
    }
  }

  return { nx, ny, lat0, lng0, dLat, dLng, duenio, conZona: vistas.size }
}

/**
 * Marca los nodos que están sobre una frontera.
 *
 * Un nodo es borde si su dueño difiere del de la derecha o del de abajo. Se
 * incluye el borde contra el vacío —dueño −1— porque ese es justamente el
 * límite de la cobertura, que es lo que más interesa ver.
 */
export function bordesThiessen(r: RasterThiessen): Uint8Array {
  const borde = new Uint8Array(r.nx * r.ny)
  for (let j = 0; j < r.ny; j++) {
    for (let i = 0; i < r.nx; i++) {
      const k = j * r.nx + i
      const d = r.duenio[k]
      const derecha = i + 1 < r.nx ? r.duenio[k + 1] : d
      const abajo = j + 1 < r.ny ? r.duenio[k + r.nx] : d
      if (d !== derecha || d !== abajo) borde[k] = 1
    }
  }
  return borde
}

/**
 * Qué estación le toca a un punto cualquiera, y a qué distancia.
 *
 * No usa el raster: se resuelve directo, que es exacto y para un punto suelto
 * cuesta nada. Sirve para el globo del mapa — "este consorcio lee del
 * pluviómetro de Machagai, a 14 km".
 */
export function estacionMasCercana(
  punto: { lat: number; lng: number },
  estaciones: { lat: number; lng: number; nombre: string }[],
): { nombre: string; km: number } | null {
  let mejor: { nombre: string; km: number } | null = null
  for (const e of estaciones) {
    const d = distanciaKm(punto, e)
    if (d <= RADIO_KM && (mejor === null || d < mejor.km)) {
      mejor = { nombre: e.nombre, km: Math.round(d * 10) / 10 }
    }
  }
  return mejor
}
