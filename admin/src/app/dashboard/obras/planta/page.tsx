'use client'
import 'leaflet/dist/leaflet.css'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getObraTransfer, clearObraTransfer, setReturnedArea } from '@/lib/obraTransfer'

// ── Colores de capas base ─────────────────────────────────────────────────────
const ZONE_COLORS: Record<string, string> = {
  ZI: '#6baed6', ZII: '#fc8d59', ZIII: '#78c679', ZIV: '#e78ac3', ZV: '#a6d854',
}
const CC_COLORS: Record<string, string> = {
  ZI: '#1565C0', ZII: '#BF360C', ZIII: '#E65100', ZIV: '#6A1B9A', ZV: '#00695C',
}
const RP_COLORS: Record<string, { color: string; weight: number; dashArray?: string }> = {
  rpPavimentada: { color: '#e74c3c', weight: 2.5 },
  rpMejorada:    { color: '#e67e22', weight: 2.0 },
  rpEnObra:      { color: '#f1c40f', weight: 2.0, dashArray: '10 6' },
  rpTierra:      { color: '#95a5a6', weight: 1.5 },
}

// Nombres legibles de capas
const LAYER_LABELS: Record<string, string> = {
  limite: 'Límite Prov.', zonas: 'Zonas', sedes: 'Sedes',
  rpPavimentada: 'RP Pavim.', rpMejorada: 'RP Mejor.', rpEnObra: 'RP En obra', rpTierra: 'RP Tierra',
  ccZI: 'CC ZI', ccZII: 'CC ZII', ccZIII: 'CC ZIII', ccZIV: 'CC ZIV', ccZV: 'CC ZV',
}
const LAYER_COLORS: Record<string, string> = {
  limite: '#555', zonas: '#6baed6', sedes: '#F5C300',
  rpPavimentada: '#e74c3c', rpMejorada: '#e67e22', rpEnObra: '#f1c40f', rpTierra: '#95a5a6',
  ccZI: '#1565C0', ccZII: '#BF360C', ccZIII: '#E65100', ccZIV: '#6A1B9A', ccZV: '#00695C',
}
const BASE_LAYER_KEYS = ['limite','zonas','sedes','rpPavimentada','rpMejorada','rpEnObra','rpTierra','ccZI','ccZII','ccZIII','ccZIV','ccZV'] as const
type BaseLayerKey = typeof BASE_LAYER_KEYS[number]
const BASE_LAYER_DEFAULTS: Record<BaseLayerKey, boolean> = {
  limite: true, zonas: true, sedes: true,
  rpPavimentada: true, rpMejorada: true, rpEnObra: false, rpTierra: false,
  ccZI: false, ccZII: false, ccZIII: false, ccZIV: false, ccZV: false,
}

// ── Tipos ─────────────────────────────────────────────────────────────────────
type ObraType = 'terraplen' | 'excavacion' | 'ripio' | 'desmalezado' | 'desbosque' | 'canal'
type LatLng   = [number, number]
type Params   = Record<string, number | string>

const OBRA_TYPES: { id: ObraType; label: string; color: string }[] = [
  { id: 'terraplen',   label: 'Terraplén',   color: '#8D6E63' },
  { id: 'excavacion',  label: 'Excavación',  color: '#FF7043' },
  { id: 'ripio',       label: 'Ripio',       color: '#90A4AE' },
  { id: 'desmalezado', label: 'Desmalezado', color: '#66BB6A' },
  { id: 'desbosque',   label: 'Desbosque',   color: '#795548' },
  { id: 'canal',       label: 'Canal',       color: '#29B6F6' },
]

// Unidades de precio por defecto por tipo
const UNIDADES_DEFAULT: Record<ObraType, string> = {
  terraplen: '$/t', excavacion: '$/t', ripio: '$/t', canal: '$/t',
  desmalezado: '$/ha', desbosque: '$/ha',
}

// ── Params defaults ───────────────────────────────────────────────────────────
const DEFAULTS: Record<ObraType, Params> = {
  terraplen:   { H: 1.5,  Bc: 4.0, m: 1.5, rho: 1.80, Fe: 20, Fc: 90 },
  excavacion:  { H: 2.0,  Bf: 3.0, m: 1.0, rho: 1.80, Fe: 25 },
  ripio:       { An: 6.0, E: 0.15, rho: 2.10 },
  desmalezado: { Ab: 5.0, lados: 2 },
  desbosque:   { Ad: 15.0, monte: 'semitupido' },
  canal:       { H: 1.5,  Bf: 2.0, m: 1.0, rho: 1.80, Fe: 25 },
}

// ── Buffer halfWidth desde parámetros geométricos ─────────────────────────────
function getHalfWidth(type: ObraType, p: Params): number {
  switch (type) {
    case 'terraplen':   return ((p.Bc as number) + 2 * (p.H as number) * (p.m as number)) / 2
    case 'excavacion':
    case 'canal':       return ((p.Bf as number) + 2 * (p.H as number) * (p.m as number)) / 2
    case 'ripio':       return (p.An as number) / 2
    case 'desmalezado': return p.Ab as number
    case 'desbosque':   return (p.Ad as number) / 2
  }
}

// ── Cálculos por tipo ─────────────────────────────────────────────────────────
interface Result { label: string; value: string; accent?: boolean; numericValue?: number }

function calcResults(type: ObraType, p: Params, L: number): Result[] {
  if (L <= 0) return []
  const fmt = (n: number) => Math.round(n).toLocaleString('es-AR')

  switch (type) {
    case 'terraplen': {
      const H = p.H as number, Bc = p.Bc as number, m = p.m as number
      const rho = p.rho as number, Fe = p.Fe as number, Fc = p.Fc as number
      const Bb = Bc + 2 * H * m, A = (Bc + Bb) / 2 * H
      const Vn = A * L, Vb = Vn / (Fc / 100), W = Vb * rho
      return [
        { label: 'Sección',        value: `${A.toFixed(2)} m²` },
        { label: 'Vol. compactado', value: `${fmt(Vn)} m³` },
        { label: 'Mat. en banco',  value: `${fmt(Vb)} m³` },
        { label: 'Peso total',     value: `${fmt(W)} t`, accent: true, numericValue: W },
        { label: 'Camiones 20t',   value: `~${Math.ceil(W / 20).toLocaleString('es-AR')}` },
      ]
    }
    case 'excavacion':
    case 'canal': {
      const H = p.H as number, Bf = p.Bf as number, m = p.m as number
      const rho = p.rho as number, Fe = p.Fe as number
      const Bb = Bf + 2 * H * m, A = (Bf + Bb) / 2 * H
      const Vc = A * L, Ve = Vc * (1 + Fe / 100), W = Vc * rho
      return [
        { label: 'Sección',        value: `${A.toFixed(2)} m²` },
        { label: 'Vol. corte',     value: `${fmt(Vc)} m³` },
        { label: 'Vol. esponjado', value: `${fmt(Ve)} m³` },
        { label: 'Peso a mover',   value: `${fmt(W)} t`, accent: true, numericValue: W },
      ]
    }
    case 'ripio': {
      const An = p.An as number, E = p.E as number, rho = p.rho as number
      const V = L * An * E, W = V * rho
      return [
        { label: 'Volumen',        value: `${fmt(V)} m³` },
        { label: 'Toneladas',      value: `${fmt(W)} t`, accent: true, numericValue: W },
        { label: 'Camiones 20t',   value: `~${Math.ceil(W / 20).toLocaleString('es-AR')}` },
      ]
    }
    case 'desmalezado': {
      const Ab = p.Ab as number, lados = p.lados as number
      const m2 = L * Ab * lados, ha = m2 / 10000
      return [
        { label: 'Superficie', value: `${ha.toFixed(2)} ha`, accent: true, numericValue: ha },
        { label: 'en m²',      value: `${fmt(m2)} m²` },
      ]
    }
    case 'desbosque': {
      const Ad = p.Ad as number, monte = p.monte as string
      const FACTOR: Record<string, number> = { ralo: 50, semitupido: 150, tupido: 400 }
      const ha = L * Ad / 10000, Vm3 = ha * (FACTOR[monte] ?? 150)
      return [
        { label: 'Superficie',   value: `${ha.toFixed(2)} ha`, accent: true, numericValue: ha },
        { label: 'Vol. arbóreo', value: `${fmt(Vm3)} m³` },
      ]
    }
  }
}

// ── Geometría ─────────────────────────────────────────────────────────────────
function roadBuffer(latLngs: LatLng[], halfWidth: number): LatLng[] {
  if (latLngs.length < 2) return []
  const DEG = Math.PI / 180, R = 6371000
  const lat0 = latLngs[0][0], lng0 = latLngs[0][1]
  const cosLat = Math.cos(lat0 * DEG)
  const pts = latLngs.map(([lat, lng]) => ({
    x: (lng - lng0) * cosLat * R * DEG,
    y: (lat - lat0) * R * DEG,
  }))
  const left: { x: number; y: number }[] = []
  const right: { x: number; y: number }[] = []
  for (let i = 0; i < pts.length; i++) {
    let dx = 0, dy = 0
    if (i > 0)              { dx += pts[i].x - pts[i-1].x; dy += pts[i].y - pts[i-1].y }
    if (i < pts.length - 1) { dx += pts[i+1].x - pts[i].x; dy += pts[i+1].y - pts[i].y }
    const len = Math.sqrt(dx*dx + dy*dy)
    if (len < 1e-10) {
      left.push(left.length > 0 ? left[left.length-1] : pts[i])
      right.push(right.length > 0 ? right[right.length-1] : pts[i])
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

function segLen(a: LatLng, b: LatLng): number {
  const R = 6371000, DEG = Math.PI / 180
  const dLat = (b[0]-a[0])*DEG, dLng = (b[1]-a[1])*DEG
  const sh = Math.sin(dLat/2), sw = Math.sin(dLng/2)
  return 2 * R * Math.asin(Math.sqrt(sh*sh + Math.cos(a[0]*DEG)*Math.cos(b[0]*DEG)*sw*sw))
}

function totalLen(coords: LatLng[]): number {
  let d = 0
  for (let i = 1; i < coords.length; i++) d += segLen(coords[i-1], coords[i])
  return d
}

// Área geodética de un polígono (fórmula esférica del trapezoide)
function polygonAreaHa(pts: LatLng[]): number {
  if (pts.length < 3) return 0
  const DEG = Math.PI / 180, R = 6371000
  let area = 0
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length
    const [lat1, lng1] = pts[i]
    const [lat2, lng2] = pts[j]
    area += (lng2 - lng1) * DEG * (2 + Math.sin(lat1 * DEG) + Math.sin(lat2 * DEG))
  }
  return Math.abs(area * R * R / 2) / 10000
}

// ── Interfaces ────────────────────────────────────────────────────────────────
interface ObraEnPlanta {
  id: string
  type: ObraType
  color: string
  halfWidth: number
  coords: LatLng[]
  lengthM: number
  results: Result[]
  descripcion?: string
  precioUnitario?: number
  unidad?: string
}

interface SaveModal {
  coords: LatLng[]
  lengthM: number
  halfWidth: number
  type: ObraType
  color: string
  params: Params
  results: Result[]
  precioModal: number
  unidad: string
  descripcion: string
}

// ── Estilos ───────────────────────────────────────────────────────────────────
const MONO: React.CSSProperties = { fontFamily: 'monospace' }
const inpS: React.CSSProperties = {
  width: '100%', background: '#080808', border: '1px solid #1e1e1e', color: '#e0e0e0',
  fontFamily: 'monospace', fontSize: 13, padding: '5px 8px', outline: 'none',
  boxSizing: 'border-box',
}
const lblS: React.CSSProperties = {
  fontSize: 9, color: '#444', textTransform: 'uppercase', letterSpacing: 1,
  fontFamily: 'monospace', marginBottom: 2, display: 'block', marginTop: 8,
}

function NInp({ label, k, p, step = 0.1, onChange }: {
  label: string; k: string; p: Params; step?: number
  onChange: (k: string, v: number) => void
}) {
  return (
    <label style={{ display: 'block' }}>
      <span style={lblS}>{label}</span>
      <input type="number" step={step} min={0} value={p[k] as number}
        onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(k, v) }}
        style={inpS} />
    </label>
  )
}

function ParamsForm({ type, p, onChange }: {
  type: ObraType; p: Params; onChange: (k: string, v: number | string) => void
}) {
  const n = (k: string, label: string, step = 0.1) =>
    <NInp key={k} label={label} k={k} p={p} step={step} onChange={(k, v) => onChange(k, v)} />

  switch (type) {
    case 'terraplen': return <>{n('H','Altura media (m)')} {n('Bc','Ancho corona (m)')} {n('m','Talud H:V', 0.5)} {n('rho','Densidad (t/m³)', 0.05)} {n('Fe','Esponjamiento (%)', 1)} {n('Fc','Compactación (%)', 1)}</>
    case 'excavacion':
    case 'canal':     return <>{n('H', type==='canal'?'Profundidad (m)':'Prof. corte (m)')} {n('Bf','Ancho fondo (m)')} {n('m','Talud H:V', 0.5)} {n('rho','Densidad (t/m³)', 0.05)} {n('Fe','Esponjamiento (%)', 1)}</>
    case 'ripio':     return <>{n('An','Ancho (m)')} {n('E','Espesor (m)', 0.01)} {n('rho','Densidad (t/m³)', 0.05)}</>
    case 'desmalezado': return (
      <>
        {n('Ab', 'Ancho banquina (m)')}
        <label style={{ display: 'block' }}>
          <span style={lblS}>Lados</span>
          <select value={p.lados as number} onChange={e => onChange('lados', parseInt(e.target.value))} style={{ ...inpS, fontSize: 12 }}>
            <option value={1}>1 lado</option>
            <option value={2}>2 lados</option>
          </select>
        </label>
      </>
    )
    case 'desbosque': return (
      <>
        {n('Ad', 'Ancho afectado (m)')}
        <label style={{ display: 'block' }}>
          <span style={lblS}>Tipo de monte</span>
          <select value={p.monte as string} onChange={e => onChange('monte', e.target.value)} style={{ ...inpS, fontSize: 12 }}>
            <option value="ralo">Ralo — &lt;40% · 50 m³/ha</option>
            <option value="semitupido">Semi-tupido — 40-70% · 150 m³/ha</option>
            <option value="tupido">Tupido — &gt;70% · 400 m³/ha</option>
          </select>
        </label>
      </>
    )
  }
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function PlantaPage() {
  const mapDivRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef    = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tileRef   = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LfRef     = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layersRef = useRef<Map<string, any[]>>(new Map())
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const previewLayersRef = useRef<any[]>([])
  const drawStateRef = useRef<{ pts: LatLng[]; cleanup: () => void } | null>(null)

  const router = useRouter()
  const [pendingSide, setPendingSide] = useState<'izq' | 'der' | null>(null)

  const [obras,      setObras]      = useState<ObraEnPlanta[]>([])
  const [obraType,   setObraType]   = useState<ObraType>('ripio')
  const [drawing,    setDrawing]    = useState(false)
  const [satellite,  setSatellite]  = useState(true)
  const [L,          setL]          = useState(0)
  const [precioUnitario, setPrecioUnitario] = useState(0)
  const [unidad,     setUnidad]     = useState('')
  const [ctxMenu,    setCtxMenu]    = useState<{ x: number; y: number } | null>(null)
  const [saveModal,  setSaveModal]  = useState<SaveModal | null>(null)
  const [polyResult, setPolyResult] = useState<{ area_ha: number; pts: LatLng[] } | null>(null)

  const [allParams, setAllParams] = useState<Record<ObraType, Params>>({
    terraplen:   { ...DEFAULTS.terraplen   },
    excavacion:  { ...DEFAULTS.excavacion  },
    ripio:       { ...DEFAULTS.ripio       },
    desmalezado: { ...DEFAULTS.desmalezado },
    desbosque:   { ...DEFAULTS.desbosque   },
    canal:       { ...DEFAULTS.canal       },
  })

  // ── Capas base ─────────────────────────────────────────────────────────────
  const [mapReady,    setMapReady]    = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [geo, setGeo] = useState<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rp,  setRp]  = useState<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [cc,  setCc]  = useState<any>(null)
  const [baseLayers, setBaseLayers] = useState<Record<BaseLayerKey, boolean>>({ ...BASE_LAYER_DEFAULTS })
  const [layerPanelOpen, setLayerPanelOpen] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const baseGroupsRef = useRef<Map<string, any>>(new Map())

  // ── Colores personalizables por tipo de obra ──────────────────────────────
  const [obraColors, setObraColors] = useState<Record<ObraType, string>>(() =>
    Object.fromEntries(OBRA_TYPES.map(t => [t.id, t.color])) as Record<ObraType, string>
  )
  const obraColorsRef = useRef<Record<ObraType, string>>(obraColors)
  useEffect(() => { obraColorsRef.current = obraColors }, [obraColors])

  const p            = allParams[obraType]
  const currentT     = OBRA_TYPES.find(t => t.id === obraType)!
  const currentColor = obraColors[obraType]
  const halfWidth    = getHalfWidth(obraType, p)
  const results      = calcResults(obraType, p, L)

  function setParam(k: string, v: number | string) {
    setAllParams(prev => ({ ...prev, [obraType]: { ...prev[obraType], [k]: v } }))
  }

  // Reset L al cambiar tipo
  useEffect(() => { setL(0) }, [obraType])

  // Leer obraTransfer al montar (viene de Calculadoras)
  useEffect(() => {
    const transfer = getObraTransfer()
    if (transfer) {
      setObraType(transfer.type)
      setAllParams(prev => ({ ...prev, [transfer.type]: transfer.params }))
      setPrecioUnitario(transfer.precioUnitario)
      setUnidad(transfer.unidad)
      if (transfer.pendingSide) setPendingSide(transfer.pendingSide)
      clearObraTransfer()
    }
  }, [])

  // ── Refs sincronizados con estado (acceso desde closures de Leaflet) ──────
  const halfWidthRef = useRef(halfWidth)
  const obraTypeRef  = useRef(obraType)
  const pRef         = useRef(p)
  const precioRef    = useRef(precioUnitario)
  const unidadRef    = useRef(unidad)
  useEffect(() => { halfWidthRef.current = halfWidth  }, [halfWidth])
  useEffect(() => { obraTypeRef.current  = obraType   }, [obraType])
  useEffect(() => { pRef.current         = p          }, [p])
  useEffect(() => { precioRef.current    = precioUnitario }, [precioUnitario])
  useEffect(() => { unidadRef.current    = unidad || UNIDADES_DEFAULT[obraType] }, [unidad, obraType])

  // ── Inicializar mapa ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return
    let mounted = true
    import('leaflet').then(Lf => {
      if (!mounted || !mapDivRef.current || mapRef.current) return
      LfRef.current = Lf
      const map = Lf.map(mapDivRef.current, {
        center: [-26.5, -60.5], zoom: 7,
        zoomControl: false, doubleClickZoom: false,
      })
      mapRef.current = map
      tileRef.current = Lf.tileLayer(
        'https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
        { subdomains: ['0','1','2','3'], maxZoom: 21, maxNativeZoom: 20, attribution: '© Google' }
      ).addTo(map)
      Lf.control.zoom({ position: 'bottomright' }).addTo(map)

      // Crear layer groups para capas base
      BASE_LAYER_KEYS.forEach(k => {
        const group = Lf.layerGroup()
        baseGroupsRef.current.set(k, group)
        if (BASE_LAYER_DEFAULTS[k]) group.addTo(map)
      })
      setMapReady(true)
    })
    return () => {
      mounted = false
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
      baseGroupsRef.current.clear()
      setMapReady(false)
    }
  }, [])

  // ── Capa base ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current; const Lf = LfRef.current
    if (!map || !Lf || !tileRef.current) return
    map.removeLayer(tileRef.current)
    tileRef.current = satellite
      ? Lf.tileLayer('https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
          { subdomains: ['0','1','2','3'], maxZoom: 21, maxNativeZoom: 20, attribution: '© Google' }).addTo(map)
      : Lf.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
          { maxZoom: 21, maxNativeZoom: 19, attribution: '© OpenStreetMap' }).addTo(map)
  }, [satellite])

  // ── Cargar GeoJSON ────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/geo/geo_bundle.json').then(r => r.json()).then(setGeo).catch(() => {})
    fetch('/geo/geo_rp.json').then(r => r.json()).then(setRp).catch(() => {})
    fetch('/geo/geo_cc.json').then(r => r.json()).then(setCc).catch(() => {})
  }, [])

  // ── Poblar capas geo_bundle (límite + zonas + sedes) ─────────────────────
  useEffect(() => {
    if (!geo || !mapReady) return
    import('leaflet').then(Lf => {
      // Límite provincial
      const limiteGroup = baseGroupsRef.current.get('limite')
      if (limiteGroup && geo.limite_provincial) {
        limiteGroup.clearLayers()
        Lf.geoJSON(geo.limite_provincial, {
          style: { color: '#555', weight: 2, fillOpacity: 0, dashArray: '6 4' },
        }).addTo(limiteGroup)
      }

      // Zonas
      const zonasGroup = baseGroupsRef.current.get('zonas')
      if (zonasGroup && geo.limites_zonas) {
        zonasGroup.clearLayers()
        const limZonas = geo.limites_zonas as Record<string, unknown>
        Object.entries(ZONE_COLORS).forEach(([zona, c]) => {
          if (!limZonas[zona]) return
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          Lf.geoJSON(limZonas[zona] as any, {
            style: { color: 'transparent', weight: 0, fillColor: c, fillOpacity: 0.12 },
          }).addTo(zonasGroup)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          Lf.geoJSON(limZonas[zona] as any, {
            style: { color: '#888', weight: 1, fillOpacity: 0 },
            onEachFeature(_, layer) {
              layer.bindTooltip(`Zona ${zona}`, { sticky: true, direction: 'center', className: 'planta-tt' })
            },
          }).addTo(zonasGroup)
        })
      }

      // Sedes (marcadores numerados)
      const sedesGroup = baseGroupsRef.current.get('sedes')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sedes: any[] = Array.isArray(geo.sedes) ? geo.sedes : []
      if (sedesGroup) {
        sedesGroup.clearLayers()
        sedes.forEach(s => {
          const c = s.color || '#F5C300'
          const icon = Lf.divIcon({
            className: '',
            html: `<div style="width:18px;height:18px;border-radius:50%;background:${c};border:2px solid #111;display:flex;align-items:center;justify-content:center;font-size:7px;font-weight:800;color:#111;box-shadow:0 2px 6px rgba(0,0,0,.7)">${s.numero}</div>`,
            iconSize: [18, 18], iconAnchor: [9, 9],
          })
          Lf.marker([s.lat, s.lng], { icon })
            .bindTooltip(
              `<b style="color:${c}">Sede ${s.numero}</b> · ${s.nombre}<br><span style="color:#aaa">${s.localidad} · ${s.zona}</span>`,
              { sticky: true, direction: 'top', offset: [0, -10] }
            )
            .addTo(sedesGroup)
        })
      }
    })
  }, [geo, mapReady])

  // ── Poblar capas RP (con tooltip al hover) ───────────────────────────────
  useEffect(() => {
    if (!rp || !mapReady) return
    import('leaflet').then(Lf => {
      const RP_LABELS: Record<string, string> = {
        rpPavimentada: 'Pavimentada', rpMejorada: 'Mejorada', rpEnObra: 'En obra', rpTierra: 'Tierra',
      }
      Object.entries(RP_COLORS).forEach(([key, s]) => {
        const group = baseGroupsRef.current.get(key)
        if (!group || !rp[key]) return
        group.clearLayers()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Lf.geoJSON(rp[key] as any, {
          style: { color: s.color, weight: s.weight, opacity: 0.9, ...(s.dashArray ? { dashArray: s.dashArray } : {}) },
          onEachFeature(feature, layer) {
            const p = feature.properties ?? {}
            const num  = p.Nombre || p.nombre || p.Numero || ''
            const zona = p.Zona   || p.zona   || ''
            const tipo = RP_LABELS[key] || key
            const label = `<b style="color:${s.color}">RP${num ? ' N°' + num : ''}</b> · ${tipo}${zona ? ' · Zona ' + zona : ''}`
            layer.bindTooltip(label, { sticky: true, direction: 'top' })
          },
        }).addTo(group)
      })
    })
  }, [rp, mapReady])

  // ── Poblar capas CC (con tooltip al hover) ────────────────────────────────
  useEffect(() => {
    if (!cc || !mapReady) return
    import('leaflet').then(Lf => {
      Object.entries(CC_COLORS).forEach(([zona, c]) => {
        const group = baseGroupsRef.current.get(`cc${zona}`)
        if (!group || !cc[zona]) return
        group.clearLayers()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Lf.geoJSON(cc[zona] as any, {
          style: { color: c, weight: 1.5, opacity: 0.85 },
          onEachFeature(feature, layer) {
            const p = feature.properties ?? {}
            const ccNum = p.CC || p.cc || ''
            const nm    = p.Nm || p.nm || p.Nombre || ''
            const jer   = p.J  || p.JERARQUIA || ''
            const label = `<b style="color:${c}">CC ${ccNum}</b> · Zona ${zona}${nm ? '<br>' + nm : ''}${jer ? ' · ' + jer : ''}`
            layer.bindTooltip(label, { sticky: true, direction: 'top' })
          },
        }).addTo(group)
      })
    })
  }, [cc, mapReady])

  // ── Togglear visibilidad de capas base ────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current; if (!map || !mapReady) return
    Object.entries(baseLayers).forEach(([key, visible]) => {
      const group = baseGroupsRef.current.get(key)
      if (!group) return
      if (visible) { if (!map.hasLayer(group)) group.addTo(map) }
      else         { if (map.hasLayer(group))  map.removeLayer(group) }
    })
  }, [baseLayers, mapReady])

  // ── Modo dibujo ───────────────────────────────────────────────────────────
  const startDraw = useCallback(() => {
    const map = mapRef.current; const Lf = LfRef.current
    if (!map || !Lf || drawing) return
    setDrawing(true)
    setL(0)
    setCtxMenu(null)
    map.getContainer().style.cursor = 'crosshair'

    const pts: LatLng[] = []
    const color = obraColorsRef.current[obraTypeRef.current]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let tempLine: any = null, previewSeg: any = null

    const cleanup = () => {
      map.off('click', onClick)
      map.off('mousemove', onMove)
      map.off('contextmenu', onContextMenu)
      if (previewSeg) { map.removeLayer(previewSeg); previewSeg = null }
      if (tempLine)   { map.removeLayer(tempLine);   tempLine   = null }
      map.getContainer().style.cursor = ''
      drawStateRef.current = null
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onClick = (e: any) => {
      pts.push([e.latlng.lat, e.latlng.lng])
      if (tempLine) map.removeLayer(tempLine)
      tempLine = Lf.polyline(pts as [number,number][], {
        color, weight: 2, dashArray: '6 4', opacity: 0.9,
      }).addTo(map)
      drawStateRef.current = { pts: [...pts], cleanup }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onMove = (e: any) => {
      if (!pts.length) return
      if (previewSeg) map.removeLayer(previewSeg)
      previewSeg = Lf.polyline(
        [pts[pts.length-1], [e.latlng.lat, e.latlng.lng]] as [number,number][],
        { color, weight: 1, dashArray: '3 6', opacity: 0.4 }
      ).addTo(map)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onContextMenu = (e: any) => {
      e.originalEvent.preventDefault()
      if (pts.length < 2) return
      // Snapshot de pts al momento del click derecho
      drawStateRef.current = { pts: [...pts], cleanup }
      setCtxMenu({ x: e.originalEvent.clientX, y: e.originalEvent.clientY })
    }

    drawStateRef.current = { pts, cleanup }
    map.on('click',       onClick)
    map.on('mousemove',   onMove)
    map.on('contextmenu', onContextMenu)
  }, [drawing])

  // ── Modo polígono (para calcular área por lado en Desbosque) ─────────────
  const startPolygonDraw = useCallback(() => {
    const map = mapRef.current; const Lf = LfRef.current
    if (!map || !Lf || drawing) return
    setDrawing(true)
    setPolyResult(null)
    map.getContainer().style.cursor = 'crosshair'

    const pts: LatLng[] = []
    const color = obraColorsRef.current[obraTypeRef.current]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let tempLine: any = null, closeLine: any = null

    const cleanup = () => {
      map.off('click',       onPolyClick)
      map.off('mousemove',   onPolyMove)
      map.off('contextmenu', onPolyRight)
      if (tempLine)  { map.removeLayer(tempLine);  tempLine  = null }
      if (closeLine) { map.removeLayer(closeLine); closeLine = null }
      map.getContainer().style.cursor = ''
      drawStateRef.current = null
    }

    const redraw = (cursor?: LatLng) => {
      if (tempLine)  { map.removeLayer(tempLine);  tempLine  = null }
      if (closeLine) { map.removeLayer(closeLine); closeLine = null }
      if (pts.length >= 2) {
        tempLine = Lf.polyline(pts as [number,number][], {
          color, weight: 2, dashArray: '6 4', opacity: 0.9,
        }).addTo(map)
      }
      // Closing dashed segment: cursor → first vertex (when ≥3 pts)
      if (pts.length >= 2 && cursor) {
        closeLine = Lf.polyline(
          [cursor, pts[0]] as [number,number][],
          { color, weight: 1, dashArray: '3 8', opacity: 0.35 }
        ).addTo(map)
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onPolyClick = (e: any) => {
      pts.push([e.latlng.lat, e.latlng.lng])
      redraw()
      drawStateRef.current = { pts: [...pts], cleanup }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onPolyMove = (e: any) => {
      if (!pts.length) return
      redraw([e.latlng.lat, e.latlng.lng])
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onPolyRight = (e: any) => {
      e.originalEvent.preventDefault()
      if (pts.length < 3) return
      cleanup()
      const area_ha = polygonAreaHa(pts)
      // Draw closed filled polygon as preview
      const poly = Lf.polygon(pts as [number,number][], {
        color, fillColor: color, fillOpacity: 0.45, weight: 2, opacity: 0.9,
      }).addTo(map)
      previewLayersRef.current = [poly]
      setPolyResult({ area_ha, pts })
      // drawing stays true until modal is confirmed or discarded
    }

    drawStateRef.current = { pts, cleanup }
    map.on('click',       onPolyClick)
    map.on('mousemove',   onPolyMove)
    map.on('contextmenu', onPolyRight)
  }, [drawing])

  // ── Descartar polígono ────────────────────────────────────────────────────
  const handleDiscardPoly = useCallback(() => {
    const map = mapRef.current
    if (map) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      previewLayersRef.current.forEach((l: any) => map.removeLayer(l))
    }
    previewLayersRef.current = []
    setPolyResult(null)
    setDrawing(false)
  }, [])

  // ── Finalizar obra desde menú contextual ─────────────────────────────────
  const handleFinalize = useCallback(() => {
    const ds = drawStateRef.current
    if (!ds) { setCtxMenu(null); setDrawing(false); return }

    ds.cleanup()
    setCtxMenu(null)

    const pts = ds.pts
    if (pts.length < 2) { setDrawing(false); return }

    const len    = totalLen(pts)
    const hw     = halfWidthRef.current
    const type   = obraTypeRef.current
    const params = pRef.current
    const res    = calcResults(type, params, len)
    const color  = obraColorsRef.current[type]
    const map    = mapRef.current
    const Lf     = LfRef.current

    // Capas de preview (removibles si el usuario descarta)
    if (map && Lf) {
      const bufRing = roadBuffer(pts, hw)
      const poly = Lf.polygon(bufRing as [number,number][], {
        color, fillColor: color, fillOpacity: 0.55, weight: 2, opacity: 0.9,
      }).addTo(map)
      const line = Lf.polyline(pts as [number,number][], {
        color, weight: 3, opacity: 1, dashArray: '8 4',
      }).addTo(map)
      previewLayersRef.current = [poly, line]
    }

    setL(len)
    setSaveModal({
      coords: pts,
      lengthM: len,
      halfWidth: hw,
      type,
      color,
      params,
      results: res,
      precioModal: precioRef.current,
      unidad: unidadRef.current,
      descripcion: '',
    })
    // drawing sigue true hasta que el usuario confirme o descarte
  }, [])

  // ── Cancelar dibujo ───────────────────────────────────────────────────────
  const handleCancelDraw = useCallback(() => {
    drawStateRef.current?.cleanup()
    setCtxMenu(null)
    setDrawing(false)
  }, [])

  // ── Guardar obra ──────────────────────────────────────────────────────────
  const handleSaveObra = useCallback(() => {
    const modal = saveModal
    if (!modal) return

    const id     = `obra-${Date.now()}`
    const color  = modal.color
    const label  = OBRA_TYPES.find(t => t.id === modal.type)!.label
    const map    = mapRef.current

    // Promover capas de preview a permanentes
    if (map && previewLayersRef.current.length > 0) {
      const poly = previewLayersRef.current[0]
      const accentResult = modal.results.find(r => r.accent)
      poly.bindTooltip(
        `<div style="font-family:monospace;padding:4px">` +
        `<div style="font-size:11px;color:${color};font-weight:700">${label}</div>` +
        (modal.descripcion ? `<div style="font-size:10px;color:#aaa">${modal.descripcion}</div>` : '') +
        `<div style="font-size:10px;color:#aaa">${(modal.lengthM/1000).toFixed(3)} km · ±${modal.halfWidth.toFixed(0)} m</div>` +
        (accentResult ? `<div style="font-size:11px;color:${color}">${accentResult.label}: ${accentResult.value}</div>` : '') +
        (modal.precioModal > 0 && accentResult?.numericValue ? `<div style="font-size:10px;color:#888">Total: ${Math.round(accentResult.numericValue * modal.precioModal).toLocaleString('es-AR')} ARS</div>` : '') +
        `</div>`,
        { permanent: false, sticky: true, className: '' }
      )
      layersRef.current.set(id, previewLayersRef.current)
      previewLayersRef.current = []
    }

    setObras(prev => [...prev, {
      id,
      type: modal.type,
      color,
      halfWidth: modal.halfWidth,
      coords: modal.coords,
      lengthM: modal.lengthM,
      results: modal.results,
      descripcion: modal.descripcion || undefined,
      precioUnitario: modal.precioModal || undefined,
      unidad: modal.unidad || undefined,
    }])

    setSaveModal(null)
    setDrawing(false)
  }, [saveModal])

  // ── Descartar obra ────────────────────────────────────────────────────────
  const handleDiscardObra = useCallback(() => {
    const map = mapRef.current
    if (map) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      previewLayersRef.current.forEach((l: any) => map.removeLayer(l))
    }
    previewLayersRef.current = []
    setSaveModal(null)
    setDrawing(false)
  }, [])

  // ── Eliminar obra del mapa ────────────────────────────────────────────────
  const removeObra = useCallback((id: string) => {
    const map = mapRef.current; if (!map) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    layersRef.current.get(id)?.forEach((l: any) => map.removeLayer(l))
    layersRef.current.delete(id)
    setObras(prev => prev.filter(o => o.id !== id))
  }, [])

  const clearAll = useCallback(() => {
    const map = mapRef.current; if (!map) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    layersRef.current.forEach(ls => ls.forEach((l: any) => map.removeLayer(l)))
    layersRef.current.clear()
    setObras([])
    setL(0)
  }, [])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: 'calc(100vh - 32px)', display: 'flex', overflow: 'hidden', background: '#0d0d0d' }}>
      <style>{`
        .leaflet-container:focus { outline: none !important; }
        .leaflet-container { outline: none !important; }
        .leaflet-tooltip.planta-tt { background: transparent; border: none; box-shadow: none; color: #aaa; font-size: 10px; font-family: monospace; }
        .leaflet-tooltip { background: rgba(10,10,10,0.88); border: 1px solid #2a2a2a; color: #ccc; font-family: monospace; font-size: 11px; padding: 4px 8px; border-radius: 0; box-shadow: none; }
        .leaflet-tooltip::before { display: none; }
        input[type=color] { -webkit-appearance: none; border: none; padding: 0; cursor: pointer; }
        input[type=color]::-webkit-color-swatch-wrapper { padding: 0; }
        input[type=color]::-webkit-color-swatch { border: none; }
      `}</style>

      {/* ── Panel izquierdo ── */}
      <div style={{
        width: 240, flexShrink: 0, borderRight: '1px solid #1e1e1e',
        display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#111',
      }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 0' }}>

          {/* Tipo de obra */}
          <div style={{ fontSize: 9, color: '#444', letterSpacing: 1.5, textTransform: 'uppercase', ...MONO, marginBottom: 8 }}>
            Tipo de obra
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 6 }}>
            {OBRA_TYPES.map(t => {
              const tc = obraColors[t.id]
              return (
                <button key={t.id} onClick={() => setObraType(t.id)} style={{
                  padding: '6px 8px', fontSize: 11, ...MONO, cursor: 'pointer',
                  textAlign: 'left', border: `1px solid ${obraType===t.id ? tc : '#1e1e1e'}`,
                  background: obraType===t.id ? `${tc}18` : 'transparent',
                  color: obraType===t.id ? tc : '#555',
                  display: 'flex', alignItems: 'center', gap: 8,
                  transition: 'border-color 0.12s, color 0.12s, background 0.12s',
                }}>
                  <span style={{ width: 7, height: 7, background: tc, flexShrink: 0 }} />
                  {t.label}
                </button>
              )
            })}
          </div>

          {/* Color picker para el tipo activo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, padding: '5px 8px', border: '1px solid #1a1a1a', background: '#0a0a0a' }}>
            <span style={{ fontSize: 9, color: '#444', ...MONO, textTransform: 'uppercase', letterSpacing: 1, flex: 1 }}>Color</span>
            <input
              type="color"
              value={currentColor}
              onChange={e => setObraColors(prev => ({ ...prev, [obraType]: e.target.value }))}
              style={{ width: 28, height: 18, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
              title="Editar color de la obra"
            />
            <button
              onClick={() => setObraColors(prev => ({ ...prev, [obraType]: currentColor }))}
              style={{ fontSize: 8, color: '#333', background: 'transparent', border: 'none', cursor: 'pointer', ...MONO, letterSpacing: 0.5, padding: '2px 4px' }}
              title="Resetear color"
            >
              ↺
            </button>
          </div>

          {/* Longitud auto-rellena del mapa */}
          <div style={{ marginBottom: 4 }}>
            <span style={lblS}>Longitud (m)</span>
            <div style={{ position: 'relative' }}>
              <input type="number" step={1} min={0} value={L || ''}
                onChange={e => setL(parseFloat(e.target.value) || 0)}
                placeholder="← dibujar en mapa"
                style={{ ...inpS, paddingRight: L > 0 ? 54 : 8, color: L > 0 ? currentColor : '#444' }}
              />
              {L > 0 && (
                <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 8, color: currentColor, ...MONO, pointerEvents: 'none' }}>
                  del mapa
                </span>
              )}
            </div>
            {L > 0 && (
              <div style={{ fontSize: 9, color: '#333', ...MONO, marginTop: 2 }}>{(L / 1000).toFixed(3)} km</div>
            )}
          </div>

          {/* Parámetros */}
          <ParamsForm type={obraType} p={p} onChange={setParam} />

          {/* Buffer info */}
          <div style={{ marginTop: 10, padding: '6px 8px', background: '#0a0a0a', border: '1px solid #1a1a1a' }}>
            <div style={{ fontSize: 9, color: '#333', ...MONO, lineHeight: 1.7 }}>
              Buffer en mapa: ±{halfWidth.toFixed(1)} m<br />
              Ancho total: {(halfWidth*2).toFixed(1)} m
            </div>
          </div>

          {/* Precio unitario */}
          <div style={{ marginTop: 10 }}>
            <span style={lblS}>Precio unitario ({unidad || UNIDADES_DEFAULT[obraType]})</span>
            <input
              type="number" step={100} min={0} value={precioUnitario || ''}
              placeholder="0"
              onChange={e => setPrecioUnitario(parseFloat(e.target.value) || 0)}
              style={{ ...inpS, color: precioUnitario > 0 ? currentColor : '#444' }}
            />
            {precioUnitario > 0 && (
              <div style={{ fontSize: 9, color: '#333', ...MONO, marginTop: 2 }}>ARS</div>
            )}
          </div>

          {/* Resultados live */}
          {results.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 9, color: '#444', letterSpacing: 1.5, textTransform: 'uppercase', ...MONO, marginBottom: 6 }}>
                Resultado
              </div>
              <div style={{ background: '#0a0a0a', border: `1px solid #1e1e1e`, borderLeft: `3px solid ${currentColor}`, padding: '8px 10px' }}>
                {results.map(r => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                    <span style={{ fontSize: 10, color: '#555', ...MONO }}>{r.label}</span>
                    <span style={{ fontSize: r.accent ? 14 : 11, fontWeight: r.accent ? 700 : 400, color: r.accent ? currentColor : '#888', ...MONO }}>
                      {r.value}
                    </span>
                  </div>
                ))}
                {/* Total estimado si hay precio y resultado numérico */}
                {(() => {
                  const accent = results.find(r => r.accent)
                  if (!accent?.numericValue || !precioUnitario) return null
                  const total = accent.numericValue * precioUnitario
                  return (
                    <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${currentColor}22` }}>
                      <div style={{ fontSize: 9, color: '#444', ...MONO }}>Total estimado</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: currentColor, ...MONO }}>
                        {Math.round(total).toLocaleString('es-AR')} ARS
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>
          )}
        </div>

        {/* Botón dibujar + capas */}
        <div style={{ padding: 12, borderTop: '1px solid #1e1e1e', flexShrink: 0 }}>
          <button onClick={drawing ? undefined : (pendingSide ? startPolygonDraw : startDraw)} style={{
            width: '100%', padding: '9px', fontSize: 11, ...MONO, cursor: drawing ? 'not-allowed' : 'pointer',
            fontWeight: 700, letterSpacing: 0.5,
            border: `1px solid ${drawing ? '#222' : currentColor}`,
            background: drawing ? '#111' : `${currentColor}22`,
            color: drawing ? '#333' : currentColor,
          }}>
            {drawing ? '⏳ Dibujando…'
              : pendingSide ? `✏ MEDIR ÁREA — LADO ${pendingSide === 'izq' ? 'IZQ' : 'DER'}`
              : '✏ DIBUJAR EN MAPA'}
          </button>
          {drawing && !ctxMenu && !saveModal && !polyResult && (
            <div style={{ fontSize: 9, color: '#555', ...MONO, marginTop: 6, lineHeight: 1.7, textAlign: 'center' }}>
              {pendingSide ? <>Clic → agregar vértice<br />Click derecho → cerrar y medir</> : <>Clic → agregar punto<br />Click derecho → finalizar</>}
            </div>
          )}

          {/* Capa base */}
          <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
            {[{ v: true, label: 'Satélite' }, { v: false, label: 'OSM' }].map(({ v, label }) => (
              <button key={label} onClick={() => setSatellite(v)} style={{
                flex: 1, padding: '4px', fontSize: 9, ...MONO, cursor: 'pointer',
                border: `1px solid ${satellite===v ? '#F5C300' : '#1e1e1e'}`,
                background: satellite===v ? '#F5C30012' : 'transparent',
                color: satellite===v ? '#F5C300' : '#444',
              }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Lista de obras guardadas */}
        {obras.length > 0 && (
          <div style={{ borderTop: '1px solid #1e1e1e', maxHeight: 220, overflowY: 'auto', flexShrink: 0 }}>
            <div style={{ padding: '8px 12px 4px', fontSize: 9, color: '#333', letterSpacing: 1, textTransform: 'uppercase', ...MONO, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Obras ({obras.length})</span>
              <button onClick={clearAll} style={{ background: 'transparent', border: 'none', color: '#333', ...MONO, fontSize: 9, cursor: 'pointer' }}>
                Limpiar todo
              </button>
            </div>
            {obras.map(o => {
              const t = OBRA_TYPES.find(x => x.id === o.type)!
              const oc = o.color
              const accent = o.results.find(r => r.accent)
              return (
                <div key={o.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '6px 12px', borderTop: '1px solid #111' }}>
                  <span style={{ width: 6, height: 6, background: oc, flexShrink: 0, marginTop: 4 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, color: oc, ...MONO }}>{t.label}</div>
                    {o.descripcion && <div style={{ fontSize: 9, color: '#666', ...MONO, lineHeight: 1.3 }}>{o.descripcion}</div>}
                    <div style={{ fontSize: 9, color: '#444', ...MONO, lineHeight: 1.5 }}>
                      {(o.lengthM/1000).toFixed(3)} km
                    </div>
                    {accent && (
                      <div style={{ fontSize: 10, color: '#888', ...MONO }}>{accent.label}: {accent.value}</div>
                    )}
                    {o.precioUnitario && accent?.numericValue && (
                      <div style={{ fontSize: 9, color: '#555', ...MONO }}>
                        {Math.round(accent.numericValue * o.precioUnitario).toLocaleString('es-AR')} ARS
                      </div>
                    )}
                  </div>
                  <button onClick={() => removeObra(o.id)} style={{ background: 'transparent', border: 'none', color: '#2a2a2a', cursor: 'pointer', fontSize: 14, padding: '0 2px', flexShrink: 0 }}>
                    ×
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Mapa ── */}
      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        <div ref={mapDivRef} style={{ width: '100%', height: '100%' }} />

        {/* Banner modo dibujo */}
        {drawing && !ctxMenu && !saveModal && !polyResult && (
          <div style={{
            position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
            zIndex: 800, background: 'rgba(10,10,10,0.9)',
            border: `1px solid ${currentColor}`, padding: '6px 16px',
            fontSize: 11, ...MONO, color: currentColor,
            pointerEvents: 'none', whiteSpace: 'nowrap',
          }}>
            {pendingSide
              ? `Polígono — Lado ${pendingSide === 'izq' ? 'Izquierdo' : 'Derecho'} · Click derecho → cerrar`
              : `${currentT.label} · ±${halfWidth.toFixed(1)} m · Click derecho → finalizar`}
          </div>
        )}

        {/* ── Botón de ubicación + Panel de capas ── */}
        <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 800, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>

          {/* Localizar */}
          <button
            title="Centrar en mi ubicación"
            onClick={() => {
              if (!navigator.geolocation || !mapRef.current) return
              navigator.geolocation.getCurrentPosition(
                pos => mapRef.current.setView([pos.coords.latitude, pos.coords.longitude], 14),
                () => {}
              )
            }}
            style={{
              background: 'rgba(10,10,10,0.88)', border: '1px solid #2a2a2a',
              color: '#777', fontFamily: 'monospace', fontSize: 11,
              padding: '5px 10px', cursor: 'pointer', letterSpacing: 0.3,
              transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#F5C300'; e.currentTarget.style.borderColor = '#F5C300' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#777';    e.currentTarget.style.borderColor = '#2a2a2a' }}
          >
            ◎ MI UBICACIÓN
          </button>

          {/* Capas */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <button
              onClick={() => setLayerPanelOpen(v => !v)}
              title="Capas base"
              style={{
                background: 'rgba(10,10,10,0.88)', border: `1px solid ${layerPanelOpen ? '#F5C300' : '#2a2a2a'}`,
                color: layerPanelOpen ? '#F5C300' : '#777', fontFamily: 'monospace', fontSize: 10,
                padding: '5px 10px', cursor: 'pointer', letterSpacing: 0.5,
                transition: 'border-color 0.15s, color 0.15s',
              }}
            >
              ⊞ CAPAS
            </button>
            {layerPanelOpen && (
              <div style={{
                marginTop: 2, background: 'rgba(10,10,10,0.94)', border: '1px solid #1e1e1e',
                padding: '8px 10px', maxHeight: 340, overflowY: 'auto', minWidth: 148,
              }}>
                {/* Base */}
                <div style={{ fontSize: 8, color: '#333', letterSpacing: 1.2, fontFamily: 'monospace', textTransform: 'uppercase', marginBottom: 5 }}>Base</div>
                {(['limite','zonas','sedes'] as BaseLayerKey[]).map(k => (
                  <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginBottom: 5, fontSize: 10, fontFamily: 'monospace', color: baseLayers[k] ? LAYER_COLORS[k] : '#444' }}>
                    <input type="checkbox" checked={baseLayers[k]} onChange={e => setBaseLayers(prev => ({ ...prev, [k]: e.target.checked }))} style={{ accentColor: LAYER_COLORS[k], width: 11, height: 11, flexShrink: 0 }} />
                    {LAYER_LABELS[k]}
                  </label>
                ))}
                {/* Rutas Prov. */}
                <div style={{ fontSize: 8, color: '#333', letterSpacing: 1.2, fontFamily: 'monospace', textTransform: 'uppercase', marginTop: 8, marginBottom: 5, borderTop: '1px solid #1a1a1a', paddingTop: 6 }}>Rutas Prov.</div>
                {(['rpPavimentada','rpMejorada','rpEnObra','rpTierra'] as BaseLayerKey[]).map(k => (
                  <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginBottom: 5, fontSize: 10, fontFamily: 'monospace', color: baseLayers[k] ? LAYER_COLORS[k] : '#444' }}>
                    <input type="checkbox" checked={baseLayers[k]} onChange={e => setBaseLayers(prev => ({ ...prev, [k]: e.target.checked }))} style={{ accentColor: LAYER_COLORS[k], width: 11, height: 11, flexShrink: 0 }} />
                    <span style={{ display: 'inline-block', width: 14, height: 2, background: LAYER_COLORS[k], flexShrink: 0 }} />
                    {LAYER_LABELS[k]}
                  </label>
                ))}
                {/* Red CC */}
                <div style={{ fontSize: 8, color: '#333', letterSpacing: 1.2, fontFamily: 'monospace', textTransform: 'uppercase', marginTop: 8, marginBottom: 5, borderTop: '1px solid #1a1a1a', paddingTop: 6 }}>Red CC</div>
                {(['ccZI','ccZII','ccZIII','ccZIV','ccZV'] as BaseLayerKey[]).map(k => (
                  <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginBottom: 5, fontSize: 10, fontFamily: 'monospace', color: baseLayers[k] ? LAYER_COLORS[k] : '#444' }}>
                    <input type="checkbox" checked={baseLayers[k]} onChange={e => setBaseLayers(prev => ({ ...prev, [k]: e.target.checked }))} style={{ accentColor: LAYER_COLORS[k], width: 11, height: 11, flexShrink: 0 }} />
                    <span style={{ display: 'inline-block', width: 14, height: 2, background: LAYER_COLORS[k], flexShrink: 0 }} />
                    {LAYER_LABELS[k]}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Leyenda obras sobre mapa */}
        {obras.length > 0 && !drawing && (
          <div style={{
            position: 'absolute', bottom: 36, left: 10, zIndex: 799,
            background: 'rgba(10,10,10,0.85)', border: '1px solid #1e1e1e',
            padding: '8px 12px', fontSize: 10, ...MONO, lineHeight: 1.8,
          }}>
            {obras.map(o => {
              const t = OBRA_TYPES.find(x => x.id === o.type)!
              const oc = o.color
              const accent = o.results.find(r => r.accent)
              return (
                <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8, color: oc }}>
                  <span style={{ width: 16, height: 2, background: oc, display: 'inline-block' }} />
                  <span>{t.label}{o.descripcion ? ` — ${o.descripcion}` : ''}</span>
                  {accent && <span style={{ color: '#555' }}>· {accent.value}</span>}
                </div>
              )
            })}
          </div>
        )}

        {/* ── Menú contextual ── */}
        {ctxMenu && (
          <>
            {/* Backdrop: captura clicks fuera del menú */}
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 1500 }}
              onClick={() => setCtxMenu(null)}
            />
            {/* Menú */}
            <div style={{
              position: 'fixed',
              left: Math.min(ctxMenu.x, window.innerWidth - 180),
              top: Math.min(ctxMenu.y, window.innerHeight - 100),
              zIndex: 1501,
              background: '#111', border: '1px solid #2a2a2a',
              boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
              minWidth: 170, overflow: 'hidden',
            }}>
              <button
                onClick={handleFinalize}
                style={{
                  display: 'block', width: '100%', padding: '10px 16px', textAlign: 'left',
                  background: 'transparent', border: 'none', borderBottom: '1px solid #1a1a1a',
                  color: currentColor, fontFamily: 'monospace', fontSize: 12,
                  cursor: 'pointer', fontWeight: 700, letterSpacing: 0.3,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = `${currentColor}18`)}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                ✓ Finalizar obra
              </button>
              <button
                onClick={handleCancelDraw}
                style={{
                  display: 'block', width: '100%', padding: '10px 16px', textAlign: 'left',
                  background: 'transparent', border: 'none',
                  color: '#666', fontFamily: 'monospace', fontSize: 12, cursor: 'pointer',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#1a1a1a')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                ✕ Cancelar
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Modal guardar obra ── */}
      {saveModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 2000,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {(() => {
            const mt  = OBRA_TYPES.find(t => t.id === saveModal.type)!
            const mc  = saveModal.color                                    // color personalizado
            const accent = saveModal.results.find(r => r.accent)
            const total  = (accent?.numericValue ?? 0) * saveModal.precioModal

            return (
              <div style={{
                background: '#111', border: `1px solid ${mc}33`,
                padding: 24, minWidth: 340, maxWidth: 460,
                boxShadow: `0 0 40px ${mc}22`,
                fontFamily: 'monospace',
              }}>
                {/* Título + color picker en modal */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <input
                    type="color" value={mc}
                    onChange={e => setSaveModal(prev => prev ? { ...prev, color: e.target.value } : null)}
                    style={{ width: 18, height: 18, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}
                    title="Cambiar color"
                  />
                  <span style={{ fontSize: 12, color: mc, fontWeight: 700, letterSpacing: 1.2 }}>
                    NUEVA OBRA · {mt.label.toUpperCase()}
                  </span>
                </div>

                {/* Info básica */}
                <div style={{ fontSize: 10, color: '#555', marginBottom: 12, lineHeight: 1.8 }}>
                  {(saveModal.lengthM/1000).toFixed(3)} km · Buffer ±{saveModal.halfWidth.toFixed(1)} m
                </div>

                {/* Resultados */}
                <div style={{
                  background: '#0a0a0a', borderLeft: `3px solid ${mc}`,
                  padding: '8px 10px', marginBottom: 14,
                }}>
                  {saveModal.results.map(r => (
                    <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 10, color: '#555' }}>{r.label}</span>
                      <span style={{
                        fontSize: r.accent ? 13 : 11, fontWeight: r.accent ? 700 : 400,
                        color: r.accent ? mc : '#888',
                      }}>{r.value}</span>
                    </div>
                  ))}
                </div>

                {/* Descripción */}
                <label style={{ display: 'block', marginBottom: 12 }}>
                  <span style={{ fontSize: 9, color: '#444', letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>
                    Descripción (opcional)
                  </span>
                  <input
                    type="text"
                    value={saveModal.descripcion}
                    onChange={e => setSaveModal(prev => prev ? { ...prev, descripcion: e.target.value } : null)}
                    placeholder="ej. RP 7 · Km 12 a Km 15"
                    style={{ ...inpS, fontSize: 13, borderColor: '#2a2a2a' }}
                    autoFocus
                  />
                </label>

                {/* Precio unitario */}
                <label style={{ display: 'block', marginBottom: 12 }}>
                  <span style={{ fontSize: 9, color: '#444', letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>
                    Precio unitario ({saveModal.unidad})
                  </span>
                  <input
                    type="number" step={100} min={0}
                    value={saveModal.precioModal || ''}
                    placeholder="0"
                    onChange={e => setSaveModal(prev => prev ? { ...prev, precioModal: parseFloat(e.target.value) || 0 } : null)}
                    style={{ ...inpS, fontSize: 14, borderColor: saveModal.precioModal > 0 ? mc + '66' : '#2a2a2a', color: saveModal.precioModal > 0 ? mc : '#e0e0e0' }}
                  />
                </label>

                {/* Total estimado */}
                {saveModal.precioModal > 0 && accent?.numericValue && (
                  <div style={{
                    background: `${mc}0e`, border: `1px solid ${mc}33`,
                    padding: '8px 12px', marginBottom: 14,
                  }}>
                    <div style={{ fontSize: 9, color: '#444', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>Total estimado</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: mc }}>
                      {Math.round(total).toLocaleString('es-AR')} ARS
                    </div>
                    <div style={{ fontSize: 9, color: '#444', marginTop: 2 }}>
                      {accent.numericValue.toFixed(2)} {saveModal.unidad.replace('$/', '')} × {saveModal.precioModal.toLocaleString('es-AR')} ARS
                    </div>
                  </div>
                )}

                {/* Botones */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={handleSaveObra}
                    style={{
                      flex: 1, padding: '10px', fontSize: 12, fontWeight: 700,
                      fontFamily: 'monospace', cursor: 'pointer',
                      border: `1px solid ${mc}`, background: `${mc}22`,
                      color: mc, letterSpacing: 0.5,
                    }}
                  >
                    GUARDAR
                  </button>
                  <button
                    onClick={handleDiscardObra}
                    style={{
                      flex: 1, padding: '10px', fontSize: 12,
                      fontFamily: 'monospace', cursor: 'pointer',
                      border: '1px solid #2a2a2a', background: 'transparent', color: '#555',
                    }}
                  >
                    Descartar
                  </button>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* ── Modal área de polígono (retorno a Desbosque) ── */}
      {polyResult && pendingSide && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 2000,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#111', border: `1px solid ${currentColor}33`,
            padding: 24, minWidth: 310, maxWidth: 400,
            boxShadow: `0 0 40px ${currentColor}22`,
            fontFamily: 'monospace',
          }}>
            <div style={{ fontSize: 12, color: currentColor, fontWeight: 700, letterSpacing: 1.2, marginBottom: 16 }}>
              ÁREA DEL POLÍGONO — LADO {pendingSide === 'izq' ? 'IZQUIERDO' : 'DERECHO'}
            </div>

            <div style={{ background: '#0a0a0a', borderLeft: `3px solid ${currentColor}`, padding: '10px 12px', marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <span style={{ fontSize: 10, color: '#555' }}>Superficie</span>
                <span style={{ fontSize: 20, fontWeight: 700, color: currentColor }}>{polyResult.area_ha.toFixed(4)} ha</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 9, color: '#444' }}>km²</span>
                <span style={{ fontSize: 11, color: '#666' }}>{(polyResult.area_ha / 100).toFixed(5)} km²</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 9, color: '#444' }}>m²</span>
                <span style={{ fontSize: 11, color: '#666' }}>{Math.round(polyResult.area_ha * 10000).toLocaleString('es-AR')} m²</span>
              </div>
            </div>

            <button
              onClick={() => {
                setReturnedArea(pendingSide, polyResult.area_ha)
                setPolyResult(null)
                setDrawing(false)
                router.push('/dashboard/obras/calculadoras')
              }}
              style={{
                width: '100%', padding: '11px', fontSize: 12, fontWeight: 700,
                fontFamily: 'monospace', cursor: 'pointer', marginBottom: 8,
                border: `1px solid ${currentColor}`, background: `${currentColor}22`,
                color: currentColor, letterSpacing: 0.3,
              }}
            >
              ← USAR ÁREA — LADO {pendingSide === 'izq' ? 'IZQUIERDO' : 'DERECHO'}
            </button>

            <button
              onClick={handleDiscardPoly}
              style={{
                width: '100%', padding: '8px', fontSize: 11,
                fontFamily: 'monospace', cursor: 'pointer',
                border: '1px solid #2a2a2a', background: 'transparent', color: '#555',
              }}
            >
              Redibujar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
