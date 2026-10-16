import { createServiceClient } from '@/lib/supabase/server'
import UsuariosTabs from './UsuariosTabs'
import type { Profile } from '@/types'
import { contarRelevamientos, hoyArgentina, SIN_RELEVAMIENTOS, type UsuarioFila, type Rol } from '@/lib/usuarios'

const PAGINA = 1000

export default async function TecnicosPage() {
  const supabase = createServiceClient()

  // Supabase corta en mil filas por pedido: los relevamientos van paginados y con
  // `order`, que sin él las páginas se saltean o repiten filas. Sólo dos columnas.
  async function relevamientos() {
    const filas: { tecnico_id: string | null; fecha: string | null }[] = []
    for (let desde = 0; ; desde += PAGINA) {
      const { data, error } = await supabase.from('relevamientos')
        .select('tecnico_id, fecha')
        .order('id')
        .range(desde, desde + PAGINA - 1)
      if (error) return { filas, error: error.message }
      filas.push(...(data ?? []))
      if (!data || data.length < PAGINA) return { filas, error: null }
    }
  }

  // `listUsers` también pagina (50 por defecto)
  async function correos() {
    const m: Record<string, string> = {}
    for (let page = 1; page < 50; page++) {
      const { data } = await supabase.auth.admin.listUsers({ page, perPage: PAGINA })
      const users = data?.users ?? []
      for (const u of users) m[u.id] = u.email ?? ''
      if (users.length < PAGINA) break
    }
    return m
  }

  const [{ data: profiles }, emailById, rel] = await Promise.all([
    supabase.from('profiles').select('*').order('nombre'),
    correos(),
    relevamientos(),
  ])

  const conteo = contarRelevamientos(rel.filas, hoyArgentina())

  const usuarios: UsuarioFila[] = ((profiles as Profile[]) ?? []).map(p => ({
    id: p.id,
    nombre: p.nombre ?? '',
    email: emailById[p.id] ?? '',
    // Sin rol reconocido, el de menos privilegio
    rol: (['admin', 'panel', 'tecnico', 'usuario'].includes(p.rol) ? p.rol : 'usuario') as Rol,
    zona: p.zona,
    permisos: Array.isArray(p.permisos) ? p.permisos : [],
    relevamientos: conteo.get(p.id) ?? SIN_RELEVAMIENTOS,
  }))

  return <UsuariosTabs usuarios={usuarios} errorRelevamientos={rel.error} />
}
