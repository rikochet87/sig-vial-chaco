'use client'
/**
 * La red vial de fondo en los mapas de cálculo, más su recuadro de lectura.
 *
 * Son dos piezas que van juntas y por eso viven en el mismo archivo:
 *
 * - {@link useRedFondo} monta la capa —inerte, en su propio panel— y escucha el
 *   `mousemove` **del mapa** para resolver qué tramo hay bajo el cursor.
 * - {@link LecturaTramo} lo muestra.
 *
 * El `mousemove` va a nivel mapa a propósito. Un `bindTooltip` sobre la
 * polilínea sería más corto de escribir, pero vuelve interactiva a la capa, y
 * entonces al marcar un vértice encima de un camino el clic se lo come la red en
 * vez de llegar al dibujo. Que es exactamente lo que había que arreglar.
 */

import { useEffect, useRef, useState } from 'react'
import { cargarRedFondo, toleranciaKm, type RedFondo, type TramoInfo } from '@/lib/redFondo'

/**
 * Monta la red de fondo en un mapa de Leaflet y devuelve el tramo bajo el
 * cursor.
 *
 * Recibe **la ref del mapa, no el mapa**, y la lee adentro del efecto. Antes los
 * cuatro llamadores hacían `useRedFondo(mapReady ? mapRef.current : null, …)`,
 * o sea leían `.current` durante el render: funcionaba de casualidad porque
 * `mapReady` se pone justo después de asignar la ref y eso provoca el re-render,
 * pero React no rastrea las refs. Si el mapa cambiara sin que cambie ningún
 * estado, el hook no se enteraría.
 *
 * @param mapaRef  ref al mapa de Leaflet
 * @param listo    si el mapa ya existe — es lo que dispara el re-render
 * @param activa   permite apagar la capa sin desmontar el componente
 */
export function useRedFondo(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mapaRef: { current: any },
  listo: boolean,
  activa: boolean,
) {
  const [tramo, setTramo] = useState<TramoInfo | null>(null)
  const redRef = useRef<RedFondo | null>(null)

  useEffect(() => {
    const map = listo ? mapaRef.current : null
    if (!map) return
    let vivo = true

    if (!activa) {
      redRef.current?.desmontar(map)
      setTramo(null)
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let alMover: ((e: any) => void) | null = null

    ;(async () => {
      const [Lf, red] = await Promise.all([
        import('leaflet').then(m => m.default),
        cargarRedFondo(),
      ])
      // Sin la red el mapa sigue sirviendo para dibujar, que es lo que importa
      if (!vivo || !map.getPane) return

      redRef.current = red
      red.montar(Lf, map)

      alMover = e => setTramo(red.tramoEn(e.latlng, toleranciaKm(map)))
      map.on('mousemove', alMover)
      map.on('mouseout', () => setTramo(null))
    })().catch(() => { /* se ignora a propósito */ })

    return () => {
      vivo = false
      if (alMover) map.off('mousemove', alMover)
      redRef.current?.desmontar(map)
    }
  }, [mapaRef, listo, activa])

  return tramo
}

const mono = { fontFamily: 'monospace' as const }

/**
 * El recuadro con los datos del tramo, y el interruptor de la capa.
 *
 * Se reserva el alto aunque no haya nada debajo del cursor, para que el mapa no
 * salte cada vez que uno entra y sale de un camino.
 *
 * El recuadro entero es `pointerEvents: none` salvo la casilla: es un cartel
 * flotando sobre el mapa, y si atajara el mouse volveríamos al problema que
 * esto vino a resolver — un clic que no llega al dibujo.
 */
export function LecturaTramo({ tramo, activa, onActiva }: {
  tramo: TramoInfo | null
  activa: boolean
  onActiva: (v: boolean) => void
}) {
  return (
    <div style={{
      ...mono, pointerEvents: 'none',
      background: 'rgba(12,14,17,.92)', border: '1px solid #2b323a',
      borderRadius: 3, padding: '6px 11px', minWidth: activa ? 230 : 0,
    }}>
      <label style={{
        display: 'flex', alignItems: 'center', gap: 7,
        pointerEvents: 'auto', cursor: 'pointer', width: 'fit-content',
      }}>
        <input type="checkbox" checked={activa} onChange={e => onActiva(e.target.checked)}
          style={{ width: 13, height: 13, accentColor: '#8fd0ff', cursor: 'pointer' }} />
        <span style={{ fontSize: 11, color: '#7b848e', textTransform: 'uppercase',
          letterSpacing: 0.8 }}>
          Red vial
        </span>
      </label>

      {activa && (
        <div style={{ marginTop: 5, borderTop: '1px solid #232a31', paddingTop: 5 }}>
          {tramo ? (
            <>
              <div style={{ fontSize: 13, color: '#fff', lineHeight: 1.4 }}>
                <b style={{ color: '#8fd0ff' }}>{tramo.designacion}</b>
                {tramo.cc !== null && <span style={{ color: '#c8c8c8' }}> · CC N° {tramo.cc}</span>}
              </div>
              <div style={{ fontSize: 12, color: '#9aa3ad', marginTop: 2 }}>
                {[tramo.jurisdiccion, tramo.material, tramo.zona].filter(Boolean).join(' · ') || '—'}
              </div>
              {tramo.codigo && (
                <div style={{ fontSize: 11, color: '#666e77', marginTop: 2 }}>
                  {tramo.codigo}
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 12, color: '#6d757e', lineHeight: 1.4 }}>
              Pasá el cursor sobre un camino para ver sus datos.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
