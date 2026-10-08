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
  /** Borde a rayas: para lo que no es agua sino falta de imagen */
  rayas?: boolean
  /**
   * Parte de una sola mancha: todas las capas con esto van en un panel aparte,
   * llenas, y la transparencia es del panel. Así donde se pisan no se oscurece
   * y varias imágenes se leen como un agua sola
   */
  union?: boolean
  /** Un rótulo fijo adentro del polígono más grande de la capa. Es HTML: admite `<br>` y la clase `tt-k` */
  rotulo?: string
}

/** Una línea para ubicarse, con su nombre: no es agua */
export interface ReferenciaDibujo { nombre: string; lineas: [number, number][][] }

export interface LineaDibujo { puntos: [number, number][]; color: string; grosor: number }
export interface PuntoDibujo { lat: number; lng: number; dentro: boolean; titulo: string }

const mono = { fontFamily: 'monospace' as const }
const ACENTO = '#F5C300'
/** La transparencia del panel de las capas `union` */
const OPACIDAD_UNION = 0.6
/** Las líneas de referencia: blanco, como el filo de la caja de lo informado. No es un color de agua */
const C_REFERENCIA = '#f2f2f2'
/**
 * Las defensas: color tierra, como el terraplén que son. No es amarillo —las
 * rutas nacionales lo son en este mapa—, ni blanco como las referencias, ni
 * un color de agua. Trazo lleno y más grueso que una ruta: es lo que separa
 * el río de la ciudad.
 */
const C_DEFENSA = '#c9955a'
/**
 * El corte del área defendida donde no hay defensa (la Av. Soberanía
 * Nacional): gris claro a rayas cortas. No va en color tierra porque no es un
 * terraplén, ni en blanco como las referencias.
 */
const C_CORTE = '#b0b0b0'
/** El valle de inundación del Paraná: el violeta de las cuencas en el mapa de lluvia */
const C_VALLE = '#9C4DCC'

/** Centro de gravedad de un anillo en `[lng, lat]`, y su área en grados² */
function centroDe(an: [number, number][]) {
  let a = 0, x = 0, y = 0
  for (let i = 0, j = an.length - 1; i < an.length; j = i++) {
    const f = an[j][0] * an[i][1] - an[i][0] * an[j][1]
    a += f; x += (an[j][0] + an[i][0]) * f; y += (an[j][1] + an[i][1]) * f
  }
  return a ? { lng: x / (3 * a), lat: y / (3 * a), area: Math.abs(a / 2) } : null
}

export default function MapaInundaciones({ recuadro, urbano, capas, vias, afectadas, obras, referencias, defensas, recorte, corte, valle, leer }: {
  recuadro: Caja
  urbano: Caja
  capas: CapaDibujo[]
  vias: LineaDibujo[]
  /** Los pedazos de camino que caen dentro del escenario */
  afectadas: [number, number][][]
  obras: PuntoDibujo[]
  referencias: ReferenciaDibujo[]
  /** Las defensas contra el río, en `[lng, lat]` */
  defensas: ReferenciaDibujo[]
  /**
   * Contornos `[lng, lat]` donde no se dibuja el agua del río (las capas
   * `union`): el recinto defendido y la franja del terraplén. `null`, sin recorte
   */
  recorte: [number, number][][] | null
  /** La parte del contorno del área defendida que no es defensa, a rayas. `[lng, lat]` */
  corte: { nombre: string; linea: [number, number][] } | null
  /** El valle de inundación del Paraná, como contorno. `null`, apagado */
  valle: { nombre: string; poligonos: [number, number][][][] } | null
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
      for (const [nombre, z] of [['inuBase', 340], ['inuUnion', 355], ['inuAgua', 360], ['inuVias', 400], ['inuAfectadas', 410], ['inuObras', 420]] as const) {
        map.createPane(nombre).style.zIndex = String(z)
        map.getPane(nombre).style.pointerEvents = 'none'
      }
      map.getPane('inuUnion').style.opacity = String(OPACIDAD_UNION)
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
      // Las capas del río comparten un lienzo, para que el recorte del recinto las borre a todas
      const lienzoUnion = L.canvas({ pane: 'inuUnion' })
      for (const c of [...capas].sort((a, b) => a.orden - b.orden)) {
        // GeoJSON viene en [lng, lat] y Leaflet quiere [lat, lng]
        const ll = c.coords.map(pol => pol.map(an => an.map(([x, y]) => [y, x] as [number, number])))
        const pane = c.union ? 'inuUnion' : c.orden < 10 ? 'inuBase' : 'inuAgua', renderer = c.union ? lienzoUnion : L.canvas({ pane })
        // Debajo de un borde a rayas va uno claro y lleno: las rayas oscuras solas se pierden sobre el satélite
        if (c.rayas) dibujadas.push(L.polygon(ll, { pane, renderer, color: '#fff', weight: c.trazo + 2, opacity: 0.75, fill: false, interactive: false, smoothFactor: 1.5 }).addTo(map))
        dibujadas.push(L.polygon(ll, {
          pane, renderer,
          color: c.color, weight: c.trazo, opacity: c.trazo ? 0.9 : 0, stroke: c.trazo > 0, dashArray: c.rayas ? '7 5' : undefined,
          fill: c.relleno > 0, fillColor: c.color, fillOpacity: c.union ? 1 : c.relleno, interactive: false, smoothFactor: 1.5,
        }).addTo(map))
        if (c.rotulo) {
          let mayor: { lng: number; lat: number; area: number } | null = null
          for (const pol of c.coords) { const m = centroDe(pol[0]); if (m && (!mayor || m.area > mayor.area)) mayor = m }
          if (mayor) {
            dibujadas.push(L.tooltip({ permanent: true, direction: 'center', className: 'sv-tt', interactive: false })
              .setLatLng([mayor.lat, mayor.lng]).setContent(c.rotulo).addTo(map))
          }
        }
      }
      // El recorte va último en el lienzo del río y borra lo que quedó debajo.
      // Leaflet redibuja en el orden en que se agregaron las capas, y este
      // efecto las vuelve a agregar todas cuando algo cambia: sigue último.
      if (recorte && capas.some(c => c.union)) {
        const Borrador = L.Polygon.extend({
          _updatePath(this: { _renderer: { _ctx?: CanvasRenderingContext2D; _updatePoly(capa: unknown, cerrado: boolean): void } }) {
            const ctx = this._renderer._ctx
            if (!ctx) return
            ctx.save()
            ctx.globalCompositeOperation = 'destination-out'
            this._renderer._updatePoly(this, true)
            ctx.restore()
          },
        }) as unknown as new (ll: [number, number][], o: import('leaflet').PolylineOptions) => import('leaflet').Polygon
        // Uno por contorno: juntos en un polígono, lo que se pisa saldría hueco
        for (const an of recorte) {
          dibujadas.push(new Borrador(an.map(([x, y]) => [y, x] as [number, number]), {
            pane: 'inuUnion', renderer: lienzoUnion, stroke: false, fill: true, fillColor: '#000', fillOpacity: 1, interactive: false,
          }).addTo(map))
        }
      }
    })
    return () => { vivo = false; dibujadas.forEach(d => d.remove()) }
  }, [mapaListo, capas, recorte])

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
      // El valle de inundación: sólo el contorno, encima del agua y debajo de
      // los caminos. Un relleno taparía el agua, que es lo que se mira adentro
      if (valle) {
        const ll = valle.poligonos.map(pol => pol.map(an => an.map(([x, y]) => [y, x] as [number, number])))
        dibujadas.push(L.polygon(ll, { pane: 'inuVias', renderer: lienzo, color: '#fff', weight: 4, opacity: 0.6, fill: false, interactive: false }).addTo(map))
        dibujadas.push(L.polygon(ll, { pane: 'inuVias', renderer: lienzo, color: C_VALLE, weight: 2, opacity: 1, fill: false, interactive: false }).addTo(map))
      }
      // Doble trazo, como la red de fondo: una línea de un solo color se pierde contra uno de los dos mapas base
      for (const g of porEstilo.values()) {
        dibujadas.push(L.polyline(g.lineas, { pane: 'inuVias', renderer: lienzo, color: '#111', weight: g.grosor + 2, opacity: 0.55, interactive: false }).addTo(map))
        dibujadas.push(L.polyline(g.lineas, { pane: 'inuVias', renderer: lienzo, color: g.color, weight: g.grosor, opacity: 0.95, interactive: false }).addTo(map))
      }
      // Encima de las rutas: donde una corre sobre el terraplén, lo que se tiene que ver es la defensa
      for (const d of defensas) {
        const ll = d.lineas.map(l => l.map(([x, y]) => [y, x] as [number, number]))
        dibujadas.push(L.polyline(ll, { pane: 'inuVias', renderer: lienzo, color: '#111', weight: 8, opacity: 0.8, interactive: false }).addTo(map))
        dibujadas.push(L.polyline(ll, { pane: 'inuVias', renderer: lienzo, color: C_DEFENSA, weight: 4.5, opacity: 1, interactive: false }).addTo(map))
      }
      // Donde el área defendida no tiene defensa: a rayas cortas, no en color tierra
      if (corte) {
        const ll = corte.linea.map(([x, y]) => [y, x] as [number, number])
        dibujadas.push(L.polyline(ll, { pane: 'inuVias', renderer: lienzo, color: '#111', weight: 5, opacity: 0.6, interactive: false }).addTo(map))
        dibujadas.push(L.polyline(ll, { pane: 'inuVias', renderer: lienzo, color: C_CORTE, weight: 2.5, opacity: 1, dashArray: '4 5', interactive: false }).addTo(map))
      }
      if (afectadas.length) {
        dibujadas.push(L.polyline(afectadas, { pane: 'inuAfectadas', renderer: lienzoAf, color: '#fff', weight: 6, opacity: 0.9, interactive: false }).addTo(map))
        dibujadas.push(L.polyline(afectadas, { pane: 'inuAfectadas', renderer: lienzoAf, color: '#E53935', weight: 3.5, opacity: 1, interactive: false }).addTo(map))
      }
      // Las líneas de referencia: a rayas y sin cartel, el nombre va en la leyenda. En [lng, lat] como las manchas
      for (const ref of referencias) {
        const ll = ref.lineas.map(l => l.map(([x, y]) => [y, x] as [number, number]))
        dibujadas.push(L.polyline(ll, { pane: 'inuVias', renderer: lienzo, color: '#111', weight: 6, opacity: 0.85, interactive: false }).addTo(map))
        dibujadas.push(L.polyline(ll, { pane: 'inuVias', renderer: lienzo, color: C_REFERENCIA, weight: 2.5, opacity: 1, dashArray: '9 5', interactive: false }).addTo(map))
      }
      for (const o of obras) {
        dibujadas.push(L.circleMarker([o.lat, o.lng], {
          pane: 'inuObras', radius: o.dentro ? 6 : 4, color: '#111', weight: 1.5,
          fillColor: o.dentro ? '#E53935' : '#e0e0e0', fillOpacity: 1, interactive: false,
        }).addTo(map))
      }
    })
    return () => { vivo = false; dibujadas.forEach(d => d.remove()) }
  }, [mapaListo, vias, afectadas, obras, referencias, defensas, corte, valle])

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
        {[...capas].sort((a, b) => b.orden - a.orden).filter((c, i, t) => t.findIndex(x => x.titulo === c.titulo) === i).map(c => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            {c.relleno > 0 ? (
              <span style={{
                width: 14, height: 10, flexShrink: 0, background: c.color,
                opacity: c.union ? 1 : Math.min(1, c.relleno + 0.35), border: c.trazo ? `1px ${c.rayas ? 'dashed' : 'solid'} ${c.color}` : 'none',
              }} />
            ) : (
              <span style={{ width: 14, height: 10, flexShrink: 0, boxSizing: 'border-box', border: `1px dashed #c8c8c8` }} />
            )}
            <span>{c.titulo}</span>
          </div>
        ))}
        {afectadas.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 14, height: 3, flexShrink: 0, background: '#E53935' }} />
            <span>Camino dentro del agua</span>
          </div>
        )}
        {defensas.map(d => (
          <div key={d.nombre} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 14, height: 4, flexShrink: 0, background: C_DEFENSA, outline: '1px solid #111' }} />
            <span>{d.nombre}</span>
          </div>
        ))}
        {corte && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 14, height: 0, flexShrink: 0, borderTop: `2px dashed ${C_CORTE}` }} />
            <span>{corte.nombre}: sin defensa</span>
          </div>
        )}
        {valle && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 14, height: 10, flexShrink: 0, boxSizing: 'border-box', border: `2px solid ${C_VALLE}` }} />
            <span>{valle.nombre}</span>
          </div>
        )}
        {referencias.map(ref => (
          <div key={ref.nombre} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 14, height: 0, flexShrink: 0, borderTop: `2px dashed ${C_REFERENCIA}` }} />
            <span>{ref.nombre}, la traza</span>
          </div>
        ))}
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
            : <span style={{ color: '#8f8f8f' }}>sin agua a esta altura</span>}
        </div>
      )}
    </div>
  )
}
