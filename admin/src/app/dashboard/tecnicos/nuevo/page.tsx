'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const ZONAS = ['ZI', 'ZII', 'ZIII', 'ZIV', 'ZV']

export default function NuevoTecnicoPage() {
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [zona, setZona] = useState('ZI')
  const [rol, setRol] = useState<'tecnico' | 'admin'>('tecnico')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return }
    setLoading(true)
    setError('')
    const res = await fetch('/api/tecnicos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, email, password, zona, rol }),
    })
    const body = await res.json()
    if (!res.ok) {
      setError(body.error || 'Error al crear el usuario.')
    } else {
      setSuccess(true)
      setTimeout(() => router.push('/dashboard/tecnicos'), 1500)
    }
    setLoading(false)
  }

  const inputStyle = { width: '100%', padding: '10px 12px', background: '#3C3C3C', border: '1px solid #4C4C4C', borderRadius: 8, color: '#fff', fontSize: 15, boxSizing: 'border-box' as const }
  const labelStyle = { display: 'block' as const, color: '#9E9E9E', fontSize: 13, marginBottom: 6 }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <Link href="/dashboard/tecnicos" style={{ color: '#F5C300', textDecoration: 'none', fontSize: 14 }}>← Volver</Link>
        <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700 }}>Nuevo técnico</h1>
      </div>

      <div style={{ background: '#2C2C2C', borderRadius: 10, padding: 24, maxWidth: 480 }}>
        {success && (
          <div style={{ background: '#4CAF5022', border: '1px solid #4CAF50', borderRadius: 8, padding: '12px 16px', marginBottom: 20, color: '#4CAF50', fontSize: 14 }}>
            Usuario creado exitosamente. Redirigiendo...
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Nombre completo</label>
            <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} required style={inputStyle} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={inputStyle} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Contraseña (mín. 8 caracteres)</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} style={inputStyle} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Zona</label>
            <select value={zona} onChange={e => setZona(e.target.value)} style={{ ...inputStyle }}>
              {ZONAS.map(z => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>Rol</label>
            <select value={rol} onChange={e => setRol(e.target.value as 'tecnico' | 'admin')} style={{ ...inputStyle }}>
              <option value="tecnico">Técnico</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
          {error && <p style={{ color: '#ff5252', fontSize: 13, marginBottom: 16 }}>{error}</p>}
          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', padding: '12px', background: '#F5C300', color: '#1A1A1A', fontWeight: 700, fontSize: 16, borderRadius: 8, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Creando...' : 'Crear usuario'}
          </button>
        </form>
      </div>
    </div>
  )
}
