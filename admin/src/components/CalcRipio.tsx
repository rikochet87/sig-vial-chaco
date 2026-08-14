'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import type { RipioTramo, LatLng } from './RipioMapPanel'

const RipioMapPanel = dynamic(() => import('./RipioMapPanel'), { ssr: false })

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Proyecto {
  id: string
  nombre: string
  ripios: RipioTramo[]
}

// ── Estilos ───────────────────────────────────────────────────────────────────
const MONO: React.CSSProperties = { fontFamily: 'monospace' }
const COLOR = '#90A4AE'

const inpS: React.CSSProperties = {
  width: '100%', background: '#080808', border: '1px solid #1e1e1e',
  color: '#e0e0e0', fontFamily: 'monospace', fontSize: 13,
  padding: '5px 8px', outline: 'none', boxSizing: 'border-box',
}
const lblS: React.CSSProperties = {
  fontSize: 9, color: '#444', textTransform: 'uppercase', letterSpacing: 1,
  fontFamily: 'monospace', marginBottom: 2, display: 'block', marginTop: 8,
}
const btnS = (active?: boolean, accent?: string): React.CSSProperties => ({
  padding: '4px 10px', fontSize: 10, ...MONO, cursor: 'pointer', border: 'none',
  background: active ? `${accent || COLOR}22` : '#111',
  color: active ? (accent || COLOR) : '#555',
  borderLeft: active ? `2px solid ${accent || COLOR}` : '2px solid transparent',
})

const fmt = (n: number) => Math.round(n).toLocaleString('es-AR')
const fmtPres = (n: number) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(2)} M`
    : `$${Math.round(n).toLocaleString('es-AR')}`

// ── Cálculos derivados ────────────────────────────────────────────────────────
function calcRipio(r: RipioTramo) {
  const V = r.l_m * r.an * r.e
  const W = V * r.rho
  const presupuesto = W * r.precio_unitario
  return { V, W, presupuesto, cam15: Math.ceil(W / 15), cam20: Math.ceil(W / 20) }
}

// ── Subcomponente: campo numérico ─────────────────────────────────────────────
function NInp({ label, value, onChange, step = 0.1, min = 0 }: {
  label: string; value: number; onChange: (v: number) => void; step?: number; min?: number
}) {
  return (
    <label style={{ display: 'block' }}>
      <span style={lblS}>{label}</span>
      <input type="number" step={step} min={min} value={value}
        onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(v) }}
        style={inpS} />
    </label>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function CalcRipio() {
  const [proyectos,   setProyectos]   = useState<Proyecto[]>([])
  const [activeProyId, setActiveProyId] = useState<string | null>(null)
  const [selectedId,  setSelectedId]  = useState<string | null>(null)
  const [drawingId,   setDrawingId]   = useState<string | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [view,        setView]        = useState<'mapa' | 'resumen'>('mapa')
  const [resumenSel,  setResumenSel]  = useState<Set<string>>(new Set())
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Carga inicial ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/proyectos-ripio')
      .then(r => r.json())
      .then((data: Proyecto[]) => {
        setProyectos(data)
        if (data.length > 0) {
          setActiveProyId(data[0].id)
          if (data[0].ripios.length > 0) setSelectedId(data[0].ripios[0].id)
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  // ── Datos derivados ────────────────────────────────────────────────────────
  const activeProy = proyectos.find(p => p.id === activeProyId) ?? null
  const ripios     = activeProy?.ripios ?? []
  const selected   = ripios.find(r => r.id === selectedId) ?? null

  // ── Helpers de mutación local ──────────────────────────────────────────────
  const updateRipioLocal = useCallback((id: string, patch: Partial<RipioTramo>) => {
    setProyectos(prev => prev.map(p => ({
      ...p,
      ripios: p.ripios.map(r => r.id === id ? { ...r, ...patch } : r),
    })))
  }, [])

  // ── Auto-save con debounce ────────────────────────────────────────────────
  const saveRipio = useCallback((id: string, patch: Partial<RipioTramo>) => {
    updateRipioLocal(id, patch)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      setSaving(true)
      fetch(`/api/ripios/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
        .catch(console.error)
        .finally(() => setSaving(false))
    }, 600)
  }, [updateRipioLocal])

  // ── Agregar proyecto ──────────────────────────────────────────────────────
  const addProyecto = useCallback(async () => {
    const n = proyectos.length + 1
    const nombre = `Proyecto ${String(n).padStart(2, '0')}`
    const res  = await fetch('/api/proyectos-ripio', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre }),
    })
    const data = await res.json()
    const nuevo: Proyecto = { ...data, ripios: [] }
    setProyectos(prev => [...prev, nuevo])
    setActiveProyId(nuevo.id)
    setSelectedId(null)
  }, [proyectos.length])

  // ── Eliminar proyecto ─────────────────────────────────────────────────────
  const deleteProyecto = useCallback(async (id: string) => {
    if (!confirm('¿Eliminar el proyecto y todos sus ripios?')) return
    await fetch(`/api/proyectos-ripio/${id}`, { method: 'DELETE' })
    setProyectos(prev => {
      const next = prev.filter(p => p.id !== id)
      if (activeProyId === id) {
        setActiveProyId(next[0]?.id ?? null)
        setSelectedId(next[0]?.ripios[0]?.id ?? null)
      }
      return next
    })
  }, [activeProyId])

  // ── Agregar ripio ─────────────────────────────────────────────────────────
  const addRipio = useCallback(async () => {
    if (!activeProyId) return
    const proy = proyectos.find(p => p.id === activeProyId)
    if (!proy) return
    const n = proy.ripios.length + 1
    const nombre = `Ripio ${String(n).padStart(2, '0')}`
    const res = await fetch(`/api/proyectos-ripio/${activeProyId}/ripios`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre }),
    })
    const data: RipioTramo = await res.json()
    setProyectos(prev => prev.map(p =>
      p.id === activeProyId ? { ...p, ripios: [...p.ripios, data] } : p
    ))
    setSelectedId(data.id)
  }, [activeProyId, proyectos])

  // ── Eliminar ripio ────────────────────────────────────────────────────────
  const deleteRipio = useCallback(async (id: string) => {
    if (!confirm('¿Eliminar este ripio?')) return
    await fetch(`/api/ripios/${id}`, { method: 'DELETE' })
    setProyectos(prev => prev.map(p => ({
      ...p,
      ripios: p.ripios.filter(r => r.id !== id),
    })))
    if (selectedId === id) setSelectedId(null)
  }, [selectedId])

  // ── Callback del mapa: línea dibujada ────────────────────────────────────
  const handleLineDraw = useCallback((id: string, lengthM: number, coords: LatLng[]) => {
    saveRipio(id, { l_m: Math.round(lengthM), coords })
  }, [saveRipio])

  // ── Render: panel izquierdo ───────────────────────────────────────────────
  const renderLeft = () => (
    <div style={{
      width: 230, flexShrink: 0, borderRight: '1px solid #1a1a1a',
      display: 'flex', flexDirection: 'column', background: '#0a0a0a', overflow: 'hidden',
    }}>
      {/* Header proyectos */}
      <div style={{ padding: '10px 10px 6px', borderBottom: '1px solid #111', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 9, color: '#555', ...MONO, textTransform: 'uppercase', letterSpacing: 1 }}>
            Proyectos
          </span>
          <button onClick={addProyecto} style={{
            fontSize: 9, ...MONO, cursor: 'pointer', background: 'transparent',
            border: '1px solid #222', color: '#666', padding: '2px 7px',
          }}>
            + Nuevo
          </button>
        </div>
      </div>

      {/* Lista proyectos + ripios */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && (
          <div style={{ padding: 12, fontSize: 10, color: '#333', ...MONO }}>Cargando…</div>
        )}
        {proyectos.map(proy => {
          const isActive = proy.id === activeProyId
          const total = proy.ripios.reduce((s, r) => s + calcRipio(r).presupuesto, 0)
          return (
            <div key={proy.id}>
              {/* Proyecto header */}
              <div
                onClick={() => { setActiveProyId(proy.id); if (proy.ripios.length > 0) setSelectedId(proy.ripios[0].id) }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '7px 10px', cursor: 'pointer',
                  background: isActive ? '#90A4AE11' : 'transparent',
                  borderLeft: `2px solid ${isActive ? COLOR : 'transparent'}`,
                }}
              >
                <div>
                  <div style={{ fontSize: 11, color: isActive ? COLOR : '#777', ...MONO, fontWeight: isActive ? 700 : 400 }}>
                    {isActive ? '▼ ' : '▶ '}{proy.nombre}
                  </div>
                  {total > 0 && (
                    <div style={{ fontSize: 9, color: '#444', ...MONO, marginTop: 1 }}>{fmtPres(total)}</div>
                  )}
                </div>
                <button
                  onClick={e => { e.stopPropagation(); deleteProyecto(proy.id) }}
                  style={{ fontSize: 8, color: '#333', background: 'transparent', border: 'none', cursor: 'pointer', padding: 2 }}
                >✕</button>
              </div>

              {/* Ripios del proyecto activo */}
              {isActive && (
                <div>
                  {proy.ripios.map(r => {
                    const { W, presupuesto } = calcRipio(r)
                    const isSelected = r.id === selectedId
                    return (
                      <div
                        key={r.id}
                        onClick={() => setSelectedId(r.id)}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '5px 10px 5px 22px', cursor: 'pointer',
                          background: isSelected ? '#90A4AE0d' : 'transparent',
                          borderLeft: `2px solid ${isSelected ? COLOR : 'transparent'}`,
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 10, color: isSelected ? '#ccc' : '#666', ...MONO }}>
                            {r.nombre}
                          </div>
                          <div style={{ fontSize: 8, color: '#333', ...MONO }}>
                            {r.l_m > 0 ? `${fmt(r.l_m)} m · ${fmt(W)} t` : 'Sin longitud'}
                            {presupuesto > 0 && ` · ${fmtPres(presupuesto)}`}
                          </div>
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); deleteRipio(r.id) }}
                          style={{ fontSize: 8, color: '#2a2a2a', background: 'transparent', border: 'none', cursor: 'pointer', padding: 2 }}
                        >✕</button>
                      </div>
                    )
                  })}
                  {/* Botón agregar ripio */}
                  <button onClick={addRipio} style={{
                    width: '100%', padding: '5px 10px 5px 22px', textAlign: 'left',
                    background: 'transparent', border: 'none', borderBottom: '1px solid #111',
                    fontSize: 9, color: '#444', ...MONO, cursor: 'pointer',
                  }}>
                    + Agregar ripio
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Vista resumen */}
      <div style={{ borderTop: '1px solid #111', flexShrink: 0 }}>
        <button onClick={() => setView(v => v === 'resumen' ? 'mapa' : 'resumen')} style={{
          width: '100%', padding: '8px 10px', textAlign: 'left',
          background: view === 'resumen' ? `${COLOR}11` : 'transparent', border: 'none',
          fontSize: 9, color: view === 'resumen' ? COLOR : '#555', ...MONO, cursor: 'pointer',
          borderLeft: `2px solid ${view === 'resumen' ? COLOR : 'transparent'}`,
          letterSpacing: 0.8, textTransform: 'uppercase',
        }}>
          {view === 'resumen' ? '▼' : '▶'} Resumen presupuesto
        </button>
      </div>
    </div>
  )

  // ── Render: formulario ripio seleccionado ─────────────────────────────────
  const renderForm = () => {
    if (!selected) return (
      <div style={{ padding: 20, fontSize: 10, color: '#333', ...MONO }}>
        {ripios.length === 0 ? 'Agregá un ripio para comenzar.' : 'Seleccioná un ripio.'}
      </div>
    )
    const { V, W, presupuesto, cam15, cam20 } = calcRipio(selected)

    return (
      <div style={{ padding: '10px 14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0 }}>
        {/* Nombre */}
        <label style={{ display: 'block' }}>
          <span style={lblS}>Nombre</span>
          <input value={selected.nombre} onChange={e => saveRipio(selected.id, { nombre: e.target.value })}
            style={inpS} />
        </label>

        {/* Dimensiones */}
        <div style={{ fontSize: 8, color: '#333', ...MONO, textTransform: 'uppercase', letterSpacing: 1, marginTop: 14, marginBottom: 2 }}>Dimensiones</div>
        <NInp label="Ancho (m)"    value={selected.an}  onChange={v => saveRipio(selected.id, { an: v })}  step={0.5} />
        <NInp label="Espesor (m)"  value={selected.e}   onChange={v => saveRipio(selected.id, { e: v })}   step={0.01} />
        <NInp label="Densidad (t/m³)" value={selected.rho} onChange={v => saveRipio(selected.id, { rho: v })} step={0.05} min={1} />

        {/* Longitud */}
        <div style={{ marginTop: 10, padding: '8px 0', borderTop: '1px solid #111', borderBottom: '1px solid #111' }}>
          <div style={{ fontSize: 8, color: '#444', ...MONO, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
            Longitud medida
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: selected.l_m > 0 ? COLOR : '#2a2a2a', ...MONO }}>
              {fmt(selected.l_m)}
            </span>
            <span style={{ fontSize: 10, color: '#444', ...MONO }}>m</span>
            {selected.l_m >= 1000 && (
              <span style={{ fontSize: 9, color: '#555', ...MONO }}>
                ({(selected.l_m / 1000).toFixed(3)} km)
              </span>
            )}
          </div>
          <button
            onClick={() => setDrawingId(drawingId === selected.id ? null : selected.id)}
            style={{
              marginTop: 6, padding: '5px 12px', fontSize: 10, ...MONO, cursor: 'pointer',
              border: `1px solid ${drawingId === selected.id ? COLOR : '#252525'}`,
              background: drawingId === selected.id ? `${COLOR}22` : '#0c0c0c',
              color: drawingId === selected.id ? COLOR : '#666',
              width: '100%',
            }}
          >
            {drawingId === selected.id ? '✕ Cancelar dibujo' : '↔ Trazar en mapa'}
          </button>
        </div>

        {/* Resultados */}
        {selected.l_m > 0 && (
          <>
            <div style={{ fontSize: 8, color: '#333', ...MONO, textTransform: 'uppercase', letterSpacing: 1, marginTop: 12, marginBottom: 4 }}>Resultados</div>
            <Row label="Volumen"    value={`${fmt(V)} m³`} />
            <Row label="Toneladas"  value={`${fmt(W)} t`}  accent />
            <Row label="Cam. 15 t"  value={`~${cam15.toLocaleString('es-AR')}`} />
            <Row label="Cam. 20 t"  value={`~${cam20.toLocaleString('es-AR')}`} />
          </>
        )}

        {/* Ejecución */}
        <div style={{ fontSize: 8, color: '#333', ...MONO, textTransform: 'uppercase', letterSpacing: 1, marginTop: 14, marginBottom: 2 }}>Ejecución</div>
        <label style={{ display: 'block' }}>
          <span style={lblS}>Empresa</span>
          <input value={selected.empresa} onChange={e => saveRipio(selected.id, { empresa: e.target.value })}
            style={inpS} placeholder="Nombre de la empresa" />
        </label>
        <label style={{ display: 'block' }}>
          <span style={lblS}>Fecha de ejecución</span>
          <input type="date" value={selected.fecha_ejecucion ?? ''} onChange={e => saveRipio(selected.id, { fecha_ejecucion: e.target.value || null })}
            style={inpS} />
        </label>

        {/* Precio */}
        <div style={{ fontSize: 8, color: '#333', ...MONO, textTransform: 'uppercase', letterSpacing: 1, marginTop: 14, marginBottom: 2 }}>Presupuesto</div>
        <NInp label="Precio unitario ($/t)" value={selected.precio_unitario} onChange={v => saveRipio(selected.id, { precio_unitario: v })} step={100} />
        {presupuesto > 0 && (
          <div style={{ marginTop: 8, padding: '8px', background: `${COLOR}0a`, border: `1px solid ${COLOR}22` }}>
            <div style={{ fontSize: 8, color: '#555', ...MONO, textTransform: 'uppercase', letterSpacing: 1 }}>Presupuesto</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: COLOR, ...MONO, marginTop: 2 }}>
              {fmtPres(presupuesto)}
            </div>
            <div style={{ fontSize: 9, color: '#444', ...MONO }}>
              {fmt(W)} t × ${fmt(selected.precio_unitario)}/t
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Render: vista resumen ─────────────────────────────────────────────────
  const renderResumen = () => {
    const toggleProy = (id: string) => {
      setResumenSel(prev => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id); else next.add(id)
        return next
      })
    }
    const selAll = () => setResumenSel(new Set(proyectos.map(p => p.id)))
    const clearSel = () => setResumenSel(new Set())

    const selectedProys = proyectos.filter(p => resumenSel.has(p.id))
    const totalSel = selectedProys.reduce((s, p) => s + p.ripios.reduce((ss, r) => ss + calcRipio(r).presupuesto, 0), 0)
    const totalTon = selectedProys.reduce((s, p) => s + p.ripios.reduce((ss, r) => ss + calcRipio(r).W, 0), 0)

    return (
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {/* Selector multi-proyecto */}
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #111', flexShrink: 0 }}>
          <div style={{ fontSize: 8, color: '#555', ...MONO, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            Seleccionar proyectos para sumar
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <button onClick={selAll} style={{ ...btnS(), fontSize: 9, padding: '3px 8px', border: '1px solid #222' }}>Todos</button>
            <button onClick={clearSel} style={{ ...btnS(), fontSize: 9, padding: '3px 8px', border: '1px solid #222' }}>Ninguno</button>
          </div>
          {proyectos.map(p => {
            const total = p.ripios.reduce((s, r) => s + calcRipio(r).presupuesto, 0)
            const checked = resumenSel.has(p.id)
            return (
              <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={checked} onChange={() => toggleProy(p.id)}
                  style={{ accentColor: COLOR, width: 12, height: 12 }} />
                <div>
                  <div style={{ fontSize: 10, color: checked ? '#ccc' : '#555', ...MONO }}>{p.nombre}</div>
                  <div style={{ fontSize: 8, color: '#444', ...MONO }}>{fmtPres(total)} · {p.ripios.length} tramos</div>
                </div>
              </label>
            )
          })}
        </div>

        {/* Total seleccionado */}
        {resumenSel.size > 0 && (
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #111', background: `${COLOR}08`, flexShrink: 0 }}>
            <div style={{ fontSize: 8, color: '#555', ...MONO, textTransform: 'uppercase', letterSpacing: 1 }}>Total seleccionado</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: COLOR, ...MONO, marginTop: 4 }}>{fmtPres(totalSel)}</div>
            <div style={{ fontSize: 9, color: '#555', ...MONO }}>{fmt(totalTon)} t totales</div>
          </div>
        )}

        {/* Tabla por proyecto */}
        {proyectos.map(proy => {
          const pTotal = proy.ripios.reduce((s, r) => s + calcRipio(r).presupuesto, 0)
          return (
            <div key={proy.id} style={{ borderBottom: '1px solid #0e0e0e' }}>
              <div style={{
                padding: '8px 14px 4px', fontSize: 10, color: COLOR, ...MONO, fontWeight: 700,
                display: 'flex', justifyContent: 'space-between',
              }}>
                <span>{proy.nombre}</span>
                <span>{fmtPres(pTotal)}</span>
              </div>
              {proy.ripios.length === 0 && (
                <div style={{ padding: '4px 14px 8px', fontSize: 9, color: '#333', ...MONO }}>Sin ripios</div>
              )}
              {proy.ripios.map(r => {
                const { W, presupuesto } = calcRipio(r)
                return (
                  <div key={r.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '4px 14px 4px 24px',
                  }}>
                    <div>
                      <div style={{ fontSize: 9, color: '#888', ...MONO }}>{r.nombre}</div>
                      <div style={{ fontSize: 8, color: '#444', ...MONO }}>
                        {fmt(r.l_m)} m · {fmt(W)} t
                        {r.empresa && ` · ${r.empresa}`}
                      </div>
                    </div>
                    <div style={{ fontSize: 10, color: '#666', ...MONO, textAlign: 'right' }}>
                      {presupuesto > 0 ? fmtPres(presupuesto) : '—'}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    )
  }

  // ── Render principal ──────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>

      {/* Panel izquierdo: árbol proyectos/ripios */}
      {renderLeft()}

      {/* Área principal */}
      {view === 'mapa' ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {/* Indicador guardado */}
          {saving && (
            <div style={{ height: 2, background: COLOR, flexShrink: 0, opacity: 0.6 }} />
          )}

          {/* Mapa (60%) */}
          <div style={{ flex: 3, minHeight: 0 }}>
            {activeProy ? (
              <RipioMapPanel
                ripios={ripios}
                selectedId={selectedId}
                drawingId={drawingId}
                color={COLOR}
                onLineDraw={handleLineDraw}
                onDrawEnd={() => setDrawingId(null)}
              />
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2a2a2a', ...MONO, fontSize: 11 }}>
                Creá un proyecto para comenzar
              </div>
            )}
          </div>

          {/* Formulario ripio (40%) */}
          <div style={{ flex: 2, minHeight: 0, borderTop: '1px solid #111', overflowY: 'auto', background: '#080808' }}>
            {renderForm()}
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: '#080808' }}>
          <div style={{ padding: '10px 14px 6px', borderBottom: '1px solid #111', flexShrink: 0 }}>
            <span style={{ fontSize: 9, color: '#555', ...MONO, textTransform: 'uppercase', letterSpacing: 1 }}>
              Resumen de presupuestos
            </span>
          </div>
          {renderResumen()}
        </div>
      )}
    </div>
  )
}

// ── Row de resultado ──────────────────────────────────────────────────────────
function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #0a0a0a' }}>
      <span style={{ fontSize: 9, color: '#444', fontFamily: 'monospace' }}>{label}</span>
      <span style={{ fontSize: accent ? 12 : 10, color: accent ? '#90A4AE' : '#888', fontFamily: 'monospace', fontWeight: accent ? 700 : 400 }}>
        {value}
      </span>
    </div>
  )
}
