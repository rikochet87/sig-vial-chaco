'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

// ── Tipos ─────────────────────────────────────────────────────────────────────
export type ObraTipo = 'terraplen' | 'excavacion' | 'ripio' | 'canal' | 'limpieza'

export interface GuardarObraData {
  tipo:              ObraTipo
  cantidad:          number      // km o ha según tipo
  unidad:            string      // 'km' | 'ha' | 'm³'
  presupuesto_total: number
  aporte_dvp:        number
  aporte_ccc:        number
  precio_unitario:   number
  descripcion?:      string      // texto del tramo/descripción ya ingresado en la calculadora
  // Snapshot completo del calculator (inputs + outputs) para PDF y edición
  datos_calculadora?: Record<string, unknown>
}

interface Props {
  open:    boolean
  data:    GuardarObraData | null
  onClose: () => void
  onSaved: () => void
}

type Jurisdiccion = 'consorcio' | 'ruta_provincial' | 'metropolitana' | 'otra'
type Estado       = 'planificada' | 'en_curso'

interface ConsorcioOpt { numero: number; nombre: string; zona: string }

const TIPO_LABELS: Record<ObraTipo, string> = {
  terraplen:  'Terraplén',
  excavacion: 'Excavación',
  ripio:      'Ripio',
  canal:      'Canal',
  limpieza:   'Limpieza Vial',
}

const JURIS_LABELS: Record<Jurisdiccion, string> = {
  consorcio:       'Consorcio Caminero',
  ruta_provincial: 'Ruta Provincial',
  metropolitana:   'Área Metropolitana',
  otra:            'Otra ubicación',
}

const mono: React.CSSProperties = { fontFamily: 'monospace' }
const lbl:  React.CSSProperties = {
  display: 'block', fontSize: 10, color: '#555',
  textTransform: 'uppercase', letterSpacing: 0.8,
  fontFamily: 'monospace', marginBottom: 4, marginTop: 12,
}
const inp: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: '#0a0a0a', border: '1px solid #222',
  color: '#ddd', padding: '7px 10px',
  fontSize: 13, fontFamily: 'monospace',
  outline: 'none', borderRadius: 2,
}

// ── Componente ────────────────────────────────────────────────────────────────
export default function GuardarObraModal({ open, data, onClose, onSaved }: Props) {
  const [jurisdiccion, setJurisdiccion] = useState<Jurisdiccion>('consorcio')
  const [consorcioNum, setConsorcioNum] = useState<string>('')
  const [consorcioSearch, setConsorcioSearch] = useState('')
  const [ubicacion,    setUbicacion]    = useState('')
  const [descripcion,  setDescripcion]  = useState('')
  const [estado,       setEstado]       = useState<Estado>('planificada')
  const [fechaInicio,  setFechaInicio]  = useState('')
  const [fechaFin,     setFechaFin]     = useState('')

  const [consorcios, setConsorcios]     = useState<ConsorcioOpt[]>([])
  const [saving,     setSaving]         = useState(false)
  const [step,       setStep]           = useState<'form' | 'notif' | 'done'>('form')
  const [error,      setError]          = useState<string | null>(null)

  // Cargar consorcios al abrir
  useEffect(() => {
    if (!open) return
    const sb = createClient()
    sb.from('consorcios')
      .select('numero, nombre, zona')
      .order('numero')
      .then(({ data: rows }) => {
        if (rows) setConsorcios(rows as ConsorcioOpt[])
      })
    // Resetear formulario
    setJurisdiccion('consorcio')
    setConsorcioNum('')
    setConsorcioSearch('')
    setUbicacion('')
    setDescripcion(data?.descripcion ?? '')
    setEstado('planificada')
    setFechaInicio('')
    setFechaFin('')
    setStep('form')
    setError(null)
  }, [open, data?.descripcion])

  if (!open || !data) return null

  const consorciosFiltrados = consorcios.filter(c =>
    consorcioSearch.trim() === '' ||
    c.nombre.toLowerCase().includes(consorcioSearch.toLowerCase()) ||
    String(c.numero).includes(consorcioSearch)
  )

  // ── Guardar ───────────────────────────────────────────────────────────────
  async function handleGuardar() {
    setError(null)
    setSaving(true)
    try {
      const body = {
        tipo:              data!.tipo,
        jurisdiccion,
        consorcio_numero:  jurisdiccion === 'consorcio' && consorcioNum ? Number(consorcioNum) : null,
        ubicacion:         jurisdiccion !== 'consorcio' ? ubicacion : null,
        descripcion:       descripcion || null,
        estado,
        fecha_inicio:      fechaInicio || null,
        fecha_fin_estimada: fechaFin || null,
        cantidad:            data!.cantidad,
        unidad:              data!.unidad,
        presupuesto_total:   data!.presupuesto_total,
        aporte_dvp:          data!.aporte_dvp,
        aporte_ccc:          data!.aporte_ccc,
        precio_unitario:     data!.precio_unitario,
        datos_calculadora:   data!.datos_calculadora ?? null,
      }
      const res = await fetch('/api/obras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const j = await res.json()
        throw new Error(j.error ?? 'Error al guardar')
      }
      setStep('notif')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Notificar (placeholder — push en Fase 3) ──────────────────────────────
  async function handleNotificar() {
    // TODO Fase 3: llamar Expo Push API con tokens de técnicos
    alert('Notificación push — próximamente (Fase 3)')
    setStep('done')
    onSaved()
  }

  // ── Overlay ───────────────────────────────────────────────────────────────
  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 9999,
  }
  const modal: React.CSSProperties = {
    background: '#111', border: '1px solid #222',
    width: 480, maxHeight: '90vh', overflowY: 'auto',
    padding: 24, position: 'relative',
  }

  const color = {
    terraplen: '#8D6E63', excavacion: '#FF7043', ripio: '#90A4AE',
    canal: '#29B6F6', limpieza: '#66BB6A',
  }[data.tipo]

  // ── Vista: "¿Notificar técnicos?" ─────────────────────────────────────────
  if (step === 'notif') {
    return (
      <div style={overlay}>
        <div style={{ ...modal, width: 380, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#ddd', ...mono, marginBottom: 6 }}>
            Obra guardada correctamente
          </div>
          <div style={{ fontSize: 11, color: '#555', ...mono, marginBottom: 24 }}>
            {TIPO_LABELS[data.tipo]} · ${data.presupuesto_total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>
            ¿Deseas notificar a los técnicos de campo?
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button
              onClick={() => { setStep('done'); onSaved(); onClose(); }}
              style={{ ...mono, background: '#1a1a1a', border: '1px solid #2a2a2a',
                color: '#555', padding: '8px 20px', cursor: 'pointer', fontSize: 11 }}
            >
              No, cerrar
            </button>
            <button
              onClick={handleNotificar}
              style={{ ...mono, background: color, border: 'none',
                color: '#000', fontWeight: 700, padding: '8px 20px',
                cursor: 'pointer', fontSize: 11 }}
            >
              📲 Notificar técnicos
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Vista: formulario ─────────────────────────────────────────────────────
  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={modal}>

        {/* Header */}
        <div style={{ borderLeft: `3px solid ${color}`, paddingLeft: 10, marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: '#444', ...mono, textTransform: 'uppercase', letterSpacing: 1 }}>
            Guardar obra
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color, ...mono, marginTop: 2 }}>
            {TIPO_LABELS[data.tipo]}
          </div>
        </div>

        {/* Resumen calculado */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 20,
          background: '#0a0a0a', border: '1px solid #1a1a1a', padding: 12 }}>
          <div>
            <div style={{ fontSize: 9, color: '#444', ...mono, textTransform: 'uppercase', letterSpacing: 0.8 }}>Cantidad</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#bbb', ...mono }}>
              {data.cantidad.toLocaleString('es-AR', { maximumFractionDigits: 2 })} {data.unidad}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: '#444', ...mono, textTransform: 'uppercase', letterSpacing: 0.8 }}>Total</div>
            <div style={{ fontSize: 14, fontWeight: 700, color, ...mono }}>
              ${data.presupuesto_total.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: '#444', ...mono, textTransform: 'uppercase', letterSpacing: 0.8 }}>P. Unit.</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#888', ...mono }}>
              ${data.precio_unitario.toLocaleString('es-AR', { minimumFractionDigits: 0 })}/{data.unidad}
            </div>
          </div>
        </div>

        {/* Jurisdicción */}
        <label style={lbl}>Jurisdicción</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 4 }}>
          {(Object.entries(JURIS_LABELS) as [Jurisdiccion, string][]).map(([k, v]) => (
            <button key={k} onClick={() => setJurisdiccion(k)}
              style={{ ...mono, fontSize: 11, padding: '7px 10px', textAlign: 'left',
                background: jurisdiccion === k ? `${color}18` : '#0a0a0a',
                border: `1px solid ${jurisdiccion === k ? color : '#222'}`,
                color: jurisdiccion === k ? color : '#555',
                cursor: 'pointer' }}>
              {v}
            </button>
          ))}
        </div>

        {/* Consorcio */}
        {jurisdiccion === 'consorcio' && (
          <>
            <label style={lbl}>Consorcio</label>
            <input
              style={inp} placeholder="Buscar por nombre o número..."
              value={consorcioSearch}
              onChange={e => { setConsorcioSearch(e.target.value); setConsorcioNum('') }}
            />
            {consorcioSearch.length > 0 && consorcioNum === '' && (
              <div style={{ background: '#0a0a0a', border: '1px solid #222',
                borderTop: 'none', maxHeight: 160, overflowY: 'auto' }}>
                {consorciosFiltrados.slice(0, 20).map(c => (
                  <div key={c.numero}
                    onClick={() => { setConsorcioNum(String(c.numero)); setConsorcioSearch(`${c.numero} — ${c.nombre}`) }}
                    style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 11, ...mono,
                      color: '#bbb', borderBottom: '1px solid #141414' }}
                    onMouseOver={e => (e.currentTarget.style.background = '#141414')}
                    onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ color: '#555', marginRight: 8 }}>{c.numero}</span>
                    {c.nombre.replace(/Consorcio Caminero N[°º]?\s*/i, 'CC ')}
                    <span style={{ color: '#333', marginLeft: 6, fontSize: 9 }}>{c.zona}</span>
                  </div>
                ))}
                {consorciosFiltrados.length === 0 && (
                  <div style={{ padding: '8px 10px', fontSize: 11, color: '#333', ...mono }}>Sin resultados</div>
                )}
              </div>
            )}
          </>
        )}

        {/* Ubicación libre */}
        {jurisdiccion !== 'consorcio' && (
          <>
            <label style={lbl}>
              {jurisdiccion === 'ruta_provincial' ? 'Ruta / Tramo' :
               jurisdiccion === 'metropolitana'   ? 'Área / Sector' : 'Ubicación'}
            </label>
            <input style={inp}
              placeholder={
                jurisdiccion === 'ruta_provincial' ? 'Ej: RP 3 km 45-78' :
                jurisdiccion === 'metropolitana'   ? 'Ej: Área metropolitana Resistencia' :
                'Descripción del lugar'
              }
              value={ubicacion} onChange={e => setUbicacion(e.target.value)} />
          </>
        )}

        {/* Descripción */}
        <label style={lbl}>Descripción / Tramo</label>
        <input style={inp} placeholder="Descripción adicional..."
          value={descripcion} onChange={e => setDescripcion(e.target.value)} />

        {/* Estado + Fechas */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div>
            <label style={lbl}>Estado</label>
            <select style={{ ...inp, cursor: 'pointer' }}
              value={estado} onChange={e => setEstado(e.target.value as Estado)}>
              <option value="planificada">Planificada</option>
              <option value="en_curso">En curso</option>
            </select>
          </div>
          <div>
            <label style={lbl}>Fecha inicio</label>
            <input type="date" style={inp}
              value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Fecha fin est.</label>
            <input type="date" style={inp}
              value={fechaFin} onChange={e => setFechaFin(e.target.value)} />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ marginTop: 12, padding: '8px 10px', background: '#ff525211',
            border: '1px solid #ff5252', color: '#ff5252', fontSize: 11, ...mono }}>
            {error}
          </div>
        )}

        {/* Acciones */}
        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose}
            style={{ ...mono, background: 'none', border: '1px solid #222',
              color: '#555', padding: '8px 18px', cursor: 'pointer', fontSize: 11 }}>
            Cancelar
          </button>
          <button onClick={handleGuardar} disabled={saving}
            style={{ ...mono, background: color, border: 'none',
              color: '#000', fontWeight: 700, padding: '8px 22px',
              cursor: saving ? 'not-allowed' : 'pointer', fontSize: 11,
              opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Guardando...' : 'Guardar obra'}
          </button>
        </div>
      </div>
    </div>
  )
}
