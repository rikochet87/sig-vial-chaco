'use client'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import 'leaflet/dist/leaflet.css'

// ── Tipos ─────────────────────────────────────────────────────────────────────
export interface RipioComp {
  id: string
  nombre: string
  an: number       // ancho (m)
  l_m: number      // longitud (m)
  coords: [number, number][] | null
  color: string    // color resuelto (sin null)
}

interface SigBlock { nombre: string; cargo: string; cc: string; dni: string }

interface Props {
  ripios:          RipioComp[]
  proyectoNombre:  string
  totalTon:        number
  totalPres:       number
  active:          boolean
}

// ── Geometría (roadBuffer local, igual que en RipioMapPanel) ──────────────────
type LatLng = [number, number]

function roadBuffer(latLngs: LatLng[], halfWidth: number): LatLng[][] {
  if (latLngs.length < 2 || halfWidth <= 0) return []
  const DEG = Math.PI / 180, R = 6371000
  const lat0 = latLngs[0][0], lng0 = latLngs[0][1]
  const cosLat = Math.cos(lat0 * DEG)

  let raw = latLngs.map(([lat, lng]) => ({
    x: (lng - lng0) * cosLat * R * DEG,
    y: (lat - lat0) * R * DEG,
  }))

  const d01 = Math.hypot(raw[0].x - raw[raw.length-1].x, raw[0].y - raw[raw.length-1].y)
  const isClosed = d01 < 2
  if (isClosed && raw.length > 2) raw = raw.slice(0, -1)
  const n = raw.length

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
      mx = -T[0].y * halfWidth; my = T[0].x * halfWidth
    } else if (isLast) {
      mx = -T[T.length-1].y * halfWidth; my = T[T.length-1].x * halfWidth
    } else {
      const t1 = T[(i - 1 + T.length) % T.length]
      const t2 = T[i % T.length]
      const cross = t1.x * t2.y - t1.y * t2.x
      if (Math.abs(cross) < 0.05) {
        const nx = -(t1.y + t2.y), ny = (t1.x + t2.x)
        const nlen = Math.sqrt(nx*nx + ny*ny) || 1
        mx = (nx/nlen) * halfWidth; my = (ny/nlen) * halfWidth
      } else {
        const mxRaw = halfWidth * (t2.x - t1.x) / cross
        const myRaw = halfWidth * (t2.y - t1.y) / cross
        if (Math.sqrt(mxRaw*mxRaw + myRaw*myRaw) <= MAX_MITER) {
          mx = mxRaw; my = myRaw
        } else {
          const nx = -(t1.y + t2.y), ny = (t1.x + t2.x)
          const nlen = Math.sqrt(nx*nx + ny*ny) || 1
          mx = (nx/nlen) * halfWidth; my = (ny/nlen) * halfWidth
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
  if (isClosed) return [left.map(toLL), right.map(toLL)]
  return [[...left.map(toLL), ...right.reverse().map(toLL)]]
}

// ── North arrow ───────────────────────────────────────────────────────────────
const NorthArrow = () => (
  <svg width="52" height="65" viewBox="0 0 52 65" xmlns="http://www.w3.org/2000/svg">
    <circle cx="26" cy="32" r="22" fill="none" stroke="#333" strokeWidth="1.5"/>
    <path d="M26,10 L32,32 L26,28 L20,32 Z" fill="#222"/>
    <path d="M26,54 L32,32 L26,36 L20,32 Z" fill="#fff" stroke="#333" strokeWidth="0.8"/>
    <circle cx="26" cy="32" r="3" fill="#333"/>
    <text x="26" y="8" textAnchor="middle" fontSize="11" fontWeight="900"
      fill="#222" fontFamily="Arial, sans-serif">N</text>
  </svg>
)

// ── Scale bar ─────────────────────────────────────────────────────────────────
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
        const nice = [50,100,200,500,1000,2000,5000,10000,20000,50000]
        const target = mPerPx * 110
        const niceM  = nice.find(v => v >= target * 0.7) ?? nice[nice.length - 1]
        const barPx  = niceM / mPerPx
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
  const label = km < 1 ? `${Math.round(km * 1000)} m` : `${km.toLocaleString('es-AR')} km`
  const halfLabel = km < 1 ? `${Math.round(km * 500)} m` : `${(km / 2).toLocaleString('es-AR')}`

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', userSelect: 'none' }}>
      <div style={{ position: 'relative', height: 18, width: px }}>
        <div style={{ position: 'absolute', left: 0,    top: 4, width: half, height: 8, background: '#333' }}/>
        <div style={{ position: 'absolute', left: half, top: 4, width: half, height: 8, background: '#fff', border: '1px solid #333', borderLeft: 'none' }}/>
        {[0, half, px].map((x, i) => (
          <div key={i} style={{ position: 'absolute', left: x - 0.75, top: 2, width: 1.5, height: 14, background: '#333' }}/>
        ))}
      </div>
      <div style={{ display: 'flex', width: px, justifyContent: 'space-between', fontSize: 9, color: '#333', lineHeight: 1 }}>
        <span>0</span>
        <span style={{ transform: 'translateX(50%)' }}>{halfLabel}</span>
        <span>{label}</span>
      </div>
      <div style={{ fontSize: 8, color: '#555', marginTop: 4, letterSpacing: 0.3 }}>
        Escala: 1:{ratio.toLocaleString('es-AR')}
      </div>
    </div>
  )
}

// ── Editable field ────────────────────────────────────────────────────────────
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

// ── Formats ───────────────────────────────────────────────────────────────────
const fmtP = (n: number) =>
  n >= 1_000_000
    ? `$${(n/1_000_000).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}M`
    : `$${Math.round(n).toLocaleString('es-AR')}`

const fmtL = (m: number) =>
  m >= 1000 ? `${(m/1000).toFixed(2)} km` : `${Math.round(m)} m`

// ── Component ─────────────────────────────────────────────────────────────────
export default function MapComposicionRipio({
  ripios, proyectoNombre, totalTon, totalPres, active,
}: Props) {

  // Editable header fields
  const [fOrganismo, setFOrganismo] = useState('')
  const [fZona,      setFZona]      = useState('')
  const [fObra,      setFObra]      = useState('Enripiado de Calles')
  const [fUbicacion, setFUbicacion] = useState('')
  const [fEjecuta,   setFEjecuta]   = useState('')
  const [fPlazo,     setFPlazo]     = useState('06 MESES')

  // Signature blocks
  const [sigs, setSigs] = useState<SigBlock[]>([
    { nombre: '', cargo: 'Secretario',        cc: '', dni: '' },
    { nombre: '', cargo: 'Presidente',         cc: '', dni: '' },
    { nombre: '', cargo: 'Jefe/Sec. Técnica', cc: '', dni: '' },
    { nombre: '', cargo: 'Jefe Delegación',   cc: '', dni: '' },
  ])
  const updateSig = (i: number, key: keyof SigBlock, val: string) =>
    setSigs(p => p.map((s, j) => j === i ? { ...s, [key]: val } : s))

  // Map refs
  const mapDivRef = useRef<HTMLDivElement>(null)
  const mapRef    = useRef<any>(null)
  const layersRef = useRef<any[]>([])
  const compRef   = useRef<HTMLDivElement>(null)
  const [mapInst, setMapInst] = useState<any>(null)

  // ── Init Leaflet ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return
    import('leaflet').then(L => {
      const Lf = L.default ?? L
      const map = Lf.map(mapDivRef.current!, {
        zoomControl: true, attributionControl: true, scrollWheelZoom: true,
      })
      Lf.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, crossOrigin: 'anonymous',
        attribution: '© OpenStreetMap contributors',
      }).addTo(map)
      mapRef.current = map
      setMapInst(map)
      setTimeout(() => map.invalidateSize(), 150)
      setTimeout(() => map.invalidateSize(), 600)
    })
    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Draw ripios ───────────────────────────────────────────────────────────
  const drawRipios = useCallback((map: any, Lf: any) => {
    layersRef.current.forEach(l => { try { l.remove() } catch { /* ignore */ } })
    layersRef.current = []

    const allLL: any[] = []

    ripios.filter(r => r.coords && r.coords.length >= 2).forEach(r => {
      const coords = r.coords!
      const lls = coords.map(([lat, lng]) => Lf.latLng(lat, lng))
      allLL.push(...lls)

      // Buffer de calzada
      const rings = roadBuffer(coords, r.an / 2)
      if (rings.length > 0) {
        const poly = Lf.polygon(rings as [number,number][][], {
          color: r.color, fillColor: r.color,
          fillOpacity: 0.45, weight: 1.5, opacity: 0.9,
        }).addTo(map)
        layersRef.current.push(poly)
      }

      // Línea central (dashed)
      const line = Lf.polyline(lls, {
        color: r.color, weight: 2.5, opacity: 0.85, dashArray: '7 5',
      }).addTo(map)
      layersRef.current.push(line)

      // Label de nombre en el punto medio
      const midIdx = Math.floor(lls.length / 2)
      const midPt  = lls[midIdx]
      const icon = Lf.divIcon({
        className: '',
        html: `<div style="background:rgba(255,255,255,0.92);padding:2px 6px;border:1px solid ${r.color};border-radius:2px;font-size:10px;font-family:Arial,sans-serif;color:#222;white-space:nowrap;font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,0.2)">${r.nombre}</div>`,
        iconAnchor: [0, 12],
      })
      const mk = Lf.marker(midPt, { icon, interactive: false, zIndexOffset: 1000 }).addTo(map)
      layersRef.current.push(mk)
    })

    if (allLL.length > 0) {
      map.fitBounds(Lf.latLngBounds(allLL), { padding: [60, 60] })
    } else {
      map.setView([-26.8, -60.4], 13)
    }
  }, [ripios])

  useEffect(() => {
    if (!mapRef.current) return
    import('leaflet').then(L => drawRipios(mapRef.current, L.default ?? L))
  }, [ripios, drawRipios])

  // invalidateSize on tab activation
  useEffect(() => {
    if (!active || !mapRef.current) return
    setTimeout(() => mapRef.current?.invalidateSize(), 50)
    setTimeout(() => mapRef.current?.invalidateSize(), 300)
  }, [active])

  // ── Export ────────────────────────────────────────────────────────────────
  const exportPDF = () => window.print()

  const exportPNG = async () => {
    if (!compRef.current) return
    const { default: h2c } = await import('html2canvas')
    await new Promise(r => setTimeout(r, 800))
    const canvas = await h2c(compRef.current, {
      useCORS: true, allowTaint: false, scale: 2,
      width: 794, height: 1123, windowWidth: 794, windowHeight: 1123,
    })
    const link = document.createElement('a')
    link.download = `${fObra.replace(/\s+/g, '_') || 'ripio_composicion'}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const ripiosConCoords = ripios.filter(r => r.coords && r.coords.length >= 2)
  const hasRipios = ripiosConCoords.length > 0
  const totalM = ripios.reduce((s, r) => s + r.l_m, 0)

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>

      {/* Toolbar (no-print) */}
      <div className="no-print" style={{
        display: 'flex', gap: 8, alignItems: 'center', padding: '6px 10px',
        background: '#0a0a0a', border: '1px solid #1a1a1a', flexShrink: 0, marginBottom: 8,
      }}>
        <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#555', flex: 1 }}>
          Composición A4 — {proyectoNombre}
          {ripiosConCoords.length > 0 ? ` · ${ripiosConCoords.length} tramo${ripiosConCoords.length !== 1 ? 's' : ''} · ${fmtL(totalM)}` : ' · sin trazados'}
          {totalTon > 0 ? ` · ${Math.round(totalTon).toLocaleString('es-AR')} t` : ''}
          {' · editable (click en cualquier campo)'}
        </span>
        <button onClick={exportPDF} style={toolBtn}>📄 Guardar PDF</button>
        <button onClick={exportPNG} style={toolBtn}>🖼️ PNG</button>
      </div>

      {/* Scrollable frame */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: '#2a2a2a', padding: '16px 0' }}>

        {/* Hoja A4 */}
        <div ref={compRef} className="print-area" style={{
          width: 794, height: 1123, margin: '0 auto', background: '#fff', color: '#111',
          fontFamily: 'Arial, Helvetica, sans-serif',
          boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
          display: 'flex', flexDirection: 'column',
          padding: '18px 22px 14px', boxSizing: 'border-box', overflow: 'hidden',
        }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'stretch', marginBottom: 6, gap: 14 }}>
            {/* Logo */}
            <div style={{
              width: 72, flexShrink: 0, border: '2px solid #333', borderRadius: 3,
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', background: '#f4f4f4', padding: 4,
            }}>
              <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -1, color: '#222', lineHeight: 1 }}>SIG</div>
              <div style={{ fontSize: 8, fontWeight: 700, color: '#888', letterSpacing: 2 }}>VIAL</div>
              <div style={{ fontSize: 7, color: '#aaa', marginTop: 2 }}>CHACO</div>
            </div>

            {/* Organismo */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Editable value={fOrganismo} onChange={setFOrganismo}
                placeholder="ORGANISMO / DIRECCIÓN"
                bold style={{ fontSize: 13, letterSpacing: 1.2, marginBottom: 3 }} />
              <Editable value={fZona} onChange={setFZona}
                placeholder="ZONA / DELEGACIÓN"
                style={{ fontSize: 11, color: '#555', letterSpacing: 0.5 }} />
            </div>

            {/* Legal */}
            <div style={{
              fontSize: 7.5, color: '#666', textAlign: 'right', lineHeight: 1.6,
              maxWidth: 210, flexShrink: 0, fontStyle: 'italic', alignSelf: 'center',
            }}>
              <div>&quot;DONAR ÓRGANOS ES SALVAR VIDAS&quot; Ley 4422</div>
              <div>{new Date().getFullYear()} — Año del 40° Aniversario del Juicio a las Juntas Militares,</div>
              <div>Ley N° 4153-B</div>
            </div>
          </div>

          <div style={{ borderBottom: '2.5px solid #222', marginBottom: 8 }}/>

          {/* Metadata */}
          <div style={{ marginBottom: 10, fontSize: 12, lineHeight: 1.9 }}>
            {([
              { label: 'OBRA',      val: fObra,      set: setFObra,      ph: 'Enripiado de calles' },
              { label: 'PROYECTO',  val: proyectoNombre, set: () => {},  ph: proyectoNombre, readOnly: true },
              { label: 'UBICACIÓN', val: fUbicacion, set: setFUbicacion, ph: 'Departamento / localidad' },
              { label: 'EJECUTA',   val: fEjecuta,   set: setFEjecuta,   ph: 'Empresa / CONSORCIO N° ...' },
              { label: 'PLAZO',     val: fPlazo,     set: setFPlazo,     ph: '06 MESES' },
            ] as const).map(f => (
              <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <strong style={{ minWidth: 90, flexShrink: 0 }}>{f.label}:</strong>
                {('readOnly' in f && f.readOnly)
                  ? <span style={{ fontSize: 12 }}>{f.val || f.ph}</span>
                  : <Editable value={f.val} onChange={f.set as (v: string) => void} placeholder={f.ph} style={{ fontSize: 12 }} />
                }
              </div>
            ))}
          </div>

          {/* Mapa */}
          <div style={{ border: '2px solid #444', position: 'relative', flex: 1, minHeight: 460 }}>

            {/* Título inset */}
            <div style={{
              position: 'absolute', top: 8,
              left: '50%', transform: 'translateX(-50%)',
              background: '#fff', border: '1.5px solid #555',
              padding: '4px 18px', zIndex: 1000, textAlign: 'center',
              boxShadow: '0 1px 5px rgba(0,0,0,0.25)', pointerEvents: 'none',
              minWidth: 240,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                {fObra || 'Enripiado'} — {proyectoNombre}
              </div>
              <div style={{ fontSize: 9.5, color: '#444' }}>
                {fEjecuta || '—'} · {fmtL(totalM)} total
              </div>
            </div>

            {/* Leaflet */}
            <div ref={mapDivRef} style={{ position: 'absolute', inset: 0 }}/>

            {/* Estado vacío */}
            {!hasRipios && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                zIndex: 500, pointerEvents: 'none',
              }}>
                <div style={{
                  background: 'rgba(255,255,255,0.92)', padding: '10px 20px',
                  borderRadius: 3, fontSize: 12, color: '#999', border: '1px solid #ddd',
                }}>
                  Sin trazados — dibujá ripios en la pestaña Cómputo
                </div>
              </div>
            )}

            {/* Flecha norte */}
            <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 1000, pointerEvents: 'none' }}>
              <NorthArrow />
            </div>

            {/* Barra de escala */}
            <div style={{
              position: 'absolute', bottom: 28, left: 10, zIndex: 1000,
              background: 'rgba(255,255,255,0.9)', padding: '6px 10px',
              border: '1px solid #bbb', pointerEvents: 'none',
            }}>
              <ScaleBar mapInst={mapInst} />
            </div>

            {/* Referencias */}
            <div style={{
              position: 'absolute', bottom: 10, right: 10, zIndex: 1000,
              background: 'rgba(255,255,255,0.95)', border: '1.5px solid #555',
              padding: '8px 14px', minWidth: 180, maxWidth: 220,
            }}>
              <div style={{
                fontSize: 12, fontWeight: 700, textAlign: 'center',
                marginBottom: 8, letterSpacing: 0.5,
                borderBottom: '1px solid #ccc', paddingBottom: 5,
              }}>REFERENCIAS</div>

              {ripiosConCoords.length > 0 && (
                <>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#444', marginBottom: 6 }}>
                    Tramos a enripiar
                  </div>
                  {ripiosConCoords.map(r => (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                      <svg width="30" height="10" style={{ flexShrink: 0 }}>
                        <rect width="30" height="10" rx="1" fill={r.color} opacity="0.5"/>
                        <line x1="0" y1="5" x2="30" y2="5" stroke={r.color} strokeWidth="2" strokeDasharray="5 3"/>
                      </svg>
                      <div>
                        <div style={{ fontSize: 9.5, color: '#222', fontWeight: 600 }}>{r.nombre}</div>
                        <div style={{ fontSize: 8.5, color: '#666' }}>
                          {fmtL(r.l_m)} · {r.an} m ancho
                        </div>
                      </div>
                    </div>
                  ))}
                  <div style={{ borderTop: '1px solid #ddd', marginTop: 6, marginBottom: 6 }}/>
                </>
              )}

              {/* Resumen */}
              {totalTon > 0 && (
                <div style={{ fontSize: 9, color: '#444' }}>
                  <div><strong>Total:</strong> {Math.round(totalTon).toLocaleString('es-AR')} t</div>
                  {totalPres > 0 && <div><strong>Presupuesto:</strong> {fmtP(totalPres)}</div>}
                </div>
              )}

              {ripiosConCoords.length === 0 && (
                <div style={{ fontSize: 9, color: '#ccc' }}>Sin tramos trazados</div>
              )}
            </div>
          </div>

          {/* Firmas */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 12, marginTop: 14, paddingTop: 12, borderTop: '1px solid #ccc',
          }}>
            {sigs.map((s, i) => (
              <div key={i} style={{ textAlign: 'center', fontSize: 10 }}>
                <div style={{ height: 38, borderBottom: '1px solid #333', marginBottom: 4 }}/>
                <input value={s.nombre} placeholder="Nombre Apellido"
                  onChange={e => updateSig(i, 'nombre', e.target.value)}
                  style={sigInp(true)} />
                <input value={s.cargo}
                  onChange={e => updateSig(i, 'cargo', e.target.value)}
                  style={sigInp(false)} />
                <input value={s.cc} placeholder="C°C° n°…"
                  onChange={e => updateSig(i, 'cc', e.target.value)}
                  style={sigInp(false)} />
                <input value={s.dni} placeholder="DNI XX.XXX.XXX"
                  onChange={e => updateSig(i, 'dni', e.target.value)}
                  style={{ ...sigInp(false), fontSize: 9 }} />
              </div>
            ))}
          </div>

        </div>{/* fin hoja */}
      </div>

      {/* Print CSS */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area {
            position: fixed !important;
            top: 0 !important; left: 0 !important;
            width: 210mm !important; height: 297mm !important;
            margin: 0 !important; padding: 5mm 6mm !important;
            box-shadow: none !important; overflow: hidden !important;
            background: white !important; box-sizing: border-box !important;
          }
          .leaflet-container { background: #e0e8f0 !important; }
        }
      `}</style>
    </div>
  )
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const toolBtn: React.CSSProperties = {
  fontFamily: 'monospace', padding: '4px 12px', fontSize: 10, cursor: 'pointer',
  border: '1px solid #333', background: '#111', color: '#aaa', borderRadius: 2,
}

const sigInp = (bold: boolean): React.CSSProperties => ({
  border: 'none', outline: 'none', background: 'transparent', width: '100%',
  textAlign: 'center', fontFamily: 'Arial, sans-serif',
  fontSize: 10, fontWeight: bold ? 700 : 400, color: bold ? '#222' : '#666',
  display: 'block', lineHeight: 1.4,
})
