/**
 * La red vial y las obras de arte, repartidas por cuenca hídrica.
 *
 * Es el cruce que le faltaba a la tabla por cuenca para hablar de caminos: no
 * sólo cuánta lámina recibió la cuenca, sino **cuántos kilómetros de red hay
 * adentro, cuántos recibieron esa lluvia, y qué puentes y alcantarillas están
 * ahí**.
 *
 * Dos universos distintos, y conviene no mezclarlos al leer:
 *
 * - **La red** es la de `geo_cc.json`: la traza de los caminos de consorcio,
 *   completa salvo los huecos conocidos (CC 96 y CC 49).
 * - **Las obras de arte** son las que **se relevaron** con la app móvil. No es
 *   un inventario: una cuenca con tres alcantarillas relevadas puede tener
 *   trescientas. El número dice qué se conoce, no qué existe.
 *
 * Acá no hay React ni red: entra geometría, lluvia y puntos, sale una tabla.
 */

import { estimarPunto, type Medicion } from './fusion'
import { cuencaEn, dentroDe, type Cuenca } from './cuencas'
import { distanciaAlSegmentoKm } from './redFondo'
import { CORTES_MM, type LluviaTramo, type TramoRed } from './redLluvia'

/**
 * Los umbrales para contar kilómetros: los mismos cortes del mapa, sin el cero.
 * "km que recibieron 50 mm o más" se lee contra el color del camino.
 */
export const UMBRALES_KM = CORTES_MM.filter(c => c > 0)

/**
 * A qué cuenca pertenece cada muestra de cada tramo: el índice en `cuencas`, o
 * -1 si cae fuera de todas.
 *
 * **Se reparte por muestra y no por tramo.** Un tramo largo cruza de una cuenca
 * a otra, y asignarlo entero a una sola le regalaría kilómetros que no tiene.
 * Las muestras ya existen —una cada 2 km, con el largo que representan— y son
 * las mismas que usa el IDW de la red, así que no hay geometría nueva.
 *
 * No depende de la fecha: se calcula una vez y se reusa.
 *
 * ── Los caminos del borde ─────────────────────────────────────────────────────
 *
 * El contorno de las cuencas no es el límite provincial: corre unos cientos de
 * metros por adentro. Y sobre el límite hay caminos —las picadas limítrofes—,
 * así que con la contención a secas **483 km de red quedaban fuera de todas las
 * cuencas**. Se midió dónde estaban: 473 a menos de 1 km del límite provincial,
 * y ninguno en un hueco entre dos cuencas.
 *
 * Esos caminos son de la cuenca de al lado, así que una muestra que no cae
 * adentro de ninguna se asigna a la más cercana si está a menos de
 * {@link TOLERANCIA_BORDE_KM}. Más lejos que eso queda afuera de verdad.
 */
export const TOLERANCIA_BORDE_KM = 1

export function cuencaDeMuestras(cuencas: Cuenca[], tramos: TramoRed[]): Int8Array[] {
  const indice = new Map(cuencas.map((c, i) => [c.cod, i]))
  /** La última cuenca en la que cayó una muestra: la siguiente casi siempre repite */
  let ultima = -1

  const adentro = (j: number, lat: number, lng: number) => {
    const c = cuencas[j]
    return lat >= c.caja[0] && lat <= c.caja[2] && lng >= c.caja[1] && lng <= c.caja[3]
      && c.partes.some(p => dentroDe(p, lat, lng))
  }

  return tramos.map(t => {
    const out = new Int8Array(t.muestras.length)
    for (let k = 0; k < t.muestras.length; k++) {
      const { lat, lng } = t.muestras[k]
      if (ultima >= 0 && adentro(ultima, lat, lng)) { out[k] = ultima; continue }

      const c = cuencaEn(cuencas, lat, lng)
      if (c) { ultima = indice.get(c.cod)!; out[k] = ultima; continue }
      out[k] = masCercana(cuencas, lat, lng)
    }
    return out
  })
}

/** La cuenca cuyo borde está a menos de la tolerancia, o -1 */
function masCercana(cuencas: Cuenca[], lat: number, lng: number): number {
  // La tolerancia en grados, con margen, para descartar por caja sin medir
  const margen = (TOLERANCIA_BORDE_KM / 111.32) * 1.5
  let mejor = -1, mejorD = TOLERANCIA_BORDE_KM

  for (let j = 0; j < cuencas.length; j++) {
    const c = cuencas[j]
    if (lat < c.caja[0] - margen || lat > c.caja[2] + margen
      || lng < c.caja[1] - margen || lng > c.caja[3] + margen) continue
    for (const p of c.partes) {
      for (let i = 0; i + 1 < p.length; i++) {
        const d = distanciaAlSegmentoKm({ lat, lng }, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1])
        if (d < mejorD) { mejorD = d; mejor = j }
      }
    }
  }
  return mejor
}

/** La red de una cuenca y la lluvia que recibió */
export interface RedDeCuenca {
  cod: number
  nombre: string
  /** Km de traza de la red de consorcios dentro de la cuenca */
  km: number
  /** De esos, cuántos son de tierra */
  kmTierra: number
  /** Km sin ningún pluviómetro en el radio: no se midieron secos, no se midieron */
  kmSinDato: number
  /** Km que recibieron al menos cada umbral de {@link UMBRALES_KM}, en ese orden */
  kmDesde: number[]
}

/** ¿Es de tierra? El campo viene cargado a mano: TIERRA, Tierra, tierra… */
const esTierra = (material: string) => /tierra/i.test(material)

const r1 = (x: number) => Math.round(x * 10) / 10

/**
 * Reparte la red entre las cuencas.
 *
 * La lluvia de cada muestra es **la de su tramo** —el número que pinta el mapa
 * y el que va al CSV— y no un IDW nuevo en la muestra. Así la suma de las
 * cuencas más lo que cae fuera de todas es exactamente `kmSobre` de la red
 * entera: las dos tablas no pueden decir números distintos.
 *
 * La última fila, con `cod: 0`, es la red que cae fuera de todas las cuencas
 * aun con la tolerancia del borde. Con la red de hoy es menos de 1 km; la fila
 * existe para que, si algún día crece, se vea en vez de perderse.
 */
export function redPorCuenca(
  cuencas: Cuenca[],
  tramos: TramoRed[],
  lluvia: LluviaTramo[],
  asignacion: Int8Array[],
): RedDeCuenca[] {
  const vacia = (cod: number, nombre: string): RedDeCuenca => ({
    cod, nombre, km: 0, kmTierra: 0, kmSinDato: 0, kmDesde: UMBRALES_KM.map(() => 0),
  })
  const filas = cuencas.map(c => vacia(c.cod, c.nombre))
  const afuera = vacia(0, 'Fuera de las cuencas')

  for (let i = 0; i < tramos.length; i++) {
    const t = tramos[i]
    const mm = lluvia[i]?.mm ?? null
    const tierra = esTierra(t.material)

    for (let k = 0; k < t.muestras.length; k++) {
      const j = asignacion[i][k]
      const f = j >= 0 ? filas[j] : afuera
      const peso = t.muestras[k].peso
      f.km += peso
      if (tierra) f.kmTierra += peso
      if (mm === null) { f.kmSinDato += peso; continue }
      for (let u = 0; u < UMBRALES_KM.length; u++) if (mm >= UMBRALES_KM[u]) f.kmDesde[u] += peso
    }
  }

  const redondear = (f: RedDeCuenca): RedDeCuenca => ({
    ...f, km: r1(f.km), kmTierra: r1(f.kmTierra), kmSinDato: r1(f.kmSinDato), kmDesde: f.kmDesde.map(r1),
  })
  return [...filas, afuera].map(redondear)
}

// ── Obras de arte ────────────────────────────────────────────────────────────

/** Los tipos de relevamiento que son obras de drenaje, en el orden en que se muestran */
export const TIPOS_OBRA = ['Puente', 'Alcantarilla', 'Tubos'] as const
export type TipoObra = typeof TIPOS_OBRA[number]

/** Una obra de arte relevada, tal como la entrega la ruta */
export interface ObraRelevada {
  id: string
  tipo: TipoObra
  lat: number
  lng: number
  /** Ruta o tramo que anotó el técnico; puede venir vacío */
  rutaTramo: string | null
  fecha: string | null
}

/** Una obra con la lluvia que recibió en el período */
export interface ObraConLluvia extends ObraRelevada {
  /** Lámina en el punto, en mm; `null` si no hay pluviómetro en el radio */
  mm: number | null
}

export interface ObrasDeCuenca {
  cod: number
  nombre: string
  /** Cuántas hay de cada tipo, en el orden de {@link TIPOS_OBRA} */
  cuenta: number[]
  /** Todas, de la que más lluvia recibió a la que menos; las sin dato al final */
  obras: ObraConLluvia[]
}

/**
 * Las obras de arte relevadas de cada cuenca, con la lámina que recibió cada una.
 *
 * La lámina es el IDW de siempre **en el punto de la obra**. Es la lluvia que
 * cayó ahí, no el agua que le llega: eso depende de la cuenca de aporte de cada
 * alcantarilla, que no se conoce sin un modelo de elevación. Sirve para ordenar
 * por dónde llovió más, no para decir cuál trabajó al límite.
 *
 * Sin mediciones todas van con `mm: null` y la cuenta sigue siendo válida: qué
 * obras hay en cada cuenca no depende de la lluvia.
 *
 * La última fila, con `cod: 0`, son las obras que caen fuera de todas las cuencas.
 */
export function obrasPorCuenca(
  cuencas: Cuenca[],
  obras: ObraRelevada[],
  mediciones: Medicion[],
): ObrasDeCuenca[] {
  const vacia = (cod: number, nombre: string): ObrasDeCuenca =>
    ({ cod, nombre, cuenta: TIPOS_OBRA.map(() => 0), obras: [] })
  const filas = new Map(cuencas.map(c => [c.cod, vacia(c.cod, c.nombre)]))
  const afuera = vacia(0, 'Fuera de las cuencas')

  for (const o of obras) {
    const t = TIPOS_OBRA.indexOf(o.tipo)
    if (t < 0 || !Number.isFinite(o.lat) || !Number.isFinite(o.lng)) continue

    // Con la misma tolerancia que la red: un puente sobre un camino del límite
    // es de la cuenca de al lado, igual que el camino.
    const c = cuencaEn(cuencas, o.lat, o.lng) ?? cuencas[masCercana(cuencas, o.lat, o.lng)]
    const f = c ? filas.get(c.cod)! : afuera
    f.cuenta[t]++

    let mm: number | null = null
    if (mediciones.length > 0) {
      const e = estimarPunto(o, mediciones, null)
      // 'estimado' es el respaldo del modelo, que acá no hay
      if (e.procedencia !== 'estimado') mm = e.mm
    }
    f.obras.push({ ...o, mm })
  }

  const salida = [...filas.values(), afuera]
  for (const f of salida) f.obras.sort((a, b) => (b.mm ?? -1) - (a.mm ?? -1) || a.id.localeCompare(b.id))
  return salida
}

/** La red por cuenca como CSV, con punto y coma y coma decimal */
export function csvRedCuencas(
  red: RedDeCuenca[],
  obras: ObrasDeCuenca[] | null,
  rango: { desde: string; hasta: string },
): string {
  const n = (v: number) => v.toFixed(1).replace('.', ',')
  const porCod = new Map((obras ?? []).map(o => [o.cod, o]))
  const lineas = [
    `Red vial y obras de arte por cuenca;${rango.desde};${rango.hasta}`,
    'Km de traza de la red de consorcios; las obras de arte son las relevadas, no un inventario',
    '',
    ['Cod', 'Cuenca', 'Red km', 'De tierra km', 'Sin dato km',
      ...UMBRALES_KM.map(u => `Con ${u} mm o mas km`),
      ...(obras ? TIPOS_OBRA.map(t => `${t} relevados`) : [])].join(';'),
    ...red.map(f => [
      f.cod || '', f.nombre, n(f.km), n(f.kmTierra), n(f.kmSinDato), ...f.kmDesde.map(n),
      ...(obras ? (porCod.get(f.cod)?.cuenta ?? TIPOS_OBRA.map(() => 0)) : []),
    ].join(';')),
  ]
  return lineas.join('\r\n')
}
