'use client'
import 'leaflet/dist/leaflet.css'
import { useState, useEffect, useRef, useCallback } from 'react'

// ── Tipos ─────────────────────────────────────────────────────────────────────
type LatLng   = [number, number]
type MonteKey = 'ralo' | 'semitupido' | 'tupido'

const MONTE_OPTS: { value: MonteKey; label: string; factor: number }[] = [
  { value: 'ralo',       label: 'Ralo — <40%',        factor: 50  },
  { value: 'semitupido', label: 'Semi-tupido 40-70%',  factor: 150 },
  { value: 'tupido',     label: 'Tupido — >70%',       factor: 400 },
]

// ── Funciones geodéticas ──────────────────────────────────────────────────────
function segLen(a: LatLng, b: LatLng): number {
  const R = 6371000, DEG = Math.PI / 180
  const dLat = (b[0] - a[0]) * DEG, dLng = (b[1] - a[1]) * DEG
  const sh = Math.sin(dLat / 2), sw = Math.sin(dLng / 2)
  return 2 * R * Math.asin(Math.sqrt(sh * sh + Math.cos(a[0] * DEG) * Math.cos(b[0] * DEG) * sw * sw))
}
function totalLen(pts: LatLng[]): number {
  let d = 0; for (let i = 1; i < pts.length; i++) d += segLen(pts[i - 1], pts[i]); return d
}
function polygonAreaHa(pts: LatLng[]): number {
  if (pts.length < 3) return 0
  const DEG = Math.PI / 180, R = 6371000
  let area = 0
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length
    const [lat1, lng1] = pts[i], [lat2, lng2] = pts[j]
    area += (lng2 - lng1) * DEG * (2 + Math.sin(lat1 * DEG) + Math.sin(lat2 * DEG))
  }
  return Math.abs(area * R * R / 2) / 10000
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  color: string
  onConfirm: (side: 'izq' | 'der', monte: MonteKey, area_ha: number) => void
  onCancel?: () => void
}

// ── Componente ────────────────────────────────────────────────────────────────
export default function InlineMapDraw({ color, onConfirm, onCancel }: Props) {
  const [side,       setSide]       = useState<'izq' | 'der'>('izq')
  const [monte,      setMonte]      = useState<MonteKey>('semitupido')
  const [drawing,    setDrawing]    = useState(false)
  const [polyResult, setPolyResult] = useState<{ area_ha: number; pts: LatLng[] } | null>(null)
  const [polyHUD,    setPolyHUD]    = useState<{
    vertices: number; perimM: number; areaHa: number; lastSegM: number
  } | null>(null)
  const [hudUnit,  setHudUnit]  = useState<'ha' | 'm2' | 'km2'>('ha')
  const [mapReady, setMapReady] = useState(false)
  const [basemap,  setBasemap]  = useState<'osm' | 'sat'>('osm')

  const mapDivRef    = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef       = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LfRef        = useRef<any>(null)
  const drawStateRef = useRef<{ pts: LatLng[]; cleanup: () => void } | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const previewRef   = useRef<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const osmLayerRef  = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const satLayerRef  = useRef<any>(null)

  // ── Inicializar mapa ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapDivRef.current) return
    let destroyed = false
    ;(async () => {
      const Lf = (await import('leaflet')).default
      if (destroyed || !mapDivRef.current) return
      const savedC = sessionStorage.getItem('planta_mapCenter')
      const savedZ = sessionStorage.getItem('planta_mapZoom')
      const center: [number, number] = savedC ? JSON.parse(savedC) : [-26.5, -60.5]
      const zoom   = savedZ ? parseInt(savedZ) : 7

      const map = Lf.map(mapDivRef.current, {
        center, zoom, zoomControl: true, attributionControl: false,
      })
      const osmLayer = Lf.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 })
      const satLayer = Lf.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      })
      osmLayer.addTo(map)
      osmLayerRef.current = osmLayer
      satLayerRef.current = satLayer
      map.on('moveend', () => {
        const c = map.getCenter()
        sessionStorage.setItem('planta_mapCenter', JSON.stringify([c.lat, c.lng]))
        sessionStorage.setItem('planta_mapZoom', String(map.getZoom()))
      })
      mapRef.current = map
      LfRef.current  = Lf
      setMapReady(true)
    })()
    return () => {
      destroyed = true
      drawStateRef.current?.cleanup()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      previewRef.current.forEach((l: any) => mapRef.current?.removeLayer(l))
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
      LfRef.current = null
    }
  }, [])

  // ── Cambio de capa base ───────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    const osm = osmLayerRef.current
    const sat = satLayerRef.current
    if (!map || !osm || !sat) return
    if (basemap === 'sat') { map.removeLayer(osm); sat.addTo(map) }
    else                   { map.removeLayer(sat); osm.addTo(map) }
  }, [basemap])

  // ── Iniciar dibujo de polígono ────────────────────────────────────────────
  const startDraw = useCallback(() => {
    const map = mapRef.current; const Lf = LfRef.current
    if (!map || !Lf || drawing) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    previewRef.current.forEach((l: any) => map.removeLayer(l)); previewRef.current = []
    setPolyResult(null); setDrawing(true); setPolyHUD(null)
    map.getContainer().style.cursor = 'crosshair'

    const pts: LatLng[] = []

    // Capas persistentes (se actualizan via setLatLngs — sin remove+recreate)
    const committedLine = Lf.polyline([], { color, weight: 2.5, opacity: 0.95 }).addTo(map)
    const previewSeg    = Lf.polyline([], { color, weight: 1.5, dashArray: '8 5', opacity: 0.55 }).addTo(map)
    const closeSeg      = Lf.polyline([], { color, weight: 1,   dashArray: '3 8', opacity: 0.25 }).addTo(map)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vmList: any[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let snapRing: any = null, snapping = false

    const cleanup = () => {
      map.off('click',       onPolyClick)
      map.off('mousemove',   onPolyMove)
      map.off('contextmenu', onPolyRight)
      map.removeLayer(committedLine)
      map.removeLayer(previewSeg)
      map.removeLayer(closeSeg)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (snapRing) { map.removeLayer(snapRing); snapRing = null }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vmList.forEach((m: any) => map.removeLayer(m)); vmList.length = 0
      map.getContainer().style.cursor = ''
      drawStateRef.current = null
      setPolyHUD(null)
    }

    const redraw = (cursor?: LatLng) => {
      committedLine.setLatLngs(pts.length >= 2 ? pts as [number, number][] : [])
      if (cursor && pts.length >= 1) {
        previewSeg.setLatLngs([[pts[pts.length - 1], cursor] as [number, number][]])
      } else {
        previewSeg.setLatLngs([])
      }
      if (cursor && pts.length >= 3) {
        closeSeg.setLatLngs([[cursor, pts[0]] as [number, number][]])
        closeSeg.setStyle({ opacity: snapping ? 0.85 : 0.22 })
      } else {
        closeSeg.setLatLngs([])
      }
      if (snapRing) { map.removeLayer(snapRing); snapRing = null }
      if (snapping && pts.length >= 3) {
        snapRing = Lf.circleMarker(pts[0] as [number, number], {
          radius: 10, color, fillColor: '#fff', fillOpacity: 0.85, weight: 2.5, opacity: 1,
        }).addTo(map)
      }
    }

    const updateHUD = (cursor?: LatLng) => {
      if (!pts.length) return
      const all = cursor ? [...pts, cursor] : pts
      setPolyHUD({
        vertices: pts.length,
        perimM:   totalLen(all) + (all.length >= 3 ? segLen(all[all.length - 1], all[0]) : 0),
        areaHa:   polygonAreaHa(all),
        lastSegM: pts.length >= 1 && cursor ? segLen(pts[pts.length - 1], cursor) : 0,
      })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onPolyClick = (e: any) => {
      if (snapping && pts.length >= 3) { onPolyRight(e); return }
      const ll: LatLng = [e.latlng.lat, e.latlng.lng]
      pts.push(ll)
      const isFirst = pts.length === 1
      const vm = Lf.circleMarker(ll as [number, number], {
        radius: isFirst ? 6 : 4, color,
        fillColor: isFirst ? '#fff' : color,
        fillOpacity: isFirst ? 0.9 : 0.85,
        weight: isFirst ? 2 : 1.5, opacity: 1,
      }).addTo(map)
      vmList.push(vm)
      redraw(); updateHUD()
      drawStateRef.current = { pts: [...pts], cleanup }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onPolyMove = (e: any) => {
      if (!pts.length) return
      let cursor: LatLng = [e.latlng.lat, e.latlng.lng]
      snapping = false
      if (pts.length >= 3) {
        const p0 = map.latLngToLayerPoint(Lf.latLng(pts[0][0], pts[0][1]))
        const cp = map.latLngToLayerPoint(e.latlng)
        if (Math.hypot(p0.x - cp.x, p0.y - cp.y) < 18) { cursor = [pts[0][0], pts[0][1]]; snapping = true }
      }
      map.getContainer().style.cursor = snapping ? 'cell' : 'crosshair'
      redraw(cursor); updateHUD(cursor)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onPolyRight = (e: any) => {
      if (e?.originalEvent) e.originalEvent.preventDefault()
      if (pts.length < 3) return
      cleanup(); setDrawing(false)
      const area_ha = polygonAreaHa(pts)
      const poly = Lf.polygon(pts as [number, number][], {
        color, fillColor: color, fillOpacity: 0.4, weight: 2, opacity: 0.9,
      }).addTo(map)
      previewRef.current = [poly]
      setPolyResult({ area_ha, pts })
    }

    drawStateRef.current = { pts, cleanup }
    map.on('click',       onPolyClick)
    map.on('mousemove',   onPolyMove)
    map.on('contextmenu', onPolyRight)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing, color])

  const cancelDraw = useCallback(() => {
    drawStateRef.current?.cleanup(); setDrawing(false); setPolyResult(null); setPolyHUD(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    previewRef.current.forEach((l: any) => mapRef.current?.removeLayer(l)); previewRef.current = []
  }, [])

  // ── Helpers de formato ────────────────────────────────────────────────────
  const monteOpt = MONTE_OPTS.find(o => o.value === monte)!
  const fmtArea  = (ha: number) => {
    if (hudUnit === 'm2')  return `${Math.round(ha * 10000).toLocaleString('es-AR')} m²`
    if (hudUnit === 'km2') return `${(ha / 100).toFixed(6)} km²`
    return `${ha.toFixed(4)} ha`
  }
  const fmtDist = (m: number) => m >= 1000 ? `${(m / 1000).toFixed(3)} km` : `${Math.round(m)} m`

  // ── Estilos base ─────────────────────────────────────────────────────────
  const mono: React.CSSProperties = { fontFamily: 'monospace' }
  const toolBtn = (active?: boolean): React.CSSProperties => ({
    padding: '4px 10px', fontSize: 10, ...mono, cursor: 'pointer', borderRadius: 2,
    border: `1px solid ${active ? color + '99' : '#252525'}`,
    background: active ? `${color}1a` : '#0c0c0c',
    color: active ? color : '#555',
  })

  const hudArea = polyHUD ? polyHUD.areaHa : polyResult?.area_ha ?? 0
  const showHUD = !!(polyHUD || polyResult)

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
        background: '#080808', borderBottom: '1px solid #1a1a1a', flexShrink: 0, flexWrap: 'wrap',
      }}>
        {/* Lado */}
        <span style={{ fontSize: 9, color: '#444', ...mono, textTransform: 'uppercase', letterSpacing: 0.8 }}>Lado</span>
        {(['izq', 'der'] as const).map(s => (
          <button key={s} disabled={drawing} onClick={() => setSide(s)} style={toolBtn(side === s)}>
            {s === 'izq' ? '← Izq.' : 'Der. →'}
          </button>
        ))}

        <div style={{ width: 1, height: 14, background: '#1e1e1e', margin: '0 2px' }} />

        {/* Monte */}
        <span style={{ fontSize: 9, color: '#444', ...mono, textTransform: 'uppercase', letterSpacing: 0.8 }}>Monte</span>
        <select value={monte} disabled={drawing} onChange={e => setMonte(e.target.value as MonteKey)}
          style={{ background: '#0a0a0a', border: '1px solid #222', color: '#888', ...mono, fontSize: 9, padding: '3px 6px', outline: 'none', borderRadius: 2 }}>
          {MONTE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <div style={{ flex: 1 }} />

        {/* Controles de dibujo */}
        {!drawing && !polyResult && mapReady && (
          <button onClick={startDraw} style={{
            ...toolBtn(), color, borderColor: `${color}66`,
            background: `${color}15`, padding: '5px 16px', fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
          }}>
            ◎ Dibujar polígono
          </button>
        )}
        {drawing && (
          <>
            <span style={{ fontSize: 9, color: `${color}cc`, ...mono }}>
              ● Clic para agregar vértice · Clic derecho para cerrar
            </span>
            <button onClick={cancelDraw} style={{ ...toolBtn(), color: '#555' }}>✕ Cancelar</button>
          </>
        )}
        {polyResult && (
          <>
            <span style={{ fontSize: 10, color: '#888', ...mono }}>
              {polyResult.area_ha.toFixed(4)} ha · ~{Math.round(polyResult.area_ha * monteOpt.factor).toLocaleString('es-AR')} m³ arb.
            </span>
            <button onClick={cancelDraw} style={{ ...toolBtn(), color: '#555' }}>↺ Redibujar</button>
            <button onClick={() => onConfirm(side, monte, polyResult.area_ha)} style={{
              ...toolBtn(true), padding: '5px 16px', fontSize: 11, fontWeight: 700,
            }}>
              ✓ Usar → Lado {side.toUpperCase()}
            </button>
          </>
        )}

        <div style={{ flex: 1 }} />
        {/* Toggle capa base */}
        <div style={{ display: 'flex', gap: 2 }}>
          <button onClick={() => setBasemap('osm')} style={{ ...toolBtn(basemap === 'osm'), fontSize: 9 }}>OSM</button>
          <button onClick={() => setBasemap('sat')} style={{ ...toolBtn(basemap === 'sat'), fontSize: 9 }}>Satélite</button>
        </div>
        {onCancel && <button onClick={onCancel} style={{ ...toolBtn(), color: '#444', fontSize: 9 }}>✕ Cerrar mapa</button>}
      </div>

      {/* ── Mapa ── */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <div ref={mapDivRef} style={{ width: '100%', height: '100%' }} />

        {/* HUD en tiempo real */}
        {showHUD && (
          <div style={{
            position: 'absolute', bottom: 12, left: 12, zIndex: 999,
            background: '#0a0a0aee', border: `1px solid ${color}55`,
            borderRadius: 4, padding: '8px 12px', ...mono,
            fontSize: 10, lineHeight: 1.8, color: '#888', minWidth: 200,
          }}>
            <div style={{ fontSize: 8, color: '#444', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
              Geometría en tiempo real
            </div>
            {polyHUD && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                  <span style={{ color: '#555' }}>Vértices</span>
                  <span style={{ color: '#aaa' }}>{polyHUD.vertices}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                  <span style={{ color: '#555' }}>Últ. segmento</span>
                  <span>{fmtDist(polyHUD.lastSegM)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                  <span style={{ color: '#555' }}>Perímetro</span>
                  <span>{fmtDist(polyHUD.perimM)}</span>
                </div>
              </>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginTop: 4, paddingTop: 4, borderTop: `1px solid ${color}33` }}>
              <span style={{ color }}>Área</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color, fontWeight: 700, fontSize: 12 }}>{fmtArea(hudArea)}</span>
                <select value={hudUnit} onChange={e => setHudUnit(e.target.value as 'ha' | 'm2' | 'km2')}
                  style={{ fontSize: 8, background: '#000', border: `1px solid ${color}33`, color: '#555', outline: 'none', padding: '1px 2px' }}>
                  <option value="ha">ha</option>
                  <option value="m2">m²</option>
                  <option value="km2">km²</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <span style={{ color: '#444' }}>Vol. arb. ({monteOpt.value})</span>
              <span style={{ color: '#666' }}>~{Math.round(hudArea * monteOpt.factor).toLocaleString('es-AR')} m³</span>
            </div>
          </div>
        )}

        {/* Instrucciones iniciales */}
        {!drawing && !polyResult && mapReady && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            zIndex: 998, textAlign: 'center', pointerEvents: 'none',
          }}>
            <div style={{ background: '#0a0a0acc', border: `1px solid ${color}33`, borderRadius: 4, padding: '10px 18px', ...mono, fontSize: 10, color: '#444' }}>
              Seleccioná lado y tipo de monte<br />
              luego presioná <span style={{ color }}>◎ Dibujar polígono</span>
            </div>
          </div>
        )}
        {!mapReady && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 997,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#0e0e0e', ...mono, fontSize: 11, color: '#333',
          }}>
            Cargando mapa…
          </div>
        )}
      </div>
    </div>
  )
}
