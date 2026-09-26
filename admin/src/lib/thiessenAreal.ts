/**
 * Precipitación media areal por polígonos de Thiessen — el método del manual.
 *
 * ── La fórmula ────────────────────────────────────────────────────────────────
 *
 *        Σ wᵢ Pᵢ
 *   P̄ = ─────────
 *          Σ wᵢ
 *
 * Cada pluviómetro pesa lo que ocupa su polígono dentro de la región que se
 * está promediando. Es distinto de lo que hace {@link ./fusion}: ahí IDW estima
 * **en un punto** promediando varias estaciones por 1/d²; acá se promedia
 * **sobre una región** y cada estación manda entera en su zona.
 *
 * ── Dos pesos, y la diferencia no es cosmética ────────────────────────────────
 *
 * En hidrología clásica wᵢ es el **área**, porque el objeto que recibe la lluvia
 * es la cuenca y toda ella cuenta por igual. Acá el objeto de interés es la red
 * vial, y un consorcio puede tener 250 km repartidos de forma muy despareja
 * dentro de sus zonas. Por eso hay dos:
 *
 * - {@link arealPorSuperficie} — wᵢ = km² de zona dentro de la región.
 *   Es el método tradicional literal. **Necesita un polígono de la región.**
 * - {@link arealPorLongitud} — wᵢ = km de camino dentro de la zona.
 *   Contesta "cuánta lluvia recibió *la red*", que es la pregunta de esta
 *   pantalla. No necesita polígono, sólo las trazas.
 *
 * Los dos son medias areales legítimas; pesan universos distintos. Pesar por
 * superficie un consorcio le da peso a territorio donde no hay ni un camino.
 *
 * ── Qué polígonos hay y cuáles no ─────────────────────────────────────────────
 *
 * `arealPorSuperficie` se puede usar en **provincia, zona (ZI–ZV) y
 * departamento**, que son los polígonos que existen en `geo_bundle.json`. **Los
 * 103 consorcios no tienen polígono** — en `geo_cc.json` son MultiLineString y
 * nada más — así que a nivel consorcio el peso es por longitud. Si algún día se
 * exporta la capa de límites de consorcio desde QGIS, entra sin tocar nada más:
 * `arealPorSuperficie` toma cualquier anillo.
 *
 * ── El radio recorta y eso hay que informarlo ─────────────────────────────────
 *
 * Las zonas vienen recortadas al radio de búsqueda, así que **no llenan la
 * región**: donde no hay pluviómetro a menos de {@link RADIO_KM} no hay zona.
 * La media se toma **sólo sobre la parte cubierta** y el resto se devuelve en
 * `cobertura`. Repartir el hueco entre las estaciones que sí hay sería inventar
 * un dato; promediarlo como 0 mm sería inventar sequía. Mismo criterio que
 * `mm: null` en `redLluvia` y que la zona sin pintar en las isohietas.
 */

import { distanciaKm, RADIO_KM, type Medicion } from './fusion'
import { poligonosThiessen } from './thiessen'
import type { TramoRed } from './redLluvia'

/**
 * Una medición con el nombre de su estación.
 *
 * `Medicion` en `fusion.ts` es sólo lat/lng/mm porque ahí el nombre no hace
 * falta. Acá sí: el desglose de pesos es lo que se lee en pantalla y en un
 * expediente, y "#37" no le sirve a nadie. Es el mismo tipo que
 * `EstacionLluvia`, que es lo que devuelve /api/lluvia/estaciones.
 */
export type MedicionConNombre = Medicion & { nombre: string }

/** Lo que aportó una estación al promedio */
export interface AporteEstacion {
  /** Índice en el arreglo de mediciones que se pasó */
  indice: number
  nombre: string
  /** Lámina medida en esa estación, en mm */
  mm: number
  /** Cuánto pesa: km² si el peso es por superficie, km si es por longitud */
  peso: number
  /** Su fracción del total, en tanto por uno. Los aportes suman 1 */
  fraccion: number
}

/** El resultado de una media areal */
export interface MediaAreal {
  /**
   * La lámina media sobre la parte cubierta, en mm, o `null` si no hay ninguna
   * estación en el radio y por lo tanto no hay nada que promediar.
   */
  mm: number | null
  /**
   * Qué fracción de la región tiene pluviómetro dentro del radio, en tanto por
   * uno. Por debajo de 1, el `mm` describe sólo esa parte.
   */
  cobertura: number
  /** Unidad del peso, para poder rotularlo sin adivinar */
  unidad: 'km²' | 'km'
  /** Total de peso cubierto — km² o km según la unidad */
  pesoTotal: number
  /** El desglose, de mayor a menor aporte */
  aportes: AporteEstacion[]
}

const vacia = (unidad: 'km²' | 'km'): MediaAreal =>
  ({ mm: null, cobertura: 0, unidad, pesoTotal: 0, aportes: [] })

const redondear = (x: number, n = 2) => {
  const f = 10 ** n
  return Math.round(x * f) / f
}

/** Latitud media de un anillo `[lat, lng]` */
const latMediaDe = (anillo: [number, number][]) =>
  anillo.reduce((s, p) => s + p[0], 0) / anillo.length

/**
 * Área de un anillo en km², por la fórmula del cordón de zapato sobre el plano
 * equirrectangular local.
 *
 * El anillo llega en `[lat, lng]`, que es como lo devuelve `poligonosThiessen`
 * para que Leaflet lo dibuje sin convertir. Devuelve el valor absoluto: no
 * importa si el anillo está en sentido horario o antihorario.
 *
 * **`latReferencia` no es opcional por comodidad, es el punto.** El factor que
 * convierte grados de longitud a km depende de la latitud, así que dos anillos
 * medidos cada uno con *su propia* latitud media quedan en planos distintos y
 * sus áreas no son comparables. Las zonas de una misma región tienen que
 * medirse todas con la misma referencia — y tiene que ser la que usó
 * `poligonosThiessen` para recortarlas, o el área no sería la del polígono que
 * está dibujado en el mapa.
 *
 * Sin referencia cae a la latitud media del propio anillo, que sólo sirve para
 * medir una figura suelta.
 */
export function areaKm2(anillo: [number, number][], latReferencia?: number): number {
  if (anillo.length < 3) return 0
  const lat = latReferencia ?? latMediaDe(anillo)
  const kx = 111.32 * Math.cos((lat * Math.PI) / 180)
  const ky = 111.32
  let s = 0
  for (let i = 0; i < anillo.length; i++) {
    const [latA, lngA] = anillo[i]
    const [latB, lngB] = anillo[(i + 1) % anillo.length]
    s += (lngA * kx) * (latB * ky) - (lngB * kx) * (latA * ky)
  }
  return Math.abs(s) / 2
}

function armar(
  pesos: Map<number, number>,
  mediciones: MedicionConNombre[],
  pesoRegion: number,
  unidad: 'km²' | 'km',
): MediaAreal {
  let total = 0
  for (const w of pesos.values()) total += w
  if (total <= 0) return vacia(unidad)

  let suma = 0
  const aportes: AporteEstacion[] = []
  for (const [i, peso] of pesos) {
    const m = mediciones[i]
    if (!m) continue
    suma += peso * m.mm
    aportes.push({
      indice: i,
      nombre: m.nombre,
      mm: m.mm,
      peso: redondear(peso, unidad === 'km²' ? 0 : 1),
      fraccion: redondear(peso / total, 4),
    })
  }
  aportes.sort((a, b) => b.fraccion - a.fraccion)

  return {
    mm: redondear(suma / total),
    cobertura: pesoRegion > 0 ? Math.min(1, redondear(total / pesoRegion, 4)) : 0,
    unidad,
    pesoTotal: redondear(total, unidad === 'km²' ? 0 : 1),
    aportes,
  }
}

/**
 * Media areal clásica: cada estación pesa los km² de su polígono dentro de la
 * región.
 *
 * `region` es un anillo en `[lng, lat]` — el mismo orden en que vienen los
 * contornos del bundle y el que espera `poligonosThiessen`. Si la región es un
 * MultiPolygon, hay que pasar cada anillo por separado y sumar; para las
 * regiones de este proyecto el anillo exterior alcanza.
 *
 * El recorte lo hace `poligonosThiessen` contra la región misma, así que las
 * áreas que salen son ya las de la intersección zona ∩ región: no hay que
 * intersecar por afuera.
 */
export function arealPorSuperficie(
  mediciones: MedicionConNombre[],
  region: [number, number][],
): MediaAreal {
  if (mediciones.length === 0 || region.length < 3) return vacia('km²')

  // La misma latitud de referencia que usa poligonosThiessen para armar el
  // plano donde recorta. Todas las áreas de acá abajo van con ésta.
  const latRef = region.reduce((s, p) => s + p[1], 0) / region.length

  const zonas = poligonosThiessen(mediciones, region)
  const pesos = new Map<number, number>()
  for (const z of zonas) {
    const a = areaKm2(z.anillo, latRef)
    if (a > 0) pesos.set(z.indice, (pesos.get(z.indice) ?? 0) + a)
  }

  // El área de la región, para saber cuánto quedó fuera de cobertura
  const comoLatLng = region.map(([lng, lat]) => [lat, lng] as [number, number])
  return armar(pesos, mediciones, areaKm2(comoLatLng, latRef), 'km²')
}

/**
 * Media areal pesada por longitud de red: cada estación pesa los km de camino
 * que caen dentro de su zona.
 *
 * No construye los polígonos: para decidir a qué zona pertenece una muestra
 * alcanza con buscar la estación más cercana, que es la definición del polígono
 * de Thiessen. Resolverlo así es exacto y evita tener que probar contención de
 * punto en polígono 15 mil veces.
 *
 * Reusa los puntos de muestreo de `redLluvia` —uno cada 2 km, con el largo que
 * representa como peso— para que este número y el de IDW hablen exactamente de
 * los mismos caminos.
 */
export function arealPorLongitud(
  mediciones: MedicionConNombre[],
  tramos: TramoRed[],
): MediaAreal {
  if (mediciones.length === 0 || tramos.length === 0) return vacia('km')

  const pesos = new Map<number, number>()
  let largoTotal = 0

  for (const t of tramos) {
    for (const m of t.muestras) {
      largoTotal += m.peso
      let mejor = -1
      let mejorD = Infinity
      for (let i = 0; i < mediciones.length; i++) {
        const d = distanciaKm(m, mediciones[i])
        if (d < mejorD) { mejorD = d; mejor = i }
      }
      if (mejor < 0 || mejorD > RADIO_KM) continue
      pesos.set(mejor, (pesos.get(mejor) ?? 0) + m.peso)
    }
  }

  return armar(pesos, mediciones, largoTotal, 'km')
}

/** Filtra los tramos de un consorcio, para promediar sólo su red */
export const tramosDe = (tramos: TramoRed[], cc: number): TramoRed[] =>
  tramos.filter(t => t.cc === cc)
