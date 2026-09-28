/**
 * Cómputo de terraplén — motor puro, sin React.
 *
 * Vive separado del componente por el mismo motivo que `ripioCalculo.ts`: es lo
 * que produce el número que termina en una obra guardada, así que tiene que
 * poder verificarse sin montar una pantalla. Antes estaba adentro de
 * `CalcTerraplen`, mezclado con el dibujo de la sección.
 *
 * ── La cadena ─────────────────────────────────────────────────────────────────
 *
 *   geometría ──► sección ──► volumen compactado ──► material en banco ──► peso
 *                                                 └─► volumen esponjado
 *
 * ── Tres cosas que no son obvias ──────────────────────────────────────────────
 *
 * **Los tres volúmenes son distintos y no intercambiables.** Es el error clásico
 * del cómputo de movimiento de suelos:
 *
 * - **Compactado** es el que ocupa el terraplén terminado. Sale de la geometría.
 * - **En banco** es el que hay que extraer de la cantera. Es *mayor*, porque el
 *   suelo se compacta al colocarlo: `Vb = V / (Fc/100)`.
 * - **Esponjado** es el que ocupa arriba del camión, después de removido. Es
 *   mayor todavía: `Ve = Vb · (1 + Fe/100)`.
 *
 * **El peso se calcula sobre el volumen en banco, no sobre los otros dos.** La
 * densidad que se carga es la del material en su estado natural, así que
 * multiplicarla por el volumen compactado o por el esponjado daría un peso que
 * no corresponde a ninguna masa real. De ahí salen las toneladas que se
 * presupuestan y los viajes de camión.
 *
 * **El talud se expresa H:V y entra como `m` horizontal por cada 1 vertical**, de
 * modo que el ancho de base crece `2·H·m` sobre el de corona — una vez por cada
 * lado.
 */

/** Lo que el usuario carga */
export interface EntradaTerraplen {
  /** Longitud del tramo, en metros */
  L: number
  /** Altura media del terraplén, en metros */
  H: number
  /** Ancho de corona, en metros */
  Bc: number
  /** Talud H:V — metros horizontales por cada metro vertical */
  m: number
  /** Densidad del material en banco, t/m³ */
  rho: number
  /** Esponjamiento, en por ciento */
  Fe: number
  /** Compactación, en por ciento */
  Fc: number
}

/** Lo que sale del cómputo */
export interface ComputoTerraplen {
  /** Ancho de base, en metros */
  Bb: number
  /** Área de la sección transversal, m² */
  A: number
  /** Volumen compactado — el del terraplén terminado, m³ */
  Vneto: number
  /** Volumen en banco — el que hay que extraer, m³ */
  Vbanco: number
  /** Volumen esponjado — el que se transporta, m³ */
  Vesp: number
  /** Peso total del material en banco, toneladas */
  W: number
}

export const ENTRADA_POR_DEFECTO: EntradaTerraplen = {
  L: 1000, H: 1.5, Bc: 4.0, m: 1.5, rho: 1.8, Fe: 20, Fc: 90,
}

/**
 * Corre el cómputo.
 *
 * **No valida ni corrige la entrada, pero tampoco divide por cero.** Con
 * compactación 0 el volumen en banco sería infinito; en vez de propagar un
 * `Infinity` que después se escribe en la base como presupuesto, devuelve 0.
 * Un cero se ve raro en pantalla y se corrige; un infinito se guarda callado.
 */
export function computarTerraplen(e: EntradaTerraplen): ComputoTerraplen {
  const Bb = e.Bc + 2 * e.H * e.m
  const A = ((e.Bc + Bb) / 2) * e.H
  const Vneto = A * e.L

  const factorComp = e.Fc / 100
  const Vbanco = factorComp > 0 ? Vneto / factorComp : 0
  const Vesp = Vbanco * (1 + e.Fe / 100)

  // El peso sale del volumen EN BANCO: la densidad es la del material natural
  const W = Vbanco * e.rho

  return { Bb, A, Vneto, Vbanco, Vesp, W }
}

/**
 * Viajes de camión necesarios, por capacidad.
 *
 * Se calcula sobre el **peso**, no sobre el volumen esponjado, porque el límite
 * práctico de un camión de áridos es la carga y no la caja. Se redondea hacia
 * arriba: medio viaje no existe.
 */
export function viajes(W: number, capacidadT: number): number {
  if (capacidadT <= 0 || W <= 0) return 0
  return Math.ceil(W / capacidadT)
}

/** Las capacidades que se muestran por omisión */
export const CAPACIDADES_T = [15, 20] as const

// ── Obra por tramos ──────────────────────────────────────────────────────────

/**
 * La sección tipo de la obra: lo que **no** cambia de un tramo a otro.
 *
 * El corte es una decisión de ingeniería, no de programación: a lo largo de una
 * traza **la altura sigue al terreno**, mientras que el ancho de corona y el
 * talud los fija la norma del camino, y densidad, esponjamiento y compactación
 * son propiedades del material y del pliego. Poner los seis por tramo obligaría
 * a repetir cinco valores idénticos en cada uno.
 */
export interface SeccionTipo {
  Bc: number
  m: number
  rho: number
  Fe: number
  Fc: number
}

/**
 * Un tramo dibujado sobre el mapa.
 *
 * `l_m` **sale del dibujo, no se tipea**: es la longitud medida sobre la traza.
 * Por eso no tiene valor por defecto — un tramo sin dibujar mide cero, que es
 * lo correcto, y no un número inventado que se sumaría al cómputo.
 */
export interface TramoTerraplen {
  id: string
  nombre: string
  /** Altura media del tramo, en metros — lo que varía a lo largo de la traza */
  H: number
  /** Longitud medida sobre el dibujo, en metros */
  l_m: number
  /** La traza, o `null` si todavía no se dibujó */
  coords: [number, number][] | null
  orden: number
  /** Color propio; `null` usa la paleta automática */
  color: string | null
}

export const SECCION_POR_DEFECTO: SeccionTipo = {
  Bc: ENTRADA_POR_DEFECTO.Bc,
  m: ENTRADA_POR_DEFECTO.m,
  rho: ENTRADA_POR_DEFECTO.rho,
  Fe: ENTRADA_POR_DEFECTO.Fe,
  Fc: ENTRADA_POR_DEFECTO.Fc,
}

/** El cómputo de un tramo, con lo que el mapa necesita para dibujarlo */
export interface ComputoTramo extends ComputoTerraplen {
  id: string
  /**
   * Ancho de la banda a dibujar sobre el mapa, en metros.
   *
   * Es el **ancho de base**, no el de corona: lo que el terraplén realmente
   * ocupa en el terreno, que es lo que hay que ver sobre la imagen para saber
   * si entra en la zona de camino. Y depende de la altura, así que **cambia de
   * un tramo a otro** aunque la sección tipo sea la misma.
   */
  anchoBanda: number
}

/** Computa un tramo combinando la sección de la obra con su altura y longitud */
export function computarTramo(seccion: SeccionTipo, t: TramoTerraplen): ComputoTramo {
  const c = computarTerraplen({ ...seccion, H: t.H, L: t.l_m })
  return { ...c, id: t.id, anchoBanda: c.Bb }
}

/** El cómputo de toda la obra */
export interface ComputoObra {
  porTramo: ComputoTramo[]
  /** Longitud total dibujada, en metros */
  L_total: number
  Vneto: number
  Vbanco: number
  Vesp: number
  W: number
  /**
   * Altura media de la obra, **pesada por longitud**.
   *
   * Promediar las alturas a secas daría el mismo peso a un tramo de 50 m que a
   * uno de 3 km. Es sólo informativa: el cómputo nunca pasa por acá, se suma
   * tramo por tramo.
   */
  H_media: number
  /** Cuántos tramos todavía no se dibujaron — no aportan longitud */
  sinDibujar: number
}

/**
 * Suma la obra.
 *
 * **Se computa tramo por tramo y después se suma; no se computa una sola vez
 * con la longitud total y la altura media.** No es lo mismo: el volumen crece
 * con el cuadrado de la altura —por el ensanche del talud— así que dos tramos
 * de 1 m y 3 m no dan lo mismo que dos de 2 m. Promediar primero subestima.
 */
export function computarObra(seccion: SeccionTipo, tramos: TramoTerraplen[]): ComputoObra {
  const porTramo = tramos.map(t => computarTramo(seccion, t))

  let L_total = 0, Vneto = 0, Vbanco = 0, Vesp = 0, W = 0, sumaHL = 0, sinDibujar = 0
  for (let i = 0; i < tramos.length; i++) {
    const t = tramos[i], c = porTramo[i]
    if (t.l_m <= 0) sinDibujar++
    L_total += t.l_m
    Vneto += c.Vneto
    Vbanco += c.Vbanco
    Vesp += c.Vesp
    W += c.W
    sumaHL += t.H * t.l_m
  }

  return {
    porTramo, L_total, Vneto, Vbanco, Vesp, W,
    H_media: L_total > 0 ? sumaHL / L_total : 0,
    sinDibujar,
  }
}
