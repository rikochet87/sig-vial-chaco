/**
 * Los límites administrativos de la provincia: el límite provincial, las cinco
 * zonas viales y los 25 departamentos.
 *
 * Salen de `public/geo/geo_bundle.json`, el mismo archivo que usa el mapa
 * principal. Acá se lo lee para otra cosa: **dibujarlos de referencia sobre el
 * mapa de lluvia** y poder decir en qué zona y en qué departamento está un
 * tramo. No hay cálculo de lluvia que dependa de esta geometría.
 *
 * El archivo pesa 1,3 MB —trae además sedes, rutas y centros de salud— así que
 * se pide recién cuando alguien prende una de las tres capas, y se comparte.
 */

import { dentroDe, puntoInterior } from './cuencas'

/** Un recinto con nombre: una zona, un departamento o la provincia */
export interface Recinto {
  /** Identificador estable: 'ZI', 'TAPENAGÁ', 'CHACO' */
  clave: string
  /** Cómo se rotula en el mapa */
  nombre: string
  /** Un anillo exterior por parte, en `[lat, lng]` como lo quiere Leaflet */
  partes: [number, number][][]
  /** Dónde poner el rótulo: un punto adentro de la parte más grande */
  rotulo: [number, number]
  /** `[latMin, lngMin, latMax, lngMax]` */
  caja: [number, number, number, number]
}

export interface Limites {
  provincia: Recinto
  zonas: Recinto[]
  departamentos: Recinto[]
}

type Geometria =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] }
interface Coleccion { features: { properties: Record<string, unknown>; geometry: Geometria }[] }

/** Las cinco zonas viales, en orden, con el número romano que se rotula */
const ZONAS: [string, string][] = [
  ['ZI', 'Zona I'], ['ZII', 'Zona II'], ['ZIII', 'Zona III'], ['ZIV', 'Zona IV'], ['ZV', 'Zona V'],
]

/** El tamaño de un anillo, sólo para elegir el más grande */
function tamano(anillo: [number, number][]): number {
  let s = 0
  for (let i = 0; i < anillo.length - 1; i++) {
    s += anillo[i][1] * anillo[i + 1][0] - anillo[i + 1][1] * anillo[i][0]
  }
  return Math.abs(s)
}

/**
 * Junta en un solo recinto todas las features de una colección.
 *
 * De cada polígono queda sólo el anillo exterior. Un hueco —un enclave— no
 * cambia dónde se dibuja el borde de afuera, y para decir en qué recinto cae un
 * punto, tratarlo como parte del recinto que lo rodea es el error chico.
 */
function recinto(clave: string, nombre: string, col: Coleccion): Recinto {
  const partes: [number, number][][] = []
  for (const f of col.features) {
    const poligonos = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
    for (const p of poligonos) partes.push(p[0].map(([lng, lat]) => [lat, lng] as [number, number]))
  }

  const caja: Recinto['caja'] = [90, 180, -90, -180]
  for (const parte of partes) for (const [lat, lng] of parte) {
    if (lat < caja[0]) caja[0] = lat
    if (lng < caja[1]) caja[1] = lng
    if (lat > caja[2]) caja[2] = lat
    if (lng > caja[3]) caja[3] = lng
  }

  const mayor = partes.reduce((a, b) => (tamano(b) > tamano(a) ? b : a))
  return { clave, nombre, partes, rotulo: puntoInterior(mayor), caja }
}

/** Arma los tres juegos de límites desde el bundle */
export function parsearLimites(bundle: {
  limite_provincial: Coleccion
  limites_zonas: Record<string, Coleccion>
  departamentos: Coleccion
}): Limites {
  return {
    provincia: recinto('CHACO', 'Chaco', bundle.limite_provincial),
    zonas: ZONAS
      .filter(([clave]) => bundle.limites_zonas[clave])
      .map(([clave, nombre]) => recinto(clave, nombre, bundle.limites_zonas[clave])),
    // Cada departamento es una feature; el nombre viene en `Departamen`, que es
    // como lo cortó el formato shapefile de origen (diez caracteres).
    departamentos: bundle.departamentos.features
      .map(f => {
        const nombre = String(f.properties.Departamen ?? '').trim()
        return recinto(nombre, nombre, { features: [f] })
      })
      .filter(d => d.nombre !== '')
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
  }
}

/** El recinto que contiene el punto, o null */
export function recintoEn(recintos: Recinto[], lat: number, lng: number): Recinto | null {
  for (const r of recintos) {
    if (lat < r.caja[0] || lat > r.caja[2] || lng < r.caja[1] || lng > r.caja[3]) continue
    if (r.partes.some(p => dentroDe(p, lat, lng))) return r
  }
  return null
}

let cache: Promise<Limites> | null = null

/** Los límites. Se bajan una sola vez y se comparten. */
export function cargarLimites(): Promise<Limites> {
  if (!cache) {
    cache = fetch('/geo/geo_bundle.json')
      .then(r => {
        if (!r.ok) throw new Error(`el servidor respondió ${r.status}`)
        return r.json()
      })
      .then(parsearLimites)
    // Un fallo no queda cacheado: el próximo intento puede reintentar.
    cache.catch(() => { cache = null })
  }
  return cache
}
