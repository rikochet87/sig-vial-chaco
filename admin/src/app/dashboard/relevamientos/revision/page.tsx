'use client'
import 'leaflet/dist/leaflet.css'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface PuntoTrack {
  lat:   number
  lng:   number
  alt?:  number
  acc?:  number
  ts?:   number
  prog?: number
}

interface TrackRel {
  id:              string
  fecha:           string
  ruta_tramo:      string
  cc_asociado?:    string
  zona?:           string
  datos_especificos?: Record<string, unknown>
  coords_linea:    PuntoTrack[]
  sincronizado_en?: string | null
}

// ── Helpers topográficos ──────────────────────────────────────────────────────
function haversine(a: PuntoTrack, b: PuntoTrack): number {
  const R = 6371000, DEG = Math.PI / 180
  const dLat = (b.lat - a.lat) * DEG, dLng = (b.lng - a.lng) * DEG
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
}

function recalcProgs(pts: PuntoTrack[]): PuntoTrack[] {
  let acc = 0
  return pts.map((p, i) => {
    if (i > 0) acc += haversine(pts[i - 1], p)
    return { ...p, prog: acc }
  })
}

function fmtPK(m: number): string {
  const km = Math.floor(m / 1000)
  const rm = Math.round(m % 1000)
  return `PK ${km}+${String(rm).padStart(3, '0')}`
}
function fmtDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(3)} km` : `${Math.round(m)} m`
}
function fmtTs(ts?: number): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`
}
function accColor(acc?: number): string {
  if (acc == null) return '#555'
  return acc < 8 ? '#27ae60' : acc < 20 ? '#F5C300' : '#e74c3c'
}

// ── Estilos ───────────────────────────────────────────────────────────────────
const MONO: React.CSSProperties = { fontFamily: '"DM Mono","Roboto Mono",ui-monospace,monospace' }
const panel = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: '#0e0e0e', border: '1px solid #1e1e1e', borderRadius: 4, ...extra,
})

// ── Página principal ──────────────────────────────────────────────────────────
export default function RevisionCampoPage() {
  const [tracks,   setTracks]   = useState<TrackRel[]>([])
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState<TrackRel | null>(null)
  const [editPts,  setEditPts]  = useState<PuntoTrack[]>([])
  const [dirty,    setDirty]    = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [msg,      setMsg]      = useState<string | null>(null)

  // ── Cargar relevamientos lineales con track ──
  useEffect(() => {
    const sb = createClient()
    sb.from('relevamientos')
      .select('id,fecha,ruta_tramo,cc_asociado,zona,datos_especificos,coords_linea,sincronizado_en')
      .not('coords_linea', 'is', null)
      .order('fecha', { ascending: false })
      .then(({ data }) => {
        const rows = ((data ?? []) as TrackRel[]).filter(r => Array.isArray(r.coords_linea) && r.coords_linea.length >= 2)
        setTracks(rows)
        setLoading(false)
      })
  }, [])

  const selectTrack = (t: TrackRel) => {
    setSelected(t)
    setEditPts(recalcProgs(t.coords_linea))
    setDirty(false)
    setMsg(null)
  }

  const handleVertexMove = useCallback((idx: number, lat: number, lng: number) => {
    setEditPts(prev => {
      const next = prev.map((p, i) => i === idx ? { ...p, lat, lng } : p)
      return recalcProgs(next)
    })
    setDirty(true)
  }, [])

  const handleDeleteVertex = useCallback((idx: number) => {
    setEditPts(prev => {
      if (prev.length <= 2) return prev
      const next = prev.filter((_, i) => i !== idx)
      return recalcProgs(next)
    })
    setDirty(true)
  }, [])

  const saveTrack = async () => {
    if (!selected || !dirty) return
    setSaving(true)
    const sb = createClient()
    const { error } = await sb.from('relevamientos')
      .update({ coords_linea: editPts })
      .eq('id', selected.id)
    if (error) { setMsg(`Error: ${error.message}`); setSaving(false); return }
    setTracks(prev => prev.map(t => t.id === selected.id ? { ...t, coords_linea: editPts } : t))
    setSelected(prev => prev ? { ...prev, coords_linea: editPts } : prev)
    setDirty(false); setSaving(false)
    setMsg('✓ Track guardado')
    setTimeout(() => setMsg(null), 3000)
  }

  const longTotal = editPts.length >= 2 ? (editPts[editPts.length - 1].prog ?? 0) : 0
  const subtipo = selected?.datos_especificos?.subtipo as string | undefined

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 32px)', overflow: 'hidden', ...MONO }}>

      {/* ── Lista lateral ── */}
      <div style={{ width: 280, flexShrink: 0, borderRight: '1px solid #1a1a1a', display: 'flex', flexDirection: 'column', background: '#080808' }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid #1a1a1a', flexShrink: 0 }}>
          <div style={{ fontSize: 9, color: '#444', letterSpacing: 1.5, textTransform: 'uppercase' }}>Relevamientos</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#e0e0e0', marginTop: 2 }}>Revisión de campo</div>
          {!loading && (
            <div style={{ fontSize: 10, color: '#444', marginTop: 3 }}>{tracks.length} track{tracks.length !== 1 ? 's' : ''} disponibles</div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 20, fontSize: 11, color: '#444' }}>Cargando…</div>
          ) : tracks.length === 0 ? (
            <div style={{ padding: 20, fontSize: 11, color: '#444' }}>No hay tracks guardados aún.</div>
          ) : tracks.map(t => {
            const isActive = selected?.id === t.id
            const lon = t.coords_linea.length >= 2 ? (t.coords_linea[t.coords_linea.length - 1].prog ?? 0) : 0
            const st = t.datos_especificos?.subtipo as string | undefined
            return (
              <button key={t.id} onClick={() => selectTrack(t)}
                style={{
                  width: '100%', textAlign: 'left', padding: '10px 14px',
                  background: isActive ? 'rgba(245,195,0,0.06)' : 'transparent',
                  borderLeft: `2px solid ${isActive ? '#F5C300' : 'transparent'}`,
                  border: 'none', borderBottom: '1px solid #111', cursor: 'pointer',
                  transition: 'background 0.12s',
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                  <span style={{ fontSize: 11, color: isActive ? '#F5C300' : '#bbb', fontWeight: 700 }}>
                    {t.ruta_tramo || 'Sin nombre'}
                  </span>
                  <span style={{ fontSize: 9, color: '#444', padding: '1px 5px', border: '1px solid #1e1e1e', borderRadius: 2 }}>
                    {st ?? 'Lineal'}
                  </span>
                </div>
                <div style={{ fontSize: 9, color: '#555' }}>
                  {t.fecha?.slice(0, 10)} · {t.zona ?? '—'} · CC {t.cc_asociado ?? '—'}
                </div>
                <div style={{ fontSize: 10, color: isActive ? '#aaa' : '#444', marginTop: 2 }}>
                  {fmtDist(lon)} · {t.coords_linea.length} pts
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Panel central + derecho ── */}
      {selected ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Barra superior */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', borderBottom: '1px solid #1a1a1a', flexShrink: 0, background: '#0a0a0a' }}>
            <div>
              <span style={{ fontSize: 9, color: '#444', letterSpacing: 1, textTransform: 'uppercase' }}>
                {subtipo ?? 'Lineal'} · {selected.zona ?? '—'} · CC {selected.cc_asociado ?? '—'}
              </span>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#e0e0e0', marginLeft: 10 }}>{selected.ruta_tramo}</span>
            </div>
            <div style={{ flex: 1 }} />
            {/* Métricas */}
            {[
              { l: 'Longitud', v: fmtDist(longTotal) },
              { l: 'Puntos',   v: String(editPts.length) },
              { l: 'Fecha',    v: selected.fecha?.slice(0, 10) },
            ].map(({ l, v }) => (
              <div key={l} style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 8, color: '#444', textTransform: 'uppercase', letterSpacing: 0.8 }}>{l}</div>
                <div style={{ fontSize: 13, color: '#F5C300', fontWeight: 700 }}>{v}</div>
              </div>
            ))}
            {dirty && (
              <button onClick={saveTrack} disabled={saving}
                style={{ padding: '6px 16px', background: '#F5C300', color: '#111', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, ...MONO, letterSpacing: 0.5, opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Guardando…' : '↑ Guardar cambios'}
              </button>
            )}
            {msg && <span style={{ fontSize: 11, color: '#27ae60' }}>{msg}</span>}
          </div>

          {/* Mapa + tabla */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

            {/* Mapa Leaflet */}
            <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
              <LeafletTrackEditor
                pts={editPts}
                onVertexMove={handleVertexMove}
                onDeleteVertex={handleDeleteVertex}
              />
              <div style={{ position: 'absolute', bottom: 10, left: 10, zIndex: 1000, background: '#0e0e0ecc', border: '1px solid #1e1e1e', borderRadius: 4, padding: '6px 10px', fontSize: 9, color: '#666', backdropFilter: 'blur(4px)' }}>
                Arrastrá un vértice para corregirlo · Clic derecho → eliminar
              </div>
            </div>

            {/* Tabla de progresivas */}
            <div style={{ ...panel(), width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderLeft: '1px solid #1a1a1a', borderRadius: 0, borderTop: 'none', borderBottom: 'none', borderRight: 'none' }}>
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
                  const isFirst = i === 0
                  const isLast  = i === editPts.length - 1
                  const hi      = isFirst || isLast
                  return (
                    <div key={i}
                      style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 0.7fr 0.7fr 0.5fr', padding: '4px 8px', borderBottom: '1px solid #111', background: hi ? '#0f0f0f' : i % 2 === 0 ? '#080808' : '#0a0a0a', alignItems: 'center' }}>
                      <span style={{ fontSize: 9, color: hi ? '#F5C300' : '#777', fontWeight: hi ? 700 : 400 }}>
                        {fmtPK(pt.prog ?? 0)}
                      </span>
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
                  {selected.fecha?.slice(0, 10)} · {fmtTs(editPts[0]?.ts)} → {fmtTs(editPts[editPts.length - 1]?.ts)}
                </span>
                {dirty && (
                  <span style={{ fontSize: 9, color: '#F5C300', border: '1px solid #F5C30044', padding: '2px 6px', borderRadius: 2 }}>
                    ● Modificado
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 32, color: '#1e1e1e' }}>⊕</div>
          <div style={{ fontSize: 12, color: '#444' }}>Seleccioná un track de la lista</div>
        </div>
      )}
    </div>
  )
}

// ── Componente Leaflet con vértices editables ─────────────────────────────────
function LeafletTrackEditor({
  pts,
  onVertexMove,
  onDeleteVertex,
}: {
  pts: PuntoTrack[]
  onVertexMove: (idx: number, lat: number, lng: number) => void
  onDeleteVertex: (idx: number) => void
}) {
  const divRef  = useRef<HTMLDivElement>(null)
  const mapRef  = useRef<any>(null)
  const LfRef   = useRef<any>(null)
  const layersRef = useRef<{ line: any; markers: any[]; pks: any[] }>({ line: null, markers: [], pks: [] })

  // ── Inicializar mapa ────────────────────────────────────────────
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
      mapRef.current = map; LfRef.current = Lf
    })()
    return () => {
      destroyed = true
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  }, [])

  // ── Redibujar track cuando cambian los puntos ───────────────────
  useEffect(() => {
    const map = mapRef.current; const Lf = LfRef.current
    if (!map || !Lf || pts.length < 2) return

    // Limpiar capas anteriores
    const { line, markers, pks } = layersRef.current
    if (line) map.removeLayer(line)
    markers.forEach(m => map.removeLayer(m))
    pks.forEach(l => map.removeLayer(l))
    layersRef.current = { line: null, markers: [], pks: [] }

    // Polyline principal
    const newLine = Lf.polyline(pts.map(p => [p.lat, p.lng] as [number, number]), {
      color: '#F5C300', weight: 2.5, opacity: 0.9,
    }).addTo(map)

    // Marcadores de vértice draggables
    const newMarkers: any[] = pts.map((pt, i) => {
      const isFirst = i === 0, isLast = i === pts.length - 1
      const color = isFirst ? '#27ae60' : isLast ? '#e74c3c' : (pt.acc != null && pt.acc > 20) ? '#e67e22' : '#F5C300'
      const r     = isFirst || isLast ? 7 : 4

      const marker = Lf.circleMarker([pt.lat, pt.lng] as [number, number], {
        radius: r, color, fillColor: color, fillOpacity: 0.9, weight: 2, draggable: true,
      }).addTo(map)

      // Tooltip con datos
      marker.bindTooltip(
        `<div style="font-family:monospace;font-size:11px;color:#e0e0e0;background:#0e0e0e;padding:6px 8px;border:1px solid #333;border-radius:3px;line-height:1.6">
          <b>${fmtPK(pt.prog ?? 0)}</b><br/>
          ${pt.lat.toFixed(6)}, ${pt.lng.toFixed(6)}<br/>
          ${pt.alt != null ? `Alt: ${pt.alt.toFixed(0)} m<br/>` : ''}
          ${pt.acc != null ? `±${Math.round(pt.acc)} m` : ''}
        </div>`,
        { permanent: false, direction: 'top', className: 'lf-dark-tip', offset: [0, -6] }
      )

      // Drag para mover el vértice
      marker.on('drag', (e: any) => {
        const { lat, lng } = e.latlng
        const updated = pts.map((p, j) => j === i ? [p.lat, p.lng] : [p.lat, p.lng])
        updated[i] = [lat, lng]
        newLine.setLatLngs(updated as [number, number][])
      })
      marker.on('dragend', (e: any) => {
        onVertexMove(i, e.target.getLatLng().lat, e.target.getLatLng().lng)
      })

      // Clic derecho = eliminar
      marker.on('contextmenu', () => onDeleteVertex(i))

      return marker
    })

    // Etiquetas PK cada ~20 puntos o en inicio/fin
    const step = Math.max(1, Math.floor(pts.length / 8))
    const pkIdxs = Array.from(new Set([0, ...Array.from({ length: 8 }, (_, i) => (i + 1) * step).filter(x => x < pts.length), pts.length - 1]))
    const newPks: any[] = pkIdxs.map(i => {
      const pt = pts[i]
      return Lf.marker([pt.lat, pt.lng] as [number, number], {
        icon: Lf.divIcon({
          className: '',
          html: `<div style="font-family:monospace;font-size:9px;color:#F5C300;background:#0e0e0ecc;padding:1px 4px;border:1px solid #F5C30044;border-radius:2px;white-space:nowrap">${fmtPK(pt.prog ?? 0)}</div>`,
          iconAnchor: [0, 0],
        }),
        interactive: false,
      }).addTo(map)
    })

    layersRef.current = { line: newLine, markers: newMarkers, pks: newPks }

    // Zoom al track
    map.fitBounds(newLine.getBounds(), { padding: [30, 30] })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pts])

  return <div ref={divRef} style={{ width: '100%', height: '100%' }} />
}
