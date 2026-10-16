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

// ── Enlaces de Google Maps ───────────────────────────────────────────────────

/**
 * De dónde salió la coordenada de un enlace. No es lo mismo un marcador que
 * el centro de lo que se estaba mirando, y la pantalla lo dice.
 */
export type OrigenEnlace = 'marcador' | 'busqueda' | 'vista'
export type CoordEnlace = { lat: number; lng: number; origen: OrigenEnlace }

/** Los acortadores de Google: hay que seguir la redirección para ver la coordenada */
export const HOSTS_CORTOS = ['maps.app.goo.gl', 'goo.gl', 'g.co']

/**
 * google.com, google.com.ar, google.es, google.co.uk… y sus subdominios. Con
 * el sufijo cerrado: `google\.[a-z.]+` dejaba pasar `google.com.evil.io`, y
 * la ruta que sigue enlaces cortos decide con esto a dónde pide.
 */
export function esHostGoogle(host: string): boolean {
  return /(^|\.)google\.(com|[a-z]{2}|com\.[a-z]{2}|co\.[a-z]{2})$/.test(host)
}

export function esEnlaceCorto(txt: string): boolean {
  try {
    const u = new URL(txt.trim())
    return HOSTS_CORTOS.includes(u.hostname) && (u.hostname !== 'goo.gl' || u.pathname.startsWith('/maps'))
  } catch { return false }
}

export function pareceEnlace(txt: string): boolean {
  return /^https?:\/\//i.test(txt.trim())
}

// Con decimales: en un enlace las coordenadas siempre los traen, y así un nombre
// como «Ruta 11, 5» no se lee como una coordenada
const PAR = /(-?\d{1,3}\.\d+)\s*,\s*\+?(-?\d{1,3}\.\d+)/
const decodificar = (s: string) => { try { return decodeURIComponent(s) } catch { return s } }

function par(txt: string | null | undefined): { lat: number; lng: number } | null {
  if (!txt) return null
  const m = txt.match(PAR)
  if (!m) return null
  const lat = Number(m[1]), lng = Number(m[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}

/**
 * La coordenada de un enlace de Google Maps, de la más precisa a la menos:
 *
 * 1. `!3d…!4d…` en `data=`: el marcador del lugar. Un enlace a un lugar trae
 *    también `@lat,lng`, que es el centro de la vista y puede caer a cuadras.
 * 2. `?q=`, `?query=`, `?ll=`, `?destination=`, `/search/` o `/place/` con un
 *    par de números: lo que se buscó.
 * 3. `@lat,lng,zoom`: el centro de lo que se estaba mirando.
 *
 * Un enlace a un lugar por nombre, sin ningún número, da null.
 */
export function coordenadaDeEnlace(txt: string): CoordEnlace | null {
  let u: URL
  try { u = new URL(txt.trim()) } catch { return null }
  // La pantalla de consentimiento de Google lleva el enlace verdadero en `continue`
  const sigue = u.searchParams.get('continue')
  if (sigue && /consent\./.test(u.hostname)) return coordenadaDeEnlace(sigue)
  if (!esHostGoogle(u.hostname)) return null

  const todo = decodificar(u.pathname + u.search)
  const d3 = todo.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/)
  if (d3) {
    const lat = Number(d3[1]), lng = Number(d3[2])
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng, origen: 'marcador' }
  }
  for (const k of ['q', 'query', 'll', 'destination', 'center']) {
    const p = par(u.searchParams.get(k))
    if (p) return { ...p, origen: 'busqueda' }
  }
  const ruta = decodificar(u.pathname).match(/\/(?:search|place|dir)\/([^/@]+)/)
  const pr = par(ruta?.[1])
  if (pr) return { ...pr, origen: 'busqueda' }
  const arroba = decodificar(u.pathname).match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
  if (arroba) {
    const lat = Number(arroba[1]), lng = Number(arroba[2])
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng, origen: 'vista' }
  }
  return null
}
