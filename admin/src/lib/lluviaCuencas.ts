/**
 * Precipitación media areal por cuenca hídrica.
 *
 * Es el cálculo para el que existe el concepto: una cuenca es una superficie
 * que recibe la lluvia entera, y lo que se pregunta es cuánta lámina cayó sobre
 * ella y —multiplicando por su área— cuánta agua es eso.
 *
 * Se calcula por **dos caminos independientes**, igual que a nivel provincia:
 *
 * - **IDW** — se evalúa el mismo IDW que el resto de la pantalla en una grilla
 *   de puntos adentro de la cuenca y se promedia. Es el número que manda, por
 *   el mismo motivo que en la tabla de consorcios: midió mejor.
 * - **Thiessen por superficie** — el método de manual, con la tabla de pesos al
 *   lado. Acá es el literal: el peso de cada pluviómetro son los km² de su
 *   polígono dentro de la cuenca.
 *
 * Que sean dos no es redundancia. Uno muestrea puntos y el otro recorta
 * polígonos: no comparten ni una línea de geometría, así que si los dos dicen
 * que la cuenca tiene 62 % de cobertura, ese 62 % está bien calculado.
 *
 * **No hay respaldo del modelo.** Donde no hay pluviómetro a menos de
 * {@link RADIO_KM} no hay dato, y esa parte de la cuenca queda afuera del
 * promedio y se informa en `cobertura`. Mismo criterio que `mm: null` en
 * `redLluvia`: promediarla como 0 mm inventaría sequía.
 *
 * Acá no hay React ni red: entra geometría y mediciones, sale una tabla.
 */

import { estimarPunto, RADIO_KM } from './fusion'
import { arealPorPartes, type MediaAreal, type MedicionConNombre } from './thiessenAreal'
import type { Cuenca } from './cuencas'

/**
 * Separación de la grilla de muestreo, en km.
 *
 * Con 2,5 km cada punto representa 6,25 km²: la cuenca más chica (Quiá, 931
 * km²) tiene unos 150 puntos y la provincia entera unos 16.000, que contra 71
 * pluviómetros son un millón de distancias — nada. No hace falta más fino: la
 * longitud de decorrelación de la lluvia acá es de 42 km.
 */
export const PASO_KM = 2.5

export interface Muestra { lat: number; lng: number }

/**
 * Los puntos de la grilla que caen adentro de la cuenca.
 *
 * Se resuelve por barrido: para cada fila de la grilla se calculan los cruces
 * con el borde y se rellenan los tramos interiores. Probar punto por punto
 * contra un borde de 2.400 vértices serían decenas de millones de operaciones;
 * así es una pasada por el borde por fila.
 *
 * El paso en longitud se calcula **por fila**, con la latitud de esa fila, para
 * que cada punto represente la misma superficie en toda la cuenca y el promedio
 * simple de los puntos sea un promedio por área.
 *
 * No depende de la fecha: se calcula una vez por cuenca y se reusa.
 */
export function muestrasDe(cuenca: Cuenca, pasoKm = PASO_KM): Muestra[] {
  const dLat = pasoKm / 111.32
  const out: Muestra[] = []

  // La grilla se ancla a múltiplos del paso, no al borde de cada cuenca: así
  // dos cuencas vecinas comparten grilla y ningún punto cae en las dos.
  const fila0 = Math.ceil(cuenca.caja[0] / dLat)
  const filaN = Math.floor(cuenca.caja[2] / dLat)

  for (let f = fila0; f <= filaN; f++) {
    const lat = f * dLat
    const dLng = pasoKm / (111.32 * Math.cos((lat * Math.PI) / 180))

    for (const parte of cuenca.partes) {
      const cruces: number[] = []
      for (let i = 0, j = parte.length - 1; i < parte.length; j = i++) {
        const [latI, lngI] = parte[i], [latJ, lngJ] = parte[j]
        if ((latI > lat) !== (latJ > lat)) {
          cruces.push(((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI)
        }
      }
      cruces.sort((a, b) => a - b)
      for (let c = 0; c + 1 < cruces.length; c += 2) {
        for (let k = Math.ceil(cruces[c] / dLng); k * dLng < cruces[c + 1]; k++) {
          out.push({ lat, lng: k * dLng })
        }
      }
    }
  }

  // Una cuenca más angosta que el paso podría quedar sin ningún punto, y
  // entonces no tendría lámina. Se le da uno, que es mejor que ninguno.
  if (out.length === 0) out.push({ lat: cuenca.rotulo[0], lng: cuenca.rotulo[1] })
  return out
}

/** La lluvia de una cuenca en un período */
export interface LaminaCuenca {
  cod: number
  nombre: string
  /** Superficie declarada en el origen, en km² */
  km2: number
  /**
   * Lámina media por IDW sobre la parte cubierta, en mm; `null` si ningún punto
   * de la cuenca tiene pluviómetro en el radio.
   */
  mm: number | null
  /** El punto de la cuenca que más recibió, en mm */
  mmMax: number | null
  /** Fracción de la cuenca con pluviómetro en el radio, en tanto por uno */
  cobertura: number
  /** Cuántos puntos de grilla tiene la cuenca */
  puntos: number
  /** El método de manual, con el desglose de pesos */
  thiessen: MediaAreal
  /**
   * Volumen precipitado **sobre la parte cubierta**, en hm³ (millones de m³):
   * lámina × superficie cubierta. Un milímetro sobre un km² son mil m³.
   */
  hm3: number | null
}

const redondear = (x: number, n = 2) => {
  const f = 10 ** n
  return Math.round(x * f) / f
}

/**
 * La lámina de cada cuenca.
 *
 * `muestras` es lo que devolvió {@link muestrasDe} para cada una, en el mismo
 * orden: se pasa de afuera porque no cambia con la fecha y esto sí.
 */
export function laminaPorCuenca(
  cuencas: Cuenca[],
  muestras: Muestra[][],
  mediciones: MedicionConNombre[],
): LaminaCuenca[] {
  return cuencas.map((c, i) => {
    const pts = muestras[i] ?? []
    let suma = 0, cubiertos = 0, max = -Infinity

    for (const p of pts) {
      const e = estimarPunto(p, mediciones, null)
      // 'estimado' es el respaldo del modelo, que acá no hay: sin pluviómetro
      // en el radio el punto no tiene dato.
      if (e.procedencia === 'estimado') continue
      suma += e.mm
      cubiertos++
      if (e.mm > max) max = e.mm
    }

    const km2 = c.ha / 100
    const mm = cubiertos > 0 ? suma / cubiertos : null
    const cobertura = pts.length > 0 ? cubiertos / pts.length : 0

    return {
      cod: c.cod,
      nombre: c.nombre,
      km2,
      mm: mm === null ? null : redondear(mm),
      mmMax: cubiertos > 0 ? redondear(max) : null,
      cobertura: redondear(cobertura, 4),
      puntos: pts.length,
      // Thiessen quiere los anillos en [lng, lat]
      thiessen: arealPorPartes(mediciones, c.partes.map(p => p.map(([lat, lng]) => [lng, lat] as [number, number]))),
      hm3: mm === null ? null : redondear((mm * km2 * cobertura) / 1000, 1),
    }
  })
}

/** El total de la provincia: lámina pesada por superficie cubierta, y volumen */
export function totalCuencas(filas: LaminaCuenca[]): {
  km2: number; mm: number | null; cobertura: number; hm3: number | null
} {
  let km2 = 0, cubierto = 0, agua = 0
  for (const f of filas) {
    km2 += f.km2
    if (f.mm === null) continue
    cubierto += f.km2 * f.cobertura
    agua += f.mm * f.km2 * f.cobertura
  }
  return {
    km2,
    mm: cubierto > 0 ? redondear(agua / cubierto) : null,
    cobertura: km2 > 0 ? redondear(cubierto / km2, 4) : 0,
    hm3: cubierto > 0 ? redondear(agua / 1000, 1) : null,
  }
}

/** La tabla como CSV, con punto y coma y coma decimal para Excel en español */
export function csvCuencas(filas: LaminaCuenca[], rango: { desde: string; hasta: string }): string {
  const n = (v: number | null, dec = 1) => (v === null ? '' : v.toFixed(dec).replace('.', ','))
  const lineas = [
    `Precipitación media areal por cuenca;${rango.desde};${rango.hasta}`,
    `Lámina por IDW (potencia 2, radio ${RADIO_KM} km) sobre grilla de ${String(PASO_KM).replace('.', ',')} km; Thiessen pesado por superficie`,
    '',
    'Cod;Cuenca;Superficie km2;Lamina IDW mm;Lamina Thiessen mm;Lamina maxima mm;Cobertura %;Volumen hm3;Pluviometros',
    ...filas.map(f => [
      f.cod, f.nombre, n(f.km2, 0), n(f.mm), n(f.thiessen.mm), n(f.mmMax),
      n(f.cobertura * 100), n(f.hm3), f.thiessen.aportes.length,
    ].join(';')),
  ]
  return lineas.join('\r\n')
}
