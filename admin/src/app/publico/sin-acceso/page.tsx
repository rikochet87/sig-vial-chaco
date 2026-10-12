import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Enlace no disponible — SIG Vial Chaco',
  robots: { index: false, follow: false },
}

/** Adonde va a parar un enlace público dado de baja o mal copiado */
export default function SinAcceso() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#1A1A1A', padding: 24 }}>
      <div style={{ maxWidth: 440, background: '#191919', border: '1px solid #2a2a2a',
        borderLeft: '3px solid #F5C300', padding: '18px 20px', fontFamily: 'monospace' }}>
        <div style={{ fontSize: 12, color: '#8f8f8f', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>
          SIG Vial Chaco — Hidrología
        </div>
        <div style={{ fontSize: 15, color: '#e0e0e0', fontWeight: 700, marginBottom: 8 }}>
          Este enlace no está disponible
        </div>
        <div style={{ fontSize: 13, color: '#a0a0a0', lineHeight: 1.6 }}>
          Puede estar mal copiado o haber sido dado de baja. Pedile uno nuevo a quien te lo pasó.
        </div>
      </div>
    </div>
  )
}
