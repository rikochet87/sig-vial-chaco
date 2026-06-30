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
          style={{ background: '#3C3C3C', border: '1px solid #4C4C4C', borderRadius: 8, color: '#fff', padding: '8px 14px', fontSize: 14, width: 280 }}
        />
      </div>

      <div style={{ background: '#2C2C2C', borderRadius: 10, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9E9E9E' }}>Cargando...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#3C3C3C' }}>
                {['Nº', 'Nombre', 'Localidad', 'Zona', 'Red (km)', 'Color'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', color: '#9E9E9E', fontSize: 12, fontWeight: 600, textAlign: 'left', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => (
                <tr
                  key={c.numero}
                  onClick={() => router.push(`/dashboard/consorcios/${c.numero}`)}
                  style={{ borderTop: '1px solid #3C3C3C', cursor: 'pointer', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(245,195,0,0.06)')}
                  onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)')}
                >
                  <td style={{ padding: '12px 16px', color: '#F5C300', fontSize: 13, fontWeight: 700 }}>{c.numero}</td>
                  <td style={{ padding: '12px 16px', color: '#fff', fontSize: 13 }}>{c.nombre}</td>
                  <td style={{ padding: '12px 16px', color: '#9E9E9E', fontSize: 13 }}>{c.localidad}</td>
                  <td style={{ padding: '12px 16px', color: '#9E9E9E', fontSize: 13 }}>{c.zona}</td>
                  <td style={{ padding: '12px 16px', color: '#9E9E9E', fontSize: 13 }}>{c.red_km ?? '-'}</td>
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
