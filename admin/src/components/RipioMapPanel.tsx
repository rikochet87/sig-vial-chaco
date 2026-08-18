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
  ripios:          RipioTramo[]
  selectedId:      string | null
  drawingId:       string | null          // ripio en modo dibujo activo
  color:           string
  onLineDraw:      (id: string, lengthM: number, coords: LatLng[]) => void
  onDrawEnd:       () => void
  onSelectRipio?:  (id: string) => void   // seleccionar ripio al clicar en el mapa
  onDeleteRipio?:  (id: string) => void   // eliminar ripio desde el mapa
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

function roadBuffer(latLngs: LatLng[], halfWidth: number): LatLng[][] {
  if (latLngs.length < 2 || halfWidth <= 0) return []
  const DEG = Math.PI / 180, R = 6371000
  const lat0 = latLngs[0][0], lng0 = latLngs[0][1]
  const cosLat = Math.cos(lat0 * DEG)

  let raw = latLngs.map(([lat, lng]) => ({
    x: (lng - lng0) * cosLat * R * DEG,
    y: (lat - lat0) * R * DEG,
  }))

  // Detectar bucle cerrado: primer y último punto dentro de 2 m
  const d01 = Math.hypot(raw[0].x - raw[raw.length-1].x, raw[0].y - raw[raw.length-1].y)
  const isClosed = d01 < 2
  if (isClosed && raw.length > 2) raw = raw.slice(0, -1)
  const n = raw.length

  // Tangentes unitarias (segCount = n para cerrado, n-1 para abierto)
  const T: { x: number; y: number }[] = []
  const segCount = isClosed ? n : n - 1
  for (let i = 0; i < segCount; i++) {
    const a = raw[i], b = raw[(i + 1) % n]
    const dx = b.x - a.x, dy = b.y - a.y
    const len = Math.sqrt(dx*dx + dy*dy)
    T.push(len > 1e-10 ? { x: dx/len, y: dy/len } : { x: 1, y: 0 })
  }

  const left:  { x: number; y: number }[] = []
  const right: { x: number; y: number }[] = []
  const MAX_MITER = halfWidth * 4

  for (let i = 0; i < n; i++) {
    let mx = 0, my = 0

    const isFirst = !isClosed && i === 0
    const isLast  = !isClosed && i === n - 1

    if (isFirst) {
      mx = -T[0].y * halfWidth
      my =  T[0].x * halfWidth
    } else if (isLast) {
      mx = -T[T.length-1].y * halfWidth
      my =  T[T.length-1].x * halfWidth
    } else {
      // Punto interior o cualquier punto en loop cerrado: miter join
      const t1 = T[(i - 1 + T.length) % T.length]
      const t2 = T[i % T.length]
      const cross = t1.x * t2.y - t1.y * t2.x

      if (Math.abs(cross) < 0.05) {
        const nx = -(t1.y + t2.y), ny = (t1.x + t2.x)
        const nlen = Math.sqrt(nx*nx + ny*ny) || 1
        mx = (nx/nlen) * halfWidth
        my = (ny/nlen) * halfWidth
      } else {
        const mxRaw = halfWidth * (t2.x - t1.x) / cross
        const myRaw = halfWidth * (t2.y - t1.y) / cross
        const mlen  = Math.sqrt(mxRaw*mxRaw + myRaw*myRaw)
        if (mlen <= MAX_MITER) {
          mx = mxRaw; my = myRaw
        } else {
          const nx = -(t1.y + t2.y), ny = (t1.x + t2.x)
          const nlen = Math.sqrt(nx*nx + ny*ny) || 1
          mx = (nx/nlen) * halfWidth
          my = (ny/nlen) * halfWidth
        }
      }
    }

    left.push({ x: raw[i].x + mx, y: raw[i].y + my })
    right.push({ x: raw[i].x - mx, y: raw[i].y - my })
  }

  const toLL = (p: { x: number; y: number }): LatLng => [
    lat0 + p.y / (R * DEG),
    lng0 + p.x / (cosLat * R * DEG),
  ]

  if (isClosed) {
    // Donut: anillo exterior + interior → Leaflet rellena solo el grosor de la calle
    return [left.map(toLL), right.map(toLL)]
  }
  return [[...left.map(toLL), ...right.reverse().map(toLL)]]
}

import { PALETTE } from '@/lib/ripioPalette'

function ripioColor(orden: number): string {
  return PALETTE[orden % PALETTE.length]
}

// ── Componente ────────────────────────────────────────────────────────────────
export default function RipioMapPanel({
  ripios, selectedId, drawingId, color, onLineDraw, onDrawEnd,
  onSelectRipio, onDeleteRipio,
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
  const ripiosRef        = useRef(ripios)
  const drawingIdRef     = useRef(drawingId)
  const colorRef         = useRef(color)
  const onSelectRipioRef = useRef(onSelectRipio)
  const onDeleteRipioRef = useRef(onDeleteRipio)
  useEffect(() => { ripiosRef.current = ripios }, [ripios])
  useEffect(() => { drawingIdRef.current = drawingId }, [drawingId])
  useEffect(() => { colorRef.current = color }, [color])
  useEffect(() => { onSelectRipioRef.current = onSelectRipio }, [onSelectRipio])
  useEffect(() => { onDeleteRipioRef.current = onDeleteRipio }, [onDeleteRipio])

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

      // Click en mapa: seleccionar ripio + popup con opción eliminar
      const fmtL = (m: number) => m >= 1000 ? `${(m/1000).toFixed(2)} km` : `${Math.round(m)} m`

      const openRipioPopup = (latlng: any) => {
        if (drawingIdRef.current) return  // ignorar en modo dibujo
        onSelectRipioRef.current?.(r.id)

        const wrap = document.createElement('div')
        wrap.style.cssText = 'font-family:monospace;min-width:130px'

        const title = document.createElement('div')
        title.style.cssText = `color:${clr};font-weight:700;font-size:12px;margin-bottom:3px`
        title.textContent = r.nombre

        const info = document.createElement('div')
        info.style.cssText = 'color:#888;font-size:10px;margin-bottom:8px'
        info.textContent = `${fmtL(r.l_m)} · ${r.an}m ancho`

        const btn = document.createElement('button')
        btn.textContent = '✕ Eliminar ripio'
        btn.style.cssText = 'font-family:monospace;font-size:10px;cursor:pointer;background:#1a0000;border:1px solid #550000;color:#ff6666;padding:4px 8px;width:100%'
        btn.addEventListener('click', () => { map.closePopup(); onDeleteRipioRef.current?.(r.id) })

        wrap.appendChild(title); wrap.appendChild(info); wrap.appendChild(btn)
        Lf.popup({ closeButton: true, className: 'ripio-ctx-popup' })
          .setContent(wrap).setLatLng(latlng).openOn(map)
      }

      // Buffer de calzada
      const rings = roadBuffer(r.coords, hw)
      if (rings.length > 0) {
        const poly = Lf.polygon(rings as [number,number][][], {
          color: clr, fillColor: clr,
          fillOpacity: r.id === selectedId ? 0.45 : 0.25,
          weight: r.id === selectedId ? 2 : 1, opacity: 0.9,
        }).addTo(map)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        poly.on('click', (e: any) => { Lf.DomEvent.stopPropagation(e); openRipioPopup(e.latlng) })
        layers.push(poly)
      }

      // Línea central
      const line = Lf.polyline(r.coords as [number,number][], {
        color: clr, weight: r.id === selectedId ? 4 : 2.5,
        opacity: r.id === selectedId ? 1 : 0.75, dashArray: '8 4',
      }).addTo(map)

      line.bindTooltip(
        `<div style="font-family:monospace;font-size:10px">` +
        `<span style="color:${clr};font-weight:700">${r.nombre}</span>` +
        `<br><span style="color:#aaa">${fmtL(r.l_m)} · ${r.an}m ancho</span>` +
        `</div>`,
        { sticky: true, direction: 'top' }
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      line.on('click', (e: any) => { Lf.DomEvent.stopPropagation(e); openRipioPopup(e.latlng) })
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

    const SNAP_PX = 20  // píxeles de pantalla para snap magnético al primer punto

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onLineClick = (e: any) => {
      // Snap magnético: si hay ≥3 puntos y el click es cerca del primero, cerrar el loop
      if (pts.length >= 3) {
        const startPx = map.latLngToContainerPoint(pts[0] as [number,number])
        const curPx   = map.latLngToContainerPoint(e.latlng)
        if (Math.hypot(startPx.x - curPx.x, startPx.y - curPx.y) < SNAP_PX) {
          pts.push([pts[0][0], pts[0][1]])  // cierra el loop con coord exacta del primer punto
          onLineRight(null)
          return
        }
      }
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
      let cursor: LatLng = [e.latlng.lat, e.latlng.lng]

      // Snap magnético: resaltar primer marcador y snappear cursor
      if (pts.length >= 3) {
        const startPx = map.latLngToContainerPoint(pts[0] as [number,number])
        const curPx   = map.latLngToContainerPoint(e.latlng)
        const snapping = Math.hypot(startPx.x - curPx.x, startPx.y - curPx.y) < SNAP_PX
        if (snapping) {
          cursor = [pts[0][0], pts[0][1]]
          vmList[0]?.setStyle({ radius: 9, weight: 3 })
          map.getContainer().style.cursor = 'pointer'
        } else {
          vmList[0]?.setStyle({ radius: 6, weight: 2 })
          map.getContainer().style.cursor = 'crosshair'
        }
      }

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
      const rings = roadBuffer(pts, hw)
      if (rings.length > 0) {
        const poly = Lf.polygon(rings as [number,number][][], {
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
        /* Popup de contexto de ripio */
        .ripio-ctx-popup .leaflet-popup-content-wrapper {
          background: #0d0d0d !important; border: 1px solid #222 !important;
          border-radius: 0 !important; box-shadow: 0 2px 8px #00000088 !important;
          color: #ccc !important; padding: 0 !important;
        }
        .ripio-ctx-popup .leaflet-popup-content { margin: 10px 12px !important; }
        .ripio-ctx-popup .leaflet-popup-tip-container { display: none !important; }
        .ripio-ctx-popup .leaflet-popup-close-button { color: #555 !important; font-size: 14px !important; top: 6px !important; right: 8px !important; }
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

