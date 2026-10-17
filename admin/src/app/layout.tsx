import type { Metadata, Viewport } from 'next'
import RegistrarSW from '@/components/RegistrarSW'
import './globals.css'

export const metadata: Metadata = {
  title: 'SIG Vial Chaco — Panel Admin',
  description: 'Panel de administración SIG Vial Chaco',
  applicationName: 'SIG Vial Chaco',
  // El manifiesto lo enlaza Next solo, desde `app/manifest.ts`. iOS no lo lee
  // para el ícono ni para abrir sin la barra del navegador: va aparte.
  appleWebApp: { capable: true, title: 'SIG Vial', statusBarStyle: 'black' },
  icons: { apple: '/iconos/apple-180.png' },
}

export const viewport: Viewport = {
  themeColor: '#0e0e0e',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body style={{ background: '#1A1A1A', color: '#fff', margin: 0 }}>
        {children}
        <RegistrarSW />
      </body>
    </html>
  )
}
