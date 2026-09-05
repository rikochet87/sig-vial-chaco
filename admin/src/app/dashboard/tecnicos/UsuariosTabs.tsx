'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import EditTecnicoButton from './EditTecnicoButton'
import DeleteTecnicoButton from './DeleteTecnicoButton'
import ResendInviteButton from './ResendInviteButton'
import type { Profile } from '@/types'

// Quita acceso al panel sin eliminar el usuario (limpia permisos)
function RemovePanelButton({ id }: { id: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  async function handle() {
    if (!confirm('¿Quitar acceso al panel para este usuario?')) return
    setLoading(true)
    await fetch(`/api/tecnicos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permisos: [] }),
    })
    setLoading(false)
    router.refresh()
  }
  return (
    <button
      onClick={handle}
      disabled={loading}
      title="Quitar acceso al panel"
      style={{ background: 'transparent', border: '1px solid #252525', color: '#444', padding: '4px 10px', fontSize: 13, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1 }}
      onMouseEnter={e => { if (!loading) { (e.currentTarget as HTMLButtonElement).style.borderColor = '#f44336'; (e.currentTarget as HTMLButtonElement).style.color = '#f44336' } }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#252525'; (e.currentTarget as HTMLButtonElement).style.color = '#444' }}
    >
      {loading ? '...' : 'Quitar acceso'}
    </button>
  )
}

type Row = Profile & { email: string }

interface Props {
  panel:    Row[]   // admin + usuario
  tecnicos: Row[]   // tecnico
}

const ROL_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  admin:   { bg: '#F5C30022', color: '#F5C300', label: 'Admin'         },
  panel:   { bg: '#9C27B022', color: '#CE93D8', label: 'Panel'         },
  tecnico: { bg: '#2196F322', color: '#2196F3', label: 'Técnico'       },
  usuario: { bg: '#26a69a22', color: '#4DB6AC', label: 'Usuario (app)' },
}

const TH = ({ children }: { children: string }) => (
  <th style={{ padding: '10px 16px', color: '#444', fontSize: 12, fontWeight: 600, textAlign: 'left', textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid #1e1e1e' }}>
    {children}
  </th>
)

export default function UsuariosTabs({ panel, tecnicos }: Props) {
  const [tab, setTab] = useState<'panel' | 'tecnicos'>('panel')

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '9px 20px',
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 0.8,
    background: 'transparent',
    border: 'none',
    borderBottom: active ? '2px solid #F5C300' : '2px solid transparent',
    color: active ? '#F5C300' : '#444',
    cursor: 'pointer',
    transition: 'color 0.15s',
  })

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700 }}>Usuarios</h1>
        <Link
          href="/dashboard/tecnicos/nuevo"
          className="glow-y"
          style={{ background: '#F5C300', color: '#111', fontWeight: 700, padding: '9px 18px', textDecoration: 'none', fontSize: 13, letterSpacing: 1 }}
        >
          + NUEVO
        </Link>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: '1px solid #1e1e1e', marginBottom: 0, display: 'flex', gap: 0 }}>
        <button style={tabStyle(tab === 'panel')} onClick={() => setTab('panel')}>
          Panel web&nbsp;
          <span style={{ opacity: 0.5 }}>({panel.length})</span>
        </button>
        <button style={tabStyle(tab === 'tecnicos')} onClick={() => setTab('tecnicos')}>
          App de campo&nbsp;
          <span style={{ opacity: 0.5 }}>({tecnicos.length})</span>
        </button>
      </div>

      {/* Panel web table */}
      {tab === 'panel' && (
        <div style={{ background: '#191919', border: '1px solid #1e1e1e', borderTop: 'none', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#141414' }}>
                <TH>Nombre</TH>
                <TH>Email</TH>
                <TH>Rol</TH>
                <TH>Permisos</TH>
                <TH>Acciones</TH>
              </tr>
            </thead>
            <tbody>
              {panel.map((p, i) => {
                const b = ROL_BADGE[p.rol] ?? ROL_BADGE.usuario
                const nPermisos = p.permisos?.length ?? 0
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid #1e1e1e', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                    <td style={{ padding: '10px 16px', color: '#e0e0e0', fontSize: 13 }}>{p.nombre}</td>
                    <td style={{ padding: '10px 16px', color: '#555', fontSize: 13 }}>{p.email}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ background: b.bg, color: b.color, border: `1px solid ${b.color}`, borderRadius: 20, padding: '2px 10px', fontSize: 13, fontWeight: 600 }}>
                        {b.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', color: '#555', fontSize: 13 }}>
                      {p.rol === 'admin'
                        ? <span style={{ color: '#F5C300', fontSize: 13 }}>Acceso total</span>
                        : nPermisos === 0
                          ? <span style={{ color: '#444', fontSize: 13 }}>Sin secciones</span>
                          : <span style={{ color: '#4CAF50', fontSize: 13 }}>{nPermisos} sección{nPermisos !== 1 ? 'es' : ''}</span>
                      }
                    </td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      <ResendInviteButton id={p.id} nombre={p.nombre} />
                      <EditTecnicoButton id={p.id} nombre={p.nombre} zona={p.zona} rol={p.rol} permisos={p.permisos ?? []} />
                      {/* Si es usuario de app con permisos, "eliminar del panel" = quitar permisos */}
                      {(p.rol === 'tecnico' || p.rol === 'usuario')
                        ? <RemovePanelButton id={p.id} />
                        : <DeleteTecnicoButton id={p.id} nombre={p.nombre} />
                      }
                    </td>
                  </tr>
                )
              })}
              {panel.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: '#555', fontSize: 13 }}>Sin usuarios del panel registrados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Técnicos de campo table */}
      {tab === 'tecnicos' && (
        <div style={{ background: '#191919', border: '1px solid #1e1e1e', borderTop: 'none', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#141414' }}>
                <TH>Nombre</TH>
                <TH>Email</TH>
                <TH>Zona</TH>
                <TH>Acciones</TH>
              </tr>
            </thead>
            <tbody>
              {tecnicos.map((p, i) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #1e1e1e', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                  <td style={{ padding: '10px 16px', color: '#e0e0e0', fontSize: 13 }}>{p.nombre}</td>
                  <td style={{ padding: '10px 16px', color: '#555', fontSize: 13 }}>{p.email}</td>
                  <td style={{ padding: '10px 16px', color: '#555', fontSize: 13 }}>
                    {p.zona
                      ? <span style={{ background: '#2196F311', color: '#2196F3', border: '1px solid #2196F3', borderRadius: 20, padding: '2px 10px', fontSize: 13, fontWeight: 600 }}>{p.zona}</span>
                      : <span style={{ color: '#333' }}>—</span>
                    }
                  </td>
                  <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                    <ResendInviteButton id={p.id} nombre={p.nombre} />
                    <EditTecnicoButton id={p.id} nombre={p.nombre} zona={p.zona} rol={p.rol} permisos={p.permisos ?? []} />
                    <DeleteTecnicoButton id={p.id} nombre={p.nombre} />
                  </td>
                </tr>
              ))}
              {tecnicos.length === 0 && (
                <tr><td colSpan={4} style={{ padding: 32, textAlign: 'center', color: '#555', fontSize: 13 }}>Sin técnicos registrados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
