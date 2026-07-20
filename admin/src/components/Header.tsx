'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface HeaderProps {
  userEmail: string
  title?: string
}

export default function Header({ userEmail, title }: HeaderProps) {
  const router  = useRouter()
  const [nombre, setNombre] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('profiles').select('nombre').eq('id', user.id).single()
        .then(({ data }) => { if (data?.nombre) setNombre(data.nombre) })
    })
  }, [])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const displayName = nombre ?? userEmail

  return (
    <div style={{
      background: '#1A1A1A',
      height: 32,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px',
      borderBottom: '1px solid #222',
      flexShrink: 0,
    }}>
      <span style={{ fontWeight: 600, fontSize: 11, color: '#e0e0e0', letterSpacing: 0.3 }}>
        {title || 'SIG Vial Chaco — Panel Admin'}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#2a2a2a', border: '1px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 8, color: '#9E9E9E' }}>▲</span>
          </div>
          <span style={{ color: '#9E9E9E', fontSize: 10, fontFamily: 'monospace' }}>{displayName}</span>
        </div>
        <button
          onClick={handleLogout}
          style={{
            background: 'transparent',
            border: '1px solid #333',
            borderRadius: 4,
            color: '#666',
            padding: '3px 8px',
            cursor: 'pointer',
            fontSize: 10,
            fontFamily: 'monospace',
            letterSpacing: 0.5,
            transition: 'border-color 0.15s, color 0.15s',
          }}
          onMouseEnter={e => { (e.target as HTMLButtonElement).style.borderColor = '#F5C300'; (e.target as HTMLButtonElement).style.color = '#F5C300' }}
          onMouseLeave={e => { (e.target as HTMLButtonElement).style.borderColor = '#333'; (e.target as HTMLButtonElement).style.color = '#666' }}
        >
          SALIR
        </button>
      </div>
    </div>
  )
}
