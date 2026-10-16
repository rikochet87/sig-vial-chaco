/**
 * Crecida en Barranqueras a partir de lo que pasa en el Paraná brasileño:
 * lluvia → caudal (GR4J) → represas → Barranqueras → altura en la escala.
 *
 * Puro: sin red ni archivos. Los datos los arma `scripts/build_crecida.mjs`, la
 * calibración `scripts/calibrar_crecida.ts`, y el método completo con sus
 * números está en `docs/pronostico-crecida-barranqueras.md`.
 *
 * ── La cadena ─────────────────────────────────────────────────────────────────
 *
 * 1. **Lo que ya salió de Brasil** se usa medido: Itaipú y el Iguazú, del ONS,
 *    con dos días de atraso.
 * 2. **Lo que todavía no salió** se calcula con GR4J sobre la lluvia observada y
 *    la pronosticada, en dos cuencas: el Iguazú y la incremental de Itaipú.
 *    Lo que llega de Porto Primavera y Rosana se toma medido con su demora de
 *    dos días y, más allá, quieto: lo regula el operador.
 * 3. **De Itaipú + Iguazú a Barranqueras**: una función de respuesta lineal
 *    (convolución) ajustada por mínimos cuadrados, más el Paraguay.
 * 4. **A la altura**: por la curva altura–caudal de Barranqueras.
 *
 * ── Dos correcciones, y por qué ───────────────────────────────────────────────
 *
 * - **Actualización de estado** (`razonInicial`): el modelo se escala para que
 *   coincida con lo medido el último día, y la corrección se desvanece con
 *   `TAU_ACTUALIZACION` días. ERA5 aplasta las tormentas y el modelo arranca
 *   corto en una crecida.
 * - **Mezcla con la persistencia** (`ALFA`): la previsión es lo último medido
 *   más una fracción del cambio que da el modelo. A uno o dos días lo medido es
 *   mejor que cualquier modelo, y la fracción lo dice.
 *
 * ── Qué no afirma ─────────────────────────────────────────────────────────────
 *
 * No es un pronóstico oficial: el del INA lo es. La respuesta es lineal y no
 * representa la llanura de inundación, que en subidas muy rápidas guarda más
 * agua: ahí tiende a pasarse.
 */

// ── Fechas ────────────────────────────────────────────────────────────────────

const DIA_MS = 86_400_000
/** Día entero desde 1970-01-01 (UTC) */
export const diaDe = (iso: string) => Math.round(Date.parse(iso.slice(0, 10) + 'T00:00:00Z') / DIA_MS)
export const isoDe = (dia: number) => new Date(dia * DIA_MS).toISOString().slice(0, 10)

/** Serie diaria: un valor por día desde `desde`; `null` es hueco */
export interface Serie {
  desde: string
  valores: (number | null)[]
}

/** Lector de una serie por día entero; fuera de rango o hueco da `null` */
export function lector(s: Serie): (dia: number) => number | null {
  const d0 = diaDe(s.desde)
  return (dia: number) => {
    const v = s.valores[dia - d0]
    return v === undefined || v === null || !Number.isFinite(v) ? null : v
  }
}

// ── Métricas ──────────────────────────────────────────────────────────────────

/** Nash–Sutcliffe; 1 es perfecto, 0 es lo mismo que el promedio */
export function nse(obs: number[], sim: number[]): number {
  const m = obs.reduce((a, b) => a + b, 0) / obs.length
  let num = 0, den = 0
  for (let i = 0; i < obs.length; i++) { num += (obs[i] - sim[i]) ** 2; den += (obs[i] - m) ** 2 }
  return 1 - num / den
}

/** Kling–Gupta (2009): correlación, variabilidad y sesgo; 1 es perfecto */
export function kge(obs: number[], sim: number[]): number {
  const n = obs.length
  const mo = obs.reduce((a, b) => a + b, 0) / n
  const ms = sim.reduce((a, b) => a + b, 0) / n
  let so = 0, ss = 0, c = 0
  for (let i = 0; i < n; i++) { so += (obs[i] - mo) ** 2; ss += (sim[i] - ms) ** 2; c += (obs[i] - mo) * (sim[i] - ms) }
  const r = c / Math.sqrt(so * ss)
  const alfa = Math.sqrt(ss / so)
  const beta = ms / mo
  return 1 - Math.sqrt((r - 1) ** 2 + (alfa - 1) ** 2 + (beta - 1) ** 2)
}

// ── Optimización ──────────────────────────────────────────────────────────────

/**
 * Nelder–Mead sin restricciones. Para parámetros acotados, el que llama
 * transforma (ver `acotar`). Minimiza `f`.
 */
export function nelderMead(f: (x: number[]) => number, x0: number[], iter = 400, paso = 0.8): { x: number[]; f: number } {
  const n = x0.length
  let S: number[][] = [x0.slice()]
  for (let i = 0; i < n; i++) { const x = x0.slice(); x[i] += paso; S.push(x) }
  let F = S.map(f)
  for (let k = 0; k < iter; k++) {
    const orden = F.map((_, i) => i).sort((a, b) => F[a] - F[b])
    S = orden.map(i => S[i]); F = orden.map(i => F[i])
    const c = new Array(n).fill(0)
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += S[i][j] / n
    const xr = c.map((v, j) => v + (v - S[n][j])); const fr = f(xr)
    if (fr < F[0]) {
      const xe = c.map((v, j) => v + 2 * (v - S[n][j])); const fe = f(xe)
      if (fe < fr) { S[n] = xe; F[n] = fe } else { S[n] = xr; F[n] = fr }
    } else if (fr < F[n - 1]) { S[n] = xr; F[n] = fr }
    else {
      const xc = c.map((v, j) => v + 0.5 * (S[n][j] - v)); const fc = f(xc)
      if (fc < F[n]) { S[n] = xc; F[n] = fc }
      else for (let i = 1; i <= n; i++) { S[i] = S[i].map((v, j) => S[0][j] + 0.5 * (v - S[0][j])); F[i] = f(S[i]) }
    }
  }
  const i0 = F.indexOf(Math.min(...F))
  return { x: S[i0], f: F[i0] }
}

/** Pasa un número sin límite al intervalo [lo, hi] (sigmoide) */
export const acotar = (u: number, lo: number, hi: number) => lo + (hi - lo) / (1 + Math.exp(-u))

/** Mínimos cuadrados por ecuaciones normales con pivoteo parcial */
export function minimosCuadrados(X: number[][], y: number[]): number[] {
  const p = X[0].length
  const A = Array.from({ length: p }, () => new Array(p + 1).fill(0))
  for (let i = 0; i < X.length; i++) {
    const x = X[i]
    for (let a = 0; a < p; a++) { for (let b = 0; b < p; b++) A[a][b] += x[a] * x[b]; A[a][p] += x[a] * y[i] }
  }
  for (let i = 0; i < p; i++) {
    let mx = i
    for (let r = i + 1; r < p; r++) if (Math.abs(A[r][i]) > Math.abs(A[mx][i])) mx = r
    ;[A[i], A[mx]] = [A[mx], A[i]]
    for (let r = 0; r < p; r++) if (r !== i) {
      const f = A[r][i] / A[i][i]
      for (let c = i; c <= p; c++) A[r][c] -= f * A[i][c]
    }
  }
  return A.map((r, i) => r[p] / r[i])
}

// ── Función de respuesta: Itaipú + Iguazú → Barranqueras ─────────────────────

/** Días de demora con peso propio; entre ellos, la respuesta se ajusta libre */
export const DEMORAS_RESPUESTA = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14] as const
/** El Paraguay entra como promedio de lo que pasó en Puerto Pilcomayo entre estos días antes */
export const VENTANA_PARAGUAY: readonly [number, number] = [5, 14]

export interface Respuesta {
  /** Un peso por demora de `DEMORAS_RESPUESTA` */
  pesos: number[]
  /** Coeficiente del Paraguay */
  paraguay: number
  /** Aporte fijo, m³/s: Misiones, Paraguay oriental, el Bermejo y el resto */
  constante: number
}

/** Filas de la regresión; `null` si falta algún dato */
function filaRespuesta(dia: number, I: (d: number) => number | null, P: (d: number) => number | null): number[] | null {
  const x: number[] = []
  for (const j of DEMORAS_RESPUESTA) { const v = I(dia - j); if (v === null) return null; x.push(v) }
  let s = 0, c = 0
  for (let d = VENTANA_PARAGUAY[0]; d <= VENTANA_PARAGUAY[1]; d++) { const v = P(dia - d); if (v !== null) { s += v; c++ } }
  if (c < 5) return null
  x.push(s / c, 1)
  return x
}

export function ajustarRespuesta(
  I: (d: number) => number | null, P: (d: number) => number | null, B: (d: number) => number | null,
  desde: number, hasta: number,
): { respuesta: Respuesta; n: number } {
  const X: number[][] = [], y: number[] = []
  for (let d = desde; d < hasta; d++) {
    const x = filaRespuesta(d, I, P), b = B(d)
    if (x && b !== null) { X.push(x); y.push(b) }
  }
  const co = minimosCuadrados(X, y)
  const k = DEMORAS_RESPUESTA.length
  return { respuesta: { pesos: co.slice(0, k), paraguay: co[k], constante: co[k + 1] }, n: X.length }
}

/** Caudal en Barranqueras que da la respuesta para el día `dia` */
export function caudalRespuesta(r: Respuesta, dia: number, I: (d: number) => number | null, P: (d: number) => number | null): number | null {
  const x = filaRespuesta(dia, I, P)
  if (!x) return null
  let s = r.constante
  for (let i = 0; i < r.pesos.length; i++) s += r.pesos[i] * x[i]
  return s + r.paraguay * x[r.pesos.length]
}

// ── Curva altura–caudal ───────────────────────────────────────────────────────

/** Pares [altura en m, caudal en m³/s], crecientes en los dos */
export type Curva = [number, number][]

/**
 * Arma la curva con la mediana del caudal por franja de `paso` metros, sobre
 * los días que tienen las dos cosas. Fuerza que sea creciente y la prolonga
 * con la pendiente del último metro hasta `hastaM`: arriba de lo medido es una
 * extrapolación, y quien la use tiene que decirlo.
 */
export function armarCurva(pares: [number, number][], paso = 0.25, minDias = 5, hastaM = 10): Curva {
  const franjas = new Map<number, number[]>()
  for (const [h, q] of pares) {
    const b = Math.round(h / paso) * paso
    const l = franjas.get(b); if (l) l.push(q); else franjas.set(b, [q])
  }
  const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }
  const c: Curva = [...franjas.entries()].filter(([, l]) => l.length >= minDias).sort((a, b) => a[0] - b[0]).map(([h, l]) => [h, med(l)])
  for (let i = 1; i < c.length; i++) if (c[i][1] <= c[i - 1][1]) c[i][1] = c[i - 1][1] + 1
  const n = c.length
  const k = Math.max(0, n - 1 - Math.round(1 / paso))
  const pend = (c[n - 1][1] - c[k][1]) / (c[n - 1][0] - c[k][0])
  for (let h = c[n - 1][0] + paso; h <= hastaM + 1e-9; h += paso) c.push([+h.toFixed(3), c[c.length - 1][1] + pend * paso])
  return c
}

export function alturaDe(curva: Curva, q: number): number {
  if (q <= curva[0][1]) return curva[0][0]
  for (let i = 1; i < curva.length; i++) if (q <= curva[i][1]) {
    const [h0, q0] = curva[i - 1], [h1, q1] = curva[i]
    return h0 + (h1 - h0) * (q - q0) / (q1 - q0)
  }
  return curva[curva.length - 1][0]
}

export function caudalDe(curva: Curva, h: number): number {
  if (h <= curva[0][0]) return curva[0][1]
  for (let i = 1; i < curva.length; i++) if (h <= curva[i][0]) {
    const [h0, q0] = curva[i - 1], [h1, q1] = curva[i]
    return q0 + (q1 - q0) * (h - h0) / (h1 - h0)
  }
  return curva[curva.length - 1][1]
}

// ── El pronóstico ─────────────────────────────────────────────────────────────

/** Días de atraso con que publica el ONS */
export const ATRASO_ONS = 2
/** Demora de Porto Primavera y Rosana hasta Itaipú, días */
export const DEMORA_ALTO_PARANA = 2
/** Días en que se desvanece la corrección del modelo al último dato medido */
export const TAU_ACTUALIZACION = 20
/** Tope de la corrección del modelo, en las dos direcciones */
export const RAZON_MAX = 2

/** Fracción del cambio del modelo que se suma a lo último medido, por anticipación en días */
export type Alfa = [number, number][]

export function alfaEn(alfa: Alfa, d: number): number {
  if (d <= alfa[0][0]) return alfa[0][1]
  for (let i = 1; i < alfa.length; i++) if (d <= alfa[i][0]) {
    const [d0, a0] = alfa[i - 1], [d1, a1] = alfa[i]
    return a0 + (a1 - a0) * (d - d0) / (d1 - d0)
  }
  return alfa[alfa.length - 1][1]
}

export interface EntradasPronostico {
  /** Día de emisión */
  hoy: number
  /** Itaipú + Iguazú medidos (defluente), m³/s */
  I: (d: number) => number | null
  /** Defluente de Itaipú medido */
  itaipu: (d: number) => number | null
  /** Defluente del Iguazú medido (Baixo Iguaçu, o Salto Caxias antes de 2005) */
  iguazu: (d: number) => number | null
  /** Porto Primavera + Rosana medidos */
  altoParana: (d: number) => number | null
  /** Incremental de Itaipú medido (ONS) */
  incItaipu: (d: number) => number | null
  /** Modelo: incremental de Itaipú, m³/s, para cualquier día del rango */
  incModelo: (d: number) => number | null
  /** Modelo: caudal natural del Iguazú, m³/s */
  iguazuModelo: (d: number) => number | null
  /** Razón defluente del Iguazú / natural modelado */
  razonIguazu: number
  alfa: Alfa
}

/**
 * Itaipú + Iguazú hacia adelante: medido hasta `hoy − ATRASO_ONS`, y después
 * lo último medido más una fracción del cambio que da el modelo actualizado.
 * Devuelve `null` si falta el último dato medido.
 */
export function proyectarI(e: EntradasPronostico): ((d: number) => number | null) | null {
  const L = e.hoy - ATRASO_ONS
  const IL = e.I(L), incL = e.incItaipu(L), igL = e.iguazu(L), upL = e.altoParana(L)
  const sIncL = e.incModelo(L), sIgL = e.iguazuModelo(L)
  if ([IL, incL, igL, upL, sIncL, sIgL].some(v => v === null)) return null
  const lim = (x: number) => Math.min(RAZON_MAX, Math.max(1 / RAZON_MAX, x))
  const ci = sIncL! > 0 ? lim(incL! / sIncL!) : 1
  const cg = sIgL! > 0 ? lim(igL! / (sIgL! * e.razonIguazu)) : 1
  return (d: number) => {
    if (d <= L) return e.I(d)
    const k = Math.exp(-(d - L) / TAU_ACTUALIZACION)
    const sInc = e.incModelo(d), sIg = e.iguazuModelo(d)
    if (sInc === null || sIg === null) return null
    const up = d - DEMORA_ALTO_PARANA <= L ? e.altoParana(d - DEMORA_ALTO_PARANA) : upL
    if (up === null) return null
    const modelo = up + sInc * (1 + (ci - 1) * k) + sIg * e.razonIguazu * (1 + (cg - 1) * k)
    return IL! + alfaEn(e.alfa, d - L) * (modelo - IL!)
  }
}

/**
 * Altura en Barranqueras `dias` días después de `hoy`, partiendo de la altura
 * medida hoy. La respuesta da el **cambio** de caudal desde hoy; ese cambio se
 * suma al caudal que corresponde a la altura de hoy, así el error de la
 * respuesta se cancela en la resta.
 */
export function alturaPronosticada(
  r: Respuesta, curva: Curva, hoy: number, alturaHoy: number, dias: number,
  I: (d: number) => number | null, paraguay: (d: number) => number | null,
): number | null {
  let ultimoPy: number | null = null
  for (let k = 1; k <= 20 && ultimoPy === null; k++) ultimoPy = paraguay(hoy - k)
  const Py = (d: number) => (d < hoy ? paraguay(d) ?? ultimoPy : ultimoPy)
  const q0 = caudalRespuesta(r, hoy, I, Py)
  const q1 = caudalRespuesta(r, hoy + dias, I, Py)
  if (q0 === null || q1 === null) return null
  return alturaDe(curva, caudalDe(curva, alturaHoy) + (q1 - q0))
}
