/**
 * Red vial editable: el motor, sin React ni red.
 *
 * La red sale de dos archivos generados desde QGIS —`public/geo/geo_cc.json`
 * (caminos de consorcio, por zona) y `public/geo/geo_rp.json` (rutas
 * provinciales, por calzada)— y los cambios que se cargan en Herramientas →
 * «Editar red» viven en la tabla `red_vial_cambios` (docs/sql/18). Todas las
 * pantallas que dibujan la red ven el archivo con los cambios aplicados
 * (`aplicarCambios`), así que un tramo nuevo aparece en Panorama, en la lluvia
 * por tramo y en las calculadoras sin tocar el archivo.
 *
 * Lo usan el navegador y las rutas del servidor: no importa nada de Node.
 *
 * Tres cosas que no son obvias:
 *
 * - **Los tramos del archivo no tienen id.** `Nc` se repite (3.704 valores
 *   distintos en 9.772 tramos), así que un tramo se ubica por capa + posición
 *   y se reconoce por una **huella** de su geometría. Si el archivo se
 *   regenera desde QGIS y el tramo se movió de lugar, se lo busca por la
 *   huella; si ya no está, el cambio queda «huérfano» y no se aplica.
 * - **Los km de la ficha son los declarados, no los trazados**, y difieren
 *   (CC 49: 252 declarados, 140 trazados). Por eso un cambio no recalcula la
 *   ficha: le **suma o resta lo que movió**, relativo al tramo original
 *   (`ajusteNeto`). Pisar el declarado con el trazado hundiría al CC 96.
 * - **La gestión decide a quién se le cuenta el tramo.** Un tramo asignado a
 *   un consorcio suma a su red; uno de gestión DVP no suma a ningún consorcio.
 */

// ── Tipos ────────────────────────────────────────────────────────────────────

export type TipoRed = 'cc' | 'rp'
export type Gestion = 'consorcio' | 'dvp'
export type Operacion = 'alta' | 'edicion' | 'baja'
export type Zona = 'ZI' | 'ZII' | 'ZIII' | 'ZIV' | 'ZV'
export type Jerarquia = 'PRIMARIA' | 'SECUNDARIA' | 'TERCIARIA'

export const ZONAS: Zona[] = ['ZI', 'ZII', 'ZIII', 'ZIV', 'ZV']
export const JERARQUIAS: Jerarquia[] = ['PRIMARIA', 'SECUNDARIA', 'TERCIARIA']

/** Calzadas que se ofrecen al cargar. Los valores son los del archivo. */
export const MATERIALES_CC = ['TIERRA', 'CONSOLIDADO', 'MEJORADA (RIPIO)', 'PAVIMENTO'] as const
export const MATERIALES_RP = ['TIERRA', 'CONSOLIDADO', 'PAVIMENTO'] as const

/** Capas del archivo de rutas, por calzada. `rpEnObra` gana sobre la calzada. */
export const CAPAS_RP = ['rpPavimentada', 'rpMejorada', 'rpEnObra', 'rpTierra'] as const

export interface Linea { type: 'MultiLineString'; coordinates: number[][][] }

export interface Feature {
  type?: 'Feature'
  properties: Record<string, unknown> | null
  geometry: { type: string; coordinates: unknown } | null
}

export interface Coleccion { type?: string; features: Feature[] }

/** Un archivo de red: capas → colección, como lo sirven los dos `.json` */
export type Red = Record<string, Coleccion | undefined>

/** Un tramo en los términos del formulario, sin la geometría */
export interface Tramo {
  red: TipoRed
  gestion: Gestion
  /** Número de consorcio (1..103) si la gestión es de consorcio */
  consorcio: number | null
  zona: Zona
  jerarquia: Jerarquia | null
  material: string | null
  /** Número de tramo del consorcio (`T`). Sólo red de consorcios. */
  tramo: string | null
  /** Número de ruta provincial (`Nm` en consorcios, `Nombre` en rutas) */
  ruta: string | null
  /** Ruta provincial en obra (va a la capa `rpEnObra`) */
  enObra: boolean
}

/** Cuántos km le mueve un tramo a un consorcio */
export interface Ajuste {
  numero: number
  total: number
  primaria: number
  secundaria: number
  terciaria: number
}

/** Una fila de `red_vial_cambios`, tal como la devuelve la API */
export interface Cambio {
  id: string
  red: TipoRed
  operacion: Operacion
  capa: string
  base_capa: string | null
  base_indice: number | null
  base_huella: string | null
  original: { propiedades: Record<string, unknown>; geometria: Linea } | null
  propiedades: Record<string, unknown>
  geometria: Linea
  gestion: Gestion
  consorcio_numero: number | null
  zona: Zona
  km: number
  ajuste: Ajuste[]
  creado_por_nombre?: string | null
  created_at?: string
  actualizado_por_nombre?: string | null
  updated_at?: string
}

/** De dónde sale un tramo que se ve en el mapa */
export type Origen =
  | { tipo: 'archivo'; red: TipoRed; capa: string; indice: number; huella: string }
  | { tipo: 'cambio'; red: TipoRed; cambio: Cambio }

// ── Geometría ────────────────────────────────────────────────────────────────

const R_TIERRA_KM = 6371.0088

function haversineKm(a: number[], b: number[]): number {
  const rad = Math.PI / 180
  const dLat = (b[1] - a[1]) * rad
  const dLng = (b[0] - a[0]) * rad
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R_TIERRA_KM * Math.asin(Math.min(1, Math.sqrt(s)))
}

/** Las partes de una geometría lineal, sea LineString o MultiLineString */
export function partes(g: Feature['geometry']): number[][][] {
  if (!g) return []
  if (g.type === 'LineString') return [g.coordinates as number[][]]
  if (g.type === 'MultiLineString') return g.coordinates as number[][][]
  return []
}

/** Largo geométrico en km. Es el trazado, no el declarado */
export function longitudKm(g: Feature['geometry']): number {
  let km = 0
  for (const p of partes(g)) {
    for (let i = 1; i < p.length; i++) km += haversineKm(p[i - 1], p[i])
  }
  return km
}

/**
 * Huella de la geometría: reconoce un tramo del archivo aunque cambie de
 * posición. Redondea a 6 decimales (~10 cm) para que el ida y vuelta por JSON
 * no la mueva. FNV-1a de 32 bits más la cantidad de vértices.
 */
export function huella(g: Feature['geometry']): string {
  let h = 0x811c9dc5
  let n = 0
  for (const p of partes(g)) {
    for (const c of p) {
      const s = `${c[0].toFixed(6)},${c[1].toFixed(6)};`
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i)
        h = Math.imul(h, 0x01000193) >>> 0
      }
      n++
    }
    h ^= 0x7c; h = Math.imul(h, 0x01000193) >>> 0
  }
  return `${n}-${h.toString(16).padStart(8, '0')}`
}

/** Recuadro del Chaco con margen: lo que cae afuera es un error de carga */
export const RECUADRO_CHACO = { latMin: -28.5, latMax: -23.8, lngMin: -63.6, lngMax: -57.8 }

export const MAX_VERTICES = 20000

// ── Lectura de los atributos del archivo ─────────────────────────────────────

const texto = (v: unknown): string =>
  v === null || v === undefined ? '' : String(v).trim()

/** El archivo trae PRIMRARIA, TIERCIARIA, SECUNDARI…: se leen igual */
export function normalizarJerarquia(v: unknown): Jerarquia | null {
  const s = texto(v).toUpperCase()
  if (/^PRI/.test(s)) return 'PRIMARIA'
  if (/^SECUND/.test(s)) return 'SECUNDARIA'
  if (/^T[IE]+RC/.test(s)) return 'TERCIARIA'
  return null
}

export function normalizarMaterial(v: unknown): string | null {
  const s = texto(v).toUpperCase()
  if (!s) return null
  if (s.includes('PAVIMENT')) return 'PAVIMENTO'
  if (s.includes('CONSOLIDADO')) return 'CONSOLIDADO'
  if (s.includes('RIPIO') || s.startsWith('MEJORA')) return 'MEJORADA (RIPIO)'
  if (s.includes('TIERRA')) return 'TIERRA'
  return null
}

const ROMANOS: Record<string, Zona> = { '1': 'ZI', '2': 'ZII', '3': 'ZIII', '4': 'ZIV', '5': 'ZV' }
const NUMERO_ZONA: Record<Zona, string> = { ZI: '1', ZII: '2', ZIII: '3', ZIV: '4', ZV: '5' }

export function zonaDeNumero(v: unknown): Zona | null {
  return ROMANOS[texto(v).replace(/^0+/, '')] ?? null
}

/** Zona de una capa del archivo de consorcios: `ZII` o `ZIV_DVP` */
export function zonaDeCapa(capa: string): Zona | null {
  const z = capa.replace(/_DVP$/, '')
  return (ZONAS as string[]).includes(z) ? (z as Zona) : null
}

/** Número de consorcio de un campo `CC`: '005', 5, 5.0; 'DVP' no es un número */
export function numeroConsorcio(v: unknown): number | null {
  const n = Number(texto(v))
  return Number.isInteger(n) && n > 0 ? n : null
}

const tresCifras = (v: string | number) => String(v).padStart(3, '0')
const soloDigitos = (v: unknown): string | null => {
  const s = texto(v).replace(/\D/g, '')
  return s ? s : null
}

/** Lee un tramo del archivo en términos del formulario */
export function leerTramo(red: TipoRed, capa: string, props: Record<string, unknown> | null): Tramo {
  const p = props ?? {}
  if (red === 'cc') {
    const cc = numeroConsorcio(p.CC)
    const esDvp = capa.endsWith('_DVP') || texto(p.Mn).toUpperCase() === 'DVP' || cc === null
    return {
      red,
      gestion: esDvp ? 'dvp' : 'consorcio',
      consorcio: esDvp ? null : cc,
      zona: zonaDeCapa(capa) ?? zonaDeNumero(texto(p.Nc).slice(1, 2)) ?? 'ZI',
      jerarquia: normalizarJerarquia(p.J),
      material: normalizarMaterial(p.M),
      tramo: soloDigitos(p.T),
      ruta: soloDigitos(p.Nm),
      enObra: false,
    }
  }
  const cc = numeroConsorcio(p.CC)
  const esCc = texto(p.Mantenim).toUpperCase() === 'CC' && cc !== null
  return {
    red,
    gestion: esCc ? 'consorcio' : 'dvp',
    consorcio: esCc ? cc : null,
    zona: zonaDeNumero(p.Zona) ?? 'ZI',
    jerarquia: normalizarJerarquia(p.Jerarq),
    material: normalizarMaterial(p.Mat_Calzad),
    tramo: null,
    ruta: soloDigitos(p.Nombre),
    enObra: capa === 'rpEnObra',
  }
}

/** Capa del archivo donde va un tramo */
export function capaDe(t: Tramo): string {
  if (t.red === 'cc') return t.gestion === 'dvp' ? `${t.zona}_DVP` : t.zona
  if (t.enObra) return 'rpEnObra'
  if (t.material === 'PAVIMENTO') return 'rpPavimentada'
  if (t.material === 'CONSOLIDADO' || t.material === 'MEJORADA (RIPIO)') return 'rpMejorada'
  return 'rpTierra'
}

/**
 * Escribe un tramo con los nombres de campo del archivo.
 *
 * `Nc` se arma con el mismo código que trae QGIS: `Z2C007047` es zona 2, CC 007,
 * tramo 047; `Z1C005RP049` es la RP 049 en el CC 005. Así un tramo nuevo se lee
 * con los mismos parsers que los del archivo (`redFondo`, `redLluvia`).
 */
export function propiedadesDe(t: Tramo): Record<string, unknown> {
  const z = NUMERO_ZONA[t.zona]
  if (t.red === 'cc') {
    const cc = t.gestion === 'consorcio' && t.consorcio ? tresCifras(t.consorcio) : 'DVP'
    const T = t.tramo ? tresCifras(t.tramo) : null
    const Nm = t.ruta ? tresCifras(t.ruta) : null
    const Nc = cc === 'DVP'
      ? `Z${z}DVP${Nm ? `RP${Nm}` : T ?? ''}`
      : `Z${z}C${cc}${Nm ? `RP${Nm}` : T ?? ''}`
    return {
      CC: cc, T, Nm, J: t.jerarquia, M: t.material,
      Mn: t.gestion === 'dvp' ? 'DVP' : 'CC', Nc,
    }
  }
  const salida: Record<string, unknown> = {
    Zona: z,
    Nombre: t.ruta ? tresCifras(t.ruta) : null,
    Mantenim: t.gestion === 'dvp' ? 'DVP' : 'CC',
    Jerarq: t.jerarquia,
    Mat_Calzad: t.material,
  }
  if (t.gestion === 'consorcio' && t.consorcio) salida.CC = tresCifras(t.consorcio)
  return salida
}

/** Cómo se nombra un tramo en pantalla */
export function designacion(t: Tramo): string {
  if (t.red === 'rp') return t.ruta ? `RP ${Number(t.ruta)}` : 'Ruta provincial s/n'
  if (t.ruta) return `RP ${Number(t.ruta)}`
  if (t.tramo) return `Tramo ${tresCifras(t.tramo)}`
  return 'Tramo s/n'
}

export function quienGestiona(t: Tramo): string {
  return t.gestion === 'dvp' ? 'Gestión DVP' : t.consorcio ? `CC ${t.consorcio}` : 'Sin consorcio'
}

// ── Km de los consorcios ─────────────────────────────────────────────────────

/**
 * Los km de la ficha van con dos decimales y la base redondea a dos en cada
 * movimiento: un ajuste con tres decimales dejaba 0,01 km de más o de menos
 * al encadenar ediciones y deshacerlas. Con todo a dos decimales las sumas y
 * restas son exactas y deshacer vuelve al número de partida.
 */
const r2 = (x: number) => Math.round(x * 100) / 100

/** Lo que un tramo aporta a la red de su consorcio. DVP no aporta a ninguno */
export function contribucion(t: Tramo | null, km: number): Ajuste[] {
  if (!t || t.gestion !== 'consorcio' || !t.consorcio || !(km > 0)) return []
  const k = r2(km)
  return [{
    numero: t.consorcio,
    total: k,
    primaria: t.jerarquia === 'PRIMARIA' ? k : 0,
    secundaria: t.jerarquia === 'SECUNDARIA' ? k : 0,
    terciaria: t.jerarquia === 'TERCIARIA' ? k : 0,
  }]
}

/** a − b, por consorcio, sin las filas que quedan en cero */
export function restarAjustes(a: Ajuste[], b: Ajuste[]): Ajuste[] {
  const m = new Map<number, Ajuste>()
  const sumar = (x: Ajuste, s: number) => {
    const y = m.get(x.numero) ?? { numero: x.numero, total: 0, primaria: 0, secundaria: 0, terciaria: 0 }
    y.total += s * x.total
    y.primaria += s * x.primaria
    y.secundaria += s * x.secundaria
    y.terciaria += s * x.terciaria
    m.set(x.numero, y)
  }
  a.forEach(x => sumar(x, 1))
  b.forEach(x => sumar(x, -1))
  return [...m.values()]
    .map(x => ({
      numero: x.numero, total: r2(x.total), primaria: r2(x.primaria),
      secundaria: r2(x.secundaria), terciaria: r2(x.terciaria),
    }))
    .filter(x => x.total !== 0 || x.primaria !== 0 || x.secundaria !== 0 || x.terciaria !== 0)
    .sort((x, y) => x.numero - y.numero)
}

/**
 * Lo que un cambio le mueve a cada consorcio, **relativo al original**: un alta
 * suma lo nuevo, una baja resta lo original, una edición suma lo nuevo y resta
 * lo original. Pasar un tramo del CC 5 al CC 7 resta en uno y suma en el otro.
 */
export function ajusteNeto(
  original: { tramo: Tramo; km: number } | null,
  nuevo: { tramo: Tramo; km: number } | null,
): Ajuste[] {
  return restarAjustes(
    contribucion(nuevo?.tramo ?? null, nuevo?.km ?? 0),
    contribucion(original?.tramo ?? null, original?.km ?? 0),
  )
}

// ── Aplicar los cambios sobre el archivo ─────────────────────────────────────

export interface RedAplicada {
  red: Red
  /** De dónde sale cada tramo que se ve, para que el editor sepa qué tocó */
  origen: Map<Feature, Origen>
  /** Cambios que apuntan a un tramo que ya no está en el archivo */
  huerfanos: Cambio[]
}

/** Ubica el tramo del archivo al que apunta un cambio, o null si ya no está */
export function ubicarBase(base: Red, c: Pick<Cambio, 'base_capa' | 'base_indice' | 'base_huella'>): number | null {
  if (c.base_capa == null || c.base_indice == null) return null
  const fs = base[c.base_capa]?.features
  if (!fs) return null
  const f = fs[c.base_indice]
  if (f && (!c.base_huella || huella(f.geometry) === c.base_huella)) return c.base_indice
  // El archivo se regeneró y el tramo cambió de lugar: se lo busca por la huella
  if (!c.base_huella) return null
  const i = fs.findIndex(x => huella(x.geometry) === c.base_huella)
  return i >= 0 ? i : null
}

/**
 * El archivo con los cambios aplicados. No modifica `base`: las capas que no
 * cambian son las mismas colecciones, las que cambian son copias.
 */
export function aplicarCambios(tipo: TipoRed, base: Red, cambios: Cambio[]): RedAplicada {
  const quitar = new Map<string, Set<number>>()
  const agregar = new Map<string, { f: Feature; c: Cambio }[]>()
  const huerfanos: Cambio[] = []

  for (const c of cambios) {
    if (c.red !== tipo) continue
    if (c.operacion !== 'alta') {
      const i = ubicarBase(base, c)
      if (i === null) { huerfanos.push(c); continue }
      const s = quitar.get(c.base_capa!) ?? new Set<number>()
      s.add(i)
      quitar.set(c.base_capa!, s)
    }
    if (c.operacion === 'baja') continue
    const f: Feature = { type: 'Feature', properties: c.propiedades, geometry: c.geometria }
    const lista = agregar.get(c.capa) ?? []
    lista.push({ f, c })
    agregar.set(c.capa, lista)
  }

  const red: Red = { ...base }
  const origen = new Map<Feature, Origen>()

  const capas = new Set([...Object.keys(base), ...agregar.keys()])
  for (const capa of capas) {
    const fsBase = base[capa]?.features ?? []
    const q = quitar.get(capa)
    const a = agregar.get(capa)
    fsBase.forEach((f, i) => {
      if (!q?.has(i)) origen.set(f, { tipo: 'archivo', red: tipo, capa, indice: i, huella: '' })
    })
    if (!q && !a) continue
    const features = q ? fsBase.filter((_, i) => !q.has(i)) : [...fsBase]
    for (const { f, c } of a ?? []) {
      features.push(f)
      origen.set(f, { tipo: 'cambio', red: tipo, cambio: c })
    }
    red[capa] = { ...(base[capa] ?? { type: 'FeatureCollection' }), features }
  }
  return { red, origen, huerfanos }
}

/**
 * Completa la huella de un tramo del archivo. `aplicarCambios` no la calcula
 * para los 11 mil tramos de entrada: hace falta sólo para el que se edita.
 */
export function origenCompleto(o: Origen, f: Feature): Origen {
  return o.tipo === 'archivo' && !o.huella ? { ...o, huella: huella(f.geometry) } : o
}

// ── Validación de lo que llega a la API ──────────────────────────────────────

export type Validacion<T> = { ok: true; datos: T } | { ok: false; error: string }

/** Lista blanca de una geometría: MultiLineString dentro del Chaco */
export function validarGeometria(v: unknown): Validacion<Linea> {
  const g = v as { type?: unknown; coordinates?: unknown } | null
  if (!g || typeof g !== 'object') return { ok: false, error: 'Falta la geometría' }
  let partesIn: unknown
  if (g.type === 'LineString') partesIn = [g.coordinates]
  else if (g.type === 'MultiLineString') partesIn = g.coordinates
  else return { ok: false, error: 'La geometría tiene que ser una línea' }
  if (!Array.isArray(partesIn) || partesIn.length === 0) return { ok: false, error: 'La línea está vacía' }

  const R = RECUADRO_CHACO
  const salida: number[][][] = []
  let vertices = 0
  for (const p of partesIn) {
    if (!Array.isArray(p) || p.length < 2) return { ok: false, error: 'Cada parte del tramo necesita al menos dos puntos' }
    const linea: number[][] = []
    for (const c of p) {
      if (!Array.isArray(c) || c.length < 2) return { ok: false, error: 'Coordenada inválida' }
      const lng = Number(c[0]), lat = Number(c[1])
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return { ok: false, error: 'Coordenada inválida' }
      if (lat < R.latMin || lat > R.latMax || lng < R.lngMin || lng > R.lngMax) {
        return { ok: false, error: 'El tramo tiene puntos fuera del Chaco' }
      }
      linea.push([Math.round(lng * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7])
      vertices++
    }
    salida.push(linea)
  }
  if (vertices > MAX_VERTICES) return { ok: false, error: `El tramo tiene más de ${MAX_VERTICES} vértices` }
  if (longitudKm({ type: 'MultiLineString', coordinates: salida }) < 0.001) {
    return { ok: false, error: 'El tramo no tiene largo' }
  }
  return { ok: true, datos: { type: 'MultiLineString', coordinates: salida } }
}

/** Lista blanca de los atributos de un tramo. La zona la decide quien llama */
export function validarTramo(v: unknown, red: TipoRed): Validacion<Omit<Tramo, 'zona'> & { zona: Zona | null }> {
  const t = v as Record<string, unknown> | null
  if (!t || typeof t !== 'object') return { ok: false, error: 'Faltan los datos del tramo' }

  const gestion = t.gestion === 'dvp' ? 'dvp' : t.gestion === 'consorcio' ? 'consorcio' : null
  if (!gestion) return { ok: false, error: 'Elegí si el tramo es de un consorcio o de gestión DVP' }

  const consorcio = gestion === 'consorcio' ? numeroConsorcio(t.consorcio) : null
  if (gestion === 'consorcio' && (consorcio === null || consorcio > 999)) {
    return { ok: false, error: 'Elegí el consorcio' }
  }

  const jerarquia = t.jerarquia == null || t.jerarquia === '' ? null : normalizarJerarquia(t.jerarquia)
  if (t.jerarquia && !jerarquia) return { ok: false, error: 'Jerarquía inválida' }
  if (red === 'rp' && jerarquia === 'TERCIARIA') return { ok: false, error: 'Una ruta provincial es primaria o secundaria' }
  if (gestion === 'consorcio' && !jerarquia) return { ok: false, error: 'Elegí la jerarquía: define en qué red del consorcio se cuenta' }

  const materiales: readonly string[] = red === 'cc' ? MATERIALES_CC : MATERIALES_RP
  const material = t.material == null || t.material === '' ? null : String(t.material)
  if (material !== null && !materiales.includes(material)) return { ok: false, error: 'Calzada inválida' }

  const num = (x: unknown, que: string): Validacion<string | null> => {
    if (x == null || x === '') return { ok: true, datos: null }
    const s = String(x).trim()
    if (!/^\d{1,4}$/.test(s)) return { ok: false, error: `${que}: sólo números` }
    return { ok: true, datos: s.replace(/^0+(?=\d)/, '') }
  }
  const tramo = red === 'cc' ? num(t.tramo, 'Número de tramo') : { ok: true as const, datos: null }
  if (!tramo.ok) return tramo
  const ruta = num(t.ruta, 'Número de ruta')
  if (!ruta.ok) return ruta
  if (red === 'rp' && !ruta.datos) return { ok: false, error: 'Falta el número de la ruta provincial' }

  const zonaIn = typeof t.zona === 'string' && (ZONAS as string[]).includes(t.zona) ? (t.zona as Zona) : null

  return {
    ok: true,
    datos: {
      red, gestion, consorcio, zona: zonaIn, jerarquia, material,
      tramo: tramo.datos, ruta: ruta.datos,
      enObra: red === 'rp' && t.enObra === true,
    },
  }
}

// ── Exportación para QGIS ────────────────────────────────────────────────────

/**
 * Los cambios como GeoJSON, para volcarlos a QGIS mientras la red original
 * siga viviendo allá. Cada tramo lleva sus atributos con los nombres del
 * archivo, más qué se le hizo, de qué capa viene y quién lo cargó.
 */
export function cambiosGeoJSON(cambios: Cambio[]) {
  return {
    type: 'FeatureCollection' as const,
    features: cambios.map(c => ({
      type: 'Feature' as const,
      geometry: c.geometria,
      properties: {
        ...c.propiedades,
        sv_red: c.red,
        sv_operacion: c.operacion,
        sv_capa: c.capa,
        sv_capa_original: c.base_capa,
        sv_indice_original: c.base_indice,
        sv_gestion: c.gestion,
        sv_consorcio: c.consorcio_numero,
        sv_km: c.km,
        sv_cargado_por: c.actualizado_por_nombre ?? c.creado_por_nombre ?? null,
        sv_fecha: c.updated_at ?? c.created_at ?? null,
      },
    })),
  }
}

/** Km con una coma y dos decimales, como el resto del panel */
export function fmtKm(km: number): string {
  return km.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
