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
import { colorLluvia, radioLluvia, clasificar, type ResumenConsorcio } from '@/lib/lluvia'

/** Red vial por zona, tal como la sirve `public/geo/geo_cc.json` */
type RedVial = Record<string, {
  type: string
  features: {
    properties: Record<string, unknown>
    geometry: { type: string; coordinates: number[][][] | number[][] }
  }[]
}>

interface Props {
  datos: ResumenConsorcio[]
  seleccionado: number | null
  onSeleccionar: (numero: number | null) => void
}

export default function MapaLluvia({ datos, seleccionado, onSeleccionar }: Props) {
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
  const onSelRef = useRef(onSeleccionar)
  onSelRef.current = onSeleccionar

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
      // La red va primero para que los círculos queden por encima
      capaRedRef.current = L.layerGroup().addTo(mapa)
      capaRef.current    = L.layerGroup().addTo(mapa)

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
             <b style="font-size:14px">${c.mm.toLocaleString('es-AR')} mm</b> acumulados<br/>
             <span style="color:#aaa">Día pico: ${c.mmMaxDia.toLocaleString('es-AR')} mm${
               c.fechaMaxDia ? ` (${c.fechaMaxDia.split('-').reverse().join('/')})` : ''
             }</span><br/>
             <span style="color:${nivel.color}">${nivel.label} — ${nivel.nota}</span>
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
      if (activo) circulo.bringToFront()
    }
    if (seleccionado != null && mapaRef.current) {
      const c = datos.find(d => d.numero === seleccionado)
      if (c) mapaRef.current.setView([c.lat, c.lng], Math.max(mapaRef.current.getZoom(), 8))
    }
  }, [seleccionado, datos])

  return <div ref={divRef} style={{ width: '100%', height: '100%', background: '#111' }} />
}
