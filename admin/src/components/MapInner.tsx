'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Relevamiento } from '@/types'
import 'leaflet/dist/leaflet.css'

// ── Constantes de color ──────────────────────────────────────────────────────

const ZONE_COLORS: Record<string, string> = {
  ZI: '#6baed6', ZII: '#fc8d59', ZIII: '#78c679', ZIV: '#e78ac3', ZV: '#a6d854',
}

const CC_COLORS: Record<string, string> = {
  ZI: '#1565C0',   // azul fuerte
  ZII: '#BF360C',  // naranja-rojo
  ZIII: '#E65100', // naranja vivo — visible sobre verde
  ZIV: '#6A1B9A',  // violeta — visible sobre cualquier fondo
  ZV: '#00695C',   // verde oscuro teal
}

const TIPO_COLORS: Record<string, string> = {
  Puente: '#2196F3', Alcantarilla: '#FF9800', Tubos: '#9C27B0', Lineal: '#4CAF50', Otro: '#607D8B',
}

const CC_WEIGHT: Record<string, number> = {
  PRIMARIA: 3.0, SECUNDARIA: 2.0, TERCIARIA: 1.5,
}

// ── CSS de popups ────────────────────────────────────────────────────────────

const POPUP_CSS = `
.leaflet-popup-content-wrapper {
  background: #1e2436;
  border: 1px solid #2a3045;
  border-radius: 8px;
  padding: 0;
  box-shadow: 0 4px 12px rgba(0,0,0,.5);
  color: #e0e6f0;
}
.leaflet-popup-tip { background: #1e2436; }
.leaflet-popup-content { margin: 0; width: 260px !important; }
.ph  { padding: 10px; display: flex; align-items: center; gap: 8px; }
.pn  { width: 34px; height: 34px; border-radius: 50%; background: rgba(0,0,0,.25);
       display: flex; align-items: center; justify-content: center;
       font-size: 14px; font-weight: 800; color: #fff; flex-shrink: 0; }
.pl  { color: #fff; font-size: 12px; font-weight: 700; line-height: 1.3; }
.pz  { color: rgba(255,255,255,.8); font-size: 10px; margin-top: 2px; }
.pb  { padding: 6px 10px 8px; }
.pr  { display: flex; align-items: center; margin-bottom: 3px; }
.ps  { font-size: 10px; color: #7a8aaa; text-transform: uppercase;
       letter-spacing: .5px; margin-bottom: 4px; }
.plb { font-size: 11px; color: #7a8aaa; width: 100px; }
.pv  { font-size: 11px; color: #e0e6f0; font-weight: 600; flex: 1; }
.ks  { display: flex; gap: 4px; margin-top: 8px; }
.kc  { flex: 1; background: #252d40; border-radius: 5px; padding: 5px; text-align: center; }
.kv  { font-size: 11px; font-weight: 800; color: #e0e6f0; }
.kl  { font-size: 9px; color: #7a8aaa; margin-top: 1px; }
.poi-popup { background: #1e2436; border: 1px solid #2a3045; border-radius: 8px;
             padding: 8px 10px; }
.poi-name  { color: #e0e6f0; font-size: 12px; font-weight: 700; }
.poi-type  { color: #7a8aaa; font-size: 10px; margin-top: 2px; }
`

// ── Helpers HTML de popups ───────────────────────────────────────────────────

function sedePopupHtml(s: Sede): string {
  const c = s.color || '#F5C300'
  return `
<div>
  <div class="ph" style="background:${c}20;border-bottom:1px solid ${c}40">
    <div class="pn" style="background:${c}">${s.numero}</div>
    <div>
      <div class="pl">${s.nombre}</div>
      <div class="pz">${s.localidad} · ${s.zona}</div>
    </div>
  </div>
  <div class="pb">
    <div class="ps">Autoridades</div>
    <div class="pr"><span class="plb">Presidente</span><span class="pv">${s.presidente || '—'}</span></div>
    <div class="pr"><span class="plb">Vicepresidente</span><span class="pv">${s.vicepresidente || '—'}</span></div>
    <div class="ks">
      <div class="kc"><div class="kv" style="color:${c}">${(s.redKm ?? 0).toFixed(1)}</div><div class="kl">km Total</div></div>
      <div class="kc"><div class="kv">${(s.redTerciaria ?? 0).toFixed(1)}</div><div class="kl">Terciaria</div></div>
      <div class="kc"><div class="kv" style="color:#27ae60">${(s.redSecundaria ?? 0).toFixed(1)}</div><div class="kl">Secundaria</div></div>
      <div class="kc"><div class="kv" style="color:#e67e22">${(s.redPrimaria ?? 0).toFixed(1)}</div><div class="kl">Primaria</div></div>
    </div>
  </div>
</div>`
}

function rpPopupHtml(p: Record<string, unknown>): string {
  // Properties: Nombre (ruta nº), Zona, Jerarq, Mat_Calzad, Mantenim
  const num  = p.Nombre   || p.nombre   || ''
  const zona = p.Zona     || p.zona     || ''
  const jer  = p.Jerarq   || p.jerarquia || '—'
  const mat  = p.Mat_Calzad || p.superficie || '—'
  const mant = p.Mantenim || p.mantenimiento || '—'
  return `
<div>
  <div class="ph" style="background:#1a2030;border-bottom:1px solid #2a3045">
    <div class="pn" style="background:#e67e22">RP</div>
    <div>
      <div class="pl">Ruta Provincial${num ? ' N° ' + num : ''}</div>
      <div class="pz">${zona ? 'Zona ' + zona : ''}</div>
    </div>
  </div>
  <div class="pb">
    <div class="pr"><span class="plb">Jerarquía</span><span class="pv">${jer}</span></div>
    <div class="pr"><span class="plb">Superficie</span><span class="pv">${mat}</span></div>
    <div class="pr"><span class="plb">Mantenimiento</span><span class="pv">${mant}</span></div>
  </div>
</div>`
}

function ccPopupHtml(p: Record<string, unknown>, zona: string): string {
  // Properties: CC (número), Nc (nomenclatura), Nm (vía), J (jerarquía), Mn (mantenimiento)
  const c    = CC_COLORS[zona] || '#888'
  const cc   = p.CC  || p.cc  || '—'
  const nc   = p.Nc  || p.NOMENCLATURA  || p.nomenclatura  || '—'
  const via  = p.Nm  || p.VIA_ASOCIADA  || p.via_asociada  || '—'
  const jer  = p.J   || p.JERARQUIA     || p.jerarquia     || '—'
  const mant = p.Mn  || p.MANTENIMIENTO || p.mantenimiento || '—'
  return `
<div>
  <div class="ph" style="background:${c}20;border-bottom:1px solid ${c}40">
    <div class="pn" style="background:${c}">CC</div>
    <div>
      <div class="pl">Red bajo Convenio CC</div>
      <div class="pz">CC N° ${cc} · ${zona}</div>
    </div>
  </div>
  <div class="pb">
    <div class="pr"><span class="plb">Nomenclatura</span><span class="pv">${nc}</span></div>
    <div class="pr"><span class="plb">Vía asociada</span><span class="pv">${via}</span></div>
    <div class="pr"><span class="plb">Jerarquía</span><span class="pv">${jer}</span></div>
    <div class="pr"><span class="plb">Mantenimiento</span><span class="pv">${mant}</span></div>
  </div>
</div>`
}

function relevPopupHtml(r: Relevamiento): string {
  const color = TIPO_COLORS[r.tipo] || '#607D8B'
  const fecha = r.fecha ? new Date(r.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
  return `
<div>
  <div class="ph" style="background:${color}20;border-bottom:1px solid ${color}40">
    <div class="pn" style="background:${color}">${r.tipo[0]}</div>
    <div>
      <div class="pl">${r.tipo}</div>
      <div class="pz">${fecha} · ${r.zona || '—'}</div>
    </div>
  </div>
  <div class="pb">
    <div class="pr"><span class="plb">Estado calzada</span><span class="pv">${r.estado_calzada || '—'}</span></div>
    <div class="pr"><span class="plb">Tramo</span><span class="pv">${r.ruta_tramo || '—'}</span></div>
    <div class="pr"><span class="plb">CC asociado</span><span class="pv">${r.cc_asociado || '—'}</span></div>
    <div style="margin-top:8px;text-align:right">
      <a href="/dashboard/relevamientos/${r.id}" style="color:#F5C300;font-size:11px;font-weight:700;text-decoration:none">Ver detalle →</a>
    </div>
  </div>
</div>`
}

// ── Tipos ────────────────────────────────────────────────────────────────────

interface Sede {
  numero: number; nombre: string; localidad: string; zona: string; color: string;
  lat: number; lng: number; redKm: number; redPrimaria: number;
  redSecundaria: number; redTerciaria: number; presidente: string; vicepresidente: string;
  secretario: string; tesorero: string;
}

type LayerKey =
  | 'limite' | 'zonas' | 'departamentos'
  | 'rnNacional'
  | 'rpPavimentada' | 'rpMejorada' | 'rpEnObra' | 'rpTierra'
  | 'ccZI' | 'ccZII' | 'ccZIII' | 'ccZIV' | 'ccZV'
  | 'sedes' | 'campamentos' | 'salud' | 'educacion'
  | 'dvpZIV' | 'dvpZV'
  | 'relevPuente' | 'relevAlcantarilla' | 'relevTubos' | 'relevLineal' | 'relevOtro'

type LayerState = Record<LayerKey, boolean>

const DEFAULT_LAYERS: LayerState = {
  limite: true, zonas: true, departamentos: true,
  rnNacional: false,
  rpPavimentada: true, rpMejorada: true, rpEnObra: false, rpTierra: false,
  ccZI: false, ccZII: false, ccZIII: false, ccZIV: false, ccZV: false,
  sedes: true, campamentos: false, salud: false, educacion: false,
  dvpZIV: false, dvpZV: false,
  relevPuente: true, relevAlcantarilla: true, relevTubos: true, relevLineal: true, relevOtro: true,
}

interface Props { relevamientos: Relevamiento[]; measureActive?: boolean; onMeasureChange?: (v: boolean) => void }

// ── RightPanel: panel flotante derecho para tipos de relevamiento ────────────

const RELEV_ITEMS: [LayerKey, string, string][] = [
  ['relevPuente',       'Puente',       '#2196F3'],
  ['relevAlcantarilla', 'Alcantarilla', '#FF9800'],
  ['relevTubos',        'Tubos',        '#9C27B0'],
  ['relevLineal',       'Lineal',       '#4CAF50'],
  ['relevOtro',         'Otro',         '#607D8B'],
]

const ZONAS_LIST = ['ZI', 'ZII', 'ZIII', 'ZIV', 'ZV'] as const
const ZONA_LABEL: Record<string, string> = { ZI: 'Zona I', ZII: 'Zona II', ZIII: 'Zona III', ZIV: 'Zona IV', ZV: 'Zona V' }
const TIPOS_LIST = ['Puente', 'Alcantarilla', 'Tubos', 'Lineal', 'Otro']
const TIPO_SHORT: Record<string, string> = { Puente: 'PTE', Alcantarilla: 'ALC', Tubos: 'TUB', Lineal: 'LIN', Otro: 'OTR' }
const TIPO_COLOR: Record<string, string> = { Puente: '#2196F3', Alcantarilla: '#FF9800', Tubos: '#9C27B0', Lineal: '#4CAF50', Otro: '#607D8B' }

function RightPanel({
  layers, toggle, relevamientos, activeZones, onToggleZone,
}: {
  layers: LayerState
  toggle: (k: LayerKey) => void
  relevamientos: Relevamiento[]
  activeZones: Set<string>
  onToggleZone: (z: string) => void
}) {
  const [open, setOpen] = useState(true)
  const PANEL: React.CSSProperties = {
    position: 'absolute', top: 10, right: 10, zIndex: 1000,
    background: '#1e2436', border: '1px solid #2a3450',
    borderRadius: 8,
    overflowX: 'clip' as React.CSSProperties['overflowX'],
    boxShadow: '0 4px 12px rgba(0,0,0,.5)',
    fontFamily: 'system-ui, sans-serif',
    width: open ? 210 : 36,
    transition: 'width 0.2s',
    display: 'flex', flexDirection: 'column',
    maxHeight: 'calc(100vh - 40px)',
  }
  const ITEM: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6,
    marginBottom: 3, cursor: 'pointer', whiteSpace: 'nowrap',
    fontSize: 12, color: '#e0e6f0', userSelect: 'none',
  }
  const CB: React.CSSProperties = { accentColor: '#F5C300', cursor: 'pointer', flexShrink: 0 }
  const SEC: React.CSSProperties = { fontSize: 9, color: '#7a8aaa', textTransform: 'uppercase', letterSpacing: 0.8, margin: '8px 0 4px', fontWeight: 600 }

  // Stats: contar por zona y tipo
  const stats: Record<string, Record<string, number>> = {}
  ZONAS_LIST.forEach(z => { stats[z] = {}; TIPOS_LIST.forEach(t => { stats[z][t] = 0 }) })
  relevamientos.forEach(r => {
    const z = r.zona ?? ''
    if (z in stats && r.tipo in stats[z]) stats[z][r.tipo]++
  })
  const zTotal = (z: string) => TIPOS_LIST.reduce((a, t) => a + (stats[z]?.[t] ?? 0), 0)
  const tTotal = (t: string) => ZONAS_LIST.reduce((a, z) => a + (stats[z]?.[t] ?? 0), 0)
  const grand  = TIPOS_LIST.reduce((a, t) => a + tTotal(t), 0)

  const allZonesActive = activeZones.size === 0

  return (
    <div style={PANEL}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderBottom: '1px solid #2a3450', background: '#252d40', flexShrink: 0 }}>
        {open && <span style={{ fontWeight: 700, fontSize: 11, color: '#e0e6f0' }}>Relevamientos</span>}
        <button onClick={() => setOpen(v => !v)} style={{ background: 'none', border: 'none', color: '#7a8aaa', cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1, marginLeft: open ? 0 : 'auto' }} title={open ? 'Colapsar' : 'Expandir'}>
          {open ? '⮞' : '⮜'}
        </button>
      </div>
      {open && (
        <div style={{ padding: '8px 10px 10px', overflowY: 'auto', flex: 1 }}>

          {/* Tipos */}
          <div style={SEC}>Tipo</div>
          {RELEV_ITEMS.map(([k, label, color]) => (
            <label key={k} style={ITEM}>
              <input type="checkbox" checked={!!layers[k]} onChange={() => toggle(k)} style={CB} />
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
              {label}
            </label>
          ))}

          {/* Zonas */}
          <div style={SEC}>Zona</div>
          <label style={{ ...ITEM, color: allZonesActive ? '#F5C300' : '#e0e6f0' }}>
            <input type="checkbox" checked={allZonesActive} onChange={() => onToggleZone('__all__')} style={CB} />
            Todas
            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#7a8aaa' }}>{grand}</span>
          </label>
          {ZONAS_LIST.map(z => {
            const isActive = allZonesActive || activeZones.has(z)
            const n = zTotal(z)
            return (
              <label key={z} style={{ ...ITEM, color: isActive ? '#e0e6f0' : '#4a5a7a' }}>
                <input type="checkbox" checked={isActive} onChange={() => onToggleZone(z)} style={CB} />
                {ZONA_LABEL[z]}
                <span style={{ marginLeft: 'auto', fontSize: 10, color: isActive ? '#7a8aaa' : '#333' }}>{n}</span>
              </label>
            )
          })}

          {/* Tabla de subtotales */}
          <div style={SEC}>Subtotales</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
              <thead>
                <tr>
                  <th style={{ color: '#7a8aaa', textAlign: 'left', padding: '2px 4px', fontWeight: 600 }}></th>
                  {TIPOS_LIST.map(t => (
                    <th key={t} style={{ color: TIPO_COLOR[t], textAlign: 'center', padding: '2px 3px', fontWeight: 700, fontSize: 9 }}>{TIPO_SHORT[t]}</th>
                  ))}
                  <th style={{ color: '#e0e6f0', textAlign: 'center', padding: '2px 3px', fontWeight: 700 }}>∑</th>
                </tr>
              </thead>
              <tbody>
                {ZONAS_LIST.map(z => {
                  const n = zTotal(z)
                  if (n === 0) return null
                  return (
                    <tr key={z} style={{ opacity: allZonesActive || activeZones.has(z) ? 1 : 0.35 }}>
                      <td style={{ color: '#7a8aaa', padding: '2px 4px', fontWeight: 600 }}>{z}</td>
                      {TIPOS_LIST.map(t => (
                        <td key={t} style={{ color: stats[z][t] > 0 ? TIPO_COLOR[t] : '#333', textAlign: 'center', padding: '2px 3px', fontWeight: stats[z][t] > 0 ? 700 : 400 }}>
                          {stats[z][t] > 0 ? stats[z][t] : '·'}
                        </td>
                      ))}
                      <td style={{ color: '#e0e6f0', textAlign: 'center', padding: '2px 3px', fontWeight: 700 }}>{n}</td>
                    </tr>
                  )
                })}
                <tr style={{ borderTop: '1px solid #2a3450' }}>
                  <td style={{ color: '#e0e6f0', padding: '3px 4px', fontWeight: 700 }}>∑</td>
                  {TIPOS_LIST.map(t => (
                    <td key={t} style={{ color: tTotal(t) > 0 ? TIPO_COLOR[t] : '#333', textAlign: 'center', padding: '3px 3px', fontWeight: 700 }}>
                      {tTotal(t) > 0 ? tTotal(t) : '·'}
                    </td>
                  ))}
                  <td style={{ color: '#F5C300', textAlign: 'center', padding: '3px 3px', fontWeight: 800 }}>{grand}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Medición de distancias — helpers ─────────────────────────────────────────
function haversine(p1: {lat:number;lng:number}, p2: {lat:number;lng:number}): number {
  const R = 6371000
  const φ1 = p1.lat * Math.PI / 180, φ2 = p2.lat * Math.PI / 180
  const dφ = (p2.lat - p1.lat) * Math.PI / 180
  const dλ = (p2.lng - p1.lng) * Math.PI / 180
  const a = Math.sin(dφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(dλ/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}
function fmtDist(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m/1000).toFixed(2)} km`
}
function totalDist(pts: {lat:number;lng:number}[]): number {
  let t = 0; for (let i = 1; i < pts.length; i++) t += haversine(pts[i-1], pts[i]); return t
}


// ── ZoneRow: fila de zona CC con checkbox padre indeterminado + sub-lista ────

interface ZoneRowProps {
  zona: string
  consorcios: { numero: number; nombre: string }[]
  isExpanded: boolean
  isLayerOn: boolean          // whether the CC layer for this zone is currently on
  activeSet: Set<number>
  onToggleExpand: () => void
  onToggleZone: () => void    // no nums arg needed — just toggle on/off
  onToggleConsorcio: (num: number) => void
}

function ZoneRow({ zona, consorcios, isExpanded, isLayerOn, activeSet, onToggleExpand, onToggleZone, onToggleConsorcio }: ZoneRowProps) {
  const checkboxRef = useRef<HTMLInputElement>(null)
  // Layer on + empty filter set = all visible (fully checked)
  // Layer on + non-empty filter set = some selected (indeterminate)
  // Layer off = unchecked
  const allChecked  = isLayerOn && activeSet.size === 0
  const someChecked = isLayerOn && activeSet.size > 0
  const color       = CC_COLORS[zona] || '#888'

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = someChecked && !allChecked
    }
  }, [someChecked, allChecked])

  const ITEM: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 12, color: '#e0e6f0', userSelect: 'none' }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 3 }}>
        <label style={{ ...ITEM, flex: 1 }}>
          <input
            ref={checkboxRef}
            type="checkbox"
            checked={allChecked}
            onChange={() => onToggleZone()}
            style={{ accentColor: color, cursor: 'pointer', flexShrink: 0 }}
          />
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
          {zona}
        </label>
        {consorcios.length > 0 && (
          <button
            onClick={onToggleExpand}
            title={isExpanded ? 'Colapsar consorcios' : 'Ver consorcios'}
            style={{ background: 'none', border: 'none', color: '#7a8aaa', cursor: 'pointer', fontSize: 11, padding: '0 2px', lineHeight: 1, flexShrink: 0 }}
          >
            {isExpanded ? '▾' : '›'}
          </button>
        )}
      </div>

      {isExpanded && consorcios.length > 0 && (
        <div style={{ paddingLeft: 14, marginBottom: 4, borderLeft: `2px solid ${color}40` }}>
          {consorcios.map(s => (
            <label key={s.numero} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2, cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 11, color: '#b0b8cc', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={activeSet.has(s.numero)}
                onChange={() => onToggleConsorcio(s.numero)}
                style={{ accentColor: color, cursor: 'pointer', flexShrink: 0 }}
              />
              <span style={{ color, fontWeight: 700, minWidth: 24 }}>{s.numero}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 90 }} title={s.nombre}>{s.nombre}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Componente principal ─────────────────────────────────────────────────────

export default function MapInner({ relevamientos, measureActive = false, onMeasureChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<import('leaflet').Map | null>(null)
  // Leaflet layer groups keyed by LayerKey
  const groupsRef    = useRef<Partial<Record<LayerKey, import('leaflet').LayerGroup>>>({})
  const highlightRef = useRef<{ layer: import('leaflet').Path; style: import('leaflet').PathOptions } | null>(null)
  // CC road layers per zona → Map<CC_number, Path[]> para filtrado por consorcio
  const ccLayersRef  = useRef<Record<string, Map<number, import('leaflet').Path[]>>>({})

  const [mapReady, setMapReady]   = useState(false)
  const [layers, setLayers]       = useState<LayerState>(DEFAULT_LAYERS)
  const [panelOpen, setPanelOpen] = useState(true)
  const [geo, setGeo] = useState<Record<string, unknown> | null>(null)
  const [rp,  setRp]  = useState<Record<string, unknown> | null>(null)
  const [cc,  setCc]  = useState<Record<string, unknown> | null>(null)
  const [rn,  setRn]  = useState<Record<string, unknown> | null>(null)
  // Panel CC: zonas expandidas y consorcios seleccionados (vacío = todos visibles cuando la capa está ON)
  const [expandedCC, setExpandedCC] = useState<Set<string>>(new Set())
  const [ccSelected, setCcSelected] = useState<Record<string, Set<number>>>({
    ZI: new Set(), ZII: new Set(), ZIII: new Set(), ZIV: new Set(), ZV: new Set(),
  })

  // ── Medición de distancias ──
  const [measurePts, setMeasurePts]   = useState<{lat:number;lng:number}[]>([])
  const [satellite, setSatellite]     = useState(false)
  const [activeZones, setActiveZones]  = useState<Set<string>>(new Set())
  const tileRef = useRef<import('leaflet').TileLayer | null>(null)
  const mLayersRef  = useRef<import('leaflet').Layer[]>([])
  const mClickRef   = useRef<((e: import('leaflet').LeafletMouseEvent) => void) | null>(null)

  // ── Inject popup CSS once ──
  useEffect(() => {
    if (document.getElementById('map-popup-css')) return
    const style = document.createElement('style')
    style.id = 'map-popup-css'
    style.textContent = POPUP_CSS
    document.head.appendChild(style)
  }, [])

  // ── Populate DVP layers (tramos mantenidos ZIV y ZV) ────────────────────────
  useEffect(() => {
    if (!cc || !mapRef.current) return
    import('leaflet').then(L => {
      (['dvpZIV', 'dvpZV'] as const).forEach(key => {
        const ccKey = key === 'dvpZIV' ? 'ZIV_DVP' : 'ZV_DVP'
        const group = groupsRef.current[key]
        if (!group || !cc[ccKey]) return
        group.clearLayers()
        L.geoJSON(cc[ccKey] as unknown as GeoJSON.FeatureCollection, {
          style: { color: '#7B1FA2', weight: 3, opacity: 0.85, dashArray: '10 4' },
          onEachFeature(feature, layer) {
            const p = feature.properties ?? {}
            const zona = key === 'dvpZIV' ? 'Zona IV' : 'Zona V'
            const nm = p.Nm || p.nm || p.T || ''
            layer.bindPopup(`<div class="poi-popup"><div class="poi-name">Tramo${nm ? ' N° '+nm : ''}</div><div class="poi-type">Mantenimiento Provincial · ${zona}</div></div>`)
          },
        }).addTo(group)
      })
    })
  }, [cc, mapReady])

  // ── Basemap: cambiar entre OSM y Satélite ─────────────────────────────────
  useEffect(() => {
    if (!tileRef.current) return
    tileRef.current.setUrl(
      satellite
        ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
        : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
    )
  }, [satellite])

  // ── Medición: activar/desactivar handler de click ──────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    if (measureActive) {
      map.getContainer().style.cursor = 'crosshair'
      const onClick = (e: import('leaflet').LeafletMouseEvent) => {
        setMeasurePts(prev => [...prev, { lat: e.latlng.lat, lng: e.latlng.lng }])
      }
      mClickRef.current = onClick
      map.on('click', onClick)
    } else {
      map.getContainer().style.cursor = ''
      if (mClickRef.current) { map.off('click', mClickRef.current); mClickRef.current = null }
      mLayersRef.current.forEach(l => map.removeLayer(l)); mLayersRef.current = []
      setMeasurePts([])
    }
    return () => { if (mClickRef.current) map.off('click', mClickRef.current) }
  }, [measureActive, mapReady])

  // ── Medición: redibujar puntos/líneas/etiquetas cuando cambian measurePts ──
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    mLayersRef.current.forEach(l => map.removeLayer(l)); mLayersRef.current = []
    if (measurePts.length === 0) return
    import('leaflet').then(L => {
      const newLayers: import('leaflet').Layer[] = []
      const n = measurePts.length
      measurePts.forEach((p, i) => {
        const fc = i === 0 ? '#27ae60' : (i === n-1 && n > 1) ? '#F5C300' : '#fff'
        newLayers.push(L.circleMarker([p.lat, p.lng],
          { radius: 6, color: '#111', weight: 2, fillColor: fc, fillOpacity: 1 }
        ).addTo(map))
      })
      for (let i = 1; i < n; i++) {
        const p1 = measurePts[i-1], p2 = measurePts[i], d = haversine(p1, p2)
        newLayers.push(L.polyline([[p1.lat, p1.lng],[p2.lat, p2.lng]],
          { color: '#F5C300', weight: 2.5, opacity: 0.9, dashArray: '8 5' }
        ).addTo(map))
        const icon = L.divIcon({ className: '', iconAnchor: [0, 8],
          html: `<div style="background:#1e2436;color:#F5C300;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;border:1px solid rgba(245,195,0,.4);white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.5)">${fmtDist(d)}</div>` })
        newLayers.push(L.marker([(p1.lat+p2.lat)/2,(p1.lng+p2.lng)/2], { icon, interactive: false, zIndexOffset: 1000 }).addTo(map))
      }
      mLayersRef.current = newLayers
    })
  }, [measurePts, mapReady])

  // ── Load GeoJSON data ──
  useEffect(() => {
    fetch('/geo/geo_bundle.json').then(r => r.json()).then(setGeo).catch(() => {})
    fetch('/geo/geo_rp.json').then(r => r.json()).then(setRp).catch(() => {})
    fetch('/geo/geo_cc.json').then(r => r.json()).then(setCc).catch(() => {})
    fetch('/geo/geo_rn.json').then(r => r.json()).then(setRn).catch(() => {})
  }, [])

  // ── Init Leaflet map ──
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    // Flag para cancelar el .then si el cleanup corre antes de que resuelva
    // (React StrictMode ejecuta mount→cleanup→mount en desarrollo)
    let cancelled = false
    import('leaflet').then(L => {
      if (cancelled || !containerRef.current || mapRef.current) return
      const map = L.map(containerRef.current, {
        center: [-26.5, -60.5],
        zoom: 7,
        zoomControl: true,
      })
      tileRef.current = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map)
      mapRef.current = map
      setMapReady(true)

      // Pre-create all layer groups
      const keys: LayerKey[] = [
        'limite', 'zonas', 'departamentos',
        'rnNacional',
        'rpPavimentada', 'rpMejorada', 'rpEnObra', 'rpTierra',
        'ccZI', 'ccZII', 'ccZIII', 'ccZIV', 'ccZV',
        'sedes', 'campamentos', 'salud', 'educacion',
        'relevPuente', 'relevAlcantarilla', 'relevTubos', 'relevLineal', 'relevOtro',
      ]
      keys.forEach(k => {
        groupsRef.current[k] = L.layerGroup()
        if (DEFAULT_LAYERS[k]) groupsRef.current[k]!.addTo(map)
      })
    })
    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      if (containerRef.current) {
        (containerRef.current as any)._leaflet_id = null
      }
      groupsRef.current = {}
      setMapReady(false)
    }
  }, [])

  // ── Helper: capa visible + hit area con match exacto por referencia de feature ──
  function addInteractiveLayer(
    L: typeof import('leaflet'),
    fc: GeoJSON.FeatureCollection,
    baseStyle: import('leaflet').PathOptions,
    popupFn: (p: Record<string, unknown>) => string,
    group: import('leaflet').LayerGroup,
  ) {
    const featureToVisLayer = new Map<GeoJSON.Feature, import('leaflet').Path>()

    // Capa visible — registra cada layer en el Map keyed por su feature
    L.geoJSON(fc, {
      style: { ...baseStyle },
      onEachFeature(feature, layer) {
        const visLayer = layer as import('leaflet').Path
        featureToVisLayer.set(feature, visLayer)
        const popup = L.popup({ maxWidth: 280 }).setContent(popupFn(feature.properties ?? {}))
        visLayer.bindPopup(popup)
        visLayer.on('click', () => {
          if (highlightRef.current) {
            highlightRef.current.layer.setStyle(highlightRef.current.style)
            highlightRef.current = null
          }
          highlightRef.current = { layer: visLayer, style: { ...baseStyle } }
          visLayer.setStyle({ color: '#F5C300', weight: (baseStyle.weight ?? 2) + 4, opacity: 1, dashArray: undefined })
        })
        popup.on('remove', () => {
          if (highlightRef.current?.layer === visLayer) {
            visLayer.setStyle(baseStyle)
            highlightRef.current = null
          }
        })
      },
    }).addTo(group)

    // Hit area invisible — el mismo fc → mismos objetos feature → match exacto
    L.geoJSON(fc, {
      style: { color: '#000', weight: 22, opacity: 0.001, fillOpacity: 0 },
      onEachFeature(feature, hitLayer) {
        hitLayer.on('click', () => {
          featureToVisLayer.get(feature)?.fire('click')
        })
      },
    }).addTo(group)
  }

  // ── Populate geo_bundle layers when data arrives ──
  useEffect(() => {
    if (!geo || !mapRef.current) return
    import('leaflet').then(L => {
      // Límite provincial
      const limiteGroup = groupsRef.current.limite!
      limiteGroup.clearLayers()
      if (geo.limite_provincial) {
        L.geoJSON(geo.limite_provincial as GeoJSON.FeatureCollection, {
          style: { color: '#555', weight: 2, fillOpacity: 0, dashArray: '6 4' },
        }).addTo(limiteGroup)
      }

      // Zonas
      const zonasGroup = groupsRef.current.zonas!
      zonasGroup.clearLayers()
      const limZonas = geo.limites_zonas as Record<string, GeoJSON.FeatureCollection> | undefined
      if (limZonas) {
        Object.entries(ZONE_COLORS).forEach(([zona, c]) => {
          if (!limZonas[zona]) return
          L.geoJSON(limZonas[zona], {
            style: { color: 'transparent', weight: 0, fillColor: c, fillOpacity: 0.12 },
          }).addTo(zonasGroup)
          L.geoJSON(limZonas[zona], {
            style: { color: '#888', weight: 1, fillOpacity: 0 },
            onEachFeature(_, layer) {
              layer.bindPopup(
                `<div class="poi-popup"><div class="poi-name">Zona ${zona}</div><div class="poi-type">Límite zonal</div></div>`,
                { className: 'dark-popup' }
              )
            },
          }).addTo(zonasGroup)
        })
      }

      // Departamentos
      const deptGroup = groupsRef.current.departamentos!
      deptGroup.clearLayers()
      if (geo.departamentos) {
        L.geoJSON(geo.departamentos as GeoJSON.FeatureCollection, {
          style: { color: '#444', weight: 1, fillOpacity: 0, dashArray: '3 3' },
          onEachFeature(feature, layer) {
            const nombre = feature.properties?.nombre || feature.properties?.NOMBRE || ''
            if (nombre) layer.bindPopup(`<div class="poi-popup"><div class="poi-name">${nombre}</div><div class="poi-type">Departamento</div></div>`)
          },
        }).addTo(deptGroup)
      }

      // Sedes
      const sedesGroup = groupsRef.current.sedes!
      sedesGroup.clearLayers()
      const sedes: Sede[] = Array.isArray(geo.sedes) ? geo.sedes as Sede[] : []
      sedes.forEach(s => {
        const c = s.color || '#F5C300'
        const icon = L.divIcon({
          className: '',
          html: `<div style="width:18px;height:18px;border-radius:50%;background:${c};border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:7px;font-weight:800;color:#fff;box-shadow:0 2px 6px rgba(0,0,0,.5)">${s.numero}</div>`,
          iconSize: [18, 18], iconAnchor: [9, 9],
        })
        L.marker([s.lat, s.lng], { icon })
          .bindPopup(sedePopupHtml(s), { maxWidth: 280 })
          .addTo(sedesGroup)
      })

      // Campamentos
      const campGroup = groupsRef.current.campamentos!
      campGroup.clearLayers()
      if (geo.campamentos) {
        L.geoJSON(geo.campamentos as GeoJSON.FeatureCollection, {
          pointToLayer(_, latlng) {
            const icon = L.divIcon({
              className: '',
              html: `<div style="width:16px;height:16px;border-radius:50%;background:#e74c3c;border:2px solid #fff;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:12px;box-shadow:0 2px 4px rgba(0,0,0,.4)">+</div>`,
              iconSize: [16, 16], iconAnchor: [8, 8],
            })
            return L.marker(latlng, { icon })
          },
          onEachFeature(feature, layer) {
            const nombre = feature.properties?.nombre || feature.properties?.NOMBRE || 'Campamento'
            layer.bindPopup(`<div class="poi-popup"><div class="poi-name">${nombre}</div><div class="poi-type">Campamento Vial</div></div>`)
          },
        }).addTo(campGroup)
      }

      // Salud — geometrías MultiPoint → convertir a Point para que pointToLayer funcione
      const saludGroup = groupsRef.current.salud!
      saludGroup.clearLayers()
      if (geo.salud) {
        const saludRaw = geo.salud as { features: any[] }
        const saludPoints: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: saludRaw.features.flatMap((f: any) => {
            const coords: number[][] =
              f.geometry.type === 'MultiPoint' ? f.geometry.coordinates : [[...f.geometry.coordinates]]
            return coords.map((coord: number[]) => ({
              type: 'Feature' as const,
              properties: f.properties,
              geometry: { type: 'Point' as const, coordinates: coord },
            }))
          }),
        }
        L.geoJSON(saludPoints, {
          pointToLayer(_, latlng) {
            const icon = L.divIcon({
              className: '',
              html: `<div style="width:14px;height:14px;border-radius:50%;background:#e91e63;border:2px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;color:#fff;font-size:9px;font-weight:800">✚</div>`,
              iconSize: [14, 14], iconAnchor: [7, 7],
            })
            return L.marker(latlng, { icon })
          },
          onEachFeature(feature, layer) {
            const p = feature.properties ?? {}
            const nombre = p.fna || p.nam || 'Establecimiento de Salud'
            const tipo   = p.gna || 'Salud'
            layer.bindPopup(`<div class="poi-popup"><div class="poi-name">${nombre}</div><div class="poi-type">${tipo}</div></div>`)
          },
        }).addTo(saludGroup)
      }
    })
  }, [geo])

  // ── Populate Educación layer ──────────────────────────────────────────────
  const [edu, setEdu] = useState<any>(null)
  useEffect(() => { fetch('/geo/geo_edu.json').then(r => r.json()).then(setEdu).catch(() => {}) }, [])
  useEffect(() => {
    if (!edu || !mapRef.current) return
    import('leaflet').then(L => {
      const eduGroup = groupsRef.current.educacion!
      if (!eduGroup) return
      eduGroup.clearLayers()
      L.geoJSON(edu as GeoJSON.FeatureCollection, {
        pointToLayer(_, latlng) {
          const icon = L.divIcon({
            className: '',
            html: `<div style="width:14px;height:14px;border-radius:50%;background:#1565C0;border:2px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;color:#fff;font-size:8px;font-weight:800">📚</div>`,
            iconSize: [14, 14], iconAnchor: [7, 7],
          })
          return L.marker(latlng, { icon })
        },
        onEachFeature(feature, layer) {
          const p = feature.properties ?? {}
          const nombre = p.fna || p.nam || 'Establecimiento educativo'
          const tipo   = p.gna || 'Educación'
          layer.bindPopup(`<div class="poi-popup"><div class="poi-name">${nombre}</div><div class="poi-type">${tipo}</div></div>`)
        },
      }).addTo(eduGroup)
    })
  }, [edu, mapReady])

  // ── Populate RP layers ──
  useEffect(() => {
    if (!rp || !mapRef.current) return
    import('leaflet').then(L => {
      const rpStyles: Record<string, import('leaflet').PathOptions> = {
        rpTierra:      { color: '#e67e22', weight: 2,   opacity: 0.8 },
        rpPavimentada: { color: '#e74c3c', weight: 3,   opacity: 0.9 },
        rpMejorada:    { color: '#27ae60', weight: 2.5, opacity: 0.9 },
        rpEnObra:      { color: '#e74c3c', weight: 3,   opacity: 0.9, dashArray: '10 6' },
      }
      Object.entries(rpStyles).forEach(([key, style]) => {
        const group = groupsRef.current[key as LayerKey]
        if (!group || !rp[key]) return
        group.clearLayers()
        addInteractiveLayer(L, rp[key] as GeoJSON.FeatureCollection, style, rpPopupHtml, group)
      })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rp])

  // ── Populate RN layer ──
  useEffect(() => {
    if (!rn || !mapRef.current) return
    import('leaflet').then(L => {
      const group = groupsRef.current.rnNacional
      if (!group) return
      group.clearLayers()
      const style: import('leaflet').PathOptions = { color: '#c0392b', weight: 3.5, opacity: 0.95 }
      addInteractiveLayer(L, rn as unknown as GeoJSON.FeatureCollection, style, (p) => {
        const num  = p.Numero || p.numero || p.NUMERO || p.Nombre || p.nombre || ''
        const nom  = p.Nombre || p.nombre || ''
        const sup  = p.Superficie || p.superficie || p.Mat_Calzad || '—'
        return `
<div>
  <div class="ph" style="background:#c0392b20;border-bottom:1px solid #c0392b40">
    <div class="pn" style="background:#c0392b">RN</div>
    <div>
      <div class="pl">Ruta Nacional${num ? ' N° ' + num : ''}</div>
      <div class="pz">${nom || 'Chaco'}</div>
    </div>
  </div>
  <div class="pb">
    <div class="pr"><span class="plb">Superficie</span><span class="pv">${sup}</span></div>
  </div>
</div>`
      }, group)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rn])

  // ── Populate CC layers ──
  useEffect(() => {
    if (!cc || !mapReady || !mapRef.current) return
    import('leaflet').then(L => {
      Object.keys(ZONE_COLORS).forEach(zona => {
        const key = `cc${zona}` as LayerKey
        const group = groupsRef.current[key]
        if (!group || !cc[zona]) return
        group.clearLayers()
        const c = CC_COLORS[zona]
        const fc = cc[zona] as GeoJSON.FeatureCollection
        const baseStyle: import('leaflet').PathOptions = { color: c, weight: 1.8, opacity: 0.85 }
        const featureToVisLayer = new Map<GeoJSON.Feature, import('leaflet').Path>()
        // Inicializar mapa de layers por CC número para esta zona
        ccLayersRef.current[zona] = new Map()

        // Capa visible CC — también registra layers en ccLayersRef por CC número
        L.geoJSON(fc, {
          style(feature) {
            const j = (feature?.properties?.JERARQUIA || feature?.properties?.jerarquia || feature?.properties?.J || '') as string
            return { ...baseStyle, weight: CC_WEIGHT[j] ?? 1.8 }
          },
          onEachFeature(feature, layer) {
            const visLayer = layer as import('leaflet').Path
            featureToVisLayer.set(feature, visLayer)

            // Registrar en ccLayersRef para filtrado por consorcio
            const p = (feature.properties ?? {}) as Record<string, unknown>
            const ccNum = Number(p.CC ?? p.cc ?? 0)
            if (ccNum) {
              const arr = ccLayersRef.current[zona].get(ccNum) ?? []
              arr.push(visLayer)
              ccLayersRef.current[zona].set(ccNum, arr)
            }

            const j = (p.JERARQUIA || p.jerarquia || p.J || '') as string
            const featureW = CC_WEIGHT[j] ?? 1.8
            const featureStyle: import('leaflet').PathOptions = { ...baseStyle, weight: featureW }
            const popup = L.popup({ maxWidth: 280 }).setContent(ccPopupHtml(p, zona))
            visLayer.bindPopup(popup)
            visLayer.on('click', () => {
              if (highlightRef.current) {
                highlightRef.current.layer.setStyle(highlightRef.current.style)
                highlightRef.current = null
              }
              highlightRef.current = { layer: visLayer, style: featureStyle }
              visLayer.setStyle({ color: '#F5C300', weight: featureW + 4, opacity: 1, dashArray: undefined })
            })
            popup.on('remove', () => {
              if (highlightRef.current?.layer === visLayer) {
                visLayer.setStyle(featureStyle)
                highlightRef.current = null
              }
            })
          },
        }).addTo(group)

        // Hit area invisible CC — mismo fc → mismos objetos feature → match exacto
        L.geoJSON(fc, {
          style: { color: '#000', weight: 22, opacity: 0.001, fillOpacity: 0 },
          onEachFeature(feature, hitLayer) {
            hitLayer.on('click', () => {
              featureToVisLayer.get(feature)?.fire('click')
            })
          },
        }).addTo(group)
      })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cc, mapReady])

  // ── Populate relevamientos layers (sub-capa por tipo) ──
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    import('leaflet').then(L => {
      const TIPO_TO_KEY: Record<string, LayerKey> = {
        Puente: 'relevPuente', Alcantarilla: 'relevAlcantarilla',
        Tubos: 'relevTubos', Lineal: 'relevLineal', Otro: 'relevOtro',
      }
      const TIPO_LABEL: Record<string, string> = {
        Puente: 'PTE', Alcantarilla: 'ALC', Tubos: 'TUB', Lineal: 'LIN', Otro: '?',
      }

      // Limpiar todos los grupos de relevamiento
      ;(['relevPuente', 'relevAlcantarilla', 'relevTubos', 'relevLineal', 'relevOtro'] as LayerKey[])
        .forEach(k => groupsRef.current[k]?.clearLayers())

      relevamientos.forEach(r => {
        // Filtrar por zona activa
        if (activeZones.size > 0 && !activeZones.has(r.zona ?? '')) return
        const groupKey = TIPO_TO_KEY[r.tipo] ?? 'relevOtro'
        const group = groupsRef.current[groupKey]
        if (!group) return
        const color = TIPO_COLORS[r.tipo] || '#607D8B'
        const popup = L.popup({ maxWidth: 300, className: 'dark-popup' }).setContent(relevPopupHtml(r))

        if (r.tipo === 'Lineal' && r.coords_linea?.length) {
          const positions = r.coords_linea.map(p => [p.lat, p.lng] as [number, number])
          const visLine = L.polyline(positions, { color, weight: 6, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }).addTo(group)
          L.polyline(positions, { color: '#000', weight: 22, opacity: 0.001 })
            .bindPopup(popup)
            .on('click', () => {
              visLine.setStyle({ color: '#F5C300', weight: 8 })
              popup.on('remove', () => visLine.setStyle({ color, weight: 6 }))
            })
            .addTo(group)
          const [startLat, startLng] = positions[0]
          L.marker([startLat, startLng], { icon: L.divIcon({
            className: '',
            html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:1.5px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;font-size:6px;font-weight:800;color:#fff;letter-spacing:.2px">RIP</div>`,
            iconSize: [14, 14], iconAnchor: [7, 7],
          }) }).bindPopup(popup).addTo(group)

        } else if (r.coords_lat != null && r.coords_lng != null) {
          const label = TIPO_LABEL[r.tipo] || '?'
          L.marker([r.coords_lat, r.coords_lng], { icon: L.divIcon({
            className: '',
            html: `<div style="position:relative;width:18px;height:21px">
              <div style="width:18px;height:18px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:1.5px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,.55);position:absolute;top:0;left:0"></div>
              <div style="position:absolute;top:2px;left:0;width:18px;height:14px;display:flex;align-items:center;justify-content:center;font-size:6px;font-weight:800;color:#fff;letter-spacing:.2px;line-height:1">${label}</div>
            </div>`,
            iconSize: [18, 21], iconAnchor: [9, 21],
          }) }).bindPopup(popup).addTo(group)
        }
      })
    })
  }, [relevamientos, mapReady, activeZones])

  // ── Toggle layer visibility ──
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    import('leaflet').then(() => {
      Object.entries(layers).forEach(([key, visible]) => {
        const group = groupsRef.current[key as LayerKey]
        if (!group) return
        if (visible && !map.hasLayer(group)) {
          group.addTo(map)
        }
        if (!visible && map.hasLayer(group)) map.removeLayer(group)
      })
    })
  }, [layers])

  // ── Filtrado de CC por consorcio individual ──
  useEffect(() => {
    Object.entries(ccSelected).forEach(([zona, activeSet]) => {
      const layerMap = ccLayersRef.current[zona]
      if (!layerMap) return
      layerMap.forEach((paths, ccNum) => {
        // Empty set = no individual filter active → all visible; partial = filtered
        const visible = activeSet.size === 0 || activeSet.has(ccNum)
        paths.forEach(p => p.setStyle({ opacity: visible ? 0.85 : 0 }))
      })
    })
  }, [ccSelected])

  // ── Toggle helpers ──
  function onToggleZone(z: string) {
    if (z === '__all__') { setActiveZones(new Set()); return }
    setActiveZones(prev => {
      const next = new Set(prev)
      if (next.has(z)) next.delete(z); else next.add(z)
      // Si todas están activas, volver a "todas" (Set vacío)
      if (next.size === 5) return new Set()
      return next
    })
  }

  function toggle(key: LayerKey) {
    setLayers(prev => ({ ...prev, [key]: !prev[key] }))
  }

  function toggleExpandCC(zona: string) {
    setExpandedCC(prev => {
      const next = new Set(prev)
      if (next.has(zona)) next.delete(zona)
      else next.add(zona)
      return next
    })
  }

  // Checkbox padre — 3 estados:
  //   OFF  → click → ON (filtro vacío = todos visibles)
  //   ON con filtro individual (indeterminado) → click → ON (limpiar filtro = todos visibles)
  //   ON sin filtro (todos visibles) → click → OFF
  function toggleZone(zona: string) {
    const isOn    = layers[`cc${zona}` as LayerKey]
    const hasFilter = (ccSelected[zona]?.size ?? 0) > 0
    if (!isOn) {
      setCcSelected(prev => ({ ...prev, [zona]: new Set() }))
      setLayers(prev => ({ ...prev, [`cc${zona}` as LayerKey]: true }))
    } else if (hasFilter) {
      setCcSelected(prev => ({ ...prev, [zona]: new Set() }))
    } else {
      setLayers(prev => ({ ...prev, [`cc${zona}` as LayerKey]: false }))
    }
  }

  // Checkbox hijo: toggle individual. Si la capa estaba apagada, la enciende.
  function toggleConsorcio(zona: string, numero: number) {
    const wasOff = !layers[`cc${zona}` as LayerKey]
    setCcSelected(prev => {
      const next = new Set(prev[zona])
      if (next.has(numero)) next.delete(numero)
      else next.add(numero)
      return { ...prev, [zona]: next }
    })
    if (wasOff) {
      setLayers(prev => ({ ...prev, [`cc${zona}` as LayerKey]: true }))
    }
  }

  // ── Sedes agrupadas por zona (para sub-lista CC) ──
  const sedesByZona = useMemo(() => {
    const result: Record<string, { numero: number; nombre: string }[]> = {}
    if (!geo?.sedes) return result
    const sedes = geo.sedes as Sede[]
    sedes.forEach(s => {
      if (!result[s.zona]) result[s.zona] = []
      result[s.zona].push({ numero: s.numero, nombre: s.nombre })
    })
    Object.values(result).forEach(arr => arr.sort((a, b) => a.numero - b.numero))
    return result
  }, [geo])

  // ── Panel de capas UI ─────────────────────────────────────────────────────

  // ── Estilos compartidos del panel ──
  const ITEM_STYLE: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6,
    marginBottom: 3, cursor: 'pointer', whiteSpace: 'nowrap',
    fontSize: 12, color: '#e0e6f0', userSelect: 'none',
  }
  const SECTION_TITLE_STYLE: React.CSSProperties = {
    fontSize: 10, color: '#7a8aaa', textTransform: 'uppercase',
    letterSpacing: 0.5, margin: '8px 0 4px', fontWeight: 600,
  }
  const DOT = (color: string) => (
    <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
  )
  const CHECKBOX_STYLE: React.CSSProperties = { accentColor: '#F5C300', cursor: 'pointer', flexShrink: 0 }

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />

      {/* Panel de capas flotante */}
      <div style={{
        position: 'absolute', top: 10, left: 10, zIndex: 1000,
        background: '#1e2436', border: '1px solid #2a3450',
        borderRadius: 8,
        // overflowX:clip recorta solo el eje horizontal (para la animación de colapso)
        // sin bloquear el scroll vertical del hijo
        overflowX: 'clip' as React.CSSProperties['overflowX'],
        boxShadow: '0 4px 12px rgba(0,0,0,.5)',
        fontFamily: 'system-ui, sans-serif',
        width: panelOpen ? 178 : 36,
        transition: 'width 0.2s',
        maxHeight: 'calc(100% - 20px)',
        display: 'flex', flexDirection: 'column',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderBottom: '1px solid #2a3450', background: '#252d40', flexShrink: 0 }}>
          {panelOpen && <span style={{ fontWeight: 700, fontSize: 11, color: '#e0e6f0' }}>Capas</span>}
          <button
            onClick={() => setPanelOpen(v => !v)}
            style={{ background: 'none', border: 'none', color: '#7a8aaa', cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1, marginLeft: panelOpen ? 0 : 'auto' }}
            title={panelOpen ? 'Colapsar' : 'Expandir'}
          >
            {panelOpen ? '⮜' : '⮞'}
          </button>
        </div>

        {panelOpen && (
          <div style={{ padding: '4px 10px 10px', overflowY: 'auto', flex: 1 }}>

            {/* BASE */}
            <div style={SECTION_TITLE_STYLE}>Base</div>
            <label style={ITEM_STYLE}>
              <input type="radio" name="basemap" checked={!satellite} onChange={() => setSatellite(false)} style={CHECKBOX_STYLE} />
              🗺 OpenStreetMap
            </label>
            <label style={ITEM_STYLE}>
              <input type="radio" name="basemap" checked={satellite} onChange={() => setSatellite(true)} style={CHECKBOX_STYLE} />
              🛰 Satélite
            </label>
            {(['limite', 'zonas', 'departamentos'] as const).map(k => (
              <label key={k} style={ITEM_STYLE}>
                <input type="checkbox" checked={!!layers[k]} onChange={() => toggle(k)} style={CHECKBOX_STYLE} />
                {{ limite: 'Límite provincial', zonas: 'Zonas', departamentos: 'Departamentos' }[k]}
              </label>
            ))}

            {/* RED VIAL */}
            <div style={SECTION_TITLE_STYLE}>Red Vial</div>
            {([
              ['rnNacional',    'RN Nacional',     '#c0392b'],
              ['rpPavimentada', 'RP Pavimentada',  '#e74c3c'],
              ['rpMejorada',    'RP Mejorada',     '#27ae60'],
              ['rpEnObra',      'RP En Obra',      '#e74c3c'],
              ['rpTierra',      'RP Tierra',       '#e67e22'],
            ] as [LayerKey, string, string][]).map(([k, label, color]) => (
              <label key={k} style={ITEM_STYLE}>
                <input type="checkbox" checked={!!layers[k]} onChange={() => toggle(k)} style={CHECKBOX_STYLE} />
                {DOT(color)}
                {label}
              </label>
            ))}

            {/* RED CC */}
            <div style={SECTION_TITLE_STYLE}>Red CC</div>
            {(['ZI', 'ZII', 'ZIII', 'ZIV', 'ZV'] as const).map(z => (
              <ZoneRow
                key={z}
                zona={z}
                consorcios={sedesByZona[z] ?? []}
                isExpanded={expandedCC.has(z)}
                isLayerOn={!!layers[`cc${z}` as LayerKey]}
                activeSet={ccSelected[z] ?? new Set()}
                onToggleExpand={() => toggleExpandCC(z)}
                onToggleZone={() => toggleZone(z)}
                onToggleConsorcio={(num) => toggleConsorcio(z, num)}
              />
            ))}

            {/* PUNTOS */}
            <div style={SECTION_TITLE_STYLE}>Puntos</div>
            <label style={ITEM_STYLE}>
              <input type="checkbox" checked={!!layers.sedes} onChange={() => toggle('sedes')} style={CHECKBOX_STYLE} />
              Sedes
            </label>
            <label style={ITEM_STYLE}>
              <input type="checkbox" checked={!!layers.campamentos} onChange={() => toggle('campamentos')} style={CHECKBOX_STYLE} />
              Campamentos
            </label>

            {/* ESTABLECIMIENTOS */}
            <div style={SECTION_TITLE_STYLE}>Establecimientos</div>
            <label style={ITEM_STYLE}>
              <input type="checkbox" checked={!!layers.salud} onChange={() => toggle('salud')} style={CHECKBOX_STYLE} />
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#e91e63', flexShrink: 0 }} />
              Centros de salud
            </label>
            <label style={ITEM_STYLE}>
              <input type="checkbox" checked={!!layers.educacion} onChange={() => toggle('educacion')} style={CHECKBOX_STYLE} />
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#1565C0', flexShrink: 0 }} />
              Centros educativos
            </label>

            {/* TRAMOS MANTENIDOS */}
            <div style={SECTION_TITLE_STYLE}>Tramos Mantenidos</div>
            <label style={ITEM_STYLE}>
              <input type="checkbox" checked={!!layers.dvpZIV} onChange={() => toggle('dvpZIV')} style={CHECKBOX_STYLE} />
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#7B1FA2', flexShrink: 0 }} />
              Zona IV
            </label>
            <label style={ITEM_STYLE}>
              <input type="checkbox" checked={!!layers.dvpZV} onChange={() => toggle('dvpZV')} style={CHECKBOX_STYLE} />
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#7B1FA2', flexShrink: 0 }} />
              Zona V
            </label>


          </div>
        )}
      </div>

      {/* ── Panel derecho — tipos de relevamiento ── */}
      <RightPanel layers={layers} toggle={toggle} relevamientos={relevamientos} activeZones={activeZones} onToggleZone={onToggleZone} />

      {/* ── Panel de medición flotante ── */}
      {measureActive && (
        <div style={{
          position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 1000, background: '#1e2436', border: '1.5px solid #F5C300',
          borderRadius: 12, padding: '12px 16px',
          boxShadow: '0 6px 24px rgba(0,0,0,.65)', minWidth: 280, maxWidth: '90%',
        }}>
          <div style={{ color: '#F5C300', fontSize: 10, fontWeight: 700, textAlign: 'center', letterSpacing: 0.8, marginBottom: 6, textTransform: 'uppercase' }}>
            📏 Medición — clic en el mapa para agregar puntos
          </div>
          <div style={{ color: '#e0e6f0', fontSize: 22, fontWeight: 900, textAlign: 'center', marginBottom: 12, minHeight: 30 }}>
            {measurePts.length === 0
              ? <span style={{ fontSize: 13, color: '#7a8aaa' }}>Hacé clic en el mapa para comenzar</span>
              : measurePts.length === 1
              ? <span style={{ fontSize: 13, color: '#aaa' }}>1 punto — seguí haciendo clic</span>
              : <span style={{ color: '#F5C300' }}>{fmtDist(totalDist(measurePts))}</span>
            }
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setMeasurePts(prev => prev.slice(0, -1))}
              disabled={measurePts.length === 0}
              style={{ flex: 1, background: '#252d40', border: '1px solid #3a4060', color: '#e0e6f0', borderRadius: 8, padding: '8px 4px', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: measurePts.length === 0 ? 0.4 : 1 }}
            >↩ Deshacer</button>
            <button
              onClick={() => setMeasurePts([])}
              disabled={measurePts.length === 0}
              style={{ flex: 1, background: '#252d40', border: '1px solid #3a4060', color: '#aaa', borderRadius: 8, padding: '8px 4px', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: measurePts.length === 0 ? 0.4 : 1 }}
            >🗑 Limpiar</button>
            <button
              onClick={() => onMeasureChange?.(false)}
              style={{ flex: 1, background: 'rgba(231,76,60,.15)', border: '1px solid rgba(231,76,60,.4)', color: '#e74c3c', borderRadius: 8, padding: '8px 4px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >✗ Cerrar</button>
          </div>
        </div>
      )}
    </div>
  )
}
