'use client'
/**
 * Mapa de precipitaciones: la lluvia sobre los caminos.
 *
 * **Cada tramo lleva su propio número**, no el de su consorcio. Es lo más fiel
 * al dato, porque el dato es justamente cuánta agua cayó sobre esos caminos, y
 * es lo que se quiere mirar: qué tramos quedaron comprometidos.
 *
 * Antes había además un círculo por consorcio en el centro de gravedad de su
 * red, como resumen. **Se sacó**: una vez que cada camino lleva su propio
 * número, el círculo promedia y tapa justamente lo que se vino a ver — una
 * tormenta que moja una punta del consorcio y no la otra. El consorcio se sigue
 * eligiendo desde la lista de la derecha, y elegirlo encuadra el mapa y resalta
 * su red.
 */

import { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import { colorLluvia, type ResumenConsorcio } from '@/lib/lluvia'
import { RADIO_KM } from '@/lib/fusion'
import { IndiceTramos } from '@/lib/indiceTramos'
import { toleranciaKm } from '@/lib/redFondo'
import { calcularGrilla, curvasDeNivel, nivelesSugeridos } from '@/lib/isohietas'
import { poligonosThiessen } from '@/lib/thiessen'
import { CORTES_MM, type TramoRed, type LluviaTramo } from '@/lib/redLluvia'
import { CONTORNO_CHACO } from '@/data/contornoChaco'

/**
 * Los límites de la provincia, para encuadrar el mapa.
 *
 * El encuadre se calcula, no se fija. Con un `center` y un `zoom` a mano, cuanto
 * más alto es el contenedor más superficie abarca: la provincia queda chica
 * adentro de medio continente, y el usuario tiene que acercarse a mano cada vez.
 * Con `fitBounds` el mapa muestra el Chaco y nada más, sea cual sea el tamaño.
 */
const LIMITES: [[number, number], [number, number]] = (() => {
  let latMin = 90, latMax = -90, lngMin = 180, lngMax = -180
  for (const [lng, lat] of CONTORNO_CHACO) {
    if (lat < latMin) latMin = lat
    if (lat > latMax) latMax = lat
    if (lng < lngMin) lngMin = lng
    if (lng > lngMax) lngMax = lng
  }
  return [[latMin, lngMin], [latMax, lngMax]]
})()

/** Un interruptor de capa: título clickeable y una línea de qué hace */
function Interruptor({ titulo, nota, activo, onChange }: {
  titulo: string; nota: string; activo: boolean; onChange: (v: boolean) => void
}) {
  return (
    <label style={{ display: 'block', cursor: 'pointer' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#e0e0e0', fontSize: 13 }}>
        <input type="checkbox" checked={activo} onChange={e => onChange(e.target.checked)}
          style={{ width: 15, height: 15, accentColor: '#F5C300', cursor: 'pointer' }} />
        {titulo}
      </span>
      <span style={{ display: 'block', fontSize: 11, color: '#7a7a7a', marginLeft: 23, marginTop: 2 }}>
        {nota}
      </span>
    </label>
  )
}

/** Una línea de leyenda: cuadradito de color y texto */
function Fila({ color, texto }: { color: string; texto: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3,
      fontSize: 11, color: '#c4c4c4' }}>
      <span style={{ width: 16, height: 11, background: color, border: '1px solid #444',
        flexShrink: 0 }} />
      {texto}
    </div>
  )
}

/** '#RRGGBB' → [r, g, b], para poder escribirlo en el lienzo */
function aRGB(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

/** Lo que midió cada pluviómetro en el período, para las isohietas */
export interface EstacionLluvia {
  nombre: string
  lat: number
  lng: number
  mm: number
}

interface Props {
  datos: ResumenConsorcio[]
  seleccionado: number | null
  estaciones?: EstacionLluvia[]
  /** La red vial partida en tramos; la calcula `useRedLluvia` */
  tramos?: TramoRed[]
  /** La lluvia de cada tramo, en el mismo orden */
  lluviaTramos?: LluviaTramo[]
  /** Sólo se muestran los caminos que llegaron a estos mm */
  umbral: number
  onUmbral: (mm: number) => void
}

export default function MapaLluvia({
  datos, seleccionado, estaciones,
  tramos = [], lluviaTramos = [], umbral, onUmbral,
}: Props) {
  const divRef  = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapaRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const capaRedRef = useRef<any>(null)
  /** Una polilínea por tramo, en el mismo orden que `tramos` */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lineasRef = useRef<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const capaIsoRef = useRef<any>(null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const capaZonasRef = useRef<any>(null)
  const observadorRef = useRef<ResizeObserver | null>(null)
  /** ¿El usuario ya movió el mapa? Entonces no se le vuelve a encuadrar */
  const movioRef = useRef(false)
  /** Para no confundir nuestros propios ajustes con un movimiento del usuario */
  const ajustandoRef = useRef(false)

  const [verIso, setVerIso] = useState(false)
  const [verZonas, setVerZonas] = useState(false)
  const [verCaminos, setVerCaminos] = useState(true)
  const [verSedes, setVerSedes] = useState(false)
  const [niveles, setNiveles] = useState<number[]>([])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const capaSedesRef = useRef<any>(null)
  /** Índice espacial de los tramos, para el hit-test del cursor */
  const indiceRef = useRef<IndiceTramos | null>(null)
  /** Qué tramo está bajo el cursor ahora mismo */
  const [bajoCursor, setBajoCursor] = useState<number | null>(null)


  // ── Crear el mapa una sola vez ───────────────────────────────────────────
  useEffect(() => {
    if (!divRef.current || mapaRef.current) return
    let cancelado = false

    ;(async () => {
      const L = (await import('leaflet')).default
      if (cancelado || !divRef.current) return

      const mapa = L.map(divRef.current, {
        center: [-26.4, -60.5], zoom: 7, attributionControl: false,
        zoomControl: true, preferCanvas: true,
      })
      mapa.fitBounds(LIMITES, { padding: [12, 12], animate: false })
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
      }).addTo(mapa)

      mapaRef.current = mapa
      // Orden de abajo hacia arriba: las isohietas son el fondo, después los
      // caminos, y los círculos arriba de todo para que se puedan clickear.
      capaIsoRef.current   = L.layerGroup().addTo(mapa)
      capaRedRef.current   = L.layerGroup().addTo(mapa)
      // Las zonas de Thiessen van en su propio panel, por debajo del resto:
      // son polígonos con relleno y si compartieran panel taparían los caminos.
      mapa.createPane('zonasThiessen').style.zIndex = '390'
      capaZonasRef.current = L.layerGroup().addTo(mapa)

      /**
       * Reajustar el mapa cuando cambia el tamaño de su contenedor.
       *
       * Tres cosas, y ninguna es obvia:
       *
       * 1. Leaflet cachea las dimensiones al crear el mapa y no las vuelve a
       *    mirar solo. El contenedor arranca en cero mientras el layout se
       *    acomoda, y después crece y se encoge con los controles de arriba.
       *
       * 2. **`invalidateSize()` no conserva el centro: conserva la esquina
       *    superior izquierda.** Panea por la mitad del cambio de tamaño. Con el
       *    contenedor creciendo y el observador llamándolo una y otra vez, el
       *    mapa se fue derivando hacia el norte hasta terminar mostrando
       *    Venezuela.
       *
       * 3. Mientras el usuario no haya movido el mapa, se **vuelve a encuadrar
       *    la provincia** en vez de conservar el encuadre anterior. Un zoom fijo
       *    abarca más superficie cuanto más alto es el contenedor, y ahí el
       *    Chaco queda perdido adentro de medio continente. Si el usuario ya se
       *    acercó a mirar algo, se le respeta la vista.
       */
      const reajustar = () => {
        const centro = mapa.getCenter()
        const zoom = mapa.getZoom()
        ajustandoRef.current = true
        mapa.invalidateSize({ pan: false })
        if (movioRef.current) mapa.setView(centro, zoom, { animate: false })
        else mapa.fitBounds(LIMITES, { padding: [12, 12], animate: false })
        ajustandoRef.current = false
      }
      setTimeout(reajustar, 120)

      // Sólo cuenta como movimiento del usuario lo que no disparamos nosotros
      mapa.on('dragstart zoomstart', () => {
        if (!ajustandoRef.current) movioRef.current = true
      })

      if (typeof ResizeObserver !== 'undefined' && divRef.current) {
        observadorRef.current = new ResizeObserver(reajustar)
        observadorRef.current.observe(divRef.current)
      }
    })()

    return () => {
      cancelado = true
      observadorRef.current?.disconnect()
      observadorRef.current = null
      if (mapaRef.current) { mapaRef.current.remove(); mapaRef.current = null }
    }
  }, [])

  /**
   * Dibujar la red una sola vez.
   *
   * Son casi diez mil polilíneas. Recrearlas cada vez que cambia el rango de
   * fechas trababa el mapa por un segundo largo, así que se crean al llegar el
   * archivo y después sólo se les cambia el color (efecto siguiente).
   */
  useEffect(() => {
    if (!capaRedRef.current || tramos.length === 0) return
    let cancelado = false

    ;(async () => {
      const L = (await import('leaflet')).default
      if (cancelado || !capaRedRef.current) return

      capaRedRef.current.clearLayers()
      lineasRef.current = tramos.map(t => {
        const linea = L.polyline(t.puntos, {
          color: '#2a2a2a', weight: 1, opacity: 0.35,
          interactive: false,   // el clic es de los círculos
        })
        linea.addTo(capaRedRef.current)
        return linea
      })
    })()

    return () => { cancelado = true }
  }, [tramos])

  /**
   * Recolorear la red cuando cambian los milímetros o el umbral.
   *
   * Cada tramo lleva **su propio** número, no el de su consorcio. Antes toda la
   * red de un consorcio salía de un color solo, y una tormenta que mojaba una
   * punta y no la otra quedaba tapada por el promedio.
   *
   * Tres estados, como en las isohietas: pintado = llovió, gris tenue = midió
   * cero, y punteado apagado = no hay pluviómetro a menos de {@link RADIO_KM},
   * que no es lo mismo que seco.
   *
   * El umbral y el consorcio seleccionado se resuelven **acá adentro** y no en
   * efectos aparte: son tres reglas sobre el mismo `setStyle`, y separadas se
   * pisaban entre sí — al deseleccionar un consorcio los caminos quedaban
   * atenuados para siempre, porque el efecto del color no se volvía a disparar.
   */
  useEffect(() => {
    const lineas = lineasRef.current
    if (lineas.length === 0 || lineas.length !== lluviaTramos.length) return

    for (let i = 0; i < lineas.length; i++) {
      const mm = lluviaTramos[i].mm
      const suyo = seleccionado == null || tramos[i].cc === seleccionado

      if (mm === null) {
        lineas[i].setStyle({
          color: '#4a4a4a', weight: 1, opacity: suyo ? 0.35 : 0.1, dashArray: '2,4',
        })
        continue
      }
      // Bajo el umbral el camino no se borra: se atenúa, para que se siga
      // viendo dónde está la red que no llegó a ese valor.
      const pasa = mm >= umbral
      const grueso = seleccionado != null && suyo ? 3 : mm > 0 ? 1.8 : 1
      lineas[i].setStyle({
        color: colorLluvia(mm),
        weight: pasa ? grueso : 0.8,
        opacity: !suyo ? 0.1 : !pasa ? 0.12 : mm > 0 ? 0.9 : 0.35,
        dashArray: undefined,
      })
    }
  }, [lluviaTramos, umbral, seleccionado, tramos])


  /**
   * Isohietas: bandas rellenas + curvas rotuladas.
   *
   * El relleno va como imagen sobre el mapa, no como miles de polígonos: la
   * grilla son ~14.000 nodos y dibujarlos uno por uno trabaría el mapa. Las
   * curvas sí son vectores, porque tienen que verse nítidas en cualquier zoom y
   * llevan el rótulo con los milímetros.
   *
   * Todo el cálculo pasa en el navegador. Los datos que necesita son 71 números,
   * así que no hay nada que pedirle al servidor cada vez que se prende o apaga.
   */
  useEffect(() => {
    if (!capaIsoRef.current) return
    let cancelado = false

    if (!verIso || !estaciones?.length) {
      capaIsoRef.current.clearLayers()
      setNiveles([])
      return
    }

    ;(async () => {
      const L = (await import('leaflet')).default
      if (cancelado || !capaIsoRef.current) return

      const grilla = calcularGrilla(estaciones)
      capaIsoRef.current.clearLayers()
      if (!grilla || grilla.max <= 0) { setNiveles([]); return }

      // ── El relleno ─────────────────────────────────────────────────────────
      const lienzo = document.createElement('canvas')
      lienzo.width = grilla.nx
      lienzo.height = grilla.ny
      const ctx = lienzo.getContext('2d')
      if (ctx) {
        const img = ctx.createImageData(grilla.nx, grilla.ny)
        for (let j = 0; j < grilla.ny; j++) {
          for (let i = 0; i < grilla.nx; i++) {
            const v = grilla.valores[j * grilla.nx + i]
            // La imagen se dibuja de arriba hacia abajo y la grilla de sur a
            // norte: hay que dar vuelta la fila.
            const k = ((grilla.ny - 1 - j) * grilla.nx + i) * 4

            // Sin pluviómetro cerca: transparente, y se ve el mapa pelado.
            if (Number.isNaN(v)) { img.data[k + 3] = 0; continue }

            // Midió cero: un gris tenue. **No es lo mismo que no saber**, y si
            // las dos cosas se dibujaran transparentes nadie podría distinguir
            // "acá no llovió" de "acá no hay con qué decirlo".
            if (v <= 0) {
              img.data[k] = 150; img.data[k + 1] = 152; img.data[k + 2] = 145
              img.data[k + 3] = 46
              continue
            }

            const [r, g, b] = aRGB(colorLluvia(v))
            img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = b
            img.data[k + 3] = 150
          }
        }
        ctx.putImageData(img, 0, 0)

        const limites: [[number, number], [number, number]] = [
          [grilla.lat0, grilla.lng0],
          [grilla.lat0 + (grilla.ny - 1) * grilla.dLat,
           grilla.lng0 + (grilla.nx - 1) * grilla.dLng],
        ]
        L.imageOverlay(lienzo.toDataURL(), limites, { opacity: 1, interactive: false })
          .addTo(capaIsoRef.current)
      }

      // ── Las curvas ─────────────────────────────────────────────────────────
      const nivs = nivelesSugeridos(grilla.max)
      for (const nivel of nivs) {
        const curvas = curvasDeNivel(grilla, nivel)
        // La más larga lleva el rótulo: repetirlo en cada trocito ensucia
        let masLarga: [number, number][] | null = null
        for (const c of curvas) {
          L.polyline(c, {
            color: '#1a1a1a', weight: 1.2, opacity: 0.55, interactive: false,
          }).addTo(capaIsoRef.current)
          if (!masLarga || c.length > masLarga.length) masLarga = c
        }
        if (masLarga && masLarga.length > 8) {
          const medio = masLarga[Math.floor(masLarga.length / 2)]
          L.marker(medio, {
            interactive: false,
            icon: L.divIcon({
              className: '',
              html: `<div style="font-family:monospace;font-size:11px;font-weight:700;
                     color:#111;background:rgba(255,255,255,.85);padding:1px 4px;
                     border-radius:2px;white-space:nowrap">${nivel} mm</div>`,
              iconSize: [0, 0],
            }),
          }).addTo(capaIsoRef.current)
        }
      }
      setNiveles(nivs)
    })()

    return () => { cancelado = true }
  }, [verIso, estaciones])

  /**
   * Zonas de pluviómetro: los polígonos de Thiessen y las estaciones.
   *
   * Contesta de un vistazo "¿de qué pluviómetro lee este consorcio?". Cada zona
   * es un polígono de verdad —no una imagen— así que el borde queda fino a
   * cualquier zoom y se puede resaltar la zona al pasarle por encima. Las
   * estaciones van como puntos, con el nombre y lo que midieron.
   *
   * Donde no hay polígono no hay pluviómetro a menos de {@link RADIO_KM}: ese
   * hueco es información, y por eso las zonas van con relleno tenue y el fondo
   * descubierto queda limpio.
   *
   * Es una capa de cobertura, no el campo de lluvia: los milímetros salen de IDW
   * promediando varias estaciones, no del polígono. Sirve igual, porque bajo IDW
   * el pluviómetro más cercano es también el que más pesa.
   */
  useEffect(() => {
    if (!capaZonasRef.current) return
    let cancelado = false

    if (!verZonas || !estaciones?.length) {
      capaZonasRef.current.clearLayers()
      return
    }

    ;(async () => {
      const L = (await import('leaflet')).default
      if (cancelado || !capaZonasRef.current) return

      capaZonasRef.current.clearLayers()

      const base = { pane: 'zonasThiessen' }
      const normal = { color: '#54606b', weight: 1, opacity: 0.6, fillColor: '#54606b', fillOpacity: 0.05 }
      const encima = { color: '#2C2C2C', weight: 1.6, opacity: 0.95, fillColor: '#F5C300', fillOpacity: 0.22 }

      for (const { indice, anillo } of poligonosThiessen(estaciones)) {
        const e = estaciones[indice]
        const zona = L.polygon(anillo, { ...base, ...normal })
          .bindTooltip(
            `<div style="font-family:monospace;font-size:12px;line-height:1.5">
               zona de <b>${e.nombre}</b><br/>${e.mm.toLocaleString('es-AR')} mm en el período
             </div>`,
            { sticky: true, opacity: 0.96 },
          )
        zona.on('mouseover', () => { zona.setStyle(encima); zona.bringToFront() })
        zona.on('mouseout', () => zona.setStyle(normal))
        zona.addTo(capaZonasRef.current!)
      }

      for (const e of estaciones) {
        L.circleMarker([e.lat, e.lng], {
          radius: 3.5, color: '#fff', weight: 1.2,
          fillColor: e.mm > 0 ? '#C0392B' : '#4a4a4a', fillOpacity: 1,
        })
          .bindTooltip(
            `<div style="font-family:monospace;font-size:12px;line-height:1.5">
               <b>${e.nombre}</b><br/>${e.mm.toLocaleString('es-AR')} mm en el período
             </div>`,
            { direction: 'top', opacity: 0.96 },
          )
          .addTo(capaZonasRef.current)
      }
    })()

    return () => { cancelado = true }
  }, [verZonas, estaciones])

  /**
   * Prender y apagar capas sin recrearlas.
   *
   * Los caminos son casi diez mil polilíneas y los círculos 103: sacarlos del
   * mapa y volver a construirlos en cada clic trababa todo. Se quitan y se
   * reponen los grupos enteros, que es instantáneo.
   */
  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa) return
    const capa = capaRedRef.current
    if (!capa) return
    if (verCaminos && !mapa.hasLayer(capa)) capa.addTo(mapa)
    if (!verCaminos && mapa.hasLayer(capa)) mapa.removeLayer(capa)
  }, [verCaminos, datos, tramos])

  /**
   * Qué tramo hay bajo el cursor.
   *
   * **El hit-test se resuelve por afuera de Leaflet, igual que en los mapas de
   * las calculadoras y por el mismo motivo**: los caminos son
   * `interactive: false` a propósito —9.743 polilíneas recibiendo eventos traban
   * el mapa— así que no pueden contestar por sí mismos. Se escucha `mousemove`
   * **a nivel mapa**, una sola vez, y el índice contesta cuál está debajo.
   *
   * La tolerancia es en píxeles y se convierte al zoom actual: a zoom 8 medio
   * kilómetro es razonable, a zoom 16 agarraría media ciudad.
   */
  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa) return

    indiceRef.current = tramos.length > 0 ? new IndiceTramos(tramos) : null
    if (!indiceRef.current) { setBajoCursor(null); return }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const alMover = (e: any) => {
      const idx = indiceRef.current
      if (!idx || !verCaminos) { setBajoCursor(null); return }
      const hit = idx.tramoEn(e.latlng, toleranciaKm(mapa))
      setBajoCursor(hit ? hit.indice : null)
    }
    const alSalir = () => setBajoCursor(null)

    mapa.on('mousemove', alMover)
    mapa.on('mouseout', alSalir)
    return () => {
      mapa.off('mousemove', alMover)
      mapa.off('mouseout', alSalir)
    }
  }, [tramos, verCaminos])

  /**
   * Las sedes de los consorcios.
   *
   * Salen de `datos`, que ya trae la coordenada de cada consorcio, en vez de
   * bajar `geo_bundle.json` sólo para esto: son los mismos 103 puntos y el
   * archivo pesa 1,3 MB.
   */
  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa) return
    let cancelado = false

    ;(async () => {
      const L = (await import('leaflet')).default
      if (cancelado || !mapaRef.current) return

      if (!capaSedesRef.current) capaSedesRef.current = L.layerGroup()
      const capa = capaSedesRef.current
      capa.clearLayers()

      if (verSedes) {
        for (const c of datos) {
          if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) continue
          L.marker([c.lat, c.lng], {
            icon: L.divIcon({
              className: '',
              html: `<div style="width:21px;height:21px;border-radius:50%;`
                  + `background:#F5C300;border:2px solid #111;display:flex;`
                  + `align-items:center;justify-content:center;font-size:11px;`
                  + `font-weight:800;color:#111;font-family:monospace;`
                  + `box-shadow:0 2px 6px rgba(0,0,0,.7)">${c.numero}</div>`,
              iconSize: [21, 21], iconAnchor: [10, 10],
            }),
          })
            .bindTooltip(
              `<div style="font-family:monospace;font-size:12px;line-height:1.5">`
              + `<b style="color:#F5C300">Sede CC ${c.numero}</b><br/>`
              + `${c.nombre.replace(/"/g, '')}</div>`,
              { direction: 'top', offset: [0, -10], opacity: 0.96 },
            )
            .addTo(capa)
        }
        if (!mapa.hasLayer(capa)) capa.addTo(mapa)
      } else if (mapa.hasLayer(capa)) {
        mapa.removeLayer(capa)
      }
    })()

    return () => { cancelado = true }
  }, [verSedes, datos])

  // ── Encuadrar el consorcio elegido en la lista ───────────────────────────
  // Los caminos —resaltar el suyo y atenuar el resto— los atiende el efecto del
  // color, más arriba. Acá sólo queda mover el mapa.
  useEffect(() => {
    if (seleccionado != null && mapaRef.current) {
      const c = datos.find(d => d.numero === seleccionado)
      if (c) mapaRef.current.setView([c.lat, c.lng], Math.max(mapaRef.current.getZoom(), 8))
    }
  }, [seleccionado, datos])

  const hayEstaciones = (estaciones?.length ?? 0) > 0

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={divRef} style={{ width: '100%', height: '100%', background: '#111' }} />

      {/* Capas: dos interruptores y nada más. Cada uno explica qué muestra. */}
      <div style={{
        position: 'absolute', top: 10, right: 10, zIndex: 500,
        background: 'rgba(24,24,24,.93)', border: '1px solid #333', borderRadius: 3,
        padding: '9px 12px', fontFamily: 'monospace', maxWidth: 236,
      }}>
        <div style={{ fontSize: 11, color: '#6a6a6a', textTransform: 'uppercase',
          letterSpacing: 0.8, marginBottom: 7 }}>
          Capas
        </div>

        <Interruptor
          titulo="Caminos" activo={verCaminos} onChange={setVerCaminos}
          nota="La lámina que recibió cada tramo. Pasá el cursor por encima para ver cuál es." />

        {verCaminos && lluviaTramos.length > 0 && (
          <div style={{ margin: '7px 0 0 23px' }}>
            {CORTES_MM.filter(c => c > 0).map(c => (
              <Fila key={c} color={colorLluvia(c)} texto={`${c} mm o más`} />
            ))}
            <Fila color="#54564f" texto="0 mm — no llovió" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 3 }}>
              <span style={{ width: 16, height: 0, borderTop: '1px dashed #6a6a6a',
                flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: '#8a8a8a' }}>sin pluviómetro cerca</span>
            </div>

            {/* Umbral: en vez de esconder lo que no llega, lo apaga. Así se
                sigue viendo dónde está esa red, que también es información. */}
            <label style={{ display: 'block', marginTop: 9 }}>
              <span style={{ fontSize: 11, color: '#9a9a9a' }}>
                Resaltar desde{' '}
                <b style={{ color: umbral > 0 ? '#F5C300' : '#c4c4c4' }}>
                  {umbral} mm
                </b>
              </span>
              <input
                type="range" min={0} max={100} step={5} value={umbral}
                onChange={e => onUmbral(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#F5C300', marginTop: 2 }} />
            </label>
          </div>
        )}

        <div style={{ borderTop: '1px solid #2d2d2d', margin: '8px 0' }} />

        {!hayEstaciones ? (
          <div style={{ fontSize: 12, color: '#8a8a8a', lineHeight: 1.5 }}>
            Sin mediciones de la APA en el período.<br />
            <span style={{ color: '#6a6a6a' }}>Traelas desde la pestaña Precisión.</span>
          </div>
        ) : (
          <>
            <Interruptor
              titulo="Isohietas" activo={verIso} onChange={setVerIso}
              nota="Isohietas: curvas de igual lámina." />

            {verIso && niveles.length > 0 && (
              <div style={{ margin: '7px 0 9px 23px' }}>
                {niveles.map(n => (
                  <Fila key={n} color={colorLluvia(n)} texto={`${n.toLocaleString('es-AR')} mm`} />
                ))}
                <Fila color="#54564f" texto="0 mm — no llovió" />
                <div style={{ fontSize: 11, color: '#6a6a6a', marginTop: 5, lineHeight: 1.45 }}>
                  Sin pintar: no hay pluviómetro a menos de {RADIO_KM} km.
                </div>
              </div>
            )}

            <div style={{ borderTop: '1px solid #2d2d2d', margin: '8px 0' }} />

            <Interruptor
              titulo="Zonas de pluviómetro" activo={verZonas} onChange={setVerZonas}
              nota="De qué estación lee cada lugar." />

            {verZonas && (
              <div style={{ margin: '7px 0 0 23px', fontSize: 11, color: '#7a7a7a',
                lineHeight: 1.5 }}>
                Cada polígono es la zona de una estación. Mirá si la red de un
                consorcio cae dentro de uno solo o está partida entre varios.
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 6 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#C0392B',
                    border: '1px solid #fff', flexShrink: 0 }} />
                  <span style={{ color: '#c4c4c4' }}>midió lluvia</span>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#4a4a4a',
                    border: '1px solid #fff', flexShrink: 0 }} />
                  <span style={{ color: '#c4c4c4' }}>midió cero</span>
                </div>
              </div>
            )}
          </>
        )}

        <div style={{ borderTop: '1px solid #2d2d2d', margin: '8px 0' }} />

        <Interruptor
          titulo="Sedes de consorcio" activo={verSedes} onChange={setVerSedes}
          nota="Dónde está la sede de cada uno de los 103." />
      </div>

      {/*
        Lectura del tramo bajo el cursor.
        Va al pie y sólo aparece cuando hay algo que decir: un recuadro fijo
        vacío ocuparía lugar del mapa para no informar nada.
      */}
      {bajoCursor !== null && tramos[bajoCursor] && (
        <div style={{
          position: 'absolute', left: 10, bottom: 10, zIndex: 500,
          background: 'rgba(24,24,24,.93)', border: '1px solid #333', borderRadius: 3,
          padding: '7px 11px', fontFamily: 'monospace', fontSize: 12,
          color: '#c4c4c4', lineHeight: 1.6, maxWidth: 420, pointerEvents: 'none',
        }}>
          <b style={{ color: '#F5C300' }}>{tramos[bajoCursor].ruta || 'Sin designación'}</b>
          {Number.isFinite(tramos[bajoCursor].cc) && (
            <span style={{ color: '#8a8a8a' }}>{'  ·  '}CC {tramos[bajoCursor].cc}</span>
          )}
          <span style={{ color: '#8a8a8a' }}>
            {'  ·  '}{tramos[bajoCursor].km.toFixed(1).replace('.', ',')} km
          </span>
          <div style={{ color: '#8a8a8a', fontSize: 11 }}>
            {[tramos[bajoCursor].jurisdiccion, tramos[bajoCursor].material]
              .filter(Boolean).join('  ·  ') || 'sin datos de jurisdicción'}
          </div>
          {lluviaTramos[bajoCursor] && (
            <div style={{ marginTop: 2 }}>
              {lluviaTramos[bajoCursor].mm === null ? (
                <span style={{ color: '#8a8a8a' }}>
                  Sin pluviómetro a menos de {RADIO_KM} km — no hay dato
                </span>
              ) : (
                <>
                  <b style={{ color: colorLluvia(lluviaTramos[bajoCursor].mm!) }}>
                    {lluviaTramos[bajoCursor].mm!.toFixed(1).replace('.', ',')} mm
                  </b>
                  {lluviaTramos[bajoCursor].estacion && (
                    <span style={{ color: '#8a8a8a' }}>
                      {'  ·  lee de '}{lluviaTramos[bajoCursor].estacion}
                      {lluviaTramos[bajoCursor].estacionKm !== null &&
                        ` a ${lluviaTramos[bajoCursor].estacionKm} km`}
                    </span>
                  )}
                  {lluviaTramos[bajoCursor].cobertura < 0.999 && (
                    <span style={{ color: '#E8833A' }}>
                      {'  ·  '}
                      {Math.round(lluviaTramos[bajoCursor].cobertura * 100)} % del tramo con dato
                    </span>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
