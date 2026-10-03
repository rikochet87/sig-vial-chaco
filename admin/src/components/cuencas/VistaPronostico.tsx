'use client'
/**
 * Lo que viene: el pronóstico de lluvia por cuenca, al lado de lo que ya cayó.
 *
 * Es la quinta vista del panel de cuencas. Por cuenca: lo medido por los
 * pluviómetros en los últimos 7 días, y lo pronosticado para mañana, 3 y 7
 * días — cada uno como **mediana y rango**, la probabilidad de juntar 25 mm en
 * tres días, la ET₀ y el balance climático. Al abrir una fila, el hietograma:
 * siete días medidos y catorce pronosticados sobre el mismo eje.
 *
 * Dos cosas que la pantalla dice y no se pueden sacar:
 *
 * - **Es un modelo y no está verificado contra la APA.** Lo medido y lo
 *   pronosticado van en columnas y colores distintos, y nunca se suman en un
 *   número: un pronóstico no es una medición.
 * - **El balance no es cuánta agua se queda.** Lluvia menos evapotranspiración
 *   de referencia dice si el período viene con exceso o con déficit; lo que
 *   infiltra, escurre o se junta en los bajos depende del suelo, que todavía no
 *   está (ver «Lluvia — para qué es la pantalla» en el CLAUDE.md).
 */
import { Fragment, useEffect, useMemo, useState } from 'react'
import type { Cuenca } from '@/lib/cuencas'
import type { DiaCuenca } from '@/lib/lluviaCuencas'
import {
  asignarPuntos, laminaPorCorrida, pronosticoPorCuenca, probSuperar, ventana,
  type Pronostico, type PronosticoCuenca, type Rango,
} from '@/lib/pronostico'
import { boton, fCorta, mono, nMm, td, tdD, th, thD } from './piezas'
import EstadoRegistro from './EstadoRegistro'

/** El umbral de la columna de probabilidad: el corte de lluvia fuerte del mapa */
const UMBRAL_MM = 25
const DIAS_MEDIDOS = 7
/** Color del pronóstico: distinto del amarillo y el azul de lo medido */
const C_PRONO = '#B39DDB'

function Celda({ r }: { r: Rango | null }) {
  if (!r) return <>—</>
  return (
    <>
      <b style={{ color: '#ccc', fontWeight: 400 }}>{nMm(r.mediana)}</b>
      <span style={{ color: '#8f8f8f', fontSize: 11 }}> {nMm(r.p10)}–{nMm(r.p90)}</span>
    </>
  )
}

const nSigno = (v: number) => `${v > 0.5 ? '+' : ''}${nMm(v)}`

export default function VistaPronostico({ cuencas, observado, errorObservado, onReintentarObservado, hoy }: {
  cuencas: Cuenca[]
  /** AAAA-MM-DD; llega de afuera para no leer el reloj al renderizar */
  hoy: string
  /** La serie medida de cada cuenca hasta hoy, por código; null mientras carga */
  observado: Map<number, DiaCuenca[]> | null
  errorObservado: string | null
  onReintentarObservado: () => void
}) {
  const [prono, setProno] = useState<Pronostico | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)
  const [detalle, setDetalle] = useState<number | null>(null)

  useEffect(() => {
    let vivo = true
    fetch('/api/lluvia/pronostico')
      .then(async r => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.error ?? `el servidor respondió ${r.status}`)
        return j as Pronostico
      })
      .then(j => { if (vivo) { setProno(j); setError(null) } })
      .catch(e => { if (vivo) setError(e instanceof Error ? e.message : 'no se pudo consultar') })
    return () => { vivo = false }
  }, [intento])

  const filas = useMemo(() => (prono ? pronosticoPorCuenca(prono, asignarPuntos(cuencas, prono.puntos)) : null), [prono, cuencas])
  const provincia = useMemo(() => {
    if (!prono) return null
    const pc = laminaPorCorrida(prono, prono.puntos.map((_, i) => i))
    const et0 = prono.dias.slice(0, 7).reduce((s, _, d) => s + prono.puntos.reduce((a, p) => a + p.et0[d], 0) / prono.puntos.length / 10, 0)
    return { manana: ventana(pc, 0, 1), tres: ventana(pc, 0, 3), siete: ventana(pc, 0, 7), et0Siete: et0 }
  }, [prono])

  const medido7 = (cod: number): number | null => {
    const s = observado?.get(cod)?.slice(-DIAS_MEDIDOS)
    if (!s || s.every(d => d.mm === null)) return null
    return s.reduce((a, d) => a + (d.mm ?? 0), 0)
  }

  if (error) {
    return (
      <div style={{ color: '#E8A87C' }}>
        No se pudo consultar el pronóstico ({error}).{' '}
        <button onClick={() => setIntento(v => v + 1)} style={boton}>Reintentar</button>
      </div>
    )
  }
  if (!prono || !filas || !provincia) return <div style={{ color: '#8f8f8f' }}>Consultando el pronóstico…</div>

  const nombre = (cod: number) => cuencas.find(c => c.cod === cod)?.nombre ?? String(cod)
  const hora = new Date(prono.consultado).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  const columnas = 9

  return (<>
    <div style={{ color: '#8f8f8f', marginBottom: 6 }}>
      Pronóstico desde el {fCorta(prono.dias[0])} · {prono.modelo} · consultado {hora}.
      {' '}Cada celda: <b style={{ color: '#ccc', fontWeight: 400 }}>mediana</b> y el rango donde cae el 80 % de las corridas.
    </div>

    <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
      <thead>
        <tr style={{ color: '#8f8f8f', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          <th style={th} colSpan={2} />
          <th style={{ ...thD, color: '#4A90C2' }}>Medido</th>
          <th style={{ ...thD, color: C_PRONO, borderBottom: `1px solid ${C_PRONO}44` }} colSpan={4}>Pronóstico</th>
          <th style={thD} colSpan={2} />
        </tr>
        <tr style={{ color: '#8f8f8f', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          <th style={{ ...th, width: 34 }}>Nº</th>
          <th style={th}>Cuenca</th>
          <th style={thD} title="Lámina areal medida por los pluviómetros en los últimos 7 días, con el mismo IDW que el resto de la pantalla">Últ. 7 días</th>
          <th style={thD}>Mañana</th>
          <th style={thD}>3 días</th>
          <th style={thD}>7 días</th>
          <th style={thD} title={`Qué parte de las 51 corridas junta al menos ${UMBRAL_MM} mm en los próximos 3 días`}>≥ {UMBRAL_MM} mm en 3 d</th>
          <th style={thD} title="Evapotranspiración de referencia FAO-56 de los próximos 7 días: cuánta agua pide la atmósfera">ET₀ 7 d</th>
          <th style={thD} title="Lluvia pronosticada menos ET₀, 7 días. Positivo: el período viene con exceso de agua; negativo, con déficit">Balance 7 d</th>
        </tr>
      </thead>
      <tbody>
        {filas.map(f => (
          <Fila key={f.cod} f={f} nombre={nombre(f.cod)} medido={medido7(f.cod)}
            cargandoMedido={!observado && !errorObservado} serie={observado?.get(f.cod) ?? null}
            dias={prono.dias} abierta={detalle === f.cod} columnas={columnas}
            onClick={() => setDetalle(detalle === f.cod ? null : f.cod)} />
        ))}
        <tr style={{ borderTop: '1px solid #2a2a2a', color: '#ccc' }}>
          <td style={td} />
          <td style={{ ...td, textTransform: 'uppercase', letterSpacing: 0.8, fontSize: 11, color: '#999' }}>Provincia</td>
          <td style={tdD} />
          <td style={tdD}><Celda r={provincia.manana} /></td>
          <td style={tdD}><Celda r={provincia.tres} /></td>
          <td style={tdD}><Celda r={provincia.siete} /></td>
          <td style={tdD}>{provincia.tres ? `${Math.round(probSuperar(provincia.tres, UMBRAL_MM) * 100)} %` : '—'}</td>
          <td style={tdD}>{nMm(provincia.et0Siete)}</td>
          <td style={tdD}>{provincia.siete ? nSigno(provincia.siete.mediana - provincia.et0Siete) : '—'}</td>
        </tr>
      </tbody>
    </table>

    {errorObservado && (
      <div style={{ color: '#E8A87C', marginTop: 8 }}>
        No se pudo traer lo medido ({errorObservado}); el pronóstico se muestra igual.{' '}
        <button onClick={onReintentarObservado} style={boton}>Reintentar</button>
      </div>
    )}

    <div style={{ color: '#8f8f8f', marginTop: 8 }}>
      <b style={{ color: '#a0a0a0', fontWeight: 400 }}>Es un modelo, no una medición</b>, y todavía no está
      comparado contra los pluviómetros de la APA: no se sabe cuánto erra en el Chaco. Las celdas del modelo
      miden unos 25 km, así que no distingue un consorcio de otro. Lo medido y lo pronosticado no se suman.
      El día de hoy no entra: lo cuentan los pluviómetros mañana.
    </div>
    <div style={{ color: '#8f8f8f', marginTop: 5 }}>
      El <b style={{ color: '#a0a0a0', fontWeight: 400 }}>balance</b> es la mediana de la lluvia menos la ET₀:
      dice si la semana viene con exceso o con déficit de agua, no cuánta se queda en el terreno. Eso depende
      del suelo, de la humedad que ya tiene y del relieve, que todavía no están en el sistema.
    </div>
    {filas.some(f => f.puntos === 1) && (
      <div style={{ color: '#8f8f8f', marginTop: 5 }}>
        {filas.filter(f => f.puntos === 1).map(f => nombre(f.cod)).join(' y ')}: una sola celda del modelo; su
        pronóstico es el de un punto, no un promedio.
      </div>
    )}
    <EstadoRegistro hoy={hoy} />
  </>)
}

function Fila({ f, nombre, medido, cargandoMedido, serie, dias, abierta, columnas, onClick }: {
  f: PronosticoCuenca; nombre: string; medido: number | null; cargandoMedido: boolean
  serie: DiaCuenca[] | null; dias: string[]; abierta: boolean; columnas: number; onClick: () => void
}) {
  return (
    <Fragment>
      <tr onClick={onClick} style={{
        borderTop: '1px solid #141414', cursor: 'pointer',
        background: abierta ? 'rgba(245,195,0,0.05)' : 'transparent',
      }}>
        <td style={{ ...td, color: '#a0a0a0' }}>{f.cod}</td>
        <td style={{ ...td, color: '#ccc' }}>{nombre}{f.prestado && <span title="Sin celdas del modelo adentro: se usa la más cercana" style={{ color: '#8f8f8f' }}> *</span>}</td>
        <td style={{ ...tdD, color: '#a0a0a0' }}>{cargandoMedido ? '…' : nMm(medido)}</td>
        <td style={tdD}><Celda r={f.manana} /></td>
        <td style={tdD}><Celda r={f.tres} /></td>
        <td style={tdD}><Celda r={f.siete} /></td>
        <td style={{ ...tdD, color: '#ccc' }}>{f.tres ? `${Math.round(probSuperar(f.tres, UMBRAL_MM) * 100)} %` : '—'}</td>
        <td style={{ ...tdD, color: '#a0a0a0' }}>{nMm(f.et0Siete)}</td>
        <td style={{ ...tdD, color: '#ccc' }}>{f.siete ? nSigno(f.siete.mediana - f.et0Siete) : '—'}</td>
      </tr>
      {abierta && (
        <tr>
          <td />
          <td colSpan={columnas - 1} style={{ padding: '6px 0 12px' }}>
            <Hietograma serie={serie?.slice(-DIAS_MEDIDOS) ?? []} f={f} dias={dias} />
          </td>
        </tr>
      )}
    </Fragment>
  )
}

/**
 * Siete días medidos y catorce pronosticados, sobre el mismo eje. Lo
 * pronosticado va como una banda —del p10 al p90— con una raya en la mediana,
 * para que se lea como un rango y no como una barra más.
 */
function Hietograma({ serie, f, dias }: { serie: DiaCuenca[]; f: PronosticoCuenca; dias: string[] }) {
  const ALTO = 80
  const rangos = dias.map((_, d) => ventana(f.porCorrida, d, 1))
  const maximo = Math.max(1, ...serie.map(d => d.mm ?? 0), ...rangos.map(r => r?.p90 ?? 0))
  const y = (mm: number) => Math.round((mm / maximo) * ALTO)

  return (
    <div style={{ ...mono }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#8f8f8f', marginBottom: 4 }}>
        <span>Lámina areal diaria, en mm</span>
        <span>hasta {nMm(maximo)} mm</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: ALTO, borderBottom: '1px solid #2a2a2a' }}>
        {serie.map(d => {
          const mm = d.mm ?? 0
          return (
            <div key={d.fecha} title={`${fCorta(d.fecha)} · ${d.mm === null ? 'sin parte de la APA' : `${nMm(mm)} mm medidos`}`}
              style={{ flex: 1, height: ALTO, display: 'flex', alignItems: 'flex-end' }}>
              <div style={{ width: '100%', height: d.mm === null ? 0 : mm > 0 ? Math.max(3, y(mm)) : 2, background: mm > 0 ? '#4A90C2' : '#555' }} />
            </div>
          )
        })}
        {/* El borde entre lo medido y lo pronosticado */}
        <div style={{ width: 1, height: ALTO, background: '#F5C300', margin: '0 2px' }} title="Hoy" />
        {rangos.map((r, d) => (
          <div key={dias[d]} title={r ? `${fCorta(dias[d])} · pronóstico ${nMm(r.mediana)} mm (${nMm(r.p10)}–${nMm(r.p90)})` : dias[d]}
            style={{ flex: 1, height: ALTO, position: 'relative' }}>
            {r && (<>
              <div style={{ position: 'absolute', left: '15%', right: '15%', bottom: y(r.p10), height: Math.max(1, y(r.p90) - y(r.p10)), background: `${C_PRONO}44`, border: `1px solid ${C_PRONO}88` }} />
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: y(r.mediana), height: 2, background: C_PRONO }} />
            </>)}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#8f8f8f', marginTop: 3 }}>
        <span>{serie[0] ? fCorta(serie[0].fecha) : ''}</span>
        <span>
          <span style={{ color: '#4A90C2' }}>barra: medido</span>
          {' · '}<span style={{ color: '#F5C300' }}>línea: hoy</span>
          {' · '}<span style={{ color: C_PRONO }}>banda: 80 % de las corridas, raya: mediana</span>
        </span>
        <span>{fCorta(dias[dias.length - 1])}</span>
      </div>
    </div>
  )
}
