'use client'

/**
 * Cuánto tarda la crecida en recorrer el tramo.
 *
 * Una fila por escala del Paraná, de Posadas a Goya, con el desfase respecto
 * de **Barranqueras** medido de las dos maneras de `lib/rioTraslado.ts`.
 * Barranqueras va en la tabla como referencia, en cero, para que se lea el
 * recorrido entero de un vistazo; Corrientes, enfrente, va como control.
 * Debajo, los afluentes: el Paraguay y el Bermejo, a los que se les mide el
 * aporte y no el traslado.
 *
 * ── La columna de barras ──────────────────────────────────────────────────────
 *
 * Es la correlación de las variaciones diarias para cada desfase probado. Está
 * para que el número de al lado se pueda creer: una cima nítida en un día dice
 * que el desfase está bien determinado; una loma ancha, que es aproximado. Las
 * cinco comparten escala, así que se ve también cuál correlaciona menos.
 */

import { useMemo, useState } from 'react'
import { ESCALAS_PARANA, ESTACIONES_PARAGUAY, ESTACION_BERMEJO } from '@/lib/ina'
import {
  trasladoDelTramo, trasladoDelParaguay, trasladoDelBermejo,
  ESTACION_REFERENCIA, ESTACION_CONTROL, ESTACION_ARRIBA, DESFASE_MIN, DESFASE_MAX,
  VENTANA_PICO_DIAS, VENTANA_APORTE_DIAS,
  type TrasladoEstacion, type TrasladoParaguay,
} from '@/lib/rioTraslado'
import { useTramoDiario } from '@/hooks/useTramoDiario'
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
  const [intento, setIntento] = useState(0)
  const { tramo, error } = useTramoDiario(intento)

  const traslado = useMemo(() => (tramo ? trasladoDelTramo(tramo) : []), [tramo])
  const afluentes = useMemo(
    () => (tramo ? [...trasladoDelParaguay(tramo), ...trasladoDelBermejo(tramo)] : []),
    [tramo],
  )

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
  const nombre = (id: number) => ESCALAS_PARANA.find(e => e.id === id)?.nombre ?? String(id)
  const primera = ESCALAS_PARANA[0]
  const ultima = ESCALAS_PARANA[ESCALAS_PARANA.length - 1]
  const itaIbate = nombre(ESTACION_ARRIBA)
  const tPrimera = de(primera.id)?.picos
  const tIta = de(ESTACION_ARRIBA)?.picos
  const tUltima = de(ultima.id)?.picos
  const rMax = Math.max(0.01, ...traslado.map(t => t.cambios?.r ?? 0))

  return (
    <div className="sv-panel" style={{ ...mono, border: '1px solid #1e1e1e', background: '#191919',
      borderLeft: '3px solid #F5C300', marginTop: 8, padding: '10px 12px 12px' }}>

      <div style={{ fontSize: 12, color: '#ddd', textTransform: 'uppercase', letterSpacing: 1.2 }}>
        Traslado de la crecida en el tramo
      </div>
      <div style={{ fontSize: 11, color: '#8f8f8f', lineHeight: 1.5, marginTop: 4 }}>
        Cuánto antes o después que en <b style={{ color: '#a0a0a0' }}>Barranqueras</b> se mueve el
        río en cada escala. Altura media diaria, {fLarga(tramo.desde)} a {fLarga(tramo.hasta)}.
      </div>

      {tPrimera && tIta && tUltima && (
        <div style={{ fontSize: 12, color: '#c4c4c4', lineHeight: 1.6, marginTop: 10,
          borderLeft: '3px solid #85B7EB', paddingLeft: 9 }}>
          El máximo de una crecida pasa por <b>{primera.nombre}</b> {enPalabras(tPrimera.mediana)} que
          por Barranqueras, por <b>{itaIbate}</b> {enPalabras(tIta.mediana)}, y por{' '}
          <b>{ultima.nombre}</b> {enPalabras(tUltima.mediana)}.
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
          {ESCALAS_PARANA.map(e => {
            if (e.id === ESTACION_REFERENCIA) {
              return (
                <tr key={e.id} style={{ borderTop: '1px solid #232323', color: '#c4c4c4' }}>
                  <td style={{ ...td, color: '#F5C300' }}>{e.nombre}</td>
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
                <td style={td}>
                  {e.nombre}
                  {e.id === ESTACION_CONTROL && (
                    <span style={{ color: '#8f8f8f', marginLeft: 6 }}>enfrente · control</span>
                  )}
                </td>
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
        crecidas distintas. <b style={{ color: '#a0a0a0' }}>Corrientes está enfrente</b>: su
        desfase tiene que dar cero, y si no da, alguna serie tiene las fechas corridas.{' '}
        <b style={{ color: '#a0a0a0' }}>Ituzaingó está al pie de Yacyretá</b>, que regula su
        altura. <b style={{ color: '#a0a0a0' }}>Entre {itaIbate} y Barranqueras entra el río
        Paraguay</b>, así que una crecida que venga por el Paraguay no se anuncia en las escalas
        del Paraná: va medido aparte, más abajo. La serie es diaria: el desfase se conoce al medio día, no más. Es cuándo
        llega, no a cuánto. Fuente: {tramo.fuente}.
      </div>

      {afluentes.length > 0 && <Afluentes filas={afluentes} arriba={itaIbate} />}
    </div>
  )
}

/**
 * Los afluentes: las tres escalas del río Paraguay y la del Bermejo.
 *
 * Van en tabla aparte y con otras columnas porque **no son del tramo y no se
 * les mide lo mismo**: no hay un traslado que informar. Las dos primeras
 * columnas están para que se vea por qué —sus variaciones casi no se parecen a
 * las de Barranqueras y su pico anual suele ser otra crecida—, y las otras son
 * lo que sí se puede decir: cuánto de lo que Itá Ibaté no explica viene por
 * ahí. El Bermejo desemboca en el Paraguay y se le mide lo mismo.
 */
function Afluentes({ filas, arriba }: { filas: TrasladoParaguay[]; arriba: string }) {
  const pct = (v: number) => `${n1(v * 100)} %`
  const r2 = (v: number) => v.toFixed(2).replace('.', ',')

  return (
    <div style={{ marginTop: 14, borderTop: '1px solid #232323', paddingTop: 11 }}>
      <div style={{ fontSize: 11, color: '#a0a0a0', textTransform: 'uppercase', letterSpacing: 1.2 }}>
        Afluentes: río Paraguay y río Bermejo
      </div>
      <div style={{ fontSize: 11, color: '#8f8f8f', lineHeight: 1.5, marginTop: 4 }}>
        El Paraguay entra al Paraná entre {arriba} y Barranqueras, y el Bermejo entra al Paraguay
        antes de Puerto Bermejo. No son escalas del tramo: crecen en otra época, y lo que se les
        mide es cuánto de lo que {arriba} no explica viene por ahí.
      </div>

      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', color: '#c4c4c4', marginTop: 10 }}>
        <thead>
          <tr style={{ color: '#8f8f8f', fontSize: 11 }}>
            <th style={th}>Estación</th>
            <th style={thD}>Variaciones diarias</th>
            <th style={thD}>Mismo pico anual</th>
            <th style={thD}>Sobre lo que {arriba} no explica</th>
            <th style={thD}>Entre</th>
            <th style={thD}>Correlación</th>
            <th style={thD}>Explicado</th>
          </tr>
        </thead>
        <tbody>
          {[...ESTACIONES_PARAGUAY, ESTACION_BERMEJO].map(e => {
            const t = filas.find(f => f.estacion === e.id)
            if (!t) return null
            const a = t.aporte
            return (
              <tr key={e.id} style={{ borderTop: '1px solid #232323' }}>
                <td style={td}>
                  {e.nombre}
                  <span style={{ color: '#8f8f8f', marginLeft: 6 }}>{e.rio}</span>
                </td>
                <td style={{ ...tdD, color: '#a0a0a0' }}>{t.cambios ? `r ${r2(t.cambios.r)}` : '—'}</td>
                <td style={{ ...tdD, color: '#a0a0a0' }}>
                  {t.picos ? `${t.picos.usados} de ${t.picos.anios} años` : '—'}
                </td>
                <td style={{ ...tdD, color: '#fff' }}>{a ? enPalabras(a.k) : '—'}</td>
                <td style={{ ...tdD, color: '#a0a0a0' }}>{a ? `${entero(a.desde)} y ${entero(a.hasta)}` : ''}</td>
                <td style={{ ...tdD, color: '#a0a0a0' }}>{a ? r2(a.r) : ''}</td>
                <td style={{ ...tdD, color: '#a0a0a0' }}>
                  {a ? `${pct(a.explicadoSin)} → ${pct(a.explicadoCon)}` : ''}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div style={{ fontSize: 11, color: '#8f8f8f', marginTop: 10, lineHeight: 1.5 }}>
        <b style={{ color: '#a0a0a0' }}>Variaciones diarias</b> y{' '}
        <b style={{ color: '#a0a0a0' }}>mismo pico anual</b> son los dos métodos de la tabla de
        arriba, y acá no dan un traslado: de un día para el otro el Paraguay casi no se mueve con
        Barranqueras, y en buena parte de los años su máximo es otra crecida, a meses de la del
        Paraná. Lo demás se mide sobre <b style={{ color: '#a0a0a0' }}>cambios
        de {VENTANA_APORTE_DIAS} días</b>: se descuenta de Barranqueras lo que explica {arriba} y se
        busca con qué desfase el resto se parece a lo que hizo el afluente.{' '}
        <b style={{ color: '#a0a0a0' }}>Entre</b> es el rango de días en que la correlación queda a
        menos de un décimo de la máxima: la cima es ancha, así que dice alrededor de cuándo, no qué
        día. <b style={{ color: '#a0a0a0' }}>Explicado</b> es qué parte del cambio de Barranqueras
        se explica con {arriba} sola y sumando esa escala. Puerto Formosa y Puerto Bermejo se
        mueven a la vez que Barranqueras: explican, pero no adelantan; Puerto Pilcomayo, frente a
        Asunción, unos días antes. <b style={{ color: '#a0a0a0' }}>El Bermejo en El Colorado no se
        distingue</b> en la altura de Barranqueras: su agua llega mezclada con la del Paraguay, que
        pesa siete veces más, y la escala mide un río de cauce móvil. Puerto Formosa y El Colorado
        tienen registro desde 2006 y 2001. Es cuánto se parecen, no cuántos centímetros aporta.
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
      aria-label={`Correlación por desfase entre Barranqueras y ${nombre}: máxima a ${t.cambios!.k} días`}
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
