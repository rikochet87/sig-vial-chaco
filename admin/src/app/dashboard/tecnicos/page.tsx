import { createServiceClient } from '@/lib/supabase/server'
import UsuariosTabs from './UsuariosTabs'
import type { Profile } from '@/types'

export default async function TecnicosPage() {
  const supabase = createServiceClient()

  const [{ data: profiles }, { data: authData }] = await Promise.all([
    supabase.from('profiles').select('*').order('nombre'),
    supabase.auth.admin.listUsers(),
  ])

  const emailById = Object.fromEntries(
    (authData?.users ?? []).map((u: { id: string; email?: string }) => [u.id, u.email ?? ''])
  )

  const rows = ((profiles as Profile[]) ?? []).map((p: Profile) => ({
    ...p,
    email: emailById[p.id] ?? '',
  }))

  // Un usuario puede aparecer en ambos tabs al mismo tiempo
  const panel    = rows.filter(r => r.rol === 'admin' || r.rol === 'panel' || (r.permisos ?? []).length > 0)
  const tecnicos = rows.filter(r => r.rol === 'tecnico' || r.rol === 'usuario')

  return <UsuariosTabs panel={panel} tecnicos={tecnicos} />
}
