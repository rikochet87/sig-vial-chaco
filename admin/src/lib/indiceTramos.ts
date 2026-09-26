/**
 * Índice espacial sobre los tramos ya extraídos, para saber cuál está bajo el
 * cursor en el mapa de Lluvias.
 *
 * ── Por qué no se reusa `RedFondo` ────────────────────────────────────────────
 *
 * `lib/redFondo.ts` hace algo parecido en los mapas de las calculadoras, pero
 * indexa el **GeoJSON crudo** que se baja aparte. Acá los tramos ya están
 * partidos y con la lluvia calculada —los produce `redLluvia`—, así que
 * reusarlo significaría bajar y recorrer los 8,6 MB **una segunda vez** para
 * llegar a los mismos 9.743 tramos que ya están en memoria. Este índice se arma
 * sobre lo que ya hay.
 *
 * Lo que sí se reusa son las dos piezas de geometría de `redFondo`, que están
 * verificadas contra fuerza bruta: `distanciaAlSegmentoKm` y `toleranciaKm`.
 *
 * ── La grilla ─────────────────────────────────────────────────────────────────
 *
 * Misma idea que allá: celdas de 0,05° (~5 km) y una consulta mira la celda del
 * cursor más sus ocho vecinas. **La celda tiene que ser más grande que la
 * tolerancia** o mirar las ocho vecinas no alcanzaría para garantizar que no se
 * escapa un tramo cercano.
 *
 * Se indexa **por segmento y no por tramo**: un tramo de 50 km cruza muchas
 * celdas, y meterlo entero en la celda de su primer vértice lo haría invisible
 * en casi todo su recorrido.
 */

import { CELDA_GRADOS, distanciaAlSegmentoKm } from './redFondo'
import type { TramoRed } from './redLluvia'

/** Un segmento de una traza, apuntando al tramo del que salió */
interface Segmento {
  /** Índice en el arreglo de tramos que se indexó */
  tramo: number
  aLat: number; aLng: number
  bLat: number; bLng: number
}

const clave = (lat: number, lng: number) =>
  `${Math.floor(lat / CELDA_GRADOS)}|${Math.floor(lng / CELDA_GRADOS)}`

export class IndiceTramos {
  private celdas = new Map<string, Segmento[]>()

  constructor(tramos: TramoRed[]) {
    for (let t = 0; t < tramos.length; t++) {
      const pts = tramos[t].puntos
      for (let i = 0; i + 1 < pts.length; i++) {
        const [aLat, aLng] = pts[i]
        const [bLat, bLng] = pts[i + 1]
        const seg: Segmento = { tramo: t, aLat, aLng, bLat, bLng }

        // El segmento se registra en todas las celdas que tocan sus extremos.
        // Con segmentos de pocos cientos de metros y celdas de 5 km, alcanza:
        // un segmento más largo que la celda es un caso que la red no tiene.
        const enA = clave(aLat, aLng)
        const enB = clave(bLat, bLng)
        this.push(enA, seg)
        if (enB !== enA) this.push(enB, seg)
      }
    }
  }

  private push(k: string, s: Segmento) {
    const lista = this.celdas.get(k)
    if (lista) lista.push(s)
    else this.celdas.set(k, [s])
  }

  /** Cuántas celdas ocupadas tiene el índice — sólo para los tests */
  get celdasOcupadas(): number { return this.celdas.size }

  /**
   * Qué tramo hay bajo un punto, y a qué distancia.
   *
   * Devuelve `null` si no hay ninguno dentro de la tolerancia: no inventa el
   * más cercano, porque el cursor lejos de todo camino tiene que no decir nada.
   */
  tramoEn(
    punto: { lat: number; lng: number },
    tolKm: number,
  ): { indice: number; km: number } | null {
    const fLat = Math.floor(punto.lat / CELDA_GRADOS)
    const fLng = Math.floor(punto.lng / CELDA_GRADOS)

    let mejor: { indice: number; km: number } | null = null
    const vistos = new Set<Segmento>()

    for (let dLat = -1; dLat <= 1; dLat++) {
      for (let dLng = -1; dLng <= 1; dLng++) {
        const lista = this.celdas.get(`${fLat + dLat}|${fLng + dLng}`)
        if (!lista) continue
        for (const s of lista) {
          // Un segmento puede estar en dos celdas vecinas: no se mide dos veces
          if (vistos.has(s)) continue
          vistos.add(s)
          const d = distanciaAlSegmentoKm(punto, s.aLat, s.aLng, s.bLat, s.bLng)
          if (d <= tolKm && (mejor === null || d < mejor.km)) {
            mejor = { indice: s.tramo, km: d }
          }
        }
      }
    }
    return mejor
  }
}
