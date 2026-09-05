'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PERMISOS_OPCIONES } from '@/lib/permisos'

const ZONAS = ['ZI', 'ZII', 'ZIII', 'ZIV', 'ZV']

interface Props {
  id:       string
  nombre:   string
  zona:     string | null
  rol:      'tecnico' | 'admin' | 'usuario' | 'panel'
  permisos: string[]
}

export default function EditTecnicoButton({ id, nombre, zona, rol, permisos: permisosIniciales }: Props) {
  const router = useRouter()
  const [open,      setOpen]      = useState(false)
  const [nNombre,   setNombre]    = useState(nombre)
  const [nZona,     setZona]      = useState(zona ?? '')
  const [nRol,      setRol]       = useState<Props['rol']>(rol)
  const [nPermisos, setPermisos]  = useState<string[]>(permisosIniciales)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')

  const inp: React.CSSProperties = {
    width: '100%', padding: '8px 10px', background: '#111', border: '1px solid #252525',
    color: '#e0e0e0', fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit',
  }
  const lbl: React.CSSProperties = {
    display: 'block', color: '#555', fontSize: 12, marginBottom: 5,
    letterSpacing: 1, textTransform: 'uppercase',
  }

  const togglePermiso = (key: string) =>
    setPermisos(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])

  const toggleTodos = () =>
    setPermisos(prev => prev.length === PERMISOS_OPCIONES.length ? [] : PERMISOS_OPCIONES.map(p => p.key))

  function handleOpen() {
    setNombre(nombre); setZona(zona ?? ''); setRol(rol); setPermisos(permisosIniciales); setError('')
    setOpen(true)
  }

  async function handleSave() {
    if (!nNombre.trim()) { setError('El nombre no puede estar vacío.'); return }
    setLoading(true); setError('')
    const res = await fetch(`/api/tecnicos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: nNombre.trim(), zona: nZona || null, rol: nRol, permisos: nPermisos }),
    })
    if (res.ok) {
      setOpen(false)
      router.refresh()
    } else {
      const body = await res.json()
      setError(body.error || 'Error al guardar.')
    }
    setLoading(false)
  }

  return (
    <>
      <button
        onClick={handleOpen}
        style={{ background: 'transparent', border: '1px solid #252525', color: '#444', padding: '4px 12px', fontSize: 13, letterSpacing: 0.5, cursor: 'pointer', marginRight: 6 }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#F5C300'; (e.currentTarget as HTMLButtonElement).style.color = '#F5C300' }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#252525'; (e.currentTarget as HTMLButtonElement).style.color = '#444' }}
      >
        Editar
      </button>

      {open && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#000a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div style={{ background: '#141414', border: '1px solid #2a2a2a', padding: 28, width: 420, maxWidth: '92vw', maxHeight: '90vh', overflowY: 'auto' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <span style={{ color: '#e0e0e0', fontSize: 14, fontWeight: 700 }}>Editar usuario</span>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#555', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Nombre completo</label>
              <input value={nNombre} onChange={e => setNombre(e.target.value)} style={inp} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Rol</label>
              <select
                value={nRol}
                onChange={e => { setRol(e.target.value as Props['rol']); setZona(''); setPermisos([]) }}
                style={inp}
              >
                <option value="panel">Usuario Panel (acceso limitado)</option>
                <option value="tecnico">Técnico de campo (app móvil)</option>
                <option value="usuario">Usuario (app móvil, oficina)</option>
                <option value="admin">Administrador (acceso total)</option>
              </select>
            </div>

            {nRol === 'tecnico' && (
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Zona asignada</label>
                <select value={nZona} onChange={e => setZona(e.target.value)} style={inp}>
                  <option value="">— sin zona —</option>
                  {ZONAS.map(z => <option key={z} value={z}>{z}</option>)}
                </select>
              </div>
            )}

            {nRol !== 'admin' && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ ...lbl, marginBottom: 0 }}>Secciones habilitadas</label>
                  <button
                    type="button"
                    onClick={toggleTodos}
                    style={{ background: 'none', border: 'none', color: '#F5C300', fontSize: 12, cursor: 'pointer', letterSpacing: 0.5 }}
                  >
                    {nPermisos.length === PERMISOS_OPCIONES.length ? 'Ninguno' : 'Todos'}
                  </button>
                </div>
                <div style={{ background: '#111', border: '1px solid #252525', padding: '4px 0' }}>
                  {PERMISOS_OPCIONES.map(p => (
                    <label
                      key={p.key}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(245,195,0,0.04)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <input
                        type="checkbox"
                        checked={nPermisos.includes(p.key)}
                        onChange={() => togglePermiso(p.key)}
                        style={{ accentColor: '#F5C300', width: 14, height: 14, cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: 13, color: nPermisos.includes(p.key) ? '#e0e0e0' : '#666' }}>{p.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {error && <p style={{ color: '#f44336', fontSize: 13, marginBottom: 12 }}>{error}</p>}

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button
                onClick={handleSave}
                disabled={loading}
                style={{ flex: 1, padding: '9px', background: '#F5C300', color: '#111', fontWeight: 700, fontSize: 13, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1, letterSpacing: 1 }}
              >
                {loading ? 'GUARDANDO...' : 'GUARDAR'}
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{ padding: '9px 18px', background: 'transparent', color: '#555', fontSize: 13, border: '1px solid #252525', cursor: 'pointer' }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
