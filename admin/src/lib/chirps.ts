/**
 * La lluvia diaria de CHIRPS por cuenca, desde 1981: el tipo del archivo que
 * genera `scripts/build_chirps.mjs` y cómo leerlo.
 *
 * **Es una estimación de satélite corregida con pluviómetros, no una
 * medición**, y no se mezcla con los partes de la APA: ningún número de la
 * pantalla que hoy sale de los pluviómetros pasa a salir de acá. Está para lo
 * que un año de partes no puede dar —qué es normal para la época, cada cuánto
 * se repite un evento— y para cruzar con los caudales viejos del INA.
 *
 * ── Dos cosas que hay que saber antes de usarla ───────────────────────────────
 *
 * **El día de CHIRPS no es el día de la APA.** Medido sobre la cuenca Negro -
 * Salado, la lluvia que la APA informa el 03/08/2026 CHIRPS la pone el 04/08.
 * Día por día correlaciona 0,64 con los pluviómetros; en ventanas de tres y de
 * siete días, 0,85. **Se usa en ventanas de varios días, no para un día
 * suelto** — que es además como se mira la lluvia en llanura.
 *
 * **Vale para el promedio de una cuenca.** Es lo único que hay en el archivo:
 * no hay un valor por punto.
 */

export interface ChirpsCuencas {
  fuente: string
  variable: string
  generado: string
  desde: string
  hasta: string
  /** Código de cuenca → un día por posición desde `desde`, en décimas de mm; null = sin dato */
  cuencas: Record<string, (number | null)[]>
}

const DIA_MS = 86_400_000

/** La fecha del día `i` del archivo, contando desde cero */
export const fechaChirps = (c: ChirpsCuencas, i: number) =>
  new Date(Date.parse(c.desde) + i * DIA_MS).toISOString().slice(0, 10)

/** El índice de una fecha en el archivo; puede caer afuera */
export const indiceChirps = (c: ChirpsCuencas, fecha: string) =>
  Math.round((Date.parse(fecha) - Date.parse(c.desde)) / DIA_MS)

const bisiesto = (a: number) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0
const DIAS_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const diasDelMes = (anio: number, mes: number) => (mes === 2 && bisiesto(anio) ? 29 : DIAS_MES[mes - 1])

/**
 * El año y el mes de cada posición del archivo.
 *
 * Se arma una vez por archivo: son 16 mil fechas, y todo lo de abajo las
 * recorre para cada cuenca.
 */
const calendarios = new WeakMap<ChirpsCuencas, { anio: Int16Array; mes: Int8Array }>()
function calendarioDe(c: ChirpsCuencas, n: number) {
  const previo = calendarios.get(c)
  if (previo && previo.anio.length >= n) return previo
  const anio = new Int16Array(n), mes = new Int8Array(n)
  const d = new Date(Date.parse(c.desde))
  for (let i = 0; i < n; i++) {
    anio[i] = d.getUTCFullYear()
    mes[i] = d.getUTCMonth() + 1
    d.setUTCDate(d.getUTCDate() + 1)
  }
  const cal = { anio, mes }
  calendarios.set(c, cal)
  return cal
}

export interface TotalAnual {
  anio: number
  /** Lámina del año, en mm */
  mm: number
  /** Días con dato */
  dias: number
  /** Si el año está entero */
  completo: boolean
}

/**
 * La lámina de cada año calendario de una cuenca.
 *
 * Un año al que le faltan días se informa igual, marcado: su total es de lo
 * que hay, no del año.
 */
export function totalesAnuales(c: ChirpsCuencas, cod: number): TotalAnual[] {
  const serie = c.cuencas[String(cod)]
  if (!serie) return []
  const { anio: anios } = calendarioDe(c, serie.length)
  const porAnio = new Map<number, { mm: number; dias: number }>()
  for (let i = 0; i < serie.length; i++) {
    const v = serie[i]
    if (v === null) continue
    const anio = anios[i]
    const a = porAnio.get(anio) ?? { mm: 0, dias: 0 }
    a.mm += v / 10
    a.dias++
    porAnio.set(anio, a)
  }
  return [...porAnio].sort((a, b) => a[0] - b[0]).map(([anio, a]) => ({
    anio, mm: a.mm, dias: a.dias, completo: a.dias === (bisiesto(anio) ? 366 : 365),
  }))
}

/**
 * La lámina acumulada en `dias` días corridos que terminan en cada día, en mm.
 *
 * Si a la ventana le falta algún día no hay número: una suma con huecos se
 * leería como una ventana seca.
 */
export function acumulado(c: ChirpsCuencas, cod: number, dias: number): (number | null)[] {
  const serie = c.cuencas[String(cod)]
  if (!serie || dias < 1) return []
  const out: (number | null)[] = new Array(serie.length).fill(null)
  let suma = 0, nulos = 0
  for (let i = 0; i < serie.length; i++) {
    const entra = serie[i]
    if (entra === null) nulos++; else suma += entra
    if (i >= dias) {
      const sale = serie[i - dias]
      if (sale === null) nulos--; else suma -= sale
    }
    if (i >= dias - 1 && nulos === 0) out[i] = suma / 10
  }
  return out
}

// ── Lo que alimenta la vista «Histórico» del panel de cuencas ────────────────

/**
 * Las ventanas en que se mira CHIRPS, en días corridos.
 *
 * **No hay ventana de un día a propósito**: el día de CHIRPS no es el de la
 * APA, y día por día correlaciona 0,64 con los pluviómetros.
 */
export const VENTANAS_CHIRPS = [3, 7, 30] as const

/**
 * La temporada va de julio a junio.
 *
 * Julio y agosto son los meses más secos en las trece cuencas —julio en nueve,
 * agosto en las cuatro del norte—. Con el año calendario la
 * temporada de lluvias —de octubre a abril— queda partida en dos, y un evento
 * de fin de diciembre aporta el máximo de dos años siendo uno solo.
 */
export const MES_INICIO_TEMPORADA = 7

/** El valor que deja por debajo la fracción `q` de la lista, interpolando */
export function cuantil(valores: number[], q: number): number {
  const v = [...valores].sort((a, b) => a - b)
  if (v.length === 0) return NaN
  const p = Math.min(1, Math.max(0, q)) * (v.length - 1)
  const i = Math.floor(p)
  return i + 1 < v.length ? v[i] + (v[i + 1] - v[i]) * (p - i) : v[i]
}

export interface MaximaTemporada {
  /** El año en que empieza: 2025 es la temporada 2025/26 */
  temporada: number
  /** La mayor lámina acumulada en la ventana, en mm */
  mm: number
  /** Primer y último día de esa ventana */
  desde: string
  hasta: string
  /** Si la temporada tiene todos sus días */
  completa: boolean
}

/**
 * La mayor lámina acumulada en `dias` días corridos de cada temporada.
 *
 * Una ventana es de la temporada en que termina. Si dos empatan queda la más
 * reciente.
 */
export function maximasPorTemporada(c: ChirpsCuencas, cod: number, dias: number): MaximaTemporada[] {
  const ac = acumulado(c, cod, dias)
  if (ac.length === 0) return []
  const { anio, mes } = calendarioDe(c, ac.length)
  const porTemporada = new Map<number, { mm: number; i: number; dias: number }>()
  for (let i = 0; i < ac.length; i++) {
    const v = ac[i]
    if (v === null) continue
    const t = mes[i] >= MES_INICIO_TEMPORADA ? anio[i] : anio[i] - 1
    const e = porTemporada.get(t)
    if (!e) porTemporada.set(t, { mm: v, i, dias: 1 })
    else { e.dias++; if (v >= e.mm) { e.mm = v; e.i = i } }
  }
  return [...porTemporada].sort((a, b) => a[0] - b[0]).map(([temporada, e]) => ({
    temporada, mm: e.mm,
    desde: fechaChirps(c, e.i - dias + 1), hasta: fechaChirps(c, e.i),
    // El 29 de febrero de una temporada cae en el año en que termina
    completa: e.dias === (bisiesto(temporada + 1) ? 366 : 365),
  }))
}

export interface FrecuenciaVentana {
  dias: number
  /** Cuántas temporadas enteras entraron en la cuenta */
  temporadas: number
  /** Lo que la mayor ventana de la temporada alcanza una de cada dos, cinco y diez veces, en mm */
  mediana: number
  unoEnCinco: number
  unoEnDiez: number
  /** La mayor de todo el archivo, esté o no en una temporada entera */
  mayor: MaximaTemporada
}

/** Con menos temporadas que éstas no se informa una de cada diez */
const TEMPORADAS_MINIMAS = 20

/**
 * Cada cuánto la mayor ventana de una temporada llega a cierta lámina.
 *
 * **Es una cuenta, no un ajuste**: los cuantiles de las mayores de cada
 * temporada entera. No extrapola: no dice nada de lo que pasa una vez cada
 * cien años.
 */
export function frecuenciaVentana(c: ChirpsCuencas, cod: number, dias: number): FrecuenciaVentana | null {
  const todas = maximasPorTemporada(c, cod, dias)
  const enteras = todas.filter(t => t.completa)
  if (enteras.length < TEMPORADAS_MINIMAS) return null
  const mm = enteras.map(t => t.mm)
  return {
    dias, temporadas: enteras.length,
    mediana: cuantil(mm, 0.5), unoEnCinco: cuantil(mm, 0.8), unoEnDiez: cuantil(mm, 0.9),
    mayor: todas.reduce((a, t) => (t.mm >= a.mm ? t : a)),
  }
}

export interface MesNormal {
  /** 1 a 12 */
  mes: number
  /** Cuántos años tienen ese mes entero */
  anios: number
  /** Lámina del mes: la mediana y el rango en que cae en ocho de cada diez años, en mm */
  mediana: number
  p10: number
  p90: number
  /** La última vez que ese mes está entero en el archivo */
  ultimo: { anio: number; mm: number } | null
}

/**
 * Lo que es normal para cada mes: la lámina mensual de todos los años del
 * archivo, y al lado la del último.
 *
 * Un mes al que le falta un día no entra.
 */
export function normalMensual(c: ChirpsCuencas, cod: number): MesNormal[] {
  const serie = c.cuencas[String(cod)]
  if (!serie) return []
  const { anio, mes } = calendarioDe(c, serie.length)
  const meses = new Map<number, { mm: number; dias: number }>()
  for (let i = 0; i < serie.length; i++) {
    const v = serie[i]
    if (v === null) continue
    const k = anio[i] * 12 + mes[i] - 1
    const e = meses.get(k) ?? { mm: 0, dias: 0 }
    e.mm += v / 10
    e.dias++
    meses.set(k, e)
  }
  const porMes: { anio: number; mm: number }[][] = Array.from({ length: 12 }, () => [])
  for (const [k, e] of [...meses].sort((a, b) => a[0] - b[0])) {
    const a = Math.floor(k / 12), m = (k % 12) + 1
    if (e.dias === diasDelMes(a, m)) porMes[m - 1].push({ anio: a, mm: e.mm })
  }
  return porMes.map((lista, i) => {
    const mm = lista.map(x => x.mm)
    return {
      mes: i + 1, anios: lista.length,
      mediana: cuantil(mm, 0.5), p10: cuantil(mm, 0.1), p90: cuantil(mm, 0.9),
      ultimo: lista.at(-1) ?? null,
    }
  })
}

export interface DoceMeses {
  /** Lámina de los 365 días que terminan en `hasta`, en mm */
  mm: number
  hasta: string
  /** La mediana de los mismos 365 días de cada año del archivo */
  mediana: number
  /** Qué lugar ocupa entre ellos, del más lluvioso (1) al más seco */
  puesto: number
  de: number
}

/**
 * Los últimos doce meses del archivo contra los mismos doce meses de cada año.
 *
 * Se compara contra la misma época y no contra el año calendario para que el
 * número no dependa de en qué mes termina el archivo.
 */
export function ultimosDoceMeses(c: ChirpsCuencas, cod: number): DoceMeses | null {
  const ac = acumulado(c, cod, 365)
  const mm = ac.at(-1)
  if (mm === null || mm === undefined) return null
  const hasta = fechaChirps(c, ac.length - 1)
  // Un 29 de febrero sólo existe en los bisiestos: se compara contra el 28
  const dia = hasta.slice(5) === '02-29' ? '02-28' : hasta.slice(5)
  const valores: number[] = [mm]
  for (let a = Number(c.desde.slice(0, 4)); a < Number(hasta.slice(0, 4)); a++) {
    const v = ac[indiceChirps(c, `${a}-${dia}`)]
    if (v !== null && v !== undefined) valores.push(v)
  }
  return {
    mm, hasta, mediana: cuantil(valores, 0.5),
    puesto: 1 + valores.filter(v => v > mm).length, de: valores.length,
  }
}

/** Los totales de cada año calendario entero de todas las cuencas, para descargar */
export function csvAnualChirps(c: ChirpsCuencas, cuencas: { cod: number; nombre: string }[]): string {
  const totales = cuencas.map(k => new Map(totalesAnuales(c, k.cod).filter(t => t.completo).map(t => [t.anio, t.mm])))
  const anios = [...new Set(totales.flatMap(t => [...t.keys()]))].sort((a, b) => a - b)
  const lineas = [
    `Lluvia media sobre cada cuenca por año calendario, en mm;${c.desde};${c.hasta}`,
    `${c.fuente}. Estimación de satélite, no medición`,
    '',
    ['Anio', ...cuencas.map(k => `${k.cod} ${k.nombre}`)].join(';'),
    ...anios.map(a => [a, ...totales.map(t => (t.has(a) ? t.get(a)!.toFixed(1).replace('.', ',') : ''))].join(';')),
  ]
  return lineas.join('\r\n')
}
