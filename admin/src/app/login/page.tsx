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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1A1A1A' }}>
      <div style={{ background: '#2C2C2C', borderRadius: 12, padding: '2.5rem 2rem', width: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'inline-block', background: '#F5C300', color: '#1A1A1A', fontWeight: 800, fontSize: 22, padding: '6px 18px', borderRadius: 8, letterSpacing: 2 }}>
            SIG / VIAL
          </div>
          <p style={{ color: '#9E9E9E', marginTop: 12, fontSize: 14 }}>Panel de Administración — Chaco</p>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', color: '#9E9E9E', fontSize: 13, marginBottom: 6 }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={{ width: '100%', padding: '10px 12px', background: '#3C3C3C', border: '1px solid #4C4C4C', borderRadius: 8, color: '#fff', fontSize: 15, boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', color: '#9E9E9E', fontSize: 13, marginBottom: 6 }}>Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={{ width: '100%', padding: '10px 12px', background: '#3C3C3C', border: '1px solid #4C4C4C', borderRadius: 8, color: '#fff', fontSize: 15, boxSizing: 'border-box' }}
            />
          </div>
          {error && <p style={{ color: '#ff5252', fontSize: 13, marginBottom: 16 }}>{error}</p>}
          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', padding: '12px', background: '#F5C300', color: '#1A1A1A', fontWeight: 700, fontSize: 16, borderRadius: 8, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
