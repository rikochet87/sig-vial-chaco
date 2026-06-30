'use client'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface HeaderProps {
  userEmail: string
  title?: string
}

export default function Header({ userEmail, title }: HeaderProps) {
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div style={{
      background: '#2C2C2C',
      height: 64,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 24px',
      borderBottom: '1px solid #3C3C3C',
      flexShrink: 0,
    }}>
      <span style={{ fontWeight: 600, fontSize: 18, color: '#fff' }}>
        {title || 'Panel Admin'}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ color: '#9E9E9E', fontSize: 14 }}>{userEmail}</span>
        <button
          onClick={handleLogout}
          style={{
            background: '#3C3C3C',
            border: '1px solid #4C4C4C',
            borderRadius: 8,
            color: '#9E9E9E',
            padding: '6px 14px',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          Salir
        </button>
      </div>
    </div>
  )
}
