'use client'
import 'leaflet/dist/leaflet.css'
import { useState, useEffect, useRef, useCallback } from 'react'

// ── Geodésica ──────────────────────────────────────────────────────────────────
type LatLng = [number, number]
function segLen(a: LatLng, b: LatLng): number {
  const R = 6371000, DEG = Math.PI / 180
  const dLat = (b[0]-a[0])*DEG, dLng = (b[1]-a[1])*DEG
  const sh = Math.sin(dLat/2), sw = Math.sin(dLng/2)
  return 2*R*Math.asin(Math.sqrt(sh*sh + Math.cos(a[0]*DEG)*Math.cos(b[0]*DEG)*sw*sw))
}
function totalLen(pts: LatLng[]): number {
  let d = 0; for (let i = 1; i < pts.length; i++) d += segLen(pts[i-1], pts[i]); return d
}

// ── Buffer de calzada (igual que planta/page.tsx) ─────────────────────────────
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

// ── Parsers de archivo ────────────────────────────────────────────────────────
function parseKMLLines(text: string): LatLng[][] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(text, 'text/xml')
  const lines: LatLng[][] = []
  const coordEls = Array.from(doc.getElementsByTagName('coordinates'))
  for (const el of coordEls) {
    const raw = el.textContent?.trim() ?? ''
    const pts: LatLng[] = raw.split(/\s+/).filter(Boolean).flatMap(token => {
      const parts = token.split(',').map(Number)
      if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1]))
        return [[parts[1], parts[0]] as LatLng]
      return []
    })
    if (pts.length >= 2) lines.push(pts)
  }
  return lines
}
function parseGeoJSONLines(text: string): LatLng[][] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = JSON.parse(text)
  const lines: LatLng[][] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processGeom = (geom: any) => {
    if (!geom) return
    if (geom.type === 'LineString') {
      const pts: LatLng[] = geom.coordinates.map(([lng, lat]: number[]) => [lat, lng] as LatLng)
      if (pts.length >= 2) lines.push(pts)
    } else if (geom.type === 'MultiLineString') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      geom.coordinates.forEach((coords: any[]) => {
        const pts: LatLng[] = coords.map(([lng, lat]: number[]) => [lat, lng] as LatLng)
        if (pts.length >= 2) lines.push(pts)
      })
    }
  }
  if (data.type === 'FeatureCollection') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(data.features ?? []).forEach((f: any) => processGeom(f.geometry))
  } else if (data.type === 'Feature') {
    processGeom(data.geometry)
  } else {
    processGeom(data)
  }
  return lines
}

// ── Layer control (mismo sistema que InlineMapDraw) ───────────────────────────
const LAYER_KEYS = ['zonas','sedes','rpPavimentada','rpMejorada','rpEnObra','rpTierra','ccZI','ccZII','ccZIII','ccZIV','ccZV'] as const
type LayerKey = typeof LAYER_KEYS[number]
const LAYER_LABELS: Record<LayerKey, string> = {
  zonas: 'Zonas', sedes: 'Sedes CC',
  rpPavimentada: 'RP Pavim.', rpMejorada: 'RP Mejor.', rpEnObra: 'RP En Obra', rpTierra: 'RP Tierra',
  ccZI: 'Z I', ccZII: 'Z II', ccZIII: 'Z III', ccZIV: 'Z IV', ccZV: 'Z V',
}
const LAYER_COLORS: Record<LayerKey, string> = {
  zonas: '#6baed6', sedes: '#F5C300',
  rpPavimentada: '#e74c3c', rpMejorada: '#e67e22', rpEnObra: '#f1c40f', rpTierra: '#95a5a6',
  ccZI: '#1565C0', ccZII: '#BF360C', ccZIII: '#E65100', ccZIV: '#6A1B9A', ccZV: '#00695C',
}
const LAYER_DEFAULTS: Record<LayerKey, boolean> = {
  zonas: false, sedes: false,
  rpPavimentada: false, rpMejorada: false, rpEnObra: false, rpTierra: false,
  ccZI: false, ccZII: false, ccZIII: false, ccZIV: false, ccZV: false,
}
const ZONE_CLR: Record<string, string> = {
  ZI: '#e74c3c', ZII: '#e67e22', ZIII: '#2ecc71', ZIV: '#3498db', ZV: '#9b59b6',
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  color: string
  halfWidth?: number          // metros — muestra buffer de calzada al finalizar
  onConfirm: (lengthM: number, pts: [number, number][]) => void
  onCancel?:  () => void
}

// ── Componente ────────────────────────────────────────────────────────────────
export default function InlineLineDraw({ color, halfWidth, onConfirm, onCancel }: Props) {
  const [drawing,    setDrawing]    = useState(false)
  const [lineResult, setLineResult] = useState<{ lengthM: number; pts: LatLng[] } | null>(null)
  const [lineHUD,    setLineHUD]    = useState<{ vertices: number; lastSegM: number; totalM: number } | null>(null)
  const [hudUnit,    setHudUnit]    = useState<'m' | 'km'>('m')
  const [mapReady,   setMapReady]   = useState(false)
  const [basemap,    setBasemap]    = useState<'osm' | 'sat'>('osm')
  const [hasLine,    setHasLine]    = useState(false)
  const [canUndo,    setCanUndo]    = useState(false)

  const mapDivRef  = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef     = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LfRef      = useRef<any>(null)
  const drawStateRef = useRef<{
    pts: LatLng[]
    cleanup: () => void
    undo:    () => void
  } | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const previewRef      = useRef<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const osmLayerRef     = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const satLayerRef     = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const confirmedLayersRef = useRef<any[]>([])
  const halfWidthRef = useRef<number>(halfWidth ?? 0)

  // Layer control
  const [layerVis,       setLayerVis]       = useState<Record<LayerKey, boolean>>(LAYER_DEFAULTS)
  const [layerLoading,   setLayerLoading]   = useState<Record<LayerKey, boolean>>(LAYER_DEFAULTS)
  const [layerPanelOpen, setLayerPanelOpen] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layerRefsMap = useRef<Map<LayerKey, any>>(new Map())
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const geoCacheRef  = useRef<Record<string, any>>({})

  // ── CSS dark para popups ──────────────────────────────────────────────────
  useEffect(() => {
    const style = document.createElement('style')
    style.id = 'linedraw-map-styles'
    style.textContent = `
      .linedraw-popup .leaflet-popup-content-wrapper {
        background: #111; border: 1px solid #222; border-radius: 4px;
        box-shadow: 0 4px 16px #000a; padding: 0;
      }
      .linedraw-popup .leaflet-popup-content { margin: 0; }
      .linedraw-popup .leaflet-popup-tip-container { display: none; }
      .linedraw-label { background: transparent !important; border: none !important;
        box-shadow: none !important; padding: 0 !important; }
      .linedraw-label .leaflet-tooltip-content { padding: 0; }
    `
    if (!document.getElementById('linedraw-map-styles')) document.head.appendChild(style)
    return () => { document.getElementById('linedraw-map-styles')?.remove() }
  }, [])

  // ── Sincronizar halfWidthRef con prop ────────────────────────────────────
  useEffect(() => { halfWidthRef.current = halfWidth ?? 0 }, [halfWidth])

  // ── Inicializar mapa ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapDivRef.current) return
    let destroyed = false
    ;(async () => {
      const Lf = (await import('leaflet')).default
      if (destroyed || !mapDivRef.current) return
      const savedC = sessionStorage.getItem('linedraw_mapCenter')
      const savedZ = sessionStorage.getItem('linedraw_mapZoom')
      const center: [number, number] = savedC ? JSON.parse(savedC) : [-26.5, -60.5]
      const zoom   = savedZ ? parseInt(savedZ) : 7

      const map = Lf.map(mapDivRef.current, { center, zoom, zoomControl: true, attributionControl: false })
      const osmLayer = Lf.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 })
      const satLayer = Lf.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      })
      osmLayer.addTo(map)
      osmLayerRef.current = osmLayer
      satLayerRef.current = satLayer
      map.on('moveend', () => {
        const c = map.getCenter()
        sessionStorage.setItem('linedraw_mapCenter', JSON.stringify([c.lat, c.lng]))
        sessionStorage.setItem('linedraw_mapZoom', String(map.getZoom()))
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

  // ── ResizeObserver → invalidateSize ──────────────────────────────────────
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

  // ── Basemap ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current, osm = osmLayerRef.current, sat = satLayerRef.current
    if (!map || !osm || !sat) return
    if (basemap === 'sat') { map.removeLayer(osm); sat.addTo(map) }
    else                   { map.removeLayer(sat); osm.addTo(map) }
  }, [basemap])

  // ── Agregar capa confirmada al mapa (buffer + línea central) ─────────────
  const addConfirmedLayer = useCallback((pts: LatLng[], lengthM: number) => {
    const map = mapRef.current, Lf = LfRef.current
    if (!map || !Lf) return
    confirmedLayersRef.current.forEach(l => map.removeLayer(l))
    confirmedLayersRef.current = []
    const hw = halfWidthRef.current
    const fmtL = (m: number) => m >= 1000 ? `${(m/1000).toFixed(3)} km` : `${Math.round(m)} m`
    const layers: unknown[] = []
    if (hw > 0) {
      const bufRing = roadBuffer(pts, hw)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const poly = (Lf as any).polygon(bufRing as [number,number][], {
        color, fillColor: color, fillOpacity: 0.35, weight: 2, opacity: 0.9,
      }).addTo(map)
      layers.push(poly)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const line = (Lf as any).polyline(pts as [number,number][], { color, weight: 4, opacity: 0.95 }).addTo(map)
    line.bindTooltip(
      `<span style="font-family:monospace;font-size:10px;color:${color};font-weight:700">${fmtL(lengthM)}</span>`,
      { permanent: true, direction: 'center', className: 'linedraw-label' }
    )
    layers.push(line)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    confirmedLayersRef.current = layers as any[]
  }, [color])

  // ── Usar resultado ────────────────────────────────────────────────────────
  const handleUse = useCallback(() => {
    if (!lineResult) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    previewRef.current.forEach((l: any) => mapRef.current?.removeLayer(l))
    previewRef.current = []
    addConfirmedLayer(lineResult.pts, lineResult.lengthM)
    setHasLine(true)
    onConfirm(lineResult.lengthM, lineResult.pts as [number,number][])
    setLineResult(null)
    setLineHUD(null)
  }, [lineResult, addConfirmedLayer, onConfirm])

  // ── Iniciar trazado ───────────────────────────────────────────────────────
  const startDraw = useCallback(() => {
    const map = mapRef.current, Lf = LfRef.current
    if (!map || !Lf || drawing) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    previewRef.current.forEach((l: any) => map.removeLayer(l)); previewRef.current = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    confirmedLayersRef.current.forEach((l: any) => map.removeLayer(l)); confirmedLayersRef.current = []
    setLineResult(null); setDrawing(true); setLineHUD(null); setHasLine(false); setCanUndo(false)
    map.getContainer().style.cursor = 'crosshair'

    const pts: LatLng[] = []
    const committedLine = Lf.polyline([], { color, weight: 3.5, opacity: 0.95 }).addTo(map)
    const previewSeg    = Lf.polyline([], { color, weight: 2, dashArray: '8 5', opacity: 0.55 }).addTo(map)
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
      setLineHUD(null); setCanUndo(false)
    }

    const redraw = (cursor?: LatLng) => {
      committedLine.setLatLngs(pts.length >= 1 ? pts as [number,number][] : [])
      if (cursor && pts.length >= 1)
        previewSeg.setLatLngs([[pts[pts.length-1], cursor] as [number,number][]])
      else
        previewSeg.setLatLngs([])
    }

    const updateHUD = (cursor?: LatLng) => {
      if (!pts.length) return
      const all = cursor ? [...pts, cursor] : pts
      setLineHUD({
        vertices: pts.length,
        lastSegM: pts.length >= 1 && cursor ? segLen(pts[pts.length-1], cursor) : 0,
        totalM:   totalLen(all),
      })
    }

    const undo = () => {
      if (pts.length === 0) return
      const last = vmList.pop()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (last) map.removeLayer(last)
      pts.pop()
      redraw()
      setCanUndo(pts.length > 0)
      if (pts.length > 0) setLineHUD({ vertices: pts.length, lastSegM: 0, totalM: totalLen(pts) })
      else setLineHUD(null)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onLineClick = (e: any) => {
      const ll: LatLng = [e.latlng.lat, e.latlng.lng]
      pts.push(ll)
      const isFirst = pts.length === 1
      const vm = Lf.circleMarker(ll as [number,number], {
        radius: isFirst ? 6 : 4, color,
        fillColor: isFirst ? '#fff' : color,
        fillOpacity: isFirst ? 0.9 : 0.85,
        weight: isFirst ? 2 : 1.5, opacity: 1,
      }).addTo(map)
      vmList.push(vm)
      redraw(); updateHUD()
      setCanUndo(true)
      drawStateRef.current = { pts: [...pts], cleanup, undo }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onLineMove = (e: any) => {
      if (!pts.length) return
      const cursor: LatLng = [e.latlng.lat, e.latlng.lng]
      redraw(cursor); updateHUD(cursor)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onLineRight = (e: any) => {
      if (e?.originalEvent) e.originalEvent.preventDefault()
      if (pts.length < 2) return
      cleanup(); setDrawing(false)
      const lengthM = totalLen(pts)
      const hw = halfWidthRef.current
      const previewLayers: unknown[] = []
      if (hw > 0) {
        const bufRing = roadBuffer(pts, hw)
        const poly = Lf.polygon(bufRing as [number,number][], {
          color, fillColor: color, fillOpacity: 0.4, weight: 2, opacity: 0.9,
        }).addTo(map)
        previewLayers.push(poly)
      }
      const line = Lf.polyline(pts as [number,number][], {
        color, weight: 3, opacity: hw > 0 ? 1 : 0.9, dashArray: hw > 0 ? '8 4' : '6 4',
      }).addTo(map)
      previewLayers.push(line)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      previewRef.current = previewLayers as any[]
      setLineResult({ lengthM, pts: [...pts] })
    }

    drawStateRef.current = { pts, cleanup, undo }
    map.on('click',       onLineClick)
    map.on('mousemove',   onLineMove)
    map.on('contextmenu', onLineRight)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing, color])

  const cancelDraw = useCallback(() => {
    drawStateRef.current?.cleanup()
    setDrawing(false); setLineResult(null); setLineHUD(null); setCanUndo(false)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    previewRef.current.forEach((l: any) => mapRef.current?.removeLayer(l)); previewRef.current = []
  }, [])

  // ── Importar KML / GeoJSON ────────────────────────────────────────────────
  const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = () => {
      const text = reader.result as string
      let lines: LatLng[][] = []
      try {
        if (file.name.toLowerCase().endsWith('.kml')) lines = parseKMLLines(text)
        else lines = parseGeoJSONLines(text)
      } catch(err) { console.error('Error parseando:', err); return }
      if (!lines.length || lines[0].length < 2) return

      const map = mapRef.current, Lf = LfRef.current
      if (!map || !Lf) return

      drawStateRef.current?.cleanup()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      previewRef.current.forEach((l: any) => map.removeLayer(l)); previewRef.current = []
      setDrawing(false); setLineResult(null); setLineHUD(null)

      const pts = lines[0]
      const lengthM = totalLen(pts)
      const hw = halfWidthRef.current
      const importLayers: unknown[] = []
      if (hw > 0) {
        const bufRing = roadBuffer(pts, hw)
        const poly = Lf.polygon(bufRing as [number,number][], {
          color, fillColor: color, fillOpacity: 0.4, weight: 2, opacity: 0.9,
        }).addTo(map)
        importLayers.push(poly)
      }
      const prev = Lf.polyline(pts as [number,number][], {
        color, weight: 3, opacity: hw > 0 ? 1 : 0.9, dashArray: hw > 0 ? '8 4' : '6 4',
      }).addTo(map)
      importLayers.push(prev)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      previewRef.current = importLayers as any[]
      setLineResult({ lengthM, pts })
      map.fitBounds(prev.getBounds(), { padding: [40, 40] })
    }
    reader.readAsText(file)
  }, [color])

  // ── Toggle capas GeoJSON (idéntico a InlineMapDraw) ───────────────────────
  const toggleLayer = useCallback(async (key: LayerKey) => {
    const map = mapRef.current, Lf = LfRef.current
    if (!map || !Lf) return
    if (layerRefsMap.current.has(key)) {
      map.removeLayer(layerRefsMap.current.get(key))
      layerRefsMap.current.delete(key)
      setLayerVis(prev => ({ ...prev, [key]: false }))
      return
    }
    setLayerLoading(prev => ({ ...prev, [key]: true }))
    try {
      const group = Lf.layerGroup()
      if (key === 'zonas') {
        if (!geoCacheRef.current.bundle)
          geoCacheRef.current.bundle = await fetch('/geo/geo_bundle.json').then(r => r.json())
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Object.entries(geoCacheRef.current.bundle.limites_zonas as Record<string, any>).forEach(([z, gj]) => {
          const c = ZONE_CLR[z] ?? '#888'
          Lf.geoJSON(gj, {
            style: { color: c, weight: 2, opacity: 0.7, fillOpacity: 0.04, fillColor: c },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onEachFeature: (_: any, layer: any) => {
              layer.bindTooltip(
                `<span style="font-family:monospace;font-size:9px;color:${c}">Zona ${z}</span>`,
                { permanent: true, direction: 'center', className: 'linedraw-label' }
              )
            },
          }).addTo(group)
        })
      } else if (key === 'sedes') {
        if (!geoCacheRef.current.bundle)
          geoCacheRef.current.bundle = await fetch('/geo/geo_bundle.json').then(r => r.json())
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(geoCacheRef.current.bundle.sedes as any[]).forEach((s: any) => {
          const c = s.color || '#F5C300'
          const icon = Lf.divIcon({
            className: '',
            html: `<div style="width:16px;height:16px;border-radius:50%;background:${c};border:2px solid #111;display:flex;align-items:center;justify-content:center;font-size:6px;font-weight:800;color:#111;box-shadow:0 2px 5px rgba(0,0,0,.7)">${s.numero}</div>`,
            iconSize: [16,16], iconAnchor: [8,8],
          })
          Lf.marker([s.lat, s.lng] as [number,number], { icon })
            .bindTooltip(
              `<b style="color:${c}">Sede ${s.numero}</b> · ${s.nombre}<br><span style="color:#aaa">${s.localidad} · ${s.zona}</span>`,
              { direction: 'top', className: 'linedraw-label' }
            ).addTo(group)
        })
      } else if (key.startsWith('rp')) {
        if (!geoCacheRef.current.rp)
          geoCacheRef.current.rp = await fetch('/geo/geo_rp.json').then(r => r.json())
        const rpData = geoCacheRef.current.rp[key]
        if (rpData) {
          const c  = LAYER_COLORS[key]
          const wt = key === 'rpPavimentada' ? 2.5 : key === 'rpMejorada' ? 2 : 1.5
          Lf.geoJSON(rpData, {
            style: { color: c, weight: wt, opacity: 0.85, fillOpacity: 0 },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onEachFeature(feature: any, layer: any) {
              const p = feature.properties ?? {}
              const num  = p.Nombre || p.nombre || p.Numero || ''
              const zona = p.Zona || p.zona || ''
              layer.bindTooltip(
                `<b style="color:${c}">RP${num ? ' N°'+num : ''}</b> · ${LAYER_LABELS[key]}${zona ? ' · Zona '+zona : ''}`,
                { sticky: true, direction: 'top' }
              )
            },
          }).addTo(group)
        }
      } else if (key.startsWith('cc')) {
        if (!geoCacheRef.current.cc)
          geoCacheRef.current.cc = await fetch('/geo/geo_cc.json').then(r => r.json())
        const zona   = key.slice(2)
        const ccData = geoCacheRef.current.cc[zona]
        const c      = LAYER_COLORS[key]
        if (ccData) {
          Lf.geoJSON(ccData, {
            style: { color: c, weight: 1.5, opacity: 0.85, fillOpacity: 0 },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onEachFeature(feature: any, layer: any) {
              const p = feature.properties ?? {}
              const ccNum = p.CC || p.cc || ''
              const nm    = p.Nm || p.nm || p.Nombre || ''
              layer.bindTooltip(
                `<b style="color:${c}">CC ${ccNum}</b> · Zona ${zona}${nm ? '<br>'+nm : ''}`,
                { sticky: true, direction: 'top' }
              )
            },
          }).addTo(group)
        }
      }
      group.addTo(map)
      layerRefsMap.current.set(key, group)
      setLayerVis(prev => ({ ...prev, [key]: true }))
    } catch(err) {
      console.error('Error cargando capa', key, err)
    } finally {
      setLayerLoading(prev => ({ ...prev, [key]: false }))
    }
  }, [])

  // ── Formato ───────────────────────────────────────────────────────────────
  const fmtLen = (m: number) =>
    hudUnit === 'km' ? `${(m/1000).toFixed(3)} km` : `${Math.round(m).toLocaleString('es-AR')} m`
  const fmtDist = (m: number) => m >= 1000 ? `${(m/1000).toFixed(3)} km` : `${Math.round(m)} m`
  const mono: React.CSSProperties = { fontFamily: 'monospace' }
  const toolBtn = (active?: boolean): React.CSSProperties => ({
    padding: '4px 10px', fontSize: 10, ...mono, cursor: 'pointer', borderRadius: 2,
    border: `1px solid ${active ? color+'99' : '#252525'}`,
    background: active ? `${color}1a` : '#0c0c0c',
    color: active ? color : '#555',
  })

  const hudLen  = lineHUD?.totalM ?? 0
  const showHUD = !!lineHUD

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
        background: '#080808', borderBottom: '1px solid #1a1a1a', flexShrink: 0, flexWrap: 'wrap',
      }}>
        {!drawing && !lineResult && mapReady && (
          <>
            <button onClick={startDraw} style={{
              ...toolBtn(), color, borderColor: `${color}66`,
              background: `${color}15`, padding: '5px 16px', fontSize: 11, fontWeight: 700,
            }}>
              ↔ Trazar línea
            </button>
            <button onClick={() => fileInputRef.current?.click()} style={{
              ...toolBtn(), fontSize: 10, padding: '4px 10px', color: '#888', borderColor: '#2a2a2a',
            }}>
              ↑ Importar KML / GeoJSON
            </button>
          </>
        )}

        {drawing && (
          <>
            <span style={{ fontSize: 9, color: `${color}cc`, ...mono }}>
              ● Clic para agregar punto · Clic derecho para terminar
            </span>
            {canUndo && (
              <button onClick={() => drawStateRef.current?.undo()} style={{ ...toolBtn(), color: '#666' }}>
                ↩ Deshacer
              </button>
            )}
            <button onClick={cancelDraw} style={{ ...toolBtn(), color: '#555' }}>✕ Cancelar</button>
          </>
        )}

        {lineResult && (
          <>
            <span style={{ fontSize: 10, color: '#888', ...mono }}>
              {fmtDist(lineResult.lengthM)} · {lineResult.pts.length} vértices
            </span>
            <button onClick={cancelDraw} style={{ ...toolBtn(), color: '#555' }}>↺ Redibujar</button>
            <button onClick={handleUse} style={{
              ...toolBtn(true), padding: '5px 16px', fontSize: 11, fontWeight: 700,
            }}>
              ✓ Usar → {fmtDist(lineResult.lengthM)}
            </button>
          </>
        )}

        {hasLine && !drawing && !lineResult && (
          <>
            <span style={{ fontSize: 9, color: '#555', ...mono }}>Longitud confirmada</span>
            <button onClick={startDraw} style={{ ...toolBtn(), fontSize: 10, color: '#666' }}>↺ Redibujar</button>
            <button onClick={() => fileInputRef.current?.click()} style={{ ...toolBtn(), fontSize: 9, color: '#555' }}>
              ↑ Importar
            </button>
          </>
        )}

        <div style={{ flex: 1 }} />

        {/* Basemap */}
        <div style={{ display: 'flex', gap: 2 }}>
          <button onClick={() => setBasemap('osm')} style={{ ...toolBtn(basemap === 'osm'), fontSize: 9 }}>OSM</button>
          <button onClick={() => setBasemap('sat')} style={{ ...toolBtn(basemap === 'sat'), fontSize: 9 }}>Satélite</button>
        </div>
        {onCancel && (
          <button onClick={onCancel} style={{ ...toolBtn(), color: '#444', fontSize: 9 }}>✕ Cerrar</button>
        )}
      </div>

      {/* ── Mapa ── */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <div ref={mapDivRef} style={{ width: '100%', height: '100%' }} />

        {/* HUD tiempo real */}
        {showHUD && (
          <div style={{
            position: 'absolute', bottom: 12, left: 12, zIndex: 999,
            background: '#0a0a0aee', border: `1px solid ${color}55`,
            borderRadius: 4, padding: '8px 12px', ...mono,
            fontSize: 10, lineHeight: 1.8, color: '#888', minWidth: 190,
          }}>
            <div style={{ fontSize: 8, color: '#444', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
              Trayecto en tiempo real
            </div>
            {lineHUD && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                  <span style={{ color: '#555' }}>Vértices</span>
                  <span style={{ color: '#aaa' }}>{lineHUD.vertices}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                  <span style={{ color: '#555' }}>Últ. segmento</span>
                  <span>{fmtDist(lineHUD.lastSegM)}</span>
                </div>
              </>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginTop: 4, paddingTop: 4, borderTop: `1px solid ${color}33` }}>
              <span style={{ color }}>Longitud</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color, fontWeight: 700, fontSize: 12 }}>{fmtLen(hudLen)}</span>
                <select value={hudUnit} onChange={e => setHudUnit(e.target.value as 'm' | 'km')}
                  style={{ fontSize: 8, background: '#000', border: `1px solid ${color}33`, color: '#555', outline: 'none', padding: '1px 2px' }}>
                  <option value="m">m</option>
                  <option value="km">km</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Instrucciones iniciales */}
        {!drawing && !lineResult && !hasLine && mapReady && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            zIndex: 998, textAlign: 'center', pointerEvents: 'none',
          }}>
            <div style={{ background: '#0a0a0acc', border: `1px solid ${color}33`, borderRadius: 4, padding: '10px 18px', ...mono, fontSize: 10, color: '#444' }}>
              Navegá hasta el tramo de obra<br />
              luego presioná <span style={{ color }}>↔ Trazar línea</span>
            </div>
          </div>
        )}

        {/* Hint línea confirmada */}
        {hasLine && !drawing && !lineResult && mapReady && (
          <div style={{
            position: 'absolute', bottom: 12, right: 12, zIndex: 998,
            background: '#0a0a0acc', border: `1px solid #1e1e1e`,
            borderRadius: 3, padding: '5px 10px', ...mono, fontSize: 9, color: '#444',
            pointerEvents: 'none',
          }}>
            Longitud enviada a la calculadora
          </div>
        )}

        {/* Panel de capas */}
        {mapReady && (
          <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 999, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <button
              onClick={() => setLayerPanelOpen(v => !v)}
              style={{
                background: 'rgba(10,10,10,0.88)', border: `1px solid ${layerPanelOpen ? '#F5C300' : '#252525'}`,
                color: layerPanelOpen ? '#F5C300' : '#666', ...mono, fontSize: 9,
                padding: '4px 9px', cursor: 'pointer', letterSpacing: 0.8, textTransform: 'uppercase',
              }}
            >
              ⊞ Capas {Object.values(layerVis).filter(Boolean).length > 0 ? `(${Object.values(layerVis).filter(Boolean).length})` : ''}
            </button>
            {layerPanelOpen && (
              <div style={{
                background: 'rgba(10,10,10,0.94)', border: '1px solid #1e1e1e',
                padding: '8px 10px', minWidth: 148, maxHeight: 320, overflowY: 'auto',
              }}>
                <div style={{ fontSize: 8, color: '#444', letterSpacing: 1.2, ...mono, textTransform: 'uppercase', marginBottom: 5 }}>Base</div>
                {(['zonas','sedes'] as LayerKey[]).map(k => (
                  <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginBottom: 5, fontSize: 10, ...mono, color: layerVis[k] ? LAYER_COLORS[k] : '#444', opacity: layerLoading[k] ? 0.5 : 1 }}>
                    <input type="checkbox" checked={layerVis[k]} disabled={layerLoading[k]} onChange={() => void toggleLayer(k)}
                      style={{ accentColor: LAYER_COLORS[k], width: 11, height: 11, flexShrink: 0, cursor: 'pointer' }} />
                    {layerLoading[k] ? '…' : LAYER_LABELS[k]}
                  </label>
                ))}
                <div style={{ fontSize: 8, color: '#444', letterSpacing: 1.2, ...mono, textTransform: 'uppercase', marginTop: 8, marginBottom: 5, borderTop: '1px solid #1a1a1a', paddingTop: 6 }}>Rutas Prov.</div>
                {(['rpPavimentada','rpMejorada','rpEnObra','rpTierra'] as LayerKey[]).map(k => (
                  <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginBottom: 5, fontSize: 10, ...mono, color: layerVis[k] ? LAYER_COLORS[k] : '#444', opacity: layerLoading[k] ? 0.5 : 1 }}>
                    <input type="checkbox" checked={layerVis[k]} disabled={layerLoading[k]} onChange={() => void toggleLayer(k)}
                      style={{ accentColor: LAYER_COLORS[k], width: 11, height: 11, flexShrink: 0, cursor: 'pointer' }} />
                    <span style={{ display: 'inline-block', width: 14, height: 2, background: LAYER_COLORS[k], flexShrink: 0 }} />
                    {layerLoading[k] ? '…' : LAYER_LABELS[k]}
                  </label>
                ))}
                <div style={{ fontSize: 8, color: '#444', letterSpacing: 1.2, ...mono, textTransform: 'uppercase', marginTop: 8, marginBottom: 5, borderTop: '1px solid #1a1a1a', paddingTop: 6 }}>Red CC</div>
                {(['ccZI','ccZII','ccZIII','ccZIV','ccZV'] as LayerKey[]).map(k => (
                  <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginBottom: 5, fontSize: 10, ...mono, color: layerVis[k] ? LAYER_COLORS[k] : '#444', opacity: layerLoading[k] ? 0.5 : 1 }}>
                    <input type="checkbox" checked={layerVis[k]} disabled={layerLoading[k]} onChange={() => void toggleLayer(k)}
                      style={{ accentColor: LAYER_COLORS[k], width: 11, height: 11, flexShrink: 0, cursor: 'pointer' }} />
                    <span style={{ display: 'inline-block', width: 14, height: 2, background: LAYER_COLORS[k], flexShrink: 0 }} />
                    {layerLoading[k] ? '…' : LAYER_LABELS[k]}
                  </label>
                ))}
              </div>
            )}
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

      <input ref={fileInputRef} type="file" accept=".kml,.geojson,.json" style={{ display: 'none' }} onChange={handleImportFile} />
    </div>
  )
}
