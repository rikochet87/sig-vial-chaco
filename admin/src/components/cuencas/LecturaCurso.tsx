'use client'

/**
 * Qué curso de agua o canal hay bajo el cursor.
 *
 * Las líneas de la hidrografía van en el mapa sin recibir eventos, así que no
 * pueden decir cómo se llaman. Esto lo contesta por afuera de Leaflet, con el
 * índice de `lib/hidrografia.ts`.
 *
 * **Es un componente aparte que escucha el mapa por su cuenta**, igual que
 * `LecturaPunto` y por lo mismo: la posición cambia en cada movimiento, y
 * guardada en el estado del mapa lo volvería a renderizar entero por cada
 * píxel. Calcula una vez por cuadro de pantalla, no por evento.
 *
 * Va arriba, al lado del panel de capas: el pie del mapa y la esquina de los
 * botones de zoom ya son de la lectura del tramo y de la del punto.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { IndiceCursos, rotuloCurso, type CursoAgua } from '@/lib/hidrografia'
import { toleranciaKm } from '@/lib/redFondo'

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mapaRef: RefObject<any>
  listo: boolean
  /** Los que están a la vista: sólo ésos contestan */
  cursos: CursoAgua[]
  /** Cuánto lugar ocupa el panel de capas, para no quedar debajo */
  margenDerecho: number
  colorCurso: string
  colorCanal: string
}

export default function LecturaCurso({ mapaRef, listo, cursos, margenDerecho, colorCurso, colorCanal }: Props) {
  const [curso, setCurso] = useState<CursoAgua | null>(null)
  const cuadroRef = useRef<number | null>(null)
  const indice = useMemo(() => (cursos.length > 0 ? new IndiceCursos(cursos) : null), [cursos])

  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa || !listo || !indice) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const alMover = (e: any) => {
      const { lat, lng } = e.latlng
      if (cuadroRef.current !== null) cancelAnimationFrame(cuadroRef.current)
      cuadroRef.current = requestAnimationFrame(() => {
        cuadroRef.current = null
        setCurso(indice.cursoEn(lat, lng, toleranciaKm(mapa)))
      })
    }
    const alSalir = () => setCurso(null)

    mapa.on('mousemove', alMover)
    mapa.on('mouseout', alSalir)
    return () => {
      mapa.off('mousemove', alMover)
      mapa.off('mouseout', alSalir)
      if (cuadroRef.current !== null) cancelAnimationFrame(cuadroRef.current)
      setCurso(null)
    }
  }, [mapaRef, listo, indice])

  if (!curso || !indice) return null
  const canal = curso.clase === 'canal'

  return (
    <div style={{
      position: 'absolute', top: 10, right: margenDerecho, zIndex: 500,
      background: '#111', border: '1px solid #222',
      borderLeft: `3px solid ${canal ? colorCanal : colorCurso}`,
      borderRadius: 2, boxShadow: '0 4px 16px rgba(0,0,0,.7)',
      padding: '6px 11px', fontFamily: 'monospace', fontSize: 12,
      color: '#c4c4c4', lineHeight: 1.6, maxWidth: 300, pointerEvents: 'none',
    }}>
      <b style={{ color: canal ? colorCanal : colorCurso }}>{rotuloCurso(curso)}</b>
      <div style={{ color: '#8f8f8f', fontSize: 11 }}>
        {canal
          ? `Canal ${curso.tipo === 'Sin clasificar' ? 'sin clasificar' : curso.tipo.toLowerCase()}`
          : curso.permanente ? 'Permanente' : 'No permanente'}
        {'  ·  '}{curso.km.toFixed(1).replace('.', ',')} km este tramo
      </div>
    </div>
  )
}
