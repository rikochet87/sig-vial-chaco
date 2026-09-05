'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import type { RipioTramo, LatLng } from './RipioMapPanel'
import { PALETTE } from '@/lib/ripioPalette'
import type { GuardarObraData } from './GuardarObraModal'

const RipioMapPanel       = dynamic(() => import('./RipioMapPanel'),       { ssr: false })
const MapComposicionRipio = dynamic(() => import('./MapComposicionRipio'), { ssr: false })

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Proyecto {
  id: string
  nombre: string
  ripios: RipioTramo[]
}

// ── Constantes ────────────────────────────────────────────────────────────────
const MONO: React.CSSProperties = { fontFamily: 'monospace' }
const COLOR = '#90A4AE'

const inpS: React.CSSProperties = {
  width: '100%', background: '#080808', border: '1px solid #1e1e1e',
  color: '#e0e0e0', fontFamily: 'monospace', fontSize: 13,
  padding: '4px 8px', outline: 'none', boxSizing: 'border-box',
}
const lblS: React.CSSProperties = {
  fontSize: 11, color: '#444', textTransform: 'uppercase', letterSpacing: 1,
  fontFamily: 'monospace', marginBottom: 2, display: 'block', marginTop: 8,
}

const fmt  = (n: number) => Math.round(n).toLocaleString('es-AR')
const fmtP = (n: number) =>
  n >= 1_000_000 ? `$${(n/1_000_000).toFixed(2)}M` : `$${Math.round(n).toLocaleString('es-AR')}`

function calcRipio(r: RipioTramo) {
  const V = r.l_m * r.an * r.e
  const W = V * r.rho
  return { V, W, presupuesto: W * r.precio_unitario, cam15: Math.ceil(W/15), cam30: Math.ceil(W/30) }
}

// ── Campo numérico ─────────────────────────────────────────────────────────────
function NInp({ label, value, onChange, step = 0.1, min = 0, unit }: {
  label: string; value: number; onChange: (v: number) => void
  step?: number; min?: number; unit?: string
}) {
  return (
    <label style={{ display: 'block' }}>
      <span style={lblS}>{label}{unit ? ` (${unit})` : ''}</span>
      <input type="number" step={step} min={min} value={value}
        onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(v) }}
        style={inpS} />
    </label>
  )
}

// ── Fila de resultado ─────────────────────────────────────────────────────────
function Res({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #0d0d0d' }}>
      <span style={{ fontSize: 13, color: '#666', ...MONO }}>{label}</span>
      <span style={{ fontSize: accent ? 13 : 11, color: accent ? COLOR : '#999', ...MONO, fontWeight: accent ? 700 : 400 }}>{value}</span>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function CalcRipio({ onGuardarObra }: { onGuardarObra?: (d: GuardarObraData) => void }) {
  const [proyectos,    setProyectos]    = useState<Proyecto[]>([])
  const [activeProyId, setActiveProyId] = useState<string | null>(null)
  const [selectedId,   setSelectedId]   = useState<string | null>(null)
  const [drawingId,    setDrawingId]    = useState<string | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [panel,        setPanel]        = useState<'form' | 'resumen'>('form')
  const [resumenSel,   setResumenSel]   = useState<Set<string>>(new Set())
  const [editingName,  setEditingName]  = useState<string | null>(null)   // id del ripio cuyo nombre se edita inline
  const [confirmState, setConfirmState] = useState<{ msg: string; action: () => void } | null>(null)
  const [hiddenProyIds, setHiddenProyIds] = useState<Set<string>>(new Set())  // proyectos ocultos en el mapa
  const [view,          setView]          = useState<'computo' | 'mapa'>('computo')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Limpia el timer al desmontar para evitar setState en componente desmontado
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  // ── Carga ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const ac = new AbortController()
    fetch('/api/proyectos-ripio', { signal: ac.signal })
      .then(r => r.json())
      .then((data: Proyecto[]) => {
        setProyectos(data)
        if (data.length > 0) {
          setActiveProyId(data[0].id)
          if (data[0].ripios.length > 0) setSelectedId(data[0].ripios[0].id)
        }
      })
      .catch(e => { if (e.name !== 'AbortError') console.error(e) })
      .finally(() => setLoading(false))
    return () => ac.abort()
  }, [])

  const activeProy = proyectos.find(p => p.id === activeProyId) ?? null
  const ripios     = activeProy?.ripios ?? []
  const selected   = ripios.find(r => r.id === selectedId) ?? null
  // Ripios visibles de TODOS los proyectos (para el mapa)
  const mapRipios  = proyectos.filter(p => !hiddenProyIds.has(p.id)).flatMap(p => p.ripios)

  const toggleProyVisibility = (id: string) =>
    setHiddenProyIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  // ── Mutación local ────────────────────────────────────────────────────────
  const updateLocal = useCallback((id: string, patch: Partial<RipioTramo>) => {
    setProyectos(prev => prev.map(p => ({
      ...p, ripios: p.ripios.map(r => r.id === id ? { ...r, ...patch } : r),
    })))
  }, [])

  const saveRipio = useCallback((id: string, patch: Partial<RipioTramo>) => {
    updateLocal(id, patch)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      setSaving(true)
      fetch(`/api/ripios/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }).catch(console.error).finally(() => setSaving(false))
    }, 600)
  }, [updateLocal])

  // ── CRUD proyectos ────────────────────────────────────────────────────────
  const addProyecto = useCallback(async () => {
    const nombre = `Proyecto ${String(proyectos.length + 1).padStart(2, '0')}`
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

  const deleteProyecto = useCallback((id: string) => {
    setConfirmState({
      msg: '¿Eliminar el proyecto y todos sus ripios?',
      action: async () => {
        const res = await fetch(`/api/proyectos-ripio/${id}`, { method: 'DELETE' })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          alert('Error al eliminar el proyecto: ' + (body.error ?? res.status))
          return
        }
        setProyectos(prev => {
          const next = prev.filter(p => p.id !== id)
          if (activeProyId === id) { setActiveProyId(next[0]?.id ?? null); setSelectedId(null) }
          return next
        })
      },
    })
  }, [activeProyId])

  // ── CRUD ripios ───────────────────────────────────────────────────────────
  const addRipio = useCallback(async () => {
    if (!activeProyId) return
    const proy = proyectos.find(p => p.id === activeProyId)
    if (!proy) return
    const nombre = `Ripio ${String(proy.ripios.length + 1).padStart(2, '0')}`
    const res = await fetch(`/api/proyectos-ripio/${activeProyId}/ripios`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre }),
    })
    const data: RipioTramo = await res.json()
    setProyectos(prev => prev.map(p =>
      p.id === activeProyId ? { ...p, ripios: [...p.ripios, data] } : p
    ))
    setSelectedId(data.id)
    setPanel('form')
  }, [activeProyId, proyectos])

  const deleteRipio = useCallback((id: string) => {
    setConfirmState({
      msg: '¿Eliminar este ripio?',
      action: async () => {
        const res = await fetch(`/api/ripios/${id}`, { method: 'DELETE' })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          alert('Error al eliminar el ripio: ' + (body.error ?? res.status))
          return
        }
        setProyectos(prev => prev.map(p => ({ ...p, ripios: p.ripios.filter(r => r.id !== id) })))
        if (selectedId === id) setSelectedId(ripios.find(r => r.id !== id)?.id ?? null)
      },
    })
  }, [selectedId, ripios])

  const handleLineDraw = useCallback((id: string, lengthM: number, coords: LatLng[]) => {
    saveRipio(id, { l_m: Math.round(lengthM), coords })
  }, [saveRipio])

  // ── Panel izquierdo: árbol ────────────────────────────────────────────────
  const renderTree = () => (
    <div style={{
      width: 190, flexShrink: 0, borderRight: '1px solid #131313',
      display: 'flex', flexDirection: 'column', background: '#080808', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '8px 10px', borderBottom: '1px solid #111',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, color: '#666', ...MONO, textTransform: 'uppercase', letterSpacing: 1.2 }}>Proyectos</span>
        <button onClick={addProyecto} style={{
          fontSize: 12, ...MONO, cursor: 'pointer',
          background: 'transparent', border: '1px solid #333', color: '#aaa', padding: '2px 8px',
        }}>+ Nuevo</button>
      </div>

      {/* Lista */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && <div style={{ padding: 12, fontSize: 13, color: '#555', ...MONO }}>Cargando…</div>}

        {proyectos.map(proy => {
          const isActive = proy.id === activeProyId
          const isHidden = hiddenProyIds.has(proy.id)
          const total    = proy.ripios.reduce((s, r) => s + calcRipio(r).presupuesto, 0)

          return (
            <div key={proy.id}>
              {/* Proyecto */}
              <div
                onClick={() => {
                  setActiveProyId(proy.id)
                  if (proy.ripios.length > 0) setSelectedId(proy.ripios[0].id)
                }}
                style={{
                  padding: '6px 10px', cursor: 'pointer',
                  background: isActive ? `${COLOR}0a` : 'transparent',
                  borderLeft: `2px solid ${isActive ? COLOR : 'transparent'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  opacity: isHidden ? 0.45 : 1,
                  gap: 4,
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, color: isActive ? COLOR : '#999', ...MONO, fontWeight: isActive ? 700 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {isActive ? '▼ ' : '▶ '}{proy.nombre}
                  </div>
                  {total > 0 && <div style={{ fontSize: 12, color: '#666', ...MONO }}>{fmtP(total)}</div>}
                </div>
                {/* Toggle visibilidad en mapa */}
                <button onClick={e => { e.stopPropagation(); toggleProyVisibility(proy.id) }}
                  title={isHidden ? 'Mostrar en mapa' : 'Ocultar del mapa'}
                  style={{ fontSize: 13, color: isHidden ? '#333' : COLOR, background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0, lineHeight: 1, padding: '0 2px' }}>
                  {isHidden ? '○' : '●'}
                </button>
                <button onClick={e => { e.stopPropagation(); deleteProyecto(proy.id) }}
                  title="Eliminar proyecto"
                  style={{ fontSize: 13, color: '#666', background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0, lineHeight: 1 }}>✕</button>
              </div>

              {/* Ripios */}
              {isActive && (
                <div>
                  {proy.ripios.map(r => {
                    const isSel     = r.id === selectedId
                    const isDrawing = r.id === drawingId
                    const hasCords  = r.l_m > 0
                    const ripioClr  = r.color ?? PALETTE[r.orden % PALETTE.length]
                    return (
                      <div key={r.id}
                        onClick={() => { setSelectedId(r.id); setPanel('form') }}
                        style={{
                          padding: '5px 8px 5px 14px', cursor: 'pointer',
                          background: isSel ? `${ripioClr}10` : 'transparent',
                          borderLeft: `2px solid ${isSel ? ripioClr : 'transparent'}`,
                          display: 'flex', alignItems: 'center', gap: 5,
                        }}
                      >
                        {/* Dot de color de paleta */}
                        <div style={{
                          width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                          background: hasCords ? ripioClr : 'transparent',
                          border: `1px solid ${ripioClr}`,
                        }} title={hasCords ? 'Línea trazada' : 'Sin línea'} />

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, color: isSel ? '#e0e0e0' : '#888', ...MONO, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {r.nombre}
                          </div>
                          <div style={{ fontSize: 12, color: hasCords ? ripioClr + 'cc' : '#444', ...MONO }}>
                            {hasCords ? `${fmt(r.l_m)} m` : '—'}
                          </div>
                        </div>

                        {/* Botón dibujar */}
                        <button
                          onClick={e => {
                            e.stopPropagation()
                            setSelectedId(r.id)
                            setPanel('form')
                            setDrawingId(prev => prev === r.id ? null : r.id)
                          }}
                          title={isDrawing ? 'Cancelar dibujo' : 'Trazar línea en mapa'}
                          style={{
                            fontSize: 12, padding: '1px 5px', cursor: 'pointer', flexShrink: 0,
                            background: isDrawing ? `${ripioClr}33` : 'transparent',
                            border: `1px solid ${isDrawing ? ripioClr : '#333'}`,
                            color: isDrawing ? ripioClr : '#888', ...MONO,
                          }}
                        >{isDrawing ? '✕' : '↔'}</button>

                        {/* Botón eliminar */}
                        <button onClick={e => { e.stopPropagation(); deleteRipio(r.id) }}
                          title="Eliminar ripio"
                          style={{ fontSize: 12, color: '#666', background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0, lineHeight: 1 }}>✕</button>
                      </div>
                    )
                  })}

                  {/* Agregar ripio */}
                  <button onClick={addRipio} style={{
                    width: '100%', padding: '5px 10px 5px 20px', textAlign: 'left',
                    background: 'transparent', border: 'none', borderTop: '1px solid #181818',
                    fontSize: 12, color: '#777', ...MONO, cursor: 'pointer', letterSpacing: 0.3,
                  }}>+ Agregar ripio</button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Botón Guardar obra — primero, más visible */}
      {onGuardarObra && activeProy && activeProy.ripios.length > 0 && (() => {
        const totalPres = activeProy.ripios.reduce((s, r) => s + calcRipio(r).presupuesto, 0)
        const totalTon  = activeProy.ripios.reduce((s, r) => s + calcRipio(r).W, 0)
        const totalLm   = activeProy.ripios.reduce((s, r) => s + r.l_m, 0)
        if (totalTon <= 0) return null
        const precioPromedio = totalTon > 0 ? totalPres / totalTon : 0
        const allCoords = activeProy.ripios.flatMap(r => (r.coords ?? []).map(([lat, lng]) => ({ lat, lng })))
        return (
          <button
            onClick={() => onGuardarObra?.({
              tipo: 'ripio',
              cantidad: totalTon,
              unidad: 't',
              presupuesto_total: totalPres,
              aporte_dvp: 0,
              aporte_ccc: 0,
              precio_unitario: precioPromedio,
              descripcion: activeProy.nombre,
              coordsLinea: allCoords,
              datos_calculadora: {
                calculadora: 'ripio',
                proyecto: activeProy.nombre,
                inputs: {
                  proyectos: proyectos.map(p => ({
                    id: p.id, nombre: p.nombre,
                    ripios: p.ripios.map(r => ({
                      ...r,
                      ...calcRipio(r),
                    })),
                  })),
                  activeProyId,
                },
                computo: {
                  totalLm,
                  totalTon,
                  totalPres,
                  ripios: activeProy.ripios.map(r => ({ ...r, ...calcRipio(r) })),
                },
              },
            })}
            style={{
              padding: '10px 12px', width: '100%', textAlign: 'left', cursor: 'pointer',
              background: '#F5C30014', border: 'none', borderTop: '1px solid #222',
              borderLeft: '3px solid #F5C300',
              fontSize: 13, color: '#F5C300', ...MONO, fontWeight: 700,
            }}
          >
            💾 Guardar obra
          </button>
        )
      })()}

      {/* Botón resumen — debajo de guardar */}
      <button
        onClick={() => setPanel(p => p === 'resumen' ? 'form' : 'resumen')}
        style={{
          padding: '10px 12px', width: '100%', textAlign: 'left', cursor: 'pointer',
          background: panel === 'resumen' ? `${COLOR}0d` : 'transparent',
          border: 'none', borderTop: '1px solid #111',
          borderLeft: `3px solid ${panel === 'resumen' ? COLOR : 'transparent'}`,
          fontSize: 13, color: panel === 'resumen' ? COLOR : '#666', ...MONO,
          textTransform: 'uppercase', letterSpacing: 1,
        }}
      >Σ Resumen presupuesto</button>
    </div>
  )

  // ── Panel derecho: formulario ─────────────────────────────────────────────
  const renderForm = () => {
    if (!selected) return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#222', ...MONO, fontSize: 12, flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 20, color: '#1a1a1a' }}>↔</span>
        {ripios.length === 0 ? 'Agregá un ripio para comenzar' : 'Seleccioná un ripio'}
      </div>
    )
    const { V, W, presupuesto, cam15, cam30 } = calcRipio(selected)

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        {/* Botón de dibujo — siempre arriba y visible */}
        <div style={{ padding: '10px 12px', borderBottom: '1px solid #0e0e0e', flexShrink: 0 }}>
          <button
            onClick={() => setDrawingId(prev => prev === selected.id ? null : selected.id)}
            style={{
              width: '100%', padding: '9px 0', fontSize: 13, ...MONO,
              fontWeight: 700, letterSpacing: 0.8, cursor: 'pointer',
              border: `1px solid ${drawingId === selected.id ? COLOR : COLOR + '55'}`,
              background: drawingId === selected.id ? `${COLOR}22` : `${COLOR}0a`,
              color: COLOR,
            }}
          >
            {drawingId === selected.id ? '✕ Cancelar dibujo' : `↔ Trazar ${selected.nombre} en mapa`}
          </button>
          {selected.l_m > 0 && (
            <div style={{ marginTop: 6, textAlign: 'center', fontSize: 12, color: '#555', ...MONO }}>
              Longitud actual: <span style={{ color: COLOR }}>{fmt(selected.l_m)} m</span>
              {selected.l_m >= 1000 && ` · ${(selected.l_m/1000).toFixed(3)} km`}
            </div>
          )}
        </div>

        {/* Formulario scrolleable */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px' }}>
          {/* Nombre + Color */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
            <label style={{ display: 'block', flex: 1 }}>
              <span style={lblS}>Nombre</span>
              <input value={selected.nombre} onChange={e => saveRipio(selected.id, { nombre: e.target.value })} style={inpS} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ ...lblS, marginBottom: 3 }}>Color</span>
              <input
                type="color"
                value={selected.color ?? PALETTE[selected.orden % PALETTE.length]}
                onChange={e => saveRipio(selected.id, { color: e.target.value })}
                style={{ width: 32, height: 28, padding: 2, background: '#0a0a0a', border: '1px solid #1e1e1e', cursor: 'pointer' }}
              />
            </label>
          </div>

          {/* Dimensiones */}
          <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid #0e0e0e' }}>
            <span style={{ fontSize: 11, color: '#333', ...MONO, textTransform: 'uppercase', letterSpacing: 1 }}>Dimensiones</span>
          </div>
          <NInp label="Ancho"    unit="m"    value={selected.an}  onChange={v => saveRipio(selected.id, { an: v })}  step={0.5} />
          <NInp label="Espesor"  unit="m"    value={selected.e}   onChange={v => saveRipio(selected.id, { e: v })}   step={0.01} />
          <NInp label="Densidad" unit="t/m³" value={selected.rho} onChange={v => saveRipio(selected.id, { rho: v })} step={0.05} min={1} />

          {/* Resultados */}
          {selected.l_m > 0 && (
            <div style={{ marginTop: 10, padding: '8px', background: '#0a0a0a', border: '1px solid #111' }}>
              <Res label="Volumen"    value={`${fmt(V)} m³`} />
              <Res label="Toneladas"  value={`${fmt(W)} t`}  accent />
              <Res label="Cam. 15 t"  value={`~${cam15.toLocaleString('es-AR')}`} />
              <Res label="Cam. 30 t"  value={`~${cam30.toLocaleString('es-AR')}`} />
            </div>
          )}

          {/* Ejecución */}
          <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid #0e0e0e' }}>
            <span style={{ fontSize: 12, color: '#555', ...MONO, textTransform: 'uppercase', letterSpacing: 1 }}>Ejecución</span>
          </div>
          <label style={{ display: 'block' }}>
            <span style={lblS}>Empresa</span>
            <input value={selected.empresa} onChange={e => saveRipio(selected.id, { empresa: e.target.value })} style={inpS} placeholder="Nombre de empresa" />
          </label>
          <label style={{ display: 'block' }}>
            <span style={lblS}>Fecha de ejecución</span>
            <input type="date" value={selected.fecha_ejecucion ?? ''} onChange={e => saveRipio(selected.id, { fecha_ejecucion: e.target.value || null })} style={inpS} />
          </label>

          {/* Precio */}
          <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid #0e0e0e' }}>
            <span style={{ fontSize: 12, color: '#555', ...MONO, textTransform: 'uppercase', letterSpacing: 1 }}>Presupuesto</span>
          </div>
          <NInp label="Precio unitario" unit="$/t" value={selected.precio_unitario} onChange={v => saveRipio(selected.id, { precio_unitario: v })} step={100} />
          {presupuesto > 0 && (
            <div style={{ marginTop: 8, padding: '8px', background: `${COLOR}08`, border: `1px solid ${COLOR}22`, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#444', ...MONO, textTransform: 'uppercase', letterSpacing: 1 }}>Total</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: COLOR, ...MONO }}>{fmtP(presupuesto)}</div>
              <div style={{ fontSize: 11, color: '#333', ...MONO }}>{fmt(W)} t × ${fmt(selected.precio_unitario)}/t</div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Panel derecho: resumen ────────────────────────────────────────────────
  const renderResumen = () => {
    const toggleP = (id: string) => setResumenSel(prev => {
      const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
    })
    const selProys = proyectos.filter(p => resumenSel.has(p.id))
    const totalSel = selProys.reduce((s, p) => s + p.ripios.reduce((ss, r) => ss + calcRipio(r).presupuesto, 0), 0)
    const totalTon = selProys.reduce((s, p) => s + p.ripios.reduce((ss, r) => ss + calcRipio(r).W, 0), 0)

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid #0e0e0e', flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: '#555', ...MONO, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Seleccionar proyectos</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setResumenSel(new Set(proyectos.map(p => p.id)))}
              style={{ fontSize: 11, ...MONO, cursor: 'pointer', background: 'transparent', border: '1px solid #1e1e1e', color: '#555', padding: '2px 8px' }}>Todos</button>
            <button onClick={() => setResumenSel(new Set())}
              style={{ fontSize: 11, ...MONO, cursor: 'pointer', background: 'transparent', border: '1px solid #1e1e1e', color: '#555', padding: '2px 8px' }}>Ninguno</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* Total multi-proyecto */}
          {resumenSel.size > 0 && (
            <div style={{ padding: '10px 12px', background: `${COLOR}08`, borderBottom: '1px solid #0e0e0e' }}>
              <div style={{ fontSize: 11, color: '#555', ...MONO, textTransform: 'uppercase', letterSpacing: 1 }}>Total seleccionado</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: COLOR, ...MONO }}>{fmtP(totalSel)}</div>
              <div style={{ fontSize: 11, color: '#555', ...MONO }}>{fmt(totalTon)} t</div>
            </div>
          )}

          {/* Por proyecto */}
          {proyectos.map(proy => {
            const checked = resumenSel.has(proy.id)
            const pTotal  = proy.ripios.reduce((s, r) => s + calcRipio(r).presupuesto, 0)
            return (
              <div key={proy.id} style={{ borderBottom: '1px solid #0d0d0d' }}>
                {/* Proyecto checkbox */}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleP(proy.id)}
                    style={{ accentColor: COLOR, width: 11, height: 11, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: checked ? '#ccc' : '#777', ...MONO, fontWeight: 600 }}>{proy.nombre}</div>
                    <div style={{ fontSize: 12, color: '#555', ...MONO }}>{fmtP(pTotal)}</div>
                  </div>
                </label>

                {/* Ripios del proyecto */}
                {proy.ripios.map(r => {
                  const { W, presupuesto } = calcRipio(r)
                  return (
                    <div key={r.id} style={{ padding: '3px 12px 3px 28px', display: 'flex', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: 12, color: '#777', ...MONO }}>{r.nombre}</div>
                        <div style={{ fontSize: 12, color: '#555', ...MONO }}>
                          {fmt(r.l_m)} m · {fmt(W)} t{r.empresa ? ` · ${r.empresa}` : ''}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: '#666', ...MONO }}>{presupuesto > 0 ? fmtP(presupuesto) : '—'}</div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Modal de confirmación custom ─────────────────────────────────────────
  const renderConfirm = () => confirmState && (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.78)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={() => setConfirmState(null)}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#0d0d0d', border: '1px solid #2a2a2a',
          padding: '22px 26px', minWidth: 270, maxWidth: 360,
          boxShadow: '0 6px 32px rgba(0,0,0,0.8)',
        }}
      >
        <div style={{ fontSize: 13, color: '#bbb', ...MONO, marginBottom: 20, lineHeight: 1.6 }}>
          {confirmState.msg}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={() => setConfirmState(null)}
            style={{
              fontSize: 13, ...MONO, cursor: 'pointer', padding: '6px 16px',
              background: 'transparent', border: '1px solid #252525', color: '#555',
            }}
          >Cancelar</button>
          <button
            onClick={() => { confirmState.action(); setConfirmState(null) }}
            style={{
              fontSize: 13, ...MONO, cursor: 'pointer', padding: '6px 16px',
              background: '#250000', border: '1px solid #660000',
              color: '#ff5555', fontWeight: 700,
            }}
          >Eliminar</button>
        </div>
      </div>
    </div>
  )

  // ── Datos para composición (todos los proyectos visibles) ────────────────
  const allVisibleRipios = proyectos
    .filter(p => !hiddenProyIds.has(p.id))
    .flatMap(p => p.ripios)

  const ripiosComp = proyectos
    .filter(p => !hiddenProyIds.has(p.id))
    .flatMap(p => p.ripios.map(r => ({
      id:             r.id,
      nombre:         r.nombre,
      an:             r.an,
      l_m:            r.l_m,
      coords:         r.coords ?? null,
      color:          r.color ?? PALETTE[r.orden % PALETTE.length],
      proyectoNombre: p.nombre,
      empresa:        r.empresa || undefined,
    })))

  const compTotalTon  = allVisibleRipios.reduce((s, r) => s + calcRipio(r).W, 0)
  const compTotalPres = allVisibleRipios.reduce((s, r) => s + calcRipio(r).presupuesto, 0)
  const visiblePrjNames = proyectos.filter(p => !hiddenProyIds.has(p.id)).map(p => p.nombre)
  const compNombre = visiblePrjNames.length === 1
    ? visiblePrjNames[0]
    : visiblePrjNames.length > 1 ? `${visiblePrjNames.length} proyectos` : 'Sin proyectos'

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 0, flexShrink: 0,
        borderBottom: '1px solid #0e0e0e', background: '#060606',
      }}>
        {(['computo', 'mapa'] as const).map(v => (
          <button key={v} onClick={() => setView(v)} style={{
            fontFamily: 'monospace', fontSize: 12, cursor: 'pointer',
            padding: '6px 20px', border: 'none', borderRight: '1px solid #111',
            letterSpacing: 0.8, textTransform: 'uppercase',
            background: view === v ? '#0d0d0d' : 'transparent',
            color:      view === v ? COLOR      : '#444',
            borderBottom: view === v ? `1.5px solid ${COLOR}` : '1.5px solid transparent',
          }}>
            {v === 'computo' ? 'Cómputo' : 'Composición'}
          </button>
        ))}
        {saving && <div style={{ marginLeft: 'auto', alignSelf: 'center', marginRight: 10, width: 6, height: 6, borderRadius: '50%', background: COLOR, opacity: 0.7 }}/>}
      </div>

      {/* Contenido según tab */}
      {view === 'computo' ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>

          {/* Columna 1: árbol */}
          {renderTree()}

          {/* Columna 2: mapa */}
          <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
            {proyectos.length > 0 ? (
              <RipioMapPanel
                ripios={mapRipios}
                selectedId={selectedId}
                drawingId={drawingId}
                color={COLOR}
                onLineDraw={handleLineDraw}
                onDrawEnd={() => setDrawingId(null)}
                onSelectRipio={(id) => {
                  const owner = proyectos.find(p => p.ripios.some(r => r.id === id))
                  if (owner) setActiveProyId(owner.id)
                  setSelectedId(id)
                  setPanel('form')
                }}
                onDeleteRipio={deleteRipio}
              />
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#444', ...MONO, fontSize: 13 }}>
                Creá un proyecto para comenzar
              </div>
            )}

            {/* Instrucción de dibujo flotante */}
            {drawingId && (
              <div style={{
                position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
                zIndex: 1000, background: '#0a0a0aee', border: `1px solid ${COLOR}55`,
                padding: '5px 14px', ...MONO, fontSize: 12, color: `${COLOR}cc`,
                pointerEvents: 'none',
              }}>
                Clic para agregar puntos · Clic derecho para finalizar
              </div>
            )}
          </div>

          {/* Columna 3: form / resumen */}
          <div style={{
            width: 220, flexShrink: 0, borderLeft: '1px solid #131313',
            background: '#080808', display: 'flex', flexDirection: 'column',
          }}>
            {panel === 'form' ? renderForm() : renderResumen()}
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0 }}>
          <MapComposicionRipio
            ripios={ripiosComp}
            proyectoNombre={compNombre}
            totalTon={compTotalTon}
            totalPres={compTotalPres}
            active={view === 'mapa'}
          />
        </div>
      )}

      {/* Modal de confirmación (fuera del tab para que siempre esté disponible) */}
      {renderConfirm()}
    </div>
  )
}
