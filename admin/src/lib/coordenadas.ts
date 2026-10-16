/**
 * Coordenadas tipeadas a mano, en el formato que sea. Puro, sin React.
 *
 * El formato se reconoce por cuántos números trae el texto:
 *
 *   -27.4512 · 27,4512 S              → decimal
 *   27 27.07 S · 27°27,07' S          → grados y minutos decimales
 *   27°27'04,4" S · 27 27 4.4 S       → grados, minutos y segundos
 *
 * El hemisferio sale de la letra (S/N, O/W/E) o del signo menos. **Sin
 * ninguno de los dos se toma sur y oeste**, que es todo el Chaco, y se dice:
 * quien copia «27 27 04» de un plano o un informe casi nunca trae el signo.
 *
 * Lo usa la carga de gabinete (`/dashboard/relevamientos/nuevo`), para una
 * obra que alguien informó con su coordenada.
 */

export type Eje = 'lat' | 'lng'
export type Formato = 'decimal' | 'gm' | 'gms'

export const NOMBRE_FORMATO: Record<Formato, string> = {
  decimal: 'decimal',
  gm: 'grados y minutos',
  gms: 'grados, minutos y segundos',
}

export type Lectura =
  | { ok: true; valor: number; formato: Formato; hemisferioSupuesto: boolean }
  | { ok: false; error: string }

/** Recuadro de la provincia con un margen de ~20 km, para avisar un error de tipeo */
export const RECUADRO_CHACO = { latMin: -28.2, latMax: -23.9, lngMin: -63.6, lngMax: -58.1 }

export function leerCoordenada(txt: string, eje: Eje): Lectura {
  const nombre = eje === 'lat' ? 'la latitud' : 'la longitud'
  const t = txt.trim().toUpperCase()
  if (!t) return { ok: false, error: `Falta ${nombre}.` }

  const letras = t.match(/[A-Z]/g) ?? []
  if (letras.length > 1) return { ok: false, error: `En ${nombre} sobran letras.` }
  const letra = letras[0]
  const validas = eje === 'lat' ? ['N', 'S'] : ['E', 'O', 'W']
  if (letra && !validas.includes(letra)) {
    return { ok: false, error: eje === 'lat' ? 'La latitud va con S o N.' : 'La longitud va con O o E.' }
  }

  const negativo = /^\s*-/.test(t) || /[\s°'"]-/.test(t)
  // Coma o punto decimal: "27,45" es un número, no dos
  const numeros = (t.match(/\d+(?:[.,]\d+)?/g) ?? []).map(n => Number(n.replace(',', '.')))
  if (numeros.length === 0) return { ok: false, error: `${mayus(nombre)} no tiene números.` }
  if (numeros.length > 3) return { ok: false, error: `${mayus(nombre)} tiene más de tres números.` }

  const [g, m = 0, s = 0] = numeros
  const formato: Formato = numeros.length === 1 ? 'decimal' : numeros.length === 2 ? 'gm' : 'gms'
  if (formato !== 'decimal' && !Number.isInteger(g)) {
    return { ok: false, error: `Con minutos, los grados de ${nombre} van sin decimales.` }
  }
  if (formato === 'gms' && !Number.isInteger(m)) {
    return { ok: false, error: `Con segundos, los minutos de ${nombre} van sin decimales.` }
  }
  if (m >= 60) return { ok: false, error: `Los minutos de ${nombre} van de 0 a 59.` }
  if (s >= 60) return { ok: false, error: `Los segundos de ${nombre} van de 0 a 59.` }

  const abs = g + m / 60 + s / 3600
  const max = eje === 'lat' ? 90 : 180
  if (abs > max) return { ok: false, error: `${mayus(nombre)} pasa de ${max}°.` }

  const sur = letra ? letra === 'S' || letra === 'O' || letra === 'W' : negativo
  const hemisferioSupuesto = !letra && !negativo
  const valor = sur || hemisferioSupuesto ? -abs : abs
  return { ok: true, valor, formato, hemisferioSupuesto }
}

function mayus(s: string) { return s[0].toUpperCase() + s.slice(1) }

/** -27.451234 → 27°27'04,4" S */
export function aGms(v: number, eje: Eje): string {
  const hemi = eje === 'lat' ? (v < 0 ? 'S' : 'N') : (v < 0 ? 'O' : 'E')
  const abs = Math.abs(v)
  let g = Math.floor(abs)
  let m = Math.floor((abs - g) * 60)
  let s = Math.round(((abs - g) * 60 - m) * 600) / 10
  if (s >= 60) { s = 0; m += 1 }
  if (m >= 60) { m = 0; g += 1 }
  const sTxt = s.toFixed(1).replace('.', ',').padStart(4, '0')
  return `${g}°${String(m).padStart(2, '0')}'${sTxt}" ${hemi}`
}

export function enChaco(lat: number, lng: number): boolean {
  const r = RECUADRO_CHACO
  return lat >= r.latMin && lat <= r.latMax && lng >= r.lngMin && lng <= r.lngMax
}
