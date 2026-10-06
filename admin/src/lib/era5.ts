/**
 * La lluvia diaria de ERA5 congelada en `public/lluvia/era5/`: los tipos de los
 * archivos y cómo leerlos. Los genera `scripts/build_era5.ts`.
 *
 * **Es lluvia modelada, no medida**, y no se mezcla con la de los pluviómetros:
 * ningún número de la pantalla que hoy sale de la APA pasa a salir de acá. Está
 * para lo que un año de partes no puede dar —qué es normal para la época, qué
 * tan raro es un evento— y para cruzar con los caudales viejos del INA.
 *
 * Los nodos son los de la grilla de 0,25° del pronóstico por cuenca, así que
 * `asignarPuntos()` de `pronostico.ts` reparte éstos entre las cuencas igual
 * que aquéllos.
 */

/** `indice.json` */
export interface IndiceEra5 {
  fuente: string
  modelo: string
  variable: string
  generado: string
  nodos: { lat: number; lng: number }[]
  /** Año → hasta qué día llega su archivo, y si el año está entero */
  anios: Record<string, { hasta: string; dias: number; completo: boolean }>
}

/** `AAAA.json` */
export interface AnioEra5 {
  anio: number
  modelo: string
  desde: string
  hasta: string
  dias: number
  nodos: number
  /** Día por día y, adentro de cada día, nodo por nodo. Décimas de mm; null = sin dato */
  mm: (number | null)[]
}

const DIA_MS = 86_400_000

/** La fecha del día `d` del archivo, contando desde cero */
export const fechaDe = (a: AnioEra5, d: number) =>
  new Date(Date.parse(a.desde) + d * DIA_MS).toISOString().slice(0, 10)

/**
 * La lámina media diaria sobre un conjunto de nodos, en mm.
 *
 * Es un promedio simple: los nodos están a 0,25° unos de otros y a esta
 * latitud representan casi la misma superficie. Un día en que algún nodo no
 * tiene dato se promedia sobre los que sí; si no lo tiene ninguno, es `null` y
 * no cero.
 */
export function laminaDiaria(a: AnioEra5, indices: number[]): (number | null)[] {
  const out: (number | null)[] = new Array(a.dias)
  for (let d = 0; d < a.dias; d++) {
    let suma = 0, n = 0
    for (const i of indices) {
      const v = a.mm[d * a.nodos + i]
      if (v !== null && v !== undefined) { suma += v; n++ }
    }
    out[d] = n > 0 ? suma / n / 10 : null
  }
  return out
}

/** El total del archivo sobre esos nodos, en mm; `null` si no hay ningún día con dato */
export function laminaTotal(a: AnioEra5, indices: number[]): number | null {
  const serie = laminaDiaria(a, indices)
  if (serie.every(v => v === null)) return null
  return serie.reduce((s: number, v) => s + (v ?? 0), 0)
}
