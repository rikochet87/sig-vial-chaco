/**
 * Permisos del panel — fuente única de verdad.
 *
 * Antes esto vivía repartido: la lista de opciones estaba duplicada en los dos
 * formularios de usuario, y el Sidebar decidía qué mostrar con condiciones
 * escritas a mano. Nada validaba la ruta, así que un usuario sin permiso entraba
 * igual escribiendo la URL: el link estaba oculto, pero la página cargaba.
 *
 * Este módulo lo unifica. No importa nada de Node para poder usarse también
 * desde el middleware, que corre en el Edge runtime.
 */

export type PermisoKey =
  | 'dashboard'
  | 'consorcios'
  | 'relevamientos'
  | 'herramientas'
  | 'obras'
  | 'calc_ripio'
  | 'calc_desmalezado'
  | 'calc_desbosque'

/** Opciones que se muestran al crear/editar un usuario */
export const PERMISOS_OPCIONES: { key: PermisoKey; label: string }[] = [
  { key: 'dashboard',        label: 'Dashboard' },
  { key: 'consorcios',       label: 'Consorcios' },
  { key: 'relevamientos',    label: 'Relevamientos' },
  { key: 'herramientas',     label: 'Herramientas' },
  { key: 'obras',            label: 'Obras (lista y planta)' },
  { key: 'calc_ripio',       label: 'Calculadora — Ripio' },
  { key: 'calc_desmalezado', label: 'Calculadora — Desmalezado' },
  { key: 'calc_desbosque',   label: 'Calculadora — Desbosque' },
]

export const PERMISOS_CALCULADORA: PermisoKey[] = [
  'calc_ripio', 'calc_desmalezado', 'calc_desbosque',
]

type Regla = {
  prefijo: string
  /** Alcanza con tener UNO de estos permisos */
  permisos?: PermisoKey[]
  /** Solo rol admin, sin importar los permisos */
  soloAdmin?: boolean
  /** Coincide solo con la ruta exacta, no con sus hijas */
  exacto?: boolean
}

/**
 * Orden significativo: se evalúa de arriba hacia abajo y gana la primera que
 * coincide. Las rutas más específicas van primero — /dashboard/obras/calculadoras
 * tiene que resolverse antes que /dashboard/obras, o las calculadoras quedarían
 * detrás del permiso de la lista de obras.
 */
export const REGLAS_RUTAS: Regla[] = [
  { prefijo: '/dashboard/tecnicos',           soloAdmin: true },
  { prefijo: '/dashboard/obras/calculadoras', permisos: PERMISOS_CALCULADORA },
  { prefijo: '/dashboard/obras',              permisos: ['obras'] },
  { prefijo: '/dashboard/consorcios',         permisos: ['consorcios'] },
  { prefijo: '/dashboard/relevamientos',      permisos: ['relevamientos'] },
  { prefijo: '/dashboard/herramientas',       permisos: ['herramientas'] },
  { prefijo: '/dashboard',                    permisos: ['dashboard'], exacto: true },
]

export type PerfilPermisos = {
  rol: string | null | undefined
  permisos: string[] | null | undefined
}

/** ¿El perfil tiene al menos uno de estos permisos? (admin siempre sí) */
export function tienePermiso(perfil: PerfilPermisos, ...claves: PermisoKey[]): boolean {
  if (perfil.rol === 'admin') return true
  const propios = Array.isArray(perfil.permisos) ? perfil.permisos : []
  return claves.some(k => propios.includes(k))
}

/** Regla que aplica a una ruta, o null si la ruta no está protegida */
export function reglaParaRuta(pathname: string): Regla | null {
  for (const r of REGLAS_RUTAS) {
    const coincide = r.exacto ? pathname === r.prefijo : pathname.startsWith(r.prefijo)
    if (coincide) return r
  }
  return null
}

/**
 * ¿Este perfil puede entrar a esta ruta?
 * Las rutas sin regla se permiten: el middleware ya exige sesión válida, y las
 * APIs validan por su cuenta. Denegar por defecto acá rompería cualquier página
 * nueva hasta acordarse de registrarla, que es una trampa fácil de pisar.
 */
export function puedeAcceder(perfil: PerfilPermisos, pathname: string): boolean {
  const regla = reglaParaRuta(pathname)
  if (!regla) return true
  if (perfil.rol === 'admin') return true
  if (regla.soloAdmin) return false
  return tienePermiso(perfil, ...(regla.permisos ?? []))
}

/** Primera ruta a la que el usuario sí puede entrar — para redirigir con criterio */
export function rutaInicialPara(perfil: PerfilPermisos): string {
  if (perfil.rol === 'admin' || tienePermiso(perfil, 'dashboard')) return '/dashboard'
  const candidatas = [
    '/dashboard/relevamientos',
    '/dashboard/obras',
    '/dashboard/obras/calculadoras',
    '/dashboard/consorcios',
    '/dashboard/herramientas',
  ]
  return candidatas.find(r => puedeAcceder(perfil, r)) ?? '/acceso-denegado'
}
