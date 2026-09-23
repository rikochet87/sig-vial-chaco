'use client'
/**
 * Mapa de precipitaciones, en dos capas que se complementan.
 *
 * **Los caminos pintados** son el detalle: cada tramo lleva el color del nivel
 * de lluvia de su consorcio. Es lo más fiel al dato, porque el dato es
 * justamente cuánta agua cayó sobre esos caminos — y es lo que se quiere mirar
 * al acercarse: qué tramos quedaron comprometidos.
 *
 * **El círculo** es el resumen: va en el centro de gravedad de la red, con el
 * color del nivel y el radio según los milímetros, y lleva el tooltip con el
 * número. Sirve para leer el patrón de un vistazo en vista provincial, donde
 * los caminos son demasiado finos para distinguir un color.
 *
 * Sobre el radio del círculo: va con la raíz cuadrada de los milímetros (ver
 * `radioLluvia`), porque el ojo compara áreas y escalar el radio de forma
 * lineal exageraría los picos. Y va en píxeles, no en metros: el círculo
 * representa un valor, no una superficie. Lo que representa superficie son los
 * caminos, que sí escalan con el zoom porque son geometría real.
 */

import { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import {
  colorLluvia, radioLluvia, clasificar, rangoLluvia, type ResumenConsorcio,
} from '@/lib/lluvia'
import { TEXTO_PROCEDENCIA, RADIO_KM } from '@/lib/fusion'
import { calcularGrilla, curvasDeNivel, nivelesSugeridos } from '@/lib/isohietas'
import { poligonosThiessen } from '@/lib/thiessen'

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

/** Red vial por zona, tal como la sirve `public/geo/geo_cc.json` */
type RedVial = Record<string, {
  type: string
  features: {
    properties: Record<string, unknown>
    geometry: { type: string; coordinates: number[][][] | number[][] }
  }[]
}>

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
  onSeleccionar: (numero: number | null) => void
  estaciones?: EstacionLluvia[]
}

export default function MapaLluvia({ datos, seleccionado, onSeleccionar, estaciones }: Props) {
  const divRef  = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapaRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const capaRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const circulosRef = useRef<Map<number, any>>(new Map())
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const capaRedRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tramosRef = useRef<Map<number, any[]>>(new Map())
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const capaIsoRef = useRef<any>(null)
  const onSelRef = useRef(onSeleccionar)
  onSelRef.current = onSeleccionar

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const capaZonasRef = useRef<any>(null)

  const [verIso, setVerIso] = useState(false)
  const [verZonas, setVerZonas] = useState(false)
  const [verCirculos, setVerCirculos] = useState(true)
  const [verCaminos, setVerCaminos] = useState(true)
  const [niveles, setNiveles] = useState<number[]>([])

  /**
   * La red vial pesa 8,6 MB, así que se trae una sola vez y aparte del primer
   * pintado: el mapa tiene que poder mostrarse antes de que llegue.
   */
  const [red, setRed] = useState<RedVial | null>(null)
  useEffect(() => {
    let vivo = true
    fetch('/geo/geo_cc.json')
      .then(r => r.json())
      .then((j: RedVial) => { if (vivo) setRed(j) })
      .catch(() => { /* sin red vial el mapa sigue sirviendo con los círculos */ })
    return () => { vivo = false }
  }, [])

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
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
      }).addTo(mapa)

      mapaRef.current = mapa
      // Orden de abajo hacia arriba: las isohietas son el fondo, después los
      // caminos, y los círculos arriba de todo para que se puedan clickear.
      capaIsoRef.current   = L.layerGroup().addTo(mapa)
      capaRedRef.current   = L.layerGroup().addTo(mapa)
      // Las zonas de Thiessen van en su propio panel, por debajo del resto. Son
      // polígonos con relleno, así que si compartieran panel se comerían los
      // clics de los círculos de consorcio, que se dibujan después.
      mapa.createPane('zonasThiessen').style.zIndex = '390'
      capaZonasRef.current = L.layerGroup().addTo(mapa)
      capaRef.current      = L.layerGroup().addTo(mapa)

      // El contenedor arranca con alto 0 mientras el layout se acomoda
      setTimeout(() => mapa.invalidateSize(), 120)
    })()

    return () => {
      cancelado = true
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
    if (!capaRedRef.current || !red) return
    let cancelado = false

    ;(async () => {
      const L = (await import('leaflet')).default
      if (cancelado || !capaRedRef.current) return

      capaRedRef.current.clearLayers()
      tramosRef.current.clear()

      for (const zona of Object.values(red)) {
        if (!zona?.features) continue

        for (const f of zona.features) {
          // El bundle trae `CC` como entero, como '07' y como 6.0 según la
          // fila. Los tramos que no son de un consorcio quedan afuera.
          const cc = Number(f.properties?.CC)
          if (!Number.isFinite(cc)) continue

          const esMulti = f.geometry.type === 'MultiLineString'
          const lineas = (esMulti
            ? f.geometry.coordinates
            : [f.geometry.coordinates]) as number[][][]

          for (const linea of lineas) {
            // GeoJSON viene [lng, lat]; Leaflet espera [lat, lng]
            const pts = linea.map(p => [p[1], p[0]] as [number, number])
            if (pts.length < 2) continue

            const tramo = L.polyline(pts, {
              color: '#2a2a2a', weight: 1, opacity: 0.35,
              interactive: false,   // el clic es de los círculos
            })
            tramo.addTo(capaRedRef.current)

            const arr = tramosRef.current.get(cc) ?? []
            arr.push(tramo)
            tramosRef.current.set(cc, arr)
          }
        }
      }
    })()

    return () => { cancelado = true }
  }, [red])

  // ── Recolorear la red cuando cambian los milímetros ──────────────────────
  useEffect(() => {
    if (tramosRef.current.size === 0) return
    const porCC = new Map(datos.map(d => [d.numero, d]))

    for (const [cc, tramos] of tramosRef.current) {
      const d = porCC.get(cc)
      const estilo = d
        ? { color: colorLluvia(d.mm), weight: d.mm > 0 ? 1.6 : 1, opacity: d.mm > 0 ? 0.85 : 0.35 }
        : { color: '#2a2a2a', weight: 1, opacity: 0.35 }
      for (const t of tramos) t.setStyle(estilo)
    }
  }, [datos, red])

  // ── Redibujar los círculos cuando cambian los datos ──────────────────────
  useEffect(() => {
    if (!capaRef.current) return
    let cancelado = false

    ;(async () => {
      const L = (await import('leaflet')).default
      if (cancelado || !capaRef.current) return

      capaRef.current.clearLayers()
      circulosRef.current.clear()

      // Los de más lluvia se dibujan al final para que queden arriba
      const ordenados = [...datos].sort((a, b) => a.mm - b.mm)

      for (const c of ordenados) {
        const nivel = clasificar(c.mm)
        const p = TEXTO_PROCEDENCIA[c.procedencia ?? 'sin_calcular']
        const cerca = c.distanciaKm != null
          ? ` — pluviómetro a ${c.distanciaKm.toLocaleString('es-AR')} km`
          : ''
        const circulo = L.circleMarker([c.lat, c.lng], {
          radius: radioLluvia(c.mm),
          color: '#111',
          weight: 1,
          fillColor: colorLluvia(c.mm),
          fillOpacity: c.mm > 0 ? 0.78 : 0.35,
        })

        circulo.bindTooltip(
          `<div style="font-family:monospace;font-size:12px;line-height:1.5">
             <b style="color:#F5C300">CC N° ${c.numero}</b><br/>
             ${c.nombre.replace(/^Consorcio Caminero N°?\s*\d+\s*/i, '').replace(/"/g, '')}<br/>
             <b style="font-size:14px">${rangoLluvia(c.mm)}</b> acumulados<br/>
             <span style="color:#aaa">Día pico: ${Math.round(c.mmMaxDia)} mm${
               c.fechaMaxDia ? ` (${c.fechaMaxDia.split('-').reverse().join('/')})` : ''
             }</span><br/>
             <span style="color:${nivel.color}">${nivel.label} — ${nivel.nota}</span><br/>
             <span style="color:${p.color};font-size:11px">${p.label}${cerca}</span><br/>
             <span style="color:#666;font-size:11px">${p.nota}</span>
           </div>`,
          { sticky: true, direction: 'top', opacity: 0.96 },
        )

        circulo.on('click', () => onSelRef.current(c.numero))
        circulo.addTo(capaRef.current)
        circulosRef.current.set(c.numero, circulo)
      }
    })()

    return () => { cancelado = true }
  }, [datos])

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
    for (const [capa, visible] of [
      [capaRedRef.current, verCaminos],
      [capaRef.current, verCirculos],
    ] as const) {
      if (!capa) continue
      if (visible && !mapa.hasLayer(capa)) capa.addTo(mapa)
      if (!visible && mapa.hasLayer(capa)) mapa.removeLayer(capa)
    }
  }, [verCaminos, verCirculos, datos, red])

  // ── Resaltar el seleccionado ─────────────────────────────────────────────
  useEffect(() => {
    // Los caminos del consorcio elegido se engrosan; el resto se atenúa, así
    // se ve de una cuál es su red sin tener que adivinar por el color.
    const hay = seleccionado != null
    for (const [numero, tramos] of tramosRef.current) {
      const activo = numero === seleccionado
      for (const t of tramos) {
        t.setStyle({
          weight:  activo ? 3 : 1.6,
          opacity: !hay ? 0.85 : activo ? 1 : 0.25,
        })
      }
    }

    for (const [numero, circulo] of circulosRef.current) {
      const activo = numero === seleccionado
      circulo.setStyle({
        color: activo ? '#F5C300' : '#111',
        weight: activo ? 3 : 1,
      })
      // Con la capa apagada el círculo no está en el mapa y traerlo al frente
      // revienta: Leaflet busca un contenedor que no existe.
      if (activo && verCirculos) circulo.bringToFront()
    }
    if (seleccionado != null && mapaRef.current) {
      const c = datos.find(d => d.numero === seleccionado)
      if (c) mapaRef.current.setView([c.lat, c.lng], Math.max(mapaRef.current.getZoom(), 8))
    }
  }, [seleccionado, datos, verCirculos])

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
          titulo="Círculos por consorcio" activo={verCirculos} onChange={setVerCirculos}
          nota="El acumulado de cada red." />
        <div style={{ height: 7 }} />
        <Interruptor
          titulo="Caminos" activo={verCaminos} onChange={setVerCaminos}
          nota="La red vial, pintada por nivel." />

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
              nota="Curvas de igual lluvia." />

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
      </div>
    </div>
  )
}
