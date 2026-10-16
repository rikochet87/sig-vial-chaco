/**
 * Modelo lluvia–caudal **GR4J** (Perrin, Michel y Andréassian, 2003), paso
 * diario. Puro: sin red, sin React, sin lectura de archivos.
 *
 * ── Qué es ────────────────────────────────────────────────────────────────────
 *
 * El modelo diario más usado en hidrología operativa. Cuatro parámetros:
 *
 * | | Qué es | Unidad |
 * |---|---|---|
 * | `x1` | capacidad del almacenamiento de producción (el suelo) | mm |
 * | `x2` | intercambio con otras cuencas (positivo gana, negativo pierde) | mm/d |
 * | `x3` | capacidad del almacenamiento de tránsito | mm |
 * | `x4` | base del hidrograma unitario | d |
 *
 * Entra lluvia y evapotranspiración potencial en mm/d, sale caudal en mm/d
 * sobre la cuenca. Para pasarlo a m³/s se multiplica por `areaKm2 / 86,4`.
 *
 * ── De dónde sale cada paso ───────────────────────────────────────────────────
 *
 * Es la formulación del artículo y del paquete `airGR` de INRAE, que es la
 * implementación de referencia. `scripts/verificar-crecida.ts` compara esta
 * contra el núcleo Fortran de `airGR` (vía el paquete de Python `hydrogr`)
 * sobre series fijas: tienen que dar lo mismo a la millonésima.
 *
 * Dos detalles que copian a `airGR` y no al artículo, porque es lo que se
 * compara:
 *
 * - **El cociente lluvia/capacidad se topa en 13** antes de la tangente
 *   hiperbólica (`TOPE_TANH`). `tanh(13)` ya es 1 en doble precisión; el tope
 *   evita desbordes con `x1` chicos.
 * - **Los hidrogramas unitarios tienen 20 y 40 casillas fijas**, como los
 *   vectores de estado de `airGR`. Por eso `x4` no puede pasar de 20 días
 *   (`X4_MAX`).
 *
 * ── El balance de agua cierra ─────────────────────────────────────────────────
 *
 * `balance` devuelve lo que entró, lo que se evaporó, lo que salió, lo que se
 * intercambió y cuánto cambió cada almacenamiento. Tienen que cerrar a cero, y
 * el test lo afirma: es la comprobación de que no se crea ni se pierde agua en
 * ningún paso.
 */

export interface ParametrosGr4j {
  /** Capacidad del almacenamiento de producción, mm */
  x1: number
  /** Intercambio con otras cuencas, mm/d */
  x2: number
  /** Capacidad del almacenamiento de tránsito, mm */
  x3: number
  /** Base del hidrograma unitario, días */
  x4: number
}

export interface EstadoGr4j {
  /** Almacenamiento de producción, mm */
  s: number
  /** Almacenamiento de tránsito, mm */
  r: number
  /**
   * Lo que el hidrograma unitario 1 tiene que entregar, mm (20 casillas). La
   * casilla 0 es lo que salió el último día corrido; de la 1 en adelante, lo
   * que falta.
   */
  uh1: number[]
  /** Ídem del hidrograma unitario 2 (40 casillas) */
  uh2: number[]
}

export interface BalanceGr4j {
  lluvia: number
  /** Evaporación real: la que se toma de la lluvia más la del suelo */
  evaporacion: number
  caudal: number
  /** Intercambio neto realmente aplicado (después de los recortes a cero) */
  intercambio: number
  /** Cambio de agua guardada: suelo, tránsito e hidrogramas */
  cambioAlmacenado: number
  /** lluvia + intercambio − evaporación − caudal − cambioAlmacenado; tiene que ser ~0 */
  residuo: number
}

export interface ResultadoGr4j {
  /** Caudal en mm/d, uno por día de entrada */
  q: Float64Array
  /** Estado al final, para seguir desde ahí */
  estado: EstadoGr4j
  balance: BalanceGr4j
}

export const NUH1 = 20
export const NUH2 = 40
export const X4_MAX = NUH1
const TOPE_TANH = 13
const D = 2.5

/** Curva en S de los hidrogramas unitarios */
function sh1(t: number, x4: number): number {
  if (t <= 0) return 0
  if (t < x4) return Math.pow(t / x4, D)
  return 1
}
function sh2(t: number, x4: number): number {
  if (t <= 0) return 0
  if (t < x4) return 0.5 * Math.pow(t / x4, D)
  if (t < 2 * x4) return 1 - 0.5 * Math.pow(2 - t / x4, D)
  return 1
}

/** Ordenadas de los dos hidrogramas unitarios; cada uno suma 1 */
export function ordenadas(x4: number): { uh1: number[]; uh2: number[] } {
  const uh1: number[] = []
  const uh2: number[] = []
  for (let i = 1; i <= NUH1; i++) uh1.push(sh1(i, x4) - sh1(i - 1, x4))
  for (let i = 1; i <= NUH2; i++) uh2.push(sh2(i, x4) - sh2(i - 1, x4))
  return { uh1, uh2 }
}

/** Estado de arranque de `airGR` por defecto: suelo al 30 %, tránsito al 50 % */
export function estadoInicial(p: ParametrosGr4j, fs = 0.3, fr = 0.5): EstadoGr4j {
  return { s: fs * p.x1, r: fr * p.x3, uh1: new Array(NUH1).fill(0), uh2: new Array(NUH2).fill(0) }
}

function validar(p: ParametrosGr4j) {
  if (!(p.x1 > 0) || !(p.x3 > 0)) throw new Error('GR4J: x1 y x3 tienen que ser positivos')
  if (!(p.x4 >= 0.5) || p.x4 > X4_MAX) throw new Error(`GR4J: x4 tiene que estar entre 0,5 y ${X4_MAX} días`)
}

/**
 * Corre el modelo sobre `lluvia` y `etp` (mm/d, misma longitud). Un valor que
 * no es número se toma como cero: el que llama es responsable de no pasar
 * huecos —con una serie areal completa no los hay—.
 */
export function gr4j(
  lluvia: ArrayLike<number>,
  etp: ArrayLike<number>,
  p: ParametrosGr4j,
  inicio?: EstadoGr4j,
): ResultadoGr4j {
  validar(p)
  if (lluvia.length !== etp.length) throw new Error('GR4J: lluvia y etp de distinto largo')
  const { x1, x2, x3, x4 } = p
  const { uh1: o1, uh2: o2 } = ordenadas(x4)
  const e0 = inicio ?? estadoInicial(p)
  let s = Math.min(e0.s, x1)
  let r = Math.min(e0.r, x3)
  const b1 = e0.uh1.slice()
  const b2 = e0.uh2.slice()
  const pendiente = (b: number[]) => b.reduce((a, v, i) => (i === 0 ? a : a + v), 0)
  const almacenado0 = s + r + pendiente(b1) + pendiente(b2)

  const n = lluvia.length
  const q = new Float64Array(n)
  let totP = 0, totEv = 0, totQ = 0, totX = 0

  for (let t = 0; t < n; t++) {
    const pr = Number.isFinite(lluvia[t]) ? lluvia[t] : 0
    const ep = Number.isFinite(etp[t]) ? etp[t] : 0
    totP += pr

    let pn = 0, ps = 0, es = 0
    if (pr <= ep) {
      // La lluvia se evapora entera y el resto de la demanda se toma del suelo
      const en = ep - pr
      const ws = Math.min(en / x1, TOPE_TANH)
      const th = Math.tanh(ws)
      const sr = s / x1
      es = s * (2 - sr) * th / (1 + (1 - sr) * th)
      const antes = s
      s = Math.max(0, s - es)
      totEv += pr + (antes - s)
    } else {
      pn = pr - ep
      const ws = Math.min(pn / x1, TOPE_TANH)
      const th = Math.tanh(ws)
      const sr = s / x1
      ps = x1 * (1 - sr * sr) * th / (1 + sr * th)
      s += ps
      totEv += ep
    }

    // Percolación
    const sr4 = Math.pow(s / x1, 4)
    const perc = s * (1 - Math.pow(1 + sr4 / 25.62890625, -0.25))
    s -= perc

    const prout = perc + (pn - ps)

    // Hidrogramas unitarios. La casilla 0 es lo que sale hoy; al correr las
    // casillas, la de hoy se descarta porque ya se entregó ayer.
    for (let k = 0; k < NUH1 - 1; k++) b1[k] = b1[k + 1] + o1[k] * 0.9 * prout
    b1[NUH1 - 1] = o1[NUH1 - 1] * 0.9 * prout
    for (let k = 0; k < NUH2 - 1; k++) b2[k] = b2[k + 1] + o2[k] * 0.1 * prout
    b2[NUH2 - 1] = o2[NUH2 - 1] * 0.1 * prout
    const q9 = b1[0]
    const q1 = b2[0]

    // Intercambio
    const ex = x2 * Math.pow(r / x3, 3.5)

    // Almacenamiento de tránsito
    const rAntes = r
    r = Math.max(0, r + q9 + ex)
    const exR = r - rAntes - q9
    const qr = r * (1 - Math.pow(1 + Math.pow(r / x3, 4), -0.25))
    r -= qr

    // Escurrimiento directo
    const qd = Math.max(0, q1 + ex)
    const exD = qd - q1

    q[t] = qr + qd
    totQ += q[t]
    totX += exR + exD
  }

  const almacenado1 = s + r + pendiente(b1) + pendiente(b2)
  const cambio = almacenado1 - almacenado0
  return {
    q,
    estado: { s, r, uh1: b1, uh2: b2 },
    balance: {
      lluvia: totP, evaporacion: totEv, caudal: totQ, intercambio: totX,
      cambioAlmacenado: cambio,
      residuo: totP + totX - totEv - totQ - cambio,
    },
  }
}

/** mm/d sobre una cuenca → m³/s */
export const mmDiaAM3s = (mm: number, areaKm2: number) => (mm * areaKm2) / 86.4
