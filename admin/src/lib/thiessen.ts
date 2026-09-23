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
 * Los polígonos son **exactos y vectoriales**, por recorte de semiplanos: se
 * arranca del contorno de la provincia y se lo va cortando por el bisector
 * contra cada una de las otras estaciones. Lo que sobrevive es, por definición,
 * el conjunto de puntos más cercanos a esta estación que a cualquier otra.
 *
 * La versión anterior resolvía lo mismo por fuerza bruta sobre una grilla de
 * 2 km y se dibujaba como imagen. **Se veía mal y ese fue el motivo del cambio**:
 * al ampliar, el navegador escalaba el raster unas cinco veces por celda y una
 * línea de un píxel se convertía en una banda gris difusa. Con vectores el borde
 * queda fino en todos los niveles de zoom, se puede pintar y resaltar cada zona
 * por separado, y de paso se calcula más rápido — 70 recortes contra 70
 * bisectores en vez de ochocientas mil distancias.
 *
 * Dos recortes más, que no son decoración:
 *
 * - **Contra el contorno provincial.** Sin él las zonas del borde se estiran
 *   hacia Santiago, Salta y Formosa, donde no hay red vial que mirar.
 * - **Contra el radio de búsqueda.** Más allá de {@link RADIO_KM} no hay dueño,
 *   y ese hueco es un dato: es donde la fusión cae al modelo. Tiene que verse
 *   vacío, igual que en las isohietas.
 *
 * El plano es equirrectangular local en km (la escala en longitud se toma a la
 * latitud media de la provincia). Sobre 500 km de ancho el error es despreciable
 * para dibujar, y a cambio los bisectores son rectas de verdad.
 */

import { distanciaKm, RADIO_KM, type Medicion } from './fusion'
import { CONTORNO_CHACO } from '@/data/contornoChaco'

/** Una zona de pluviómetro ya recortada, lista para dibujar */
export interface ZonaThiessen {
  /** Índice en el arreglo de estaciones que se pasó */
  indice: number
  /** Anillo cerrado en `[lat, lng]`, como lo quiere Leaflet */
  anillo: [number, number][]
}

/** Con cuántos lados se aproxima el círculo del radio de búsqueda */
const LADOS_CIRCULO = 64

type Punto = { x: number; y: number }

/**
 * Recorta un polígono con un semiplano (Sutherland–Hodgman).
 *
 * `dentro(p) <= 0` define qué lado se conserva. El polígono de entrada puede ser
 * cóncavo —el contorno provincial lo es— porque el que tiene que ser convexo es
 * el recorte, y un semiplano siempre lo es.
 */
function recortar(poly: Punto[], f: (p: Punto) => number): Punto[] {
  const salida: Punto[] = []
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    const fp = f(p)
    const fq = f(q)
    if (fp <= 0) salida.push(p)
    if ((fp <= 0) !== (fq <= 0)) {
      const t = fp / (fp - fq)
      salida.push({ x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) })
    }
  }
  return salida
}

/**
 * Calcula las zonas de todas las estaciones.
 *
 * Estaciones que comparten exactamente la misma coordenada: la primera se queda
 * con la zona y la otra sale sin polígono, porque su celda tiene área cero. No
 * es un error — en el origen de la APA, La Vicuña y Paraje Kolbacks tienen la
 * misma coordenada de relleno, y por eso salen 70 zonas para 71 estaciones.
 */
export function poligonosThiessen(
  estaciones: Medicion[],
  contorno: [number, number][] = CONTORNO_CHACO,
): ZonaThiessen[] {
  if (estaciones.length === 0 || contorno.length < 3) return []

  const latMedia = contorno.reduce((s, p) => s + p[1], 0) / contorno.length
  const kx = 111.32 * Math.cos((latMedia * Math.PI) / 180)
  const ky = 111.32
  const aKm = (lng: number, lat: number): Punto => ({ x: lng * kx, y: lat * ky })

  const molde = contorno.map(([lng, lat]) => aKm(lng, lat))
  const sitios = estaciones.map(e => aKm(e.lng, e.lat))

  const zonas: ZonaThiessen[] = []
  for (let k = 0; k < sitios.length; k++) {
    const s = sitios[k]
    let poly = molde

    // Bisector contra cada una de las demás: me quedo con mi lado
    for (let j = 0; j < sitios.length && poly.length >= 3; j++) {
      if (j === k) continue
      const o = sitios[j]
      const mx = (s.x + o.x) / 2
      const my = (s.y + o.y) / 2
      const nx = o.x - s.x
      const ny = o.y - s.y
      if (nx === 0 && ny === 0) {
        // Coordenada compartida: la primera se queda con todo
        if (j < k) { poly = []; break }
        continue
      }
      poly = recortar(poly, p => (p.x - mx) * nx + (p.y - my) * ny)
    }

    // Y el radio de búsqueda, como polígono tangente
    for (let i = 0; i < LADOS_CIRCULO && poly.length >= 3; i++) {
      const a = (2 * Math.PI * i) / LADOS_CIRCULO
      const cx = s.x + RADIO_KM * Math.cos(a)
      const cy = s.y + RADIO_KM * Math.sin(a)
      const nx = cx - s.x
      const ny = cy - s.y
      poly = recortar(poly, p => (p.x - cx) * nx + (p.y - cy) * ny)
    }

    if (poly.length >= 3) {
      zonas.push({ indice: k, anillo: poly.map(p => [p.y / ky, p.x / kx] as [number, number]) })
    }
  }
  return zonas
}

/**
 * Qué estación le toca a un punto cualquiera, y a qué distancia.
 *
 * No usa los polígonos: se resuelve directo, que es exacto y para un punto
 * suelto cuesta nada. Sirve para el globo del mapa — "este consorcio lee del
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
