/**
 * Las cuencas hídricas de la provincia.
 *
 * Son 13 y cubren el Chaco entero. Salen de `public/geo/geo_cuencas.json`, que
 * se **genera** con `scripts/build_cuencas.mjs` desde el shapefile de
 * `docs/geo/cuencas/` — no editar a mano.
 *
 * **Son el primer recorte del sistema que es un polígono con sentido
 * hidrológico.** Los consorcios no tienen polígono —son líneas— y por eso su
 * lámina areal se pesa por kilómetros de camino. Una cuenca es justamente el
 * objeto para el que se inventó la precipitación media areal: toda su
 * superficie recibe la lluvia y toda cuenta igual. `arealPorSuperficie` de
 * `lib/thiessenAreal.ts` toma cualquier anillo, así que las cuencas entran ahí
 * sin tocar nada.
 *
 * Acá no hay cálculo de lluvia: sólo la geometría y dos preguntas sobre ella,
 * para que los procesos que vengan no tengan que volver a parsear el GeoJSON.
 *
 * El datum del shapefile es una suposición razonada —no traía .prj—: ver la
 * cabecera de `scripts/build_cuencas.mjs`.
 */

export interface Cuenca {
  /** Código de la cuenca, 1 a 13. Es el identificador estable. */
  cod: number
  nombre: string
  /** Superficie declarada en el origen, en hectáreas. */
  ha: number
  /**
   * Un anillo cerrado por parte, en `[lat, lng]` como lo quiere Leaflet. Doce
   * cuencas tienen una sola parte; el valle del Paraná, doce. No hay huecos.
   */
  partes: [number, number][][]
  /** Dónde poner el rótulo: un punto que cae adentro de la parte más grande. */
  rotulo: [number, number]
  /** `[latMin, lngMin, latMax, lngMax]`, para descartar rápido. */
  caja: [number, number, number, number]
}

interface FeatureCuenca {
  properties: { cod: number; nombre: string; ha: number }
  geometry:
    | { type: 'Polygon'; coordinates: number[][][] }
    | { type: 'MultiPolygon'; coordinates: number[][][][] }
}

/** Arma las cuencas desde el GeoJSON, ordenadas por código. */
export function parsearCuencas(geojson: { features: FeatureCuenca[] }): Cuenca[] {
  return geojson.features.map(f => {
    const poligonos = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
    // De cada polígono sólo el anillo exterior: no hay huecos (el script falla si aparece uno)
    const partes = poligonos.map(p => p[0].map(([lng, lat]) => [lat, lng] as [number, number]))

    const caja: Cuenca['caja'] = [90, 180, -90, -180]
    for (const parte of partes) for (const [lat, lng] of parte) {
      if (lat < caja[0]) caja[0] = lat
      if (lng < caja[1]) caja[1] = lng
      if (lat > caja[2]) caja[2] = lat
      if (lng > caja[3]) caja[3] = lng
    }

    const mayor = partes.reduce((a, b) => (Math.abs(areaPlana(b)) > Math.abs(areaPlana(a)) ? b : a))
    return { cod: f.properties.cod, nombre: f.properties.nombre, ha: f.properties.ha, partes, rotulo: puntoInterior(mayor), caja }
  }).sort((a, b) => a.cod - b.cod)
}

// ── Geometría ────────────────────────────────────────────────────────────────

/** Área con signo en grados²: sólo sirve para comparar partes entre sí. */
function areaPlana(anillo: [number, number][]): number {
  let s = 0
  for (let i = 0; i < anillo.length - 1; i++) {
    s += anillo[i][1] * anillo[i + 1][0] - anillo[i + 1][1] * anillo[i][0]
  }
  return s / 2
}

/** ¿El punto está adentro del anillo? Por cruces de una semirrecta hacia el este. */
export function dentroDe(anillo: [number, number][], lat: number, lng: number): boolean {
  let adentro = false
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [latI, lngI] = anillo[i], [latJ, lngJ] = anillo[j]
    if ((latI > lat) !== (latJ > lat) && lng < ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI) {
      adentro = !adentro
    }
  }
  return adentro
}

/**
 * Un punto que cae adentro del anillo, para el rótulo.
 *
 * **No es el centroide, y es a propósito.** Varias cuencas son alargadas y
 * curvas —siguen un río—, y el centro de gravedad de una forma así cae afuera,
 * sobre la cuenca de al lado: el rótulo nombraría el lugar equivocado. Se toma
 * en cambio el punto medio del tramo interior más largo, mirando varias
 * latitudes: siempre está adentro, y cae donde la cuenca es más ancha.
 */
export function puntoInterior(anillo: [number, number][]): [number, number] {
  let latMin = 90, latMax = -90
  for (const [lat] of anillo) { if (lat < latMin) latMin = lat; if (lat > latMax) latMax = lat }

  let mejor: [number, number] = anillo[0], ancho = -1
  const CORTES = 24
  for (let k = 1; k < CORTES; k++) {
    const lat = latMin + ((latMax - latMin) * k) / CORTES
    const cruces: number[] = []
    for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
      const [latI, lngI] = anillo[i], [latJ, lngJ] = anillo[j]
      if ((latI > lat) !== (latJ > lat)) cruces.push(((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI)
    }
    cruces.sort((a, b) => a - b)
    // De a pares: entre el cruce 0 y el 1 se está adentro, entre el 1 y el 2 afuera…
    for (let c = 0; c + 1 < cruces.length; c += 2) {
      if (cruces[c + 1] - cruces[c] > ancho) {
        ancho = cruces[c + 1] - cruces[c]
        mejor = [lat, (cruces[c] + cruces[c + 1]) / 2]
      }
    }
  }
  return mejor
}

/** La cuenca que contiene el punto, o null si cae fuera de todas. */
export function cuencaEn(cuencas: Cuenca[], lat: number, lng: number): Cuenca | null {
  for (const c of cuencas) {
    if (lat < c.caja[0] || lat > c.caja[2] || lng < c.caja[1] || lng > c.caja[3]) continue
    if (c.partes.some(p => dentroDe(p, lat, lng))) return c
  }
  return null
}

// ── Carga ────────────────────────────────────────────────────────────────────

let cache: Promise<Cuenca[]> | null = null

/** Las 13 cuencas. Se bajan una sola vez (310 KB) y se comparten. */
export function cargarCuencas(): Promise<Cuenca[]> {
  if (!cache) {
    cache = fetch('/geo/geo_cuencas.json')
      .then(r => {
        // Un 404 devuelve una página HTML: sin mirar r.ok, .json() revienta con
        // un error de sintaxis que no dice nada de lo que pasó.
        if (!r.ok) throw new Error(`el servidor respondió ${r.status}`)
        return r.json()
      })
      .then(parsearCuencas)
    // Un fallo no queda cacheado: el próximo intento puede reintentar.
    cache.catch(() => { cache = null })
  }
  return cache
}
