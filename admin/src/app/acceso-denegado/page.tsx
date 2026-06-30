import Link from 'next/link'

export default function AccesoDenegadoPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1A1A1A' }}>
      <div style={{ background: '#2C2C2C', borderRadius: 12, padding: '2.5rem 2rem', width: 400, textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🚫</div>
        <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Acceso denegado</h1>
        <p style={{ color: '#9E9E9E', marginBottom: 24 }}>
          Tu cuenta no tiene permisos de administrador.
        </p>
        <Link
          href="/login"
          style={{ display: 'inline-block', background: '#F5C300', color: '#1A1A1A', fontWeight: 700, padding: '10px 24px', borderRadius: 8, textDecoration: 'none' }}
        >
          Volver al login
        </Link>
      </div>
    </div>
  )
}
