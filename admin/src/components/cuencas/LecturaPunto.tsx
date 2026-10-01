'use client'

/**
 * La lluvia en el punto que está bajo el cursor, con la capa de cuencas
 * prendida.
 *
 * ── Qué muestra ───────────────────────────────────────────────────────────────
 *
 * Los milímetros en ese punto exacto, de qué pluviómetros sale, en qué cuenca
 * cae y cuánto se aparta de la lámina media de esa cuenca. La tabla de cuencas
 * da un número por cuenca; esto es ese número antes de promediar.
 *
 * ── Por qué es un componente aparte y escucha el mapa por su cuenta ───────────
 *
 * La posición del cursor cambia en cada movimiento. Guardada en el estado de
 * `MapaLluvia`, cada píxel que se mueve el mouse volvería a renderizar el mapa
 * entero —mil líneas, el panel de capas, las leyendas—. Acá el estado es de
 * este recuadro y nada más se entera.
 *
 * Igual que la lectura del tramo, se resuelve **por afuera de Leaflet**: las
 * cuencas son `interactive: false` y no reciben el cursor, así que se escucha
 * `mousemove` a nivel mapa y se pregunta con la coordenada.
 *
 * Un cálculo por cuadro de pantalla y no por evento: el mouse dispara más
 * eventos de los que se pueden dibujar.
 */

import { useEffect, useRef, useState, type RefObject } from 'react'
import { RADIO_KM } from '@/lib/fusion'
import type { Cuenca } from '@/lib/cuencas'
import { leerPunto, type LaminaCuenca, type LecturaPunto as Lectura } from '@/lib/lluviaCuencas'
import type { MedicionConNombre } from '@/lib/thiessenAreal'

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mapaRef: RefObject<any>
  /** El mapa ya existe: sin esto el efecto correría antes de que haya a qué suscribirse */
  listo: boolean
  /** Sólo con la capa de cuencas prendida */
  activo: boolean
  /** Hay un tramo bajo el cursor y su lectura ocupa el lugar */
  tapado: boolean
  estaciones: MedicionConNombre[]
  cuencas: Cuenca[]
  /** La lámina del período por cuenca; `null` mientras no se calculó */
  laminas: LaminaCuenca[] | null
  /** Con el satélite el pie del mapa es del deslizador: la lectura va arriba */
  arriba: boolean
  color: (mm: number) => string
}

const n1 = (v: number) => v.toFixed(1).replace('.', ',')
/** El Chaco está al sur y al oeste: el signo se dice con la letra */
const grados = (v: number) => Math.abs(v).toFixed(4).replace('.', ',')

export default function LecturaPunto({
  mapaRef, listo, activo, tapado, estaciones, cuencas, laminas, arriba, color,
}: Props) {
  const [punto, setPunto] = useState<{ lat: number; lng: number } | null>(null)
  const cuadroRef = useRef<number | null>(null)

  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa || !listo || !activo) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const alMover = (e: any) => {
      const { lat, lng } = e.latlng
      if (cuadroRef.current !== null) cancelAnimationFrame(cuadroRef.current)
      cuadroRef.current = requestAnimationFrame(() => {
        cuadroRef.current = null
        setPunto({ lat, lng })
      })
    }
    const alSalir = () => setPunto(null)

    mapa.on('mousemove', alMover)
    mapa.on('mouseout', alSalir)
    return () => {
      mapa.off('mousemove', alMover)
      mapa.off('mouseout', alSalir)
      if (cuadroRef.current !== null) cancelAnimationFrame(cuadroRef.current)
      setPunto(null)
    }
  }, [mapaRef, listo, activo])

  if (!activo || tapado || !punto || cuencas.length === 0) return null

  const l: Lectura = leerPunto(punto.lat, punto.lng, estaciones, cuencas, laminas)
  const dif = l.mm !== null && l.lamina?.mm != null ? l.mm - l.lamina.mm : null

  return (
    <div style={{
      position: 'absolute', left: arriba ? 56 : 10,
      ...(arriba ? { top: 10 } : { bottom: 10 }), zIndex: 500,
      background: '#111', border: '1px solid #222', borderLeft: '3px solid #C9A0DC',
      borderRadius: 2, boxShadow: '0 4px 16px rgba(0,0,0,.7)',
      padding: '7px 11px', fontFamily: 'monospace', fontSize: 12,
      color: '#c4c4c4', lineHeight: 1.6, maxWidth: 440, pointerEvents: 'none',
    }}>
      {l.cuenca ? (
        <>
          <span style={{ color: '#8f8f8f' }}>Cuenca {l.cuenca.cod}{'  ·  '}</span>
          <b style={{ color: '#C9A0DC' }}>{l.cuenca.nombre}</b>
        </>
      ) : (
        <span style={{ color: '#8f8f8f' }}>Fuera de las cuencas</span>
      )}

      <div style={{ color: '#8f8f8f', fontSize: 11 }}>
        {grados(punto.lat)}° S{'  ·  '}{grados(punto.lng)}° O
      </div>

      <div style={{ marginTop: 2 }}>
        {estaciones.length === 0 ? (
          <span style={{ color: '#8f8f8f' }}>Sin mediciones de pluviómetros en el período</span>
        ) : l.mm === null ? (
          <span style={{ color: '#8f8f8f' }}>
            Sin pluviómetro a menos de {RADIO_KM} km — no hay dato
          </span>
        ) : (
          <>
            <b style={{ color: color(l.mm) }}>{n1(l.mm)} mm</b>
            <span style={{ color: '#8f8f8f' }}>
              {'  en este punto  ·  '}
              {l.medido
                ? 'medido en el pluviómetro'
                : `${l.estaciones} pluviómetro${l.estaciones === 1 ? '' : 's'} a menos de ${RADIO_KM} km`}
            </span>
          </>
        )}
      </div>

      {l.cercano && (
        <div style={{ color: '#8f8f8f', fontSize: 11 }}>
          El más cercano: <span style={{ color: '#c4c4c4' }}>{l.cercano.nombre}</span>
          {' a '}{n1(l.cercano.km)} km, {n1(l.cercano.mm)} mm
        </div>
      )}

      {l.cuenca && l.lamina?.mm != null && (
        <div style={{ color: '#8f8f8f', fontSize: 11 }}>
          Lámina media de la cuenca:{' '}
          <span style={{ color: '#c4c4c4' }}>{n1(l.lamina.mm)} mm</span>
          {dif !== null && Math.abs(dif) >= 0.05 && (
            <> · este punto, {n1(Math.abs(dif))} mm {dif > 0 ? 'por encima' : 'por debajo'}</>
          )}
        </div>
      )}
    </div>
  )
}
