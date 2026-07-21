'use client'
import 'leaflet/dist/leaflet.css'
import { useState, useEffect, useRef, useCallback } from 'react'

// ── Tipos ─────────────────────────────────────────────────────────────────────
type ObraType = 'terraplen' | 'excavacion' | 'ripio' | 'desmalezado' | 'desbosque' | 'canal'
type LatLng   = [number, number]  // [lat, lng]

const OBRA_TYPES: { id: ObraType; label: string; color: string; defaultWidth: number }[] = [
  { id: 'terraplen',   label: 'Terraplén',    color: '#8D6E63', defaultWidth: 20 },
  { id: 'excavacion',  label: 'Excavación',   color: '#FF7043', defaultWidth: 10 },
  { id: 'ripio',       label: 'Ripio',        color: '#90A4AE', defaultWidth: 6  },
  { id: 'desmalezado', label: 'Desmalezado',  color: '#66BB6A', defaultWidth: 5  },
  { id: 'desbosque',   label: 'Desbosque',    color: '#795548', defaultWidth: 15 },
  { id: 'canal',       label: 'Canal',        color: '#29B6F6', defaultWidth: 8  },
]

interface ObraEnPlanta {
  id: string
  type: ObraType
  halfWidth: number
  coords: LatLng[]
  lengthM: number
}

// ── Buffer geométrico sin dependencias ────────────────────────────────────────
// Calcula un polígono buffer alrededor de una polilínea.
// halfWidth en metros. Retorna [lat, lng][] para Leaflet polygon.
function roadBuffer(latLngs: LatLng[], halfWidth: number): LatLng[] {
  if (latLngs.length < 2) return []

  const DEG = Math.PI / 180
  const R   = 6371000  // radio terrestre en metros
  const lat0 = latLngs[0][0]
  const lng0 = latLngs[0][1]
  const cosLat = Math.cos(lat0 * DEG)

  // Proyectar a coordenadas locales en metros (plana aproximada)
  const pts = latLngs.map(([lat, lng]) => ({
    x: (lng - lng0) * cosLat * R * DEG,
    y: (lat - lat0) * R * DEG,
  }))

  const left:  { x: number; y: number }[] = []
  const right: { x: number; y: number }[] = []

  for (let i = 0; i < pts.length; i++) {
    let dx = 0, dy = 0
    if (i > 0)              { dx += pts[i].x - pts[i - 1].x; dy += pts[i].y - pts[i - 1].y }
    if (i < pts.length - 1) { dx += pts[i + 1].x - pts[i].x; dy += pts[i + 1].y - pts[i].y }
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len < 1e-10) {
      // punto duplicado — copiar anterior
      left.push(left.length > 0 ? left[left.length - 1] : pts[i])
      right.push(right.length > 0 ? right[right.length - 1] : pts[i])
      continue
    }
    // Normal perpendicular (izquierda = CCW)
    const nx = -dy / len, ny = dx / len
    left.push({ x: pts[i].x + nx * halfWidth, y: pts[i].y + ny * halfWidth })
    right.push({ x: pts[i].x - nx * halfWidth, y: pts[i].y - ny * halfWidth })
  }

  // Convertir de metros locales de vuelta a lat/lng
  const toLL = (p: { x: number; y: number }): LatLng => [
    lat0 + p.y / (R * DEG),
    lng0 + p.x / (cosLat * R * DEG),
  ]

  return [...left.map(toLL), ...right.reverse().map(toLL)]
}

// Distancia en metros entre dos puntos lat/lng (Haversine)
function segLen(a: LatLng, b: LatLng): number {
  const R = 6371000, DEG = Math.PI / 180
  const dLat = (b[0] - a[0]) * DEG
  const dLng = (b[1] - a[1]) * DEG
  const sinH = Math.sin(dLat / 2)
  const sinW = Math.sin(dLng / 2)
  const c    = sinH * sinH + Math.cos(a[0] * DEG) * Math.cos(b[0] * DEG) * sinW * sinW
  return 2 * R * Math.asin(Math.sqrt(c))
}

function totalLen(coords: LatLng[]): number {
  let d = 0
  for (let i = 1; i < coords.length; i++) d += segLen(coords[i - 1], coords[i])
  return d
}

// ── Estilos ───────────────────────────────────────────────────────────────────
const panel: React.CSSProperties = {
  background: '#0e0e0e', border: '1px solid #1e1e1e', borderRadius: 6, padding: 14,
}
const lbl: React.CSSProperties = {
  fontSize: 12, color: '#555', textTransform: 'uppercase', letterSpacing: 0.8,
  fontFamily: 'monospace', marginBottom: 3, marginTop: 10, display: 'block',
}
const inpStyle: React.CSSProperties = {
  width: '100%', background: '#080808', border: '1px solid #222', color: '#e0e0e0',
  fontFamily: 'monospace', fontSize: 15, padding: '6px 10px', borderRadius: 3,
  outline: 'none', boxSizing: 'border-box',
}

// ── Página ────────────────────────────────────────────────────────────────────
export default function PlantaPage() {
  const mapDivRef  = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef     = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tileRef    = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layersRef  = useRef<Map<string, any[]>>(new Map())

  const [obras,      setObras]      = useState<ObraEnPlanta[]>([])
  const [obraType,   setObraType]   = useState<ObraType>('terraplen')
  const [halfWidth,  setHalfWidth]  = useState(20)
  const [drawing,    setDrawing]    = useState(false)
  const [satellite,  setSatellite]  = useState(true)

  const currentType = OBRA_TYPES.find(t => t.id === obraType)!

  // Sync halfWidth con tipo de obra
  useEffect(() => {
    setHalfWidth(OBRA_TYPES.find(t => t.id === obraType)?.defaultWidth ?? 10)
  }, [obraType])

  // Inicializar mapa
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return
    let mounted = true

    import('leaflet').then(L => {
      if (!mounted || !mapDivRef.current || mapRef.current) return

      const map = L.map(mapDivRef.current, {
        center: [-26.8, -60.4],
        zoom: 14,
        zoomControl: false,
        doubleClickZoom: false,  // lo manejamos nosotros en draw mode
      })
      mapRef.current = map

      tileRef.current = L.tileLayer(
        'https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
        { subdomains: ['0', '1', '2', '3'], maxZoom: 21, maxNativeZoom: 20, attribution: '© Google' }
      ).addTo(map)

      L.control.zoom({ position: 'bottomright' }).addTo(map)
    })

    return () => {
      mounted = false
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  }, [])

  // Cambio de capa base
  useEffect(() => {
    const map = mapRef.current
    if (!map || !tileRef.current) return
    import('leaflet').then(L => {
      map.removeLayer(tileRef.current)
      if (satellite) {
        tileRef.current = L.tileLayer(
          'https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
          { subdomains: ['0', '1', '2', '3'], maxZoom: 21, maxNativeZoom: 20, attribution: '© Google' }
        ).addTo(map)
      } else {
        tileRef.current = L.tileLayer(
          'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
          { maxZoom: 21, maxNativeZoom: 19, attribution: '© OpenStreetMap' }
        ).addTo(map)
      }
    })
  }, [satellite])

  // Modo dibujo
  const startDraw = useCallback(() => {
    const map = mapRef.current
    if (!map || drawing) return
    setDrawing(true)
    map.getContainer().style.cursor = 'crosshair'

    import('leaflet').then(L => {
      const pts: LatLng[] = []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let tempPolyline: any = null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let previewSeg: any   = null
      const color = currentType.color

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const onClick = (e: any) => {
        pts.push([e.latlng.lat, e.latlng.lng])
        if (tempPolyline) map.removeLayer(tempPolyline)
        tempPolyline = L.polyline(pts as [number, number][], {
          color, weight: 2, dashArray: '6 4', opacity: 0.9,
        }).addTo(map)
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const onMouseMove = (e: any) => {
        if (pts.length === 0) return
        if (previewSeg) map.removeLayer(previewSeg)
        previewSeg = L.polyline(
          [pts[pts.length - 1], [e.latlng.lat, e.latlng.lng]] as [number, number][],
          { color, weight: 1, dashArray: '3 6', opacity: 0.45 }
        ).addTo(map)
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const onDblClick = (e: any) => {
        // Leaflet dispara click + dblclick; el último punto viene del dblclick,
        // pero ya fue capturado por onClick — no agregamos otro.
        map.off('click',     onClick)
        map.off('mousemove', onMouseMove)
        map.off('dblclick',  onDblClick)
        map.getContainer().style.cursor = ''

        if (previewSeg)   map.removeLayer(previewSeg)
        if (tempPolyline) map.removeLayer(tempPolyline)

        if (pts.length < 2) { setDrawing(false); return }

        // Construir obra
        const id = `obra-${Date.now()}`
        const len = totalLen(pts)
        const bufRing = roadBuffer(pts, halfWidth)

        // Polígono buffer
        const polygon = L.polygon(bufRing as [number, number][], {
          color,
          fillColor: color,
          fillOpacity: 0.22,
          weight: 2,
          opacity: 0.85,
        }).addTo(map)

        // Línea de eje
        const centerLine = L.polyline(pts as [number, number][], {
          color,
          weight: 2,
          opacity: 0.9,
          dashArray: '7 4',
        }).addTo(map)

        // Tooltip sobre polígono
        polygon.bindTooltip(
          `<span style="font-family:monospace;font-size:11px;color:${color}">${currentType.label}</span>` +
          `<br><span style="font-size:10px;color:#aaa">±${halfWidth} m · ${(len / 1000).toFixed(2)} km</span>`,
          { permanent: false, sticky: true }
        )

        layersRef.current.set(id, [polygon, centerLine])

        setObras(prev => [...prev, {
          id, type: obraType, halfWidth, coords: [...pts], lengthM: len,
        }])
        setDrawing(false)
      }

      map.on('click',     onClick)
      map.on('mousemove', onMouseMove)
      map.on('dblclick',  onDblClick)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing, obraType, halfWidth, currentType])

  const removeObra = useCallback((id: string) => {
    const map = mapRef.current
    if (!map) return
    layersRef.current.get(id)?.forEach((l: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.removeLayer(l as any)
    })
    layersRef.current.delete(id)
    setObras(prev => prev.filter(o => o.id !== id))
  }, [])

  const clearAll = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    layersRef.current.forEach(layers => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      layers.forEach((l: any) => map.removeLayer(l))
    })
    layersRef.current.clear()
    setObras([])
  }, [])

  return (
    <div style={{
      height: 'calc(100vh - 32px)', display: 'flex', flexDirection: 'column',
      padding: '10px 16px 8px', overflow: 'hidden', boxSizing: 'border-box',
      fontFamily: 'monospace', color: '#e0e0e0',
    }}>
      {/* Header compacto */}
      <div style={{ flexShrink: 0, marginBottom: 8 }}>
        <span style={{ fontSize: 9, color: '#444', letterSpacing: 1.5, textTransform: 'uppercase', marginRight: 8 }}>
          Obras · Etapa 2
        </span>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#e0e0e0' }}>Vista en Planta</span>
      </div>

      {/* Layout principal */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 10 }}>

        {/* Panel izquierdo — controles */}
        <div style={{
          ...panel,
          width: 220, flexShrink: 0,
          display: 'flex', flexDirection: 'column', gap: 0,
          overflowY: 'auto', minHeight: 0,
        }}>
          {/* Tipo de obra */}
          <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8 }}>
            Tipo de obra
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {OBRA_TYPES.map(t => (
              <button key={t.id} onClick={() => setObraType(t.id)}
                style={{
                  padding: '6px 10px', fontSize: 11, fontFamily: 'monospace',
                  cursor: 'pointer', borderRadius: 3, textAlign: 'left',
                  border: `1px solid ${obraType === t.id ? t.color : '#1e1e1e'}`,
                  background: obraType === t.id ? `${t.color}18` : 'transparent',
                  color: obraType === t.id ? t.color : '#555',
                  display: 'flex', alignItems: 'center', gap: 8,
                  transition: 'border-color 0.15s, color 0.15s, background 0.15s',
                }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: t.color, flexShrink: 0 }} />
                {t.label}
              </button>
            ))}
          </div>

          {/* Semiancho */}
          <div style={{ marginTop: 14 }}>
            <span style={lbl}>Semiancho (m)</span>
            <input type="number" min={1} step={1} value={halfWidth}
              onChange={e => { const v = Number(e.target.value); if (v > 0) setHalfWidth(v) }}
              style={inpStyle} />
            <div style={{ fontSize: 9, color: '#333', fontFamily: 'monospace', marginTop: 4 }}>
              Ancho total: {halfWidth * 2} m
            </div>
          </div>

          {/* Botón dibujar */}
          <button
            onClick={drawing ? undefined : startDraw}
            style={{
              marginTop: 14, padding: '10px', fontSize: 12, fontFamily: 'monospace',
              cursor: drawing ? 'not-allowed' : 'pointer', borderRadius: 3, fontWeight: 700,
              border: `1px solid ${drawing ? '#333' : currentType.color}`,
              background: drawing ? '#111' : `${currentType.color}22`,
              color: drawing ? '#444' : currentType.color,
              transition: 'all 0.15s',
            }}>
            {drawing ? '⏳ Dibujando…' : '✏ Dibujar alineamiento'}
          </button>
          {drawing && (
            <div style={{ fontSize: 9, color: '#555', fontFamily: 'monospace', marginTop: 6, lineHeight: 1.7 }}>
              Clic → agregar punto<br />
              Doble clic → finalizar
            </div>
          )}

          {/* Capa base */}
          <div style={{ marginTop: 14 }}>
            <span style={lbl}>Capa base</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {[{ v: true, label: 'Satélite' }, { v: false, label: 'OSM' }].map(({ v, label }) => (
                <button key={label} onClick={() => setSatellite(v)}
                  style={{
                    flex: 1, padding: '5px', fontSize: 10, fontFamily: 'monospace',
                    cursor: 'pointer', borderRadius: 3,
                    border: `1px solid ${satellite === v ? '#F5C300' : '#222'}`,
                    background: satellite === v ? '#F5C30018' : 'transparent',
                    color: satellite === v ? '#F5C300' : '#555',
                  }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Lista de obras dibujadas */}
          {obras.length > 0 && (
            <>
              <div style={{ height: 1, background: '#1e1e1e', margin: '14px 0 10px' }} />
              <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 }}>
                Obras ({obras.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {obras.map(o => {
                  const t = OBRA_TYPES.find(x => x.id === o.type)!
                  return (
                    <div key={o.id} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '6px 8px', background: '#080808',
                      border: `1px solid ${t.color}33`, borderRadius: 3,
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: 1, background: t.color, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 10, color: t.color, fontFamily: 'monospace', fontWeight: 700 }}>
                          {t.label}
                        </div>
                        <div style={{ fontSize: 9, color: '#444', fontFamily: 'monospace', lineHeight: 1.5 }}>
                          ±{o.halfWidth} m · {(o.lengthM / 1000).toFixed(2)} km
                        </div>
                      </div>
                      <button onClick={() => removeObra(o.id)}
                        title="Eliminar"
                        style={{ background: 'transparent', border: 'none', color: '#333', cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1 }}>
                        ×
                      </button>
                    </div>
                  )
                })}
              </div>
              <button onClick={clearAll}
                style={{
                  marginTop: 8, padding: '6px', fontSize: 10, fontFamily: 'monospace',
                  cursor: 'pointer', borderRadius: 3,
                  border: '1px solid #222', background: 'transparent', color: '#444',
                }}>
                Limpiar todo
              </button>
            </>
          )}
        </div>

        {/* Mapa */}
        <div style={{
          flex: 1, minWidth: 0,
          borderRadius: 6, overflow: 'hidden',
          border: '1px solid #1e1e1e',
          position: 'relative',
        }}>
          <div ref={mapDivRef} style={{ width: '100%', height: '100%' }} />

          {/* Banner modo dibujo */}
          {drawing && (
            <div style={{
              position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
              zIndex: 1000, background: 'rgba(10,10,10,0.88)',
              border: `1px solid ${currentType.color}`,
              borderRadius: 4, padding: '7px 16px',
              fontSize: 11, fontFamily: 'monospace', color: currentType.color,
              pointerEvents: 'none', whiteSpace: 'nowrap',
            }}>
              {currentType.label} · ±{halfWidth} m · Doble clic para finalizar
            </div>
          )}

          {/* Leyenda de obras en el mapa */}
          {obras.length > 0 && !drawing && (
            <div style={{
              position: 'absolute', bottom: 36, left: 10, zIndex: 999,
              background: 'rgba(10,10,10,0.82)', border: '1px solid #1e1e1e',
              borderRadius: 4, padding: '8px 10px',
              fontSize: 10, fontFamily: 'monospace', lineHeight: 1.8,
            }}>
              {obras.map(o => {
                const t = OBRA_TYPES.find(x => x.id === o.type)!
                return (
                  <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 6, color: t.color }}>
                    <span style={{ width: 16, height: 3, background: t.color, display: 'inline-block', borderRadius: 1 }} />
                    {t.label} — {(o.lengthM / 1000).toFixed(2)} km · {o.halfWidth * 2} m ancho
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
