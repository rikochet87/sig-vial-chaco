import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { UserProvider } from '@/lib/UserContext'
import type { UserProfile } from '@/lib/UserContext'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch profile server-side para evitar flash en el Sidebar
  const service = createServiceClient()
  const { data: profile } = await service
    .from('profiles')
    .select('nombre, rol, permisos')
    .eq('id', user.id)
    .single()

  const initialProfile: UserProfile = {
    id:       user.id,
    email:    user.email ?? '',
    nombre:   profile?.nombre ?? null,
    rol:      (profile?.rol ?? 'admin') as UserProfile['rol'],
    permisos: profile?.permisos ?? [],
  }

  return (
    <UserProvider initialProfile={initialProfile}>
      <div style={{ display: 'flex', height: '100vh', background: '#1A1A1A' }}>
        <Sidebar />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Header userEmail={user.email ?? ''} />
          {/* id usado por TamanoTexto para aplicar el zoom de accesibilidad.
              Solo el contenido: el header queda fuera para que el control de
              tamaño no se escale a sí mismo y siga siendo clickeable. */}
          <main id="panel-contenido" style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
            {children}
          </main>
        </div>
      </div>
    </UserProvider>
  )
}
