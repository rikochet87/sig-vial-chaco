'use client'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import 'leaflet/dist/leaflet.css'

// ── Tipos ─────────────────────────────────────────────────────────────────────
export interface TramoComp {
  id: string; ruta: string; color: string
  coords: [number, number][]
  lados: 1 | 2
  ha: number; haIzq: number; haDer: number
  desdeIzq: number; hastaIzq: number; anchoIzq: number
  desdeDer: number; hastaDer: number; anchoDer: number
}

interface SigBlock { nombre: string; cargo: string; cc: string; dni: string }

interface Props {
  tramosComp: TramoComp[]
  Sup_ha: number; haIzq: number; haDer: number
  apAdoptado: number; totalPres: number
  color: string; active: boolean
}

// ── Progresiva format: "00+000" (Argentine road standard) ─────────────────────
function fmtProg(m: number): string {
  const km  = Math.floor(m / 1000)
  const rem = Math.round(m % 1000)
  return `${String(km).padStart(2, '0')}+${String(rem).padStart(3, '0')}`
}

// ── North arrow (classic cartographic style) ──────────────────────────────────
const NorthArrow = () => (
  <svg width="52" height="65" viewBox="0 0 52 65" xmlns="http://www.w3.org/2000/svg">
    <circle cx="26" cy="32" r="22" fill="none" stroke="#333" strokeWidth="1.5"/>
    {/* black north half */}
    <path d="M26,10 L32,32 L26,28 L20,32 Z" fill="#222"/>
    {/* white south half */}
    <path d="M26,54 L32,32 L26,36 L20,32 Z" fill="#fff" stroke="#333" strokeWidth="0.8"/>
    <circle cx="26" cy="32" r="3" fill="#333"/>
    <text x="26" y="8" textAnchor="middle" fontSize="11" fontWeight="900"
      fill="#222" fontFamily="Arial, sans-serif">N</text>
  </svg>
)

// ── Cartographic scale bar ────────────────────────────────────────────────────
function ScaleBar({ mapInst }: { mapInst: any }) {
  const [info, setInfo] = useState<{ px: number; km: number; ratio: number } | null>(null)

  useEffect(() => {
    if (!mapInst) return
    const update = () => {
      try {
        const size   = mapInst.getSize()
        const bounds = mapInst.getBounds()
        const mPerPx = mapInst.distance(bounds.getSouthWest(), bounds.getSouthEast()) / size.x
        if (!mPerPx || !isFinite(mPerPx)) return
        const nice = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000]
        const target = mPerPx * 110
        const niceM  = nice.find(v => v >= target * 0.7) ?? nice[nice.length - 1]
        const barPx  = niceM / mPerPx
        // Scale ratio at 96dpi: realMM / screenMM
        const ratio  = Math.round((niceM * 1000) / (barPx * 25.4 / 96))
        setInfo({ px: barPx, km: niceM / 1000, ratio })
      } catch { /* ignore */ }
    }
    update()
    mapInst.on('zoomend moveend', update)
    return () => { mapInst.off('zoomend moveend', update) }
  }, [mapInst])

  if (!info) return null
  const { px, km, ratio } = info
  const half = px / 2

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', userSelect: 'none' }}>
      {/* Alternating black/white bar */}
      <div style={{ position: 'relative', height: 18, width: px }}>
        <div style={{ position: 'absolute', left: 0,    top: 4, width: half, height: 8, background: '#333' }}/>
        <div style={{ position: 'absolute', left: half, top: 4, width: half, height: 8, background: '#fff', border: '1px solid #333', borderLeft: 'none' }}/>
        {/* Ticks */}
        {[0, half, px].map((x, i) => (
          <div key={i} style={{ position: 'absolute', left: x - 0.75, top: 2, width: 1.5, height: 14, background: '#333' }}/>
        ))}
      </div>
      {/* Labels */}
      <div style={{ display: 'flex', width: px, justifyContent: 'space-between', fontSize: 9, color: '#333', lineHeight: 1 }}>
        <span>0</span>
        <span style={{ transform: 'translateX(50%)' }}>{(km / 2).toLocaleString('es-AR')}</span>
        <span>{km.toLocaleString('es-AR')} km</span>
      </div>
      <div style={{ fontSize: 8, color: '#555', marginTop: 4, letterSpacing: 0.3 }}>
        Escala: 1:{ratio.toLocaleString('es-AR')}
      </div>
    </div>
  )
}

// ── Helper: editable inline input ─────────────────────────────────────────────
const Editable = ({
  value, onChange, placeholder = '…', bold = false, style = {},
}: {
  value: string; onChange: (v: string) => void
  placeholder?: string; bold?: boolean; style?: React.CSSProperties
}) => (
  <input
    value={value}
    onChange={e => onChange(e.target.value)}
    placeholder={placeholder}
    style={{
      border: 'none', borderBottom: '1px dashed #bbb', outline: 'none',
      background: 'transparent', fontFamily: 'inherit', fontSize: 'inherit',
      fontWeight: bold ? 700 : 'inherit', color: 'inherit', padding: '0 2px',
      width: '100%', ...style,
    }}
  />
)

// ── Component ─────────────────────────────────────────────────────────────────
export default function MapComposicion({
  tramosComp, Sup_ha, haIzq, haDer, apAdoptado, totalPres, color, active,
}: Props) {

  // Header fields
  const [fOrganismo, setFOrganismo] = useState('')
  const [fZona,      setFZona]      = useState('')
  const [fObra,      setFObra]      = useState('Desmalezado de Banquinas')
  const [fUbicacion, setFUbicacion] = useState('')
  const [fEjecuta,   setFEjecuta]   = useState('')
  const [fPlazo,     setFPlazo]     = useState('06 MESES')

  // Signature blocks (4)
  const [sigs, setSigs] = useState<SigBlock[]>([
    { nombre: '', cargo: 'Secretario',         cc: '', dni: '' },
    { nombre: '', cargo: 'Presidente',          cc: '', dni: '' },
    { nombre: '', cargo: 'Jefe/Sec. Técnica',  cc: '', dni: '' },
    { nombre: '', cargo: 'Jefe Delegación',    cc: '', dni: '' },
  ])

  const updateSig = (i: number, key: keyof SigBlock, val: string) =>
    setSigs(p => p.map((s, j) => j === i ? { ...s, [key]: val } : s))

  // Map
  const mapDivRef  = useRef<HTMLDivElement>(null)
  const mapRef     = useRef<any>(null)
  const layersRef  = useRef<any[]>([])
  const compRef    = useRef<HTMLDivElement>(null)
  const [mapInst,  setMapInst] = useState<any>(null)

  // ── Init Leaflet ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return
    import('leaflet').then(L => {
      const Lf = L.default ?? L
      const map = Lf.map(mapDivRef.current!, {
        zoomControl: true,
        attributionControl: true,
        scrollWheelZoom: true,
      })
      Lf.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, crossOrigin: 'anonymous',
        attribution: '© OpenStreetMap contributors',
      }).addTo(map)
      mapRef.current = map
      setMapInst(map)
      setTimeout(() => map.invalidateSize(), 150)
      setTimeout(() => { map.invalidateSize() }, 600)
    })
    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Draw tramos + progresiva labels ──────────────────────────────────────
  const drawTramos = useCallback((map: any, Lf: any) => {
    layersRef.current.forEach(l => { try { l.remove() } catch { /* ignore */ } })
    layersRef.current = []

    const allLL: any[] = []

    tramosComp.filter(t => t.coords.length >= 2).forEach(t => {
      const lls = t.coords.map(([lat, lng]) => Lf.latLng(lat, lng))
      allLL.push(...lls)

      // Main polyline
      const pl = Lf.polyline(lls, { color: t.color, weight: 6, opacity: 0.9 }).addTo(map)
      layersRef.current.push(pl)

      // Thin white inner line for visibility
      const inner = Lf.polyline(lls, { color: '#fff', weight: 2, opacity: 0.4, dashArray: '4 8' }).addTo(map)
      layersRef.current.push(inner)

      // Progresiva labels at endpoints
      const addProgLabel = (ll: any, m: number, isStart: boolean) => {
        const icon = Lf.divIcon({
          className: '',
          html: `<div style="background:rgba(255,255,255,0.9);padding:2px 5px;border:1px solid #666;border-radius:2px;font-size:10px;font-family:Arial,sans-serif;color:#222;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.25);font-weight:600">${isStart ? 'Progresiva' : 'Prog.'} ${fmtProg(m)}</div>`,
          iconAnchor: isStart ? [0, 12] : [0, 12],
        })
        const mk = Lf.marker(ll, { icon, interactive: false, zIndexOffset: 1000 }).addTo(map)
        layersRef.current.push(mk)
      }

      addProgLabel(lls[0], t.desdeIzq, true)
      addProgLabel(lls[lls.length - 1], t.hastaIzq, false)
    })

    if (allLL.length > 0) {
      map.fitBounds(Lf.latLngBounds(allLL), { padding: [60, 60] })
    } else {
      map.setView([-27.45, -60.0], 9)
    }
  }, [tramosComp])

  useEffect(() => {
    if (!mapRef.current) return
    import('leaflet').then(L => drawTramos(mapRef.current, L.default ?? L))
  }, [tramosComp, drawTramos])

  // ── invalidateSize on tab activation ─────────────────────────────────────
  useEffect(() => {
    if (!active || !mapRef.current) return
    setTimeout(() => mapRef.current?.invalidateSize(), 50)
    setTimeout(() => mapRef.current?.invalidateSize(), 300)
  }, [active])

  // ── Exports ──────────────────────────────────────────────────────────────
  const exportPNG = async () => {
    if (!compRef.current) return
    const { default: h2c } = await import('html2canvas')
    await new Promise(r => setTimeout(r, 800))
    const canvas = await h2c(compRef.current, {
      useCORS: true, allowTaint: false, scale: 2,
      width: 794, height: 1123, windowWidth: 794, windowHeight: 1123,
    })
    const link = document.createElement('a')
    link.download = `${fObra.replace(/\s+/g, '_') || 'composicion'}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  // PDF: usar window.print() — el browser renderiza el mapa nativo sin problemas de canvas/CORS
  // El usuario elige "Guardar como PDF" en el diálogo de impresión
  const exportPDF = () => window.print()

  // ── Derived ───────────────────────────────────────────────────────────────
  const hasTramos = tramosComp.some(t => t.coords.length >= 2)
  const rutaMap   = new Map<string, string>()
  tramosComp.forEach(t => rutaMap.set(t.ruta, t.color))

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>

      {/* ── Toolbar (no-print) ────────────────────────────────────────────── */}
      <div className="no-print" style={{
        display: 'flex', gap: 8, alignItems: 'center', padding: '6px 10px',
        background: '#0a0a0a', borderRadius: 4, border: '1px solid #1a1a1a',
        flexShrink: 0, marginBottom: 8,
      }}>
        <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#555', flex: 1 }}>
          Composición A4 — {tramosComp.length} tramo{tramosComp.length !== 1 ? 's' : ''} · {Sup_ha.toFixed(4)} ha · editable (click en cualquier campo)
        </span>
        <button onClick={exportPDF} style={btn}>📄 Guardar PDF</button>
        <button onClick={exportPNG} style={btn}>🖼️ PNG</button>
      </div>

      {/* ── Scrollable frame ─────────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: '#2a2a2a', padding: '16px 0' }}>

        {/* ── Hoja A4 ──────────────────────────────────────────────────── */}
        <div ref={compRef} className="print-area" style={{
          width: 794, height: 1123, margin: '0 auto', background: '#fff', color: '#111',
          fontFamily: 'Arial, Helvetica, sans-serif',
          boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
          display: 'flex', flexDirection: 'column',
          padding: '18px 22px 14px',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}>

          {/* ── Header ─────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'stretch', marginBottom: 6, gap: 14 }}>
            {/* Logo box */}
            <div style={{
              width: 72, flexShrink: 0, border: '2px solid #333', borderRadius: 3,
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', background: '#f4f4f4', padding: 4,
            }}>
              <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -1, color: '#222', lineHeight: 1 }}>SIG</div>
              <div style={{ fontSize: 8, fontWeight: 700, color: '#888', letterSpacing: 2 }}>VIAL</div>
              <div style={{ fontSize: 7, color: '#aaa', marginTop: 2 }}>CHACO</div>
            </div>

            {/* Organismo block */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Editable
                value={fOrganismo} onChange={setFOrganismo}
                placeholder="ORGANISMO / DIRECCIÓN"
                bold style={{ fontSize: 13, letterSpacing: 1.2, marginBottom: 3 }}
              />
              <Editable
                value={fZona} onChange={setFZona}
                placeholder="ZONA / DELEGACIÓN"
                style={{ fontSize: 11, color: '#555', letterSpacing: 0.5 }}
              />
            </div>

            {/* Legal text */}
            <div style={{
              fontSize: 7.5, color: '#666', textAlign: 'right', lineHeight: 1.6,
              maxWidth: 210, flexShrink: 0, fontStyle: 'italic', alignSelf: 'center',
            }}>
              <div>"DONAR ÓRGANOS ES SALVAR VIDAS" Ley 4422</div>
              <div>{new Date().getFullYear()} — Año del 40° Aniversario del Juicio a las Juntas Militares,</div>
              <div>Ley N° 4153-B</div>
            </div>
          </div>

          {/* Separator */}
          <div style={{ borderBottom: '2.5px solid #222', marginBottom: 8 }}/>

          {/* ── Metadata ─────────────────────────────────────────────────── */}
          <div style={{ marginBottom: 10, fontSize: 12, lineHeight: 1.9 }}>
            {([
              { label: 'OBRA',      val: fObra,      set: setFObra,      ph: 'Tipo de obra y ruta' },
              { label: 'UBICACIÓN', val: fUbicacion, set: setFUbicacion, ph: 'Departamento / localidad' },
              { label: 'EJECUTA',   val: fEjecuta,   set: setFEjecuta,   ph: 'CONSORCIO CAMINERO N° ...' },
              { label: 'PLAZO',     val: fPlazo,     set: setFPlazo,     ph: '06 MESES' },
            ] as const).map(f => (
              <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <strong style={{ minWidth: 90, flexShrink: 0 }}>{f.label}:</strong>
                <Editable value={f.val} onChange={f.set} placeholder={f.ph} style={{ fontSize: 12 }} />
              </div>
            ))}
          </div>

          {/* ── Map frame ─────────────────────────────────────────────────── */}
          <div style={{
            border: '2px solid #444', position: 'relative',
            flex: 1, minHeight: 490,
          }}>
            {/* Inset title bar (top-center of map) */}
            <div style={{
              position: 'absolute', top: 8,
              left: '50%', transform: 'translateX(-50%)',
              background: '#fff', border: '1.5px solid #555',
              padding: '4px 18px', zIndex: 1000, textAlign: 'center',
              boxShadow: '0 1px 5px rgba(0,0,0,0.25)', pointerEvents: 'none',
              minWidth: 240,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                Obra: {fObra || '—'}
              </div>
              <div style={{ fontSize: 9.5, color: '#444' }}>
                {fEjecuta ? `CºCº: ${fEjecuta}` : 'CºCº: —'}
              </div>
            </div>

            {/* Leaflet map div */}
            <div ref={mapDivRef} style={{ position: 'absolute', inset: 0 }}/>

            {/* Empty state */}
            {!hasTramos && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                zIndex: 500, pointerEvents: 'none',
              }}>
                <div style={{
                  background: 'rgba(255,255,255,0.92)', padding: '10px 20px',
                  borderRadius: 3, fontSize: 12, color: '#999', border: '1px solid #ddd',
                }}>
                  Sin trazados — dibujá tramos en la pestaña Cómputo
                </div>
              </div>
            )}

            {/* North arrow (top-right) */}
            <div style={{
              position: 'absolute', top: 8, right: 8, zIndex: 1000, pointerEvents: 'none',
            }}>
              <NorthArrow />
            </div>

            {/* Scale bar (bottom-left) */}
            <div style={{
              position: 'absolute', bottom: 28, left: 10, zIndex: 1000,
              background: 'rgba(255,255,255,0.9)', padding: '6px 10px',
              border: '1px solid #bbb', pointerEvents: 'none',
            }}>
              <ScaleBar mapInst={mapInst} />
            </div>

            {/* Referencias (bottom-right) */}
            <div style={{
              position: 'absolute', bottom: 10, right: 10, zIndex: 1000,
              background: 'rgba(255,255,255,0.94)', border: '1.5px solid #555',
              padding: '8px 14px', minWidth: 170,
            }}>
              <div style={{
                fontSize: 12, fontWeight: 700, textAlign: 'center',
                marginBottom: 8, letterSpacing: 0.5, borderBottom: '1px solid #ccc', paddingBottom: 5,
              }}>REFERENCIAS</div>

              {/* Tramos de desmalezado */}
              {tramosComp.length > 0 && (
                <>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#444', marginBottom: 4 }}>
                    Desmalezado {fEjecuta || 'CºCº'}
                  </div>
                  {[...rutaMap.entries()].map(([ruta, col]) => (
                    <div key={ruta} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                      <svg width="30" height="6" style={{ flexShrink: 0 }}>
                        <rect width="30" height="6" rx="1" fill={col}/>
                      </svg>
                      <span style={{ fontSize: 9.5, color: '#222' }}>{ruta}</span>
                    </div>
                  ))}
                  <div style={{ borderTop: '1px solid #ddd', marginTop: 6, marginBottom: 6 }}/>
                </>
              )}

              {/* Road network legend (static, OSM basemap) */}
              <div style={{ fontSize: 9, fontWeight: 700, color: '#444', marginBottom: 4 }}>
                Rutas Provinciales y Nacionales
              </div>
              {[
                { label: 'Consolidado',  color: '#e6b800' },
                { label: 'Mejorado',     color: '#e08030' },
                { label: 'Pavimentado',  color: '#b03020' },
                { label: 'Tierra',       color: '#c4965a' },
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                  <svg width="26" height="4" style={{ flexShrink: 0 }}>
                    <rect width="26" height="4" rx="1" fill={r.color}/>
                  </svg>
                  <span style={{ fontSize: 9, color: '#444' }}>{r.label}</span>
                </div>
              ))}

              {tramosComp.length === 0 && (
                <div style={{ fontSize: 9, color: '#ccc', marginTop: 4 }}>Sin tramos trazados</div>
              )}
            </div>
          </div>

          {/* ── Footer: signature blocks ──────────────────────────────────── */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 12, marginTop: 14, paddingTop: 12, borderTop: '1px solid #ccc',
          }}>
            {sigs.map((s, i) => (
              <div key={i} style={{ textAlign: 'center', fontSize: 10 }}>
                {/* Signature space */}
                <div style={{ height: 38, borderBottom: '1px solid #333', marginBottom: 4 }}/>
                {/* Name */}
                <input value={s.nombre} placeholder="Nombre Apellido"
                  onChange={e => updateSig(i, 'nombre', e.target.value)}
                  style={sigInp(true)} />
                {/* Cargo */}
                <input value={s.cargo}
                  onChange={e => updateSig(i, 'cargo', e.target.value)}
                  style={sigInp(false)} />
                {/* CC */}
                <input value={s.cc} placeholder="C°C° n°…"
                  onChange={e => updateSig(i, 'cc', e.target.value)}
                  style={sigInp(false)} />
                {/* DNI */}
                <input value={s.dni} placeholder="DNI XX.XXX.XXX"
                  onChange={e => updateSig(i, 'dni', e.target.value)}
                  style={{ ...sigInp(false), fontSize: 9 }} />
              </div>
            ))}
          </div>

        </div>{/* fin hoja */}
      </div>

      {/* ── Print CSS ─────────────────────────────────────────────────────── */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }

          /* Ocultar TODO excepto la composición */
          html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
          body * { visibility: hidden; }

          /* Mostrar solo la hoja A4 */
          .print-area, .print-area * { visibility: visible; }
          .print-area {
            position: fixed !important;
            top: 0 !important; left: 0 !important;
            width: 210mm !important; height: 297mm !important;
            margin: 0 !important; padding: 5mm 6mm !important;
            box-shadow: none !important; overflow: hidden !important;
            background: white !important; box-sizing: border-box !important;
          }

          /* Barra de escala y referencias: asegurar visibilidad en print */
          .leaflet-container { background: #e0e8f0 !important; }
        }
      `}</style>
    </div>
  )
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const btn: React.CSSProperties = {
  fontFamily: 'monospace', padding: '4px 12px', fontSize: 10, cursor: 'pointer',
  border: '1px solid #333', background: '#111', color: '#aaa', borderRadius: 2,
}

const sigInp = (bold: boolean): React.CSSProperties => ({
  border: 'none', outline: 'none', background: 'transparent', width: '100%',
  textAlign: 'center', fontFamily: 'Arial, sans-serif',
  fontSize: 10, fontWeight: bold ? 700 : 400, color: bold ? '#222' : '#666',
  display: 'block', lineHeight: 1.4,
})
