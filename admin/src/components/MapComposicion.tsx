'use client'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import 'leaflet/dist/leaflet.css'

// ── Tipos ─────────────────────────────────────────────────────────────────────
export interface TramoComp {
  id: string
  ruta: string
  color: string
  coords: [number, number][]
  lados: 1 | 2
  ha: number
  haIzq: number
  haDer: number
  desdeIzq: number
  hastaIzq: number
  anchoIzq: number
  desdeDer: number
  hastaDer: number
  anchoDer: number
}

interface Props {
  tramosComp: TramoComp[]
  Sup_ha: number
  haIzq: number
  haDer: number
  apAdoptado: number
  totalPres: number
  color: string
  active: boolean   // triggers invalidateSize when tab becomes visible
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtN = (n: number) => Math.round(n).toLocaleString('es-AR')
const fmtKm = (m: number) => (m / 1000).toFixed(3) + ' km'
const todayStr = () => {
  const d = new Date()
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ── North-arrow SVG ───────────────────────────────────────────────────────────
const NorthArrow = () => (
  <svg width="38" height="52" viewBox="0 0 38 52" fill="none" xmlns="http://www.w3.org/2000/svg"
    style={{ filter: 'drop-shadow(0 1px 3px #000a)' }}>
    {/* needle */}
    <polygon points="19,4 25,32 19,28 13,32" fill="#e74c3c"/>
    <polygon points="19,4 13,32 19,28 25,32" fill="#fff"/>
    <circle cx="19" cy="28" r="3.5" fill="#222" stroke="#555" strokeWidth="1"/>
    {/* N label */}
    <text x="19" y="50" textAnchor="middle" fontSize="13" fontWeight="700"
      fill="#ccc" fontFamily="monospace">N</text>
  </svg>
)

// ── Scale bar (visual) ────────────────────────────────────────────────────────
function ScaleBar({ mapRef }: { mapRef: React.MutableRefObject<any> }) {
  const [label, setLabel] = useState('— m')
  const [width, setWidth] = useState(80)

  useEffect(() => {
    const updateScale = () => {
      const map = mapRef.current
      if (!map) return
      // Target ~100px → find nice round distance
      const p1 = map.containerPointToLatLng([0, 200])
      const p2 = map.containerPointToLatLng([100, 200])
      const rawM = map.distance(p1, p2)
      // Round to nice value
      const nice = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000]
      const target = nice.find(v => v >= rawM * 0.8) ?? nice[nice.length - 1]
      const px = 100 * (target / rawM)
      setWidth(Math.round(px))
      setLabel(target >= 1000 ? `${target / 1000} km` : `${target} m`)
    }
    updateScale()
    const map = mapRef.current
    if (!map) return
    map.on('zoomend moveend', updateScale)
    return () => { map.off('zoomend moveend', updateScale) }
  }, [mapRef])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{
        width, height: 6, borderLeft: '2px solid #ccc', borderRight: '2px solid #ccc',
        borderBottom: '2px solid #ccc', marginBottom: 2,
      }}/>
      <span style={{ fontSize: 9, color: '#ccc', fontFamily: 'monospace',
        textShadow: '0 1px 3px #000', letterSpacing: 0.5 }}>{label}</span>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function MapComposicion({
  tramosComp, Sup_ha, haIzq, haDer, apAdoptado, totalPres, color, active
}: Props) {
  // Editable title block
  const [titulo,     setTitulo]     = useState('Desmalezado de Banquinas')
  const [consorcio,  setConsorcio]  = useState('')
  const [fecha,      setFecha]      = useState(todayStr())
  const [supervisor, setSupervisor] = useState('')

  const mapDivRef   = useRef<HTMLDivElement>(null)
  const mapRef      = useRef<any>(null)
  const layersRef   = useRef<any[]>([])
  const compAreaRef = useRef<HTMLDivElement>(null)

  // ── Leaflet init ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return
    let Lf: any

    import('leaflet').then(L => {
      Lf = L.default ?? L
      const map = Lf.map(mapDivRef.current!, {
        zoomControl: true,
        attributionControl: false,
        scrollWheelZoom: true,
      })
      Lf.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        crossOrigin: 'anonymous',   // needed for canvas export
      }).addTo(map)
      mapRef.current = map
      setTimeout(() => map.invalidateSize(), 150)
      setTimeout(() => map.invalidateSize(), 600)
      drawTramos(map, Lf)
    })

    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Redraw tramos when they change ────────────────────────────────────────
  const drawTramos = useCallback((map: any, Lf: any) => {
    layersRef.current.forEach(l => l.remove())
    layersRef.current = []

    const allLatLngs: any[] = []
    tramosComp.filter(t => t.coords.length >= 2).forEach(t => {
      const lls = t.coords.map(([lat, lng]) => Lf.latLng(lat, lng))
      allLatLngs.push(...lls)
      const pl = Lf.polyline(lls, { color: t.color, weight: 4, opacity: 0.9 }).addTo(map)
      layersRef.current.push(pl)
      // Endpoint markers
      ;[lls[0], lls[lls.length - 1]].forEach((ll, i) => {
        const m = Lf.circleMarker(ll, {
          radius: 5, color: t.color, fillColor: i === 0 ? '#fff' : t.color,
          fillOpacity: 1, weight: 2,
        }).addTo(map)
        layersRef.current.push(m)
      })
    })

    if (allLatLngs.length > 0) {
      const bounds = Lf.latLngBounds(allLatLngs)
      map.fitBounds(bounds, { padding: [40, 40] })
    } else {
      map.setView([-27.45, -60.0], 9)
    }
  }, [tramosComp])

  useEffect(() => {
    if (!mapRef.current) return
    import('leaflet').then(L => {
      const Lf = L.default ?? L
      drawTramos(mapRef.current, Lf)
    })
  }, [tramosComp, drawTramos])

  // ── invalidateSize when tab becomes active ────────────────────────────────
  useEffect(() => {
    if (!active || !mapRef.current) return
    setTimeout(() => mapRef.current?.invalidateSize(), 50)
    setTimeout(() => mapRef.current?.invalidateSize(), 300)
  }, [active])

  // ── Export: PNG ───────────────────────────────────────────────────────────
  const exportPNG = async () => {
    if (!compAreaRef.current) return
    const { default: h2c } = await import('html2canvas')
    const canvas = await h2c(compAreaRef.current, { useCORS: true, allowTaint: false, scale: 2 })
    const link = document.createElement('a')
    link.download = `${titulo.replace(/\s+/g, '_')}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  // ── Export: PDF ───────────────────────────────────────────────────────────
  const exportPDF = async () => {
    if (!compAreaRef.current) return
    const { default: h2c } = await import('html2canvas')
    const { jsPDF } = await import('jspdf')
    const canvas = await h2c(compAreaRef.current, { useCORS: true, allowTaint: false, scale: 2 })
    const img = canvas.toDataURL('image/png')
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const ratio = canvas.width / canvas.height
    let w = pageW - 16, h = w / ratio
    if (h > pageH - 16) { h = pageH - 16; w = h * ratio }
    pdf.addImage(img, 'PNG', (pageW - w) / 2, (pageH - h) / 2, w, h)
    pdf.save(`${titulo.replace(/\s+/g, '_')}.pdf`)
  }

  // ── Export: Print ─────────────────────────────────────────────────────────
  const printComp = () => window.print()

  // ── Styles ────────────────────────────────────────────────────────────────
  const mono: React.CSSProperties = { fontFamily: 'monospace' }
  const inpStyle: React.CSSProperties = {
    background: '#080808', border: '1px solid #1e1e1e', color: '#ddd',
    fontFamily: 'monospace', fontSize: 11, padding: '3px 6px', borderRadius: 2,
    outline: 'none', width: '100%', boxSizing: 'border-box',
  }
  const thStyle: React.CSSProperties = {
    padding: '4px 8px', fontSize: 9, color: '#555', fontFamily: 'monospace',
    textTransform: 'uppercase', letterSpacing: 0.8, textAlign: 'left', fontWeight: 400,
    borderBottom: '1px solid #1a1a1a',
  }
  const tdStyle: React.CSSProperties = {
    padding: '3px 8px', fontSize: 10, fontFamily: 'monospace', color: '#aaa',
  }

  const sColorIzq = '#66bb6a'
  const sColorDer = '#42a5f5'

  const hasTramos = tramosComp.some(t => t.coords.length >= 2)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 8 }}>

      {/* ── Toolbar (no imprime) ── */}
      <div className="no-print" style={{
        display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0,
        padding: '6px 10px', background: '#0a0a0a', borderRadius: 4,
        border: '1px solid #1a1a1a',
      }}>
        <span style={{ ...mono, fontSize: 10, color: '#555', flex: 1 }}>
          Composición cartográfica — {tramosComp.length} tramo{tramosComp.length !== 1 ? 's' : ''} · {Sup_ha.toFixed(4)} ha
        </span>
        <button onClick={printComp}
          style={{ ...mono, padding: '4px 12px', fontSize: 10, cursor: 'pointer',
            border: '1px solid #333', background: '#111', color: '#aaa', borderRadius: 2 }}>
          🖨️ Imprimir
        </button>
        <button onClick={exportPDF}
          style={{ ...mono, padding: '4px 12px', fontSize: 10, cursor: 'pointer',
            border: '1px solid #333', background: '#111', color: '#aaa', borderRadius: 2 }}>
          📄 Exportar PDF
        </button>
        <button onClick={exportPNG}
          style={{ ...mono, padding: '4px 12px', fontSize: 10, cursor: 'pointer',
            border: '1px solid #333', background: '#111', color: '#aaa', borderRadius: 2 }}>
          🖼️ Exportar PNG
        </button>
      </div>

      {/* ── Editable metadata (no imprime, arriba) ── */}
      <div className="no-print" style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 120px 1fr', gap: 6, flexShrink: 0,
      }}>
        {[
          { label: 'Título', val: titulo,     set: setTitulo },
          { label: 'Consorcio', val: consorcio, set: setConsorcio },
          { label: 'Fecha',     val: fecha,    set: setFecha },
          { label: 'Supervisor', val: supervisor, set: setSupervisor },
        ].map(f => (
          <div key={f.label}>
            <div style={{ ...mono, fontSize: 8, color: '#444', letterSpacing: 0.8,
              textTransform: 'uppercase', marginBottom: 3 }}>{f.label}</div>
            <input value={f.val} onChange={e => f.set(e.target.value)} style={inpStyle} />
          </div>
        ))}
      </div>

      {/* ── Área de composición (se imprime) ── */}
      <div ref={compAreaRef} className="print-area" style={{
        flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
        background: '#0e0e0e', border: '1px solid #1e1e1e', borderRadius: 4, overflow: 'hidden',
      }}>

        {/* Header de la composición */}
        <div style={{
          flexShrink: 0, padding: '8px 14px',
          background: '#111', borderBottom: '1px solid #1e1e1e',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        }}>
          <div>
            <div style={{ ...mono, fontSize: 14, fontWeight: 700, color: '#e0e0e0' }}>{titulo || '—'}</div>
            <div style={{ ...mono, fontSize: 10, color: '#555', marginTop: 2 }}>
              {consorcio && <span style={{ marginRight: 16 }}>Consorcio: <span style={{ color: '#888' }}>{consorcio}</span></span>}
              {supervisor && <span style={{ marginRight: 16 }}>Supervisor: <span style={{ color: '#888' }}>{supervisor}</span></span>}
              {fecha && <span>Fecha: <span style={{ color: '#888' }}>{fecha}</span></span>}
            </div>
          </div>
          <div style={{ ...mono, fontSize: 11, color: color, fontWeight: 700, textAlign: 'right' }}>
            <div>{Sup_ha.toFixed(4)} ha</div>
            <div style={{ fontSize: 9, color: '#555', fontWeight: 400 }}>superficie total</div>
          </div>
        </div>

        {/* Mapa + leyenda */}
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          {/* Mapa Leaflet */}
          <div ref={mapDivRef} style={{ width: '100%', height: '100%' }} />

          {/* Sin trazados */}
          {!hasTramos && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'center', pointerEvents: 'none',
            }}>
              <span style={{ ...mono, fontSize: 11, color: '#333' }}>
                Sin trazados — dibujá tramos en la pestaña Cómputo
              </span>
            </div>
          )}

          {/* North arrow — top-right */}
          <div style={{
            position: 'absolute', top: 10, right: 10, zIndex: 1000, pointerEvents: 'none',
          }}>
            <NorthArrow />
          </div>

          {/* Scale bar — bottom-left */}
          <div style={{
            position: 'absolute', bottom: 24, left: 10, zIndex: 1000, pointerEvents: 'none',
          }}>
            <ScaleBar mapRef={mapRef} />
          </div>

          {/* Legend — bottom-right */}
          {tramosComp.length > 0 && (
            <div style={{
              position: 'absolute', bottom: 24, right: 48, zIndex: 1000,
              background: '#000b', borderRadius: 3, padding: '6px 10px',
              border: '1px solid #2a2a2a', maxWidth: 200,
            }}>
              {[...new Map(tramosComp.map(t => [t.ruta, t.color])).entries()].map(([ruta, col]) => (
                <div key={ruta} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <div style={{ width: 22, height: 3, background: col, borderRadius: 1, flexShrink: 0 }} />
                  <span style={{ ...mono, fontSize: 9, color: '#ccc', lineHeight: 1 }}>{ruta}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tabla de cómputo */}
        <div style={{
          flexShrink: 0, borderTop: '1px solid #1a1a1a', overflowX: 'auto',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', ...mono, fontSize: 10 }}>
            <thead>
              <tr style={{ background: '#090909' }}>
                <th style={thStyle}>Ruta</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Prog. Izq (m)</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Long. Izq</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Ancho Izq</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Sup. Izq (ha)</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Prog. Der (m)</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Long. Der</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Ancho Der</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Sup. Der (ha)</th>
                <th style={{ ...thStyle, textAlign: 'right', color: color }}>Total (ha)</th>
              </tr>
            </thead>
            <tbody>
              {tramosComp.map((t, i) => (
                <tr key={t.id} style={{ background: i % 2 === 0 ? '#0a0a0a' : 'transparent', borderBottom: '1px solid #111' }}>
                  <td style={{ ...tdStyle, color: t.color }}>{t.ruta}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: sColorIzq }}>
                    {fmtN(t.desdeIzq)} – {fmtN(t.hastaIzq)}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: sColorIzq }}>
                    {fmtKm(t.hastaIzq - t.desdeIzq)}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: sColorIzq }}>{t.anchoIzq} m</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: sColorIzq }}>{t.haIzq.toFixed(4)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: t.lados === 2 ? sColorDer : '#333' }}>
                    {t.lados === 2 ? `${fmtN(t.desdeDer)} – ${fmtN(t.hastaDer)}` : '—'}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: t.lados === 2 ? sColorDer : '#333' }}>
                    {t.lados === 2 ? fmtKm(t.hastaDer - t.desdeDer) : '—'}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: t.lados === 2 ? sColorDer : '#333' }}>
                    {t.lados === 2 ? `${t.anchoDer} m` : '—'}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: t.lados === 2 ? sColorDer : '#333' }}>
                    {t.lados === 2 ? t.haDer.toFixed(4) : '—'}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', color, fontWeight: 700 }}>
                    {t.ha.toFixed(4)}
                  </td>
                </tr>
              ))}
              {tramosComp.length > 0 && (
                <tr style={{ borderTop: `2px solid ${color}44`, background: '#080808' }}>
                  <td colSpan={4} style={{ ...tdStyle, textAlign: 'right', fontSize: 9, color: '#555' }}>TOTAL GENERAL</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: sColorIzq, fontWeight: 700 }}>{haIzq.toFixed(4)}</td>
                  <td colSpan={3} />
                  <td style={{ ...tdStyle, textAlign: 'right', color: sColorDer, fontWeight: 700 }}>{haDer.toFixed(4)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color, fontWeight: 700, fontSize: 12 }}>{Sup_ha.toFixed(4)}</td>
                </tr>
              )}
              {tramosComp.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ ...tdStyle, textAlign: 'center', color: '#333', padding: '12px' }}>
                    Sin tramos con trazado GPS/mapa
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Print CSS ── */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-area { page-break-inside: avoid; }
          body { background: #fff !important; }
        }
      `}</style>
    </div>
  )
}
