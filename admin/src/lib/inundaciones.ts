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
 * **Una mancha puede no ver todo el recuadro** (`vistoPct`): otra órbita del
 * satélite, que cubre sólo el oeste, o nubes. Lo que no ve viene con la capa
 * (`sinImagen`) y se dibuja: ahí no hay agua pintada y no es porque estuviera
 * seco. Una mancha así no reemplaza a la que ve todo: se suma (`parcial`). Es
 * el caso del 07/03/1983, con el río en 8,02 m, que ve la ciudad entera y no
 * el valle del Paraná.
 *
 * ── Lo informado ─────────────────────────────────────────────────────────────
 *
 * `informes` es lo que se sabe que pasó y ninguna imagen muestra. **No se
 * dibuja como agua**: va como texto, y al lado lo que sí se ve en las imágenes
 * más cercanas.
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
  /** Qué parte del recuadro ve la imagen, en %. Sin el campo, todo */
  vistoPct?: number
  /** Fuera del agua de siempre, en todo el recuadro */
  km2?: number
  /** Ídem, dentro del recuadro urbano */
  urbanoKm2?: number
  /** Ídem, sobre lo construido hoy */
  construidoKm2?: number
  /**
   * De esas tres cifras, cuánto cae dentro del recinto defendido. Sólo en las
   * capas del río: la pantalla lo resta mientras el río no pase el coronamiento
   */
  enRecinto?: { km2: number; urbanoKm2: number; construidoKm2: number }
  /**
   * Dónde cae el agua de la capa en el recuadro, fuera del agua de siempre:
   * dentro del área defendida, en el valle de inundación del Paraná, en el
   * resto de la margen chaqueña y del otro lado del límite provincial. Sólo en
   * las capas del río. Suman el total en el recuadro medido sobre los
   * polígonos, que no es exactamente `km2`: aquél se midió sobre las grillas
   */
  porZona?: { recintoKm2: number; valleKm2: number; chacoKm2: number; fueraKm2: number }
  poligonos: number
  bytes: number
}

export interface Caja { oeste: number; este: number; sur: number; norte: number }

/** Una línea para ubicarse: no es agua */
export interface ReferenciaInundacion {
  id: string
  nombre: string
  fuente: string
  /** `[línea][vértice]` en `[lng, lat]` */
  lineas: [number, number][][]
}

/**
 * Una obra de defensa contra el río: un terraplén. No es agua ni referencia:
 * es lo que separa el agua del río de la ciudad.
 */
export interface DefensaInundacion {
  id: string
  nombre: string
  fuente: string
  /** Largo de la traza, en km */
  km: number
  /** Cota MOP del coronamiento, si se conoce. Puede ser un dato de un solo punto */
  coronamientoMop?: number
  /** De dónde sale esa cota y hasta dónde vale */
  coronamientoNota?: string
  /** `[línea][vértice]` en `[lng, lat]`, dibujada de norte a sur con el río a la izquierda */
  lineas: [number, number][][]
}

/**
 * Lo que encierran una defensa y lo que la completa: el área donde el agua
 * del río no se dibuja mientras no pase el coronamiento.
 *
 * En el Gran Resistencia el anillo no cierra: por el sur el contorno es la Av.
 * Soberanía Nacional, que no es una defensa sino el corte que se tomó. Al sur
 * de ella el río entra.
 */
export interface RecintoInundacion {
  id: string
  nombre: string
  /** La defensa de `defensas` que lo cierra por el este y el sur */
  defensa: string
  areaKm2: number
  /** Cuánto del contorno no es defensa ni RN 11, en km */
  corteKm: number
  /** Qué es esa parte del contorno */
  corteNombre: string
  /** El contorno, cerrado, en `[lng, lat]` */
  anillo: [number, number][]
  /** La parte del contorno que no es defensa, para dibujarla a rayas */
  corte: [number, number][]
}

/**
 * El valle de inundación del Paraná: la cuenca 12 de `geo_cuencas.json`, en
 * las partes que tocan el recuadro. Por ahí se extiende el río al salir del
 * cauce, y su borde norte llega a la punta sur de la defensa.
 */
export interface ValleInundacion {
  id: string
  nombre: string
  fuente: string
  /** Del valle, lo que cae en el recuadro, fuera del agua de siempre y del área defendida */
  enRecuadroKm2: number
  poligonos: MultiPoligono
}

/** Algo que se informó y ninguna imagen muestra */
export interface InformeInundacion {
  id: string
  /** La altura del río con la que pasó */
  alturaM: number
  fecha: string
  /** La línea de `referencias` de la que habla, si hay */
  referencia?: string
  texto: string
  /** Lo que muestran las imágenes más cercanas */
  contraste: string
}

export interface IndiceInundaciones {
  generado: string
  recuadro: Caja
  urbano: Caja
  urbanoKm2: number
  construidoHoyKm2: number
  capas: CapaInundacion[]
  referencias?: ReferenciaInundacion[]
  defensas?: DefensaInundacion[]
  recintos?: RecintoInundacion[]
  valle?: ValleInundacion
  informes?: InformeInundacion[]
}

/** Anillo en `[lng, lat]`, como en GeoJSON */
export type Anillo = [number, number][]
/** Polígonos con sus huecos: `[polígono][anillo][vértice]` */
export type MultiPoligono = Anillo[][]

export const BARRANQUERAS = ESTACIONES.find(e => e.nombre === 'Barranqueras')!

/** Hasta dónde llegan las zonas de la serie. Por encima sólo hay manchas sueltas */
export const TECHO_ZONAS_M = 7

/** Una mancha que ve menos que esto del recuadro no reemplaza a una que lo ve entero */
export const VISTO_MINIMO_PCT = 90
const esParcial = (c: CapaInundacion) => c.vistoPct !== undefined && c.vistoPct < VISTO_MINIMO_PCT

/** Los informes que valen para una altura: los de esa altura o menos */
export const informesHasta = (informes: InformeInundacion[] | undefined, h: number) =>
  (informes ?? []).filter(i => i.alturaM <= h + 1e-9)

/** La altura de la escala llevada a cota MOP, que es la de las obras locales */
export const cotaMop = (m: number) => m + BARRANQUERAS.ceroMop
/** La altura en la escala de Barranqueras que corresponde a una cota MOP */
export const enEscala = (cota: number) => cota - BARRANQUERAS.ceroMop

export interface EscenarioRio {
  /** La zona de la clase de esa altura. `null` sólo si el índice no trae zonas */
  zona: CapaInundacion | null
  /** La mancha observada más alta que no supera la altura pedida, entre las que ven todo el recuadro */
  referencia: CapaInundacion | null
  /**
   * Una mancha más alta que la referencia —y que tampoco supera lo pedido— que
   * ve sólo una parte del recuadro. Se suma a la referencia, no la reemplaza
   */
  parcial: CapaInundacion | null
  /** Cuánto le falta a la más alta de las dos para llegar a la altura pedida, en m */
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
  let referencia: CapaInundacion | null = null, parcial: CapaInundacion | null = null
  for (const o of obs) {
    if (o.alturaM! > h) continue
    if (esParcial(o)) parcial = o
    else referencia = o
  }
  // Una parcial más baja que la referencia no agrega nada: la otra ve más y es de un río más alto
  if (parcial && referencia && parcial.alturaM! <= referencia.alturaM!) parcial = null
  const masAlta = obs[obs.length - 1]
  const cercana = parcial ?? referencia

  return {
    zona,
    referencia,
    parcial,
    faltaM: cercana ? Math.round((h - cercana.alturaM!) * 100) / 100 : null,
    sobreZonas: h >= TECHO_ZONAS_M,
    sobreObservado: masAlta ? h > masAlta.alturaM! : true,
  }
}

/**
 * Todo lo que se dibuja como agua para «el río en `h` metros»: la zona de esa
 * altura y **todas** las manchas observadas con el río a esa altura o menos.
 *
 * Es acumulado a propósito, para que subir el deslizador nunca saque agua. Las
 * manchas de un día no son monótonas —el 22/07/1983, con 8,26 m, hay menos
 * agua junto al Canal 16 que el 07/03/1983 con 8,02— y mostrando sólo la más
 * cercana, al pasar de 8,25 a 8,30 m el mapa se secaba en partes. Lo que se
 * lee es «acá se vio agua con el río en `h` o menos», que sigue siendo sólo
 * lo observado y nunca de un río más alto que el pedido.
 *
 * Van de la más baja a la más alta: la primera que contiene un punto dice
 * desde qué altura se vio agua ahí.
 */
export function aguaDelRio(capas: CapaInundacion[], h: number): CapaInundacion[] {
  const zona = escenarioRio(capas, h).zona
  const obs = capas.filter(c => c.grupo === 'observada' && c.alturaM !== undefined && c.alturaM <= h + 1e-9)
    .sort((a, b) => a.alturaM! - b.alturaM!)
  return zona ? [zona, ...obs] : obs
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
/** Lo único que se le pregunta a una capa: si un punto cae adentro */
export interface Contenedor { contiene(lat: number, lng: number): boolean }

/**
 * Una capa del río vista con la defensa en pie: lo que cae dentro del recinto
 * no cuenta. Para los cruces con caminos, las obras y la lectura bajo el cursor
 * —todo lo que pregunta punto por punto—, así dicen lo mismo que el mapa.
 */
export const fueraDe = (capa: Contenedor, recinto: Contenedor): Contenedor => ({
  contiene: (lat, lng) => capa.contiene(lat, lng) && !recinto.contiene(lat, lng),
})

/**
 * Si un punto queda al sur de una línea que corre de oeste a este (o al revés),
 * mirando sólo el tramo de longitudes que la línea cubre. Fuera de ese tramo,
 * `false`: no se sabe.
 *
 * Es para la Av. Soberanía Nacional, el corte sur del área defendida: al sur
 * de ella no hay defensa.
 */
export function alSurDe(linea: [number, number][], lat: number, lng: number): boolean {
  for (let i = 0; i + 1 < linea.length; i++) {
    const [xa, ya] = linea[i], [xb, yb] = linea[i + 1]
    if (xa === xb || lng < Math.min(xa, xb) || lng > Math.max(xa, xb)) continue
    return lat < ya + (yb - ya) * (lng - xa) / (xb - xa)
  }
  return false
}

/**
 * El coronamiento en la escala de Barranqueras, si el recinto tiene una
 * defensa con cota. Hasta esa altura el agua del río no entra.
 */
export function techoDelRecinto(r: RecintoInundacion, defensas: DefensaInundacion[] | undefined): number | null {
  const d = defensas?.find(x => x.id === r.defensa)
  return d?.coronamientoMop === undefined ? null : enEscala(d.coronamientoMop)
}

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
export function viaContra(via: Via, capas: Contenedor[], salvo: Contenedor[] = []): ViaAfectada {
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

// ── De qué lado de la defensa ────────────────────────────────────────────────

/**
 * Hasta qué distancia de la defensa se dice de qué lado está un punto. La
 * traza no es un anillo cerrado —corre por el este y el sur, y al oeste el
 * recinto lo cierran terrenos altos y rutas—, así que el lado se toma del
 * tramo más cercano, y eso sólo vale cerca de la traza: a 5 km el tramo más
 * cercano puede ser el de la otra punta.
 */
export const LADO_DEFENSA_KM = 2

/**
 * De qué lado de la defensa cae un punto: `rio` o `ciudad`, y a cuántos km.
 * `null` si está a más de `maxKm`. La traza tiene que venir con el río a la
 * izquierda del sentido en que se dibujó, como la de `defensa-amgr.kml` (de
 * norte a sur, con el Paraná al este): el test lo afirma con el agua
 * permanente.
 */
export function ladoDeDefensa(
  lineas: [number, number][][], lat: number, lng: number, maxKm = LADO_DEFENSA_KM,
): { lado: 'rio' | 'ciudad'; km: number } | null {
  const kx = 111.32 * Math.cos(lat * Math.PI / 180), ky = 110.57
  let mejor = Infinity, cruz = 0
  for (const l of lineas) {
    for (let i = 1; i < l.length; i++) {
      const ax = (l[i - 1][0] - lng) * kx, ay = (l[i - 1][1] - lat) * ky
      const dx = (l[i][0] - l[i - 1][0]) * kx, dy = (l[i][1] - l[i - 1][1]) * ky
      const n = dx * dx + dy * dy
      const t = n ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / n)) : 0
      const d = Math.hypot(ax + t * dx, ay + t * dy)
      // El punto está en el origen: el signo de (b − a) × (p − a) dice el lado
      if (d < mejor) { mejor = d; cruz = dx * -ay - dy * -ax }
    }
  }
  if (mejor > maxKm) return null
  return { lado: cruz > 0 ? 'rio' : 'ciudad', km: mejor }
}
