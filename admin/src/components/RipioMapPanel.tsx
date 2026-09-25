'use client'
import 'leaflet/dist/leaflet.css'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRedFondo, LecturaTramo } from '@/components/RedFondoLectura'
import { PANE_RED_FONDO, asegurarPanelFondo } from '@/lib/redFondo'

// ── Tipos ─────────────────────────────────────────────────────────────────────
export type LatLng = [number, number]

export interface RipioTramo {
  id: string
  nombre: string
  an: number
  e: number
  rho: number
  l_m: number
  coords: LatLng[] | null
  empresa: string
  fecha_ejecucion: string | null
  precio_unitario: number
  orden: number
  color: string | null   // color personalizado; null = usar paleta automática
}

interface Props {
  ripios:          RipioTramo[]
  selectedId:      string | null
  drawingId:       string | null          // ripio en modo dibujo activo
  /** Ripio en modo edición de vértices (excluyente con drawingId) */
  editingId?:      string | null
  color:           string
  onLineDraw:      (id: string, lengthM: number, coords: LatLng[]) => void
  onDrawEnd:       () => void
  /** Se llama al soltar un vértice, insertar o eliminar: guarda y recalcula */
  onLineEdit?:     (id: string, lengthM: number, coords: LatLng[]) => void
  /** Parte el tramo en dos: el original queda con `a`, y se crea uno nuevo con `b` */
  onLineSplit?:    (id: string,
                    a: { lengthM: number; coords: LatLng[] },
                    b: { lengthM: number; coords: LatLng[] }) => void
  onEditEnd?:      () => void
  onSelectRipio?:  (id: string) => void   // seleccionar ripio al clicar en el mapa
  onDeleteRipio?:  (id: string) => void   // eliminar ripio desde el mapa
  /**
   * Encuadra el mapa sobre estas coordenadas.
   *
   * Lleva `token` porque el mismo encuadre puede pedirse dos veces seguidas
   * —"llevame a este tramo", mover el mapa, "llevame de nuevo"— y comparando
   * sólo las coordenadas el segundo pedido no haría nada.
   */
  fitTo?:          { coords: LatLng[]; token: number } | null
}

// ── Geometría ──────────────────────────────────────────────────────────────────
function segLen(a: LatLng, b: LatLng): number {
  const R = 6371000, DEG = Math.PI / 180
  const dLat = (b[0]-a[0])*DEG, dLng = (b[1]-a[1])*DEG
  const sh = Math.sin(dLat/2), sw = Math.sin(dLng/2)
  return 2*R*Math.asin(Math.sqrt(sh*sh + Math.cos(a[0]*DEG)*Math.cos(b[0]*DEG)*sw*sw))
}
function totalLen(pts: LatLng[]): number {
  let d = 0; for (let i = 1; i < pts.length; i++) d += segLen(pts[i-1], pts[i]); return d
}

function roadBuffer(latLngs: LatLng[], halfWidth: number): LatLng[][] {
  if (latLngs.length < 2 || halfWidth <= 0) return []
  const DEG = Math.PI / 180, R = 6371000
  const lat0 = latLngs[0][0], lng0 = latLngs[0][1]
  const cosLat = Math.cos(lat0 * DEG)

  let raw = latLngs.map(([lat, lng]) => ({
    x: (lng - lng0) * cosLat * R * DEG,
    y: (lat - lat0) * R * DEG,
  }))

  // Detectar bucle cerrado: primer y último punto dentro de 2 m
  const d01 = Math.hypot(raw[0].x - raw[raw.length-1].x, raw[0].y - raw[raw.length-1].y)
  const isClosed = d01 < 2
  if (isClosed && raw.length > 2) raw = raw.slice(0, -1)
  const n = raw.length

  // Tangentes unitarias (segCount = n para cerrado, n-1 para abierto)
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
      mx = -T[0].y * halfWidth
      my =  T[0].x * halfWidth
    } else if (isLast) {
      mx = -T[T.length-1].y * halfWidth
      my =  T[T.length-1].x * halfWidth
    } else {
      // Punto interior o cualquier punto en loop cerrado: miter join
      const t1 = T[(i - 1 + T.length) % T.length]
      const t2 = T[i % T.length]
      const cross = t1.x * t2.y - t1.y * t2.x

      if (Math.abs(cross) < 0.05) {
        const nx = -(t1.y + t2.y), ny = (t1.x + t2.x)
        const nlen = Math.sqrt(nx*nx + ny*ny) || 1
        mx = (nx/nlen) * halfWidth
        my = (ny/nlen) * halfWidth
      } else {
        const mxRaw = halfWidth * (t2.x - t1.x) / cross
        const myRaw = halfWidth * (t2.y - t1.y) / cross
        const mlen  = Math.sqrt(mxRaw*mxRaw + myRaw*myRaw)
        if (mlen <= MAX_MITER) {
          mx = mxRaw; my = myRaw
        } else {
          const nx = -(t1.y + t2.y), ny = (t1.x + t2.x)
          const nlen = Math.sqrt(nx*nx + ny*ny) || 1
          mx = (nx/nlen) * halfWidth
          my = (ny/nlen) * halfWidth
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

  if (isClosed) {
    // Donut: anillo exterior + interior → Leaflet rellena solo el grosor de la calle
    return [left.map(toLL), right.map(toLL)]
  }
  return [[...left.map(toLL), ...right.reverse().map(toLL)]]
}

import { PALETTE } from '@/lib/ripioPalette'

function ripioColor(orden: number): string {
  return PALETTE[orden % PALETTE.length]
}

// ── Componente ────────────────────────────────────────────────────────────────
export default function RipioMapPanel({
  ripios, selectedId, drawingId, editingId, color, onLineDraw, onDrawEnd,
  onLineEdit, onLineSplit, onEditEnd, onSelectRipio, onDeleteRipio, fitTo,
}: Props) {
  const mapDivRef  = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef     = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LfRef      = useRef<any>(null)

  /**
   * Red vial de fondo.
   *
   * Va en su propio panel por debajo del dibujo y no recibe eventos: el clic
   * para marcar un vértice tiene que llegar siempre al dibujo, aunque caiga
   * justo encima de un camino. Los datos del tramo salen del recuadro de
   * lectura, que resuelve el hit-test por afuera de Leaflet.
   */
  const [verRedFondo, setVerRedFondo] = useState(true)
  const [mapReady, setMapReady] = useState(false)
  const tramoFondo = useRedFondo(mapReady ? mapRef.current : null, verRedFondo)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ripioLayersRef = useRef<Map<string, any[]>>(new Map())
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const drawStateRef   = useRef<{ pts: LatLng[]; cleanup: () => void } | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const previewLayersRef = useRef<any[]>([])
  const ripiosRef        = useRef(ripios)
  const drawingIdRef     = useRef(drawingId)
  const colorRef         = useRef(color)
  const onSelectRipioRef = useRef(onSelectRipio)
  const onDeleteRipioRef = useRef(onDeleteRipio)
  useEffect(() => { ripiosRef.current = ripios }, [ripios])
  useEffect(() => { drawingIdRef.current = drawingId }, [drawingId])
  useEffect(() => { colorRef.current = color }, [color])
  useEffect(() => { onSelectRipioRef.current = onSelectRipio }, [onSelectRipio])
  useEffect(() => { onDeleteRipioRef.current = onDeleteRipio }, [onDeleteRipio])

  // ── Edición de vértices ───────────────────────────────────────────────────
  const editingIdRef  = useRef(editingId)
  const onLineEditRef = useRef(onLineEdit)
  useEffect(() => { editingIdRef.current = editingId }, [editingId])
  useEffect(() => { onLineEditRef.current = onLineEdit }, [onLineEdit])
  const onLineSplitRef = useRef(onLineSplit)
  useEffect(() => { onLineSplitRef.current = onLineSplit }, [onLineSplit])

  const editStateRef = useRef<{
    cleanup: () => void
    extender: (d: 'inicio'|'fin'|null) => void
    deshacer: () => void
    rehacer: () => void
    eliminarVertice: () => void
    separar: () => void
    recortar: (lado: 'inicio' | 'fin') => void
    deseleccionar: () => void
  } | null>(null)

  /** Vértice seleccionado y las longitudes que quedarían al cortar ahí */
  const [verticeSel, setVerticeSel] = useState<{
    idx: number; total: number; largoInicio: number; largoFin: number
  } | null>(null)
  /** Longitud en vivo mientras se arrastra, para la barra flotante */
  const [editLen, setEditLen] = useState(0)
  const [editPts, setEditPts] = useState(0)
  const [extendiendo, setExtendiendo] = useState<'inicio' | 'fin' | null>(null)
  const [puedeDeshacer, setPuedeDeshacer] = useState(false)
  const [puedeRehacer,  setPuedeRehacer]  = useState(false)

  // ── Inicializar mapa ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return
    let mounted = true
    import('leaflet').then(Lf => {
      if (!mounted || !mapDivRef.current || mapRef.current) return
      LfRef.current = Lf
      const savedC = sessionStorage.getItem('ripio_mapCenter')
      const savedZ = sessionStorage.getItem('ripio_mapZoom')
      const center: [number,number] = savedC ? JSON.parse(savedC) : [-26.5, -60.5]
      const zoom = savedZ ? parseInt(savedZ) : 8

      const map = Lf.map(mapDivRef.current, {
        center, zoom, zoomControl: false, doubleClickZoom: false,
      })
      mapRef.current = map
      // El panel de la red de fondo se crea **acá**, no donde se dibuja.
      //
      // Las capas CC del panel de capas también lo usan, y `RedFondo.montar()`
      // —que era el único que lo creaba— es asíncrono: espera un archivo de
      // 8,6 MB. Prender una capa CC antes de que esa descarga termine dejaba a
      // Leaflet buscando un panel inexistente, y el try/catch de la carga se
      // tragaba la excepción: la capa no aparecía y no se decía por qué.
      asegurarPanelFondo(map)

      // Capas base
      const satellite = Lf.tileLayer('https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        subdomains: ['0','1','2','3'], maxZoom: 21, maxNativeZoom: 20, attribution: '© Google',
      })
      const osm = Lf.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '© OpenStreetMap',
      })
      const hybrid = Lf.tileLayer('https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        subdomains: ['0','1','2','3'], maxZoom: 21, maxNativeZoom: 20, attribution: '© Google',
      })

      satellite.addTo(map)

      Lf.control.layers(
        { 'Satélite': satellite, 'Satélite + etiquetas': hybrid, 'OpenStreetMap': osm },
        {},
        { position: 'topright', collapsed: true }
      ).addTo(map)

      Lf.control.zoom({ position: 'bottomright' }).addTo(map)
      map.on('moveend', () => {
        const c = map.getCenter()
        sessionStorage.setItem('ripio_mapCenter', JSON.stringify([c.lat, c.lng]))
        sessionStorage.setItem('ripio_mapZoom', String(map.getZoom()))
      })
      setMapReady(true)
    })
    return () => {
      mounted = false
      drawStateRef.current?.cleanup()
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
      LfRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ResizeObserver → invalidateSize
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

  // ── Encuadre del mapa ─────────────────────────────────────────────────────
  /**
   * El mapa arrancaba siempre en una vista general de la provincia, así que
   * al abrir la pestaña —o al venir a editar una obra— había que buscar el
   * trazado a mano.
   *
   *  · `fitTo` con contenido → encuadra ahí (viene de editar una obra)
   *  · sin `fitTo`           → encuadra sobre todos los ripios, UNA sola vez
   *
   * El encuadre automático corre una sola vez a propósito: si se repitiera con
   * cada cambio, el mapa saltaría solo mientras se dibuja o se mueve un vértice.
   */
  const yaEncuadro = useRef(false)
  const fitKey = fitTo && fitTo.coords.length > 0 ? String(fitTo.token) : ''

  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current, Lf = LfRef.current
    if (!map || !Lf) return

    const objetivo: LatLng[] = fitKey
      ? fitTo!.coords
      : (!yaEncuadro.current
          ? ripios.flatMap(r => r.coords ?? [])
          : [])

    if (objetivo.length === 0) return

    try {
      const bounds = Lf.latLngBounds(objetivo as [number, number][])
      if (!bounds.isValid()) return
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16, animate: false })
      yaEncuadro.current = true
    } catch (_) { /* coordenadas inválidas: se deja la vista como está */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, ripios, mapReady])

  // ── Renderizar capas de ripios (coordenadas) ──────────────────────────────
  useEffect(() => {
    const map = mapRef.current, Lf = LfRef.current
    if (!map || !Lf || !mapReady) return

    // Quitar capas viejas
    ripioLayersRef.current.forEach(layers => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      layers.forEach((l: any) => map.removeLayer(l))
    })
    ripioLayersRef.current.clear()

    ripios.forEach((r) => {
      if (!r.coords || r.coords.length < 2) return
      // El que se está editando lo dibuja el modo edición con sus propias capas;
      // pintarlo acá además duplicaría la línea y el buffer.
      if (r.id === editingIdRef.current) return
      const clr = r.color ?? ripioColor(r.orden)
      const hw  = r.an / 2
      const layers = []

      // Click en mapa: seleccionar ripio + popup con opción eliminar
      const fmtL = (m: number) => m >= 1000 ? `${(m/1000).toFixed(2)} km` : `${Math.round(m)} m`

      const openRipioPopup = (latlng: any) => {
        if (drawingIdRef.current) return  // ignorar en modo dibujo
        onSelectRipioRef.current?.(r.id)

        const wrap = document.createElement('div')
        wrap.style.cssText = 'font-family:monospace;min-width:130px'

        const title = document.createElement('div')
        title.style.cssText = `color:${clr};font-weight:700;font-size:12px;margin-bottom:3px`
        title.textContent = r.nombre

        const info = document.createElement('div')
        info.style.cssText = 'color:#888;font-size:11px;margin-bottom:8px'
        info.textContent = `${fmtL(r.l_m)} · ${r.an}m ancho`

        const btn = document.createElement('button')
        btn.textContent = '✕ Eliminar ripio'
        btn.style.cssText = 'font-family:monospace;font-size:11px;cursor:pointer;background:#1a0000;border:1px solid #550000;color:#ff6666;padding:4px 8px;width:100%'
        btn.addEventListener('click', () => { map.closePopup(); onDeleteRipioRef.current?.(r.id) })

        wrap.appendChild(title); wrap.appendChild(info); wrap.appendChild(btn)
        Lf.popup({ closeButton: true, className: 'ripio-ctx-popup' })
          .setContent(wrap).setLatLng(latlng).openOn(map)
      }

      // Buffer de calzada
      const rings = roadBuffer(r.coords, hw)
      if (rings.length > 0) {
        const poly = Lf.polygon(rings as [number,number][][], {
          color: clr, fillColor: clr,
          fillOpacity: r.id === selectedId ? 0.45 : 0.25,
          weight: r.id === selectedId ? 2 : 1, opacity: 0.9,
        }).addTo(map)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        poly.on('click', (e: any) => { Lf.DomEvent.stopPropagation(e); openRipioPopup(e.latlng) })
        layers.push(poly)
      }

      // Línea central
      const line = Lf.polyline(r.coords as [number,number][], {
        color: clr, weight: r.id === selectedId ? 4 : 2.5,
        opacity: r.id === selectedId ? 1 : 0.75, dashArray: '8 4',
      }).addTo(map)

      line.bindTooltip(
        `<div style="font-family:monospace;font-size:11px">` +
        `<span style="color:${clr};font-weight:700">${r.nombre}</span>` +
        `<br><span style="color:#aaa">${fmtL(r.l_m)} · ${r.an}m ancho</span>` +
        `</div>`,
        { sticky: true, direction: 'top' }
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      line.on('click', (e: any) => { Lf.DomEvent.stopPropagation(e); openRipioPopup(e.latlng) })
      layers.push(line)
      ripioLayersRef.current.set(r.id, layers)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ripios, selectedId, mapReady, editingId])

  // ── Modo dibujo ───────────────────────────────────────────────────────────
  const startDraw = useCallback((ripioId: string) => {
    const map = mapRef.current, Lf = LfRef.current
    if (!map || !Lf) return

    // Limpiar preview anterior
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    previewLayersRef.current.forEach((l: any) => map.removeLayer(l))
    previewLayersRef.current = []
    drawStateRef.current?.cleanup()

    const ripio = ripiosRef.current.find(r => r.id === ripioId)
    const clr = ripio ? (ripio.color ?? ripioColor(ripio.orden)) : colorRef.current
    const hw  = ripio ? ripio.an / 2 : 3

    map.getContainer().style.cursor = 'crosshair'
    const pts: LatLng[] = []
    const committedLine = Lf.polyline([], { color: clr, weight: 3, opacity: 0.95 }).addTo(map)
    const previewSeg    = Lf.polyline([], { color: clr, weight: 2, dashArray: '8 5', opacity: 0.5 }).addTo(map)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vmList: any[] = []

    const cleanup = () => {
      map.off('click',       onLineClick)
      map.off('mousemove',   onLineMove)
      map.off('contextmenu', onLineRight)
      map.removeLayer(committedLine)
      map.removeLayer(previewSeg)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vmList.forEach((m: any) => map.removeLayer(m)); vmList.length = 0
      map.getContainer().style.cursor = ''
      drawStateRef.current = null
    }

    const SNAP_PX = 20  // píxeles de pantalla para snap magnético al primer punto

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onLineClick = (e: any) => {
      // Snap magnético: si hay ≥3 puntos y el click es cerca del primero, cerrar el loop
      if (pts.length >= 3) {
        const startPx = map.latLngToContainerPoint(pts[0] as [number,number])
        const curPx   = map.latLngToContainerPoint(e.latlng)
        if (Math.hypot(startPx.x - curPx.x, startPx.y - curPx.y) < SNAP_PX) {
          pts.push([pts[0][0], pts[0][1]])  // cierra el loop con coord exacta del primer punto
          onLineRight(null)
          return
        }
      }
      const ll: LatLng = [e.latlng.lat, e.latlng.lng]
      pts.push(ll)
      const isFirst = pts.length === 1
      const vm = Lf.circleMarker(ll as [number,number], {
        radius: isFirst ? 6 : 4, color: clr,
        fillColor: isFirst ? '#fff' : clr,
        fillOpacity: isFirst ? 0.9 : 0.85,
        weight: isFirst ? 2 : 1.5, opacity: 1,
      }).addTo(map)
      vmList.push(vm)
      committedLine.setLatLngs(pts as [number,number][])
      drawStateRef.current = { pts: [...pts], cleanup }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onLineMove = (e: any) => {
      if (!pts.length) return
      let cursor: LatLng = [e.latlng.lat, e.latlng.lng]

      // Snap magnético: resaltar primer marcador y snappear cursor
      if (pts.length >= 3) {
        const startPx = map.latLngToContainerPoint(pts[0] as [number,number])
        const curPx   = map.latLngToContainerPoint(e.latlng)
        const snapping = Math.hypot(startPx.x - curPx.x, startPx.y - curPx.y) < SNAP_PX
        if (snapping) {
          cursor = [pts[0][0], pts[0][1]]
          vmList[0]?.setStyle({ radius: 9, weight: 3 })
          map.getContainer().style.cursor = 'pointer'
        } else {
          vmList[0]?.setStyle({ radius: 6, weight: 2 })
          map.getContainer().style.cursor = 'crosshair'
        }
      }

      previewSeg.setLatLngs([[pts[pts.length-1], cursor] as [number,number][]])
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onLineRight = (e: any) => {
      if (e?.originalEvent) e.originalEvent.preventDefault()
      if (pts.length < 2) return
      cleanup()

      const lengthM = totalLen(pts)

      // Mostrar preview del buffer
      const preview = []
      const rings = roadBuffer(pts, hw)
      if (rings.length > 0) {
        const poly = Lf.polygon(rings as [number,number][][], {
          color: clr, fillColor: clr, fillOpacity: 0.4, weight: 2, opacity: 0.9,
        }).addTo(map)
        preview.push(poly)
      }
      const line = Lf.polyline(pts as [number,number][], {
        color: clr, weight: 3, opacity: 1, dashArray: '8 4',
      }).addTo(map)
      preview.push(line)
      previewLayersRef.current = preview

      onLineDraw(ripioId, lengthM, pts)
      onDrawEnd()
    }

    drawStateRef.current = { pts, cleanup }
    map.on('click',       onLineClick)
    map.on('mousemove',   onLineMove)
    map.on('contextmenu', onLineRight)
  }, [onLineDraw, onDrawEnd])

  // ── Modo edición de vértices ──────────────────────────────────────────────
  /**
   * Permite corregir un trazado ya dibujado sin rehacerlo:
   *   · vértices llenos    → arrastrar para mover, clic derecho para eliminar
   *   · puntos medios huecos → arrastrar para insertar un vértice nuevo
   *   · extender           → agrega puntos desde cualquiera de los dos extremos
   *
   * La longitud se recalcula mientras se arrastra, pero recién se guarda al
   * soltar: comprometer en cada mousemove golpearía la API sin parar.
   */
  const startEdit = useCallback((ripioId: string) => {
    const map = mapRef.current, Lf = LfRef.current
    if (!map || !Lf) return

    const ripio = ripiosRef.current.find(r => r.id === ripioId)
    if (!ripio?.coords || ripio.coords.length < 2) return

    const clr = ripio.color ?? ripioColor(ripio.orden)
    const hw  = ripio.an / 2
    let pts: LatLng[] = ripio.coords.map(c => [c[0], c[1]] as LatLng)

    // Capas de trabajo: la línea y el buffer se redibujan en cada cambio
    const linea  = Lf.polyline(pts as [number,number][], {
      color: clr, weight: 4, opacity: 1,
    }).addTo(map)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let buffer: any = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let handles: any[] = []
    let modoExtender: 'inicio' | 'fin' | null = null

    const iconoVertice = (extremo: boolean, activo: boolean) => {
      const d = activo ? 18 : extremo ? 14 : 11
      return Lf.divIcon({
        className: '',
        html: `<div style="width:${d}px;height:${d}px;border-radius:50%;
          background:${activo ? '#F5C300' : extremo ? '#fff' : clr};
          border:${activo ? 3 : 2}px solid ${activo ? '#fff' : extremo ? clr : '#fff'};
          box-sizing:border-box;
          box-shadow:0 0 ${activo ? 8 : 4}px rgba(0,0,0,.7)"></div>`,
        iconSize: [d, d], iconAnchor: [d / 2, d / 2],
      })
    }
    const iconoMedio = () => Lf.divIcon({
      className: '',
      html: `<div style="width:9px;height:9px;border-radius:50%;
        background:transparent;border:1.5px dashed ${clr};opacity:.75;
        box-sizing:border-box"></div>`,
      iconSize: [9, 9], iconAnchor: [4.5, 4.5],
    })

    const refrescarLinea = () => {
      linea.setLatLngs(pts as [number,number][])
      if (buffer) { map.removeLayer(buffer); buffer = null }
      const rings = roadBuffer(pts, hw)
      if (rings.length > 0) {
        buffer = Lf.polygon(rings as [number,number][][], {
          color: clr, fillColor: clr, fillOpacity: 0.28, weight: 1, opacity: 0.7,
          interactive: false,
        }).addTo(map)
      }
      setEditLen(totalLen(pts))
      setEditPts(pts.length)
    }

    const commit = () => {
      onLineEditRef.current?.(ripioId, totalLen(pts), pts.map(p => [p[0], p[1]] as LatLng))
    }

    // ── Historial para deshacer / rehacer ──
    // Se guarda una copia del trazado ANTES de cada cambio. Los arrastres
    // toman la foto en dragstart, no en dragend: si no, se guardaría el
    // resultado del movimiento en vez del estado previo.
    const MAX_HISTORIAL = 50
    let historial: LatLng[][] = []
    let futuro:    LatLng[][] = []

    const copiar = (p: LatLng[]): LatLng[] => p.map(c => [c[0], c[1]] as LatLng)

    const sincronizarBotones = () => {
      setPuedeDeshacer(historial.length > 0)
      setPuedeRehacer(futuro.length > 0)
    }

    /** Foto del estado actual, antes de modificarlo */
    const anotar = () => {
      historial.push(copiar(pts))
      if (historial.length > MAX_HISTORIAL) historial.shift()
      futuro = []          // una acción nueva invalida el rehacer
      sincronizarBotones()
    }

    const deshacer = () => {
      const previo = historial.pop()
      if (!previo) return
      futuro.push(copiar(pts))
      pts = previo
      refrescarLinea(); construirHandles(); commit()
      sincronizarBotones()
    }

    const rehacer = () => {
      const siguiente = futuro.pop()
      if (!siguiente) return
      historial.push(copiar(pts))
      pts = siguiente
      refrescarLinea(); construirHandles(); commit()
      sincronizarBotones()
    }

    // ── Selección de vértice y corte ──
    // Hacer clic en un vértice lo selecciona y la barra muestra qué se puede
    // hacer con él. Antes eliminar sólo existía por clic derecho y nadie lo
    // encontraba.
    let sel: number | null = null

    const sincronizarSeleccion = () => {
      if (sel == null || sel >= pts.length) { setVerticeSel(null); return }
      setVerticeSel({
        idx: sel, total: pts.length,
        largoInicio: totalLen(pts.slice(0, sel + 1)),
        largoFin:    totalLen(pts.slice(sel)),
      })
    }

    const seleccionar = (i: number | null) => {
      sel = i
      sincronizarSeleccion()
      construirHandles()
    }

    const eliminarVertice = () => {
      if (sel == null || pts.length <= 2) return
      anotar()
      pts = pts.filter((_, j) => j !== sel)
      sel = null
      refrescarLinea(); construirHandles(); commit(); sincronizarSeleccion()
    }

    /** Parte el tramo en dos: el original conserva hasta el vértice, el resto
     *  pasa a un tramo nuevo. El vértice del corte queda en ambos, para que no
     *  aparezca un hueco entre las dos partes. */
    const separar = () => {
      if (sel == null || sel === 0 || sel === pts.length - 1) return
      const a = pts.slice(0, sel + 1)
      const b = pts.slice(sel)
      onLineSplitRef.current?.(
        ripioId,
        { lengthM: totalLen(a), coords: a.map(p => [p[0], p[1]] as LatLng) },
        { lengthM: totalLen(b), coords: b.map(p => [p[0], p[1]] as LatLng) },
      )
      sel = null
      setVerticeSel(null)
    }

    /** Descarta una de las dos mitades y se queda con la otra */
    const recortar = (lado: 'inicio' | 'fin') => {
      if (sel == null) return
      const resto = lado === 'inicio' ? pts.slice(sel) : pts.slice(0, sel + 1)
      if (resto.length < 2) return
      anotar()
      pts = resto
      sel = null
      refrescarLinea(); construirHandles(); commit(); sincronizarSeleccion()
    }

    // Ctrl+Z / Ctrl+Shift+Z (y Ctrl+Y). Se ignora si el foco está en un campo
    // de texto, para no pisar el deshacer propio del input.
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const t = e.target as HTMLElement | null
      const tag = t?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable) return

      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey)      { e.preventDefault(); deshacer() }
      else if (k === 'z' && e.shiftKey)  { e.preventDefault(); rehacer() }
      else if (k === 'y')                { e.preventDefault(); rehacer() }
    }
    document.addEventListener('keydown', onKeyDown)

    const limpiarHandles = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handles.forEach((h: any) => map.removeLayer(h))
      handles = []
    }

    const construirHandles = () => {
      limpiarHandles()

      // Vértices — arrastrables
      pts.forEach((p, i) => {
        const extremo = i === 0 || i === pts.length - 1
        const m = Lf.marker(p as [number,number], {
          draggable: true, icon: iconoVertice(extremo, sel === i),
          zIndexOffset: sel === i ? 1100 : 1000,
        })
        // Clic: seleccionar para ver las acciones en la barra
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        m.on('click', (e: any) => {
          Lf.DomEvent.stopPropagation(e)
          seleccionar(sel === i ? null : i)
        })
        m.on('dragstart', () => anotar())
        m.on('drag', (e: { target: { getLatLng: () => { lat: number; lng: number } } }) => {
          const ll = e.target.getLatLng()
          pts[i] = [ll.lat, ll.lng]
          linea.setLatLngs(pts as [number,number][])
          setEditLen(totalLen(pts))
        })
        m.on('dragend', () => { refrescarLinea(); construirHandles(); commit() })
        // Clic derecho: eliminar (siempre tienen que quedar al menos 2)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        m.on('contextmenu', (e: any) => {
          Lf.DomEvent.stopPropagation(e)
          if (e.originalEvent) e.originalEvent.preventDefault()
          if (pts.length <= 2) return
          anotar()
          pts = pts.filter((_, j) => j !== i)
          refrescarLinea(); construirHandles(); commit()
        })
        m.bindTooltip(
          extremo
            ? 'Extremo · arrastrar para mover · clic para opciones'
            : 'Clic para opciones · arrastrar para mover · clic derecho elimina',
          { direction: 'top', offset: [0, -8] },
        )
        m.addTo(map)
        handles.push(m)
      })

      // Puntos medios — arrastrar para insertar un vértice
      for (let i = 1; i < pts.length; i++) {
        const medio: LatLng = [
          (pts[i-1][0] + pts[i][0]) / 2,
          (pts[i-1][1] + pts[i][1]) / 2,
        ]
        const idx = i
        const m = Lf.marker(medio as [number,number], {
          draggable: true, icon: iconoMedio(), zIndexOffset: 900,
        })
        let insertado = false
        m.on('dragstart', () => {
          // La foto va antes de insertar: deshacer tiene que volver al trazado
          // sin el vértice nuevo, no al vértice recién creado sin mover.
          anotar()
          pts = [...pts.slice(0, idx), [medio[0], medio[1]], ...pts.slice(idx)]
          insertado = true
        })
        m.on('drag', (e: { target: { getLatLng: () => { lat: number; lng: number } } }) => {
          if (!insertado) return
          const ll = e.target.getLatLng()
          pts[idx] = [ll.lat, ll.lng]
          linea.setLatLngs(pts as [number,number][])
          setEditLen(totalLen(pts))
        })
        m.on('dragend', () => { refrescarLinea(); construirHandles(); commit() })
        m.bindTooltip('Arrastrar para agregar un vértice', { direction: 'top', offset: [0, -8] })
        m.addTo(map)
        handles.push(m)
      }
    }

    // Extender: cada clic en el mapa agrega un punto en el extremo elegido
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onMapClick = (e: any) => {
      if (!modoExtender) return
      anotar()
      const ll: LatLng = [e.latlng.lat, e.latlng.lng]
      pts = modoExtender === 'fin' ? [...pts, ll] : [ll, ...pts]
      refrescarLinea(); construirHandles(); commit()
    }

    const extender = (d: 'inicio' | 'fin' | null) => {
      modoExtender = d
      map.getContainer().style.cursor = d ? 'crosshair' : ''
    }

    const cleanup = () => {
      map.off('click', onMapClick)
      document.removeEventListener('keydown', onKeyDown)
      limpiarHandles()
      if (buffer) map.removeLayer(buffer)
      map.removeLayer(linea)
      map.getContainer().style.cursor = ''
      editStateRef.current = null
      setExtendiendo(null)
      setPuedeDeshacer(false)
      setPuedeRehacer(false)
      setVerticeSel(null)
    }

    map.on('click', onMapClick)
    refrescarLinea()
    construirHandles()
    sincronizarBotones()
    editStateRef.current = {
      cleanup, extender, deshacer, rehacer,
      eliminarVertice, separar, recortar,
      deseleccionar: () => seleccionar(null),
    }
  }, [])

  useEffect(() => {
    if (!mapReady) return
    if (editingId) startEdit(editingId)
    else editStateRef.current?.cleanup()
    return () => { editStateRef.current?.cleanup() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, mapReady])

  // Activar dibujo cuando drawingId cambia
  useEffect(() => {
    if (!mapReady) return
    if (drawingId) {
      startDraw(drawingId)
    } else {
      drawStateRef.current?.cleanup()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      previewLayersRef.current.forEach((l: any) => mapRef.current?.removeLayer(l))
      previewLayersRef.current = []
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawingId, mapReady])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <style>{`
        .leaflet-container { outline: none !important; }
        .leaflet-tooltip {
          background: rgba(10,10,10,0.9); border: 1px solid #2a2a2a;
          color: #ccc; font-family: monospace; font-size: 11px;
          padding: 4px 8px; border-radius: 0; box-shadow: none;
        }
        .leaflet-tooltip::before { display: none; }
        /* Control de capas — tema oscuro */
        .leaflet-control-layers {
          background: rgba(8,8,8,0.92) !important;
          border: 1px solid #1a1a1a !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          color: #777 !important;
          font-family: monospace !important;
          font-size:11px !important;
        }
        .leaflet-control-layers-toggle {
          background-color: #111 !important;
          border: 1px solid #222 !important;
          width: 28px !important; height: 28px !important;
          background-size: 16px 16px !important;
          filter: invert(0.5) !important;
        }
        .leaflet-control-layers label { color: #777 !important; font-size:11px !important; font-family: monospace !important; }
        .leaflet-control-layers-separator { border-top-color: #1a1a1a !important; }
        .leaflet-control-layers input[type=radio] { accent-color: #90A4AE; }
        /* Popup de contexto de ripio */
        .ripio-ctx-popup .leaflet-popup-content-wrapper {
          background: #0d0d0d !important; border: 1px solid #222 !important;
          border-radius: 0 !important; box-shadow: 0 2px 8px #00000088 !important;
          color: #ccc !important; padding: 0 !important;
        }
        .ripio-ctx-popup .leaflet-popup-content { margin: 10px 12px !important; }
        .ripio-ctx-popup .leaflet-popup-tip-container { display: none !important; }
        .ripio-ctx-popup .leaflet-popup-close-button { color: #555 !important; font-size: 14px !important; top: 6px !important; right: 8px !important; }
      `}</style>
      <div ref={mapDivRef} style={{ width: '100%', height: '100%' }} />


        {/* Red vial: qué camino hay bajo el cursor */}
        <div style={{
          position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
          zIndex: 999, pointerEvents: 'none',
        }}>
          <LecturaTramo tramo={tramoFondo} activa={verRedFondo} onActiva={setVerRedFondo} />
        </div>

      {/* Instrucción de dibujo */}
      {drawingId && (
        <div style={{
          position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
          zIndex: 999, background: '#0a0a0aee', border: `1px solid ${color}55`,
          padding: '6px 14px', fontFamily: 'monospace', fontSize: 12, color: `${color}cc`,
          pointerEvents: 'none',
        }}>
          ● Clic para agregar punto · Clic derecho para finalizar
        </div>
      )}

      {/* Barra de edición de vértices */}
      {editingId && (
        <div style={{
          position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
          zIndex: 999, background: '#0a0a0af2', border: `1px solid ${color}77`,
          padding: '8px 12px', fontFamily: 'monospace', fontSize: 12,
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          maxWidth: 'calc(100% - 20px)',
        }}>
          <span style={{ color, fontWeight: 700, letterSpacing: 0.5 }}>✎ EDITANDO TRAZADO</span>

          <span style={{ color: '#999' }}>
            {editLen >= 1000
              ? `${(editLen / 1000).toFixed(3)} km`
              : `${Math.round(editLen)} m`}
            <span style={{ color: '#555', marginLeft: 6 }}>· {editPts} vértices</span>
          </span>

          <span style={{ color: '#555', borderLeft: '1px solid #2a2a2a', paddingLeft: 12 }}>
            {verticeSel
              ? `Vértice ${verticeSel.idx + 1} de ${verticeSel.total}`
              : 'Clic en un punto para opciones · arrastrá para mover · los huecos agregan'}
          </span>

          {/* Deshacer / rehacer — también por teclado */}
          <span style={{ display: 'flex', gap: 4, borderLeft: '1px solid #2a2a2a', paddingLeft: 12 }}>
            {([
              { icono: '↶', activo: puedeDeshacer, fn: () => editStateRef.current?.deshacer(),
                titulo: 'Deshacer  (Ctrl+Z)' },
              { icono: '↷', activo: puedeRehacer,  fn: () => editStateRef.current?.rehacer(),
                titulo: 'Rehacer  (Ctrl+Shift+Z)' },
            ]).map(b => (
              <button key={b.icono}
                onClick={b.fn}
                disabled={!b.activo}
                title={b.titulo}
                style={{
                  fontFamily: 'monospace', fontSize: 14, lineHeight: 1,
                  padding: '4px 9px', background: 'transparent',
                  border: `1px solid ${b.activo ? '#3a3a3a' : '#1e1e1e'}`,
                  color: b.activo ? '#bbb' : '#333',
                  cursor: b.activo ? 'pointer' : 'default',
                }}>
                {b.icono}
              </button>
            ))}
          </span>

          {(['inicio', 'fin'] as const).map(d => {
            const activo = extendiendo === d
            return (
              <button key={d}
                onClick={() => {
                  const nuevo = activo ? null : d
                  setExtendiendo(nuevo)
                  editStateRef.current?.extender(nuevo)
                }}
                style={{
                  fontFamily: 'monospace', fontSize: 12, cursor: 'pointer',
                  padding: '4px 10px',
                  background: activo ? color : 'transparent',
                  border: `1px solid ${activo ? color : '#333'}`,
                  color: activo ? '#111' : '#888',
                  fontWeight: activo ? 700 : 400,
                }}>
                {activo ? '● ' : '+ '}Extender {d}
              </button>
            )
          })}

          <button
            onClick={() => { setExtendiendo(null); onEditEnd?.() }}
            style={{
              fontFamily: 'monospace', fontSize: 12, cursor: 'pointer',
              padding: '4px 14px', background: '#F5C300', border: 'none',
              color: '#111', fontWeight: 700, letterSpacing: 0.5,
            }}>
            ✓ Listo
          </button>

          {/* Acciones sobre el vértice seleccionado — segunda fila */}
          {verticeSel && (
            <div style={{
              flexBasis: '100%', display: 'flex', gap: 6, alignItems: 'center',
              flexWrap: 'wrap', paddingTop: 8, marginTop: 2,
              borderTop: '1px solid #2a2a2a',
            }}>
              <button
                onClick={() => editStateRef.current?.eliminarVertice()}
                disabled={verticeSel.total <= 2}
                title={verticeSel.total <= 2 ? 'Hacen falta al menos 2 vértices' : 'Eliminar este vértice'}
                style={{
                  fontFamily: 'monospace', fontSize: 12,
                  cursor: verticeSel.total > 2 ? 'pointer' : 'default',
                  padding: '4px 10px', background: 'transparent',
                  border: `1px solid ${verticeSel.total > 2 ? '#553030' : '#1e1e1e'}`,
                  color: verticeSel.total > 2 ? '#c77' : '#333',
                }}>
                ✕ Eliminar vértice
              </button>

              <span style={{ color: '#333', margin: '0 2px' }}>│</span>

              <button
                onClick={() => editStateRef.current?.separar()}
                disabled={verticeSel.idx === 0 || verticeSel.idx === verticeSel.total - 1}
                title="Parte el tramo en dos; el segundo pasa a ser un ripio nuevo"
                style={{
                  fontFamily: 'monospace', fontSize: 12,
                  cursor: (verticeSel.idx > 0 && verticeSel.idx < verticeSel.total - 1) ? 'pointer' : 'default',
                  padding: '4px 10px', background: 'transparent',
                  border: `1px solid ${(verticeSel.idx > 0 && verticeSel.idx < verticeSel.total - 1) ? '#3a3a3a' : '#1e1e1e'}`,
                  color: (verticeSel.idx > 0 && verticeSel.idx < verticeSel.total - 1) ? '#bbb' : '#333',
                }}>
                ✂ Separar en dos tramos
              </button>

              {([
                { lado: 'inicio' as const, txt: 'Borrar hacia el inicio', queda: verticeSel.largoFin },
                { lado: 'fin'    as const, txt: 'Borrar hacia el fin',    queda: verticeSel.largoInicio },
              ]).map(b => (
                <button key={b.lado}
                  onClick={() => editStateRef.current?.recortar(b.lado)}
                  title={`Descarta esa mitad; queda un tramo de ${Math.round(b.queda)} m`}
                  style={{
                    fontFamily: 'monospace', fontSize: 12, cursor: 'pointer',
                    padding: '4px 10px', background: 'transparent',
                    border: '1px solid #553030', color: '#c77',
                  }}>
                  ✕ {b.txt}
                  <span style={{ color: '#666', marginLeft: 5 }}>
                    queda {b.queda >= 1000 ? `${(b.queda/1000).toFixed(2)} km` : `${Math.round(b.queda)} m`}
                  </span>
                </button>
              ))}

              <button
                onClick={() => editStateRef.current?.deseleccionar()}
                style={{
                  fontFamily: 'monospace', fontSize: 12, cursor: 'pointer',
                  padding: '4px 10px', background: 'transparent',
                  border: '1px solid #2a2a2a', color: '#777', marginLeft: 'auto',
                }}>
                Deseleccionar
              </button>
            </div>
          )}
        </div>
      )}

      {!mapReady && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: '#0d0d0d', fontFamily: 'monospace', fontSize: 13, color: '#333',
        }}>
          Cargando mapa…
        </div>
      )}
    </div>
  )
}

