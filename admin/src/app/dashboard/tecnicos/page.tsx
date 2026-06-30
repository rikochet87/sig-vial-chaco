import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import DeleteTecnicoButton from './DeleteTecnicoButton'
import type { Profile } from '@/types'

export default async function TecnicosPage() {
  const supabase = await createClient()
  const { data: profiles } = await supabase.from('profiles').select('*').order('nombre')

  const rows = (profiles as Profile[]) ?? []

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700 }}>Técnicos</h1>
        <Link
          href="/dashboard/tecnicos/nuevo"
          style={{ background: '#F5C300', color: '#1A1A1A', fontWeight: 700, padding: '10px 20px', borderRadius: 8, textDecoration: 'none', fontSize: 14 }}
        >
          + Nuevo técnico
        </Link>
      </div>

      <div style={{ background: '#2C2C2C', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#3C3C3C' }}>
              {['Nombre', 'Email', 'Zona', 'Rol', 'Acciones'].map(h => (
                <th key={h} style={{ padding: '12px 16px', color: '#9E9E9E', fontSize: 12, fontWeight: 600, textAlign: 'left', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <tr key={p.id} style={{ borderTop: '1px solid #3C3C3C', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                <td style={{ padding: '12px 16px', color: '#fff', fontSize: 13 }}>{p.nombre}</td>
                <td style={{ padding: '12px 16px', color: '#9E9E9E', fontSize: 13 }}>{p.email}</td>
                <td style={{ padding: '12px 16px', color: '#9E9E9E', fontSize: 13 }}>{p.zona}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{
                    background: p.rol === 'admin' ? '#F5C30022' : '#2196F322',
                    color: p.rol === 'admin' ? '#F5C300' : '#2196F3',
                    border: `1px solid ${p.rol === 'admin' ? '#F5C300' : '#2196F3'}`,
                    borderRadius: 20,
                    padding: '2px 10px',
                    fontSize: 12,
                    fontWeight: 600,
                  }}>
                    {p.rol}
                  </span>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <DeleteTecnicoButton id={p.id} nombre={p.nombre} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: '#9E9E9E' }}>Sin usuarios registrados</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
