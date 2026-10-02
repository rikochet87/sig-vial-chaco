/**
 * Cómputo de excavación — motor puro, sin React.
 *
 * Vive separado del componente por el mismo motivo que `ripioCalculo.ts` y
 * `terraplenCalculo.ts`: es lo que produce el número que termina en una obra
 * guardada, así que tiene que poder verificarse sin montar una pantalla.
 *
 * ── Dos cómputos, porque son dos trabajos distintos ───────────────────────────
 *
 * - **Lineal** — cunetas, zanjas, cortes de camino. La sección es un trapecio
 *   que se repite a lo largo de un eje, y la longitud sale del dibujo sobre el
 *   mapa. Es el mismo circuito que ripio y terraplén. **Un canal es esto mismo**
 *   con el caudal que lleva: ver `caudalManning`.
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

// ── Modo canal: la misma zanja, con el agua que lleva ────────────────────────

/**
 * Lo que hace falta para pasar de una sección a un caudal.
 *
 * Son de la obra y no del tramo: la rugosidad es del revestimiento y la
 * pendiente longitudinal es la de proyecto. La profundidad sí cambia de un
 * tramo a otro, y con ella el caudal.
 */
export interface Hidraulica {
  /** Coeficiente de rugosidad de Manning */
  n: number
  /** Pendiente longitudinal, en por ciento */
  S: number
}

/** Tierra sin revestir y medio por ciento: un canal de desagüe de llanura */
export const HIDRAULICA_POR_DEFECTO: Hidraulica = { n: 0.025, S: 0.5 }

export interface CaudalSeccion {
  /** Perímetro mojado, en metros: el fondo y los dos taludes, sin la boca */
  P: number
  /** Radio hidráulico, en metros */
  R: number
  /** Caudal a sección llena, en m³/s */
  Q: number
  /** Velocidad media, en m/s */
  V: number
}

/**
 * El caudal que lleva la sección **llena**, por Manning.
 *
 *   Q = A · R^⅔ · S^½ / n        con   R = A / P
 *
 * ── Un canal es una excavación lineal ─────────────────────────────────────────
 *
 * El canal tenía su propia calculadora, con su propia fórmula de sección y su
 * propio cómputo de volumen: la misma zanja trapezoidal calculada dos veces en
 * dos archivos. Acá no hay geometría nueva — el área es la de `perfilDe` y el
 * volumen el de `computarTramo`. Lo único que el canal agrega es esta función.
 * Un canal triangular es el trapecio con ancho de fondo cero.
 *
 * ── A sección llena, y hay que decirlo ────────────────────────────────────────
 *
 * El tirante se toma igual a la profundidad excavada: el agua hasta el borde.
 * Es la **capacidad máxima** de la sección, no el caudal de diseño — un canal
 * se proyecta con revancha, y entonces lleva menos. Sirve para saber si la
 * sección alcanza, no para afirmar cuánto va a llevar.
 *
 * Sin profundidad, sin pendiente o sin rugosidad no hay caudal: devuelve ceros
 * y no `NaN`, que en pantalla se leería como un número roto.
 */
export function caudalManning(sec: SeccionExcavacion, H: number, hid: Hidraulica): CaudalSeccion {
  const { A } = perfilDe(sec, H)
  const P = sec.Bf + 2 * H * Math.sqrt(1 + sec.m * sec.m)
  if (!(A > 0) || !(P > 0) || !(hid.n > 0) || !(hid.S > 0)) return { P: Math.max(0, P), R: 0, Q: 0, V: 0 }
  const R = A / P
  const V = Math.pow(R, 2 / 3) * Math.sqrt(hid.S / 100) / hid.n
  return { P, R, Q: A * V, V }
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
  /**
   * Medidas de un pozo **rectangular cargado a mano**, cuando no se dibujó.
   *
   * No es un atajo: un préstamo se define muchas veces por sus medidas antes de
   * existir en el terreno, y entonces no hay nada que dibujar sobre la imagen.
   * Con ancho y largo la geometría queda **completa y exacta** —área, perímetro
   * y las cuatro esquinas rectas— así que el talud se aplica igual que sobre un
   * polígono. Guardar sólo la superficie no alcanzaría: sin perímetro no hay
   * forma de cerrar el fondo, y el pozo volvería a ser un prisma.
   */
  ancho_m?: number
  largo_m?: number
}

export interface ComputoRecinto extends ComputoExcavacion {
  id: string
  /** Superficie de la boca, en m² — la que se dibujó sobre el terreno */
  area_m2: number
  /** Superficie del fondo, en m² — la boca reducida por el talud */
  areaFondo_m2: number
  /** Perímetro de la boca, en metros */
  perim_m: number
  /**
   * A qué profundidad el talud cierra el fondo, en metros.
   *
   * Pasada esa profundidad el pozo es una pirámide y no se puede seguir bajando
   * con ese talud sin ensanchar la boca. `null` si no se puede calcular.
   */
  profundidadCierre: number | null
  /** Si la profundidad cargada ya cerró el fondo */
  fondoCerrado: boolean
}

/**
 * Geometría plana de un anillo de coordenadas: área, perímetro y esquinas.
 *
 * **Se proyecta con la latitud media del propio anillo.** Un grado de longitud
 * mide distinto según la latitud, así que sin esa corrección el área y el
 * perímetro no serían los del polígono dibujado. Es el mismo criterio que
 * `areaKm2` en `thiessenAreal.ts`, y acá alcanza con la latitud propia porque
 * cada recinto se mide solo, no se comparan entre sí.
 *
 * `sumaCot` es `Σ cot(θᵢ/2)` sobre los ángulos interiores, y es lo que hace
 * **exacta** la reducción del área al aplicar el talud: para un rectángulo da 4,
 * que es justo el término cuadrático de `(a−2d)(b−2d)`.
 */
export function geometriaAnillo(coords: [number, number][]): {
  area_m2: number; perim_m: number; sumaCot: number
} {
  const n = coords.length
  if (n < 3) return { area_m2: 0, perim_m: 0, sumaCot: 0 }

  const R = 6_371_008.8
  const latMedia = coords.reduce((a, c) => a + c[0], 0) / n * Math.PI / 180
  const kx = R * Math.cos(latMedia) * Math.PI / 180
  const ky = R * Math.PI / 180
  const p = coords.map(([lat, lng]) => [lng * kx, lat * ky] as [number, number])

  let area2 = 0, perim = 0, sumaCot = 0
  for (let i = 0; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n]
    area2 += a[0] * b[1] - b[0] * a[1]
    perim += Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  const area_m2 = Math.abs(area2) / 2
  const horario = area2 < 0

  for (let i = 0; i < n; i++) {
    const ant = p[(i - 1 + n) % n], v = p[i], sig = p[(i + 1) % n]
    const u = [ant[0] - v[0], ant[1] - v[1]]
    const w = [sig[0] - v[0], sig[1] - v[1]]
    const nu = Math.hypot(u[0], u[1]), nw = Math.hypot(w[0], w[1])
    if (nu === 0 || nw === 0) continue
    // El ángulo interior, con el signo de la cruz para distinguir una esquina
    // entrante de una saliente: en una entrante el offset AGREGA área.
    const cruz = u[0] * w[1] - u[1] * w[0]
    let ang = Math.acos(Math.max(-1, Math.min(1, (u[0] * w[0] + u[1] * w[1]) / (nu * nw))))
    const saliente = horario ? cruz > 0 : cruz < 0
    if (!saliente) ang = 2 * Math.PI - ang
    const t = Math.tan(ang / 2)
    if (Math.abs(t) > 1e-9) sumaCot += 1 / t
  }

  return { area_m2, perim_m: perim, sumaCot }
}

/**
 * Computa un recinto de préstamo como **tronco de pirámide**.
 *
 * ── El polígono dibujado es la BOCA ───────────────────────────────────────────
 *
 * Ésa es la definición, y hay que fijarla porque el volumen depende de ella. Se
 * dibuja sobre la imagen lo que se ve o se va a abrir en la superficie del
 * terreno; el talud cierra hacia adentro a medida que se baja, así que el fondo
 * es **menor** que lo dibujado. Tomar el polígono como fondo daría un pozo más
 * grande que el dibujo, que es lo contrario de lo que uno espera al marcarlo.
 *
 * ── Por qué tronco y no prisma ────────────────────────────────────────────────
 *
 * La primera versión computaba superficie × profundidad, un prisma recto, y eso
 * **sobreestima**: ignora que las paredes se cierran. En un préstamo extenso y
 * poco profundo la diferencia es chica, pero en uno hondo es grande — y son
 * justamente los hondos los que mueven plata.
 *
 * El volumen sale de la fórmula del prismatoide, que para un tronco es exacta:
 *
 *   V = H/3 · (A_boca + A_fondo + √(A_boca · A_fondo))
 *
 * ── Y el área del fondo se calcula, no se estima ──────────────────────────────
 *
 * El fondo es la boca desplazada hacia adentro una distancia `d = H · m`. Para
 * un polígono simple eso es exactamente:
 *
 *   A_fondo = A − P·d + d² · Σ cot(θᵢ/2)
 *
 * mientras el desplazamiento no cierre el contorno. El término de las esquinas
 * no es un refinamiento: en un rectángulo vale 4·d², y omitirlo subestimaría el
 * fondo.
 *
 * **Si el talud cierra el fondo antes de llegar a la profundidad cargada**, el
 * pozo no puede ser más hondo con ese talud sin ensanchar la boca. En ese caso
 * el fondo es cero, el cuerpo es una pirámide y `fondoCerrado` lo dice: es un
 * dato del proyecto, no un error del cálculo, y la pantalla tiene que mostrarlo
 * en vez de devolver un volumen como si nada pasara.
 */
/**
 * La geometría de un rectángulo cargado a mano.
 *
 * `sumaCot` vale 4 porque son cuatro ángulos rectos y `cot(45°) = 1`. Ese 4 es
 * exactamente el término cuadrático de `(a−2d)(b−2d)`, así que el fondo sale
 * exacto y no aproximado.
 */
export function geometriaRectangulo(ancho_m: number, largo_m: number) {
  const a = Math.max(0, ancho_m), b = Math.max(0, largo_m)
  return { area_m2: a * b, perim_m: 2 * (a + b), sumaCot: 4 }
}

export function computarRecinto(
  mat: MaterialExcavacion, r: RecintoExcavacion, talud = 0,
): ComputoRecinto {
  /*
   * De dónde sale la geometría, en orden: el polígono dibujado manda sobre las
   * medidas tipeadas, porque si hay traza es lo que se va a ejecutar. Las
   * medidas son la salida para un pozo que todavía no está en el terreno.
   */
  const g = r.coords && r.coords.length >= 3
    ? geometriaAnillo(r.coords)
    : (r.ancho_m && r.largo_m)
      ? geometriaRectangulo(r.ancho_m, r.largo_m)
      : { area_m2: r.area_ha * 10_000, perim_m: 0, sumaCot: 0 }

  const A = g.area_m2
  const d = Math.max(0, r.H * talud)

  /*
   * A qué profundidad se cierra el fondo: la menor raíz positiva de
   * `A − P·d + C·d² = 0`. Sin talud no se cierra nunca; sin perímetro (un
   * recinto sin traza) no se puede saber.
   */
  let dCierre: number | null = null
  if (g.perim_m > 0) {
    const C = g.sumaCot
    if (Math.abs(C) < 1e-9) {
      dCierre = A / g.perim_m
    } else {
      const disc = g.perim_m * g.perim_m - 4 * C * A
      if (disc >= 0) {
        const r1 = (g.perim_m - Math.sqrt(disc)) / (2 * C)
        const r2 = (g.perim_m + Math.sqrt(disc)) / (2 * C)
        const positivas = [r1, r2].filter(x => x > 0)
        if (positivas.length) dCierre = Math.min(...positivas)
      }
    }
  }
  const profundidadCierre = dCierre !== null && talud > 0 ? dCierre / talud : null

  const areaFondoBruta = A - g.perim_m * d + g.sumaCot * d * d
  const cerrado = dCierre !== null && d >= dCierre
  const areaFondo_m2 = cerrado ? 0 : Math.max(0, areaFondoBruta)

  // Prismatoide: con fondo cero queda V = H·A/3, que es la pirámide
  const Vcorte = (r.H / 3) * (A + areaFondo_m2 + Math.sqrt(A * areaFondo_m2))

  return {
    ...cerrar(Vcorte, mat),
    id: r.id,
    area_m2: A,
    areaFondo_m2,
    perim_m: g.perim_m,
    profundidadCierre,
    fondoCerrado: cerrado,
  }
}

// ── La obra entera ───────────────────────────────────────────────────────────

/**
 * `canal` es el modo lineal con la hidráulica a la vista: comparte la sección,
 * los tramos y el cómputo de volumen, y agrega el caudal.
 */
export type ModoExcavacion = 'lineal' | 'area' | 'canal'

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
 * Se suma recinto por recinto, y acá tampoco daría lo mismo promediar: con
 * taludes el volumen **no** es lineal en la profundidad, porque el fondo se
 * achica a medida que se baja. Dos pozos de 1 y 3 m no dan lo mismo que dos de
 * 2 m, por la misma razón que en el modo lineal aunque la geometría sea otra.
 */
export function computarObraArea(
  mat: MaterialExcavacion, recintos: RecintoExcavacion[], talud = 0,
): ComputoObraExc & { porRecinto: ComputoRecinto[]; algunoCerrado: boolean } {
  const porRecinto = recintos.map(r => computarRecinto(mat, r, talud))

  /*
   * La superficie sale del **cómputo**, no del `area_ha` guardado en el
   * recinto: el área se recalcula desde el polígono, así que si las dos fuentes
   * se separaran —un recinto viejo, un redondeo distinto— la lista y el total
   * dirían números distintos para lo mismo. Y "sin dibujar" es no tener
   * superficie computada, que es lo que de verdad lo deja fuera del cálculo.
   */
  let ha_total = 0, Vcorte = 0, Vesp = 0, W = 0, sumaHA = 0, sinDibujar = 0
  for (let i = 0; i < recintos.length; i++) {
    const r = recintos[i], c = porRecinto[i]
    const ha = c.area_m2 / 10_000
    if (c.area_m2 <= 0) sinDibujar++
    ha_total += ha
    Vcorte += c.Vcorte
    Vesp += c.Vesp
    W += c.W
    sumaHA += r.H * ha
  }

  return {
    ...VACIO, porRecinto, ha_total, Vcorte, Vesp, W, sinDibujar,
    H_media: ha_total > 0 ? sumaHA / ha_total : 0,
    algunoCerrado: porRecinto.some(c => c.fondoCerrado),
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
