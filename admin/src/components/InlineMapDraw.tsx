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

// ── Layer control ─────────────────────────────────────────────────────────────
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

// ── Parsers de archivos drone ──────────────────────────────────────────────────
function parseKMLPolygons(text: string): LatLng[][] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(text, 'text/xml')
  const rings: LatLng[][] = []
  const polygons = Array.from(doc.getElementsByTagName('Polygon'))
  for (const polygon of polygons) {
    const outerEls = polygon.getElementsByTagName('outerBoundaryIs')
    const scope    = outerEls.length > 0 ? outerEls[0] : polygon
    const coordEls = scope.getElementsByTagName('coordinates')
    if (!coordEls.length) continue
    const raw  = coordEls[0].textContent?.trim() ?? ''
    const pts: LatLng[] = raw.split(/\s+/).filter(Boolean).flatMap(token => {
      const parts = token.split(',').map(Number)
      if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1]))
        return [[parts[1], parts[0]] as LatLng]  // KML: lon,lat → lat,lng
      return []
    })
    if (pts.length >= 3) rings.push(pts)
  }
  return rings
}

function parseGeoJSONPolygons(text: string): LatLng[][] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = JSON.parse(text)
  const rings: LatLng[][] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processGeom = (geom: any) => {
    if (!geom) return
    if (geom.type === 'Polygon') {
      const pts: LatLng[] = (geom.coordinates[0] ?? []).map(([lng, lat]: number[]) => [lat, lng] as LatLng)
      if (pts.length >= 3) rings.push(pts)
    } else if (geom.type === 'MultiPolygon') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      geom.coordinates.forEach((poly: any) => {
        const pts: LatLng[] = (poly[0] ?? []).map(([lng, lat]: number[]) => [lat, lng] as LatLng)
        if (pts.length >= 3) rings.push(pts)
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
  return rings
}

// ── Tipos internos ────────────────────────────────────────────────────────────
interface ConfirmedPoly {
  id: string
  side: 'izq' | 'der'
  monte: MonteKey
  area_ha: number
  pts: LatLng[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  layer: any
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  color: string
  hideMonte?: boolean   // oculta el selector de tipo de monte (p.ej. en Desmalezado)
  onConfirm: (id: string, side: 'izq' | 'der', monte: MonteKey, area_ha: number, pts: [number,number][]) => void
  onDelete:  (id: string) => void
  onUpdate?: (id: string, area_ha: number, pts: [number,number][]) => void
  onCancel?: () => void
}

// ── Componente ────────────────────────────────────────────────────────────────
export default function InlineMapDraw({ color, hideMonte = false, onConfirm, onDelete, onUpdate, onCancel }: Props) {
  const [side,       setSide]       = useState<'izq' | 'der'>('izq')
  const [monte,      setMonte]      = useState<MonteKey>('semitupido')
  const [drawing,    setDrawing]    = useState(false)
  const [polyResult, setPolyResult] = useState<{ area_ha: number; pts: LatLng[] } | null>(null)
  const [polyHUD,    setPolyHUD]    = useState<{
    vertices: number; perimM: number; areaHa: number; lastSegM: number
  } | null>(null)
  const [hudUnit,     setHudUnit]     = useState<'ha' | 'm2' | 'km2'>('ha')
  const [mapReady,    setMapReady]    = useState(false)
  const [basemap,     setBasemap]     = useState<'osm' | 'sat'>('osm')
  const [editingId,   setEditingId]   = useState<string | null>(null)
  const [hasPolygons, setHasPolygons] = useState(false)

  const mapDivRef    = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
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
  const confirmedRef = useRef<ConfirmedPoly[]>([])
  const editLayersRef = useRef<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    markers: any[]; livePoly: any; origId: string; origPts: LatLng[]
  } | null>(null)

  // ── Layer control ────────────────────────────────────────────────────────
  const [layerVis,       setLayerVis]       = useState<Record<LayerKey, boolean>>(LAYER_DEFAULTS)
  const [layerLoading,   setLayerLoading]   = useState<Record<LayerKey, boolean>>(LAYER_DEFAULTS)
  const [layerPanelOpen, setLayerPanelOpen] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layerRefsMap = useRef<Map<LayerKey, any>>(new Map())
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const geoCacheRef  = useRef<Record<string, any>>({})

  // ── Inyectar CSS dark para popups / tooltips Leaflet ─────────────────────
  useEffect(() => {
    const style = document.createElement('style')
    style.id = 'desbosque-map-styles'
    style.textContent = `
      .desb-popup .leaflet-popup-content-wrapper {
        background: #111; border: 1px solid #222; border-radius: 4px;
        box-shadow: 0 4px 16px #000a; padding: 0;
      }
      .desb-popup .leaflet-popup-content { margin: 0; }
      .desb-popup .leaflet-popup-tip-container { display: none; }
      .desb-label { background: transparent !important; border: none !important;
        box-shadow: none !important; padding: 0 !important; }
      .desb-label .leaflet-tooltip-content { padding: 0; }
    `
    if (!document.getElementById('desbosque-map-styles')) document.head.appendChild(style)
    return () => { document.getElementById('desbosque-map-styles')?.remove() }
  }, [])

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

  // ── Llamar invalidateSize cuando el contenedor vuelve a ser visible ─────────
  // (fix para display:none → display:flex, e.g. al cambiar de sub-tab)
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

  // ── Cambio de capa base ───────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    const osm = osmLayerRef.current
    const sat = satLayerRef.current
    if (!map || !osm || !sat) return
    if (basemap === 'sat') { map.removeLayer(osm); sat.addTo(map) }
    else                   { map.removeLayer(sat); osm.addTo(map) }
  }, [basemap])

  // ── Callbacks globales para botones dentro de popups Leaflet ─────────────
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__desbDelete = (id: string) => {
      const map = mapRef.current
      const idx = confirmedRef.current.findIndex(p => p.id === id)
      if (idx >= 0 && map) {
        map.closePopup()
        map.removeLayer(confirmedRef.current[idx].layer)
        confirmedRef.current.splice(idx, 1)
        if (confirmedRef.current.length === 0) setHasPolygons(false)
      }
      onDelete(id)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__desbEdit = (id: string) => {
      mapRef.current?.closePopup()
      startEditById(id)
    }
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).__desbDelete
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).__desbEdit
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onDelete])

  // ── Agregar polígono confirmado al mapa ───────────────────────────────────
  const addConfirmedLayer = useCallback((
    id: string, side: 'izq' | 'der', monte: MonteKey, area_ha: number, pts: LatLng[]
  ) => {
    const map = mapRef.current; const Lf = LfRef.current
    if (!map || !Lf) return
    const monteOpt  = MONTE_OPTS.find(o => o.value === monte)!
    const sideColor = side === 'izq' ? '#66bb6a' : '#42a5f5'
    const sideLbl   = side === 'izq' ? '← Izq.' : 'Der. →'
    const vol       = Math.round(area_ha * monteOpt.factor).toLocaleString('es-AR')

    const layer = Lf.polygon(pts as [number, number][], {
      color: sideColor, fillColor: sideColor,
      fillOpacity: 0.18, weight: 2, dashArray: '5 4', opacity: 0.9,
    }).addTo(map)

    // Tooltip permanente en el centroide
    layer.bindTooltip(
      `<span style="font-family:monospace;font-size:9px;color:${sideColor};white-space:nowrap">${sideLbl}</span>`,
      { permanent: true, direction: 'center', className: 'desb-label' }
    )

    // Popup con acciones
    layer.bindPopup(`
      <div style="font-family:monospace;font-size:11px;color:#ccc;padding:10px 14px;min-width:180px">
        <div style="color:${sideColor};font-weight:700;font-size:12px;margin-bottom:2px">${sideLbl}</div>
        ${!hideMonte ? `<div style="color:#555;font-size:9px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">${monteOpt.label}</div>` : ''}
        <div style="color:#aaa;margin-bottom:10px">
          <span style="font-weight:700;font-size:13px">${area_ha.toFixed(4)} ha</span>
          ${!hideMonte ? `<span style="color:#555;margin-left:6px;font-size:9px">~${vol} m³ arb.</span>` : ''}
        </div>
        <div style="display:flex;gap:6px">
          <button onclick="window.__desbEdit('${id}')"
            style="flex:1;background:#0a160a;border:1px solid #2a4a2a;color:#6d6;padding:5px 8px;cursor:pointer;font-family:monospace;font-size:10px;border-radius:2px">
            ✎ Editar
          </button>
          <button onclick="window.__desbDelete('${id}')"
            style="flex:1;background:#160a0a;border:1px solid #4a2a2a;color:#d66;padding:5px 8px;cursor:pointer;font-family:monospace;font-size:10px;border-radius:2px">
            × Eliminar
          </button>
        </div>
      </div>
    `, { className: 'desb-popup', maxWidth: 240 })

    confirmedRef.current.push({ id, side, monte, area_ha, pts, layer })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hideMonte])

  // ── Usar polígono dibujado → confirmar y resetear ─────────────────────────
  const handleUse = useCallback(() => {
    if (!polyResult) return
    const id = `poly-${Date.now()}`

    // Limpiar preview temporal
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    previewRef.current.forEach((l: any) => mapRef.current?.removeLayer(l))
    previewRef.current = []

    // Agregar polígono permanente al mapa
    addConfirmedLayer(id, side, monte, polyResult.area_ha, polyResult.pts)
    setHasPolygons(true)

    // Notificar parent
    onConfirm(id, side, monte, polyResult.area_ha, polyResult.pts as [number,number][])

    // Reset → listo para siguiente dibujo
    setPolyResult(null)
    setPolyHUD(null)
  }, [polyResult, side, monte, addConfirmedLayer, onConfirm])

  // ── Modo edición de vértices ──────────────────────────────────────────────
  const startEditById = useCallback((id: string) => {
    const map = mapRef.current; const Lf = LfRef.current
    if (!map || !Lf) return
    const confirmed = confirmedRef.current.find(p => p.id === id)
    if (!confirmed) return

    // Ocultar polígono original
    map.removeLayer(confirmed.layer)

    const pts = confirmed.pts.map(p => [...p] as LatLng) // copia mutable

    // Icono de vértice draggable
    const vIcon = (isFirst: boolean) => Lf.divIcon({
      html: `<div style="width:${isFirst ? 12 : 10}px;height:${isFirst ? 12 : 10}px;border-radius:50%;background:${isFirst ? '#fff' : '#ccc'};border:2px solid ${color};box-shadow:0 0 5px #000;cursor:grab"></div>`,
      className: '',
      iconSize:   [isFirst ? 12 : 10, isFirst ? 12 : 10],
      iconAnchor: [isFirst ? 6  : 5,  isFirst ? 6  : 5 ],
    })

    // Polígono live mientras se edita
    const livePoly = Lf.polygon(pts as [number, number][], {
      color, fillColor: color, fillOpacity: 0.3, weight: 2, dashArray: '4 4',
    }).addTo(map)

    // Marcadores draggables en cada vértice
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const markers: any[] = pts.map((pt, i) => {
      const m = Lf.marker(pt as [number, number], {
        draggable: true,
        icon: vIcon(i === 0),
        zIndexOffset: 1000,
      }).addTo(map)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      m.on('drag', (ev: any) => {
        pts[i] = [ev.latlng.lat, ev.latlng.lng]
        livePoly.setLatLngs(pts as [number, number][])
      })
      return m
    })

    editLayersRef.current = { markers, livePoly, origId: id, origPts: confirmed.pts }
    setEditingId(id)
  }, [color])

  // ── Confirmar edición ──────────────────────────────────────────────────────
  const confirmEdit = useCallback(() => {
    const map = mapRef.current; const Lf = LfRef.current
    if (!map || !Lf || !editLayersRef.current) return
    const { markers, livePoly, origId } = editLayersRef.current

    // Nuevos puntos desde posición actual de los marcadores
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newPts: LatLng[] = markers.map((m: any) => {
      const ll = m.getLatLng(); return [ll.lat, ll.lng]
    })
    const newArea = polygonAreaHa(newPts)

    // Limpiar capas de edición
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    markers.forEach((m: any) => map.removeLayer(m))
    map.removeLayer(livePoly)
    editLayersRef.current = null

    // Actualizar confirmedRef y recrear polígono
    const idx = confirmedRef.current.findIndex(p => p.id === origId)
    if (idx >= 0) {
      const old = confirmedRef.current[idx]
      confirmedRef.current.splice(idx, 1)
      addConfirmedLayer(old.id, old.side, old.monte, newArea, newPts)
    }

    if (onUpdate) onUpdate(origId, newArea, newPts as [number,number][])
    setEditingId(null)
  }, [addConfirmedLayer, onUpdate])

  // ── Cancelar edición ──────────────────────────────────────────────────────
  const cancelEdit = useCallback(() => {
    const map = mapRef.current
    if (!map || !editLayersRef.current) return
    const { markers, livePoly, origId } = editLayersRef.current

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    markers.forEach((m: any) => map.removeLayer(m))
    map.removeLayer(livePoly)
    editLayersRef.current = null

    // Restaurar polígono original
    const confirmed = confirmedRef.current.find(p => p.id === origId)
    if (confirmed) map.addLayer(confirmed.layer)

    setEditingId(null)
  }, [])

  // ── Iniciar dibujo de polígono ────────────────────────────────────────────
  const startDraw = useCallback(() => {
    const map = mapRef.current; const Lf = LfRef.current
    if (!map || !Lf || drawing) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    previewRef.current.forEach((l: any) => map.removeLayer(l)); previewRef.current = []
    setPolyResult(null); setDrawing(true); setPolyHUD(null)
    map.getContainer().style.cursor = 'crosshair'

    const pts: LatLng[] = []
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
      } else { previewSeg.setLatLngs([]) }
      if (cursor && pts.length >= 3) {
        closeSeg.setLatLngs([[cursor, pts[0]] as [number, number][]])
        closeSeg.setStyle({ opacity: snapping ? 0.85 : 0.22 })
      } else { closeSeg.setLatLngs([]) }
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
        color, fillColor: color, fillOpacity: 0.35, weight: 2, opacity: 0.9,
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

  // ── Importar KML / GeoJSON desde archivo ──────────────────────────────────
  const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''  // reset para permitir reimportar el mismo archivo

    const reader = new FileReader()
    reader.onload = () => {
      const text = reader.result as string
      let polygons: LatLng[][] = []
      try {
        if (file.name.toLowerCase().endsWith('.kml'))
          polygons = parseKMLPolygons(text)
        else
          polygons = parseGeoJSONPolygons(text)
      } catch (err) {
        console.error('Error parseando archivo:', err)
        return
      }
      if (polygons.length === 0) return

      const map = mapRef.current; const Lf = LfRef.current
      if (!map || !Lf) return

      // Limpiar estado de dibujo previo
      drawStateRef.current?.cleanup()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      previewRef.current.forEach((l: any) => map.removeLayer(l))
      previewRef.current = []
      setDrawing(false); setPolyResult(null); setPolyHUD(null)

      if (polygons.length === 1) {
        // Un polígono → flujo de preview igual que al dibujar
        const pts     = polygons[0]
        const area_ha = polygonAreaHa(pts)
        const poly    = Lf.polygon(pts as [number, number][], {
          color, fillColor: color, fillOpacity: 0.35, weight: 2, opacity: 0.9,
        }).addTo(map)
        previewRef.current = [poly]
        setPolyResult({ area_ha, pts })
        map.fitBounds(poly.getBounds(), { padding: [40, 40] })
      } else {
        // Múltiples polígonos → confirmar todos con el lado/monte actuales
        const allPts: LatLng[] = []
        polygons.forEach(pts => {
          const area_ha = polygonAreaHa(pts)
          const id      = `poly-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
          addConfirmedLayer(id, side, monte, area_ha, pts)
          onConfirm(id, side, monte, area_ha, pts as [number, number][])
          allPts.push(...pts)
        })
        setHasPolygons(true)
        if (allPts.length) map.fitBounds(Lf.latLngBounds(allPts as [number, number][]), { padding: [40, 40] })
      }
    }
    reader.readAsText(file)
  }, [color, side, monte, addConfirmedLayer, onConfirm])

  // ── Toggle de capas GeoJSON ───────────────────────────────────────────────
  const toggleLayer = useCallback(async (key: LayerKey) => {
    const map = mapRef.current; const Lf = LfRef.current
    if (!map || !Lf) return

    // Si ya existe → remover
    if (layerRefsMap.current.has(key)) {
      map.removeLayer(layerRefsMap.current.get(key))
      layerRefsMap.current.delete(key)
      setLayerVis(prev => ({ ...prev, [key]: false }))
      return
    }

    setLayerLoading(prev => ({ ...prev, [key]: true }))
    try {
      let group = Lf.layerGroup()

      // ── Base: zonas ──────────────────────────────────────────────────────
      if (key === 'zonas') {
        if (!geoCacheRef.current.bundle) {
          geoCacheRef.current.bundle = await fetch('/geo/geo_bundle.json').then(r => r.json())
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Object.entries(geoCacheRef.current.bundle.limites_zonas as Record<string, any>).forEach(([z, gj]) => {
          const c = ZONE_CLR[z] ?? '#888'
          Lf.geoJSON(gj, {
            style: { color: c, weight: 2, opacity: 0.7, fillOpacity: 0.04, fillColor: c },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onEachFeature: (_: any, layer: any) => {
              layer.bindTooltip(
                `<span style="font-family:monospace;font-size:9px;color:${c}">Zona ${z}</span>`,
                { permanent: true, direction: 'center', className: 'desb-label' }
              )
            },
          }).addTo(group)
        })

      // ── Base: sedes ──────────────────────────────────────────────────────
      } else if (key === 'sedes') {
        if (!geoCacheRef.current.bundle) {
          geoCacheRef.current.bundle = await fetch('/geo/geo_bundle.json').then(r => r.json())
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(geoCacheRef.current.bundle.sedes as any[]).forEach((s: any) => {
          const c = s.color || '#F5C300'
          const icon = Lf.divIcon({
            className: '',
            html: `<div style="width:16px;height:16px;border-radius:50%;background:${c};border:2px solid #111;display:flex;align-items:center;justify-content:center;font-size:6px;font-weight:800;color:#111;box-shadow:0 2px 5px rgba(0,0,0,.7)">${s.numero}</div>`,
            iconSize: [16, 16], iconAnchor: [8, 8],
          })
          Lf.marker([s.lat, s.lng] as [number, number], { icon })
            .bindTooltip(
              `<b style="color:${c}">Sede ${s.numero}</b> · ${s.nombre}<br><span style="color:#aaa">${s.localidad} · ${s.zona}</span>`,
              { direction: 'top', className: 'desb-label' }
            ).addTo(group)
        })

      // ── Rutas Provinciales ───────────────────────────────────────────────
      } else if (key.startsWith('rp')) {
        if (!geoCacheRef.current.rp) {
          geoCacheRef.current.rp = await fetch('/geo/geo_rp.json').then(r => r.json())
        }
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
                `<b style="color:${c}">RP${num ? ' N°' + num : ''}</b> · ${LAYER_LABELS[key]}${zona ? ' · Zona ' + zona : ''}`,
                { sticky: true, direction: 'top' }
              )
            },
          }).addTo(group)
        }

      // ── Red CC por zona ──────────────────────────────────────────────────
      } else if (key.startsWith('cc')) {
        if (!geoCacheRef.current.cc) {
          geoCacheRef.current.cc = await fetch('/geo/geo_cc.json').then(r => r.json())
        }
        const zona   = key.slice(2) // 'ccZI' → 'ZI'
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
                `<b style="color:${c}">CC ${ccNum}</b> · Zona ${zona}${nm ? '<br>' + nm : ''}`,
                { sticky: true, direction: 'top' }
              )
            },
          }).addTo(group)
        }
      }

      group.addTo(map)
      layerRefsMap.current.set(key, group)
      setLayerVis(prev => ({ ...prev, [key]: true }))
    } catch (err) {
      console.error('Error cargando capa', key, err)
    } finally {
      setLayerLoading(prev => ({ ...prev, [key]: false }))
    }
  }, []) // stable: reads refs, not state

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
  const toolBtn = (active?: boolean, danger?: boolean): React.CSSProperties => ({
    padding: '4px 10px', fontSize: 10, ...mono, cursor: 'pointer', borderRadius: 2,
    border: `1px solid ${danger ? '#4a2a2a' : active ? color + '99' : '#252525'}`,
    background: danger ? '#160a0a' : active ? `${color}1a` : '#0c0c0c',
    color: danger ? '#d66' : active ? color : '#555',
  })

  const hudArea = polyHUD ? polyHUD.areaHa : polyResult?.area_ha ?? 0
  const showHUD = !!(polyHUD || polyResult)
  const editingConf = editingId ? confirmedRef.current.find(p => p.id === editingId) : null

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
        background: '#080808', borderBottom: '1px solid #1a1a1a', flexShrink: 0, flexWrap: 'wrap',
      }}>
        {editingId ? (
          /* ── Toolbar modo edición de vértices ── */
          <>
            <span style={{ fontSize: 9, color: '#555', ...mono, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Editando vértices
            </span>
            {editingConf && (
              <span style={{ fontSize: 10, color: '#888', ...mono }}>
                — {editingConf.side === 'izq' ? '← Izq.' : 'Der. →'} · {MONTE_OPTS.find(o => o.value === editingConf.monte)?.label.split(' ')[0]}
              </span>
            )}
            <span style={{ fontSize: 9, color: '#444', ...mono }}>
              Arrastrá los vértices para ajustar · los cambios se calculan al guardar
            </span>
            <div style={{ flex: 1 }} />
            <button onClick={cancelEdit}  style={{ ...toolBtn(), color: '#666' }}>✕ Cancelar</button>
            <button onClick={confirmEdit} style={{ ...toolBtn(true), padding: '5px 16px', fontSize: 11, fontWeight: 700 }}>
              ✓ Guardar edición
            </button>
          </>
        ) : (
          /* ── Toolbar normal ── */
          <>
            {/* Lado */}
            <span style={{ fontSize: 9, color: '#444', ...mono, textTransform: 'uppercase', letterSpacing: 0.8 }}>Lado</span>
            {(['izq', 'der'] as const).map(s => (
              <button key={s} disabled={drawing} onClick={() => setSide(s)} style={toolBtn(side === s)}>
                {s === 'izq' ? '← Izq.' : 'Der. →'}
              </button>
            ))}

            {!hideMonte && (
              <>
                <div style={{ width: 1, height: 14, background: '#1e1e1e', margin: '0 2px' }} />
                {/* Monte */}
                <span style={{ fontSize: 9, color: '#444', ...mono, textTransform: 'uppercase', letterSpacing: 0.8 }}>Monte</span>
                <select value={monte} disabled={drawing} onChange={e => setMonte(e.target.value as MonteKey)}
                  style={{ background: '#0a0a0a', border: '1px solid #222', color: '#888', ...mono, fontSize: 9, padding: '3px 6px', outline: 'none', borderRadius: 2 }}>
                  {MONTE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </>
            )}

            <div style={{ flex: 1 }} />

            {/* Controles de dibujo */}
            {!drawing && !polyResult && mapReady && (
              <>
                <button onClick={startDraw} style={{
                  ...toolBtn(), color, borderColor: `${color}66`,
                  background: `${color}15`, padding: '5px 16px', fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
                }}>
                  ◎ Dibujar polígono
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
                  ● Clic para agregar vértice · Clic derecho para cerrar
                </span>
                <button onClick={cancelDraw} style={{ ...toolBtn(), color: '#555' }}>✕ Cancelar</button>
              </>
            )}
            {polyResult && (
              <>
                <span style={{ fontSize: 10, color: '#888', ...mono }}>
                  {polyResult.area_ha.toFixed(4)} ha{!hideMonte ? ` · ~${Math.round(polyResult.area_ha * monteOpt.factor).toLocaleString('es-AR')} m³ arb.` : ''}
                </span>
                <button onClick={cancelDraw} style={{ ...toolBtn(), color: '#555' }}>↺ Redibujar</button>
                <button onClick={handleUse} style={{
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
            {onCancel && (
              <button onClick={onCancel} style={{ ...toolBtn(), color: '#444', fontSize: 9 }}>✕ Cerrar</button>
            )}
          </>
        )}
      </div>

      {/* ── Mapa ── */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <div ref={mapDivRef} style={{ width: '100%', height: '100%' }} />

        {/* HUD en tiempo real (solo durante dibujo o pre-confirm) */}
        {showHUD && !editingId && (
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
            {!hideMonte && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                <span style={{ color: '#444' }}>Vol. arb. ({monteOpt.value})</span>
                <span style={{ color: '#666' }}>~{Math.round(hudArea * monteOpt.factor).toLocaleString('es-AR')} m³</span>
              </div>
            )}
          </div>
        )}

        {/* Hint modo edición */}
        {editingId && (
          <div style={{
            position: 'absolute', bottom: 12, left: 12, zIndex: 999,
            background: '#0a0a0aee', border: `1px solid ${color}44`,
            borderRadius: 4, padding: '8px 12px', ...mono, fontSize: 10, color: '#555',
          }}>
            <div style={{ color, marginBottom: 3, fontWeight: 700 }}>Modo edición</div>
            <div>Arrastrá los círculos blancos para mover vértices.</div>
            <div style={{ color: '#444', marginTop: 2 }}>Presioná "Guardar edición" para confirmar los cambios.</div>
          </div>
        )}

        {/* Instrucciones iniciales */}
        {!drawing && !polyResult && !editingId && !hasPolygons && mapReady && (
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

        {/* Hint para polígonos existentes */}
        {!drawing && !polyResult && !editingId && hasPolygons && mapReady && (
          <div style={{
            position: 'absolute', bottom: 12, right: 12, zIndex: 998,
            background: '#0a0a0acc', border: `1px solid #1e1e1e`,
            borderRadius: 3, padding: '5px 10px', ...mono, fontSize: 9, color: '#444',
            pointerEvents: 'none',
          }}>
            Clic sobre un polígono para editar o eliminar
          </div>
        )}

        {/* Layer control panel */}
        {mapReady && (
          <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 999, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <button
              onClick={() => setLayerPanelOpen(v => !v)}
              style={{
                background: `rgba(10,10,10,0.88)`, border: `1px solid ${layerPanelOpen ? '#F5C300' : '#252525'}`,
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
                {/* Base */}
                <div style={{ fontSize: 8, color: '#444', letterSpacing: 1.2, ...mono, textTransform: 'uppercase', marginBottom: 5 }}>Base</div>
                {(['zonas','sedes'] as LayerKey[]).map(k => (
                  <label key={k} style={{
                    display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                    marginBottom: 5, fontSize: 10, ...mono,
                    color: layerVis[k] ? LAYER_COLORS[k] : '#444',
                    opacity: layerLoading[k] ? 0.5 : 1,
                  }}>
                    <input type="checkbox" checked={layerVis[k]} disabled={layerLoading[k]}
                      onChange={() => void toggleLayer(k)}
                      style={{ accentColor: LAYER_COLORS[k], width: 11, height: 11, flexShrink: 0, cursor: 'pointer' }} />
                    {layerLoading[k] ? '…' : LAYER_LABELS[k]}
                  </label>
                ))}

                {/* Rutas Prov. */}
                <div style={{ fontSize: 8, color: '#444', letterSpacing: 1.2, ...mono, textTransform: 'uppercase', marginTop: 8, marginBottom: 5, borderTop: '1px solid #1a1a1a', paddingTop: 6 }}>Rutas Prov.</div>
                {(['rpPavimentada','rpMejorada','rpEnObra','rpTierra'] as LayerKey[]).map(k => (
                  <label key={k} style={{
                    display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                    marginBottom: 5, fontSize: 10, ...mono,
                    color: layerVis[k] ? LAYER_COLORS[k] : '#444',
                    opacity: layerLoading[k] ? 0.5 : 1,
                  }}>
                    <input type="checkbox" checked={layerVis[k]} disabled={layerLoading[k]}
                      onChange={() => void toggleLayer(k)}
                      style={{ accentColor: LAYER_COLORS[k], width: 11, height: 11, flexShrink: 0, cursor: 'pointer' }} />
                    <span style={{ display: 'inline-block', width: 14, height: 2, background: LAYER_COLORS[k], flexShrink: 0 }} />
                    {layerLoading[k] ? '…' : LAYER_LABELS[k]}
                  </label>
                ))}

                {/* Red CC */}
                <div style={{ fontSize: 8, color: '#444', letterSpacing: 1.2, ...mono, textTransform: 'uppercase', marginTop: 8, marginBottom: 5, borderTop: '1px solid #1a1a1a', paddingTop: 6 }}>Red CC</div>
                {(['ccZI','ccZII','ccZIII','ccZIV','ccZV'] as LayerKey[]).map(k => (
                  <label key={k} style={{
                    display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                    marginBottom: 5, fontSize: 10, ...mono,
                    color: layerVis[k] ? LAYER_COLORS[k] : '#444',
                    opacity: layerLoading[k] ? 0.5 : 1,
                  }}>
                    <input type="checkbox" checked={layerVis[k]} disabled={layerLoading[k]}
                      onChange={() => void toggleLayer(k)}
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

      {/* Input oculto para importar KML/GeoJSON */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".kml,.geojson,.json"
        style={{ display: 'none' }}
        onChange={handleImportFile}
      />
    </div>
  )
}
