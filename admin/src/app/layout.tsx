import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SIG Vial Chaco — Panel Admin',
  description: 'Panel de administración SIG Vial Chaco',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body style={{ background: '#1A1A1A', color: '#fff', margin: 0 }}>
        {children}
      </body>
    </html>
  )
}
