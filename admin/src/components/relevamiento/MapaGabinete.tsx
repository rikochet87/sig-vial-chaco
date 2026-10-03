'use client'
/**
 * El mapa de la carga de gabinete: se marca un punto, o se dibuja un tramo
 * vértice por vértice.
 *
 * Es lo que reemplaza al GPS del técnico, así que trae lo que sirve para ubicar
 * una obra desde la computadora: **satélite por defecto**, el deslizador de
 * imágenes anteriores —para ver el lugar en otra época, o con menos agua— y la
 * red vial de fondo con la lectura del tramo bajo el cursor.
 *
 * La red de fondo es inerte (ver `lib/redFondo.ts`): el clic llega siempre al
 * dibujo. Qué tramo hay en el punto marcado lo contesta la página con
 * `RedFondo.tramoEn`, no esta capa.
 */
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import { useRedFondo, LecturaTramo } from '@/components/RedFondoLectura'
import { DeslizadorHistorico, useImagenesHistoricas } from '@/components/ImagenesHistoricas'
import { CONTORNO_CHACO } from '@/data/contornoChaco'

export interface Punto { lat: number; lng: number }

const COLOR = '#F5C300'
const mono = { fontFamily: 'monospace' as const }
/** La caja de la provincia, en [lat, lng]: el mapa abre encuadrado ahí y no en medio continente */
const CAJA_CHACO: [[number, number], [number, number]] = [
  [Math.min(...CONTORNO_CHACO.map(p => p[1])), Math.min(...CONTORNO_CHACO.map(p => p[0]))],
  [Math.max(...CONTORNO_CHACO.map(p => p[1])), Math.max(...CONTORNO_CHACO.map(p => p[0]))],
]

/** Metros entre dos puntos, haversine */
export function distanciaM(a: Punto, b: Punto): number {
  const R = 6371000, r = Math.PI / 180
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export default function MapaGabinete({ modo, punto, linea, onPunto, onLinea }: {
  modo: 'punto' | 'linea'
  punto: Punto | null
  linea: Punto[]
  onPunto: (p: Punto) => void
  onLinea: (l: Punto[]) => void
}) {
  const divRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null)
  const [mapaListo, setMapaListo] = useState(false)
  const [satelite, setSatelite] = useState(true)
  const [historico, setHistorico] = useState(false)
  const [redActiva, setRedActiva] = useState(true)

  // Los callbacks y el estado, en refs: el clic del mapa se engancha una vez
  const modoRef = useRef(modo)
  const lineaRef = useRef(linea)
  const onPuntoRef = useRef(onPunto)
  const onLineaRef = useRef(onLinea)
  useEffect(() => {
    modoRef.current = modo; lineaRef.current = linea
    onPuntoRef.current = onPunto; onLineaRef.current = onLinea
  }, [modo, linea, onPunto, onLinea])

  // ── El mapa ──
  useEffect(() => {
    let vivo = true
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let map: any = null
    import('leaflet').then(({ default: L }) => {
      if (!vivo || !divRef.current) return
      // zoomSnap 0,5: con niveles enteros el encuadre salta de "sobra medio continente" a "no entra"
      map = L.map(divRef.current, { zoomSnap: 0.5, zoomControl: true })
      map.fitBounds(CAJA_CHACO, { padding: [12, 12] })
      mapRef.current = map
      map.on('click', (e: { latlng: Punto }) => {
        const p = { lat: e.latlng.lat, lng: e.latlng.lng }
        if (modoRef.current === 'punto') onPuntoRef.current(p)
        else onLineaRef.current([...lineaRef.current, p])
      })
      setMapaListo(true)
    })
    return () => { vivo = false; map?.remove(); mapRef.current = null }
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

  const imagenes = useImagenesHistoricas(mapRef, mapaListo, satelite && historico)
  const tramo = useRedFondo(mapRef, mapaListo, redActiva)

  // ── Lo dibujado ──
  useEffect(() => {
    const map = mapaListo ? mapRef.current : null
    if (!map) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const capas: any[] = []
    let vivo = true
    import('leaflet').then(({ default: L }) => {
      if (!vivo) return
      if (modo === 'punto' && punto) {
        capas.push(L.circleMarker([punto.lat, punto.lng], {
          radius: 8, color: '#111', weight: 2, fillColor: COLOR, fillOpacity: 1, interactive: false,
        }).addTo(map))
      }
      if (modo === 'linea' && linea.length) {
        const ll = linea.map(p => [p.lat, p.lng] as [number, number])
        capas.push(L.polyline(ll, { color: '#111', weight: 6, opacity: 0.6, interactive: false }).addTo(map))
        capas.push(L.polyline(ll, { color: COLOR, weight: 3, interactive: false }).addTo(map))
        ll.forEach((p, i) => capas.push(L.circleMarker(p, {
          radius: i === 0 || i === ll.length - 1 ? 6 : 4, color: '#111', weight: 1.5,
          fillColor: i === 0 ? '#4CAF50' : COLOR, fillOpacity: 1, interactive: false,
        }).addTo(map)))
      }
    })
    return () => { vivo = false; capas.forEach(c => c.remove()) }
  }, [mapaListo, modo, punto, linea])

  return (
    <div style={{ position: 'relative', height: '100%', minHeight: 420, background: '#0e0e0e' }}>
      <div ref={divRef} style={{ position: 'absolute', inset: 0, cursor: 'crosshair' }} />

      {/*
        Sobre el mapa va sólo lo que es del mapa: el mapa base, la red vial y
        las imágenes anteriores. Qué hacer, la medida del tramo y deshacer van
        en el panel, junto con el resto de la carga.
      */}
      <div className="sv-panel" style={{
        ...mono, position: 'absolute', top: 10, right: 10, zIndex: 1000, display: 'flex',
        background: '#0e0e0e', border: '1px solid #222', borderRadius: 2,
      }}>
        {([['Mapa', false], ['Satélite', true]] as const).map(([t, v]) => (
          <button key={t} type="button" onClick={() => { setSatelite(v); if (!v) setHistorico(false) }} style={{
            ...mono, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase', padding: '6px 10px',
            background: satelite === v ? '#F5C30022' : 'transparent', border: 'none',
            color: satelite === v ? COLOR : '#8f8f8f', cursor: 'pointer',
          }}>{t}</button>
        ))}
      </div>

      {/* Abajo a la izquierda: la red vial. El centro del pie es del deslizador */}
      <div style={{ position: 'absolute', left: 10, bottom: 22, zIndex: 1000 }}>
        <LecturaTramo tramo={tramo} activa={redActiva} onActiva={setRedActiva} />
      </div>

      {satelite && (
        <DeslizadorHistorico estado={imagenes} abierto={historico}
          onAbrir={() => setHistorico(true)} onCerrar={() => setHistorico(false)} />
      )}
    </div>
  )
}
