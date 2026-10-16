/**
 * Hidrología para quien llega con un enlace público: sin cuenta, sólo lectura
 * y sin la pestaña Precisión. El middleware ya comprobó la cookie del enlace
 * antes de llegar acá (`lib/enlacePublico.ts`).
 *
 * Arma lo mínimo de lo que el layout del panel le da a la pantalla: el
 * contexto de usuario —un visitante sin rol ni permisos, así ningún control de
 * administrador aparece— y el contenedor `#panel-contenido`, que es sobre el
 * que actúa el control de tamaño de texto.
 */
import { Suspense } from 'react'
import type { Metadata } from 'next'
import { UserProvider, type UserProfile } from '@/lib/UserContext'
import Hidrologia from '@/components/hidrologia/Hidrologia'
import TamanoTexto from '@/components/TamanoTexto'
import Firma from '@/components/Firma'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Sección Hidrometeorológica — SIG Vial Chaco',
  // Se abre con un enlace que se le pasa a alguien: no es para los buscadores
  robots: { index: false, follow: false },
}

const VISITANTE: UserProfile = { id: '', email: '', nombre: null, rol: 'usuario', permisos: [] }

export default function HidrologiaPublica() {
  return (
    <UserProvider initialProfile={VISITANTE}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#1A1A1A' }}>
        <div style={{
          background: '#1A1A1A', height: 32, flexShrink: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', padding: '0 16px', borderBottom: '1px solid #222',
        }}>
          <span style={{ fontWeight: 600, fontSize: 13, color: '#e0e0e0', letterSpacing: 0.3 }}>
            SIG Vial Chaco — Sección Hidrometeorológica
          </span>
          <TamanoTexto />
        </div>
        <main id="panel-contenido" className="sv-publico-main" style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          <Suspense fallback={null}>
            <Hidrologia publico />
          </Suspense>
        </main>
        <Firma />
      </div>
    </UserProvider>
  )
}
