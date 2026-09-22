/**
 * Calibración del modelo de lluvia contra el pluviómetro.
 *
 * El modelo (Open-Meteo sobre la red vial) acierta muy bien si llovió o no,
 * pero no cuánto. Contra el parte de la APA del 18/09/2026, en 43 localidades:
 * correlación 0,36, sobrestima 37 % en promedio, y de las diez más llovidas
 * acierta cuatro. Este módulo es la maquinaria para medir eso de forma continua
 * y, si el sesgo resulta estable, corregirlo.
 *
 * Tres piezas:
 *   · `leerParteApa`   — saca los milímetros del texto que publica la prensa
 *   · `metricas`       — cuánto se equivoca, sobre los pares que haya
 *   · `ajustar/aplicar`— la corrección, con validación fuera de muestra
 *
 * Todo son funciones puras: se verifican sin red y sin base.
 */

import {
  buscarEstacion, normalizarNombre, ESTACIONES_APA, ALIAS_ESTACIONES,
} from '@/data/estacionesApa'

// ── Lectura del parte ─────────────────────────────────────────────────────────

export interface LecturaParte {
  estacion: string
  mm: number
  /** El fragmento del que salió, para que se pueda revisar antes de guardar */
  contexto: string
}

export interface ResultadoParte {
  lecturas: LecturaParte[]
  /** Nombres que aparecían con milímetros pero no están en la lista de estaciones */
  desconocidos: { nombre: string; mm: number; contexto: string }[]
}

/** Distancia máxima, en caracteres, entre el nombre y su número */
const VENTANA = 45

/**
 * "N milímetros EN Pampa Almirón" — el número manda sobre lo que viene después.
 * Se incluye "de" porque el parte alterna: "los 46 milímetros de Pampa Almirón".
 */
const HACIA_ADELANTE = /^\s*(?:mil[ií]metros?|mm)?\s*(?:en|de|para)\s/

/**
 * Números que son fechas, no milímetros.
 *
 * "La estación de Resistencia marcó 4 milímetros durante el viernes 18" — ese
 * 18 es el día, pero queda más cerca de la localidad siguiente que su propio
 * valor, así que se lo llevaba puesto. Descartarlos es más seguro que afinar
 * distancias.
 */
const DIA_SEMANA = /\b(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo|dia|del)\s*$/
const MES_DESPUES =
  /^\s*de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/

/** "Pampa Almirón CON 46 milímetros" — el número manda sobre lo que viene antes */
const HACIA_ATRAS =
  /\b(?:con|registro|acumulo|marco|tuvo|recibio|alcanzo|sumo|fue de)\s*$/

const ACENTOS: Record<string, string> = {
  á:'a', é:'e', í:'i', ó:'o', ú:'u', ü:'u', Á:'a', É:'e', Í:'i', Ó:'o', Ú:'u', Ü:'u',
  à:'a', è:'e', ì:'i', ò:'o', ù:'u', â:'a', ê:'e', î:'i', ô:'o', û:'u',
  // La eñe va a "n" igual que en `normalizarNombre`, que la descompone con NFD.
  // Si acá se conservara, "Sáenz Peña" nunca coincidiría con "saenz pena" y se
  // perderían justo las localidades con eñe: Peña, Las Breñas.
  ñ:'n', Ñ:'n',
}

/**
 * Normaliza sin mover ni un carácter de lugar.
 *
 * Hace falta que las posiciones del texto normalizado y del original coincidan
 * para poder saber si entre un número y un nombre hay un punto — y el punto
 * importa: corta la enumeración. Con `normalizarNombre`, que colapsa espacios,
 * los índices se desfasan y esa información se pierde.
 */
function normalizarConservandoPosiciones(s: string): string {
  let out = ''
  for (const ch of s) {
    const base = ACENTOS[ch] ?? ch.toLowerCase()
    out += /[a-z0-9.]/.test(base) ? base : ' '
  }
  return out
}

/**
 * Extrae "localidad → milímetros" del texto del parte.
 *
 * La prensa lo escribe en prosa y con formas muy variadas:
 *   "Pampa Almirón encabezó los registros de la jornada con 46 milímetros"
 *   "23 milímetros en El Espinillo, 22 en Presidencia Roca y 7 en Nueva Pompeya"
 *   "Las Breñas, Villa Ángela y General Pinedo con un milímetro"
 *
 * Intentar parsear la gramática es pelear una batalla perdida: cada nota está
 * redactada distinto. Acá se hace al revés — se buscan los nombres de estación
 * que YA conocemos y a cada uno se le asigna el número más cercano. Es robusto
 * al fraseo, a los saltos de línea y a las enumeraciones donde tres localidades
 * comparten un valor.
 *
 * Deliberadamente conservador: prefiere no reconocer algo a inventarlo. Lo que
 * saca se muestra para revisar antes de guardar.
 */
export function leerParteApa(texto: string): ResultadoParte {
  // Los saltos de línea parten los nombres ("General\nSan Martín")
  const t = texto.replace(/\s+/g, ' ')
  const plano = normalizarConservandoPosiciones(t)

  /** ¿Hay un punto entre estas dos posiciones? Entonces son oraciones distintas. */
  const cortaOracion = (a: number, b: number) =>
    plano.slice(Math.min(a, b), Math.max(a, b)).includes('.')

  // ── Todos los números que pueden ser milímetros ──────────────────────────
  interface Num { valor: number; pos: number; fin: number }
  const numeros: Num[] = []

  // Hasta tres dígitos: cuatro ya es un año, no una lluvia
  for (const m of plano.matchAll(/(?<!\d)(\d{1,3})(?:[.,](\d))?(?!\d)/g)) {
    const valor = Number(m[1]) + (m[2] ? Number(m[2]) / 10 : 0)
    if (valor > 600) continue
    const pos = m.index!, fin = pos + m[0].length
    if (DIA_SEMANA.test(plano.slice(Math.max(0, pos - 12), pos))) continue
    if (MES_DESPUES.test(plano.slice(fin, fin + 16))) continue
    numeros.push({ valor, pos, fin })
  }
  // "con un milímetro" / "apenas un milímetro"
  for (const m of plano.matchAll(/\bun(?:a)? (?:mil[ií]metros?|mm)\b/g)) {
    numeros.push({ valor: 1, pos: m.index!, fin: m.index! + m[0].length })
  }
  numeros.sort((a, b) => a.pos - b.pos)

  // ── Cada aparición de un nombre conocido ─────────────────────────────────
  const candidatos: { nombre: string; norm: string }[] = [
    ...ESTACIONES_APA.map(e => ({ nombre: e.nombre, norm: normalizarNombre(e.nombre) })),
    ...Object.entries(ALIAS_ESTACIONES).map(([alias, real]) => ({ nombre: real, norm: alias })),
  ]
  // De más largo a más corto: "Presidencia Roque Sáenz Peña" antes que "Sáenz
  // Peña", si no el nombre corto se come el lugar del largo.
  candidatos.sort((a, b) => b.norm.length - a.norm.length)

  interface Nom { nombre: string; pos: number; fin: number }
  const noms: Nom[] = []
  const tomado = new Array<boolean>(plano.length).fill(false)

  for (const c of candidatos) {
    let desde = 0
    for (;;) {
      const i = plano.indexOf(c.norm, desde)
      if (i < 0) break
      const fin = i + c.norm.length
      desde = fin

      // Palabra completa, no un pedazo de otra. El punto cuenta como borde: la
      // última localidad de la oración queda pegada a él ("en Capitán Solari."),
      // y exigir espacio la dejaba afuera.
      const borde = (c: string | undefined) => c === undefined || c === ' ' || c === '.'
      if (!borde(i === 0 ? ' ' : plano[i - 1]) || !borde(plano[fin])) continue
      // Solapado con un nombre más largo que ya lo cubre
      let libre = true
      for (let k = i; k < fin; k++) if (tomado[k]) { libre = false; break }
      if (!libre) continue

      for (let k = i; k < fin; k++) tomado[k] = true
      noms.push({ nombre: c.nombre, pos: i, fin })
    }
  }
  // Se buscaron de más largo a más corto, así que salen desordenados
  noms.sort((a, b) => a.pos - b.pos)

  /**
   * Hacia dónde manda cada número.
   *
   * El castellano del parte tiene dos formas y el conector las distingue:
   * "23 milímetros EN El Espinillo" gobierna lo que sigue, "Villa Berthet CON
   * 10" gobierna lo que precede. Elegir por cercanía en vez de por conector
   * fallaba justo en las enumeraciones, que es donde está la mitad del parte.
   */
  type Dir = 'adelante' | 'atras'
  const dir = (n: Num): Dir => {
    if (HACIA_ADELANTE.test(plano.slice(n.fin, n.fin + 18))) return 'adelante'
    if (HACIA_ATRAS.test(plano.slice(Math.max(0, n.pos - 14), n.pos))) return 'atras'
    // Sin conector —"Laguna Limpia 10 y Ciervo Petiso 12"— gana el más cercano,
    // y ante la duda el de atrás, que es la forma más común así escrita.
    const prev = [...noms].reverse().find(x => x.fin <= n.pos)
    const next = noms.find(x => x.pos >= n.fin)
    const dPrev = prev ? n.pos - prev.fin : Infinity
    const dNext = next ? next.pos - n.fin : Infinity
    return dNext < dPrev ? 'adelante' : 'atras'
  }

  // ── Repartir: cada número toma los nombres contiguos en su dirección ─────
  const lecturas = new Map<string, LecturaParte>()
  const guardar = (nom: Nom, n: Num) => {
    if (lecturas.has(nom.nombre)) return      // el primero que aparece manda
    lecturas.set(nom.nombre, {
      estacion: nom.nombre,
      mm: n.valor,
      contexto: t.slice(Math.max(0, Math.min(nom.pos, n.pos) - 20),
                        Math.min(t.length, Math.max(nom.fin, n.fin) + 20)).trim(),
    })
  }

  for (const n of numeros) {
    const hacia = dir(n)
    if (hacia === 'adelante') {
      // Nombres que siguen, hasta el próximo número
      const tope = numeros.find(o => o.pos > n.fin)?.pos ?? Infinity
      for (const nom of noms) {
        if (nom.pos < n.fin || nom.pos >= tope) continue
        if (nom.pos - n.fin > VENTANA * 2) break
        if (cortaOracion(n.fin, nom.pos)) break
        guardar(nom, n)
      }
    } else {
      // Nombres que preceden, hasta el número anterior
      const previos = numeros.filter(o => o.fin <= n.pos)
      const piso = previos.length ? previos[previos.length - 1].fin : -1
      for (const nom of [...noms].reverse()) {
        if (nom.fin > n.pos || nom.fin <= piso) continue
        if (n.pos - nom.fin > VENTANA * 2) break
        if (cortaOracion(nom.fin, n.pos)) break
        guardar(nom, n)
      }
    }
  }

  // ── Nombres con milímetros que no están en la lista ──────────────────────
  // Sirven para descubrir estaciones que faltan cargar. Se buscan sólo con el
  // patrón más seguro, "N milímetros en Nombre Propio", para no llenar de ruido.
  const desconocidos = new Map<string, { nombre: string; mm: number; contexto: string }>()
  for (const m of t.matchAll(
    /(?<!\d)(\d{1,3})\s*(?:mil[íi]metros?|mm)\s+en\s+([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ'’.\-]*(?:\s+(?:de|del|la|el|los|las)?\s*[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ'’.\-]*){0,3})/g,
  )) {
    const nombre = m[2].trim()
    const valor = Number(m[1])
    if (valor > 600) continue
    if (buscarEstacion(nombre)) continue
    const k = normalizarNombre(nombre)
    if (!k || k.length < 3 || desconocidos.has(k)) continue
    // "Presidencia" no es una estación nueva: es el principio de "Presidencia
    // de la Plaza". Sin esto la lista de desconocidas se llena de recortes.
    if (ESTACIONES_APA.some(e => normalizarNombre(e.nombre).startsWith(k + ' '))) continue
    desconocidos.set(k, { nombre, mm: valor, contexto: m[0] })
  }

  return {
    lecturas: [...lecturas.values()].sort((a, b) => b.mm - a.mm),
    desconocidos: [...desconocidos.values()].sort((a, b) => b.mm - a.mm),
  }
}

// ── Métricas ──────────────────────────────────────────────────────────────────

export interface Par {
  /** Lo que midió el pluviómetro */
  medido: number
  /** Lo que dijo el modelo para esa estación y fecha */
  modelo: number
}

export interface Metricas {
  n: number
  /** Promedio de lo medido y de lo modelado */
  mediaMedido: number
  mediaModelo: number
  /** Cuánto se pasa el modelo, en mm (positivo = sobrestima) */
  sesgo: number
  /** Cuánto se pasa en proporción; null si no llovió nada */
  sesgoRelativo: number | null
  /** Error típico sin importar el signo */
  errorAbsMedio: number
  rmse: number
  /** Correlación de Pearson: ¿acompaña el valor? */
  pearson: number | null
  /** Correlación de orden: ¿acierta quién recibió más? Es lo que importa para el mapa */
  spearman: number | null
  /** De los casos donde llovió o no llovió, cuántos acertó */
  aciertoLlovioONo: number
}

const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1)

function pearson(x: number[], y: number[]): number | null {
  if (x.length < 3) return null
  const mx = media(x), my = media(y)
  let num = 0, dx = 0, dy = 0
  for (let i = 0; i < x.length; i++) {
    num += (x[i] - mx) * (y[i] - my)
    dx += (x[i] - mx) ** 2
    dy += (y[i] - my) ** 2
  }
  if (dx === 0 || dy === 0) return null
  return num / Math.sqrt(dx * dy)
}

/** Rangos con empates promediados, como pide Spearman */
function rangos(xs: number[]): number[] {
  const orden = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0])
  const r: number[] = []
  let i = 0
  while (i < orden.length) {
    let j = i
    while (j + 1 < orden.length && orden[j + 1][0] === orden[i][0]) j++
    const promedio = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) r[orden[k][1]] = promedio
    i = j + 1
  }
  return r
}

const r2 = (v: number) => Math.round(v * 100) / 100
const r1 = (v: number) => Math.round(v * 10) / 10

export function metricas(pares: Par[]): Metricas {
  const med = pares.map(p => p.medido)
  const mod = pares.map(p => p.modelo)
  const mMed = media(med), mMod = media(mod)

  let ae = 0, se = 0, aciertos = 0
  for (const p of pares) {
    ae += Math.abs(p.modelo - p.medido)
    se += (p.modelo - p.medido) ** 2
    // "Llovió" es a partir de 1 mm: por debajo el pluviómetro tampoco distingue
    if ((p.medido >= 1) === (p.modelo >= 1)) aciertos++
  }

  return {
    n: pares.length,
    mediaMedido: r1(mMed),
    mediaModelo: r1(mMod),
    sesgo: r1(mMod - mMed),
    sesgoRelativo: mMed > 0.1 ? r2(mMod / mMed - 1) : null,
    errorAbsMedio: r1(ae / (pares.length || 1)),
    rmse: r1(Math.sqrt(se / (pares.length || 1))),
    pearson: pares.length >= 3 ? r2(pearson(med, mod) ?? NaN) || null : null,
    spearman: pares.length >= 3 ? r2(pearson(rangos(med), rangos(mod)) ?? NaN) || null : null,
    aciertoLlovioONo: pares.length ? r2(aciertos / pares.length) : 0,
  }
}

// ── Corrección ────────────────────────────────────────────────────────────────

/**
 * Factor multiplicativo que minimiza el error cuadrático.
 *
 * Es la corrección más simple que existe y es la adecuada acá: con pocas
 * decenas de pares, cualquier cosa más elaborada —una curva, un ajuste por
 * región o por estación del año— se ajusta al ruido y empeora fuera de muestra.
 * Si con el tiempo se juntan cientos de pares, ahí sí vale revisarlo.
 *
 * Se ajusta por mínimos cuadrados sin ordenada al origen: cuando el modelo dice
 * cero tiene que seguir diciendo cero, no un número negativo.
 */
export function ajustarFactor(pares: Par[]): number | null {
  const utiles = pares.filter(p => p.modelo > 0 || p.medido > 0)
  if (utiles.length < 10) return null            // con menos no hay nada que ajustar

  let num = 0, den = 0
  for (const p of utiles) { num += p.modelo * p.medido; den += p.modelo * p.modelo }
  if (den === 0) return null

  const f = num / den
  // Un factor fuera de este rango no es un sesgo: es que algo está mal en los
  // datos, y aplicarlo haría más daño que no corregir.
  if (!Number.isFinite(f) || f < 0.3 || f > 3) return null
  return r2(f)
}

export const aplicarFactor = (mm: number, factor: number | null): number =>
  factor == null ? mm : Math.round(mm * factor * 10) / 10

/**
 * Ajusta con una parte de los eventos y mide con el resto.
 *
 * Sin esto la corrección se evalúa sobre los mismos datos con los que se
 * calculó y siempre parece buena. La partición es por EVENTO y no por par: dos
 * localidades del mismo día se parecen entre sí, así que mezclarlas entre
 * ajuste y prueba filtraría información y volvería a inflar el resultado.
 */
export interface EvaluacionCorreccion {
  factor: number | null
  /** Con cuántos eventos se ajustó y con cuántos se probó */
  eventosAjuste: number
  eventosPrueba: number
  antes: Metricas
  despues: Metricas
  /** ¿Mejoró el error en los eventos que no se usaron para ajustar? */
  mejora: boolean
}

export function evaluarCorreccion(
  porEvento: Map<string, Par[]>,
  fraccionAjuste = 0.7,
): EvaluacionCorreccion | null {
  const eventos = [...porEvento.keys()].sort()
  if (eventos.length < 4) return null           // con menos no se puede partir

  const corte = Math.max(1, Math.floor(eventos.length * fraccionAjuste))
  const ajuste = eventos.slice(0, corte).flatMap(e => porEvento.get(e)!)
  const prueba = eventos.slice(corte).flatMap(e => porEvento.get(e)!)
  if (prueba.length < 10) return null

  const factor = ajustarFactor(ajuste)
  if (factor == null) return null

  const antes = metricas(prueba)
  const despues = metricas(prueba.map(p => ({ medido: p.medido, modelo: aplicarFactor(p.modelo, factor) })))

  return {
    factor,
    eventosAjuste: corte,
    eventosPrueba: eventos.length - corte,
    antes, despues,
    mejora: despues.errorAbsMedio < antes.errorAbsMedio,
  }
}
