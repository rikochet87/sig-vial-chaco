'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const ZONAS = ['ZI', 'ZII', 'ZIII', 'ZIV', 'ZV']

interface Props {
  id:     string
  nombre: string
  zona:   string | null
  rol:    'tecnico' | 'admin' | 'usuario'
}

export default function EditTecnicoButton({ id, nombre, zona, rol }: Props) {
  const router = useRouter()
  const [open,    setOpen]    = useState(false)
  const [nNombre, setNombre]  = useState(nombre)
  const [nZona,   setZona]    = useState(zona ?? '')
  const [nRol,    setRol]     = useState<'tecnico' | 'admin' | 'usuario'>(rol)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const inp: React.CSSProperties = {
    width: '100%', padding: '8px 10px', background: '#111', border: '1px solid #252525',
    color: '#e0e0e0', fontSize: 12, boxSizing: 'border-box', fontFamily: 'inherit',
  }
  const lbl: React.CSSProperties = {
    display: 'block', color: '#555', fontSize: 10, marginBottom: 5,
    letterSpacing: 1, textTransform: 'uppercase',
  }

  async function handleSave() {
    if (!nNombre.trim()) { setError('El nombre no puede estar vacío.'); return }
    setLoading(true); setError('')
    const res = await fetch(`/api/tecnicos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: nNombre.trim(), zona: nZona || null, rol: nRol }),
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
      {/* Botón editar */}
      <button
        onClick={() => { setOpen(true); setNombre(nombre); setZona(zona ?? ''); setRol(rol); setError('') }}
        style={{ background: 'transparent', border: '1px solid #252525', color: '#444', padding: '4px 12px', fontSize: 11, letterSpacing: 0.5, cursor: 'pointer', marginRight: 6 }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#F5C300'; (e.currentTarget as HTMLButtonElement).style.color = '#F5C300' }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#252525'; (e.currentTarget as HTMLButtonElement).style.color = '#444' }}
      >
        Editar
      </button>

      {/* Modal overlay */}
      {open && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#000a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div style={{ background: '#141414', border: '1px solid #2a2a2a', padding: 28, width: 380, maxWidth: '92vw' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <span style={{ color: '#e0e0e0', fontSize: 14, fontWeight: 700 }}>Editar usuario</span>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#555', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>

            {/* Nombre */}
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Nombre completo</label>
              <input value={nNombre} onChange={e => setNombre(e.target.value)} style={inp} />
            </div>

            {/* Rol */}
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Rol</label>
              <select
                value={nRol}
                onChange={e => {
                  const r = e.target.value as 'tecnico' | 'admin' | 'usuario'
                  setRol(r)
                  if (r !== 'tecnico') setZona('')
                }}
                style={inp}
              >
                <option value="tecnico">Técnico</option>
                <option value="usuario">Usuario</option>
                <option value="admin">Administrador</option>
              </select>
            </div>

            {/* Zona — solo para técnicos */}
            {nRol === 'tecnico' && (
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Zona asignada</label>
                <select value={nZona} onChange={e => setZona(e.target.value)} style={inp}>
                  <option value="">— sin zona —</option>
                  {ZONAS.map(z => <option key={z} value={z}>{z}</option>)}
                </select>
              </div>
            )}

            {error && <p style={{ color: '#f44336', fontSize: 12, marginBottom: 12 }}>{error}</p>}

            {/* Acciones */}
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button
                onClick={handleSave}
                disabled={loading}
                style={{ flex: 1, padding: '9px', background: '#F5C300', color: '#111', fontWeight: 700, fontSize: 12, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1, letterSpacing: 1 }}
              >
                {loading ? 'GUARDANDO...' : 'GUARDAR'}
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{ padding: '9px 18px', background: 'transparent', color: '#555', fontSize: 12, border: '1px solid #252525', cursor: 'pointer' }}
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
