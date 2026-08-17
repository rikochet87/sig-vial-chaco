'use client'
import 'leaflet/dist/leaflet.css'
import { useState, useEffect, useRef, useCallback } from 'react'

// ── Tipos ─────────────────────────────────────────────────────────────────────
export type LatLng = [number, number]

export interface RipioTramo {
  id: string
  nombre: string
  an: number
  e: number
  rho: number
  l_m: number
  coords: LatLng[] | null
  empresa: string
  fecha_ejecucion: string | null
  precio_unitario: number
  orden: number
  color: string | null   // color personalizado; null = usar paleta automática
}

interface Props {
  ripios:      RipioTramo[]
  selectedId:  string | null
  drawingId:   string | null          // ripio en modo dibujo activo
  color:       string
  onLineDraw:  (id: string, lengthM: number, coords: LatLng[]) => void
  onDrawEnd:   () => void
}

// ── Geometría ──────────────────────────────────────────────────────────────────
function segLen(a: LatLng, b: LatLng): number {
  const R = 6371000, DEG = Math.PI / 180
  const dLat = (b[0]-a[0])*DEG, dLng = (b[1]-a[1])*DEG
  const sh = Math.sin(dLat/2), sw = Math.sin(dLng/2)
  return 2*R*Math.asin(Math.sqrt(sh*sh + Math.cos(a[0]*DEG)*Math.cos(b[0]*DEG)*sw*sw))
}
function totalLen(pts: LatLng[]): number {
  let d = 0; for (let i = 1; i < pts.length; i++) d += segLen(pts[i-1], pts[i]); return d
}

function roadBuffer(latLngs: LatLng[], halfWidth: number): LatLng[] {
  if (latLngs.length < 2 || halfWidth <= 0) return []
  const DEG = Math.PI / 180, R = 6371000
  const lat0 = latLngs[0][0], lng0 = latLngs[0][1]
  const cosLat = Math.cos(lat0 * DEG)
  const pts = latLngs.map(([lat, lng]) => ({
    x: (lng - lng0) * cosLat * R * DEG,
    y: (lat - lat0) * R * DEG,
  }))
  const left:  { x: number; y: number }[] = []
  const right: { x: number; y: number }[] = []
  for (let i = 0; i < pts.length; i++) {
    let dx = 0, dy = 0
    if (i > 0)              { dx += pts[i].x - pts[i-1].x; dy += pts[i].y - pts[i-1].y }
    if (i < pts.length - 1) { dx += pts[i+1].x - pts[i].x; dy += pts[i+1].y - pts[i].y }
    const len = Math.sqrt(dx*dx + dy*dy)
    if (len < 1e-10) {
      left.push(left.length   > 0 ? left[left.length - 1]   : pts[i])
      right.push(right.length > 0 ? right[right.length - 1] : pts[i])
      continue
    }
    const nx = -dy/len, ny = dx/len
    left.push({ x: pts[i].x + nx * halfWidth, y: pts[i].y + ny * halfWidth })
    right.push({ x: pts[i].x - nx * halfWidth, y: pts[i].y - ny * halfWidth })
  }
  const toLL = (p: { x: number; y: number }): LatLng => [
    lat0 + p.y / (R * DEG),
    lng0 + p.x / (cosLat * R * DEG),
  ]
  return [...left.map(toLL), ...right.reverse().map(toLL)]
}

// Paleta de colores por índice (para distinguir ripios en el mapa)
export const PALETTE = [
  '#90A4AE','#80CBC4','#FFB74D','#EF9A9A','#A5D6A7',
  '#CE93D8','#80DEEA','#FFCC02','#F48FB1','#BCAAA4',
]
function ripioColor(orden: number): string {
  return PALETTE[orden % PALETTE.length]
}

// ── Componente ────────────────────────────────────────────────────────────────
export default function RipioMapPanel({
  ripios, selectedId, drawingId, color, onLineDraw, onDrawEnd,
}: Props) {
  const mapDivRef  = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef     = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LfRef      = useRef<any>(null)
  const [mapReady, setMapReady] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ripioLayersRef = useRef<Map<string, any[]>>(new Map())
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const drawStateRef   = useRef<{ pts: LatLng[]; cleanup: () => void } | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const previewLayersRef = useRef<any[]>([])
  const ripiosRef = useRef(ripios)
  const drawingIdRef = useRef(drawingId)
  const colorRef = useRef(color)
  useEffect(() => { ripiosRef.current = ripios }, [ripios])
  useEffect(() => { drawingIdRef.current = drawingId }, [drawingId])
  useEffect(() => { colorRef.current = color }, [color])

  // ── Inicializar mapa ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return
    let mounted = true
    import('leaflet').then(Lf => {
      if (!mounted || !mapDivRef.current || mapRef.current) return
      LfRef.current = Lf
      const savedC = sessionStorage.getItem('ripio_mapCenter')
      const savedZ = sessionStorage.getItem('ripio_mapZoom')
      const center: [number,number] = savedC ? JSON.parse(savedC) : [-26.5, -60.5]
      const zoom = savedZ ? parseInt(savedZ) : 8

      const map = Lf.map(mapDivRef.current, {
        center, zoom, zoomControl: false, doubleClickZoom: false,
      })
      mapRef.current = map

      // Capas base
      const satellite = Lf.tileLayer('https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        subdomains: ['0','1','2','3'], maxZoom: 21, maxNativeZoom: 20, attribution: '© Google',
      })
      const osm = Lf.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '© OpenStreetMap',
      })
      const hybrid = Lf.tileLayer('https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        subdomains: ['0','1','2','3'], maxZoom: 21, maxNativeZoom: 20, attribution: '© Google',
      })

      satellite.addTo(map)

      Lf.control.layers(
        { 'Satélite': satellite, 'Satélite + etiquetas': hybrid, 'OpenStreetMap': osm },
        {},
        { position: 'topright', collapsed: true }
      ).addTo(map)

      Lf.control.zoom({ position: 'bottomright' }).addTo(map)
      map.on('moveend', () => {
        const c = map.getCenter()
        sessionStorage.setItem('ripio_mapCenter', JSON.stringify([c.lat, c.lng]))
        sessionStorage.setItem('ripio_mapZoom', String(map.getZoom()))
      })
      setMapReady(true)
    })
    return () => {
      mounted = false
      drawStateRef.current?.cleanup()
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
      LfRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ResizeObserver → invalidateSize
  useEffect(() => {
    if (!mapReady) return
    const el = mapDivRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      if (mapRef.current) mapRef.current.invalidateSize({ animate: false })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [mapReady])

  // ── Renderizar capas de ripios (coordenadas) ──────────────────────────────
  useEffect(() => {
    const map = mapRef.current, Lf = LfRef.current
    if (!map || !Lf || !mapReady) return

    // Quitar capas viejas
    ripioLayersRef.current.forEach(layers => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      layers.forEach((l: any) => map.removeLayer(l))
    })
    ripioLayersRef.current.clear()

    ripios.forEach((r) => {
      if (!r.coords || r.coords.length < 2) return
      const clr = r.color ?? ripioColor(r.orden)
      const hw  = r.an / 2
      const layers = []

      // Buffer de calzada
      const bufRing = roadBuffer(r.coords, hw)
      if (bufRing.length > 0) {
        const poly = Lf.polygon(bufRing as [number,number][], {
          color: clr, fillColor: clr,
          fillOpacity: r.id === selectedId ? 0.45 : 0.25,
          weight: r.id === selectedId ? 2 : 1, opacity: 0.9,
        }).addTo(map)
        layers.push(poly)
      }

      // Línea central
      const line = Lf.polyline(r.coords as [number,number][], {
        color: clr, weight: r.id === selectedId ? 4 : 2.5,
        opacity: r.id === selectedId ? 1 : 0.75, dashArray: '8 4',
      }).addTo(map)

      const fmtL = (m: number) => m >= 1000 ? `${(m/1000).toFixed(2)} km` : `${Math.round(m)} m`
      line.bindTooltip(
        `<div style="font-family:monospace;font-size:10px">` +
        `<span style="color:${clr};font-weight:700">${r.nombre}</span>` +
        `<br><span style="color:#aaa">${fmtL(r.l_m)} · ${r.an}m ancho</span>` +
        `</div>`,
        { sticky: true, direction: 'top' }
      )
      layers.push(line)
      ripioLayersRef.current.set(r.id, layers)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ripios, selectedId, mapReady])

  // ── Modo dibujo ───────────────────────────────────────────────────────────
  const startDraw = useCallback((ripioId: string) => {
    const map = mapRef.current, Lf = LfRef.current
    if (!map || !Lf) return

    // Limpiar preview anterior
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    previewLayersRef.current.forEach((l: any) => map.removeLayer(l))
    previewLayersRef.current = []
    drawStateRef.current?.cleanup()

    const ripio = ripiosRef.current.find(r => r.id === ripioId)
    const clr = ripio ? (ripio.color ?? ripioColor(ripio.orden)) : colorRef.current
    const hw  = ripio ? ripio.an / 2 : 3

    map.getContainer().style.cursor = 'crosshair'
    const pts: LatLng[] = []
    const committedLine = Lf.polyline([], { color: clr, weight: 3, opacity: 0.95 }).addTo(map)
    const previewSeg    = Lf.polyline([], { color: clr, weight: 2, dashArray: '8 5', opacity: 0.5 }).addTo(map)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vmList: any[] = []

    const cleanup = () => {
      map.off('click',       onLineClick)
      map.off('mousemove',   onLineMove)
      map.off('contextmenu', onLineRight)
      map.removeLayer(committedLine)
      map.removeLayer(previewSeg)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vmList.forEach((m: any) => map.removeLayer(m)); vmList.length = 0
      map.getContainer().style.cursor = ''
      drawStateRef.current = null
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onLineClick = (e: any) => {
      const ll: LatLng = [e.latlng.lat, e.latlng.lng]
      pts.push(ll)
      const isFirst = pts.length === 1
      const vm = Lf.circleMarker(ll as [number,number], {
        radius: isFirst ? 6 : 4, color: clr,
        fillColor: isFirst ? '#fff' : clr,
        fillOpacity: isFirst ? 0.9 : 0.85,
        weight: isFirst ? 2 : 1.5, opacity: 1,
      }).addTo(map)
      vmList.push(vm)
      committedLine.setLatLngs(pts as [number,number][])
      drawStateRef.current = { pts: [...pts], cleanup }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onLineMove = (e: any) => {
      if (!pts.length) return
      const cursor: LatLng = [e.latlng.lat, e.latlng.lng]
      previewSeg.setLatLngs([[pts[pts.length-1], cursor] as [number,number][]])
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onLineRight = (e: any) => {
      if (e?.originalEvent) e.originalEvent.preventDefault()
      if (pts.length < 2) return
      cleanup()

      const lengthM = totalLen(pts)

      // Mostrar preview del buffer
      const preview = []
      const bufRing = roadBuffer(pts, hw)
      if (bufRing.length > 0) {
        const poly = Lf.polygon(bufRing as [number,number][], {
          color: clr, fillColor: clr, fillOpacity: 0.4, weight: 2, opacity: 0.9,
        }).addTo(map)
        preview.push(poly)
      }
      const line = Lf.polyline(pts as [number,number][], {
        color: clr, weight: 3, opacity: 1, dashArray: '8 4',
      }).addTo(map)
      preview.push(line)
      previewLayersRef.current = preview

      onLineDraw(ripioId, lengthM, pts)
      onDrawEnd()
    }

    drawStateRef.current = { pts, cleanup }
    map.on('click',       onLineClick)
    map.on('mousemove',   onLineMove)
    map.on('contextmenu', onLineRight)
  }, [onLineDraw, onDrawEnd])

  // Activar dibujo cuando drawingId cambia
  useEffect(() => {
    if (!mapReady) return
    if (drawingId) {
      startDraw(drawingId)
    } else {
      drawStateRef.current?.cleanup()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      previewLayersRef.current.forEach((l: any) => mapRef.current?.removeLayer(l))
      previewLayersRef.current = []
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawingId, mapReady])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <style>{`
        .leaflet-container { outline: none !important; }
        .leaflet-tooltip {
          background: rgba(10,10,10,0.9); border: 1px solid #2a2a2a;
          color: #ccc; font-family: monospace; font-size: 11px;
          padding: 4px 8px; border-radius: 0; box-shadow: none;
        }
        .leaflet-tooltip::before { display: none; }
        /* Control de capas — tema oscuro */
        .leaflet-control-layers {
          background: rgba(8,8,8,0.92) !important;
          border: 1px solid #1a1a1a !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          color: #777 !important;
          font-family: monospace !important;
          font-size: 9px !important;
        }
        .leaflet-control-layers-toggle {
          background-color: #111 !important;
          border: 1px solid #222 !important;
          width: 28px !important; height: 28px !important;
          background-size: 16px 16px !important;
          filter: invert(0.5) !important;
        }
        .leaflet-control-layers label { color: #777 !important; font-size: 10px !important; font-family: monospace !important; }
        .leaflet-control-layers-separator { border-top-color: #1a1a1a !important; }
        .leaflet-control-layers input[type=radio] { accent-color: #90A4AE; }
      `}</style>
      <div ref={mapDivRef} style={{ width: '100%', height: '100%' }} />

      {/* Instrucción de dibujo */}
      {drawingId && (
        <div style={{
          position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
          zIndex: 999, background: '#0a0a0aee', border: `1px solid ${color}55`,
          padding: '6px 14px', fontFamily: 'monospace', fontSize: 10, color: `${color}cc`,
          pointerEvents: 'none',
        }}>
          ● Clic para agregar punto · Clic derecho para finalizar
        </div>
      )}

      {!mapReady && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: '#0d0d0d', fontFamily: 'monospace', fontSize: 11, color: '#333',
        }}>
          Cargando mapa…
        </div>
      )}
    </div>
  )
}

