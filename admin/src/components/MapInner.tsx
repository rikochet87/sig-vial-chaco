'use client'
import { useEffect, useRef, useState } from 'react'
import type { Relevamiento } from '@/types'
import 'leaflet/dist/leaflet.css'

// ── Constantes de color ──────────────────────────────────────────────────────

const ZONE_COLORS: Record<string, string> = {
  ZI: '#6baed6', ZII: '#fc8d59', ZIII: '#78c679', ZIV: '#e78ac3', ZV: '#a6d854',
}

const CC_COLORS: Record<string, string> = {
  ZI: '#4a85a0', ZII: '#b05a3a', ZIII: '#9a8630', ZIV: '#4a845a', ZV: '#6a649a',
}

const TIPO_COLORS: Record<string, string> = {
  Puente: '#2196F3', Alcantarilla: '#FF9800', Tubos: '#9C27B0', Ripio: '#4CAF50', Otro: '#607D8B',
}

const CC_WEIGHT: Record<string, number> = {
  PRIMARIA: 2.5, SECUNDARIA: 1.8, TERCIARIA: 1.2,
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
  return `
<div>
  <div class="ph" style="background:${color}20;border-bottom:1px solid ${color}40">
    <div class="pn" style="background:${color}">${r.tipo[0]}</div>
    <div>
      <div class="pl">${r.tipo}</div>
      <div class="pz">${r.tecnico || '—'} · ${r.fecha || '—'}</div>
    </div>
  </div>
  <div class="pb">
    <div class="pr"><span class="plb">Estado calzada</span><span class="pv">${r.estado_calzada || '—'}</span></div>
    <div class="pr"><span class="plb">Tramo</span><span class="pv">${r.ruta_tramo || '—'}</span></div>
    <div class="pr"><span class="plb">Zona</span><span class="pv">${r.auto_deteccion?.zona || '—'}</span></div>
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
  | 'rpPavimentada' | 'rpMejorada' | 'rpEnObra' | 'rpTierra'
  | 'ccZI' | 'ccZII' | 'ccZIII' | 'ccZIV' | 'ccZV'
  | 'sedes' | 'campamentos' | 'relevamientos'

type LayerState = Record<LayerKey, boolean>

const DEFAULT_LAYERS: LayerState = {
  limite: true, zonas: true, departamentos: true,
  rpPavimentada: true, rpMejorada: true, rpEnObra: false, rpTierra: false,
  ccZI: false, ccZII: false, ccZIII: false, ccZIV: false, ccZV: false,
  sedes: true, campamentos: false, relevamientos: true,
}

interface Props { relevamientos: Relevamiento[] }

// ── Componente principal ─────────────────────────────────────────────────────

export default function MapInner({ relevamientos }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<import('leaflet').Map | null>(null)
  // Leaflet layer groups keyed by LayerKey
  const groupsRef    = useRef<Partial<Record<LayerKey, import('leaflet').LayerGroup>>>({})
  const highlightRef = useRef<{ layer: import('leaflet').Path; style: import('leaflet').PathOptions } | null>(null)

  const [layers, setLayers]       = useState<LayerState>(DEFAULT_LAYERS)
  const [panelOpen, setPanelOpen] = useState(true)
  const [geo, setGeo] = useState<Record<string, unknown> | null>(null)
  const [rp,  setRp]  = useState<Record<string, unknown> | null>(null)
  const [cc,  setCc]  = useState<Record<string, unknown> | null>(null)

  // ── Inject popup CSS once ──
  useEffect(() => {
    if (document.getElementById('map-popup-css')) return
    const style = document.createElement('style')
    style.id = 'map-popup-css'
    style.textContent = POPUP_CSS
    document.head.appendChild(style)
  }, [])

  // ── Load GeoJSON data ──
  useEffect(() => {
    fetch('/geo/geo_bundle.json').then(r => r.json()).then(setGeo).catch(() => {})
    fetch('/geo/geo_rp.json').then(r => r.json()).then(setRp).catch(() => {})
    fetch('/geo/geo_cc.json').then(r => r.json()).then(setCc).catch(() => {})
  }, [])

  // ── Init Leaflet map ──
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    import('leaflet').then(L => {
      const map = L.map(containerRef.current!, {
        center: [-26.5, -60.5],
        zoom: 7,
        zoomControl: true,
      })
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map)
      mapRef.current = map

      // Pre-create all layer groups
      const keys: LayerKey[] = [
        'limite', 'zonas', 'departamentos',
        'rpPavimentada', 'rpMejorada', 'rpEnObra', 'rpTierra',
        'ccZI', 'ccZII', 'ccZIII', 'ccZIV', 'ccZV',
        'sedes', 'campamentos', 'relevamientos',
      ]
      keys.forEach(k => {
        groupsRef.current[k] = L.layerGroup()
        if (DEFAULT_LAYERS[k]) groupsRef.current[k]!.addTo(map)
      })
    })
    return () => {
      mapRef.current?.remove()
      mapRef.current = null
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
          html: `<div style="width:26px;height:26px;border-radius:50%;background:${c};border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:#fff;box-shadow:0 2px 6px rgba(0,0,0,.5)">${s.numero}</div>`,
          iconSize: [26, 26], iconAnchor: [13, 13],
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
    })
  }, [geo])

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

  // ── Populate CC layers ──
  useEffect(() => {
    if (!cc || !mapRef.current) return
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

        // Capa visible CC
        L.geoJSON(fc, {
          style(feature) {
            const j = (feature?.properties?.JERARQUIA || feature?.properties?.jerarquia || '') as string
            return { ...baseStyle, weight: CC_WEIGHT[j] ?? 1.8 }
          },
          onEachFeature(feature, layer) {
            const visLayer = layer as import('leaflet').Path
            featureToVisLayer.set(feature, visLayer)
            const p = (feature.properties ?? {}) as Record<string, unknown>
            const j = (p.JERARQUIA || p.jerarquia || '') as string
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
  }, [cc])

  // ── Populate relevamientos layer ──
  useEffect(() => {
    if (!mapRef.current) return
    import('leaflet').then(L => {
      const group = groupsRef.current.relevamientos!
      group.clearLayers()
      relevamientos.forEach(r => {
        const color = TIPO_COLORS[r.tipo] || '#607D8B'
        const popup = L.popup({ maxWidth: 280 }).setContent(relevPopupHtml(r))
        if (r.tipo === 'Ripio' && r.coords_linea?.length) {
          const positions = r.coords_linea.map(p => [p.lat, p.lng] as [number, number])
          L.polyline(positions, { color: '#4CAF50', weight: 3 })
            .bindPopup(popup)
            .addTo(group)
        } else if (r.coords) {
          const icon = L.divIcon({
            className: '',
            html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>`,
            iconSize: [14, 14], iconAnchor: [7, 7],
          })
          L.marker([r.coords.lat, r.coords.lng], { icon })
            .bindPopup(popup)
            .addTo(group)
        }
      })
    })
  }, [relevamientos])

  // ── Toggle layer visibility ──
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    import('leaflet').then(() => {
      Object.entries(layers).forEach(([key, visible]) => {
        const group = groupsRef.current[key as LayerKey]
        if (!group) return
        if (visible && !map.hasLayer(group)) group.addTo(map)
        if (!visible && map.hasLayer(group)) map.removeLayer(group)
      })
    })
  }, [layers])

  // ── Toggle helper ──
  function toggle(key: LayerKey) {
    setLayers(prev => ({ ...prev, [key]: !prev[key] }))
  }

  // ── Panel de capas UI ─────────────────────────────────────────────────────

  const panelStyle: React.CSSProperties = {
    position: 'absolute', top: 10, left: 10, zIndex: 1000,
    background: '#1e2436', border: '1px solid #2a3450',
    borderRadius: 8, overflow: 'hidden',
    boxShadow: '0 4px 12px rgba(0,0,0,.5)',
    fontFamily: 'system-ui, sans-serif',
    fontSize: 12, color: '#e0e6f0',
    minWidth: panelOpen ? 170 : 36,
    transition: 'min-width 0.2s',
  }

  function SectionTitle({ children }: { children: string }) {
    return <div style={{ fontSize: 10, color: '#7a8aaa', textTransform: 'uppercase', letterSpacing: 0.5, margin: '8px 0 4px' }}>{children}</div>
  }

  function LayerCheck({ k, label, dot }: { k: LayerKey; label: string; dot?: string }) {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, cursor: 'pointer', whiteSpace: 'nowrap' }}>
        <input type="checkbox" checked={layers[k]} onChange={() => toggle(k)} style={{ accentColor: '#F5C300', cursor: 'pointer' }} />
        {dot && <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, display: 'inline-block', flexShrink: 0 }} />}
        {label}
      </label>
    )
  }

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <div ref={containerRef} style={{ height: '100%', width: '100%', borderRadius: 8 }} />

      {/* Panel de capas flotante */}
      <div style={panelStyle}>
        {/* Header del panel */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderBottom: '1px solid #2a3450', background: '#252d40' }}>
          {panelOpen && <span style={{ fontWeight: 700, fontSize: 11, color: '#e0e6f0' }}>Capas</span>}
          <button
            onClick={() => setPanelOpen(v => !v)}
            style={{ background: 'none', border: 'none', color: '#7a8aaa', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1, marginLeft: panelOpen ? 0 : 'auto' }}
            title={panelOpen ? 'Colapsar' : 'Expandir'}
          >
            {panelOpen ? '⮜' : '⮞'}
          </button>
        </div>

        {panelOpen && (
          <div style={{ padding: '4px 10px 10px' }}>
            <SectionTitle>Base</SectionTitle>
            <LayerCheck k="limite"        label="Límite provincial" />
            <LayerCheck k="zonas"         label="Zonas" />
            <LayerCheck k="departamentos" label="Departamentos" />

            <SectionTitle>Red Vial</SectionTitle>
            <LayerCheck k="rpPavimentada" label="RP Pavimentada" dot="#e74c3c" />
            <LayerCheck k="rpMejorada"    label="RP Mejorada"    dot="#27ae60" />
            <LayerCheck k="rpEnObra"      label="RP En Obra"     dot="#e74c3c" />
            <LayerCheck k="rpTierra"      label="RP Tierra"      dot="#e67e22" />

            <SectionTitle>Red CC</SectionTitle>
            {(['ZI', 'ZII', 'ZIII', 'ZIV', 'ZV'] as const).map(z => (
              <LayerCheck key={z} k={`cc${z}` as LayerKey} label={z} dot={CC_COLORS[z]} />
            ))}

            <SectionTitle>Puntos</SectionTitle>
            <LayerCheck k="sedes"       label="Sedes" />
            <LayerCheck k="campamentos" label="Campamentos" />

            <SectionTitle>Relevamientos</SectionTitle>
            <LayerCheck k="relevamientos" label="Relevamientos" />
          </div>
        )}
      </div>
    </div>
  )
}
