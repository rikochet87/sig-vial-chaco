/**
 * La red vial como **fondo** de los mapas de cálculo.
 *
 * ── Qué problema resuelve ─────────────────────────────────────────────────────
 *
 * En las calculadoras el mapa es para dibujar: se marcan vértices, se traza una
 * línea, se cierra un polígono. Tener la red vial a la vista mientras tanto
 * ayuda —uno sabe sobre qué camino está trabajando— pero la capa que había
 * **capturaba el clic**: cada `bindTooltip` sobre una polilínea la vuelve
 * interactiva, y al querer marcar un vértice encima de un camino el clic se lo
 * comía la capa en vez de llegar al dibujo.
 *
 * Acá la red es completamente inerte: va en un panel propio por debajo de todo
 * y con `interactive: false`, así que el puntero la atraviesa siempre.
 *
 * ── Y entonces cómo se leen los datos ─────────────────────────────────────────
 *
 * Con un hit-test propio. El mapa escucha `mousemove` a nivel mapa —no a nivel
 * capa— y {@link RedFondo.tramoEn} contesta qué tramo cae bajo el cursor. Eso
 * alimenta un recuadro fijo con CC, ruta, jurisdicción y material.
 *
 * La diferencia no es cosmética: un tooltip de Leaflet obliga a que la capa
 * reciba eventos, y ahí volvemos al problema. Resolviéndolo por afuera, la capa
 * nunca participa del ruteo de eventos y el dibujo se queda con todos los clics.
 *
 * ── Cómo hace para contestar rápido ───────────────────────────────────────────
 *
 * La red son 249.209 vértices: recorrerlos en cada movimiento del mouse no
 * cierra. Se arma una grilla de {@link CELDA_GRADOS} y cada segmento se indexa
 * en las celdas que toca; una consulta mira la celda del cursor y sus ocho
 * vecinas, que son unas pocas decenas de segmentos.
 *
 * El índice se arma una vez por sesión y se comparte entre los cuatro mapas
 * —son cuatro calculadoras distintas pero la red es la misma—, junto con el
 * propio archivo, que pesa 8,6 MB.
 */

/** Panel de Leaflet donde vive la red. Por debajo del overlay normal (400). */
export const PANE_RED_FONDO = 'redFondo'

/** Lado de la celda del índice espacial, en grados (~5,5 km) */
export const CELDA_GRADOS = 0.05

/**
 * Crea el panel de fondo si todavía no existe.
 *
 * Va por debajo del `overlayPane` (400), así que el dibujo siempre queda encima,
 * y con `pointerEvents: none` para que nada que se ponga ahí pueda robarle un
 * clic al dibujo — aunque alguien se olvide del `interactive: false`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function asegurarPanelFondo(map: any) {
  if (map.getPane(PANE_RED_FONDO)) return
  const panel = map.createPane(PANE_RED_FONDO)
  panel.style.zIndex = '350'
  panel.style.pointerEvents = 'none'
}

/** Lo que se muestra del tramo bajo el cursor */
export interface TramoInfo {
  /** Número de consorcio, o null si el tramo no es de un consorcio */
  cc: number | null
  ruta: string
  jurisdiccion: string
  material: string
  zona: string
  /** A cuántos km del cursor pasa la traza */
  km: number
}

interface Segmento {
  aLat: number; aLng: number
  bLat: number; bLng: number
  info: Omit<TramoInfo, 'km'>
}

const texto = (v: unknown): string =>
  v === null || v === undefined ? '' : String(v).trim()

/**
 * Nombre de zona para mostrar.
 *
 * Las capas `ZIV_DVP` y `ZV_DVP` del bundle son red que no pertenece a ningún
 * consorcio. El sufijo no va a pantalla —el sistema es independiente del
 * organismo— así que se muestran como red primaria a secas.
 */
function zonaVisible(clave: string): string {
  return clave.endsWith('_DVP') ? 'Red primaria' : `Zona ${clave}`
}

/** Distancia en km de un punto a un segmento, en plano equirectangular local */
export function distanciaAlSegmentoKm(
  p: { lat: number; lng: number },
  aLat: number, aLng: number, bLat: number, bLng: number,
): number {
  const kx = 111.32 * Math.cos((p.lat * Math.PI) / 180)
  const px = p.lng * kx, py = p.lat * 111.32
  const ax = aLng * kx, ay = aLat * 111.32
  const bx = bLng * kx, by = bLat * 111.32

  const dx = bx - ax, dy = by - ay
  const largo2 = dx * dx + dy * dy
  // Segmento degenerado: es un punto
  if (largo2 === 0) return Math.hypot(px - ax, py - ay)

  // Proyección del punto sobre la recta, acotada al segmento
  let t = ((px - ax) * dx + (py - ay) * dy) / largo2
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** La red vial cargada, indexada y lista para dibujar y consultar */
export class RedFondo {
  private celdas = new Map<string, Segmento[]>()
  /** Una polilínea por tramo, para poder sacarlas del mapa */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private grupo: any = null

  /** `[lat, lng][]` de cada tramo, con sus datos */
  readonly tramos: { puntos: [number, number][]; info: Omit<TramoInfo, 'km'> }[] = []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(red: Record<string, any>) {
    for (const [clave, zona] of Object.entries(red)) {
      if (!zona?.features) continue
      const nombreZona = zonaVisible(clave)

      for (const f of zona.features) {
        const p = f.properties ?? {}
        const ccNum = Number(p.CC ?? p.cc)
        const info = {
          cc: Number.isFinite(ccNum) ? ccNum : null,
          ruta: texto(p.Nm ?? p.nm ?? p.Nombre),
          jurisdiccion: texto(p.J ?? p.j),
          material: texto(p.M ?? p.m),
          zona: nombreZona,
        }

        const esMulti = f.geometry?.type === 'MultiLineString'
        const lineas = (esMulti ? f.geometry.coordinates : [f.geometry?.coordinates]) as number[][][]
        if (!lineas?.[0]) continue

        for (const linea of lineas) {
          if (!linea || linea.length < 2) continue
          // GeoJSON viene [lng, lat]; Leaflet espera [lat, lng]
          const puntos = linea.map(c => [c[1], c[0]] as [number, number])
          this.tramos.push({ puntos, info })

          for (let i = 0; i + 1 < puntos.length; i++) {
            this.indexar({
              aLat: puntos[i][0], aLng: puntos[i][1],
              bLat: puntos[i + 1][0], bLng: puntos[i + 1][1],
              info,
            })
          }
        }
      }
    }
  }

  /** Mete el segmento en todas las celdas que toca su caja */
  private indexar(s: Segmento) {
    const i0 = Math.floor(Math.min(s.aLng, s.bLng) / CELDA_GRADOS)
    const i1 = Math.floor(Math.max(s.aLng, s.bLng) / CELDA_GRADOS)
    const j0 = Math.floor(Math.min(s.aLat, s.bLat) / CELDA_GRADOS)
    const j1 = Math.floor(Math.max(s.aLat, s.bLat) / CELDA_GRADOS)
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const k = `${i}|${j}`
        const arr = this.celdas.get(k)
        if (arr) arr.push(s)
        else this.celdas.set(k, [s])
      }
    }
  }

  /**
   * Qué tramo pasa bajo el punto, si hay alguno a menos de `tolKm`.
   *
   * Mira la celda del punto y las ocho de alrededor, porque un segmento que
   * pasa cerca puede estar indexado en la celda de al lado.
   */
  tramoEn(punto: { lat: number; lng: number }, tolKm: number): TramoInfo | null {
    const i = Math.floor(punto.lng / CELDA_GRADOS)
    const j = Math.floor(punto.lat / CELDA_GRADOS)

    let mejor: TramoInfo | null = null
    let dMin = tolKm

    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        const arr = this.celdas.get(`${i + di}|${j + dj}`)
        if (!arr) continue
        for (const s of arr) {
          const d = distanciaAlSegmentoKm(punto, s.aLat, s.aLng, s.bLat, s.bLng)
          if (d < dMin) { dMin = d; mejor = { ...s.info, km: Math.round(d * 100) / 100 } }
        }
      }
    }
    return mejor
  }

  /**
   * Dibuja la red en el mapa, inerte.
   *
   * Cada tramo va con dos trazos: uno oscuro más grueso abajo y uno claro
   * arriba. Es lo que lo hace legible tanto sobre el satélite como sobre el
   * mapa claro, donde una línea de un solo color siempre se pierde contra uno
   * de los dos fondos.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  montar(Lf: any, map: any) {
    if (this.grupo) return
    asegurarPanelFondo(map)

    const grupo = Lf.layerGroup()
    const comun = { pane: PANE_RED_FONDO, interactive: false }
    for (const t of this.tramos) {
      Lf.polyline(t.puntos, { ...comun, color: '#11161c', weight: 3.2, opacity: 0.5 }).addTo(grupo)
      Lf.polyline(t.puntos, { ...comun, color: '#8fd0ff', weight: 1.3, opacity: 0.85 }).addTo(grupo)
    }
    grupo.addTo(map)
    this.grupo = grupo
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  desmontar(map: any) {
    if (!this.grupo) return
    map.removeLayer(this.grupo)
    this.grupo = null
  }

  get montada(): boolean {
    return this.grupo !== null
  }
}

/**
 * Carga la red una sola vez por sesión.
 *
 * Las cuatro calculadoras usan la misma red y el archivo pesa 8,6 MB: la
 * promesa se comparte para que no se baje ni se indexe cuatro veces.
 */
let cache: Promise<RedFondo> | null = null

export function cargarRedFondo(): Promise<RedFondo> {
  if (!cache) {
    cache = fetch('/geo/geo_cc.json')
      .then(r => r.json())
      .then(j => new RedFondo(j))
      .catch(err => {
        // Un fallo no puede quedar cacheado: sin red el mapa sigue sirviendo
        // para dibujar, y el próximo intento tiene que poder reintentar.
        cache = null
        throw err
      })
  }
  return cache
}

/**
 * Cuántos km mide una tolerancia de `px` píxeles al zoom actual.
 *
 * La tolerancia del hit-test tiene que ser en pantalla, no en terreno: a zoom 8
 * un camino ocupa dos píxeles y 500 m de tolerancia son razonables; a zoom 16
 * esos mismos 500 m agarrarían media ciudad.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toleranciaKm(map: any, px = 12): number {
  const centro = map.getCenter()
  const p = map.latLngToContainerPoint(centro)
  const otro = map.containerPointToLatLng([p.x + px, p.y])
  const dx = (otro.lng - centro.lng) * 111.32 * Math.cos((centro.lat * Math.PI) / 180)
  return Math.abs(dx)
}
