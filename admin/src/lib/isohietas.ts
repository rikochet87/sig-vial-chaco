/**
 * Isohietas: curvas de igual precipitación sobre la provincia.
 *
 * Una isohieta es el contorno de nivel del campo de lluvia, y ese campo es el
 * mismo que ya calcula `fusion.ts` para los consorcios — mismo IDW, misma
 * potencia, mismo radio. Eso no es pereza: si el mapa se dibujara con otro
 * método, las curvas y los números de la tabla se contradirían, y de las dos
 * cosas la que se va a citar en un expediente es el número.
 *
 * El procedimiento es el clásico:
 *
 *   1. evaluar el campo en una grilla regular              → `calcularGrilla`
 *   2. extraer el contorno de cada nivel con marching squares → `curvasDeNivel`
 *
 * ── Dos cosas que hay que mirar con desconfianza ──────────────────────────────
 *
 * **Ojos de buey.** El IDW produce círculos concéntricos alrededor de cada
 * pluviómetro: es el artefacto característico del método, no un patrón
 * meteorológico. Con potencia 2 se nota. Quien lea el mapa tiene que saber que
 * son curvas interpoladas automáticamente, no un análisis trazado a mano.
 *
 * **Afuera del radio no se dibuja nada.** Los nodos a más de `RADIO_KM` de toda
 * estación quedan en `NaN` y ninguna curva los cruza. Sin eso el mapa mostraría
 * isohietas prolijas sobre el Impenetrable, donde el pluviómetro más cercano
 * está a cien kilómetros. Un hueco visible es información; una curva inventada
 * es una mentira con aspecto de dato.
 */

import { distanciaKm, POTENCIA, RADIO_KM, type Medicion } from './fusion'

/** Campo evaluado en una grilla regular en grados */
export interface Grilla {
  /** Columnas y filas */
  nx: number
  ny: number
  /** Esquina suroeste */
  lat0: number
  lng0: number
  /** Paso en grados */
  dLat: number
  dLng: number
  /** `nx · ny` valores, fila por fila de sur a norte. NaN = sin cobertura */
  valores: Float32Array
  /** El máximo del campo, para elegir los niveles */
  max: number
}

/** Paso por defecto de la grilla, en km. 5 km sobre el Chaco son ~10.000 nodos. */
export const PASO_KM = 5

/**
 * Evalúa el campo en una grilla que cubre las estaciones más un margen.
 *
 * El margen es el radio de búsqueda: más allá de eso todo sería NaN igual, así
 * que agrandar la grilla sólo gastaría cálculo.
 */
export function calcularGrilla(mediciones: Medicion[], pasoKm = PASO_KM): Grilla | null {
  if (mediciones.length === 0) return null

  const lats = mediciones.map(m => m.lat)
  const lngs = mediciones.map(m => m.lng)
  const latMedia = (Math.min(...lats) + Math.max(...lats)) / 2

  // Un grado de latitud son 111,32 km; uno de longitud, menos según la latitud
  const kmPorGradoLng = 111.32 * Math.cos((latMedia * Math.PI) / 180)
  const margenLat = RADIO_KM / 111.32
  const margenLng = RADIO_KM / kmPorGradoLng

  const lat0 = Math.min(...lats) - margenLat
  const lat1 = Math.max(...lats) + margenLat
  const lng0 = Math.min(...lngs) - margenLng
  const lng1 = Math.max(...lngs) + margenLng

  const dLat = pasoKm / 111.32
  const dLng = pasoKm / kmPorGradoLng
  const nx = Math.max(2, Math.ceil((lng1 - lng0) / dLng) + 1)
  const ny = Math.max(2, Math.ceil((lat1 - lat0) / dLat) + 1)

  const valores = new Float32Array(nx * ny)
  let max = 0

  for (let j = 0; j < ny; j++) {
    const lat = lat0 + j * dLat
    for (let i = 0; i < nx; i++) {
      const lng = lng0 + i * dLng
      const v = idwEnPunto({ lat, lng }, mediciones)
      valores[j * nx + i] = v
      if (!Number.isNaN(v) && v > max) max = v
    }
  }

  return { nx, ny, lat0, lng0, dLat, dLng, valores, max }
}

/** IDW puro: NaN si no hay ninguna estación dentro del radio */
function idwEnPunto(p: { lat: number; lng: number }, mediciones: Medicion[]): number {
  let num = 0
  let den = 0
  for (const m of mediciones) {
    const d = distanciaKm(p, m)
    if (d > RADIO_KM) continue
    // Encima de la estación es su valor; además evita dividir por cero
    if (d < 0.001) return m.mm
    const w = 1 / Math.pow(d, POTENCIA)
    num += w * m.mm
    den += w
  }
  return den > 0 ? num / den : NaN
}

/**
 * Niveles "redondos" para rotular.
 *
 * Se apunta a unas seis curvas: más que eso y el mapa se vuelve ilegible, menos
 * y no se distingue la forma de la tormenta. El paso sale de la escala del
 * evento — 5 mm para una llovizna, 50 para un temporal— y siempre es un número
 * que alguien diría en voz alta.
 */
export function nivelesSugeridos(max: number, cuantos = 6): number[] {
  if (!Number.isFinite(max) || max <= 0) return []
  const PASOS = [1, 2, 5, 10, 20, 25, 50, 100, 200]
  const ideal = max / cuantos
  const paso = PASOS.find(p => p >= ideal) ?? PASOS[PASOS.length - 1]

  const niveles: number[] = []
  for (let v = paso; v < max; v += paso) niveles.push(Math.round(v * 100) / 100)
  return niveles
}

/**
 * Curvas de nivel por marching squares.
 *
 * Recorre cada celda de la grilla, mira cuáles de sus cuatro esquinas superan el
 * nivel e interpola sobre las aristas donde la curva la cruza. Después une los
 * segmentos sueltos en polilíneas, que es lo que Leaflet quiere dibujar y lo que
 * permite rotular una curva una sola vez en vez de mil.
 *
 * Una celda con alguna esquina en NaN se saltea entera: es el borde de la zona
 * sin pluviómetros y la curva tiene que morir ahí.
 */
export function curvasDeNivel(g: Grilla, nivel: number): [number, number][][] {
  const segmentos: [[number, number], [number, number]][] = []

  const xy = (i: number, j: number): [number, number] =>
    [g.lat0 + j * g.dLat, g.lng0 + i * g.dLng]

  /** Punto donde la curva corta el segmento entre dos nodos */
  const cortar = (
    a: [number, number], va: number, b: [number, number], vb: number,
  ): [number, number] => {
    const t = (nivel - va) / (vb - va)
    return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]
  }

  for (let j = 0; j < g.ny - 1; j++) {
    for (let i = 0; i < g.nx - 1; i++) {
      // Esquinas en sentido antihorario desde la inferior izquierda
      const v0 = g.valores[j * g.nx + i]
      const v1 = g.valores[j * g.nx + i + 1]
      const v2 = g.valores[(j + 1) * g.nx + i + 1]
      const v3 = g.valores[(j + 1) * g.nx + i]
      if (Number.isNaN(v0) || Number.isNaN(v1) || Number.isNaN(v2) || Number.isNaN(v3)) continue

      const caso = (v0 > nivel ? 1 : 0) | (v1 > nivel ? 2 : 0)
                 | (v2 > nivel ? 4 : 0) | (v3 > nivel ? 8 : 0)
      if (caso === 0 || caso === 15) continue

      const p0 = xy(i, j), p1 = xy(i + 1, j), p2 = xy(i + 1, j + 1), p3 = xy(i, j + 1)
      const abajo  = () => cortar(p0, v0, p1, v1)
      const derecha = () => cortar(p1, v1, p2, v2)
      const arriba = () => cortar(p3, v3, p2, v2)
      const izquierda = () => cortar(p0, v0, p3, v3)

      switch (caso) {
        case 1: case 14: segmentos.push([izquierda(), abajo()]); break
        case 2: case 13: segmentos.push([abajo(), derecha()]); break
        case 3: case 12: segmentos.push([izquierda(), derecha()]); break
        case 4: case 11: segmentos.push([derecha(), arriba()]); break
        case 6: case 9:  segmentos.push([abajo(), arriba()]); break
        case 7: case 8:  segmentos.push([izquierda(), arriba()]); break
        // Casos ambiguos: la celda tiene dos esquinas altas en diagonal y la
        // curva puede pasar de dos maneras. Se resuelve por el promedio del
        // centro, que es la convención habitual.
        case 5: {
          const centro = (v0 + v1 + v2 + v3) / 4
          if (centro > nivel) {
            segmentos.push([izquierda(), arriba()]); segmentos.push([abajo(), derecha()])
          } else {
            segmentos.push([izquierda(), abajo()]); segmentos.push([derecha(), arriba()])
          }
          break
        }
        case 10: {
          const centro = (v0 + v1 + v2 + v3) / 4
          if (centro > nivel) {
            segmentos.push([izquierda(), abajo()]); segmentos.push([derecha(), arriba()])
          } else {
            segmentos.push([izquierda(), arriba()]); segmentos.push([abajo(), derecha()])
          }
          break
        }
      }
    }
  }

  return unir(segmentos)
}

/**
 * Une segmentos sueltos en polilíneas encadenando por extremos coincidentes.
 *
 * Los extremos se redondean para poder usarlos de clave: dos segmentos vecinos
 * calcularon el mismo corte con la misma aritmética, así que caen en el mismo
 * valor, pero conviene no depender de la igualdad exacta de punto flotante.
 */
function unir(segmentos: [[number, number], [number, number]][]): [number, number][][] {
  const clave = (p: [number, number]) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`
  const porExtremo = new Map<string, number[]>()
  segmentos.forEach((s, k) => {
    for (const p of s) {
      const c = clave(p)
      const a = porExtremo.get(c) ?? []
      a.push(k)
      porExtremo.set(c, a)
    }
  })

  const usado = new Array<boolean>(segmentos.length).fill(false)
  const curvas: [number, number][][] = []

  for (let k = 0; k < segmentos.length; k++) {
    if (usado[k]) continue
    usado[k] = true
    const linea: [number, number][] = [segmentos[k][0], segmentos[k][1]]

    // Estirar por los dos extremos hasta que no haya con qué seguir
    for (const alFinal of [true, false]) {
      for (;;) {
        const punta = alFinal ? linea[linea.length - 1] : linea[0]
        const vecinos = porExtremo.get(clave(punta)) ?? []
        const sig = vecinos.find(v => !usado[v])
        if (sig == null) break
        usado[sig] = true
        const [a, b] = segmentos[sig]
        const otro = clave(a) === clave(punta) ? b : a
        if (alFinal) linea.push(otro)
        else linea.unshift(otro)
      }
    }

    // Un segmento suelto en el borde de la zona sin datos no es una curva
    if (linea.length >= 3) curvas.push(linea)
  }

  return curvas
}
