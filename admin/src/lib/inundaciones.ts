/**
 * Las áreas inundables del Gran Resistencia, para la pestaña de Hidrología.
 *
 * ── Qué es y qué no ──────────────────────────────────────────────────────────
 *
 * Son **observaciones**: dónde hubo agua en las fechas en que pasó un satélite,
 * ordenadas por la altura que tenía el río en Barranqueras. No hay modelo
 * hidráulico ni cotas del terreno atrás. Lo que la pantalla puede decir es
 * «con el río a esta altura, esto es lo que se vio mojado», y nada más; el
 * detalle de cómo se armó está en `docs/inundaciones-gran-resistencia.md`.
 *
 * **No es la zonificación de riesgo.** Esa es de la APA (Resoluciones 1111/98,
 * 303/17 y 121/14) y es la que vale para un certificado.
 *
 * ── Cómo se arma un escenario de crecida ─────────────────────────────────────
 *
 * Dos clases de capa, que no valen lo mismo:
 *
 * - **Zona** (`grupo: 'rio'`): lo que se moja con el río hasta cierta altura,
 *   de la serie de 337 escenas. Se apoya en decenas de imágenes por clase.
 *   **Llega hasta 7 m**: por encima hay una sola escena limpia en cuarenta
 *   años, porque las crecidas llegan con nubes.
 * - **Mancha observada** (`grupo: 'observada'`): el agua de un día. Es lo único
 *   que hay sobre los 7 m, y las de más de 7,3 m son todas de 1983: otra
 *   ciudad, sin el anillo de defensas terminado.
 *
 * Para una altura pedida se muestra la zona de su clase y, encima, la mancha
 * observada más alta que no la supere. **Nunca una mancha de un río más alto
 * que el pedido**: sería mostrar más agua de la que esa altura trajo.
 *
 * ── La lluvia y la combinación ───────────────────────────────────────────────
 *
 * De lluvia hay un solo evento con imagen (enero de 2019), y de río alto con
 * lluvia a la vez, uno (1998, con nubes). Se muestran como lo que son: una
 * observación cada uno. No se suman ni se promedian con las zonas del río.
 */

import { ESTACIONES } from './ina'

export type GrupoCapa = 'base' | 'rio' | 'observada' | 'lluvia' | 'combinada' | 'defensa'

/** Una entrada de `public/geo/inundaciones/indice.json` */
export interface CapaInundacion {
  id: string
  grupo: GrupoCapa
  titulo: string
  /** Altura de Barranqueras: el techo de la clase (zonas) o la del día (manchas) */
  alturaM?: number
  /** AAAA-MM-DD de la imagen; las zonas no tienen */
  fecha?: string
  sensor: string
  criterio: string
  nota: string | null
  /** Cuántas escenas hay detrás de una zona */
  escenas?: number
  /** Año de la ciudad que se ve: las manchas viejas son de otra Resistencia */
  epoca?: number
  /** Fuera del agua de siempre, en todo el recuadro */
  km2?: number
  /** Ídem, dentro del recuadro urbano */
  urbanoKm2?: number
  /** Ídem, sobre lo construido hoy */
  construidoKm2?: number
  poligonos: number
  bytes: number
}

export interface Caja { oeste: number; este: number; sur: number; norte: number }

export interface IndiceInundaciones {
  generado: string
  recuadro: Caja
  urbano: Caja
  urbanoKm2: number
  construidoHoyKm2: number
  capas: CapaInundacion[]
}

/** Anillo en `[lng, lat]`, como en GeoJSON */
export type Anillo = [number, number][]
/** Polígonos con sus huecos: `[polígono][anillo][vértice]` */
export type MultiPoligono = Anillo[][]

export const BARRANQUERAS = ESTACIONES.find(e => e.nombre === 'Barranqueras')!

/** Hasta dónde llegan las zonas de la serie. Por encima sólo hay manchas sueltas */
export const TECHO_ZONAS_M = 7

/** La altura de la escala llevada a cota MOP, que es la de las obras locales */
export const cotaMop = (m: number) => m + BARRANQUERAS.ceroMop

export interface EscenarioRio {
  /** La zona de la clase de esa altura. `null` sólo si el índice no trae zonas */
  zona: CapaInundacion | null
  /** La mancha observada más alta que no supera la altura pedida */
  referencia: CapaInundacion | null
  /** Cuánto le falta a la referencia para llegar a la altura pedida, en m */
  faltaM: number | null
  /** La altura pedida pasa el techo de las zonas: la zona es un piso */
  sobreZonas: boolean
  /** La altura pedida pasa la mancha más alta que hay: no hay observación */
  sobreObservado: boolean
}

/**
 * Qué capas responden a «el río en `h` metros».
 *
 * La zona es la de la clase que contiene a `h`; como cada clase se llama por su
 * techo, es la primera cuyo techo queda por encima. Sobre el techo de la serie
 * se usa la última, y `sobreZonas` avisa que ya no alcanza.
 */
export function escenarioRio(capas: CapaInundacion[], h: number): EscenarioRio {
  const zonas = capas.filter(c => c.grupo === 'rio' && c.alturaM !== undefined)
    .sort((a, b) => a.alturaM! - b.alturaM!)
  const obs = capas.filter(c => c.grupo === 'observada' && c.alturaM !== undefined)
    .sort((a, b) => a.alturaM! - b.alturaM!)

  const zona = zonas.find(z => h < z.alturaM!) ?? zonas[zonas.length - 1] ?? null
  let referencia: CapaInundacion | null = null
  for (const o of obs) if (o.alturaM! <= h) referencia = o
  const masAlta = obs[obs.length - 1]

  return {
    zona,
    referencia,
    faltaM: referencia ? Math.round((h - referencia.alturaM!) * 100) / 100 : null,
    sobreZonas: h >= TECHO_ZONAS_M,
    sobreObservado: masAlta ? h > masAlta.alturaM! : true,
  }
}

// ── Punto en polígono ────────────────────────────────────────────────────────

/**
 * Contesta si un punto cae dentro de una capa.
 *
 * **Es una grilla, no una prueba de punto en polígono.** La capa se pinta una
 * vez en una grilla de ~30 m (relleno por líneas de barrido, regla par-impar
 * sobre todos los anillos, que resuelve los huecos sola) y una consulta es
 * mirar una celda. 30 m es el tamaño del píxel de origen: no se pierde nada
 * que la mancha tuviera. Se le pregunta por cada 50 m de cada camino y por
 * cada movimiento del cursor, y las manchas grandes tienen decenas de miles de
 * vértices y cientos de huecos.
 *
 * La primera versión guardaba la caja de cada polígono y probaba los
 * candidatos anillo por anillo. **No se midió que fuera lenta**: se cambió
 * creyendo que congelaba la pestaña, y lo que fallaba era la captura de
 * pantalla con la pestaña del navegador en segundo plano. Quedó ésta porque es
 * más simple y el test la compara contra la prueba exacta.
 */
export class IndicePoligonos {
  private x0 = 0
  private y0 = 0
  private paso = IndicePoligonos.PASO
  private ancho = 0
  private alto = 0
  private celdas = new Uint8Array(0)
  /** ~30 m. La grilla de origen es de 30 a 90 m */
  private static readonly PASO = 0.0003
  /** Tope de celdas por lado: una capa más grande se pinta más gruesa */
  private static readonly LADO_MAX = 3000

  constructor(mp: MultiPoligono) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (const pol of mp) for (const [x, y] of pol[0] ?? []) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
    }
    if (!(x1 > x0) || !(y1 > y0)) return
    const P = Math.max(IndicePoligonos.PASO, (x1 - x0) / IndicePoligonos.LADO_MAX, (y1 - y0) / IndicePoligonos.LADO_MAX)
    this.x0 = x0; this.y0 = y0; this.paso = P
    this.ancho = Math.ceil((x1 - x0) / P) + 1
    this.alto = Math.ceil((y1 - y0) / P) + 1
    this.celdas = new Uint8Array(this.ancho * this.alto)

    // Por cada fila, dónde la cruzan los bordes a la altura de su centro
    const cruces: number[][] = Array.from({ length: this.alto }, () => [])
    for (const pol of mp) for (const an of pol) {
      for (let i = 0, j = an.length - 1; i < an.length; j = i++) {
        const [xa, ya] = an[j], [xb, yb] = an[i]
        if (ya === yb) continue
        const [yMin, yMax] = ya < yb ? [ya, yb] : [yb, ya]
        // Filas cuyo centro queda en [yMin, yMax): medio abierto, para que un vértice no cuente dos veces
        const f0 = Math.max(0, Math.ceil((yMin - y0) / P - 0.5))
        const f1 = Math.min(this.alto - 1, Math.ceil((yMax - y0) / P - 0.5) - 1)
        for (let f = f0; f <= f1; f++) {
          const yc = y0 + (f + 0.5) * P
          cruces[f].push(xa + (xb - xa) * (yc - ya) / (yb - ya))
        }
      }
    }
    for (let f = 0; f < this.alto; f++) {
      const xs = cruces[f].sort((a, b) => a - b)
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((xs[k] - x0) / P - 0.5))
        const c1 = Math.min(this.ancho - 1, Math.ceil((xs[k + 1] - x0) / P - 0.5) - 1)
        if (c1 >= c0) this.celdas.fill(1, f * this.ancho + c0, f * this.ancho + c1 + 1)
      }
    }
  }

  contiene(lat: number, lng: number): boolean {
    const c = Math.floor((lng - this.x0) / this.paso), f = Math.floor((lat - this.y0) / this.paso)
    if (c < 0 || f < 0 || c >= this.ancho || f >= this.alto) return false
    return this.celdas[f * this.ancho + c] === 1
  }
}

// ── Caminos ──────────────────────────────────────────────────────────────────

export type ClaseVia = 'nacional' | 'provincial' | 'consorcio'

export interface Via {
  clase: ClaseVia
  /** «RN 11», «RP 63», «CC 12 · 045» */
  nombre: string
  material: string
  /** La traza dentro del recuadro, en `[lat, lng]` */
  puntos: [number, number][]
}

const KM_POR_GRADO = 111.32
/** Kilómetros entre dos puntos `[lat, lng]`, en plano local */
export function distKm(a: [number, number], b: [number, number]): number {
  const f = Math.cos(((a[0] + b[0]) / 2) * Math.PI / 180)
  return Math.hypot((b[1] - a[1]) * f, b[0] - a[0]) * KM_POR_GRADO
}

const enCaja = (c: Caja, lat: number, lng: number) =>
  lat >= c.sur && lat <= c.norte && lng >= c.oeste && lng <= c.este

/**
 * Corta una traza a lo que cae dentro de la caja. Devuelve los pedazos: un
 * camino que sale y vuelve a entrar son dos. El corte es al vértice, no al
 * borde exacto: el recuadro es un marco de trabajo, no un límite que importe.
 */
export function recortar(puntos: [number, number][], caja: Caja): [number, number][][] {
  const partes: [number, number][][] = []
  let actual: [number, number][] = []
  for (const p of puntos) {
    if (enCaja(caja, p[0], p[1])) actual.push(p)
    else if (actual.length) { if (actual.length > 1) partes.push(actual); actual = [] }
  }
  if (actual.length > 1) partes.push(actual)
  return partes
}

interface FeatureLinea {
  properties: Record<string, unknown>
  geometry: { type: string; coordinates: number[][][] | number[][] }
}

const lineasDe = (f: FeatureLinea): [number, number][][] => {
  const g = f.geometry
  const ls = (g.type === 'MultiLineString' ? g.coordinates : [g.coordinates]) as number[][][]
  return ls.map(l => l.map(([x, y]) => [y, x] as [number, number]))
}

const numeroDe = (v: unknown) => String(v ?? '').trim().replace(/^0+(?=\d)/, '')

/** Las rutas nacionales y provinciales que pasan por el recuadro */
export function rutasDelRecuadro(
  rn: { features: FeatureLinea[] },
  rp: Record<string, { features: FeatureLinea[] } | undefined>,
  caja: Caja,
): Via[] {
  const out: Via[] = []
  const sumar = (f: FeatureLinea, clase: ClaseVia, prefijo: string) => {
    const n = numeroDe(f.properties.Numero ?? f.properties.Nombre)
    const material = String(f.properties.Mat_Calzad ?? '').trim()
    for (const l of lineasDe(f)) for (const puntos of recortar(l, caja)) {
      out.push({ clase, nombre: n ? `${prefijo} ${n}` : `${prefijo} sin número`, material, puntos })
    }
  }
  for (const f of rn.features) sumar(f, 'nacional', 'RN')
  for (const capa of Object.values(rp)) for (const f of capa?.features ?? []) sumar(f, 'provincial', 'RP')
  return out
}

/** Los caminos de consorcio que pasan por el recuadro, de los tramos ya partidos */
export function caminosDelRecuadro(
  tramos: { cc: number; ruta: string; material: string; puntos: [number, number][] }[],
  caja: Caja,
): Via[] {
  const out: Via[] = []
  for (const t of tramos) for (const puntos of recortar(t.puntos, caja)) {
    out.push({ clase: 'consorcio', nombre: `CC ${t.cc}${t.ruta ? ` · ${t.ruta}` : ''}`, material: t.material, puntos })
  }
  return out
}

/** Cada cuántos km se prueba un punto del camino contra las manchas */
export const PASO_VIA_KM = 0.05

export interface ViaAfectada {
  via: Via
  km: number
  kmDentro: number
  /** Los pedazos que caen dentro, para dibujarlos */
  partes: [number, number][][]
}

/**
 * Cuánto de un camino cae dentro de alguna de las capas.
 *
 * Se camina la traza de a 50 m y se pregunta punto por punto. Es grueso para un
 * camino y fino para estas manchas, que salen de grillas de 30 a 90 m.
 *
 * **Que caiga adentro no quiere decir que se corte.** La mancha no ve
 * terraplenes: una ruta sobre un terraplén cruza una zona inundada y sigue
 * transitable. Es la lista de dónde mirar, no de qué se cerró.
 *
 * `salvo` son las capas que no cuentan aunque el punto esté en una mancha: el
 * agua permanente. Sin eso, **el puente a Corrientes aparecía como camino
 * inundado**, porque cruza el Paraná y el Paraná está en todas las manchas. Se
 * vio en la pantalla, no en el test. Un camino sobre agua de siempre es un
 * puente.
 */
export function viaContra(via: Via, capas: IndicePoligonos[], salvo: IndicePoligonos[] = []): ViaAfectada {
  let km = 0, kmDentro = 0
  const partes: [number, number][][] = []
  let actual: [number, number][] = []
  const dentro = (p: [number, number]) =>
    capas.some(c => c.contiene(p[0], p[1])) && !salvo.some(c => c.contiene(p[0], p[1]))

  for (let i = 0; i < via.puntos.length - 1; i++) {
    const a = via.puntos[i], b = via.puntos[i + 1]
    const d = distKm(a, b)
    if (!(d > 0)) continue
    km += d
    const n = Math.max(1, Math.ceil(d / PASO_VIA_KM))
    for (let k = 0; k < n; k++) {
      // El punto medio de cada pedacito, que es el que lo representa
      const t0 = k / n, t1 = (k + 1) / n, tm = (t0 + t1) / 2
      const pm: [number, number] = [a[0] + (b[0] - a[0]) * tm, a[1] + (b[1] - a[1]) * tm]
      if (dentro(pm)) {
        kmDentro += d / n
        if (!actual.length) actual.push([a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0])
        actual.push([a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1])
      } else if (actual.length) { partes.push(actual); actual = [] }
    }
  }
  if (actual.length) partes.push(actual)
  return { via, km, kmDentro, partes }
}

export interface ResumenVias {
  clase: ClaseVia
  km: number
  kmDentro: number
  /** Por nombre de ruta, de la más afectada a la menos; sólo las que tienen algo adentro */
  rutas: { nombre: string; km: number; kmDentro: number }[]
}

/** Agrupa por clase y por nombre: una ruta viene partida en muchos pedazos */
export function resumirVias(afectadas: ViaAfectada[]): ResumenVias[] {
  const clases: ClaseVia[] = ['nacional', 'provincial', 'consorcio']
  return clases.map(clase => {
    const mias = afectadas.filter(a => a.via.clase === clase)
    const porNombre = new Map<string, { nombre: string; km: number; kmDentro: number }>()
    for (const a of mias) {
      const r = porNombre.get(a.via.nombre) ?? { nombre: a.via.nombre, km: 0, kmDentro: 0 }
      r.km += a.km; r.kmDentro += a.kmDentro
      porNombre.set(a.via.nombre, r)
    }
    return {
      clase,
      km: mias.reduce((s, a) => s + a.km, 0),
      kmDentro: mias.reduce((s, a) => s + a.kmDentro, 0),
      rutas: [...porNombre.values()].filter(r => r.kmDentro >= 0.05).sort((a, b) => b.kmDentro - a.kmDentro),
    }
  })
}

// ── La lluvia pronosticada sobre el área ─────────────────────────────────────

/**
 * Los nodos del pronóstico que representan al recuadro: los que caen adentro o
 * a menos de medio paso de grilla. Con la grilla de 0,25° son dos o tres.
 */
export function nodosDelRecuadro(puntos: { lat: number; lng: number }[], caja: Caja, margen = 0.13): number[] {
  const out: number[] = []
  puntos.forEach((p, i) => {
    if (p.lat >= caja.sur - margen && p.lat <= caja.norte + margen
      && p.lng >= caja.oeste - margen && p.lng <= caja.este + margen) out.push(i)
  })
  return out
}
