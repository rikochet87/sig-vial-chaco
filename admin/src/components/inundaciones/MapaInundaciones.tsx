'use client'
/**
 * El mapa de la pestaña «Gran Resistencia»: las manchas de agua del escenario
 * elegido, lo construido, las rutas y las obras relevadas.
 *
 * Todo lo dibujado es inerte (`interactive: false`): son cientos de polígonos
 * con miles de vértices, y recibiendo eventos traban el mapa. Qué hay bajo el
 * cursor se contesta por afuera de Leaflet, con el mismo índice que cruza los
 * caminos —igual que la lectura del tramo en el mapa de lluvia—.
 *
 * Las manchas van en lienzo (`L.canvas`) y no en SVG: una sola de Sentinel-2
 * son 270 polígonos y más de cien mil vértices.
 */
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import type { Caja, MultiPoligono } from '@/lib/inundaciones'

export interface CapaDibujo {
  id: string
  titulo: string
  coords: MultiPoligono
  color: string
  /** Opacidad del relleno, 0 a 1 */
  relleno: number
  /** Grosor del borde; 0 = sin borde */
  trazo: number
  /** Más alto = más arriba */
  orden: number
}

export interface LineaDibujo { puntos: [number, number][]; color: string; grosor: number }
export interface PuntoDibujo { lat: number; lng: number; dentro: boolean; titulo: string }

const mono = { fontFamily: 'monospace' as const }
const ACENTO = '#F5C300'

export default function MapaInundaciones({ recuadro, urbano, capas, vias, afectadas, obras, leer }: {
  recuadro: Caja
  urbano: Caja
  capas: CapaDibujo[]
  vias: LineaDibujo[]
  /** Los pedazos de camino que caen dentro del escenario */
  afectadas: [number, number][][]
  obras: PuntoDibujo[]
  /** Qué capas del escenario hay en un punto. Lo contesta el panel */
  leer: (lat: number, lng: number) => string[]
}) {
  const divRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null)
  const [mapaListo, setMapaListo] = useState(false)
  const [satelite, setSatelite] = useState(false)
  const [lectura, setLectura] = useState<{ lat: number; lng: number; capas: string[] } | null>(null)
  const leerRef = useRef(leer)
  useEffect(() => { leerRef.current = leer }, [leer])

  // ── El mapa ──
  useEffect(() => {
    let vivo = true
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let map: any = null
    let cuadro = 0
    import('leaflet').then(({ default: L }) => {
      if (!vivo || !divRef.current) return
      map = L.map(divRef.current, { zoomSnap: 0.5, zoomControl: true, preferCanvas: true })
      // Abre sobre el recuadro urbano con aire alrededor: el valle del Paraná
      // tiene que verse, pero la ciudad es lo que se vino a mirar
      map.fitBounds([[urbano.sur - 0.04, urbano.oeste - 0.03], [urbano.norte + 0.04, recuadro.este]], { padding: [10, 10] })
      // Un panel por nivel, para que el orden no dependa de cuándo llegó cada capa
      for (const [nombre, z] of [['inuBase', 340], ['inuAgua', 360], ['inuVias', 400], ['inuAfectadas', 410], ['inuObras', 420]] as const) {
        map.createPane(nombre).style.zIndex = String(z)
        map.getPane(nombre).style.pointerEvents = 'none'
      }
      L.rectangle([[recuadro.sur, recuadro.oeste], [recuadro.norte, recuadro.este]],
        { color: '#8f8f8f', weight: 1, dashArray: '6 5', fill: false, interactive: false, pane: 'inuVias' }).addTo(map)
      mapRef.current = map
      // La lectura bajo el cursor, a lo sumo una vez por cuadro de pantalla
      map.on('mousemove', (e: { latlng: { lat: number; lng: number } }) => {
        if (cuadro) return
        cuadro = requestAnimationFrame(() => {
          cuadro = 0
          const { lat, lng } = e.latlng
          setLectura({ lat, lng, capas: leerRef.current(lat, lng) })
        })
      })
      map.on('mouseout', () => setLectura(null))
      setMapaListo(true)
    })
    return () => { vivo = false; if (cuadro) cancelAnimationFrame(cuadro); map?.remove(); mapRef.current = null }
    // El recuadro no cambia después de cargar el índice: el mapa se arma una vez
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Mapa base ──
  useEffect(() => {
    const map = mapaListo ? mapRef.current : null
    if (!map) return
    let capa: import('leaflet').TileLayer | null = null
    import('leaflet').then(({ default: L }) => {
      capa = satelite
        ? L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', { subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], maxZoom: 21, zIndex: 1 })
        : L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, zIndex: 1, attribution: '© OpenStreetMap' })
      capa.addTo(map)
    })
    return () => { capa?.remove() }
  }, [mapaListo, satelite])

  // ── Las manchas ──
  useEffect(() => {
    const map = mapaListo ? mapRef.current : null
    if (!map) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dibujadas: any[] = []
    let vivo = true
    import('leaflet').then(({ default: L }) => {
      if (!vivo) return
      for (const c of [...capas].sort((a, b) => a.orden - b.orden)) {
        // GeoJSON viene en [lng, lat] y Leaflet quiere [lat, lng]
        const ll = c.coords.map(pol => pol.map(an => an.map(([x, y]) => [y, x] as [number, number])))
        dibujadas.push(L.polygon(ll, {
          pane: c.orden < 10 ? 'inuBase' : 'inuAgua', renderer: L.canvas({ pane: c.orden < 10 ? 'inuBase' : 'inuAgua' }),
          color: c.color, weight: c.trazo, opacity: c.trazo ? 0.9 : 0, stroke: c.trazo > 0,
          fillColor: c.color, fillOpacity: c.relleno, interactive: false, smoothFactor: 1.5,
        }).addTo(map))
      }
    })
    return () => { vivo = false; dibujadas.forEach(d => d.remove()) }
  }, [mapaListo, capas])

  // ── Caminos, pedazos afectados y obras ──
  useEffect(() => {
    const map = mapaListo ? mapRef.current : null
    if (!map) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dibujadas: any[] = []
    let vivo = true
    import('leaflet').then(({ default: L }) => {
      if (!vivo) return
      const lienzo = L.canvas({ pane: 'inuVias' }), lienzoAf = L.canvas({ pane: 'inuAfectadas' })
      // Una polilínea múltiple por color, no una por pedazo: con la mancha de
      // 1983 un tercio de la red queda adentro, en cientos de pedazos.
      const porEstilo = new Map<string, { color: string; grosor: number; lineas: [number, number][][] }>()
      for (const v of vias) {
        const k = `${v.color}|${v.grosor}`
        const g = porEstilo.get(k) ?? { color: v.color, grosor: v.grosor, lineas: [] }
        g.lineas.push(v.puntos)
        porEstilo.set(k, g)
      }
      // Doble trazo, como la red de fondo: una línea de un solo color se pierde contra uno de los dos mapas base
      for (const g of porEstilo.values()) {
        dibujadas.push(L.polyline(g.lineas, { pane: 'inuVias', renderer: lienzo, color: '#111', weight: g.grosor + 2, opacity: 0.55, interactive: false }).addTo(map))
        dibujadas.push(L.polyline(g.lineas, { pane: 'inuVias', renderer: lienzo, color: g.color, weight: g.grosor, opacity: 0.95, interactive: false }).addTo(map))
      }
      if (afectadas.length) {
        dibujadas.push(L.polyline(afectadas, { pane: 'inuAfectadas', renderer: lienzoAf, color: '#fff', weight: 6, opacity: 0.9, interactive: false }).addTo(map))
        dibujadas.push(L.polyline(afectadas, { pane: 'inuAfectadas', renderer: lienzoAf, color: '#E53935', weight: 3.5, opacity: 1, interactive: false }).addTo(map))
      }
      for (const o of obras) {
        dibujadas.push(L.circleMarker([o.lat, o.lng], {
          pane: 'inuObras', radius: o.dentro ? 6 : 4, color: '#111', weight: 1.5,
          fillColor: o.dentro ? '#E53935' : '#e0e0e0', fillOpacity: 1, interactive: false,
        }).addTo(map))
      }
    })
    return () => { vivo = false; dibujadas.forEach(d => d.remove()) }
  }, [mapaListo, vias, afectadas, obras])

  return (
    <div style={{ position: 'relative', height: '100%', minHeight: 360, background: '#0e0e0e' }}>
      <div ref={divRef} style={{ position: 'absolute', inset: 0 }} />

      <div className="sv-panel" style={{
        ...mono, position: 'absolute', top: 10, right: 10, zIndex: 1000, display: 'flex',
        background: '#0e0e0e', border: '1px solid #222', borderRadius: 2,
      }}>
        {([['Mapa', false], ['Satélite', true]] as const).map(([t, v]) => (
          <button key={t} type="button" onClick={() => setSatelite(v)} style={{
            ...mono, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase', padding: '6px 10px',
            background: satelite === v ? '#F5C30022' : 'transparent', border: 'none',
            color: satelite === v ? ACENTO : '#8f8f8f', cursor: 'pointer',
          }}>{t}</button>
        ))}
      </div>

      {/* Leyenda: sólo lo que está dibujado */}
      <div className="sv-panel" style={{
        ...mono, position: 'absolute', left: 10, top: 10, zIndex: 1000, maxWidth: 270,
        background: 'rgba(14,14,14,.94)', border: '1px solid #222', borderLeft: `3px solid ${ACENTO}`,
        borderRadius: 2, padding: '7px 10px', fontSize: 11, color: '#c8c8c8', lineHeight: 1.7,
      }}>
        {[...capas].sort((a, b) => b.orden - a.orden).map(c => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{
              width: 14, height: 10, flexShrink: 0, background: c.color,
              opacity: Math.min(1, c.relleno + 0.35), border: c.trazo ? `1px solid ${c.color}` : 'none',
            }} />
            <span>{c.titulo}</span>
          </div>
        ))}
        {afectadas.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 14, height: 3, flexShrink: 0, background: '#E53935' }} />
            <span>Camino dentro de la mancha</span>
          </div>
        )}
        {capas.length === 0 && <span style={{ color: '#8f8f8f' }}>Cargando capas…</span>}
      </div>

      {/* Lectura bajo el cursor */}
      {lectura && (
        <div className="sv-panel" style={{
          ...mono, position: 'absolute', left: 10, bottom: 22, zIndex: 1000, maxWidth: 360,
          background: 'rgba(14,14,14,.94)', border: '1px solid #222', borderRadius: 2,
          padding: '6px 10px', fontSize: 11, color: '#c8c8c8', lineHeight: 1.6,
        }}>
          <span style={{ color: '#8f8f8f', textTransform: 'uppercase', letterSpacing: 0.8 }}>
            {lectura.lat.toFixed(4).replace('.', ',')} · {lectura.lng.toFixed(4).replace('.', ',')}
          </span>
          <br />
          {lectura.capas.length
            ? lectura.capas.map(t => <div key={t} style={{ color: '#e0e0e0' }}>{t}</div>)
            : <span style={{ color: '#8f8f8f' }}>fuera de las manchas del escenario</span>}
        </div>
      )}
    </div>
  )
}
