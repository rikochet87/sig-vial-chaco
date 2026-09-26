'use client'

/**
 * Compara los métodos de cálculo de la lámina areal y muestra de dónde sale cada
 * milímetro.
 *
 * El número que manda en la pantalla sigue siendo el de IDW. Esto está para dos
 * cosas concretas:
 *
 * - **Poder citar el método de manual.** «Precipitación media areal por
 *   polígonos de Thiessen» con la tabla de pesos al lado se defiende ante
 *   cualquiera; IDW hay que explicarlo. Si el número va a un expediente,
 *   conviene tener los dos.
 * - **Control cruzado.** Si Thiessen e IDW dan parecido, el número está firme.
 *   Si difieren mucho en un consorcio, eso mismo es información: significa que
 *   la cobertura ahí es pobre o que la traza está partida entre zonas con
 *   láminas muy distintas.
 *
 * Va plegado por omisión y ocupa un renglón cerrado. La pantalla ya es larga y
 * esto es una segunda lectura, no el dato principal.
 */

import { useState } from 'react'
import type { MediaAreal } from '@/lib/thiessenAreal'

const mono = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' } as const

interface Props {
  /** Lámina por IDW: la que muestra el resto de la pantalla */
  mmIdw: number | null
  /** Thiessen pesado por longitud de red */
  porLongitud: MediaAreal | null
  /**
   * Thiessen pesado por superficie — el método tradicional.
   *
   * Sólo llega con valor a nivel provincia. A nivel consorcio va en `null` y el
   * panel explica por qué, en vez de mostrar un guión sin motivo.
   */
  porSuperficie?: MediaAreal | null
  /** Qué se está promediando, para el encabezado */
  ambito: string
}

const nMm = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : v.toFixed(1).replace('.', ',')

const nPeso = (v: number, unidad: string) =>
  `${v.toLocaleString('es-AR', { maximumFractionDigits: unidad === 'km²' ? 0 : 1 })} ${unidad}`

export default function PanelMediaAreal({ mmIdw, porLongitud, porSuperficie, ambito }: Props) {
  const [abierto, setAbierto] = useState(false)
  if (!porLongitud) return null

  const thL = porLongitud.mm
  const thS = porSuperficie?.mm ?? null
  const dif = mmIdw !== null && thL !== null ? thL - mmIdw : null

  return (
    <div style={{ ...mono, border: '1px solid #1e1e1e', background: '#191919', marginTop: 8 }}>
      <button onClick={() => setAbierto(a => !a)} style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
        padding: '7px 12px', cursor: 'pointer', background: 'transparent', border: 'none',
        ...mono, fontSize: 12, color: '#999',
      }}>
        <span style={{ color: '#555' }}>{abierto ? '▾' : '▸'}</span>
        <span style={{ flex: 1 }}>
          Comparar métodos — IDW <b style={{ color: '#ccc' }}>{nMm(mmIdw)}</b>
          {' · '}Thiessen por red <b style={{ color: '#ccc' }}>{nMm(thL)}</b>
          {thS !== null && <> · Thiessen areal <b style={{ color: '#ccc' }}>{nMm(thS)}</b></>}
          {' mm'}
        </span>
        {dif !== null && Math.abs(dif) >= 0.05 && (
          <span style={{ color: Math.abs(dif) > 5 ? '#E8833A' : '#555' }}>
            {dif > 0 ? '+' : ''}{dif.toFixed(1).replace('.', ',')}
          </span>
        )}
      </button>

      {abierto && (
        <div style={{ padding: '2px 12px 12px', fontSize: 12, color: '#777', lineHeight: 1.65 }}>
          <div style={{ color: '#555', marginBottom: 8 }}>
            Lámina areal sobre {ambito}, por tres caminos distintos.
          </div>

          <Fila
            nombre="IDW² radio 60 km"
            valor={nMm(mmIdw)}
            nota="El que muestra la pantalla. Estima punto por punto promediando todos los pluviómetros del radio, pesados por 1/d²."
            principal
          />
          <Fila
            nombre="Thiessen · peso por red"
            valor={nMm(thL)}
            nota={`Cada pluviómetro pesa los kilómetros de camino que caen en su zona. ${
              porLongitud.aportes.length} estación(es) sobre ${nPeso(porLongitud.pesoTotal, 'km')}.`}
          />
          {porSuperficie
            ? <Fila
                nombre="Thiessen · peso por superficie"
                valor={nMm(thS)}
                nota={`El método tradicional: cada pluviómetro pesa el área de su zona. ${
                  porSuperficie.aportes.length} estación(es) sobre ${nPeso(porSuperficie.pesoTotal, 'km²')}.`}
              />
            : <div style={{ color: '#555', margin: '6px 0 2px', paddingLeft: 2 }}>
                El peso por superficie no se calcula por consorcio: los consorcios no tienen
                polígono de límites, sólo la traza de su red. Está disponible a nivel provincia.
              </div>}

          {porLongitud.cobertura < 0.999 && (
            <div style={{ color: '#E8833A', marginTop: 8 }}>
              Cubre el {(porLongitud.cobertura * 100).toFixed(1).replace('.', ',')} % de la red.
              El resto no tiene pluviómetro a menos de 60 km y queda afuera del promedio —
              no se cuenta como 0 mm.
            </div>
          )}

          <div style={{ color: '#555', marginTop: 10, marginBottom: 4 }}>
            De dónde sale el número de Thiessen por red
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ color: '#555' }}>
                <th style={th}>Pluviómetro</th>
                <th style={{ ...th, textAlign: 'right' }}>Lámina</th>
                <th style={{ ...th, textAlign: 'right' }}>Red</th>
                <th style={{ ...th, textAlign: 'right' }}>Peso</th>
              </tr>
            </thead>
            <tbody>
              {porLongitud.aportes.slice(0, 12).map(a => (
                <tr key={a.indice} style={{ borderTop: '1px solid #141414' }}>
                  <td style={{ ...td, color: '#999' }}>{a.nombre}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{a.mm.toFixed(1).replace('.', ',')} mm</td>
                  <td style={{ ...td, textAlign: 'right' }}>{nPeso(a.peso, 'km')}</td>
                  <td style={{ ...td, textAlign: 'right', color: '#ccc' }}>
                    {(a.fraccion * 100).toFixed(1).replace('.', ',')} %
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {porLongitud.aportes.length > 12 && (
            <div style={{ color: '#555', marginTop: 6 }}>
              … y {porLongitud.aportes.length - 12} pluviómetro(s) más, con menos peso.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const th = { textAlign: 'left' as const, fontWeight: 400, padding: '3px 0' }
const td = { padding: '3px 0' }

function Fila({ nombre, valor, nota, principal }: {
  nombre: string; valor: string; nota: string; principal?: boolean
}) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', margin: '6px 0' }}>
      <span style={{ width: 210, flexShrink: 0, color: principal ? '#F5C300' : '#999' }}>{nombre}</span>
      <span style={{ width: 62, flexShrink: 0, textAlign: 'right',
        color: principal ? '#F5C300' : '#ccc', fontWeight: 700 }}>{valor} mm</span>
      <span style={{ color: '#555', flex: 1, minWidth: 0 }}>{nota}</span>
    </div>
  )
}
