'use client'

/**
 * La lista de cuencas que va al lado del mapa.
 *
 * Es la contraparte de la lista de consorcios: mismas filas, mismo gesto. Elegir
 * una cuenca la resalta y la encuadra en el mapa, que es lo que faltaba — la
 * tabla de cuencas vivía en otra parte de la pantalla y tocarla no hacía nada
 * sobre el mapa.
 *
 * Muestra poco a propósito: la lámina, la superficie y la cobertura. El resto
 * —Thiessen, volumen, máximas, red vial— está en la pestaña Cuencas, y hay un
 * enlace para ir.
 */

import { clasificar, rangoLluvia } from '@/lib/lluvia'
import { RADIO_KM } from '@/lib/fusion'
import type { CuencasConLluvia } from '@/hooks/useCuencasLluvia'
import { boton, mono, nKm2, nPct } from './piezas'

interface Props {
  datos: CuencasConLluvia
  /** Si hay mediciones de la APA en el período: sin ellas no hay lámina */
  hayMediciones: boolean
  elegida: number | null
  onElegir: (cod: number | null) => void
  /** Ir a la pestaña Cuencas */
  onVerTabla: () => void
}

const aviso = { padding: 16, ...mono, fontSize: 13, color: '#a0a0a0', lineHeight: 1.6 } as const

export default function ListaCuencas({ datos, hayMediciones, elegida, onElegir, onVerTabla }: Props) {
  const { cuencas, filas, error, reintentar } = datos

  if (error) {
    return (
      <div style={{ ...aviso, color: '#E8A87C' }}>
        No se pudieron cargar las cuencas ({error}).
        <div style={{ marginTop: 8 }}>
          <button onClick={reintentar} style={{ ...boton, marginLeft: 0 }}>Reintentar</button>
        </div>
      </div>
    )
  }
  if (!cuencas) return <div style={aviso}>Cargando las cuencas…</div>

  // Sin mediciones se listan igual: elegir una cuenca para verla en el mapa no
  // depende de que haya llovido.
  const lista = filas
    ? [...filas].sort((a, b) => (b.mm ?? -1) - (a.mm ?? -1) || a.cod - b.cod)
    : cuencas.map(c => ({ cod: c.cod, nombre: c.nombre, km2: c.ha / 100, mm: null, cobertura: 0 }))

  return (
    <>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {!hayMediciones && (
          <div style={{ ...aviso, fontSize: 12, padding: '10px 12px', borderBottom: '1px solid #141414' }}>
            Sin mediciones de la APA en el período: no hay lámina por cuenca. Igual podés
            elegir una para verla en el mapa.
          </div>
        )}

        {lista.map(c => {
          const activa = c.cod === elegida
          const nivel = c.mm === null ? null : clasificar(c.mm)
          const parcial = c.mm !== null && c.cobertura < 0.9995
          return (
            <button key={c.cod} onClick={() => onElegir(activa ? null : c.cod)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                padding: '8px 12px', cursor: 'pointer', ...mono,
                background: activa ? 'rgba(245,195,0,0.07)' : 'transparent',
                border: 'none', borderBottom: '1px solid #141414',
                borderLeft: `3px solid ${activa ? '#F5C300' : 'transparent'}`,
              }}>
              {/* Cuadrado, no círculo: la cuenca es una superficie, el consorcio un punto */}
              <span style={{ width: 12, height: 12, background: nivel?.color ?? '#333',
                border: '1px solid #111', flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 12, color: '#a8a8a8',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <b style={{ color: '#ccc' }}>{c.cod}</b>{' · '}{c.nombre}
                </span>
                <span style={{ display: 'block', fontSize: 11, color: '#8f8f8f', marginTop: 1 }}>
                  {nKm2(c.km2)} km²
                  {parcial && (
                    <span style={{ color: '#E8833A' }}
                      title={`Sólo esa parte de la cuenca tiene un pluviómetro a menos de ${RADIO_KM} km`}>
                      {' '}· cobertura {nPct(c.cobertura)} %
                    </span>
                  )}
                </span>
              </span>
              <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                {nivel && c.mm !== null ? (<>
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: nivel.color }}>
                    {nivel.label}
                  </span>
                  <span style={{ display: 'block', fontSize: 12, color: '#a0a0a0', marginTop: 1 }}>
                    {rangoLluvia(c.mm)}
                  </span>
                </>) : (
                  <span style={{ fontSize: 12, color: '#8f8f8f' }}>{hayMediciones ? 'sin dato' : '—'}</span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      <button onClick={onVerTabla} style={{
        ...mono, flexShrink: 0, fontSize: 12, padding: '9px 12px', cursor: 'pointer', textAlign: 'left',
        background: 'transparent', border: 'none', borderTop: '1px solid #1e1e1e', color: '#F5C300',
        letterSpacing: 0.8, textTransform: 'uppercase',
      }}>
        Volumen, máximas y red vial por cuenca →
      </button>
    </>
  )
}
