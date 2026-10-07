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
  const porAnio = new Map<number, { mm: number; dias: number }>()
  for (let i = 0; i < serie.length; i++) {
    const v = serie[i]
    if (v === null) continue
    const anio = Number(fechaChirps(c, i).slice(0, 4))
    const a = porAnio.get(anio) ?? { mm: 0, dias: 0 }
    a.mm += v / 10
    a.dias++
    porAnio.set(anio, a)
  }
  const bisiesto = (a: number) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0
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
