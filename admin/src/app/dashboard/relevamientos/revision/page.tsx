'use client'
import 'leaflet/dist/leaflet.css'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface PuntoTrack {
  lat: number; lng: number; alt?: number; acc?: number; ts?: number; prog?: number
}

type TipoRel = 'puente' | 'alcantarilla' | 'tubos' | 'lineal' | 'otro'

interface Relevamiento {
  id: string
  fecha: string
  ruta_tramo: string
  cc_asociado?: string | null
  zona?: string | null
  tipo: string | null   // puede ser null, minúscula ('ripio') o capitalizada ('Lineal', 'Puente'...)
  coords_lat?: number | null
  coords_lng?: number | null
  coords_linea?: PuntoTrack[] | null
  fotos?: string[] | null
  datos_especificos?: Record<string, unknown> | null
}

/** Parsea coords_linea aunque venga como string JSON (Supabase puede devolver text) */
function parseLinea(raw: unknown): PuntoTrack[] | null {
  if (Array.isArray(raw) && raw.length >= 2) return raw as PuntoTrack[]
  if (typeof raw === 'string' && raw.length > 2) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length >= 2) return parsed as PuntoTrack[]
    } catch { /* ignore */ }
  }
  return null
}

/**
 * Normaliza el campo `tipo` de Supabase.
 * App antiguo: 'ripio' | 'puente' | ... (minúscula)
 * App actual:  'Lineal' | 'Puente' | ... (TipoInfraestructura capitalizado)
 * Fallback: coords_linea presente → 'ripio'.
 */
function efectiveTipo(r: Relevamiento): TipoRel {
  const t = r.tipo?.toLowerCase()
  // 'Lineal' (app actual) y 'ripio' (app antiguo) → ambos son lineal
  if (t === 'lineal' || t === 'ripio') return 'lineal'
  if (t === 'puente')       return 'puente'
  if (t === 'alcantarilla') return 'alcantarilla'
  if (t === 'tubos')        return 'tubos'
  if (t === 'otro' || t === 'outro') return 'otro'
  return parseLinea(r.coords_linea) !== null ? 'lineal' : 'otro'
}

/** Devuelve el subtipo del lineal (Ripio / Tramo / Canal) o 'Lineal' si no está en BD */
function subtipoLineal(r: Relevamiento): string {
  const de = r.datos_especificos
  if (!de) return 'Lineal'
  const d = (de['lineal'] ?? de['ripio']) as Record<string, unknown> | null | undefined
  return (d?.subtipo as string) ?? 'Lineal'
}

// ─── Constantes ───────────────────────────────────────────────────────────────
const TIPO_COLOR: Record<TipoRel, string> = {
  lineal:       '#F5C300',
  puente:       '#3498db',
  alcantarilla: '#27ae60',
  tubos:        '#e67e22',
  otro:         '#9b59b6',
}

const TIPO_LABEL: Record<TipoRel, string> = {
  lineal:       'Lineal',
  puente:       'Puente',
  alcantarilla: 'Alcantarilla',
  tubos:        'Tubos',
  otro:         'Otro',
}

const TODOS_TIPOS: TipoRel[] = ['lineal', 'puente', 'alcantarilla', 'tubos', 'otro']

// ─── Helpers topográficos ─────────────────────────────────────────────────────
function haversine(a: PuntoTrack, b: PuntoTrack): number {
  const R = 6371000, DEG = Math.PI / 180
  const dLat = (b.lat - a.lat) * DEG, dLng = (b.lng - a.lng) * DEG
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
}

function recalcProgs(pts: PuntoTrack[]): PuntoTrack[] {
  let acc = 0
  return pts.map((p, i) => { if (i > 0) acc += haversine(pts[i - 1], p); return { ...p, prog: acc } })
}

function fmtPK(m: number): string {
  return `PK ${Math.floor(m / 1000)}+${String(Math.round(m % 1000)).padStart(3, '0')}`
}
function fmtDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(3)} km` : `${Math.round(m)} m`
}
function fmtTs(ts?: number): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
}
function accColor(acc?: number): string {
  if (acc == null) return '#555'
  return acc < 8 ? '#27ae60' : acc < 20 ? '#F5C300' : '#e74c3c'
}

// ─── Estilos base ─────────────────────────────────────────────────────────────
const MONO: React.CSSProperties = { fontFamily: '"DM Mono","Roboto Mono",ui-monospace,monospace' }

// ─── Componente principal ─────────────────────────────────────────────────────
export default function RevisionCampoPage() {
  const [all,      setAll]      = useState<Relevamiento[]>([])
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState<Relevamiento | null>(null)
  const [editPts,  setEditPts]  = useState<PuntoTrack[]>([])
  const [dirty,    setDirty]    = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [msg,      setMsg]      = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)

  // Filtros
  const [fSearch, setFSearch] = useState('')
  const [fTipo,   setFTipo]   = useState('')
  const [fZona,   setFZona]   = useState('')
  const [fCC,     setFCC]     = useState('')

  // Cargar todos los relevamientos
  useEffect(() => {
    const sb = createClient()
    sb.from('relevamientos')
      .select('id,fecha,ruta_tramo,cc_asociado,zona,tipo,coords_lat,coords_lng,coords_linea,fotos,datos_especificos')
      .order('fecha', { ascending: false })
      .then(({ data }) => {
        const rows = (data ?? []) as Relevamiento[]
        // ── DEBUG diagnóstico — borrar cuando funcione ──────────────────────
        const lineal = rows.find(r => {
          const t = r.tipo?.toLowerCase()
          return t === 'lineal' || t === 'ripio'
        })
        if (lineal) {
          const cl: unknown = lineal.coords_linea
          console.log('[debug] primer lineal encontrado:', {
            tipo: lineal.tipo,
            coords_linea_tipo: typeof cl,
            es_array: Array.isArray(cl),
            largo: Array.isArray(cl) ? cl.length : typeof cl === 'string' ? (cl as string).length : 'N/A',
            primer_punto: Array.isArray(cl) ? cl[0] : typeof cl === 'string' ? (cl as string).slice(0, 80) : cl,
          })
        } else {
          console.log('[debug] NO se encontraron items lineales. tipos presentes:', [...new Set(rows.map(r => r.tipo))])
        }
        // ────────────────────────────────────────────────────────────────────
        setAll(rows)
        setLoading(false)
      })
  }, [])

  // Zonas únicas para el select de filtro
  const zonas = useMemo(() => {
    const s = new Set<string>()
    all.forEach(r => { if (r.zona) s.add(r.zona) })
    return Array.from(s).sort()
  }, [all])

  // Relevamientos filtrados
  const filtered = useMemo(() => {
    const q = fSearch.toLowerCase()
    return all.filter(r => {
      if (fTipo && efectiveTipo(r) !== fTipo) return false
      if (fZona && r.zona !== fZona) return false
      if (fCC   && !(r.cc_asociado?.toLowerCase().includes(fCC.toLowerCase()))) return false
      if (q     && !(r.ruta_tramo?.toLowerCase().includes(q) || r.cc_asociado?.toLowerCase().includes(q))) return false
      return true
    })
  }, [all, fSearch, fTipo, fZona, fCC])

  const selectItem = useCallback((r: Relevamiento) => {
    setSelected(r)
    const linea = parseLinea(r.coords_linea)
    if (efectiveTipo(r) === 'lineal' && linea !== null) {
      setEditPts(recalcProgs(linea))
    } else {
      setEditPts([])
    }
    setDirty(false)
    setMsg(null)
  }, [])

  const handleVertexMove = useCallback((idx: number, lat: number, lng: number) => {
    setEditPts(prev => recalcProgs(prev.map((p, i) => i === idx ? { ...p, lat, lng } : p)))
    setDirty(true)
  }, [])

  const handleDeleteVertex = useCallback((idx: number) => {
    setEditPts(prev => {
      if (prev.length <= 2) return prev
      return recalcProgs(prev.filter((_, i) => i !== idx))
    })
    setDirty(true)
  }, [])

  const handleInsertVertex = useCallback((afterIdx: number, lat: number, lng: number) => {
    setEditPts(prev => {
      const pts = [...prev]
      pts.splice(afterIdx + 1, 0, { lat, lng, prog: 0 })
      return recalcProgs(pts)
    })
    setDirty(true)
  }, [])

  const saveTrack = async () => {
    if (!selected || !dirty) return
    setSaving(true)
    const sb = createClient()
    const { error } = await sb.from('relevamientos').update({ coords_linea: editPts }).eq('id', selected.id)
    if (error) { setMsg(`Error: ${error.message}`); setSaving(false); return }
    setAll(prev => prev.map(r => r.id === selected.id ? { ...r, coords_linea: editPts } : r))
    setSelected(prev => prev ? { ...prev, coords_linea: editPts } : prev)
    setDirty(false); setSaving(false)
    setMsg('✓ Track guardado')
    setTimeout(() => setMsg(null), 3000)
  }

  const longTotal  = editPts.length >= 2 ? (editPts[editPts.length - 1].prog ?? 0) : 0
  const selTipo    = selected ? efectiveTipo(selected) : 'otro'
  const selColor   = TIPO_COLOR[selTipo]
  const fotos      = selected?.fotos ?? []
  const datosActivos = selected
    ? ((selTipo === 'lineal'
        // para lineales buscar 'lineal' primero (app actual), luego 'ripio' (app antiguo)
        ? (selected.datos_especificos?.['lineal'] ?? selected.datos_especificos?.['ripio'])
        : selected.datos_especificos?.[selTipo]
      ) as Record<string, unknown> | null | undefined) ?? null
    : null

  // Estado "editando track lineal" — sólo cambia al seleccionar, no en cada dragend
  const isEditingRipio = selTipo === 'lineal' && editPts.length >= 2

  return (
    <>
      {/* Lightbox */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#000c', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}>
          <img src={lightbox} alt="foto" style={{ maxWidth: '92vw', maxHeight: '92vh', objectFit: 'contain', borderRadius: 4, boxShadow: '0 4px 32px #000' }} />
        </div>
      )}

      <div style={{ display: 'flex', height: 'calc(100vh - 32px)', overflow: 'hidden', ...MONO }}>

        {/* ── Lista + Filtros ── */}
        <div style={{ width: 280, flexShrink: 0, borderRight: '1px solid #1a1a1a', display: 'flex', flexDirection: 'column', background: '#080808' }}>

          {/* Header */}
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #1a1a1a', flexShrink: 0 }}>
            <div style={{ fontSize: 9, color: '#444', letterSpacing: 1.5, textTransform: 'uppercase' }}>Relevamientos</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#e0e0e0', marginTop: 2 }}>Revisión de campo</div>
            {!loading && (
              <div style={{ fontSize: 10, color: '#444', marginTop: 3 }}>
                {filtered.length} de {all.length} relevamientos
              </div>
            )}
          </div>

          {/* Filtros */}
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #111', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <input
              placeholder="Buscar ruta, CC…"
              value={fSearch}
              onChange={e => setFSearch(e.target.value)}
              style={{ background: '#111', border: '1px solid #222', color: '#ccc', padding: '4px 8px', fontSize: 10, borderRadius: 2, width: '100%', boxSizing: 'border-box', ...MONO }}
            />
            <div style={{ display: 'flex', gap: 4 }}>
              <select
                value={fTipo}
                onChange={e => setFTipo(e.target.value)}
                style={{ flex: 1, background: '#111', border: '1px solid #222', color: '#ccc', padding: '3px 4px', fontSize: 9, borderRadius: 2, ...MONO }}>
                <option value=''>Tipo: todos</option>
                {TODOS_TIPOS.map(t => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
              </select>
              <select
                value={fZona}
                onChange={e => setFZona(e.target.value)}
                style={{ flex: 1, background: '#111', border: '1px solid #222', color: '#ccc', padding: '3px 4px', fontSize: 9, borderRadius: 2, ...MONO }}>
                <option value=''>Zona: todas</option>
                {zonas.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
            </div>
            <input
              placeholder="Filtrar por consorcio…"
              value={fCC}
              onChange={e => setFCC(e.target.value)}
              style={{ background: '#111', border: '1px solid #222', color: '#ccc', padding: '4px 8px', fontSize: 10, borderRadius: 2, width: '100%', boxSizing: 'border-box', ...MONO }}
            />
          </div>

          {/* Lista scrollable */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: 20, fontSize: 11, color: '#444' }}>Cargando…</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 20, fontSize: 11, color: '#444' }}>Sin resultados.</div>
            ) : filtered.map(r => {
              const isActive  = selected?.id === r.id
              const tipo      = efectiveTipo(r)
              const color     = TIPO_COLOR[tipo]
              const linea     = parseLinea(r.coords_linea)
              const isLineal  = linea !== null
              const lon       = isLineal ? (linea![linea!.length - 1].prog ?? 0) : 0
              const nFotos    = (r.fotos ?? []).length
              return (
                <button key={r.id} onClick={() => selectItem(r)}
                  style={{
                    width: '100%', textAlign: 'left', padding: '10px 14px',
                    background: isActive ? `${color}11` : 'transparent',
                    borderLeft: `2px solid ${isActive ? color : 'transparent'}`,
                    border: 'none', borderBottom: '1px solid #111', cursor: 'pointer',
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                    <span style={{ fontSize: 11, color: isActive ? color : '#bbb', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 155 }}>
                      {r.ruta_tramo || 'Sin nombre'}
                    </span>
                    <span style={{ fontSize: 9, color: color, padding: '1px 5px', border: `1px solid ${color}44`, borderRadius: 2, flexShrink: 0, marginLeft: 4 }}>
                      {tipo === 'lineal' ? subtipoLineal(r) : TIPO_LABEL[tipo]}
                    </span>
                  </div>
                  <div style={{ fontSize: 9, color: '#555' }}>
                    {r.fecha?.slice(0, 10)} · {r.zona ?? '—'} · CC {r.cc_asociado ?? '—'}
                  </div>
                  {isLineal && (
                    <div style={{ fontSize: 10, color: isActive ? '#aaa' : '#444', marginTop: 2 }}>
                      {fmtDist(lon)} · {linea!.length} pts
                    </div>
                  )}
                  {nFotos > 0 && (
                    <div style={{ fontSize: 9, color: '#555', marginTop: 1 }}>
                      📷 {nFotos} foto{nFotos !== 1 ? 's' : ''}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Centro: mapa (siempre montado) ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Barra superior — sólo cuando hay selección */}
          {selected && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', borderBottom: '1px solid #1a1a1a', flexShrink: 0, background: '#0a0a0a' }}>
              <span style={{ fontSize: 9, color: selColor, border: `1px solid ${selColor}44`, padding: '2px 7px', borderRadius: 2, flexShrink: 0 }}>
                {selTipo === 'lineal' && selected ? subtipoLineal(selected) : TIPO_LABEL[selTipo]}
              </span>
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontSize: 9, color: '#444', letterSpacing: 1, textTransform: 'uppercase' }}>
                  {selected.zona ?? '—'} · CC {selected.cc_asociado ?? '—'}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#e0e0e0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selected.ruta_tramo}
                </div>
              </div>
              <div style={{ flex: 1 }} />
              {selTipo === 'lineal' && editPts.length >= 2 && (
                <>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 8, color: '#444', textTransform: 'uppercase', letterSpacing: 0.8 }}>Longitud</div>
                    <div style={{ fontSize: 13, color: '#F5C300', fontWeight: 700 }}>{fmtDist(longTotal)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 8, color: '#444', textTransform: 'uppercase', letterSpacing: 0.8 }}>Puntos</div>
                    <div style={{ fontSize: 13, color: '#F5C300', fontWeight: 700 }}>{editPts.length}</div>
                  </div>
                </>
              )}
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 8, color: '#444', textTransform: 'uppercase', letterSpacing: 0.8 }}>Fecha</div>
                <div style={{ fontSize: 13, color: '#F5C300', fontWeight: 700 }}>{selected.fecha?.slice(0, 10)}</div>
              </div>
              {dirty && (
                <button onClick={saveTrack} disabled={saving}
                  style={{ padding: '6px 16px', background: '#F5C300', color: '#111', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, ...MONO, letterSpacing: 0.5, opacity: saving ? 0.6 : 1, flexShrink: 0 }}>
                  {saving ? 'Guardando…' : '↑ Guardar cambios'}
                </button>
              )}
              {msg && <span style={{ fontSize: 11, color: '#27ae60', flexShrink: 0 }}>{msg}</span>}
            </div>
          )}

          {/* Mapa + panel derecho */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>

            {/* Mapa Leaflet — siempre montado */}
            <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
              <LeafletRevisionMap
                items={filtered}
                selectedId={selected?.id ?? null}
                editPts={editPts}
                isEditingRipio={isEditingRipio}
                onSelectItem={selectItem}
                onVertexMove={handleVertexMove}
                onDeleteVertex={handleDeleteVertex}
                onInsertVertex={handleInsertVertex}
              />
              {!selected && (
                <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 500, pointerEvents: 'none', textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: '#ccc', background: '#0e0e0ecc', padding: '6px 14px', borderRadius: 4, backdropFilter: 'blur(4px)', border: '1px solid #1e1e1e', whiteSpace: 'nowrap' }}>
                    Seleccioná un relevamiento de la lista
                  </div>
                </div>
              )}
              {selTipo === 'lineal' && editPts.length >= 2 && (
                <div style={{ position: 'absolute', bottom: 10, left: 10, zIndex: 1000, background: '#0e0e0ecc', border: '1px solid #1e1e1e', borderRadius: 4, padding: '6px 10px', fontSize: 9, color: '#666', backdropFilter: 'blur(4px)' }}>
                  Arrastrá un vértice para corregirlo · Clic derecho → eliminar
                </div>
              )}
            </div>

            {/* Panel derecho — siempre montado, oculto sin selección */}
            <div style={{
              width: 320, flexShrink: 0,
              display: selected ? 'flex' : 'none',
              flexDirection: 'column', overflow: 'hidden',
              background: '#0e0e0e', borderLeft: '1px solid #1a1a1a',
            }}>
              {selTipo === 'lineal' ? (

                /* ── Planilla topográfica (ripio) ── */
                <>
                  <div style={{ padding: '8px 12px', borderBottom: '1px solid #1a1a1a', flexShrink: 0 }}>
                    <div style={{ fontSize: 9, color: '#444', textTransform: 'uppercase', letterSpacing: 1 }}>Planilla topográfica</div>
                    <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{editPts.length} vértices · {fmtDist(longTotal)}</div>
                  </div>

                  {/* Header tabla */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 0.7fr 0.7fr 0.5fr', padding: '4px 8px', borderBottom: '1px solid #1a1a1a', background: '#0a0a0a', flexShrink: 0 }}>
                    {['PK', 'Latitud', 'Longitud', 'Alt', '±Acc', ''].map(h => (
                      <span key={h} style={{ fontSize: 8, color: '#444', textTransform: 'uppercase', letterSpacing: 0.6 }}>{h}</span>
                    ))}
                  </div>

                  {/* Filas scrollables */}
                  <div style={{ flex: 1, overflowY: 'auto' }}>
                    {editPts.map((pt, i) => {
                      const isFirst = i === 0, isLast = i === editPts.length - 1
                      const hi = isFirst || isLast
                      return (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 0.7fr 0.7fr 0.5fr', padding: '4px 8px', borderBottom: '1px solid #111', background: hi ? '#0f0f0f' : i % 2 === 0 ? '#080808' : '#0a0a0a', alignItems: 'center' }}>
                          <span style={{ fontSize: 9, color: hi ? '#F5C300' : '#777', fontWeight: hi ? 700 : 400 }}>{fmtPK(pt.prog ?? 0)}</span>
                          <span style={{ fontSize: 8, color: '#555' }}>{pt.lat.toFixed(5)}</span>
                          <span style={{ fontSize: 8, color: '#555' }}>{pt.lng.toFixed(5)}</span>
                          <span style={{ fontSize: 9, color: '#555' }}>{pt.alt != null ? pt.alt.toFixed(0) : '—'}</span>
                          <span style={{ fontSize: 9, color: accColor(pt.acc) }}>{pt.acc != null ? `±${Math.round(pt.acc)}` : '—'}</span>
                          <button onClick={() => handleDeleteVertex(i)}
                            style={{ fontSize: 11, color: '#2a2a2a', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, ...MONO }}
                            title="Eliminar punto">×</button>
                        </div>
                      )
                    })}
                  </div>

                  {/* Footer */}
                  <div style={{ borderTop: '1px solid #1a1a1a', padding: '8px 12px', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 9, color: '#444' }}>
                      {selected?.fecha?.slice(0, 10)} · {fmtTs(editPts[0]?.ts)} → {fmtTs(editPts[editPts.length - 1]?.ts)}
                    </span>
                    {dirty && (
                      <span style={{ fontSize: 9, color: '#F5C300', border: '1px solid #F5C30044', padding: '2px 6px', borderRadius: 2 }}>● Modificado</span>
                    )}
                  </div>

                  {/* Fotos (ripio) */}
                  {fotos.length > 0 && (
                    <div style={{ borderTop: '1px solid #1a1a1a', padding: '8px 12px', flexShrink: 0 }}>
                      <div style={{ fontSize: 9, color: '#444', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                        Fotos ({fotos.length})
                      </div>
                      <div style={{ display: 'flex', gap: 5, overflowX: 'auto', paddingBottom: 2 }}>
                        {fotos.map((url, i) => (
                          <div key={i} onClick={() => setLightbox(url)}
                            style={{ width: 58, height: 58, flexShrink: 0, borderRadius: 3, overflow: 'hidden', border: '1px solid #222', cursor: 'zoom-in', background: '#111' }}>
                            <img src={url} alt={`foto ${i + 1}`}
                              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>

              ) : selected ? (

                /* ── Datos técnicos + fotos (tipos puntuales) ── */
                <div style={{ flex: 1, overflowY: 'auto' }}>

                  {/* Header */}
                  <div style={{ padding: '8px 12px', borderBottom: '1px solid #1a1a1a' }}>
                    <div style={{ fontSize: 9, color: '#444', textTransform: 'uppercase', letterSpacing: 1 }}>Datos técnicos</div>
                  </div>

                  {/* Campos del tipo */}
                  <div style={{ padding: '6px 12px', borderBottom: '1px solid #111' }}>
                    {datosActivos && typeof datosActivos === 'object' && Object.keys(datosActivos).length > 0 ? (
                      Object.entries(datosActivos).map(([k, v]) =>
                        v != null && v !== '' ? (
                          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '4px 0', borderBottom: '1px solid #0f0f0f', gap: 8 }}>
                            <span style={{ fontSize: 9, color: '#555', textTransform: 'uppercase', letterSpacing: 0.5, flexShrink: 0, paddingTop: 1 }}>
                              {k.replace(/_/g, ' ')}
                            </span>
                            <span style={{ fontSize: 10, color: '#ccc', textAlign: 'right', wordBreak: 'break-word', maxWidth: 180 }}>
                              {String(v)}
                            </span>
                          </div>
                        ) : null
                      )
                    ) : (
                      <div style={{ fontSize: 10, color: '#333', padding: '8px 0' }}>Sin datos técnicos registrados.</div>
                    )}
                  </div>

                  {/* Ubicación */}
                  {selected.coords_lat != null && selected.coords_lng != null && (
                    <div style={{ padding: '6px 12px', borderBottom: '1px solid #111' }}>
                      <div style={{ fontSize: 8, color: '#444', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Ubicación GPS</div>
                      <div style={{ fontSize: 9, color: '#666', ...MONO }}>
                        {selected.coords_lat.toFixed(6)}, {selected.coords_lng.toFixed(6)}
                      </div>
                    </div>
                  )}

                  {/* Fotos */}
                  <div style={{ padding: '8px 12px' }}>
                    <div style={{ fontSize: 9, color: '#444', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                      Fotos adjuntas {fotos.length > 0 ? `(${fotos.length})` : ''}
                    </div>
                    {fotos.length > 0 ? (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                        {fotos.map((url, i) => (
                          <div key={i} onClick={() => setLightbox(url)}
                            style={{ aspectRatio: '4/3', overflow: 'hidden', borderRadius: 3, border: '1px solid #1e1e1e', cursor: 'zoom-in', background: '#111' }}>
                            <img src={url} alt={`foto ${i + 1}`}
                              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 10, color: '#2e2e2e' }}>Sin fotos adjuntas.</div>
                    )}
                  </div>
                </div>

              ) : null}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── LeafletRevisionMap ───────────────────────────────────────────────────────
// Renderiza TODOS los ítems filtrados en el mapa. Tipos puntuales → L.marker.
// Ripio → polyline. Cuando isEditingRipio=true agrega vértices draggables
// sobre la selección activa (usa L.marker, no circleMarker).

interface MapProps {
  items:            Relevamiento[]
  selectedId:       string | null
  editPts:          PuntoTrack[]
  isEditingRipio:   boolean
  onSelectItem:     (r: Relevamiento) => void
  onVertexMove:     (idx: number, lat: number, lng: number) => void
  onDeleteVertex:   (idx: number) => void
  onInsertVertex:   (afterIdx: number, lat: number, lng: number) => void
}

function LeafletRevisionMap({
  items,
  selectedId,
  editPts,
  isEditingRipio,
  onSelectItem,
  onVertexMove,
  onDeleteVertex,
  onInsertVertex,
}: MapProps) {
  const divRef       = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<any>(null)
  const LfRef        = useRef<any>(null)
  const [mapReady,   setMapReady]   = useState(false)

  // Capas estáticas id → layer
  const staticRef    = useRef<Map<string, { tipo: string; layer: any }>>(new Map())
  // Capas de edición (polyline + vértices + midpoints + PKs + rubber band)
  const editRef      = useRef<{ line: any; markers: any[]; pks: any[] }>({ line: null, markers: [], pks: [] })
  // Rubber band lines (se actualizan en mousemove)
  const rubberRef    = useRef<{ prev: any; next: any }>({ prev: null, next: null })
  // Índice del vértice activo (grip caliente)
  const activeVtxRef = useRef<number | null>(null)

  // Refs para callbacks (evitar closures obsoletas)
  const onSelectRef      = useRef(onSelectItem)
  const onVertexMoveRef  = useRef(onVertexMove)
  const onDeleteRef      = useRef(onDeleteVertex)
  const onInsertRef      = useRef(onInsertVertex)
  useEffect(() => { onSelectRef.current     = onSelectItem   }, [onSelectItem])
  useEffect(() => { onVertexMoveRef.current = onVertexMove   }, [onVertexMove])
  useEffect(() => { onDeleteRef.current     = onDeleteVertex }, [onDeleteVertex])
  useEffect(() => { onInsertRef.current     = onInsertVertex }, [onInsertVertex])

  // ── Inicializar mapa ──────────────────────────────────────────────
  useEffect(() => {
    if (!divRef.current) return
    let destroyed = false
    ;(async () => {
      const Lf = (await import('leaflet')).default
      if (destroyed || !divRef.current) return
      const map = Lf.map(divRef.current, { center: [-26.5, -60.5], zoom: 8, zoomControl: true, attributionControl: false })
      const osm = Lf.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 })
      const sat = Lf.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', { maxZoom: 20, subdomains: ['mt0','mt1','mt2','mt3'] })
      osm.addTo(map)
      Lf.control.layers({ 'OSM': osm, 'Satélite': sat }, {}, { position: 'topright' }).addTo(map)
      mapRef.current = map
      LfRef.current  = Lf
      setMapReady(true)
    })()
    return () => {
      destroyed = true
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  }, [])

  // ── Redibujar todas las capas estáticas desde cero ──────────────────
  // Se limpia todo y se re-agrega en cada cambio (items / selectedId / isEditingRipio).
  // Más simple y robusto que el patrón UPDATE/CREATE con Map de capas.
  useEffect(() => {
    const map = mapRef.current; const Lf = LfRef.current
    if (!map || !Lf || !mapReady) return

    // Limpiar capas anteriores
    staticRef.current.forEach(entry => {
      try { map.removeLayer(entry.layer) } catch { /* ignore */ }
    })
    staticRef.current.clear()

    items.forEach(r => {
      const isSel      = r.id === selectedId
      const tipo       = efectiveTipo(r)
      const color      = TIPO_COLOR[tipo]
      const pts        = parseLinea(r.coords_linea)
      const isLinear   = pts !== null
      const hideStatic = isSel && isLinear && isEditingRipio

      const tooltipHtml = [
        `<div style="font-family:monospace;font-size:11px;color:#e0e0e0;background:#0e0e0e;`,
        `padding:6px 8px;border:1px solid #333;border-radius:3px;line-height:1.5">`,
        `<b>${r.ruta_tramo || 'Sin nombre'}</b><br/>`,
        `${TIPO_LABEL[tipo]} · ${r.fecha?.slice(0, 10) ?? '—'}<br/>`,
        `${r.cc_asociado ?? ''} ${r.zona ? `· ${r.zona}` : ''}`,
        `</div>`,
      ].join('')

      if (isLinear && pts) {
        try {
          const latlngs = pts
            .filter(p => typeof p.lat === 'number' && typeof p.lng === 'number')
            .map(p => [p.lat, p.lng] as [number, number])
          if (latlngs.length < 2) return
          const line = Lf.polyline(latlngs, {
            color, weight: isSel ? 4 : 2.5,
            opacity: hideStatic ? 0 : (isSel ? 1 : 0.7),
          })
          line.bindTooltip(tooltipHtml, { sticky: true })
          line.on('click', () => onSelectRef.current(r))
          line.addTo(map)
          staticRef.current.set(r.id, { tipo, layer: line })
        } catch (e) { console.error('[map] polyline error', r.id, e) }

      } else if (r.coords_lat != null && r.coords_lng != null) {
        const sz = isSel ? 15 : 10
        const marker = Lf.marker([r.coords_lat, r.coords_lng], {
          icon: Lf.divIcon({
            className: '',
            html: `<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:${color};border:${isSel ? '2.5px solid #fff' : '1.5px solid #0008'};box-shadow:0 1px 5px #0007;box-sizing:border-box"></div>`,
            iconSize:   [sz, sz],
            iconAnchor: [sz / 2, sz / 2],
          }),
        })
        marker.bindTooltip(tooltipHtml)
        marker.on('click', () => onSelectRef.current(r))
        marker.addTo(map)
        staticRef.current.set(r.id, { tipo, layer: marker })
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, selectedId, isEditingRipio, mapReady])

  // ── Zoom al ítem seleccionado (punto) ─────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !selectedId || !mapReady) return
    const entry = staticRef.current.get(selectedId)
    if (!entry) return
    // zoom solo si es marcador puntual (no polyline)
    if (!['lineal', 'ripio'].includes(entry.tipo)) {
      try {
        const ll = entry.layer.getLatLng()
        map.setView(ll, Math.max(map.getZoom(), 14), { animate: true })
      } catch (_) {}
    }
  }, [selectedId, mapReady])

  // ── Edición de vértices — modelo AutoCAD (grip click-to-activate / click-to-place) ───
  useEffect(() => {
    const map = mapRef.current; const Lf = LfRef.current
    if (!map || !Lf || !mapReady) return

    // ── Limpiar sesión anterior ───────────────────────────────────────
    const { line, markers, pks } = editRef.current
    if (line)    map.removeLayer(line)
    markers.forEach(m => { try { map.removeLayer(m) } catch { /**/ } })
    pks.forEach(l => { try { map.removeLayer(l) } catch { /**/ } })
    editRef.current = { line: null, markers: [], pks: [] }

    if (rubberRef.current.prev) { map.removeLayer(rubberRef.current.prev); rubberRef.current.prev = null }
    if (rubberRef.current.next) { map.removeLayer(rubberRef.current.next); rubberRef.current.next = null }

    activeVtxRef.current = null
    map.getContainer().style.cursor = ''

    if (editPts.length < 2) return

    // ── Helpers de icono ─────────────────────────────────────────────
    const makeVtxIcon = (i: number, hot: boolean) => {
      const isFirst = i === 0, isLast = i === editPts.length - 1
      const pt = editPts[i]
      const col = hot
        ? '#ff3333'
        : isFirst ? '#27ae60'
        : isLast  ? '#e74c3c'
        : (pt.acc != null && pt.acc > 20) ? '#e67e22' : '#F5C300'
      const sz  = hot ? 14 : isFirst || isLast ? 12 : 9
      const shape = hot
        ? `border-radius:2px;transform:rotate(45deg);box-shadow:0 0 8px #ff333388`
        : `border-radius:50%;box-shadow:0 1px 4px #0009`
      return Lf.divIcon({
        className: '',
        html: `<div style="width:${sz}px;height:${sz}px;background:${col};border:2px solid ${hot?'#fff':'#111'};box-sizing:border-box;cursor:${hot?'crosshair':'pointer'};${shape}"></div>`,
        iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2],
      })
    }

    const makeMidIcon = (hovered = false) => {
      const sz = 8
      return Lf.divIcon({
        className: '',
        html: `<div style="width:${sz}px;height:${sz}px;background:${hovered?'#aaa':'#555'};border:1px solid ${hovered?'#ccc':'#333'};box-sizing:border-box;cursor:copy;transform:rotate(45deg);box-shadow:0 1px 3px #0007"></div>`,
        iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2],
      })
    }

    // ── Polyline de edición ──────────────────────────────────────────
    const editLine = Lf.polyline(
      editPts.map(p => [p.lat, p.lng] as [number, number]),
      { color: '#F5C300', weight: 2.5, opacity: 1 },
    ).addTo(map)

    // ── Rubber band (líneas punteadas que siguen el cursor) ──────────
    const rbPrev = Lf.polyline([], { color: '#F5C300', weight: 1.5, opacity: 0.7, dashArray: '5 5' }).addTo(map)
    const rbNext = Lf.polyline([], { color: '#F5C300', weight: 1.5, opacity: 0.7, dashArray: '5 5' }).addTo(map)
    rubberRef.current = { prev: rbPrev, next: rbNext }

    // ── Deactivate grip ──────────────────────────────────────────────
    const deactivate = (vtxMarkers: any[]) => {
      const prev = activeVtxRef.current
      if (prev !== null && vtxMarkers[prev]) {
        vtxMarkers[prev].setIcon(makeVtxIcon(prev, false))
      }
      activeVtxRef.current = null
      rbPrev.setLatLngs([]); rbNext.setLatLngs([])
      map.getContainer().style.cursor = ''
    }

    // ── Marcadores de vértice ────────────────────────────────────────
    const vtxMarkers: any[] = editPts.map((pt, i) => {
      const m = Lf.marker([pt.lat, pt.lng] as [number, number], {
        icon: makeVtxIcon(i, false),
        zIndexOffset: 600,
      })

      m.bindTooltip(
        `<div style="font-family:monospace;font-size:11px;color:#e0e0e0;background:#0e0e0e;padding:5px 8px;border:1px solid #333;border-radius:3px;line-height:1.6">
          <b>${fmtPK(pt.prog ?? 0)}</b><br/>
          ${pt.lat.toFixed(6)}, ${pt.lng.toFixed(6)}
          ${pt.acc != null ? `<br/>±${Math.round(pt.acc)} m GPS` : ''}
        </div>`,
        { direction: 'top', offset: [0, -6] },
      )

      m.on('click', (e: any) => {
        Lf.DomEvent.stop(e)
        const prev = activeVtxRef.current
        deactivate(vtxMarkers)           // siempre apagar el anterior
        if (prev === i) return           // clic en el mismo → solo desactivar
        // Activar nuevo grip
        activeVtxRef.current = i
        m.setIcon(makeVtxIcon(i, true))
        map.getContainer().style.cursor = 'crosshair'
      })

      // Tecla Del mientras el cursor está sobre el vértice (alternativa rápida)
      m.on('contextmenu', (e: any) => {
        Lf.DomEvent.stop(e)
        deactivate(vtxMarkers)
        onDeleteRef.current(i)
      })

      m.addTo(map)
      return m
    })

    // ── Midpoints (diamante gris) — clic inserta vértice ────────────
    const midMarkers: any[] = []
    for (let i = 0; i < editPts.length - 1; i++) {
      const a = editPts[i], b = editPts[i + 1]
      const midLat = (a.lat + b.lat) / 2, midLng = (a.lng + b.lng) / 2
      const mid = Lf.marker([midLat, midLng] as [number, number], {
        icon: makeMidIcon(false),
        zIndexOffset: 500,
      })
      mid.on('mouseover', () => mid.setIcon(makeMidIcon(true)))
      mid.on('mouseout',  () => mid.setIcon(makeMidIcon(false)))
      mid.on('click', (e: any) => {
        Lf.DomEvent.stop(e)
        deactivate(vtxMarkers)
        onInsertRef.current(i, midLat, midLng)
      })
      mid.bindTooltip('<div style="font-family:monospace;font-size:10px;color:#aaa;background:#0e0e0e;padding:3px 7px;border:1px solid #333;border-radius:3px">+ Insertar vértice</div>', { direction: 'top' })
      mid.addTo(map)
      midMarkers.push(mid)
    }

    // ── Map click — mover grip activo ────────────────────────────────
    const handleMapClick = (e: any) => {
      const idx = activeVtxRef.current
      if (idx === null) return
      Lf.DomEvent.stop(e)
      deactivate(vtxMarkers)
      onVertexMoveRef.current(idx, e.latlng.lat, e.latlng.lng)
    }

    // ── Mousemove — actualizar rubber band ───────────────────────────
    const handleMouseMove = (e: any) => {
      const idx = activeVtxRef.current
      if (idx === null) return
      const c = e.latlng
      rbPrev.setLatLngs(idx > 0
        ? [[editPts[idx - 1].lat, editPts[idx - 1].lng], [c.lat, c.lng]]
        : [])
      rbNext.setLatLngs(idx < editPts.length - 1
        ? [[c.lat, c.lng], [editPts[idx + 1].lat, editPts[idx + 1].lng]]
        : [])
    }

    // ── Teclado: ESC cancela grip, Del elimina vértice activo ────────
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        deactivate(vtxMarkers)
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && activeVtxRef.current !== null) {
        const idx = activeVtxRef.current
        deactivate(vtxMarkers)
        onDeleteRef.current(idx)
      }
    }

    map.on('click',     handleMapClick)
    map.on('mousemove', handleMouseMove)
    window.addEventListener('keydown', handleKeyDown)

    // ── Etiquetas PK ─────────────────────────────────────────────────
    const step   = Math.max(1, Math.floor(editPts.length / 8))
    const pkIdxs = Array.from(new Set([
      0,
      ...Array.from({ length: 8 }, (_, ii) => (ii + 1) * step).filter(x => x < editPts.length),
      editPts.length - 1,
    ]))
    const newPks: any[] = pkIdxs.map(i => {
      const pt = editPts[i]
      return Lf.marker([pt.lat, pt.lng] as [number, number], {
        icon: Lf.divIcon({
          className: '',
          html: `<div style="font-family:monospace;font-size:9px;color:#F5C300;background:#0e0e0ecc;padding:1px 4px;border:1px solid #F5C30044;border-radius:2px;white-space:nowrap">${fmtPK(pt.prog ?? 0)}</div>`,
          iconAnchor: [0, 0],
        }),
        interactive: false,
      }).addTo(map)
    })

    editRef.current = { line: editLine, markers: [...vtxMarkers, ...midMarkers], pks: newPks }
    map.fitBounds(editLine.getBounds(), { padding: [30, 30], animate: true })

    return () => {
      map.off('click',     handleMapClick)
      map.off('mousemove', handleMouseMove)
      window.removeEventListener('keydown', handleKeyDown)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editPts, mapReady])

  return <div ref={divRef} style={{ width: '100%', height: '100%' }} />
}
