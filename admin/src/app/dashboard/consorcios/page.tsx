'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Consorcio } from '@/types'

export default function ConsorciosPage() {
  const router = useRouter()
  const [consorcios, setConsorcios] = useState<Consorcio[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('consorcios').select('*').order('numero').then(({ data }) => {
      setConsorcios((data as Consorcio[]) ?? [])
      setLoading(false)
    })
  }, [])

  const filtered = consorcios.filter(c =>
    !search ||
    c.nombre?.toLowerCase().includes(search.toLowerCase()) ||
    String(c.numero).includes(search)
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700 }}>Consorcios</h1>
        <input
          type="text"
          placeholder="Buscar por nombre o número..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ background: '#1a1a1a', border: '1px solid #252525', color: '#e0e0e0', padding: '7px 12px', fontSize: 12, width: 260 }}
        />
      </div>

      <div style={{ background: '#191919', border: '1px solid #1e1e1e', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#444' }}>Cargando...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#141414' }}>
                {['Nº', 'Nombre', 'Localidad', 'Zona', 'Red (km)', 'Color'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', color: '#444', fontSize: 10, fontWeight: 600, textAlign: 'left', textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid #1e1e1e' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => (
                <tr
                  key={c.numero}
                  onClick={() => router.push(`/dashboard/consorcios/${c.numero}`)}
                  style={{ borderBottom: '1px solid #1e1e1e', cursor: 'pointer', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(245,195,0,0.05)')}
                  onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)')}
                >
                  <td style={{ padding: '10px 16px', color: '#F5C300', fontSize: 12, fontWeight: 700 }}>{c.numero}</td>
                  <td style={{ padding: '10px 16px', color: '#e0e0e0', fontSize: 12 }}>{c.nombre}</td>
                  <td style={{ padding: '10px 16px', color: '#666', fontSize: 12 }}>{c.localidad}</td>
                  <td style={{ padding: '10px 16px', color: '#666', fontSize: 12 }}>{c.zona}</td>
                  <td style={{ padding: '10px 16px', color: '#666', fontSize: 12 }}>{c.red_km ?? '-'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    {c.color && (
                      <span style={{ display: 'inline-block', width: 20, height: 20, borderRadius: 4, background: c.color, border: '1px solid #4C4C4C' }} />
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#9E9E9E' }}>Sin resultados</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
