'use client'
import { useState } from 'react'
import Link from 'next/link'

const ZONAS = ['ZI', 'ZII', 'ZIII', 'ZIV', 'ZV']

const PERMISOS_OPCIONES = [
  { key: 'dashboard',        label: 'Dashboard' },
  { key: 'consorcios',       label: 'Consorcios' },
  { key: 'relevamientos',    label: 'Relevamientos' },
  { key: 'herramientas',     label: 'Herramientas' },
  { key: 'obras',            label: 'Obras (lista y planta)' },
  { key: 'calc_ripio',       label: 'Calculadora — Ripio' },
  { key: 'calc_desmalezado', label: 'Calculadora — Desmalezado' },
  { key: 'calc_desbosque',   label: 'Calculadora — Desbosque' },
]

export default function NuevoTecnicoPage() {
  const [nombre,   setNombre]   = useState('')
  const [email,    setEmail]    = useState('')
  const [zona,     setZona]     = useState('ZI')
  const [rol,      setRol]      = useState<'tecnico' | 'admin' | 'usuario' | 'panel'>('panel')
  const [permisos, setPermisos] = useState<string[]>([])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [inviteLink, setInviteLink] = useState('')
  const [copied,   setCopied]   = useState(false)

  const togglePermiso = (key: string) =>
    setPermisos(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])

  const toggleTodos = () =>
    setPermisos(prev => prev.length === PERMISOS_OPCIONES.length ? [] : PERMISOS_OPCIONES.map(p => p.key))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const res = await fetch('/api/tecnicos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: nombre || null,
        email,
        zona:     rol === 'tecnico' ? zona : null,
        rol,
        permisos: rol === 'admin' ? [] : permisos,
      }),
    })
    const body = await res.json()
    if (!res.ok) {
      setError(body.error || 'Error al crear el usuario.')
    } else {
      setInviteLink(body.inviteLink)
    }
    setLoading(false)
  }

  const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', background: '#1a1a1a', border: '1px solid #252525', color: '#e0e0e0', fontSize: 12, boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { display: 'block', color: '#555', fontSize: 10, marginBottom: 6, letterSpacing: 1, textTransform: 'uppercase' }

  // ── Pantalla de éxito con link ──────────────────────────────────────────────
  if (inviteLink) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <Link href="/dashboard/tecnicos" style={{ color: '#F5C300', textDecoration: 'none', fontSize: 14 }}>← Volver</Link>
          <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700 }}>Usuario creado</h1>
        </div>
        <div style={{ background: '#191919', border: '1px solid #1e1e1e', padding: 28, maxWidth: 520 }}>
          <div style={{ color: '#4CAF50', fontSize: 13, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>✓</span> Cuenta creada. Enviá este enlace al usuario para que defina su contraseña y acceda al panel.
          </div>

          {/* Link copiable */}
          <div style={{ background: '#111', border: '1px solid #2a2a2a', padding: '10px 14px', fontSize: 11, color: '#888', wordBreak: 'break-all', marginBottom: 12, fontFamily: 'monospace' }}>
            {inviteLink}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => { navigator.clipboard.writeText(inviteLink); setCopied(true) }}
              style={{ flex: 1, padding: '10px', background: copied ? '#4CAF50' : '#F5C300', color: '#111', fontWeight: 700, fontSize: 12, border: 'none', cursor: 'pointer', letterSpacing: 1 }}
            >
              {copied ? '✓ COPIADO' : 'COPIAR ENLACE'}
            </button>
            <Link
              href="/dashboard/tecnicos"
              style={{ padding: '10px 18px', background: 'transparent', color: '#555', fontSize: 12, border: '1px solid #252525', textDecoration: 'none', display: 'flex', alignItems: 'center' }}
            >
              Volver
            </Link>
          </div>

          <p style={{ color: '#444', fontSize: 11, marginTop: 16 }}>
            El enlace expira en 24 horas. Si vence, podés reenviar la invitación desde la lista de usuarios.
          </p>
        </div>
      </div>
    )
  }

  // ── Formulario ──────────────────────────────────────────────────────────────
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <Link href="/dashboard/tecnicos" style={{ color: '#F5C300', textDecoration: 'none', fontSize: 14 }}>← Volver</Link>
        <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700 }}>Nuevo usuario</h1>
      </div>

      <div style={{ background: '#191919', border: '1px solid #1e1e1e', padding: 24, maxWidth: 480 }}>
        <form onSubmit={handleSubmit}>

          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Nombre completo (opcional)</label>
            <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} style={inp} placeholder="Ej: Juan Pérez" />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Email *</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={inp} />
          </div>

          <div style={{ marginBottom: rol === 'usuario' ? 8 : 24 }}>
            <label style={lbl}>Rol</label>
            <select value={rol} onChange={e => { setRol(e.target.value as typeof rol); setPermisos([]) }} style={inp}>
              <option value="panel">Usuario Panel (acceso limitado)</option>
              <option value="tecnico">Técnico de campo (app móvil)</option>
              <option value="usuario">Usuario (app móvil, oficina)</option>
              <option value="admin">Administrador (acceso total)</option>
            </select>
          </div>

          {/* Zona — solo técnicos */}
          {rol === 'tecnico' && (
            <div style={{ marginBottom: 24 }}>
              <label style={lbl}>Zona asignada</label>
              <select value={zona} onChange={e => setZona(e.target.value)} style={inp}>
                {ZONAS.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
            </div>
          )}

          {/* Permisos — todos los roles excepto admin */}
          {rol !== 'admin' && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <label style={{ ...lbl, marginBottom: 0 }}>Secciones habilitadas</label>
                <button
                  type="button"
                  onClick={toggleTodos}
                  style={{ background: 'none', border: 'none', color: '#F5C300', fontSize: 10, cursor: 'pointer', letterSpacing: 0.5 }}
                >
                  {permisos.length === PERMISOS_OPCIONES.length ? 'Ninguno' : 'Todos'}
                </button>
              </div>
              <div style={{ background: '#111', border: '1px solid #252525', padding: '4px 0' }}>
                {PERMISOS_OPCIONES.map(p => (
                  <label
                    key={p.key}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(245,195,0,0.04)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <input
                      type="checkbox"
                      checked={permisos.includes(p.key)}
                      onChange={() => togglePermiso(p.key)}
                      style={{ accentColor: '#F5C300', width: 14, height: 14, cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: 12, color: permisos.includes(p.key) ? '#e0e0e0' : '#666' }}>{p.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {error && <p style={{ color: '#ff5252', fontSize: 13, marginBottom: 16 }}>{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="glow-y"
            style={{ width: '100%', padding: '11px', background: '#F5C300', color: '#111', fontWeight: 700, fontSize: 12, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1, letterSpacing: 1.5 }}
          >
            {loading ? 'CREANDO...' : 'CREAR Y GENERAR ENLACE'}
          </button>
        </form>
      </div>
    </div>
  )
}
