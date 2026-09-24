/**
 * Lluvia **sobre el camino**, no sobre el consorcio.
 *
 * ── Qué problema resuelve ─────────────────────────────────────────────────────
 *
 * Hasta acá la red vial se pintaba con el valor del consorcio al que pertenece,
 * así que un consorcio entero salía de un color solo. Pero un consorcio puede
 * tener 250 km de caminos y una tormenta puede mojar una punta y no la otra: el
 * color uniforme tapaba justamente lo que hay que mirar.
 *
 * Acá cada tramo recibe su propio número, estimado sobre su propia traza. La
 * unidad es la polilínea que se dibuja, que es también la que se exporta y la
 * que se suma en kilómetros. Un tramo puede cruzar la frontera entre dos
 * pluviómetros, y entonces su valor es el promedio **pesado por longitud** de lo
 * estimado a lo largo del recorrido, no el de un punto suelto.
 *
 * ── Qué número lleva cada tramo ───────────────────────────────────────────────
 *
 * Sale del **mismo IDW** que alimenta la tabla por consorcio y las isohietas
 * (`lib/fusion.ts`). A propósito: si el camino se pintara con otro método, el
 * mapa y la tabla se contradirían, y de las dos cosas la que termina en un
 * expediente es el número de la tabla.
 *
 * El polígono de Thiessen queda como **referencia**, no como cálculo: junto al
 * valor viaja de qué pluviómetro lee el tramo y a cuántos km está, que es la
 * pregunta que contesta esa capa. Thiessen como método de cálculo se midió y
 * salió peor (MAE 4,47 contra 3,98), por eso informa pero no manda.
 *
 * ── Por qué se muestrea y no se evalúa vértice por vértice ────────────────────
 *
 * La red tiene 249.209 vértices; con 71 estaciones serían 17,7 millones de
 * distancias en cada cambio de fecha. Se muestrea cada {@link PASO_MUESTRA_KM}
 * km y baja a cerca de un millón, que es instantáneo. No pierde nada: el IDW
 * varía en escala de decenas de km —la longitud de decorrelación de la lluvia
 * acá es 42 km— así que entre dos muestras a 2 km no pasa nada que un camino
 * pueda notar.
 */

import { estimarPunto, distanciaKm, type Medicion, type Procedencia } from './fusion'

/** Cada cuántos km se evalúa el IDW a lo largo de un tramo */
export const PASO_MUESTRA_KM = 2

/** Un tramo de camino tal como se dibuja y se cuenta */
export interface TramoRed {
  /** Número de consorcio */
  cc: number
  /** Designación de la ruta, como viene en el bundle */
  ruta: string
  /** PRIMARIA / SECUNDARIA / … */
  jurisdiccion: string
  /** TIERRA / PAVIMENTO / … */
  material: string
  /** Largo del tramo en km */
  km: number
  /** La traza, en `[lat, lng]` como la quiere Leaflet */
  puntos: [number, number][]
  /** Dónde evaluar el IDW, con cuánto largo representa cada muestra */
  muestras: { lat: number; lng: number; peso: number }[]
}

/** Lo que le tocó de lluvia a un tramo */
export interface LluviaTramo {
  /**
   * Milímetros sobre la parte cubierta del tramo, o `null` si no hay ningún
   * pluviómetro en el radio y por lo tanto no hay dato.
   *
   * **Null no es cero.** Se separan a propósito: un tramo sin cobertura
   * pintado como seco es una afirmación que nadie midió. Es el mismo criterio
   * que las isohietas, donde la zona sin cobertura queda sin pintar.
   */
  mm: number | null
  procedencia: Procedencia
  /**
   * Qué fracción del largo del tramo tiene un pluviómetro dentro del radio.
   *
   * Un tramo puede entrar y salir de la cobertura. Promediar la parte
   * descubierta como si fuera 0 mm diluía el número hacia abajo e inventaba
   * sequía donde sólo faltaba un pluviómetro; por eso el promedio se toma sólo
   * sobre lo cubierto y el resto se informa acá.
   */
  cobertura: number
  /** Pluviómetro de referencia — el más cercano al centro del tramo */
  estacion: string | null
  /** A cuántos km está ese pluviómetro */
  estacionKm: number | null
  /** Cuántos pluviómetros distintos mandan a lo largo del tramo */
  zonas: number
}

/** La red vial por zona, tal como la sirve `public/geo/geo_cc.json` */
export type RedVial = Record<string, {
  features: {
    properties: Record<string, unknown>
    geometry: { type: string; coordinates: number[][][] | number[][] }
  }[]
} | undefined>

const texto = (v: unknown): string =>
  v === null || v === undefined ? '' : String(v).trim()

/**
 * Parte el bundle en tramos dibujables, con sus puntos de muestreo ya resueltos.
 *
 * Es caro —recorre los 249 mil vértices— y no depende de la fecha, así que se
 * hace una sola vez cuando llega el archivo y después se reusa para cada
 * período.
 */
export function extraerTramos(red: RedVial): TramoRed[] {
  const salida: TramoRed[] = []

  for (const zona of Object.values(red)) {
    if (!zona?.features) continue

    for (const f of zona.features) {
      // El bundle trae `CC` como entero, como '07' y como 6.0 según la fila.
      // Los tramos que no son de un consorcio quedan afuera.
      const cc = Number(f.properties?.CC)
      if (!Number.isFinite(cc)) continue

      const ruta = texto(f.properties?.Nm)
      const jurisdiccion = texto(f.properties?.J)
      const material = texto(f.properties?.M)

      const esMulti = f.geometry.type === 'MultiLineString'
      const lineas = (esMulti
        ? f.geometry.coordinates
        : [f.geometry.coordinates]) as number[][][]

      for (const linea of lineas) {
        // GeoJSON viene [lng, lat]; Leaflet espera [lat, lng]
        const puntos = linea.map(p => [p[1], p[0]] as [number, number])
        if (puntos.length < 2) continue

        const { km, muestras } = muestrear(puntos)
        if (km <= 0) continue
        salida.push({ cc, ruta, jurisdiccion, material, km, puntos, muestras })
      }
    }
  }
  return salida
}

/**
 * Camina la traza acumulando largo y suelta una muestra cada `PASO_MUESTRA_KM`.
 *
 * El peso de cada muestra es el largo de recorrido que representa, para que un
 * segmento de 400 m no pese lo mismo que uno de 8 km al promediar. Un tramo más
 * corto que el paso igual devuelve una muestra: su punto medio.
 */
function muestrear(puntos: [number, number][]) {
  const muestras: { lat: number; lng: number; peso: number }[] = []
  let km = 0
  let acumulado = 0
  let desdeUltima = 0
  let latAcum = 0
  let lngAcum = 0

  const soltar = () => {
    if (acumulado <= 0) return
    muestras.push({ lat: latAcum / acumulado, lng: lngAcum / acumulado, peso: acumulado })
    acumulado = 0
    latAcum = 0
    lngAcum = 0
  }

  for (let i = 0; i + 1 < puntos.length; i++) {
    const a = { lat: puntos[i][0], lng: puntos[i][1] }
    const b = { lat: puntos[i + 1][0], lng: puntos[i + 1][1] }
    const d = distanciaKm(a, b)
    if (!Number.isFinite(d) || d === 0) continue
    km += d

    // El punto medio del segmento, pesado por su largo
    const mLat = (a.lat + b.lat) / 2
    const mLng = (a.lng + b.lng) / 2
    acumulado += d
    latAcum += mLat * d
    lngAcum += mLng * d
    desdeUltima += d

    if (desdeUltima >= PASO_MUESTRA_KM) { soltar(); desdeUltima = 0 }
  }
  soltar()

  return { km, muestras }
}

/**
 * Estima la lluvia de cada tramo.
 *
 * `mmModelo` no entra acá: el respaldo del modelo es por consorcio y vive en la
 * tabla `precipitaciones`. Un tramo que no tiene ningún pluviómetro en el radio
 * en ninguna parte de su recorrido devuelve `mm: null` — no hay dato, y decirlo
 * es mejor que pintarlo de seco.
 */
export function lluviaPorTramo(
  tramos: TramoRed[],
  estaciones: (Medicion & { nombre: string })[],
): LluviaTramo[] {
  const peor: Record<Procedencia, number> = {
    medido: 0, interpolado: 1, estimado: 2, sin_parte: 3, sin_calcular: 4,
  }

  return tramos.map(t => {
    let suma = 0
    let cubierto = 0
    let largo = 0
    let procedencia: Procedencia = 'medido'
    let hayCobertura = false
    const cercanas = new Set<string>()

    for (const m of t.muestras) {
      largo += m.peso
      const e = estimarPunto(m, estaciones, null)

      // 'estimado' significa que no había ningún pluviómetro en el radio: esa
      // parte del tramo no aporta al promedio, sólo baja la cobertura.
      if (e.procedencia === 'estimado') continue

      hayCobertura = true
      suma += e.mm * m.peso
      cubierto += m.peso
      if (peor[e.procedencia] > peor[procedencia]) procedencia = e.procedencia

      // De qué pluviómetro lee esta parte del tramo — o sea, en qué polígono
      // de Thiessen cae. Sirve para avisar cuando un tramo cruza la frontera.
      const cerca = masCercana(m, estaciones)
      if (cerca) cercanas.add(cerca.nombre)
    }

    const centro = centroide(t)
    const ref = centro ? masCercana(centro, estaciones) : null

    return {
      mm: hayCobertura ? Math.round((suma / cubierto) * 100) / 100 : null,
      procedencia: hayCobertura ? procedencia : 'estimado',
      cobertura: largo > 0 ? Math.round((cubierto / largo) * 1000) / 1000 : 0,
      estacion: ref?.nombre ?? null,
      estacionKm: ref ? Math.round(ref.km * 10) / 10 : null,
      zonas: cercanas.size,
    }
  })
}

/** El pluviómetro más cercano, sin límite de radio (puede estar lejísimos) */
function masCercana(
  p: { lat: number; lng: number },
  estaciones: (Medicion & { nombre: string })[],
): { nombre: string; km: number } | null {
  let mejor: { nombre: string; km: number } | null = null
  for (const e of estaciones) {
    const d = distanciaKm(p, e)
    if (mejor === null || d < mejor.km) mejor = { nombre: e.nombre, km: d }
  }
  return mejor
}

/** El centro del tramo pesado por longitud */
function centroide(t: TramoRed): { lat: number; lng: number } | null {
  let lat = 0
  let lng = 0
  let peso = 0
  for (const m of t.muestras) { lat += m.lat * m.peso; lng += m.lng * m.peso; peso += m.peso }
  return peso > 0 ? { lat: lat / peso, lng: lng / peso } : null
}

/**
 * Los cortes del resumen por rango, en mm.
 *
 * Son los mismos que usa la escala de color del mapa, para que la frase del
 * resumen y lo que se ve pintado no digan cosas distintas.
 */
export const CORTES_MM = [0, 10, 25, 50, 100]

export interface FilaRango {
  /** Piso del rango en mm, o `null` para la fila de los tramos sin dato */
  desde: number | null
  /** Techo, o null si es el último rango */
  hasta: number | null
  km: number
  tramos: number
}

/**
 * Cuántos km de camino cayeron en cada rango de lluvia.
 *
 * La última fila, con `desde: null`, son los tramos sin ningún pluviómetro en el
 * radio. Va aparte y no en el rango 0–10: esos kilómetros no se midieron secos,
 * no se midieron.
 */
export function kmPorRango(
  tramos: TramoRed[],
  lluvia: LluviaTramo[],
  cc?: number,
): FilaRango[] {
  const filas: FilaRango[] = CORTES_MM.map((desde, i) => ({
    desde: desde as number | null,
    hasta: i + 1 < CORTES_MM.length ? CORTES_MM[i + 1] : null,
    km: 0,
    tramos: 0,
  }))
  const sinDato: FilaRango = { desde: null, hasta: null, km: 0, tramos: 0 }

  for (let i = 0; i < tramos.length; i++) {
    if (cc !== undefined && tramos[i].cc !== cc) continue
    const mm = lluvia[i].mm
    const fila = mm === null
      ? sinDato
      : filas[(() => {
        let k = 0
        while (k + 1 < CORTES_MM.length && mm >= CORTES_MM[k + 1]) k++
        return k
      })()]
    fila.km += tramos[i].km
    fila.tramos++
  }

  return [...filas, sinDato].map(f => ({ ...f, km: Math.round(f.km * 10) / 10 }))
}

/** Cuántos km superaron un umbral. Los tramos sin dato no cuentan. */
export function kmSobre(tramos: TramoRed[], lluvia: LluviaTramo[], mm: number): number {
  let km = 0
  for (let i = 0; i < tramos.length; i++) {
    const v = lluvia[i].mm
    if (v !== null && v >= mm) km += tramos[i].km
  }
  return Math.round(km * 10) / 10
}

/**
 * La lista completa, en CSV.
 *
 * Separador `;` y coma decimal, que es lo que espera un Excel en español. La
 * procedencia va en su propia columna porque un número que se cita tiene que
 * poder decir de dónde sale.
 */
export function csvTramos(
  tramos: TramoRed[],
  lluvia: LluviaTramo[],
  periodo: { desde: string; hasta: string },
): string {
  const num = (x: number, d = 2) => x.toFixed(d).replace('.', ',')
  const filas = [
    `# Lluvia por tramo de camino — ${periodo.desde} a ${periodo.hasta}`,
    '# mm estimados por IDW sobre los pluviometros de la APA (potencia 2, radio 60 km)',
    '# mm vacio = sin pluviometro en el radio; no es cero',
    'consorcio;ruta;jurisdiccion;material;km;mm;cobertura;procedencia;pluviometro_referencia;km_al_pluviometro;pluviometros_en_el_tramo',
  ]
  for (let i = 0; i < tramos.length; i++) {
    const t = tramos[i]
    const l = lluvia[i]
    filas.push([
      t.cc,
      t.ruta,
      t.jurisdiccion,
      t.material,
      num(t.km, 3),
      l.mm === null ? '' : num(l.mm),
      num(l.cobertura * 100, 0),
      l.procedencia,
      l.estacion ?? '',
      l.estacionKm === null ? '' : num(l.estacionKm, 1),
      l.zonas,
    ].join(';'))
  }
  return filas.join('\n')
}
