/**
 * La lista de usuarios del panel: tipo de acceso, filtros y orden. Pura, sin
 * React ni Supabase; la usan `dashboard/tecnicos` y `scripts/verificar-usuarios.ts`.
 *
 * **Antes eran dos pestañas que se pisaban**: «Panel web» y «App de campo», y
 * un técnico con permisos de panel aparecía en las dos. Ahora es una sola
 * lista, y lo que separaba las pestañas es un filtro («Acceso»).
 */
import { PERMISOS_OPCIONES, type PermisoKey } from '@/lib/permisos'

export type Rol = 'admin' | 'panel' | 'tecnico' | 'usuario'

export const ROLES: { key: Rol; label: string }[] = [
  { key: 'admin', label: 'Administrador' },
  { key: 'panel', label: 'Panel' },
  { key: 'tecnico', label: 'Técnico' },
  { key: 'usuario', label: 'Usuario (app)' },
]

export const ZONAS = ['ZI', 'ZII', 'ZIII', 'ZIV', 'ZV'] as const

export interface UsuarioFila {
  id: string
  nombre: string
  email: string
  rol: Rol
  zona: string | null
  permisos: string[]
  relevamientos: ConteoRelevamientos
}

export interface ConteoRelevamientos {
  total: number
  /** Últimos 30 y 90 días, contados hasta hoy inclusive */
  d30: number
  d90: number
  /** Fecha del último, YYYY-MM-DD; null si no cargó ninguno */
  ultimo: string | null
}

export const SIN_RELEVAMIENTOS: ConteoRelevamientos = { total: 0, d30: 0, d90: 0, ultimo: null }

// ── Acceso ────────────────────────────────────────────────────────────────

/**
 * Entra al panel con el mismo criterio que el middleware: admin, rol panel, o
 * cualquier rol con al menos un permiso. Si el middleware cambia, esto también.
 */
export function entraAlPanel(u: Pick<UsuarioFila, 'rol' | 'permisos'>): boolean {
  return u.rol === 'admin' || u.rol === 'panel' || u.permisos.length > 0
}

/** Usa la app de campo: técnicos y usuarios de la app */
export function usaLaApp(u: Pick<UsuarioFila, 'rol'>): boolean {
  return u.rol === 'tecnico' || u.rol === 'usuario'
}

export type Acceso = 'panel' | 'app' | 'ambos' | 'ninguno'

export function accesoDe(u: Pick<UsuarioFila, 'rol' | 'permisos'>): Acceso {
  const p = entraAlPanel(u)
  const a = usaLaApp(u)
  return p && a ? 'ambos' : p ? 'panel' : a ? 'app' : 'ninguno'
}

/** ¿Puede entrar a esta sección? El administrador, a todas */
export function tieneSeccion(u: Pick<UsuarioFila, 'rol' | 'permisos'>, s: PermisoKey): boolean {
  return u.rol === 'admin' || u.permisos.includes(s)
}

/** Sólo las claves que existen: una vieja que quedó en la base no cuenta como sección */
export function seccionesDe(u: Pick<UsuarioFila, 'rol' | 'permisos'>): PermisoKey[] {
  return PERMISOS_OPCIONES.map(p => p.key).filter(k => tieneSeccion(u, k))
}

// ── Filtros y orden ───────────────────────────────────────────────────────

export type FiltroAcceso = 'todos' | 'panel' | 'app' | 'ambos'
export type Periodo = 'total' | 'd90' | 'd30'
export type Orden = 'nombre' | 'relevamientos'

export interface Filtros {
  texto: string
  rol: Rol | 'todos'
  /** 'sin' son los técnicos sin zona asignada */
  zona: string | 'todas' | 'sin'
  acceso: FiltroAcceso
  seccion: PermisoKey | 'todas'
  orden: Orden
  periodo: Periodo
}

export const FILTROS_INICIALES: Filtros = {
  texto: '', rol: 'todos', zona: 'todas', acceso: 'todos', seccion: 'todas',
  orden: 'nombre', periodo: 'total',
}

/** Sin tildes ni mayúsculas: «Hector» encuentra a «Héctor» */
export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export function filtrar(lista: readonly UsuarioFila[], f: Filtros): UsuarioFila[] {
  const q = normalizar(f.texto)
  const salida = lista.filter(u => {
    if (q && !normalizar(`${u.nombre} ${u.email}`).includes(q)) return false
    if (f.rol !== 'todos' && u.rol !== f.rol) return false
    // La zona es de los técnicos: elegir una zona deja sólo a los que la tienen
    if (f.zona === 'sin' && (u.rol !== 'tecnico' || u.zona)) return false
    if (f.zona !== 'todas' && f.zona !== 'sin' && u.zona !== f.zona) return false
    const a = accesoDe(u)
    // «Panel web» y «App de campo» incluyen a los que tienen los dos, como las pestañas viejas
    if (f.acceso === 'panel' && a !== 'panel' && a !== 'ambos') return false
    if (f.acceso === 'app' && a !== 'app' && a !== 'ambos') return false
    if (f.acceso === 'ambos' && a !== 'ambos') return false
    if (f.seccion !== 'todas' && !tieneSeccion(u, f.seccion)) return false
    return true
  })
  return ordenar(salida, f.orden, f.periodo)
}

/**
 * Por nombre, o de quien más relevamientos cargó a quien menos en el período.
 * Los empates van por el más reciente y después por nombre, así el orden no
 * salta entre una carga y la siguiente.
 */
export function ordenar(lista: UsuarioFila[], orden: Orden, periodo: Periodo): UsuarioFila[] {
  const porNombre = (a: UsuarioFila, b: UsuarioFila) => a.nombre.localeCompare(b.nombre, 'es')
  if (orden === 'nombre') return [...lista].sort(porNombre)
  return [...lista].sort((a, b) =>
    b.relevamientos[periodo] - a.relevamientos[periodo]
    || (b.relevamientos.ultimo ?? '').localeCompare(a.relevamientos.ultimo ?? '')
    || porNombre(a, b))
}

/** Cuántos hay de cada opción de un filtro, sobre la lista entera */
export function contar<K extends string>(lista: readonly UsuarioFila[], clave: (u: UsuarioFila) => K | null): Record<string, number> {
  const c: Record<string, number> = {}
  for (const u of lista) {
    const k = clave(u)
    if (k != null) c[k] = (c[k] ?? 0) + 1
  }
  return c
}

// ── Conteo de relevamientos ───────────────────────────────────────────────

/**
 * El día de hoy en Argentina, YYYY-MM-DD. El servidor corre en UTC y acá son
 * tres horas menos todo el año (no hay horario de verano): a las 22:00 del 16
 * en Resistencia, en UTC ya es el 17.
 */
export function hoyArgentina(ms: number = Date.now()): string {
  return new Date(ms - 3 * 3600_000).toISOString().slice(0, 10)
}

/**
 * Cuenta los relevamientos de cada usuario a partir de `{ tecnico_id, fecha }`.
 * `hoy` en YYYY-MM-DD. La fecha del relevamiento se toma por su día (los diez
 * primeros caracteres): las de gabinete van a las 12:00 UTC y las de la app con
 * la hora del teléfono.
 *
 * «Últimos 30 días» son hoy y los 29 anteriores.
 */
export function contarRelevamientos(
  filas: readonly { tecnico_id: string | null; fecha: string | null }[],
  hoy: string,
): Map<string, ConteoRelevamientos> {
  const dia = (iso: string) => Date.parse(iso.slice(0, 10) + 'T00:00:00Z')
  const h = dia(hoy)
  const desde30 = h - 29 * 86_400_000
  const desde90 = h - 89 * 86_400_000
  const m = new Map<string, ConteoRelevamientos>()
  for (const r of filas) {
    if (!r.tecnico_id) continue
    const c = m.get(r.tecnico_id) ?? { ...SIN_RELEVAMIENTOS }
    c.total++
    if (r.fecha && !Number.isNaN(dia(r.fecha))) {
      const d = dia(r.fecha)
      if (d >= desde30 && d <= h) c.d30++
      if (d >= desde90 && d <= h) c.d90++
      const f = r.fecha.slice(0, 10)
      if (!c.ultimo || f > c.ultimo) c.ultimo = f
    }
    m.set(r.tecnico_id, c)
  }
  return m
}
