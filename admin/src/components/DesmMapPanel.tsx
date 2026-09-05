'use client'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useCallback, useState } from 'react'

// ── Tipos ─────────────────────────────────────────────────────────────────────
type LatLng = [number, number]

export interface TramoForMap {
  id:     string
  coords: LatLng[]
  color:  string
  label:  string   // ej. "RP 1 · 0–3240 m · 0.97 ha"
}

interface Props {
  tramosMap:       TramoForMap[]
  pendingColor:    string
  onLineDone:      (coords: LatLng[], lengthM: number) => void
  onDrawingChange?: (drawing: boolean) => void
}

// ── Geodésica ──────────────────────────────────────────────────────────────────
function segLen(a: LatLng, b: LatLng): number {
  const R = 6371000, DEG = Math.PI / 180
  const dLat = (b[0]-a[0])*DEG, dLng = (b[1]-a[1])*DEG
  const sh = Math.sin(dLat/2), sw = Math.sin(dLng/2)
  return 2*R*Math.asin(Math.sqrt(sh*sh + Math.cos(a[0]*DEG)*Math.cos(b[0]*DEG)*sw*sw))
}
function totalLen(pts: LatLng[]): number {
  let d = 0; for (let i = 1; i < pts.length; i++) d += segLen(pts[i-1], pts[i]); return d
}
function interpolateAtDist(pts: LatLng[], distM: number): LatLng | null {
  let acc = 0
  for (let i = 1; i < pts.length; i++) {
    const d = segLen(pts[i-1], pts[i])
    if (acc + d >= distM) {
      const t = (distM - acc) / d
      return [pts[i-1][0] + t*(pts[i][0]-pts[i-1][0]), pts[i-1][1] + t*(pts[i][1]-pts[i-1][1])]
    }
    acc += d
  }
  return null
}
function getProgPositions(pts: LatLng[], interval: number): { pos: LatLng; dist: number }[] {
  if (pts.length < 2 || interval <= 0) return []
  const total = totalLen(pts)
  const result: { pos: LatLng; dist: number }[] = []
  for (let d = interval; d <= total - interval * 0.05; d += interval) {
    const pos = interpolateAtDist(pts, d)
    if (pos) result.push({ pos, dist: d })
  }
  return result
}
function fmtProgDist(m: number): string {
  if (m >= 1000) { const km = m / 1000; return km % 1 === 0 ? `${km} km` : `${km.toFixed(1)} km` }
  return `${m} m`
}

// ── Snapping ──────────────────────────────────────────────────────────────────
const SNAP_PX = 18   // umbral de magnetismo en píxeles de pantalla

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findSnapPoint(map: any, cursor: LatLng, tramos: TramoForMap[]): LatLng | null {
  if (!tramos.length) return null
  const cp = map.latLngToContainerPoint(cursor)
  let best = SNAP_PX, snap: LatLng | null = null
  for (const t of tramos) {
    if (t.coords.length < 2) continue
    // Snap a ambos extremos del tramo (inicio y fin)
    for (const ep of [t.coords[0], t.coords[t.coords.length - 1]] as LatLng[]) {
      const pp = map.latLngToContainerPoint(ep)
      const d = Math.hypot(cp.x - pp.x, cp.y - pp.y)
      if (d < best) { best = d; snap = ep }
    }
  }
  return snap
}

// ── Layer control ─────────────────────────────────────────────────────────────
const LAYER_KEYS = [
  'zonas','sedes',
  'rpPavimentada','rpMejorada','rpEnObra','rpTierra',
  'ccZI','ccZII','ccZIII','ccZIV','ccZV',
] as const
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

// ── Componente ────────────────────────────────────────────────────────────────
export default function DesmMapPanel({ tramosMap, pendingColor, onLineDone, onDrawingChange }: Props) {
  const [drawing,        setDrawing]        = useState(false)
  const [canUndo,        setCanUndo]        = useState(false)
  const [hudInfo,        setHudInfo]        = useState<{ vertices: number; lastSegM: number; totalM: number } | null>(null)
  const [pendingResult,  setPendingResult]  = useState<{ coords: LatLng[]; lengthM: number } | null>(null)
  const [mapReady,       setMapReady]       = useState(false)
  const [basemap,        setBasemap]        = useState<'osm'|'sat'>('osm')
  const [layerPanelOpen, setLayerPanelOpen] = useState(false)
  const [layerVis,       setLayerVis]       = useState<Record<LayerKey, boolean>>(LAYER_DEFAULTS)
  const [layerLoading,   setLayerLoading]   = useState<Record<LayerKey, boolean>>(LAYER_DEFAULTS)

  const mapDivRef    = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef       = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LfRef        = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const osmLayerRef  = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const satLayerRef  = useRef<any>(null)
  const drawStateRef = useRef<{ pts: LatLng[]; cleanup: () => void; undo: () => void } | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pendingLineRef   = useRef<any>(null)   // línea dibujada pendiente de confirmar con "Agregar"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tramoLayersRef   = useRef<Map<string, any>>(new Map())
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layerRefsMap     = useRef<Map<LayerKey, any>>(new Map())
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const geoCacheRef      = useRef<Record<string, any>>({})
  const prevTramoCountRef = useRef(0)
  const tramosMapRef      = useRef<TramoForMap[]>(tramosMap)

  const [progInterval,   setProgInterval]   = useState<number>(500)
  const progIntervalRef  = useRef<number>(500)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const drawProgMarkersRef    = useRef<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pendingProgMarkersRef = useRef<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tramoProgMarkersRef   = useRef<Map<string, any[]>>(new Map())
  const updateDrawProgRef     = useRef<(() => void) | null>(null)

  // ── CSS popups ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const id = 'desm-map-css'
    if (document.getElementById(id)) return
    const s = document.createElement('style')
    s.id = id
    s.textContent = `
      .desm-label { background:transparent!important;border:none!important;box-shadow:none!important;padding:0!important; }
      .desm-label .leaflet-tooltip-content { padding:0; }
      .desm-prog { background:rgba(10,10,10,0.88)!important;border:1px solid #333!important;border-radius:2px!important;
        box-shadow:0 1px 4px rgba(0,0,0,.6)!important;padding:1px 5px!important;
        font-family:monospace!important;font-size:9px!important;color:#aaa!important;white-space:nowrap!important; }
      .desm-prog::before { display:none!important; }
    `
    document.head.appendChild(s)
    return () => { document.getElementById(id)?.remove() }
  }, [])

  // ── Inicializar mapa ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapDivRef.current) return
    let destroyed = false
    ;(async () => {
      const Lf = (await import('leaflet')).default
      if (destroyed || !mapDivRef.current) return
      const savedC = sessionStorage.getItem('desm_mapCenter')
      const savedZ = sessionStorage.getItem('desm_mapZoom')
      const center: LatLng = savedC ? JSON.parse(savedC) : [-26.5, -60.5]
      const zoom = savedZ ? parseInt(savedZ) : 7
      const map = Lf.map(mapDivRef.current, { center, zoom, zoomControl: true, attributionControl: false })
      const osm = Lf.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 })
      const sat = Lf.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        maxZoom: 20, subdomains: ['mt0','mt1','mt2','mt3'],
      })
      osm.addTo(map)
      osmLayerRef.current = osm
      satLayerRef.current = sat
      map.on('moveend', () => {
        const c = map.getCenter()
        sessionStorage.setItem('desm_mapCenter', JSON.stringify([c.lat, c.lng]))
        sessionStorage.setItem('desm_mapZoom', String(map.getZoom()))
      })
      mapRef.current = map
      LfRef.current  = Lf
      setMapReady(true)
      // Safety net: forzar invalidateSize luego de que el layout se asiente
      setTimeout(() => { if (!destroyed) map.invalidateSize({ animate: false }) }, 150)
      setTimeout(() => { if (!destroyed) map.invalidateSize({ animate: false }) }, 500)
    })()
    return () => {
      destroyed = true
      drawStateRef.current?.cleanup()
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
      LfRef.current = null
    }
  }, [])

  // ── ResizeObserver ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady) return
    const el = mapDivRef.current
    if (!el) return
    const ro = new ResizeObserver(() => { mapRef.current?.invalidateSize({ animate: false }) })
    ro.observe(el)
    return () => ro.disconnect()
  }, [mapReady])

  // ── Basemap ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current, osm = osmLayerRef.current, sat = satLayerRef.current
    if (!map || !osm || !sat) return
    if (basemap === 'sat') { map.removeLayer(osm); sat.addTo(map) }
    else                   { map.removeLayer(sat); osm.addTo(map) }
  }, [basemap])

  useEffect(() => { tramosMapRef.current = tramosMap }, [tramosMap])

  // ── Sincronizar tramosMap → capas Leaflet ─────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current, Lf = LfRef.current
    if (!map || !Lf || !mapReady) return

    // Eliminar capas de tramos que ya no están
    const currentIds = new Set(tramosMap.map(t => t.id))
    for (const [id, layer] of tramoLayersRef.current) {
      if (!currentIds.has(id)) {
        map.removeLayer(layer)
        tramoLayersRef.current.delete(id)
        tramoProgMarkersRef.current.delete(id)
      }
    }

    // Agregar capas de tramos nuevos
    for (const tramo of tramosMap) {
      if (tramoLayersRef.current.has(tramo.id)) continue
      if (tramo.coords.length < 2) continue
      const group = Lf.layerGroup().addTo(map)
      Lf.polyline(tramo.coords, { color: tramo.color, weight: 4, opacity: 0.92 })
        .bindTooltip(
          `<span style="font-family:monospace;font-size:10px;color:${tramo.color};font-weight:700">${tramo.label}</span>`,
          { permanent: true, direction: 'center', className: 'desm-label' }
        ).addTo(group)
      // Progresivas del tramo confirmado
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pms: any[] = []
      for (const { pos, dist } of getProgPositions(tramo.coords, progIntervalRef.current)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pm: any = Lf.circleMarker(pos, { radius: 3, color: tramo.color, weight: 2, fillColor: '#0a0a0a', fillOpacity: 1 }).addTo(group)
        pm.bindTooltip(fmtProgDist(dist), { permanent: true, direction: 'top', className: 'desm-prog', offset: [0, -4] })
        pm.openTooltip()
        pms.push(pm)
      }
      tramoLayersRef.current.set(tramo.id, group)
      tramoProgMarkersRef.current.set(tramo.id, pms)
    }

    // Si se agregó un tramo nuevo (count creció), limpiar la línea + prog markers pendientes
    if (tramosMap.length > prevTramoCountRef.current && pendingLineRef.current) {
      map.removeLayer(pendingLineRef.current)
      pendingLineRef.current = null
      pendingProgMarkersRef.current.forEach(m => map.removeLayer(m))
      pendingProgMarkersRef.current = []
      setPendingResult(null)
    }
    prevTramoCountRef.current = tramosMap.length
  }, [tramosMap, mapReady])

  // ── Dibujar tramo ─────────────────────────────────────────────────────────────
  const startDraw = useCallback(() => {
    const map = mapRef.current, Lf = LfRef.current
    if (!map || !Lf || drawing) return

    // Limpiar línea pendiente anterior
    if (pendingLineRef.current) { map.removeLayer(pendingLineRef.current); pendingLineRef.current = null }
    setPendingResult(null)
    setDrawing(true); setHudInfo(null); setCanUndo(false)
    onDrawingChange?.(true)
    map.getContainer().style.cursor = 'crosshair'

    const pts: LatLng[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const committedLine = Lf.polyline([], { color: pendingColor, weight: 3.5, opacity: 0.95 }).addTo(map)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const previewSeg    = Lf.polyline([], { color: pendingColor, weight: 2, dashArray: '8 5', opacity: 0.55 }).addTo(map)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snapRing = Lf.circleMarker([0, 0], {
      radius: 10, color: '#F5C300', weight: 2.5, fill: false, opacity: 0,
    }).addTo(map)
    let currentSnapPt: LatLng | null = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vmList: any[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const localProgMarkers: any[] = []

    const refreshProgMarkers = (currentPts: LatLng[]) => {
      localProgMarkers.forEach(m => map.removeLayer(m)); localProgMarkers.length = 0
      drawProgMarkersRef.current = localProgMarkers
      if (currentPts.length < 2) return
      for (const { pos, dist } of getProgPositions(currentPts, progIntervalRef.current)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pm: any = Lf.circleMarker(pos, { radius: 3, color: pendingColor, weight: 2, fillColor: '#0a0a0a', fillOpacity: 1 }).addTo(map)
        pm.bindTooltip(fmtProgDist(dist), { permanent: true, direction: 'top', className: 'desm-prog', offset: [0, -4] })
        pm.openTooltip()
        localProgMarkers.push(pm)
      }
    }
    updateDrawProgRef.current = () => refreshProgMarkers(pts)

    const cleanup = () => {
      map.off('click',       onLineClick)
      map.off('mousemove',   onLineMove)
      map.off('contextmenu', onLineRight)
      map.removeLayer(committedLine)
      map.removeLayer(previewSeg)
      map.removeLayer(snapRing)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vmList.forEach((m: any) => map.removeLayer(m)); vmList.length = 0
      localProgMarkers.forEach(m => map.removeLayer(m)); localProgMarkers.length = 0
      drawProgMarkersRef.current = []
      updateDrawProgRef.current = null
      map.getContainer().style.cursor = ''
      drawStateRef.current = null
      setHudInfo(null); setCanUndo(false)
    }

    const redraw = (cursor?: LatLng) => {
      committedLine.setLatLngs(pts.length >= 1 ? pts : [])
      if (cursor && pts.length >= 1) previewSeg.setLatLngs([[pts[pts.length-1], cursor]])
      else previewSeg.setLatLngs([])
    }

    const updateHUD = (cursor?: LatLng) => {
      if (!pts.length) return
      const all = cursor ? [...pts, cursor] : pts
      setHudInfo({ vertices: pts.length, lastSegM: pts.length >= 1 && cursor ? segLen(pts[pts.length-1], cursor) : 0, totalM: totalLen(all) })
    }

    const undo = () => {
      if (pts.length === 0) return
      const last = vmList.pop()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (last) map.removeLayer(last)
      pts.pop(); redraw()
      setCanUndo(pts.length > 0)
      if (pts.length > 0) setHudInfo({ vertices: pts.length, lastSegM: 0, totalM: totalLen(pts) })
      else setHudInfo(null)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onLineClick = (e: any) => {
      const ll: LatLng = currentSnapPt ?? [e.latlng.lat, e.latlng.lng]
      pts.push(ll)
      const isFirst = pts.length === 1
      const vm = Lf.circleMarker(ll, {
        radius: isFirst ? 6 : 4, color: pendingColor,
        fillColor: isFirst ? '#fff' : pendingColor,
        fillOpacity: isFirst ? 0.9 : 0.85,
        weight: isFirst ? 2 : 1.5, opacity: 1,
      }).addTo(map)
      vmList.push(vm); redraw(); updateHUD(); setCanUndo(true)
      refreshProgMarkers(pts)
      drawStateRef.current = { pts: [...pts], cleanup, undo }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onLineMove = (e: any) => {
      const cursor: LatLng = [e.latlng.lat, e.latlng.lng]
      const snap = findSnapPoint(map, cursor, tramosMapRef.current)
      if (snap) {
        snapRing.setLatLng(snap); snapRing.setStyle({ opacity: 1 })
        currentSnapPt = snap
        if (pts.length) { redraw(snap); updateHUD(snap) }
      } else {
        if (snapRing.options.opacity !== 0) snapRing.setStyle({ opacity: 0 })
        currentSnapPt = null
        if (pts.length) { redraw(cursor); updateHUD(cursor) }
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onLineRight = (e: any) => {
      if (e?.originalEvent) e.originalEvent.preventDefault()
      if (pts.length < 2) return
      cleanup(); setDrawing(false); onDrawingChange?.(false)
      const lengthM = totalLen(pts)
      // Mostrar línea como pendiente (punteada)
      const pendLine = Lf.polyline(pts, { color: pendingColor, weight: 3.5, opacity: 0.85, dashArray: '8 4' }).addTo(map)
      pendingLineRef.current = pendLine
      // Prog markers para la línea pendiente
      pendingProgMarkersRef.current.forEach(m => map.removeLayer(m))
      pendingProgMarkersRef.current = []
      for (const { pos, dist } of getProgPositions(pts, progIntervalRef.current)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pm: any = Lf.circleMarker(pos, { radius: 3, color: pendingColor, weight: 2, fillColor: '#0a0a0a', fillOpacity: 1 }).addTo(map)
        pm.bindTooltip(fmtProgDist(dist), { permanent: true, direction: 'top', className: 'desm-prog', offset: [0, -4] })
        pm.openTooltip()
        pendingProgMarkersRef.current.push(pm)
      }
      const result = { coords: [...pts], lengthM }
      setPendingResult(result)
      onLineDone(result.coords, result.lengthM)
    }

    drawStateRef.current = { pts, cleanup, undo }
    map.on('click',       onLineClick)
    map.on('mousemove',   onLineMove)
    map.on('contextmenu', onLineRight)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing, pendingColor, onLineDone, onDrawingChange])

  const cancelDraw = useCallback(() => {
    drawStateRef.current?.cleanup()
    setDrawing(false); setHudInfo(null); setCanUndo(false)
    setPendingResult(null)
    onDrawingChange?.(false)
    if (pendingLineRef.current) { mapRef.current?.removeLayer(pendingLineRef.current); pendingLineRef.current = null }
    pendingProgMarkersRef.current.forEach(m => mapRef.current?.removeLayer(m))
    pendingProgMarkersRef.current = []
  }, [onDrawingChange])

  // ── Actualizar progresivas cuando cambia el intervalo ─────────────────────────
  useEffect(() => {
    progIntervalRef.current = progInterval
    // Durante dibujo activo
    updateDrawProgRef.current?.()
    const map = mapRef.current, Lf = LfRef.current
    if (!map || !Lf || !mapReady) return
    // Tramos confirmados
    for (const [id, markers] of tramoProgMarkersRef.current) {
      markers.forEach(m => map.removeLayer(m))
      const tramo = tramosMap.find(t => t.id === id)
      if (!tramo) continue
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const newMs: any[] = []
      for (const { pos, dist } of getProgPositions(tramo.coords, progInterval)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pm: any = Lf.circleMarker(pos, { radius: 3, color: tramo.color, weight: 2, fillColor: '#0a0a0a', fillOpacity: 1 }).addTo(map)
        pm.bindTooltip(fmtProgDist(dist), { permanent: true, direction: 'top', className: 'desm-prog', offset: [0, -4] })
        pm.openTooltip(); newMs.push(pm)
      }
      tramoProgMarkersRef.current.set(id, newMs)
    }
    // Línea pendiente
    if (pendingProgMarkersRef.current.length > 0 && pendingLineRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawPts: LatLng[] = pendingLineRef.current.getLatLngs().map((ll: any) => [ll.lat, ll.lng] as LatLng)
      pendingProgMarkersRef.current.forEach(m => map.removeLayer(m))
      pendingProgMarkersRef.current = []
      for (const { pos, dist } of getProgPositions(rawPts, progInterval)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pm: any = Lf.circleMarker(pos, { radius: 3, color: pendingColor, weight: 2, fillColor: '#0a0a0a', fillOpacity: 1 }).addTo(map)
        pm.bindTooltip(fmtProgDist(dist), { permanent: true, direction: 'top', className: 'desm-prog', offset: [0, -4] })
        pm.openTooltip(); pendingProgMarkersRef.current.push(pm)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progInterval, mapReady])

  // ── Toggle capas GeoJSON ──────────────────────────────────────────────────────
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
                { permanent: true, direction: 'center', className: 'desm-label' }
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
            html: `<div style="width:14px;height:14px;border-radius:50%;background:${c};border:2px solid #111;display:flex;align-items:center;justify-content:center;font-size:6px;font-weight:800;color:#111;box-shadow:0 2px 5px rgba(0,0,0,.7)">${s.numero}</div>`,
            iconSize: [14,14], iconAnchor: [7,7],
          })
          Lf.marker([s.lat, s.lng] as LatLng, { icon })
            .bindTooltip(`<b style="color:${c}">Sede ${s.numero}</b> · ${s.nombre}`, { direction: 'top', className: 'desm-label' })
            .addTo(group)
        })
      } else if (key.startsWith('rp')) {
        if (!geoCacheRef.current.rp)
          geoCacheRef.current.rp = await fetch('/geo/geo_rp.json').then(r => r.json())
        const rpData = geoCacheRef.current.rp[key]
        if (rpData) {
          const c = LAYER_COLORS[key]
          const wt = key === 'rpPavimentada' ? 2.5 : key === 'rpMejorada' ? 2 : 1.5
          Lf.geoJSON(rpData, {
            style: { color: c, weight: wt, opacity: 0.85, fillOpacity: 0 },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onEachFeature(feature: any, layer: any) {
              const p = feature.properties ?? {}
              layer.bindTooltip(
                `<b style="color:${c}">RP${p.Nombre ? ' N°'+p.Nombre : ''}</b> · ${LAYER_LABELS[key]}`,
                { sticky: true, direction: 'top' }
              )
            },
          }).addTo(group)
        }
      } else if (key.startsWith('cc')) {
        if (!geoCacheRef.current.cc)
          geoCacheRef.current.cc = await fetch('/geo/geo_cc.json').then(r => r.json())
        const zona = key.slice(2)
        const ccData = geoCacheRef.current.cc[zona]
        const c = LAYER_COLORS[key]
        if (ccData) {
          Lf.geoJSON(ccData, {
            style: { color: c, weight: 1.5, opacity: 0.85, fillOpacity: 0 },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onEachFeature(feature: any, layer: any) {
              const p = feature.properties ?? {}
              layer.bindTooltip(
                `<b style="color:${c}">CC ${p.CC||''}</b> · Zona ${zona}`,
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

  // ── Helpers visuales ──────────────────────────────────────────────────────────
  const fmtDist = (m: number) => m >= 1000 ? `${(m/1000).toFixed(3)} km` : `${Math.round(m).toLocaleString('es-AR')} m`
  const mono: React.CSSProperties = { fontFamily: 'monospace' }
  const toolBtn = (active?: boolean, c?: string): React.CSSProperties => ({
    padding: '4px 10px', fontSize: 12, ...mono, cursor: 'pointer', borderRadius: 2,
    border:  `1px solid ${active ? (c ?? pendingColor)+'99' : '#252525'}`,
    background: active ? `${c ?? pendingColor}1a` : '#0c0c0c',
    color: active ? (c ?? pendingColor) : '#555',
  })
  const activeLayerCount = Object.values(layerVis).filter(Boolean).length

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
        background: '#080808', borderBottom: '1px solid #1a1a1a', flexShrink: 0, flexWrap: 'wrap',
      }}>
        {/* Estado inicial o post-confirmación */}
        {!drawing && !pendingResult && mapReady && (
          <button onClick={startDraw} style={{
            ...toolBtn(), color: pendingColor, borderColor: `${pendingColor}66`,
            background: `${pendingColor}15`, padding: '4px 14px', fontWeight: 700,
          }}>
            ↗ Trazar tramo
          </button>
        )}

        {/* Dibujando */}
        {drawing && (
          <>
            <span style={{ fontSize: 12, color: `${pendingColor}cc`, ...mono }}>
              ● Clic para agregar punto · Clic derecho para terminar
            </span>
            {canUndo && (
              <button onClick={() => drawStateRef.current?.undo()} style={toolBtn()}>↩ Deshacer</button>
            )}
            <button onClick={cancelDraw} style={toolBtn()}>✕ Cancelar</button>
          </>
        )}

        {/* Línea pendiente (dibujada, esperando "Agregar tramo") */}
        {pendingResult && !drawing && (
          <>
            <span style={{ fontSize: 12, color: pendingColor, ...mono, fontWeight: 700 }}>
              ✓ {fmtDist(pendingResult.lengthM)} · {pendingResult.coords.length} vért.
            </span>
            <button onClick={cancelDraw} style={toolBtn()}>↺ Redibujar</button>
            <span style={{ fontSize: 12, color: '#444', ...mono }}>← Completá el formulario y presioná + Agregar tramo</span>
          </>
        )}

        <div style={{ flex: 1 }} />

        {/* Intervalo de progresivas */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <span style={{ fontSize: 11, color: '#444', fontFamily: 'monospace', marginRight: 2 }}>Prog.</span>
          {([50, 100, 250, 500, 1000] as const).map(v => (
            <button key={v} onClick={() => setProgInterval(v)}
              style={{ ...toolBtn(progInterval === v, '#888'), fontSize: 11, padding: '2px 5px' }}>
              {v >= 1000 ? '1km' : `${v}m`}
            </button>
          ))}
        </div>

        {/* Basemap */}
        <div style={{ display: 'flex', gap: 2 }}>
          <button onClick={() => setBasemap('osm')} style={{ ...toolBtn(basemap === 'osm', '#888'), fontSize: 12 }}>OSM</button>
          <button onClick={() => setBasemap('sat')} style={{ ...toolBtn(basemap === 'sat', '#888'), fontSize: 12 }}>Sat.</button>
        </div>

        {/* Capas */}
        <button
          onClick={() => setLayerPanelOpen(v => !v)}
          style={{ ...toolBtn(layerPanelOpen, '#F5C300'), fontSize: 12 }}
        >
          ⊞ Capas{activeLayerCount > 0 ? ` (${activeLayerCount})` : ''}
        </button>
      </div>

      {/* ── Mapa ────────────────────────────────────────────────────────────── */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <div ref={mapDivRef} style={{ width: '100%', height: '100%' }} />

        {/* HUD en tiempo real */}
        {hudInfo && (
          <div style={{
            position: 'absolute', bottom: 12, left: 12, zIndex: 999,
            background: '#0a0a0aee', border: `1px solid ${pendingColor}55`,
            borderRadius: 4, padding: '8px 12px', ...mono, fontSize: 12, lineHeight: 1.8, color: '#888', minWidth: 175,
          }}>
            <div style={{ fontSize: 11, color: '#444', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
              Trayecto en curso
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <span style={{ color: '#555' }}>Vértices</span>
              <span style={{ color: '#aaa' }}>{hudInfo.vertices}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <span style={{ color: '#555' }}>Últ. seg.</span>
              <span>{fmtDist(hudInfo.lastSegM)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginTop: 4, paddingTop: 4, borderTop: `1px solid ${pendingColor}33` }}>
              <span style={{ color: pendingColor }}>Total</span>
              <span style={{ color: pendingColor, fontWeight: 700, fontSize: 13 }}>{fmtDist(hudInfo.totalM)}</span>
            </div>
          </div>
        )}

        {/* Instrucciones iniciales */}
        {!drawing && !pendingResult && tramosMap.length === 0 && mapReady && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%,-50%)', zIndex: 998,
            textAlign: 'center', pointerEvents: 'none',
          }}>
            <div style={{
              background: '#0a0a0acc', border: `1px solid ${pendingColor}33`,
              borderRadius: 4, padding: '10px 18px', ...mono, fontSize: 12, color: '#444',
            }}>
              Navegá hasta el tramo de obra<br/>
              y presioná <span style={{ color: pendingColor }}>↗ Trazar tramo</span>
            </div>
          </div>
        )}

        {/* Panel de capas */}
        {mapReady && layerPanelOpen && (
          <div style={{
            position: 'absolute', top: 10, right: 10, zIndex: 999,
            background: 'rgba(10,10,10,0.94)', border: '1px solid #1e1e1e',
            padding: '8px 10px', minWidth: 148, maxHeight: 300, overflowY: 'auto',
          }}>
            <div style={{ fontSize: 11, color: '#444', letterSpacing: 1.2, ...mono, textTransform: 'uppercase', marginBottom: 5 }}>Base</div>
            {(['zonas','sedes'] as LayerKey[]).map(k => (
              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginBottom: 5, fontSize: 12, ...mono, color: layerVis[k] ? LAYER_COLORS[k] : '#444', opacity: layerLoading[k] ? 0.5 : 1 }}>
                <input type="checkbox" checked={layerVis[k]} disabled={layerLoading[k]} onChange={() => void toggleLayer(k)}
                  style={{ accentColor: LAYER_COLORS[k], width: 11, height: 11, flexShrink: 0, cursor: 'pointer' }} />
                {layerLoading[k] ? '…' : LAYER_LABELS[k]}
              </label>
            ))}
            <div style={{ fontSize: 11, color: '#444', letterSpacing: 1.2, ...mono, textTransform: 'uppercase', marginTop: 8, marginBottom: 5, borderTop: '1px solid #1a1a1a', paddingTop: 6 }}>Rutas Prov.</div>
            {(['rpPavimentada','rpMejorada','rpEnObra','rpTierra'] as LayerKey[]).map(k => (
              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginBottom: 5, fontSize: 12, ...mono, color: layerVis[k] ? LAYER_COLORS[k] : '#444', opacity: layerLoading[k] ? 0.5 : 1 }}>
                <input type="checkbox" checked={layerVis[k]} disabled={layerLoading[k]} onChange={() => void toggleLayer(k)}
                  style={{ accentColor: LAYER_COLORS[k], width: 11, height: 11, flexShrink: 0, cursor: 'pointer' }} />
                <span style={{ display: 'inline-block', width: 14, height: 2, background: LAYER_COLORS[k], flexShrink: 0 }} />
                {layerLoading[k] ? '…' : LAYER_LABELS[k]}
              </label>
            ))}
            <div style={{ fontSize: 11, color: '#444', letterSpacing: 1.2, ...mono, textTransform: 'uppercase', marginTop: 8, marginBottom: 5, borderTop: '1px solid #1a1a1a', paddingTop: 6 }}>Red CC</div>
            {(['ccZI','ccZII','ccZIII','ccZIV','ccZV'] as LayerKey[]).map(k => (
              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginBottom: 5, fontSize: 12, ...mono, color: layerVis[k] ? LAYER_COLORS[k] : '#444', opacity: layerLoading[k] ? 0.5 : 1 }}>
                <input type="checkbox" checked={layerVis[k]} disabled={layerLoading[k]} onChange={() => void toggleLayer(k)}
                  style={{ accentColor: LAYER_COLORS[k], width: 11, height: 11, flexShrink: 0, cursor: 'pointer' }} />
                <span style={{ display: 'inline-block', width: 14, height: 2, background: LAYER_COLORS[k], flexShrink: 0 }} />
                {layerLoading[k] ? '…' : LAYER_LABELS[k]}
              </label>
            ))}
          </div>
        )}

        {/* Loading */}
        {!mapReady && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 997,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#0e0e0e', ...mono, fontSize: 13, color: '#333',
          }}>
            Cargando mapa…
          </div>
        )}
      </div>
    </div>
  )
}
