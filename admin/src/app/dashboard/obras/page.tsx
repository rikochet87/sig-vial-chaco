'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@/lib/UserContext'

const TIPOS = ['', 'terraplen', 'excavacion', 'ripio', 'canal', 'limpieza'] as const
const ESTADOS = ['', 'planificada', 'en_curso', 'ejecutada'] as const

const TIPO_LABELS: Record<string, string> = {
  terraplen: 'Terraplén', excavacion: 'Excavación', ripio: 'Ripio',
  canal: 'Canal', limpieza: 'Limpieza Vial',
}
const TIPO_COLORS: Record<string, string> = {
  terraplen: '#8D6E63', excavacion: '#FF7043', ripio: '#90A4AE',
  canal: '#29B6F6', limpieza: '#66BB6A',
}
const ESTADO_LABELS: Record<string, string> = {
  planificada: 'Planificada', en_curso: 'En curso', ejecutada: 'Ejecutada',
}
const ESTADO_COLORS: Record<string, string> = {
  planificada: '#F5C300', en_curso: '#4CAF50', ejecutada: '#2196F3',
}
const JURIS_LABELS: Record<string, string> = {
  consorcio: 'Consorcio', ruta_provincial: 'Ruta Provincial',
  metropolitana: 'Metropolitana', otra: 'Otra',
}

const PAGE_SIZE = 20

interface Obra {
  id: string
  tipo: string
  jurisdiccion: string
  consorcio_numero: number | null
  ubicacion: string | null
  descripcion: string | null
  estado: string
  fecha_inicio: string | null
  fecha_fin_estimada: string | null
  cantidad: number | null
  unidad: string | null
  presupuesto_total: number | null
  aporte_dvp: number | null
  aporte_ccc: number | null
  precio_unitario: number | null
  visible_para: 'todos' | 'seleccion' | null
  datos_calculadora: Record<string, unknown> | null
  created_at: string
  created_by: string | null
}

interface Tecnico {
  id: string
  nombre: string
  email: string
  zona: string | null
  rol: string
}

const TIPOS_EDIT = ['terraplen', 'excavacion', 'ripio', 'canal', 'limpieza'] as const
const ESTADOS_EDIT = ['planificada', 'en_curso', 'ejecutada'] as const
type Jurisdiccion = 'consorcio' | 'ruta_provincial' | 'metropolitana' | 'otra'
const JURIS_EDIT: Jurisdiccion[] = ['consorcio', 'ruta_provincial', 'metropolitana', 'otra']

const mono: React.CSSProperties = { fontFamily: 'monospace' }
const selectStyle: React.CSSProperties = {
  background: '#1a1a1a', border: '1px solid #252525', color: '#e0e0e0',
  padding: '6px 10px', fontSize: 13,
}
const labelStyle: React.CSSProperties = {
  color: '#555', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase',
}
const wrapStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 }

const inpStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: '#0a0a0a', border: '1px solid #222',
  color: '#ddd', padding: '6px 9px', fontSize: 13,
  fontFamily: 'monospace', outline: 'none', borderRadius: 2,
}
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 12, color: '#555',
  textTransform: 'uppercase', letterSpacing: 0.8,
  fontFamily: 'monospace', marginBottom: 3, marginTop: 10,
}

// ── Modal de edición ───────────────────────────────────────────────────────────
interface EditModalProps {
  obra: Obra | null
  onClose: () => void
  onSaved: (updated: Obra) => void
}

function EditModal({ obra, onClose, onSaved }: EditModalProps) {
  const [tipo,        setTipo]        = useState('')
  const [juris,       setJuris]       = useState<Jurisdiccion>('consorcio')
  const [consNum,     setConsNum]     = useState('')
  const [ubicacion,   setUbicacion]   = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [estado,      setEstado]      = useState('')
  const [fechaIni,    setFechaIni]    = useState('')
  const [fechaFin,    setFechaFin]    = useState('')
  const [cantidad,    setCantidad]    = useState('')
  const [unidad,      setUnidad]      = useState('')
  const [presupuesto, setPresupuesto] = useState('')
  const [dvp,         setDvp]         = useState('')
  const [ccc,         setCcc]         = useState('')
  const [precioUnit,  setPrecioUnit]  = useState('')
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  useEffect(() => {
    if (!obra) return
    setTipo(obra.tipo)
    setJuris((obra.jurisdiccion as Jurisdiccion) ?? 'consorcio')
    setConsNum(obra.consorcio_numero != null ? String(obra.consorcio_numero) : '')
    setUbicacion(obra.ubicacion ?? '')
    setDescripcion(obra.descripcion ?? '')
    setEstado(obra.estado)
    setFechaIni(obra.fecha_inicio ?? '')
    setFechaFin(obra.fecha_fin_estimada ?? '')
    setCantidad(obra.cantidad != null ? String(obra.cantidad) : '')
    setUnidad(obra.unidad ?? '')
    setPresupuesto(obra.presupuesto_total != null ? String(obra.presupuesto_total) : '')
    setDvp(obra.aporte_dvp != null ? String(obra.aporte_dvp) : '')
    setCcc(obra.aporte_ccc != null ? String(obra.aporte_ccc) : '')
    setPrecioUnit(obra.precio_unitario != null ? String(obra.precio_unitario) : '')
    setError(null)
  }, [obra?.id])

  if (!obra) return null

  const color = TIPO_COLORS[tipo] ?? '#607D8B'

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/obras', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: obra.id,
          tipo,
          jurisdiccion:       juris,
          consorcio_numero:   juris === 'consorcio' && consNum ? Number(consNum) : null,
          ubicacion:          juris !== 'consorcio' ? ubicacion || null : null,
          descripcion:        descripcion || null,
          estado,
          fecha_inicio:       fechaIni || null,
          fecha_fin_estimada: fechaFin || null,
          cantidad:           cantidad ? Number(cantidad) : null,
          unidad:             unidad || null,
          presupuesto_total:  presupuesto ? Number(presupuesto) : null,
          aporte_dvp:         dvp ? Number(dvp) : null,
          aporte_ccc:         ccc ? Number(ccc) : null,
          precio_unitario:    precioUnit ? Number(precioUnit) : null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al guardar')
      onSaved({ ...obra, ...json })
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}
    >
      <div style={{ background: '#111', border: '1px solid #222', width: 520,
        maxHeight: '90vh', overflowY: 'auto', padding: 24, position: 'relative' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ borderLeft: `3px solid ${color}`, paddingLeft: 10 }}>
            <div style={{ fontSize: 12, color: '#444', ...mono, textTransform: 'uppercase', letterSpacing: 1 }}>Editar obra</div>
            <div style={{ fontSize: 15, fontWeight: 700, color, ...mono, marginTop: 2 }}>
              {TIPO_LABELS[obra.tipo] ?? obra.tipo}
            </div>
          </div>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>

        {/* Tipo */}
        <label style={lbl}>Tipo de obra</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 5 }}>
          {TIPOS_EDIT.map(t => (
            <button key={t} onClick={() => setTipo(t)}
              style={{ padding: '6px 4px', fontSize: 12, ...mono, cursor: 'pointer', borderRadius: 2,
                border: `1px solid ${tipo === t ? (TIPO_COLORS[t] ?? '#607D8B') : '#1e1e1e'}`,
                background: tipo === t ? `${TIPO_COLORS[t] ?? '#607D8B'}18` : '#0a0a0a',
                color: tipo === t ? (TIPO_COLORS[t] ?? '#607D8B') : '#555' }}>
              {TIPO_LABELS[t]}
            </button>
          ))}
        </div>

        {/* Jurisdicción */}
        <label style={lbl}>Jurisdicción</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
          {JURIS_EDIT.map(j => (
            <button key={j} onClick={() => setJuris(j)}
              style={{ padding: '6px 4px', fontSize: 12, ...mono, cursor: 'pointer', borderRadius: 2,
                textAlign: 'left', paddingLeft: 8,
                border: `1px solid ${juris === j ? color : '#1e1e1e'}`,
                background: juris === j ? `${color}18` : '#0a0a0a',
                color: juris === j ? color : '#555' }}>
              {JURIS_LABELS[j]}
            </button>
          ))}
        </div>

        {/* Consorcio o ubicación */}
        {juris === 'consorcio' ? (
          <>
            <label style={lbl}>Nº Consorcio</label>
            <input style={inpStyle} type="number" value={consNum}
              onChange={e => setConsNum(e.target.value)} placeholder="Ej: 45" />
          </>
        ) : (
          <>
            <label style={lbl}>Ubicación</label>
            <input style={inpStyle} value={ubicacion}
              onChange={e => setUbicacion(e.target.value)} placeholder="Ej: RP 3 km 45-78" />
          </>
        )}

        {/* Descripción */}
        <label style={lbl}>Descripción / Tramo</label>
        <input style={inpStyle} value={descripcion}
          onChange={e => setDescripcion(e.target.value)} placeholder="Descripción adicional..." />

        {/* Estado + Fechas */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div>
            <label style={lbl}>Estado</label>
            <select style={{ ...inpStyle, cursor: 'pointer' }} value={estado} onChange={e => setEstado(e.target.value)}>
              {ESTADOS_EDIT.map(s => <option key={s} value={s}>{ESTADO_LABELS[s]}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Fecha inicio</label>
            <input type="date" style={inpStyle} value={fechaIni} onChange={e => setFechaIni(e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Fecha fin est.</label>
            <input type="date" style={inpStyle} value={fechaFin} onChange={e => setFechaFin(e.target.value)} />
          </div>
        </div>

        {/* Cantidades */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
          <div>
            <label style={lbl}>Cantidad</label>
            <input type="number" style={inpStyle} value={cantidad} onChange={e => setCantidad(e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Unidad</label>
            <input style={inpStyle} value={unidad} onChange={e => setUnidad(e.target.value)} placeholder="ha / km / m³" />
          </div>
        </div>

        {/* Presupuesto */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
          {[
            { label: 'Presupuesto total', val: presupuesto, set: setPresupuesto },
            { label: 'Aporte DVP',        val: dvp,         set: setDvp         },
            { label: 'Aporte CCC',        val: ccc,         set: setCcc         },
            { label: 'Precio unitario',   val: precioUnit,  set: setPrecioUnit  },
          ].map(({ label, val, set }) => (
            <div key={label}>
              <label style={lbl}>{label}</label>
              <input type="number" style={inpStyle} value={val} onChange={e => set(e.target.value)} />
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div style={{ marginTop: 12, padding: '7px 10px', background: '#ff525211',
            border: '1px solid #ff5252', color: '#ff5252', fontSize: 13, ...mono }}>
            {error}
          </div>
        )}

        {/* Acciones */}
        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose}
            style={{ ...mono, background: 'none', border: '1px solid #222',
              color: '#555', padding: '8px 18px', cursor: 'pointer', fontSize: 13 }}>
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ ...mono, background: color, border: 'none',
              color: '#000', fontWeight: 700, padding: '8px 22px',
              cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13,
              opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}

function fmt(n: number | null) {
  if (n == null) return '-'
  return n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

// ── Badge de publicación ───────────────────────────────────────────────────────
function PublicadaBadge({ visible_para }: { visible_para: Obra['visible_para'] }) {
  if (!visible_para) return null
  const label = visible_para === 'todos' ? 'Todos' : 'Selección'
  return (
    <span style={{
      background: '#1a2e1a', color: '#4CAF50', border: '1px solid #4CAF5044',
      borderRadius: 20, padding: '1px 7px', fontSize: 12, fontWeight: 700,
      ...mono, letterSpacing: 0.5, whiteSpace: 'nowrap',
    }}>
      ▲ {label}
    </span>
  )
}

// ── Panel lateral de publicación ───────────────────────────────────────────────
interface PushPanelProps {
  obra: Obra | null
  tecnicos: Tecnico[]
  loadingTecnicos: boolean
  onClose: () => void
  onPublicada: (obraId: string, visible_para: Obra['visible_para']) => void
}

function PushPanel({ obra, tecnicos, loadingTecnicos, onClose, onPublicada }: PushPanelProps) {
  const [modo, setModo] = useState<'todos' | 'seleccion'>('todos')
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [busqueda, setBusqueda] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset al cambiar obra
  useEffect(() => {
    setModo('todos')
    setSeleccion(new Set())
    setBusqueda('')
    setError(null)
  }, [obra?.id])

  if (!obra) return null

  const tecnicosFiltrados = tecnicos.filter(t =>
    busqueda.trim() === '' ||
    t.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    (t.zona ?? '').toLowerCase().includes(busqueda.toLowerCase()) ||
    t.email.toLowerCase().includes(busqueda.toLowerCase())
  )

  const toggleUser = (id: string) => {
    setSeleccion(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handlePublicar = async () => {
    if (modo === 'seleccion' && seleccion.size === 0) {
      setError('Seleccioná al menos un usuario')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/obras/publicar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          obra_id: obra.id,
          tipo: modo,
          user_ids: modo === 'seleccion' ? Array.from(seleccion) : [],
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al publicar')
      onPublicada(obra.id, json.visible_para)
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setSaving(false)
    }
  }

  const handleDespublicar = async () => {
    if (!obra.visible_para) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/obras/publicar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ obra_id: obra.id, tipo: 'despublicar' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al despublicar')
      onPublicada(obra.id, null)
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setSaving(false)
    }
  }

  const color = TIPO_COLORS[obra.tipo] ?? '#607D8B'

  return (
    <>
      {/* Overlay semitransparente */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          zIndex: 200,
        }}
      />

      {/* Panel lateral derecho */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 360, background: '#111', borderLeft: '1px solid #1e1e1e',
        zIndex: 201, display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid #1e1e1e', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 12, color: '#444', ...mono, textTransform: 'uppercase', letterSpacing: 1 }}>
                Publicar en app
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color, ...mono, marginTop: 3 }}>
                {TIPO_LABELS[obra.tipo] ?? obra.tipo}
              </div>
              <div style={{ fontSize: 12, color: '#555', ...mono, marginTop: 2 }}>
                {obra.consorcio_numero ? `CC Nº ${obra.consorcio_numero}` : obra.ubicacion ?? '—'}
                {obra.descripcion ? ` · ${obra.descripcion}` : ''}
              </div>
            </div>
            <button onClick={onClose}
              style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4 }}>
              ×
            </button>
          </div>

          {/* Estado actual de publicación */}
          {obra.visible_para && (
            <div style={{ marginTop: 10, padding: '6px 10px', background: '#0d1f0d',
              border: '1px solid #4CAF5033', borderRadius: 2, display: 'flex',
              alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: '#4CAF50', ...mono }}>
                ▲ Publicada para {obra.visible_para === 'todos' ? 'todos' : 'selección'}
              </span>
              <button onClick={handleDespublicar} disabled={saving}
                style={{ background: 'none', border: '1px solid #f4433633', color: '#f44336',
                  fontSize: 12, padding: '2px 8px', cursor: 'pointer', ...mono }}>
                Despublicar
              </button>
            </div>
          )}
        </div>

        {/* Selector de modo */}
        <div style={{ padding: '16px 20px 0', flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: '#444', ...mono, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            Destinatarios
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {([
              { id: 'todos',     label: '◉ Todos los usuarios' },
              { id: 'seleccion', label: '◎ Elegir usuarios'    },
            ] as const).map(m => (
              <button key={m.id} onClick={() => setModo(m.id)}
                style={{
                  flex: 1, padding: '8px 6px', fontSize: 12, ...mono, cursor: 'pointer',
                  borderRadius: 2, border: `1px solid ${modo === m.id ? '#4CAF50' : '#1e1e1e'}`,
                  background: modo === m.id ? '#0d1f0d' : '#0a0a0a',
                  color: modo === m.id ? '#4CAF50' : '#444',
                  fontWeight: modo === m.id ? 700 : 400,
                }}>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Lista de usuarios (solo en modo selección) */}
        {modo === 'seleccion' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '12px 20px 0' }}>
            <input
              placeholder="Buscar por nombre, zona o email..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              style={{
                background: '#0a0a0a', border: '1px solid #222', color: '#ccc',
                padding: '6px 10px', fontSize: 13, ...mono, outline: 'none',
                borderRadius: 2, marginBottom: 8, flexShrink: 0,
              }}
            />

            {loadingTecnicos ? (
              <div style={{ color: '#333', fontSize: 13, ...mono, textAlign: 'center', padding: 20 }}>
                Cargando usuarios...
              </div>
            ) : (
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {/* Seleccionar todos */}
                {tecnicosFiltrados.length > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                    <button
                      onClick={() => {
                        const allIds = tecnicosFiltrados.map(t => t.id)
                        const allSelected = allIds.every(id => seleccion.has(id))
                        setSeleccion(allSelected ? new Set() : new Set(allIds))
                      }}
                      style={{ background: 'none', border: 'none', color: '#555', fontSize: 12, ...mono, cursor: 'pointer' }}>
                      {tecnicosFiltrados.every(t => seleccion.has(t.id)) ? 'Deseleccionar todos' : 'Seleccionar todos'}
                    </button>
                  </div>
                )}

                {tecnicosFiltrados.map(t => {
                  const selected = seleccion.has(t.id)
                  return (
                    <div key={t.id}
                      onClick={() => toggleUser(t.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 10px', cursor: 'pointer', borderRadius: 2,
                        marginBottom: 2,
                        background: selected ? '#0d1f0d' : 'transparent',
                        border: `1px solid ${selected ? '#4CAF5033' : 'transparent'}`,
                      }}
                      onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLDivElement).style.background = '#141414' }}
                      onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                    >
                      {/* Checkbox visual */}
                      <div style={{
                        width: 14, height: 14, borderRadius: 2, flexShrink: 0,
                        border: `1px solid ${selected ? '#4CAF50' : '#333'}`,
                        background: selected ? '#4CAF50' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {selected && <span style={{ fontSize: 12, color: '#000', lineHeight: 1 }}>✓</span>}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: selected ? '#ccc' : '#888', ...mono,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.nombre}
                        </div>
                        <div style={{ fontSize: 12, color: '#444', ...mono, marginTop: 1 }}>
                          {t.zona ?? '—'} · {t.rol}
                        </div>
                      </div>
                    </div>
                  )
                })}

                {tecnicosFiltrados.length === 0 && (
                  <div style={{ color: '#333', fontSize: 13, ...mono, textAlign: 'center', padding: 20 }}>
                    Sin resultados
                  </div>
                )}
              </div>
            )}

            {seleccion.size > 0 && (
              <div style={{ fontSize: 12, color: '#4CAF50', ...mono, padding: '6px 0', flexShrink: 0 }}>
                {seleccion.size} usuario{seleccion.size !== 1 ? 's' : ''} seleccionado{seleccion.size !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        )}

        {modo === 'todos' && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', color: '#333', fontSize: 13, ...mono, lineHeight: 1.8 }}>
              La obra será visible para<br />todos los usuarios de la app
            </div>
          </div>
        )}

        {/* Footer con botón de acción */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid #1e1e1e', flexShrink: 0 }}>
          {error && (
            <div style={{ fontSize: 12, color: '#f44336', ...mono, marginBottom: 8,
              padding: '6px 8px', background: '#f4433611', border: '1px solid #f4433633' }}>
              {error}
            </div>
          )}
          <button
            onClick={handlePublicar}
            disabled={saving || (modo === 'seleccion' && seleccion.size === 0)}
            style={{
              width: '100%', padding: '10px', fontSize: 13, fontWeight: 700, ...mono,
              cursor: saving ? 'not-allowed' : 'pointer', borderRadius: 2,
              background: '#4CAF50', border: 'none', color: '#000',
              opacity: (saving || (modo === 'seleccion' && seleccion.size === 0)) ? 0.4 : 1,
            }}>
            {saving ? 'Publicando...' : modo === 'todos' ? '▲ Publicar para todos' : `▲ Publicar para ${seleccion.size} usuario${seleccion.size !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Página principal ───────────────────────────────────────────────────────────
export default function ObrasPage() {
  const router = useRouter()
  const { profile: currentUser } = useUser()

  const [obras, setObras]       = useState<Obra[]>([])
  const [filtered, setFiltered] = useState<Obra[]>([])
  const [loading, setLoading]   = useState(true)
  const [tipo, setTipo]         = useState('')
  const [estado, setEstado]     = useState('')
  const [desde, setDesde]       = useState('')
  const [hasta, setHasta]       = useState('')
  const [page, setPage]         = useState(0)

  // Estado del modal de edición
  const [editObra, setEditObra] = useState<Obra | null>(null)

  // Estado del panel push
  const [panelObra, setPanelObra]           = useState<Obra | null>(null)
  const [tecnicos, setTecnicos]             = useState<Tecnico[]>([])
  const [loadingTecnicos, setLoadingTecnicos] = useState(false)

  useEffect(() => {
    fetch('/api/obras')
      .then(r => r.json())
      .then((data: Obra[]) => { setObras(data ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // Cargar técnicos una sola vez (lazy)
  const openPanel = (obra: Obra) => {
    setPanelObra(obra)
    if (tecnicos.length === 0 && !loadingTecnicos) {
      setLoadingTecnicos(true)
      fetch('/api/tecnicos')
        .then(r => r.json())
        .then((data: Tecnico[]) => { setTecnicos(data ?? []); setLoadingTecnicos(false) })
        .catch(() => setLoadingTecnicos(false))
    }
  }

  const handlePublicada = (obraId: string, visible_para: Obra['visible_para']) => {
    setObras(prev => prev.map(o => o.id === obraId ? { ...o, visible_para } : o))
  }

  const handleSaved = (updated: Obra) => {
    setObras(prev => prev.map(o => o.id === updated.id ? updated : o))
  }

  const applyFilters = useCallback(() => {
    let rows = obras
    if (tipo)   rows = rows.filter(o => o.tipo === tipo)
    if (estado) rows = rows.filter(o => o.estado === estado)
    if (desde)  rows = rows.filter(o => (o.fecha_inicio ?? o.created_at) >= desde)
    if (hasta)  rows = rows.filter(o => (o.fecha_inicio ?? o.created_at) <= hasta)
    setFiltered(rows)
    setPage(0)
  }, [obras, tipo, estado, desde, hasta])

  useEffect(() => { applyFilters() }, [applyFilters])

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('¿Eliminar esta obra? Esta acción no se puede deshacer.')) return
    await fetch(`/api/obras?id=${id}`, { method: 'DELETE' })
    setObras(prev => prev.filter(o => o.id !== id))
    if (panelObra?.id === id) setPanelObra(null)
  }

  const paged      = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)

  const totalPresupuesto = filtered.reduce((s, o) => s + (o.presupuesto_total ?? 0), 0)
  const totalDVP         = filtered.reduce((s, o) => s + (o.aporte_dvp ?? 0), 0)
  const totalCCC         = filtered.reduce((s, o) => s + (o.aporte_ccc ?? 0), 0)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <h1 style={{ color: '#e0e0e0', fontSize: 20, fontWeight: 700, letterSpacing: 0.5, ...mono, margin: 0 }}>
          Obras
        </h1>
        <span style={{ color: '#333', fontSize: 13, ...mono }}>{filtered.length} registros</span>
      </div>

      {/* Filtros */}
      <div style={{ background: '#191919', border: '1px solid #1e1e1e', padding: '14px 18px',
        marginBottom: 16, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={wrapStyle}>
          <label style={labelStyle}>Tipo</label>
          <select value={tipo} onChange={e => setTipo(e.target.value)} style={selectStyle}>
            <option value="">Todos</option>
            {TIPOS.filter(Boolean).map(t => (
              <option key={t} value={t}>{TIPO_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div style={wrapStyle}>
          <label style={labelStyle}>Estado</label>
          <select value={estado} onChange={e => setEstado(e.target.value)} style={selectStyle}>
            <option value="">Todos</option>
            {ESTADOS.filter(Boolean).map(s => (
              <option key={s} value={s}>{ESTADO_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <div style={wrapStyle}>
          <label style={labelStyle}>Desde</label>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={selectStyle} />
        </div>
        <div style={wrapStyle}>
          <label style={labelStyle}>Hasta</label>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={selectStyle} />
        </div>
      </div>

      {/* Totales */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          {[
            { label: 'Presupuesto total', val: totalPresupuesto, color: '#F5C300' },
            { label: 'Aporte DVP',        val: totalDVP,         color: '#4CAF50' },
            { label: 'Aporte CCC',        val: totalCCC,         color: '#2196F3' },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ background: '#191919', border: '1px solid #1e1e1e',
              borderLeft: `3px solid ${color}`, padding: '8px 14px' }}>
              <div style={{ color: '#555', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', ...mono }}>{label}</div>
              <div style={{ color, fontSize: 16, fontWeight: 700, ...mono, marginTop: 2 }}>
                ${fmt(val)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabla */}
      <div style={{ background: '#191919', border: '1px solid #1e1e1e', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#444', ...mono }}>Cargando...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#141414' }}>
                {['', 'Tipo', 'Consorcio / Ubicación', 'Tramo / Desc.', 'Cantidad', 'Presupuesto', 'DVP', 'CCC', 'Estado', 'Fecha inicio', ''].map((h, i) => (
                  <th key={i} style={{ padding: '10px 14px', color: '#444', fontSize: 12, fontWeight: 600,
                    textAlign: 'left', textTransform: 'uppercase', letterSpacing: 1,
                    borderBottom: '1px solid #1e1e1e', whiteSpace: 'nowrap', ...mono }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((o, i) => {
                const color      = TIPO_COLORS[o.tipo] ?? '#607D8B'
                const estadoColor = ESTADO_COLORS[o.estado] ?? '#555'
                const lugar      = o.consorcio_numero
                  ? `CC Nº ${o.consorcio_numero}`
                  : (o.ubicacion ?? JURIS_LABELS[o.jurisdiccion] ?? '-')
                const isActive   = panelObra?.id === o.id
                const canEdit    = currentUser?.rol === 'admin' || o.created_by === currentUser?.id

                return (
                  <tr key={o.id}
                    style={{
                      borderBottom: '1px solid #1e1e1e',
                      background: isActive
                        ? 'rgba(76,175,80,0.06)'
                        : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                    }}
                    onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(245,195,0,0.04)' }}
                    onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLTableRowElement).style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}
                  >
                    {/* Botón push */}
                    <td style={{ padding: '8px 6px 8px 14px', width: 1 }}>
                      <button
                        onClick={e => { e.stopPropagation(); isActive ? setPanelObra(null) : openPanel(o) }}
                        title="Publicar en app"
                        style={{
                          background: isActive ? '#4CAF5022' : 'transparent',
                          border: `1px solid ${isActive ? '#4CAF5066' : '#252525'}`,
                          color: isActive ? '#4CAF50' : '#555',
                          padding: '4px 8px', fontSize: 13, cursor: 'pointer',
                          borderRadius: 2, lineHeight: 1, whiteSpace: 'nowrap',
                        }}
                        onMouseEnter={e => { if (!isActive) { (e.currentTarget as HTMLButtonElement).style.borderColor = '#4CAF5066'; (e.currentTarget as HTMLButtonElement).style.color = '#4CAF50' } }}
                        onMouseLeave={e => { if (!isActive) { (e.currentTarget as HTMLButtonElement).style.borderColor = '#252525'; (e.currentTarget as HTMLButtonElement).style.color = '#555' } }}
                      >
                        ▲
                      </button>
                    </td>

                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ background: `${color}22`, color, border: `1px solid ${color}55`,
                          borderRadius: 2, padding: '2px 8px', fontSize: 13, fontWeight: 700, ...mono,
                          whiteSpace: 'nowrap' }}>
                          {TIPO_LABELS[o.tipo] ?? o.tipo}
                        </span>
                        <PublicadaBadge visible_para={o.visible_para} />
                      </div>
                    </td>

                    <td style={{ padding: '10px 14px', color: '#aaa', fontSize: 13, ...mono,
                      maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {lugar}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#666', fontSize: 13, ...mono,
                      maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {o.descripcion ?? '-'}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#888', fontSize: 13, ...mono, whiteSpace: 'nowrap' }}>
                      {o.cantidad != null ? `${o.cantidad.toLocaleString('es-AR', { maximumFractionDigits: 2 })} ${o.unidad ?? ''}` : '-'}
                    </td>
                    <td style={{ padding: '10px 14px', color, fontSize: 13, fontWeight: 700, ...mono, whiteSpace: 'nowrap' }}>
                      {o.presupuesto_total != null ? `$${fmt(o.presupuesto_total)}` : '-'}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#4CAF50', fontSize: 13, ...mono, whiteSpace: 'nowrap' }}>
                      {o.aporte_dvp != null ? `$${fmt(o.aporte_dvp)}` : '-'}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#2196F3', fontSize: 13, ...mono, whiteSpace: 'nowrap' }}>
                      {o.aporte_ccc != null ? `$${fmt(o.aporte_ccc)}` : '-'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ background: `${estadoColor}22`, color: estadoColor,
                        border: `1px solid ${estadoColor}55`, borderRadius: 20,
                        padding: '2px 10px', fontSize: 13, fontWeight: 600, ...mono }}>
                        {ESTADO_LABELS[o.estado] ?? o.estado}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', color: '#555', fontSize: 13, ...mono, whiteSpace: 'nowrap' }}>
                      {o.fecha_inicio ?? '-'}
                    </td>
                    <td style={{ padding: '8px 8px 8px 4px', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                      {/* PDF — solo si tiene snapshot */}
                      {o.datos_calculadora && (
                        <button
                          onClick={() => window.open(`/dashboard/obras/${o.id}/print`, '_blank')}
                          title="Imprimir / PDF"
                          style={{ background: 'transparent', border: '1px solid #252525', color: '#444',
                            padding: '4px 9px', fontSize: 12, lineHeight: 1, cursor: 'pointer', marginRight: 4 }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#90A4AE'; (e.currentTarget as HTMLButtonElement).style.color = '#90A4AE' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#252525'; (e.currentTarget as HTMLButtonElement).style.color = '#444' }}
                        >PDF</button>
                      )}
                      {/* Editar y Eliminar: solo el creador o admin */}
                      {canEdit && (
                        <>
                          <button
                            onClick={() => {
                              if (o.datos_calculadora) {
                                router.push(`/dashboard/obras/calculadoras?edit=${o.id}`)
                              } else {
                                setEditObra(o)
                              }
                            }}
                            title={o.datos_calculadora ? 'Editar en calculadora' : 'Editar'}
                            style={{ background: 'transparent', border: '1px solid #252525', color: '#444',
                              padding: '4px 9px', fontSize: 13, lineHeight: 1, cursor: 'pointer', marginRight: 4 }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#F5C300'; (e.currentTarget as HTMLButtonElement).style.color = '#F5C300' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#252525'; (e.currentTarget as HTMLButtonElement).style.color = '#444' }}
                          >✎</button>
                          <button
                            onClick={e => handleDelete(o.id, e)}
                            title="Eliminar"
                            style={{ background: 'transparent', border: '1px solid #252525', color: '#444',
                              padding: '4px 9px', fontSize: 13, lineHeight: 1, cursor: 'pointer' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#f44336'; (e.currentTarget as HTMLButtonElement).style.color = '#f44336' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#252525'; (e.currentTarget as HTMLButtonElement).style.color = '#444' }}
                          >✕</button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}

              {paged.length === 0 && (
                <tr>
                  <td colSpan={11} style={{ padding: 40, textAlign: 'center', color: '#444', ...mono }}>
                    {obras.length === 0 ? 'No hay obras guardadas todavía.' : 'Sin resultados para los filtros aplicados.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {/* Paginación */}
        {totalPages > 1 && (
          <div style={{ padding: '10px 16px', display: 'flex', gap: 8, alignItems: 'center',
            borderTop: '1px solid #1e1e1e' }}>
            <span style={{ color: '#444', fontSize: 13, ...mono }}>{filtered.length} resultados</span>
            <div style={{ flex: 1 }} />
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
              style={{ background: '#1e1e1e', border: '1px solid #252525',
                color: page === 0 ? '#333' : '#888', padding: '6px 14px',
                cursor: page === 0 ? 'not-allowed' : 'pointer', opacity: page === 0 ? 0.4 : 1, ...mono, fontSize: 13 }}>
              ← Anterior
            </button>
            <span style={{ color: '#444', fontSize: 13, ...mono }}>Pág {page + 1} / {totalPages}</span>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
              style={{ background: '#1e1e1e', border: '1px solid #252525',
                color: page >= totalPages - 1 ? '#333' : '#888', padding: '6px 14px',
                cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer',
                opacity: page >= totalPages - 1 ? 0.4 : 1, ...mono, fontSize: 13 }}>
              Siguiente →
            </button>
          </div>
        )}
      </div>

      {/* Modal de edición */}
      <EditModal
        obra={editObra}
        onClose={() => setEditObra(null)}
        onSaved={handleSaved}
      />

      {/* Panel lateral de publicación */}
      <PushPanel
        obra={panelObra}
        tecnicos={tecnicos}
        loadingTecnicos={loadingTecnicos}
        onClose={() => setPanelObra(null)}
        onPublicada={handlePublicada}
      />
    </div>
  )
}
