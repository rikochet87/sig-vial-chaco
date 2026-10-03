/**
 * El tiempo por consorcio y las alertas oficiales del SMN. Lógica pura: sirve
 * en el servidor y en el navegador, y se testea sin red.
 *
 * Dos fuentes que no significan lo mismo y van separadas en pantalla:
 *
 * | | Qué es | Quién la respalda |
 * |---|---|---|
 * | **Pronóstico** | modelo numérico, Open-Meteo, en la sede de cada consorcio | nadie: es un modelo |
 * | **Alertas** | avisos del Servicio Meteorológico Nacional, en formato CAP | el SMN |
 *
 * **Las alertas son sólo las del SMN; acá no se inventa ningún umbral.** Es el
 * mismo criterio que con el río, donde los niveles de alerta los pone el INA:
 * el número y la autoridad que lo respalda salen juntos de la fuente. Un
 * "alerta" calculada con un corte nuestro sobre el modelo competiría con el
 * aviso oficial y podría contradecirlo.
 */

// ── Códigos de cielo (WMO 4677, los que usa Open-Meteo) ──────────────────────

export type Cielo = 'despejado' | 'nubes' | 'niebla' | 'llovizna' | 'lluvia' | 'tormenta' | 'nieve'

const WMO: Record<number, [string, Cielo]> = {
  0: ['Despejado', 'despejado'], 1: ['Mayormente despejado', 'despejado'],
  2: ['Parcialmente nublado', 'nubes'], 3: ['Nublado', 'nubes'],
  45: ['Niebla', 'niebla'], 48: ['Niebla con escarcha', 'niebla'],
  51: ['Llovizna débil', 'llovizna'], 53: ['Llovizna', 'llovizna'], 55: ['Llovizna intensa', 'llovizna'],
  56: ['Llovizna helada', 'llovizna'], 57: ['Llovizna helada intensa', 'llovizna'],
  61: ['Lluvia débil', 'lluvia'], 63: ['Lluvia', 'lluvia'], 65: ['Lluvia fuerte', 'lluvia'],
  66: ['Lluvia helada', 'lluvia'], 67: ['Lluvia helada fuerte', 'lluvia'],
  71: ['Nevada débil', 'nieve'], 73: ['Nevada', 'nieve'], 75: ['Nevada fuerte', 'nieve'], 77: ['Granos de nieve', 'nieve'],
  80: ['Chaparrones débiles', 'lluvia'], 81: ['Chaparrones', 'lluvia'], 82: ['Chaparrones fuertes', 'lluvia'],
  85: ['Chaparrones de nieve', 'nieve'], 86: ['Chaparrones de nieve fuertes', 'nieve'],
  95: ['Tormenta', 'tormenta'], 96: ['Tormenta con granizo', 'tormenta'], 99: ['Tormenta con granizo fuerte', 'tormenta'],
}

export function cieloDe(codigo: number | null): { texto: string; cielo: Cielo } {
  const c = codigo === null ? undefined : WMO[codigo]
  return c ? { texto: c[0], cielo: c[1] } : { texto: '—', cielo: 'nubes' }
}

/** 0–360° → N, NE, E… — de dónde viene el viento */
export function rumbo(grados: number | null): string {
  if (grados === null || !Number.isFinite(grados)) return '—'
  return ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][Math.round((((grados % 360) + 360) % 360) / 45) % 8]
}

// ── El pronóstico por consorcio ──────────────────────────────────────────────

export interface DiaTiempo {
  fecha: string
  codigo: number | null
  tMin: number | null
  tMax: number | null
  /** mm */
  lluvia: number | null
  /** % — la probabilidad de lluvia que informa el modelo */
  probLluvia: number | null
  /** km/h */
  viento: number | null
  rafagas: number | null
  /** grados, de dónde viene */
  dirViento: number | null
}

export interface TiempoConsorcio {
  numero: number
  nombre: string
  zona: string
  lat: number
  lng: number
  dias: DiaTiempo[]
}

export interface PronosticoTiempo {
  consultado: string
  modelo: string
  consorcios: TiempoConsorcio[]
}

/** Las variables diarias que se piden. Son 8: más de 10 cuentan doble en el cupo de Open-Meteo */
export const VARIABLES_DIARIAS = [
  'weather_code', 'temperature_2m_max', 'temperature_2m_min', 'precipitation_sum',
  'precipitation_probability_max', 'wind_speed_10m_max', 'wind_gusts_10m_max', 'wind_direction_10m_dominant',
] as const

type DiarioOM = Record<(typeof VARIABLES_DIARIAS)[number], (number | null)[]> & { time: string[] }

export function diasDe(d: DiarioOM): DiaTiempo[] {
  const v = (k: (typeof VARIABLES_DIARIAS)[number], i: number) => {
    const x = d[k]?.[i]
    return x === null || x === undefined || !Number.isFinite(x) ? null : x
  }
  return d.time.map((fecha, i) => ({
    fecha,
    codigo: v('weather_code', i),
    tMin: v('temperature_2m_min', i), tMax: v('temperature_2m_max', i),
    lluvia: v('precipitation_sum', i), probLluvia: v('precipitation_probability_max', i),
    viento: v('wind_speed_10m_max', i), rafagas: v('wind_gusts_10m_max', i),
    dirViento: v('wind_direction_10m_dominant', i),
  }))
}

/**
 * Corte de "día con lluvia": 1 mm. Es la convención climatológica para contar
 * días de lluvia —por debajo es rocío o llovizna que no se mide—, no un
 * criterio de obra. La pantalla dice días con y sin lluvia pronosticada; si un
 * camino está para trabajar depende de lo que llovió antes y del suelo.
 */
export const DIA_LLUVIA_MM = 1

export interface ResumenDia {
  fecha: string
  tMin: number | null
  tMax: number | null
  /** Lo más que llueve en algún consorcio ese día */
  lluviaMax: number | null
  /** Cuántos consorcios pronostican al menos DIA_LLUVIA_MM */
  conLluvia: number
  rafagaMax: number | null
  /**
   * Probabilidad de lluvia, %: la mayor entre los consorcios y el promedio.
   * Se muestra la mayor —«hasta 80 %»— porque la pregunta es si va a llover en
   * algún lado; el promedio va al lado para que no se lea como la de toda la
   * provincia.
   */
  probMax: number | null
  probMedia: number | null
  /** El cielo que más se repite, priorizando tormenta: si hay en un tercio de la provincia, se dice */
  codigo: number | null
}

export function resumenProvincia(consorcios: TiempoConsorcio[]): ResumenDia[] {
  if (!consorcios.length) return []
  return consorcios[0].dias.map((_, i) => {
    const dia = consorcios.map(c => c.dias[i]).filter(Boolean)
    const nums = (f: (d: DiaTiempo) => number | null) => dia.map(f).filter((x): x is number => x !== null)
    const min = (a: number[]) => (a.length ? Math.min(...a) : null)
    const max = (a: number[]) => (a.length ? Math.max(...a) : null)
    const codigos = nums(d => d.codigo)
    const tormentas = codigos.filter(c => cieloDe(c).cielo === 'tormenta')
    const frecuencia = new Map<number, number>()
    for (const c of codigos) frecuencia.set(c, (frecuencia.get(c) ?? 0) + 1)
    const masComun = [...frecuencia].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    return {
      fecha: consorcios[0].dias[i].fecha,
      tMin: min(nums(d => d.tMin)), tMax: max(nums(d => d.tMax)),
      lluviaMax: max(nums(d => d.lluvia)),
      conLluvia: dia.filter(d => (d.lluvia ?? 0) >= DIA_LLUVIA_MM).length,
      rafagaMax: max(nums(d => d.rafagas)),
      probMax: max(nums(d => d.probLluvia)),
      probMedia: (() => { const p = nums(d => d.probLluvia); return p.length ? p.reduce((a, b) => a + b, 0) / p.length : null })(),
      codigo: tormentas.length >= codigos.length / 3 ? max(tormentas) : masComun,
    }
  })
}

// ── Las alertas del SMN (CAP 1.2) ────────────────────────────────────────────

export type Nivel = 'amarillo' | 'naranja' | 'rojo'

export interface Alerta {
  id: string
  evento: string
  titulo: string
  descripcion: string
  instruccion: string
  /** Severidad CAP tal como viene */
  severidad: string
  nivel: Nivel
  /** 'Immediate' en los avisos a muy corto plazo */
  urgencia: string
  enviado: string
  inicio: string | null
  fin: string | null
  zonas: string
  /** Anillos en [lat, lng] */
  poligonos: [number, number][][]
  url: string | null
  /** Los consorcios con su sede adentro de algún polígono */
  consorcios: number[]
}

const entidades = (s: string) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

/** El contenido de las etiquetas, con o sin prefijo `cap:` */
function todas(xml: string, tag: string): string[] {
  const re = new RegExp(`<(?:cap:)?${tag}>([\\s\\S]*?)</(?:cap:)?${tag}>`, 'g')
  return [...xml.matchAll(re)].map(m => entidades(m[1].trim()))
}
const una = (xml: string, tag: string) => todas(xml, tag)[0] ?? ''

/**
 * El nivel de color. Los avisos a muy corto plazo lo dicen en el título
 * («AVISO NARANJA…»); los demás sólo traen la severidad CAP, que el SMN usa
 * con la equivalencia estándar: Moderate amarillo, Severe naranja, Extreme rojo.
 */
export function nivelDe(titulo: string, severidad: string): Nivel {
  const t = titulo.toUpperCase()
  if (/\bROJ[OA]\b/.test(t)) return 'rojo'
  if (/\bNARANJA\b/.test(t)) return 'naranja'
  if (/\bAMARILL[OA]\b/.test(t)) return 'amarillo'
  if (severidad === 'Extreme') return 'rojo'
  if (severidad === 'Severe') return 'naranja'
  return 'amarillo'
}

/** Un aviso CAP; null si es una cancelación o no es meteorológico */
export function parsearCap(xml: string, url: string | null = null): Omit<Alerta, 'consorcios'> | null {
  if (una(xml, 'msgType') === 'Cancel') return null
  const info = todas(xml, 'info')[0]
  if (!info || una(info, 'category') !== 'Met') return null
  const titulo = una(info, 'headline')
  const severidad = una(info, 'severity')
  const poligonos = todas(info, 'polygon').map(p => p.split(/\s+/).map(par => {
    const [la, ln] = par.split(',').map(Number)
    return [la, ln] as [number, number]
  }).filter(([la, ln]) => Number.isFinite(la) && Number.isFinite(ln))).filter(a => a.length >= 3)
  return {
    id: una(xml, 'identifier'),
    evento: una(info, 'event'),
    titulo: titulo || una(info, 'event'),
    descripcion: una(info, 'description'),
    instruccion: una(info, 'instruction'),
    severidad, nivel: nivelDe(titulo, severidad),
    urgencia: una(info, 'urgency'),
    enviado: una(xml, 'sent'),
    inicio: una(info, 'onset') || null,
    fin: una(info, 'expires') || null,
    zonas: todas(info, 'areaDesc').filter(Boolean).join(' '),
    poligonos, url: una(info, 'web') || url,
  }
}

/** Punto en polígono, anillo en [lat, lng] */
function dentro(anillo: [number, number][], lat: number, lng: number): boolean {
  let d = false
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [yi, xi] = anillo[i], [yj, xj] = anillo[j]
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) d = !d
  }
  return d
}

/**
 * Si el aviso toca el Chaco y qué consorcios cubre.
 *
 * Toca la provincia si alguna sede cae adentro de un polígono, si algún vértice
 * del polígono cae adentro del contorno provincial —un aviso chico entre dos
 * sedes—, o si no trae polígono y la descripción del área nombra al Chaco.
 */
export function alcanceEnChaco(
  a: Omit<Alerta, 'consorcios'>,
  sedes: { numero: number; lat: number; lng: number }[],
  contorno: [number, number][],
): Alerta | null {
  const consorcios = sedes.filter(s => a.poligonos.some(p => dentro(p, s.lat, s.lng))).map(s => s.numero)
  // El contorno viene en [lng, lat]
  const anillo = contorno.map(([ln, la]) => [la, ln] as [number, number])
  const toca = consorcios.length > 0
    || a.poligonos.some(p => p.some(([la, ln]) => dentro(anillo, la, ln)))
    || (!a.poligonos.length && /\bCHACO\b/i.test(a.zonas))
  return toca ? { ...a, consorcios } : null
}

/** Vigente: no venció. Las que todavía no empezaron también cuentan: avisan lo que viene */
export const vigente = (a: { fin: string | null }, ahora: number) => !a.fin || Date.parse(a.fin) > ahora

const ORDEN_NIVEL: Record<Nivel, number> = { rojo: 0, naranja: 1, amarillo: 2 }
export const ordenarAlertas = (l: Alerta[]) =>
  [...l].sort((a, b) => ORDEN_NIVEL[a.nivel] - ORDEN_NIVEL[b.nivel] || (a.inicio ?? '').localeCompare(b.inicio ?? ''))

/**
 * Las alertas agrupadas por fenómeno y nivel, para mostrar una fila por cada
 * una y no un renglón por aviso.
 *
 * El SMN emite un aviso por franja horaria y por región: un día de tormentas
 * son ocho o diez avisos que dicen lo mismo en distintos horarios. Para quien
 * mira, la pregunta es "¿hay tormentas naranja, desde cuándo y hasta cuándo, y
 * a quiénes?": se toma el inicio más temprano, el fin más tardío y la unión de
 * los consorcios. Los avisos originales quedan adentro, con su enlace.
 */
export interface GrupoAlertas {
  clave: string
  evento: string
  nivel: Nivel
  inicio: string | null
  fin: string | null
  consorcios: number[]
  avisos: Alerta[]
}

export function agruparAlertas(alertas: Alerta[]): GrupoAlertas[] {
  const grupos = new Map<string, GrupoAlertas>()
  for (const a of alertas) {
    // «TORMENTAS FUERTES» del aviso corto y «Tormentas» de la alerta son el mismo fenómeno
    const evento = a.evento.trim().split(/\s+/)[0].toLowerCase()
    const clave = `${evento}|${a.nivel}`
    const g = grupos.get(clave)
    if (!g) {
      grupos.set(clave, {
        clave, evento: evento.charAt(0).toUpperCase() + evento.slice(1), nivel: a.nivel,
        inicio: a.inicio, fin: a.fin, consorcios: [...a.consorcios], avisos: [a],
      })
      continue
    }
    if (a.inicio && (!g.inicio || Date.parse(a.inicio) < Date.parse(g.inicio))) g.inicio = a.inicio
    if (!a.fin || (g.fin && Date.parse(a.fin) > Date.parse(g.fin))) g.fin = a.fin
    g.consorcios = [...new Set([...g.consorcios, ...a.consorcios])].sort((x, y) => x - y)
    g.avisos.push(a)
  }
  return [...grupos.values()].sort((a, b) => ORDEN_NIVEL[a.nivel] - ORDEN_NIVEL[b.nivel] || (a.inicio ?? '').localeCompare(b.inicio ?? ''))
}
