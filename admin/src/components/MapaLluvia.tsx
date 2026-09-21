'use client'
/**
 * Mapa de precipitaciones: un círculo por consorcio, con el color según el nivel
 * y el radio según los milímetros.
 *
 * Círculos proporcionales y no polígonos coloreados porque el panel no tiene la
 * geometría de los consorcios — tiene la red vial por zona y la sede como punto.
 * Con el círculo en la sede alcanza para leer el patrón espacial, que es lo que
 * importa: dónde pegó la tormenta.
 *
 * El radio va con la raíz cuadrada de los milímetros (ver `radioLluvia`): el ojo
 * compara áreas, así que escalar el radio de forma lineal exageraría los picos.
 */

import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'
import { colorLluvia, radioLluvia, clasificar, type ResumenConsorcio } from '@/lib/lluvia'

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
  const onSelRef = useRef(onSeleccionar)
  onSelRef.current = onSeleccionar

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
      capaRef.current = L.layerGroup().addTo(mapa)

      // El contenedor arranca con alto 0 mientras el layout se acomoda
      setTimeout(() => mapa.invalidateSize(), 120)
    })()

    return () => {
      cancelado = true
      if (mapaRef.current) { mapaRef.current.remove(); mapaRef.current = null }
    }
  }, [])

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
