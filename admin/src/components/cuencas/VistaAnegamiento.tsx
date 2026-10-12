'use client'

/**
 * Cuánto terreno se ve anegado en cada cuenca, quincena por quincena.
 *
 * Es la octava vista del panel de cuencas y no depende del período. Por cuenca:
 * la última quincena en que se la vio entera, contra lo normal de ese mes, y la
 * mayor desde 2018. Al abrir una fila: todas las quincenas, y lo normal de cada
 * mes al lado de la última vez que se lo vio.
 *
 * Cuatro cosas que la pantalla dice y no se pueden sacar:
 *
 * - **Es una clasificación automática de imágenes, no una medición** ni una
 *   mancha dibujada. Va en un color que no es el de ninguna otra fuente.
 * - **Se compara contra el mismo mes, no un mes contra otro**: en invierno da
 *   varias veces más que en verano y no se sabe si es agua o la clasificación.
 * - **Una quincena nublada no es una quincena seca**: va vacía, no en cero.
 * - **No dice nada de un camino.** Es superficie, no transitabilidad.
 */

import { Fragment, useEffect, useMemo, useState } from 'react'
import type { Cuenca } from '@/lib/cuencas'
import {
  ANIO_NORMAL_DESDE, csvAnegamiento, mayorAnegamiento, MINIMO_DETECTABLE_KM2, normalAnegamiento, quincenasUtiles, RESERVAS,
  serieAnegamiento, ultimaLectura, VISTO_MINIMO,
  type AnegamientoCuencas, type LecturaAnegamiento, type NormalMes, type Quincena,
} from '@/lib/anegamiento'
import { bajarCsv, boton, nKm2, td, tdD, th, thD } from './piezas'

/** Color del anegamiento: ni el azul de lo medido, ni el violeta del pronóstico, ni la arena de CHIRPS */
const C_ANEG = '#9DB87A'
const C_ALTO = '#6FB1E0'
const C_BAJO = '#E8833A'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre',
  'octubre', 'noviembre', 'diciembre']

/** '2026-08-31' → '31/08/2026' */
const fLarga = (f: string) => f.split('-').reverse().join('/')
/** Una quincena: '16 – 30/09/2026' */
const fQuincena = (q: { desde: string; hasta: string }) => `${q.desde.slice(8, 10)} – ${fLarga(q.hasta)}`

type Util = Quincena & { km2: number }

interface Fila {
  cod: number
  nombre: string
  km2Cuenca: number
  serie: Quincena[]
  normal: NormalMes[]
  ultima: LecturaAnegamiento | null
  mayor: Util | null
  utiles: number
}

export default function VistaAnegamiento({ cuencas }: { cuencas: Cuenca[] }) {
  const [datos, setDatos] = useState<AnegamientoCuencas | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)
  const [detalle, setDetalle] = useState<number | null>(null)
  /** -1 número de cuenca, 0 la última quincena, 1 la mayor */
  const [orden, setOrden] = useState(-1)

  useEffect(() => {
    let vivo = true
    fetch('/lluvia/anegamiento_cuencas.json')
      .then(r => {
        // Un 404 devuelve una página de error que `.json()` no puede leer
        if (!r.ok) throw new Error(`el servidor respondió ${r.status}`)
        return r.json() as Promise<AnegamientoCuencas>
      })
      .then(j => {
        if (!vivo) return
        if (typeof j?.desde !== 'string' || typeof j?.cuencas !== 'object') throw new Error('el archivo no tiene la forma esperada')
        setDatos(j)
        setError(null)
      })
      .catch(e => { if (vivo) setError(e instanceof Error ? e.message : 'no se pudo descargar') })
    return () => { vivo = false }
  }, [intento])

  const filas = useMemo<Fila[] | null>(() => {
    if (!datos) return null
    return cuencas.filter(k => datos.cuencas[String(k.cod)]).map(k => {
      const serie = serieAnegamiento(datos, k.cod)
      return {
        cod: k.cod, nombre: k.nombre, km2Cuenca: datos.cuencas[String(k.cod)].km2, serie,
        normal: normalAnegamiento(serie), ultima: ultimaLectura(serie), mayor: mayorAnegamiento(serie),
        utiles: quincenasUtiles(serie).length,
      }
    })
  }, [datos, cuencas])

  if (error) {
    return (
      <div style={{ color: '#E8A87C' }}>
        No se pudo cargar la serie de anegamiento ({error}).{' '}
        <button onClick={() => setIntento(v => v + 1)} style={boton}>Reintentar</button>
      </div>
    )
  }
  if (!datos || !filas) return <div style={{ color: '#8f8f8f' }}>Cargando la serie de anegamiento…</div>

  const valor = (f: Fila) => (orden === 0 ? (f.ultima?.quincena.km2 ?? -1) : (f.mayor?.km2 ?? -1))
  const ordenadas = orden < 0 ? filas : [...filas].sort((a, b) => valor(b) - valor(a) || a.cod - b.cod)
  const thOrden = (i: number) => ({ ...thD, cursor: 'pointer', color: orden === i ? '#F5C300' : undefined })

  return (<>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
      <span style={{ color: '#8f8f8f', flex: '1 1 220px' }}>
        No depende del período. Superficie que las imágenes de satélite clasifican como vegetación inundada,
        por quincena, hasta el {datos.hasta ? fLarga(datos.hasta) : '—'}. Tocá una cuenca para ver todas sus quincenas.
      </span>
      <button onClick={() => bajarCsv(csvAnegamiento(datos, cuencas), 'anegamiento-por-cuenca_quincenas.csv')}
        style={boton}>Descargar las quincenas (CSV)</button>
    </div>

    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ color: '#8f8f8f', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          <th style={{ ...th, width: 34, cursor: 'pointer', color: orden < 0 ? '#F5C300' : undefined }}
            onClick={() => setOrden(-1)} title="Ordenar por número de cuenca">Nº</th>
          <th style={th}>Cuenca</th>
          <th style={thOrden(0)} onClick={() => setOrden(0)}
            title={`La última quincena en que se vio el ${VISTO_MINIMO * 100} % de la cuenca o más. Clic para ordenar`}>
            Última quincena a la vista{orden === 0 ? ' ▾' : ''}
          </th>
          <th style={thD} title={`La mediana de las quincenas de ese mes desde ${ANIO_NORMAL_DESDE}, y el rango en que cae ocho de cada diez veces`}>
            Lo normal de ese mes
          </th>
          <th style={thD} title="Qué lugar ocupa entre las quincenas de ese mes, de la más anegada a la menos">Contra ese mes</th>
          <th style={thOrden(1)} onClick={() => setOrden(1)}
            title={`La quincena con más superficie desde ${ANIO_NORMAL_DESDE}. Clic para ordenar`}>
            La mayor desde {ANIO_NORMAL_DESDE}{orden === 1 ? ' ▾' : ''}
          </th>
        </tr>
      </thead>
      <tbody>
        {ordenadas.map(f => {
          const abierta = detalle === f.cod
          const u = f.ultima
          // Donde no se detecta nada, compararlo contra lo normal no dice nada
          const seDetecta = (f.mayor?.km2 ?? 0) >= MINIMO_DETECTABLE_KM2
          return (
            <Fragment key={f.cod}>
              <tr onClick={() => setDetalle(abierta ? null : f.cod)} style={{
                borderTop: '1px solid #141414', cursor: 'pointer',
                background: abierta ? 'rgba(245,195,0,0.05)' : 'transparent',
              }}>
                <td style={{ ...td, color: '#a0a0a0' }}>{f.cod}</td>
                <td style={{ ...td, color: '#ccc' }}>
                  {f.nombre}
                  {RESERVAS[f.cod] && (
                    <span style={{ display: 'block', fontSize: 11, color: '#E8A87C', whiteSpace: 'normal' }}>{RESERVAS[f.cod]}</span>
                  )}
                </td>
                <td style={tdD}>
                  {u === null ? <span style={{ color: '#8f8f8f' }}>—</span> : (<>
                    <b style={{ color: C_ANEG }}>{nKm2(u.quincena.km2)} km²</b>
                    <span style={{ display: 'block', fontSize: 11, color: '#8f8f8f' }}>{fQuincena(u.quincena)}</span>
                  </>)}
                </td>
                <td style={tdD}>
                  {u === null ? <span style={{ color: '#8f8f8f' }}>—</span> : (<>
                    <span style={{ color: '#ccc' }}>{nKm2(u.normal.mediana)} km²</span>
                    <span style={{ display: 'block', fontSize: 11, color: '#8f8f8f' }}>
                      {nKm2(u.normal.p10)} a {nKm2(u.normal.p90)}
                    </span>
                  </>)}
                </td>
                <td style={tdD}>
                  {u === null || !seDetecta ? <span style={{ color: '#8f8f8f' }}>—</span> : (<>
                    <span style={{ color: u.contra === 'sobre' ? C_ALTO : u.contra === 'bajo' ? C_BAJO : '#ccc' }}>
                      {u.contra === 'sobre' ? '▲ sobre lo normal' : u.contra === 'bajo' ? '▼ bajo lo normal' : 'dentro de lo normal'}
                    </span>
                    <span style={{ display: 'block', fontSize: 11, color: '#8f8f8f' }}
                      title={`De la más anegada a la menos, entre las ${u.de} quincenas de ${MESES_LARGOS[u.quincena.mes - 1]} con la cuenca a la vista`}>
                      {u.puesto}.ª de {u.de} en {MESES_LARGOS[u.quincena.mes - 1]}
                    </span>
                  </>)}
                </td>
                <td style={tdD}>
                  {f.mayor === null ? <span style={{ color: '#8f8f8f' }}>—</span> : (<>
                    <b style={{ color: '#ccc' }}>{nKm2(f.mayor.km2)} km²</b>
                    <span style={{ display: 'block', fontSize: 11, color: '#8f8f8f' }}>{fQuincena(f.mayor)}</span>
                  </>)}
                </td>
              </tr>
              {abierta && (
                <tr>
                  <td />
                  <td colSpan={5} style={{ padding: '8px 0 14px' }}>
                    <Quincenas f={f} />
                    <Meses f={f} />
                  </td>
                </tr>
              )}
            </Fragment>
          )
        })}
      </tbody>
    </table>

    <div style={{ color: '#8f8f8f', marginTop: 9 }}>
      Sale de Dynamic World, que clasifica cada imagen del satélite Sentinel-2 en clases de cobertura; acá se cuenta
      una, «vegetación inundada». Un lugar cuenta si aparece así en la mitad o más de las imágenes despejadas de la
      quincena. Es una clasificación automática, no una medición ni una mancha dibujada: no ve agua abierta ni lo que
      queda debajo del monte.
    </div>
    <div style={{ color: '#E8A87C', marginTop: 5 }}>
      Cada quincena se compara contra el mismo mes de otros años, no contra otro mes. De mayo a julio da varias veces
      más que en verano, y no se sabe si es agua que en invierno tarda en irse o cómo clasifica el satélite con el
      sol bajo. Sacando eso, sigue a la lluvia de los meses anteriores.
    </div>
    <div style={{ color: '#8f8f8f', marginTop: 5 }}>
      Sólo cuentan las quincenas en que se vio el {VISTO_MINIMO * 100} % de la cuenca o más; lo clasificado se lleva
      a la cuenca entera. Una quincena nublada va vacía, no en cero. Lo normal se cuenta desde {ANIO_NORMAL_DESDE}:
      antes había un solo satélite. Es superficie que se ve mojada: no dice cómo está ningún camino.
    </div>
  </>)
}

const rotulo = { color: '#8f8f8f', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 } as const

/**
 * Todas las quincenas desde que se cuenta lo normal.
 *
 * La altura va con la raíz de la superficie, y se dice: enero de 2019 es diez
 * veces una quincena común, y en escala pareja todas las demás quedan en el piso.
 */
function Quincenas({ f }: { f: Fila }) {
  const ALTO = 76
  const desde = f.serie.filter(q => q.anio >= ANIO_NORMAL_DESDE)
  const maximo = Math.max(1, ...desde.map(q => q.km2 ?? 0))
  const h = (v: number) => Math.max(v > 0 ? 2 : 0, Math.round(Math.sqrt(v / maximo) * ALTO))
  const anios = [...new Set(desde.map(q => q.anio))]
  const sinVer = desde.filter(q => q.km2 === null).length

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={rotulo}>Cada quincena desde {ANIO_NORMAL_DESDE}, en km²</span>
        <span style={{ fontSize: 11, color: '#8f8f8f' }}>
          {f.utiles} con la cuenca a la vista · {sinVer} sin ver, por nubes o por falta de imagen
          {f.mayor && <>{' · '}la mayor <b style={{ color: '#ccc' }}>{nKm2(f.mayor.km2)}</b> ({fQuincena(f.mayor)})</>}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', height: ALTO, borderBottom: '1px solid #2a2a2a' }}>
        {desde.map(q => {
          const n = f.normal[q.mes - 1]
          return q.km2 === null
            ? <div key={q.desde} title={`${fQuincena(q)} · no se vio: ${Math.round(q.visto * 100)} % de la cuenca a la vista`}
                style={{ flex: 1, height: ALTO, background: 'repeating-linear-gradient(0deg, #1c1c1c 0 2px, transparent 2px 5px)' }} />
            : <div key={q.desde} title={`${fQuincena(q)} · ${nKm2(q.km2)} km² · lo normal de ${MESES_LARGOS[q.mes - 1]}: ${nKm2(n.mediana)}`}
                style={{ flex: 1, height: h(q.km2), background: q.km2 > n.p90 ? C_ALTO : C_ANEG,
                  opacity: q.km2 < n.mediana ? 0.5 : 1, borderLeft: '1px solid #0e0e0e' }} />
        })}
      </div>
      <div style={{ display: 'flex', fontSize: 11, color: '#8f8f8f', marginTop: 3 }}>
        {anios.map(a => (
          <span key={a} style={{ flex: desde.filter(q => q.anio === a).length, borderLeft: '1px solid #2a2a2a', paddingLeft: 3 }}>{a}</span>
        ))}
      </div>
      <div style={{ fontSize: 11, color: '#8f8f8f', marginTop: 3 }}>
        celeste: sobre el rango de ocho de cada diez de su mes · más apagadas, las que están bajo la mediana de su mes
        · rayado: no se vio · la altura va con la raíz de la superficie, para que la mayor no aplaste a las demás
      </div>
    </div>
  )
}

/** Lo normal de cada mes y, al lado, la última quincena en que se lo vio */
function Meses({ f }: { f: Fila }) {
  const ALTO = 56
  const utiles = quincenasUtiles(f.serie)
  const ultimo = f.normal.map(m => utiles.filter(q => q.mes === m.mes).at(-1) ?? null)
  const maximo = Math.max(1, ...f.normal.map(m => m.p90), ...ultimo.map(q => q?.km2 ?? 0))
  const h = (v: number) => Math.max(v > 0 ? 2 : 0, Math.round((v / maximo) * ALTO))
  const col = { display: 'grid', gridTemplateColumns: '170px repeat(12, 1fr)', alignItems: 'end' } as const
  const celda = { textAlign: 'right', padding: '2px 0 2px 4px', fontSize: 12 } as const
  const lado = { color: '#8f8f8f', fontSize: 11 } as const

  return (
    <div>
      <div style={{ ...rotulo, marginBottom: 4 }}>Lo normal de cada mes, en km²</div>
      <div style={{ ...col, borderBottom: '1px solid #2a2a2a' }}>
        <span />
        {f.normal.map((m, i) => (
          <div key={m.mes} style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', gap: 2, height: ALTO }}>
            <div title={`${MESES[i]} · mediana ${nKm2(m.mediana)} km²`} style={{ width: '32%', height: h(m.mediana), background: '#555' }} />
            <div title={ultimo[i] ? `${fQuincena(ultimo[i]!)} · ${nKm2(ultimo[i]!.km2)} km²` : undefined}
              style={{ width: '32%', height: h(ultimo[i]?.km2 ?? 0), background: C_ANEG }} />
          </div>
        ))}
      </div>
      <div style={{ ...col, alignItems: 'baseline' }}>
        <span />
        {f.normal.map((m, i) => <span key={m.mes} style={{ ...celda, color: '#a0a0a0' }}>{MESES[i]}</span>)}
        <span style={lado}>Mediana</span>
        {f.normal.map(m => <span key={m.mes} style={{ ...celda, color: '#ccc' }}>{m.quincenas ? nKm2(m.mediana) : '—'}</span>)}
        <span style={lado} title="El rango en que cae la quincena ocho de cada diez veces">Ocho de cada diez</span>
        {f.normal.map(m => (
          <span key={m.mes} style={{ ...celda, color: '#8f8f8f', fontSize: 11 }}>
            {m.quincenas ? `${nKm2(m.p10)}–${nKm2(m.p90)}` : '—'}
          </span>
        ))}
        <span style={lado} title="Cuántas quincenas de ese mes tienen la cuenca a la vista">Quincenas</span>
        {f.normal.map(m => <span key={m.mes} style={{ ...celda, color: '#8f8f8f', fontSize: 11 }}>{m.quincenas}</span>)}
        <span style={{ ...lado, alignSelf: 'start', paddingTop: 2 }}>La última</span>
        {f.normal.map((m, i) => {
          const q = ultimo[i]
          if (!q) return <span key={m.mes} style={celda}>—</span>
          const alto = q.km2 > m.p90, bajo = q.km2 < m.p10
          return (
            <span key={m.mes} style={{ ...celda, color: alto ? C_ALTO : bajo ? C_BAJO : C_ANEG }}
              title={`${fQuincena(q)}${alto ? ': sobre el rango de ocho de cada diez' : bajo ? ': bajo el rango de ocho de cada diez' : ''}`}>
              {alto ? '▲ ' : bajo ? '▼ ' : ''}{nKm2(q.km2)}
              <span style={{ display: 'block', fontSize: 11, color: '#8f8f8f' }}>{q.desde.slice(8, 10)}/{q.desde.slice(5, 7)}/{q.desde.slice(2, 4)}</span>
            </span>
          )
        })}
      </div>
      <div style={{ fontSize: 11, color: '#8f8f8f', marginTop: 3 }}>
        barra gris: la mediana del mes · barra verde: la última quincena de ese mes con la cuenca a la vista ·
        ▲ ▼ fuera del rango de ocho de cada diez
      </div>
    </div>
  )
}
