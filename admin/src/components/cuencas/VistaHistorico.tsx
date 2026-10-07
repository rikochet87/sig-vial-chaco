'use client'

/**
 * Qué es normal y qué es raro: la lluvia de cada cuenca desde 1981, de CHIRPS.
 *
 * Es la séptima vista del panel de cuencas y, con la de cursos de agua, la que
 * no depende del período. Por cuenca: la media anual, los últimos doce meses
 * contra los mismos doce meses de cada año, y la mayor lámina que juntó en 3,
 * 7 y 30 días corridos. Al abrir una fila: el total de cada año, lo normal de
 * cada mes al lado del último, y cada cuánto la mayor ventana de una temporada
 * llega a cierta lámina.
 *
 * Tres cosas que la pantalla dice y no se pueden sacar:
 *
 * - **Es una estimación de satélite, no una medición**, y no se compara con los
 *   números de las otras vistas, que salen de los pluviómetros. Por eso va en
 *   un color que no es el azul de lo medido ni el violeta del pronóstico.
 * - **No hay nada de un día suelto.** El día de CHIRPS no es el de la APA; la
 *   ventana más corta es de tres.
 * - **Las frecuencias son cuentas, no un ajuste**: una de cada diez temporadas
 *   es lo más raro que 45 temporadas dejan decir.
 */

import { Fragment, useEffect, useMemo, useState } from 'react'
import type { Cuenca } from '@/lib/cuencas'
import {
  csvAnualChirps, frecuenciaVentana, normalMensual, totalesAnuales, ultimosDoceMeses, VENTANAS_CHIRPS,
  type ChirpsCuencas, type DoceMeses, type FrecuenciaVentana, type MesNormal, type TotalAnual,
} from '@/lib/chirps'
import { bajarCsv, boton, nMm, td, tdD, th, thD } from './piezas'

/** Color de CHIRPS: ni el azul de lo medido ni el violeta del pronóstico */
const C_CHIRPS = '#B8A98A'
const C_ALTO = '#6FB1E0'
const C_BAJO = '#E8833A'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

/** '2026-08-31' → '31/08/2026' */
const fLarga = (f: string) => f.split('-').reverse().join('/')
/** El rango de una ventana, con el año una sola vez si no cambia */
const fVentana = (d: string, h: string) =>
  `${d.slice(0, 4) === h.slice(0, 4) ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : fLarga(d)} – ${fLarga(h)}`

interface Fila {
  cod: number
  nombre: string
  /** Los años calendario enteros */
  anuales: TotalAnual[]
  media: number
  doce: DoceMeses | null
  frecuencias: (FrecuenciaVentana | null)[]
  normal: MesNormal[]
}

export default function VistaHistorico({ cuencas }: { cuencas: Cuenca[] }) {
  const [chirps, setChirps] = useState<ChirpsCuencas | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)
  const [detalle, setDetalle] = useState<number | null>(null)
  /** -1 número de cuenca, 0 media anual, 1 doce meses, 2 en adelante las ventanas */
  const [orden, setOrden] = useState(-1)

  useEffect(() => {
    let vivo = true
    fetch('/lluvia/chirps_cuencas.json')
      .then(r => {
        // Un 404 devuelve una página de error que `.json()` no puede leer
        if (!r.ok) throw new Error(`el servidor respondió ${r.status}`)
        return r.json() as Promise<ChirpsCuencas>
      })
      .then(j => {
        if (!vivo) return
        if (typeof j?.desde !== 'string' || typeof j?.cuencas !== 'object') throw new Error('el archivo no tiene la forma esperada')
        setChirps(j)
        setError(null)
      })
      .catch(e => { if (vivo) setError(e instanceof Error ? e.message : 'no se pudo descargar') })
    return () => { vivo = false }
  }, [intento])

  const filas = useMemo<Fila[] | null>(() => {
    if (!chirps) return null
    return cuencas.filter(k => chirps.cuencas[String(k.cod)]).map(k => {
      const anuales = totalesAnuales(chirps, k.cod).filter(t => t.completo)
      return {
        cod: k.cod, nombre: k.nombre, anuales,
        media: anuales.reduce((s, t) => s + t.mm, 0) / Math.max(1, anuales.length),
        doce: ultimosDoceMeses(chirps, k.cod),
        frecuencias: VENTANAS_CHIRPS.map(d => frecuenciaVentana(chirps, k.cod, d)),
        normal: normalMensual(chirps, k.cod),
      }
    })
  }, [chirps, cuencas])

  if (error) {
    return (
      <div style={{ color: '#E8A87C' }}>
        No se pudo cargar la serie histórica ({error}).{' '}
        <button onClick={() => setIntento(v => v + 1)} style={boton}>Reintentar</button>
      </div>
    )
  }
  if (!chirps || !filas) return <div style={{ color: '#8f8f8f' }}>Cargando la serie histórica…</div>

  const valor = (f: Fila) =>
    orden === 0 ? f.media : orden === 1 ? (f.doce?.mm ?? -1) : (f.frecuencias[orden - 2]?.mayor.mm ?? -1)
  const ordenadas = orden < 0 ? filas : [...filas].sort((a, b) => valor(b) - valor(a) || a.cod - b.cod)
  const temporadas = filas[0]?.frecuencias[0]?.temporadas ?? 0
  const thOrden = (i: number) => ({ ...thD, cursor: 'pointer', color: orden === i ? '#F5C300' : undefined })

  return (<>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
      <span style={{ color: '#8f8f8f', flex: 1 }}>
        No depende del período. Del {fLarga(chirps.desde)} al {fLarga(chirps.hasta)}, estimado por satélite.
        Tocá una cuenca para ver sus años, sus meses y cada cuánto se repite una lámina.
      </span>
      <button onClick={() => bajarCsv(csvAnualChirps(chirps, cuencas), 'lluvia-anual-por-cuenca_chirps.csv')}
        style={boton}>Descargar los años (CSV)</button>
    </div>

    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ color: '#8f8f8f', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          <th style={th} colSpan={4} />
          <th style={{ ...thD, borderBottom: '1px solid #2a2a2a' }} colSpan={VENTANAS_CHIRPS.length}>
            Mayor lámina acumulada desde {chirps.desde.slice(0, 4)}
          </th>
        </tr>
        <tr style={{ color: '#8f8f8f', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          <th style={{ ...th, width: 34, cursor: 'pointer', color: orden < 0 ? '#F5C300' : undefined }}
            onClick={() => setOrden(-1)} title="Ordenar por número de cuenca">Nº</th>
          <th style={th}>Cuenca</th>
          <th style={thOrden(0)} onClick={() => setOrden(0)}
            title="Promedio de los años calendario enteros. Clic para ordenar">Media anual{orden === 0 ? ' ▾' : ''}</th>
          <th style={thOrden(1)} onClick={() => setOrden(1)}
            title={`Los 365 días que terminan el ${fLarga(chirps.hasta)}, contra los mismos 365 días de cada año. Clic para ordenar`}>
            Últimos 12 meses{orden === 1 ? ' ▾' : ''}
          </th>
          {VENTANAS_CHIRPS.map((d, i) => (
            <th key={d} style={thOrden(i + 2)} onClick={() => setOrden(i + 2)}
              title={`Mayor lámina media sobre la cuenca en ${d} días corridos. Clic para ordenar`}>
              En {d} días{orden === i + 2 ? ' ▾' : ''}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {ordenadas.map(f => {
          const abierta = detalle === f.cod
          return (
            <Fragment key={f.cod}>
              <tr onClick={() => setDetalle(abierta ? null : f.cod)} style={{
                borderTop: '1px solid #141414', cursor: 'pointer',
                background: abierta ? 'rgba(245,195,0,0.05)' : 'transparent',
              }}>
                <td style={{ ...td, color: '#a0a0a0' }}>{f.cod}</td>
                <td style={{ ...td, color: '#ccc' }}>{f.nombre}</td>
                <td style={tdD}>
                  <b style={{ color: '#ccc' }}>{nMm(f.media)} mm</b>
                  <span style={{ display: 'block', fontSize: 11, color: '#8f8f8f' }}>{f.anuales.length} años</span>
                </td>
                <td style={tdD}>
                  {f.doce === null ? <span style={{ color: '#8f8f8f' }}>—</span> : (<>
                    <b style={{ color: '#ccc' }}>{nMm(f.doce.mm)} mm</b>
                    <span style={{ display: 'block', fontSize: 11, color: '#8f8f8f' }}
                      title={`Del más lluvioso al más seco, entre los ${f.doce.de} años con esos mismos doce meses`}>
                      {nMm((f.doce.mm / f.doce.mediana) * 100)} % de lo normal · {f.doce.puesto}.º de {f.doce.de}
                    </span>
                  </>)}
                </td>
                {f.frecuencias.map((x, i) => (
                  <td key={i} style={tdD}>
                    {x === null ? <span style={{ color: '#8f8f8f' }}>—</span> : (<>
                      <b style={{ color: '#ccc' }}>{nMm(x.mayor.mm)} mm</b>
                      <span style={{ display: 'block', fontSize: 11, color: '#8f8f8f' }}>
                        {fVentana(x.mayor.desde, x.mayor.hasta)}
                      </span>
                    </>)}
                  </td>
                ))}
              </tr>
              {abierta && (
                <tr>
                  <td />
                  <td colSpan={3 + VENTANAS_CHIRPS.length} style={{ padding: '8px 0 14px' }}>
                    <Anios f={f} />
                    <Meses normal={f.normal} />
                    <Frecuencias frecuencias={f.frecuencias} />
                  </td>
                </tr>
              )}
            </Fragment>
          )
        })}
      </tbody>
    </table>

    <div style={{ color: '#8f8f8f', marginTop: 9 }}>
      CHIRPS es una estimación de lluvia hecha con imágenes infrarrojas de satélite y corregida con pluviómetros.
      No es una medición: vale para el promedio de una cuenca y para ventanas de varios días, y por eso acá no
      hay nada de un día suelto ni de un punto.
    </div>
    <div style={{ color: '#E8A87C', marginTop: 5 }}>
      Estos números no se comparan con los de las otras vistas, que salen de los pluviómetros de la APA: son
      otra fuente. Sirven para saber qué es normal y qué es raro, no cuánto llovió.
    </div>
    <div style={{ color: '#8f8f8f', marginTop: 5 }}>
      El archivo termina el {fLarga(chirps.hasta)}: CHIRPS se publica con algo más de un mes de atraso.
      «Lo normal» de los últimos doce meses es la mediana de los mismos doce meses de cada año
      {temporadas > 0 && <>; las frecuencias se cuentan sobre {temporadas} temporadas de julio a junio</>}.
    </div>
  </>)
}

const rotulo = { color: '#8f8f8f', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 } as const

/** El total de cada año calendario entero, con la media marcada */
function Anios({ f }: { f: Fila }) {
  const ALTO = 72
  const maximo = Math.max(1, ...f.anuales.map(t => t.mm))
  const seco = f.anuales.reduce((a, t) => (t.mm < a.mm ? t : a))
  const lluvioso = f.anuales.reduce((a, t) => (t.mm > a.mm ? t : a))

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={rotulo}>Lámina de cada año, en mm</span>
        <span style={{ fontSize: 11, color: '#8f8f8f' }}>
          más seco <b style={{ color: '#ccc' }}>{nMm(seco.mm)}</b> ({seco.anio})
          {' · '}más lluvioso <b style={{ color: '#ccc' }}>{nMm(lluvioso.mm)}</b> ({lluvioso.anio})
          {' · '}la raya es la media, {nMm(f.media)}
        </span>
      </div>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 2, height: ALTO,
        borderBottom: '1px solid #2a2a2a' }}>
        {f.anuales.map(t => (
          <div key={t.anio} title={`${t.anio} · ${nMm(t.mm)} mm`}
            style={{ flex: 1, minWidth: 3, height: Math.max(2, Math.round((t.mm / maximo) * ALTO)),
              background: C_CHIRPS, opacity: t.mm < f.media ? 0.55 : 1 }} />
        ))}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: Math.round((f.media / maximo) * ALTO),
          borderTop: '1px dashed #d0d0d0', pointerEvents: 'none' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#8f8f8f', marginTop: 3 }}>
        <span>{f.anuales[0].anio}</span>
        <span>más apagados, los años bajo la media</span>
        <span>{f.anuales[f.anuales.length - 1].anio}</span>
      </div>
    </div>
  )
}

/**
 * Lo normal de cada mes y, al lado, la última vez que ese mes está entero.
 *
 * Dos barras por mes y no una línea sobre la otra: la gris es de 45 años y la
 * de color es un solo mes, y no tienen que leerse como la misma cosa.
 */
function Meses({ normal }: { normal: MesNormal[] }) {
  const ALTO = 56
  const maximo = Math.max(1, ...normal.flatMap(m => [m.p90, m.ultimo?.mm ?? 0]))
  const h = (mm: number) => Math.max(mm > 0 ? 2 : 0, Math.round((mm / maximo) * ALTO))
  const col = { display: 'grid', gridTemplateColumns: '170px repeat(12, 1fr)', alignItems: 'end' } as const
  const celda = { textAlign: 'right', padding: '2px 0 2px 4px', fontSize: 12 } as const
  const lado = { color: '#8f8f8f', fontSize: 11 } as const

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ ...rotulo, marginBottom: 4 }}>Lo normal de cada mes, en mm</div>
      <div style={{ ...col, borderBottom: '1px solid #2a2a2a' }}>
        <span />
        {normal.map(m => (
          <div key={m.mes} style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', gap: 2, height: ALTO }}>
            <div title={`${MESES[m.mes - 1]} · mediana ${nMm(m.mediana)} mm`}
              style={{ width: '32%', height: h(m.mediana), background: '#555' }} />
            <div title={m.ultimo ? `${MESES[m.mes - 1]} ${m.ultimo.anio} · ${nMm(m.ultimo.mm)} mm` : undefined}
              style={{ width: '32%', height: h(m.ultimo?.mm ?? 0), background: C_CHIRPS }} />
          </div>
        ))}
      </div>
      <div style={{ ...col, alignItems: 'baseline' }}>
        <span />
        {normal.map(m => <span key={m.mes} style={{ ...celda, color: '#a0a0a0' }}>{MESES[m.mes - 1]}</span>)}
        <span style={lado}>Mediana</span>
        {normal.map(m => <span key={m.mes} style={{ ...celda, color: '#ccc' }}>{nMm(m.mediana)}</span>)}
        <span style={lado} title="El rango en que cae la lámina del mes en ocho de cada diez años">Ocho de cada diez años</span>
        {normal.map(m => (
          <span key={m.mes} style={{ ...celda, color: '#8f8f8f', fontSize: 11 }}>{nMm(m.p10)}–{nMm(m.p90)}</span>
        ))}
        <span style={lado}>El último</span>
        {normal.map(m => {
          if (!m.ultimo) return <span key={m.mes} style={celda}>—</span>
          const alto = m.ultimo.mm > m.p90, bajo = m.ultimo.mm < m.p10
          return (
            <span key={m.mes} style={{ ...celda, color: alto ? C_ALTO : bajo ? C_BAJO : C_CHIRPS }}
              title={`${MESES[m.mes - 1]} de ${m.ultimo.anio}${alto ? ': sobre el rango de ocho de cada diez años' : bajo ? ': bajo el rango de ocho de cada diez años' : ''}`}>
              {alto ? '▲ ' : bajo ? '▼ ' : ''}{nMm(m.ultimo.mm)}
              <span style={{ display: 'block', fontSize: 11, color: '#8f8f8f' }}>{m.ultimo.anio}</span>
            </span>
          )
        })}
      </div>
      <div style={{ fontSize: 11, color: '#8f8f8f', marginTop: 3 }}>
        barra gris: la mediana del mes · barra clara: el último · ▲ ▼ fuera del rango de ocho de cada diez años
      </div>
    </div>
  )
}

/** Cada cuánto la mayor ventana de una temporada llega a cierta lámina */
function Frecuencias({ frecuencias }: { frecuencias: (FrecuenciaVentana | null)[] }) {
  const hay = frecuencias.filter((x): x is FrecuenciaVentana => x !== null)
  if (hay.length === 0) {
    return <div style={{ color: '#9aa0a6' }}>No hay temporadas enteras suficientes para contar frecuencias.</div>
  }
  const thF = { ...thD, paddingLeft: 28 }, tdF = { ...tdD, paddingLeft: 28 }
  return (
    <div>
      <div style={{ ...rotulo, marginBottom: 2 }}>La mayor lámina de cada temporada, en mm</div>
      <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 620 }}>
        <thead>
          <tr style={{ color: '#8f8f8f' }}>
            <th style={th}>Acumulada en</th>
            <th style={thF} title="La mitad de las temporadas llega a esta lámina o la pasa">Una de cada dos</th>
            <th style={thF} title="Una de cada cinco temporadas llega a esta lámina o la pasa">Una de cada cinco</th>
            <th style={thF} title="Una de cada diez temporadas llega a esta lámina o la pasa">Una de cada diez</th>
            <th style={thF}>La mayor</th>
            <th style={thF} />
          </tr>
        </thead>
        <tbody>
          {hay.map(x => (
            <tr key={x.dias} style={{ borderTop: '1px solid #141414' }}>
              <td style={{ ...td, color: '#999' }}>{x.dias} días corridos</td>
              <td style={tdF}>{nMm(x.mediana)}</td>
              <td style={tdF}>{nMm(x.unoEnCinco)}</td>
              <td style={tdF}>{nMm(x.unoEnDiez)}</td>
              <td style={{ ...tdF, color: '#ccc', fontWeight: 700 }}>{nMm(x.mayor.mm)}</td>
              <td style={{ ...tdD, color: '#8f8f8f', fontSize: 11 }}>{fVentana(x.mayor.desde, x.mayor.hasta)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 11, color: '#8f8f8f', marginTop: 4 }}>
        Contado sobre {hay[0].temporadas} temporadas de julio a junio, sin ajustar ninguna distribución:
        no dice nada de láminas más raras que una de cada diez.
      </div>
    </div>
  )
}
