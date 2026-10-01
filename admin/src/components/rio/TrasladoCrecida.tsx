'use client'

/**
 * Cuánto tarda la crecida en recorrer el tramo.
 *
 * Una fila por estación, de aguas arriba hacia abajo, con el desfase respecto
 * de Corrientes medido de las dos maneras de `lib/rioTraslado.ts`. Corrientes
 * va en la tabla como referencia, en cero, para que se lea el recorrido entero
 * de un vistazo.
 *
 * ── La columna de barras ──────────────────────────────────────────────────────
 *
 * Es la correlación de las variaciones diarias para cada desfase probado. Está
 * para que el número de al lado se pueda creer: una cima nítida en un día dice
 * que el desfase está bien determinado; una loma ancha, que es aproximado. Las
 * cinco comparten escala, así que se ve también cuál correlaciona menos.
 */

import { useEffect, useMemo, useState } from 'react'
import { ESTACIONES } from '@/lib/ina'
import {
  trasladoDelTramo, ESTACION_REFERENCIA, DESFASE_MIN, DESFASE_MAX, VENTANA_PICO_DIAS,
  type TramoDiario, type TrasladoEstacion,
} from '@/lib/rioTraslado'
import { mono, boton, th, thD, td, tdD } from '@/components/cuencas/piezas'

const n1 = (v: number) => v.toFixed(1).replace('.', ',')
const fLarga = (f: string) => f.slice(0, 10).split('-').reverse().join('/')

/** «2 días antes», «el mismo día», «3 días después» */
function enPalabras(dias: number): string {
  const d = Math.round(dias)
  if (d === 0) return 'el mismo día'
  const n = Math.abs(d)
  return `${n} día${n === 1 ? '' : 's'} ${d < 0 ? 'antes' : 'después'}`
}

/** Días enteros con signo: «−4», «0», «+3» */
const entero = (d: number) => (d === 0 ? '0' : `${d < 0 ? '−' : '+'}${Math.abs(d)}`)

/** Con signo y un decimal: «−1,8», «+0,5» */
const conSigno = (v: number) =>
  Math.abs(v) < 0.05 ? '0,0' : `${v < 0 ? '−' : '+'}${n1(Math.abs(v))}`

export default function TrasladoCrecida() {
  const [tramo, setTramo] = useState<TramoDiario | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    let vivo = true
    fetch('/rio/tramo_diario.json')
      .then(r => {
        if (!r.ok) throw new Error(`el servidor respondió ${r.status}`)
        return r.json() as Promise<TramoDiario>
      })
      .then(j => {
        if (!vivo) return
        if (!j?.estaciones || typeof j.desde !== 'string') throw new Error('el archivo no tiene la forma esperada')
        setTramo(j)
        setError(null)
      })
      .catch(e => { if (vivo) setError(e instanceof Error ? e.message : 'no se pudo leer') })
    return () => { vivo = false }
  }, [intento])

  const traslado = useMemo(() => (tramo ? trasladoDelTramo(tramo) : []), [tramo])

  if (error) {
    return (
      <div style={{ ...mono, fontSize: 12, color: '#E8A87C', border: '1px solid #7a4a22',
        background: 'rgba(40,24,16,.5)', borderLeft: '3px solid #E8833A', borderRadius: 2,
        padding: '8px 12px', marginTop: 8 }}>
        <b>No se pudo cargar el registro del tramo.</b> {error}
        <button onClick={() => setIntento(i => i + 1)} style={{ ...boton, marginLeft: 10 }}>
          Reintentar
        </button>
      </div>
    )
  }

  if (!tramo) {
    return (
      <div style={{ ...mono, fontSize: 12, color: '#8f8f8f', marginTop: 8 }}>
        Cargando el registro del tramo…
      </div>
    )
  }

  const de = (id: number) => traslado.find(t => t.estacion === id)
  const arriba = ESTACIONES[0]
  const abajo = ESTACIONES[ESTACIONES.length - 1]
  const tArriba = de(arriba.id)?.picos
  const tAbajo = de(abajo.id)?.picos
  const rMax = Math.max(0.01, ...traslado.map(t => t.cambios?.r ?? 0))

  return (
    <div className="sv-panel" style={{ ...mono, border: '1px solid #1e1e1e', background: '#191919',
      borderLeft: '3px solid #F5C300', marginTop: 8, padding: '10px 12px 12px' }}>

      <div style={{ fontSize: 12, color: '#ddd', textTransform: 'uppercase', letterSpacing: 1.2 }}>
        Traslado de la crecida en el tramo
      </div>
      <div style={{ fontSize: 11, color: '#8f8f8f', lineHeight: 1.5, marginTop: 4 }}>
        Cuánto antes o después que en Corrientes se mueve el río en cada estación. Altura media
        diaria, {fLarga(tramo.desde)} a {fLarga(tramo.hasta)}.
      </div>

      {tArriba && tAbajo && (
        <div style={{ fontSize: 12, color: '#c4c4c4', lineHeight: 1.6, marginTop: 10,
          borderLeft: '3px solid #85B7EB', paddingLeft: 9 }}>
          El máximo de una crecida pasa por <b>{arriba.nombre}</b> {enPalabras(tArriba.mediana)} que
          por Corrientes y Barranqueras, y por <b>{abajo.nombre}</b> {enPalabras(tAbajo.mediana)}.
        </div>
      )}

      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', color: '#c4c4c4', marginTop: 12 }}>
        <thead>
          <tr style={{ color: '#8f8f8f', fontSize: 11 }}>
            <th style={th}>Estación</th>
            <th style={thD}>Pico anual</th>
            <th style={thD}>Entre</th>
            <th style={thD}>Años</th>
            <th style={thD}>Variaciones diarias</th>
            <th style={thD}>Correlación</th>
            <th style={{ ...th, paddingLeft: 16 }}>
              Correlación por desfase, de {DESFASE_MIN} a +{DESFASE_MAX} días
            </th>
          </tr>
        </thead>
        <tbody>
          {ESTACIONES.map(e => {
            if (e.id === ESTACION_REFERENCIA) {
              return (
                <tr key={e.id} style={{ borderTop: '1px solid #232323', color: '#8f8f8f' }}>
                  <td style={td}>{e.nombre}</td>
                  <td style={tdD}>referencia</td>
                  <td style={tdD} /><td style={tdD} /><td style={tdD} /><td style={tdD} />
                  <td />
                </tr>
              )
            }
            const t = de(e.id)
            if (!t) return null
            return (
              <tr key={e.id} style={{ borderTop: '1px solid #232323' }}>
                <td style={td}>{e.nombre}</td>
                <td style={{ ...tdD, color: '#fff' }}>{t.picos ? enPalabras(t.picos.mediana) : '—'}</td>
                <td style={{ ...tdD, color: '#a0a0a0' }}>
                  {t.picos ? `${entero(t.picos.p25)} y ${entero(t.picos.p75)}` : ''}
                </td>
                <td style={{ ...tdD, color: '#a0a0a0' }}>
                  {t.picos ? `${t.picos.usados} de ${t.picos.anios}` : ''}
                </td>
                <td style={tdD}>{t.cambios ? `${conSigno(t.cambios.dias)} d` : '—'}</td>
                <td style={{ ...tdD, color: '#a0a0a0' }}>
                  {t.cambios ? t.cambios.r.toFixed(2).replace('.', ',') : ''}
                </td>
                <td style={{ paddingLeft: 16, width: '34%' }}>
                  {t.cambios && <Curva t={t} rMax={rMax} nombre={e.nombre} />}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div style={{ fontSize: 11, color: '#8f8f8f', marginTop: 10, lineHeight: 1.5,
        borderTop: '1px solid #232323', paddingTop: 9 }}>
        <b style={{ color: '#a0a0a0' }}>Pico anual</b> es la diferencia entre las fechas del máximo de
        cada año hidrológico: la mediana y entre qué valores cae la mitad de los años. Es el que
        vale para una crecida. <b style={{ color: '#a0a0a0' }}>Variaciones diarias</b> es el desfase
        que mejor alinea lo que el río sube o baja cada día en las dos estaciones; describe un
        cambio cualquiera, y da menos porque la cresta de una crecida es chata y se demora más.
        Se dejan afuera los años en que los dos picos caen a más de {VENTANA_PICO_DIAS} días: son
        crecidas distintas. <b style={{ color: '#a0a0a0' }}>Entre {arriba.nombre} y Corrientes entra
        el río Paraguay</b>, así que una crecida que venga por el Paraguay no se anuncia en{' '}
        {arriba.nombre}. La serie es diaria: el desfase se conoce al medio día, no más. Es cuándo
        llega, no a cuánto. Fuente: {tramo.fuente}.
      </div>
    </div>
  )
}

/**
 * La correlación de cada desfase, como barras desde cero.
 *
 * Las negativas no se dibujan: una correlación negativa a tres días del máximo
 * no dice nada del traslado y sólo agregaría barras hacia abajo. El desfase
 * cero va marcado con una línea para que se lea de qué lado cae la cima.
 */
function Curva({ t, rMax, nombre }: { t: TrasladoEstacion; rMax: number; nombre: string }) {
  const ALTO = 22
  const curva = t.cambios!.curva
  const paso = 100 / curva.length
  const cero = (0 - DESFASE_MIN + 0.5) * paso

  return (
    <svg viewBox={`0 0 100 ${ALTO}`} preserveAspectRatio="none" role="img"
      aria-label={`Correlación por desfase entre Corrientes y ${nombre}: máxima a ${t.cambios!.k} días`}
      style={{ width: '100%', height: 22, display: 'block' }}>
      <line x1={cero} x2={cero} y1={0} y2={ALTO} stroke="#3a3a3a" strokeWidth={1}
        vectorEffect="non-scaling-stroke" />
      {curva.map((c, i) => {
        const h = Math.max(0, c.r / rMax) * (ALTO - 1)
        return (
          <rect key={c.k} x={i * paso + paso * 0.14} width={paso * 0.72}
            y={ALTO - h} height={h}
            fill={c.k === t.cambios!.k ? '#F5C300' : '#7d7d7d'} />
        )
      })}
    </svg>
  )
}
