/**
 * Cómputo de excavación — motor puro, sin React.
 *
 * Vive separado del componente por el mismo motivo que `ripioCalculo.ts` y
 * `terraplenCalculo.ts`: es lo que produce el número que termina en una obra
 * guardada, así que tiene que poder verificarse sin montar una pantalla.
 *
 * ── Dos modos, porque son dos trabajos distintos ──────────────────────────────
 *
 * - **Lineal** — cunetas, zanjas, cortes de camino. La sección es un trapecio
 *   que se repite a lo largo de un eje, y la longitud sale del dibujo sobre el
 *   mapa. Es el mismo circuito que ripio y terraplén.
 * - **Área** — préstamos, pozos, destapes. Se dibuja el recinto y el volumen es
 *   la superficie por la profundidad.
 *
 * No son el mismo cálculo con otra entrada: en el lineal el talud **agranda**
 * el volumen por el ensanche de la boca, y en el de área la superficie que se
 * dibuja ya es la que se va a excavar. Mezclarlos daría un número plausible y
 * equivocado, así que el modo es explícito y cada uno tiene su función.
 *
 * ── Lo que distingue a excavación de terraplén ────────────────────────────────
 *
 * **Acá el trapecio va al revés.** En un terraplén el ancho de corona es el de
 * arriba y el talud ensancha hacia abajo; en una excavación el ancho de fondo
 * es el de abajo y el talud ensancha **hacia arriba**, hacia la boca. La
 * fórmula del área es la misma —es un trapecio— pero el dibujo es otro y los
 * nombres también, y confundirlos hace que el usuario cargue el ancho
 * equivocado.
 *
 * **Y hay un volumen menos.** En terraplén son tres —compactado, en banco y
 * esponjado— porque hay que fabricar un relleno con una densidad exigida. Acá
 * se saca material del lugar donde está, así que el volumen de corte **ya es**
 * el volumen en banco: no hay compactación que aplicar. Sólo queda el
 * esponjado, que es lo que ocupa arriba del camión.
 *
 * Por eso **el peso sale del volumen de corte**, que es el natural. Usar el
 * esponjado daría un peso que no corresponde a ninguna masa real: el material
 * no pesa más por estar suelto, ocupa más.
 */

// ── Lo común a los dos modos ─────────────────────────────────────────────────

/** Propiedades del material, que no cambian de un tramo a otro */
export interface MaterialExcavacion {
  /** Densidad natural, t/m³ */
  rho: number
  /** Esponjamiento, en por ciento */
  Fe: number
}

/** La sección tipo del modo lineal: lo que fija el proyecto, no el terreno */
export interface SeccionExcavacion extends MaterialExcavacion {
  /** Ancho de fondo, en metros */
  Bf: number
  /** Talud H:V — metros horizontales por cada metro vertical */
  m: number
}

export const SECCION_POR_DEFECTO: SeccionExcavacion = {
  Bf: 3.0, m: 1.0, rho: 1.80, Fe: 25,
}

/** Lo que sale de cualquiera de los dos modos */
export interface ComputoExcavacion {
  /** Volumen de corte — el hueco que queda, y el material en banco, m³ */
  Vcorte: number
  /** Volumen esponjado — el que se transporta, m³ */
  Vesp: number
  /** Peso del material natural, toneladas */
  W: number
}

/**
 * Peso y esponjado a partir del volumen de corte.
 *
 * Los dos modos terminan acá, y tiene que ser una sola función: si cada modo
 * calculara su peso, un cambio en el criterio se aplicaría a uno solo y los dos
 * números se irían separando sin que nada fallara.
 */
function cerrar(Vcorte: number, mat: MaterialExcavacion): ComputoExcavacion {
  return {
    Vcorte,
    Vesp: Vcorte * (1 + mat.Fe / 100),
    // El peso sale del volumen NATURAL: el material no pesa más por estar suelto
    W: Vcorte * mat.rho,
  }
}

// ── Modo lineal ──────────────────────────────────────────────────────────────

/** La sección transversal de una excavación lineal */
export interface PerfilExcavacion {
  /** Ancho de boca, en metros — el de arriba, el que se abre en el terreno */
  Bb: number
  /** Área de la sección transversal, m² */
  A: number
}

/**
 * La geometría del trapecio invertido.
 *
 * `Bb = Bf + 2·H·m` — una vez por cada lado, igual que en terraplén. Lo que
 * cambia es hacia dónde: acá la boca es la cara ancha y está arriba.
 */
export function perfilDe(sec: SeccionExcavacion, H: number): PerfilExcavacion {
  const Bb = sec.Bf + 2 * H * sec.m
  return { Bb, A: ((sec.Bf + Bb) / 2) * H }
}

/**
 * Un tramo de excavación lineal dibujado sobre el mapa.
 *
 * `l_m` **sale del dibujo, no se tipea**, igual que en terraplén: un tramo sin
 * dibujar mide cero, que es lo correcto, y no un número inventado que se sumaría
 * al cómputo.
 */
export interface TramoExcavacion {
  id: string
  nombre: string
  /** Profundidad media del tramo, en metros — lo que varía a lo largo del eje */
  H: number
  /** Longitud medida sobre el dibujo, en metros */
  l_m: number
  coords: [number, number][] | null
  orden: number
  color: string | null
}

export const PROFUNDIDAD_POR_DEFECTO = 2.0

/** El cómputo de un tramo, con lo que el mapa necesita para dibujarlo */
export interface ComputoTramoExc extends ComputoExcavacion, PerfilExcavacion {
  id: string
  /**
   * Ancho de la banda a dibujar sobre el mapa, en metros.
   *
   * Es el **ancho de boca**, no el de fondo: lo que la excavación realmente
   * ocupa en la superficie del terreno, que es lo que hay que ver sobre la
   * imagen para saber si entra en la zona de camino. Depende de la profundidad,
   * así que cambia de un tramo a otro aunque la sección tipo sea la misma.
   */
  anchoBanda: number
}

export function computarTramo(sec: SeccionExcavacion, t: TramoExcavacion): ComputoTramoExc {
  const p = perfilDe(sec, t.H)
  return { ...p, ...cerrar(p.A * t.l_m, sec), id: t.id, anchoBanda: p.Bb }
}

// ── Modo área ────────────────────────────────────────────────────────────────

/**
 * Un recinto de excavación dibujado sobre el mapa.
 *
 * La superficie sale del polígono. La profundidad se carga a mano porque **no
 * hay forma de medirla desde arriba**: el mapa da la planta, no la cota.
 */
export interface RecintoExcavacion {
  id: string
  nombre: string
  /** Profundidad media del recinto, en metros */
  H: number
  /** Superficie medida sobre el dibujo, en hectáreas */
  area_ha: number
  coords: [number, number][] | null
  orden: number
  color: string | null
}

export interface ComputoRecinto extends ComputoExcavacion {
  id: string
  /** Superficie en m², que es la unidad en la que se computa */
  area_m2: number
}

/**
 * Computa un recinto.
 *
 * **El volumen es superficie por profundidad y nada más.** No se aplica talud:
 * el polígono que se dibujó sobre la imagen es la boca del pozo, y lo que el
 * talud haría es reducir el fondo, no agrandar lo excavado. Meterlo acá
 * duplicaría un efecto que la traza ya contiene.
 *
 * Que sea un prisma recto y no un tronco de pirámide es una **simplificación
 * declarada**: sobreestima el volumen frente a un pozo con taludes reales, y en
 * un préstamo poco profundo y extenso la diferencia es chica. Si algún día hace
 * falta la precisión, entra un talud acá y se vuelve un tronco — pero entonces
 * hay que decidir si el polígono dibujado es la boca o el fondo, que hoy no
 * está definido.
 */
export function computarRecinto(mat: MaterialExcavacion, r: RecintoExcavacion): ComputoRecinto {
  const area_m2 = r.area_ha * 10_000
  return { ...cerrar(area_m2 * r.H, mat), id: r.id, area_m2 }
}

// ── La obra entera ───────────────────────────────────────────────────────────

export type ModoExcavacion = 'lineal' | 'area'

export interface ComputoObraExc extends ComputoExcavacion {
  /** Longitud total dibujada, en metros — sólo en modo lineal */
  L_total: number
  /** Superficie total dibujada, en hectáreas — sólo en modo área */
  ha_total: number
  /**
   * Profundidad media, **pesada** — por longitud en lineal, por superficie en
   * área. Es sólo informativa: el cómputo nunca pasa por acá.
   */
  H_media: number
  /** Cuántos elementos todavía no se dibujaron — no aportan al cómputo */
  sinDibujar: number
}

const VACIO: ComputoObraExc = {
  Vcorte: 0, Vesp: 0, W: 0, L_total: 0, ha_total: 0, H_media: 0, sinDibujar: 0,
}

/**
 * Suma la obra en modo lineal.
 *
 * **Se computa tramo por tramo y después se suma.** No es lo mismo que computar
 * una vez con la longitud total y la profundidad media: el volumen crece con el
 * cuadrado de la profundidad —por el ensanche del talud— así que promediar
 * primero subestima. Es la misma trampa que en terraplén, y por el mismo
 * motivo: el trapecio.
 */
export function computarObraLineal(
  sec: SeccionExcavacion, tramos: TramoExcavacion[],
): ComputoObraExc & { porTramo: ComputoTramoExc[] } {
  const porTramo = tramos.map(t => computarTramo(sec, t))

  let L_total = 0, Vcorte = 0, Vesp = 0, W = 0, sumaHL = 0, sinDibujar = 0
  for (let i = 0; i < tramos.length; i++) {
    const t = tramos[i], c = porTramo[i]
    if (t.l_m <= 0) sinDibujar++
    L_total += t.l_m
    Vcorte += c.Vcorte
    Vesp += c.Vesp
    W += c.W
    sumaHL += t.H * t.l_m
  }

  return {
    ...VACIO, porTramo, L_total, Vcorte, Vesp, W, sinDibujar,
    H_media: L_total > 0 ? sumaHL / L_total : 0,
  }
}

/**
 * Suma la obra en modo área.
 *
 * Acá el volumen es lineal en la profundidad, así que promediar **sí** daría lo
 * mismo. Igual se suma recinto por recinto, por dos razones: cada recinto
 * guarda su propio número y se muestra en la lista, y que los dos modos se
 * comporten igual evita que alguien "optimice" el lineal por analogía con éste.
 */
export function computarObraArea(
  mat: MaterialExcavacion, recintos: RecintoExcavacion[],
): ComputoObraExc & { porRecinto: ComputoRecinto[] } {
  const porRecinto = recintos.map(r => computarRecinto(mat, r))

  let ha_total = 0, Vcorte = 0, Vesp = 0, W = 0, sumaHA = 0, sinDibujar = 0
  for (let i = 0; i < recintos.length; i++) {
    const r = recintos[i], c = porRecinto[i]
    if (r.area_ha <= 0) sinDibujar++
    ha_total += r.area_ha
    Vcorte += c.Vcorte
    Vesp += c.Vesp
    W += c.W
    sumaHA += r.H * r.area_ha
  }

  return {
    ...VACIO, porRecinto, ha_total, Vcorte, Vesp, W, sinDibujar,
    H_media: ha_total > 0 ? sumaHA / ha_total : 0,
  }
}

// ── Transporte ───────────────────────────────────────────────────────────────

/**
 * Viajes de camión necesarios, por capacidad.
 *
 * Sobre el **peso** y no sobre el volumen esponjado, porque el límite práctico
 * de un camión es la carga y no la caja. Se redondea hacia arriba: medio viaje
 * no existe.
 */
export function viajes(W: number, capacidadT: number): number {
  if (capacidadT <= 0 || W <= 0) return 0
  return Math.ceil(W / capacidadT)
}

export const CAPACIDADES_T = [15, 20] as const
