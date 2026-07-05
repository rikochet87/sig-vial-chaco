'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError || !data.user) {
      setError('Credenciales incorrectas.')
      setLoading(false)
      return
    }
    const { data: profile } = await supabase.from('profiles').select('rol').eq('id', data.user.id).single()
    if (profile?.rol !== 'admin') {
      await supabase.auth.signOut()
      setError('No tenés permisos de administrador.')
      setLoading(false)
      return
    }
    router.push('/dashboard')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111' }}>
      <div style={{ background: '#161616', border: '1px solid #1e1e1e', padding: '2.5rem 2rem', width: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{ display: 'inline-block', background: '#F5C300', color: '#111', fontWeight: 800, fontSize: 18, padding: '5px 16px', letterSpacing: 3, fontFamily: 'monospace' }}>
            SIG / VIAL
          </div>
          <p style={{ color: '#444', marginTop: 12, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' }}>Panel de Administración — Chaco</p>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', color: '#555', fontSize: 10, marginBottom: 6, letterSpacing: 1, textTransform: 'uppercase' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={{ width: '100%', padding: '9px 12px', background: '#1a1a1a', border: '1px solid #252525', color: '#e0e0e0', fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', color: '#555', fontSize: 10, marginBottom: 6, letterSpacing: 1, textTransform: 'uppercase' }}>Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={{ width: '100%', padding: '9px 12px', background: '#1a1a1a', border: '1px solid #252525', color: '#e0e0e0', fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>
          {error && <p style={{ color: '#f44336', fontSize: 12, marginBottom: 16, letterSpacing: 0.3 }}>{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="glow-y"
            style={{ width: '100%', padding: '11px', background: '#F5C300', color: '#111', fontWeight: 700, fontSize: 13, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1, letterSpacing: 1.5 }}
          >
            {loading ? 'INGRESANDO...' : 'INGRESAR'}
          </button>
        </form>
      </div>
    </div>
  )
}
