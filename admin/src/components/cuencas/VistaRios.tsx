'use client'

/**
 * Los ríos y canales internos: qué hizo el agua después de la lluvia.
 *
 * Es la sexta vista del panel de cuencas. Una fila por escala del INA, con la
 * última altura, cuánto cambió en una semana y la serie en miniatura. Al abrir
 * una fila se ven dos franjas con el mismo eje de tiempo: arriba la lámina
 * diaria de su cuenca, abajo la altura del río.
 *
 * ── Por qué dos franjas y no dos líneas en un eje ─────────────────────────────
 *
 * El mismo motivo que en el panel del Paraná: una serie está en milímetros de
 * lámina y la otra en metros de altura. Un eje vertical compartido entre dos
 * magnitudes distintas no significa nada, e invita a leer cruces que son del
 * escalado. Lo único que se quiere ver es la coincidencia en el tiempo —la
 * lluvia, y el río que sube después—, y para eso alcanza con compartir el eje
 * horizontal.
 *
 * ── El eje de la altura no arranca en cero ────────────────────────────────────
 *
 * El cero de cada escala es arbitrario y ninguna está vinculada: una altura de
 * 1,20 m no es «poca agua». La franja va de la mínima a la máxima de la
 * ventana, y los dos valores están escritos al lado.
 *
 * Las estaciones, y por qué son ésas, están en `lib/riosInternos.ts`.
 */

import { Fragment, useEffect, useMemo, useState } from 'react'
import type { Cuenca } from '@/lib/cuencas'
import type { DiaCuenca } from '@/lib/lluviaCuencas'
import {
  ESTACIONES_INTERNAS, DIAS_ATRASO, DIAS_CAMBIO, nombreDe, resumirAlturas, serieDeAlturas,
  type DiaAltura, type EstacionInterna, type RespuestaRiosInternos, type ResumenAltura,
} from '@/lib/riosInternos'
import { boton, fCorta, mono, nMm, td, tdD, th, thD } from './piezas'

/** El tope de días de la ruta: más atrás no se pide */
const MAX_DIAS = 400

const C_AGUA = '#19B5A5'
const C_LLUVIA = '#4A90C2'

const nM = (v: number) => v.toFixed(2).replace('.', ',').replace('-', '−')
const nCambio = (v: number) => (Math.abs(v) < 0.005 ? '0,00' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(2).replace('.', ',')}`)

interface Fila {
  e: EstacionInterna
  serie: DiaAltura[]
  resumen: ResumenAltura | null
}

export default function VistaRios({ cuencas, observado, errorObservado, onReintentarObservado, serieDesde, hoy, desde, hasta }: {
  cuencas: Cuenca[]
  /** La lámina diaria de cada cuenca entre `serieDesde` y `hoy`, por código; null mientras carga */
  observado: Map<number, DiaCuenca[]> | null
  errorObservado: string | null
  onReintentarObservado: () => void
  serieDesde: string
  /** AAAA-MM-DD; llega de afuera para no leer el reloj al renderizar */
  hoy: string
  /** El período elegido arriba, para marcarlo en las franjas */
  desde: string
  hasta: string
}) {
  const [datos, setDatos] = useState<(RespuestaRiosInternos & { clave: string }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)
  const [detalle, setDetalle] = useState<number | null>(null)

  // La ruta no entrega más de 400 días; lo anterior queda sin lectura
  const tope = new Date(Date.parse(hoy) - (MAX_DIAS - 1) * 86_400_000).toISOString().slice(0, 10)
  const pedirDesde = serieDesde < tope ? tope : serieDesde
  const clave = `${pedirDesde}|${hoy}`

  useEffect(() => {
    let vivo = true
    fetch(`/api/lluvia/rios-internos?desde=${pedirDesde}&hasta=${hoy}`)
      .then(async r => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.error ?? `el servidor respondió ${r.status}`)
        return j as RespuestaRiosInternos
      })
      .then(j => { if (vivo) { setDatos({ ...j, clave: `${pedirDesde}|${hoy}` }); setError(null) } })
      .catch(e => { if (vivo) setError(e instanceof Error ? e.message : 'no se pudo consultar') })
    return () => { vivo = false }
  }, [pedirDesde, hoy, intento])

  // Lo que quedó de otro rango no se muestra como si fuera de éste
  const vigente = datos?.clave === clave ? datos : null

  const filas = useMemo<Fila[] | null>(() => {
    if (!vigente) return null
    return ESTACIONES_INTERNAS.flatMap(e => {
      const llego = vigente.estaciones.find(x => x.id === e.id)
      if (!llego) return []
      const serie = serieDeAlturas(llego.lecturas, serieDesde, hoy)
      return [{ e, serie, resumen: resumirAlturas(serie, hoy) }]
    })
  }, [vigente, serieDesde, hoy])

  if (error) {
    return (
      <div style={{ color: '#E8A87C' }}>
        No se pudo consultar la altura de los ríos ({error}).{' '}
        <button onClick={() => setIntento(v => v + 1)} style={boton}>Reintentar</button>
      </div>
    )
  }
  if (!vigente || !filas) return <div style={{ color: '#8f8f8f' }}>Consultando el Alerta Hidrológico del INA…</div>

  const nombreCuenca = (cod: number) => cuencas.find(c => c.cod === cod)?.nombre ?? String(cod)
  const atrasadas = filas.filter(f => f.resumen && f.resumen.atraso > DIAS_ATRASO)
  const columnas = 8

  return (<>
    <div style={{ color: '#8f8f8f', marginBottom: 6 }}>
      Del {fCorta(serieDesde)} al {fCorta(hoy)} · altura media diaria en {filas.length} escalas del INA.
      Tocá una para verla al lado de la lluvia de su cuenca.
    </div>

    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ color: '#8f8f8f', textTransform: 'uppercase', letterSpacing: 0.8, fontSize: 11 }}>
          <th style={th}>Curso y escala</th>
          <th style={th}>Cuenca</th>
          <th style={thD} title="Altura media diaria sobre el cero de la escala, en metros">Última</th>
          <th style={thD}>Fecha</th>
          <th style={thD} title={`Cuánto cambió respecto de ${DIAS_CAMBIO} días antes de la última lectura`}>En {DIAS_CAMBIO} días</th>
          <th style={thD} title="La menor altura de la ventana">Mínima</th>
          <th style={thD} title="La mayor altura de la ventana">Máxima</th>
          <th style={{ ...th, paddingLeft: 16, width: '26%' }}>Altura en la ventana</th>
        </tr>
      </thead>
      <tbody>
        {filas.map(f => (
          <FilaRio key={f.e.id} f={f} cuenca={nombreCuenca(f.e.cuenca)}
            lluvia={observado?.get(f.e.cuenca) ?? null} cargandoLluvia={!observado && !errorObservado}
            abierta={detalle === f.e.id} columnas={columnas} desde={desde} hasta={hasta}
            onClick={() => setDetalle(detalle === f.e.id ? null : f.e.id)} />
        ))}
      </tbody>
    </table>

    {vigente.sinRespuesta.length > 0 && (
      <div style={{ color: '#E8A87C', marginTop: 8 }}>
        El INA no contestó por {vigente.sinRespuesta.join(', ')}: no están en la tabla.{' '}
        <button onClick={() => setIntento(v => v + 1)} style={boton}>Reintentar</button>
      </div>
    )}
    {atrasadas.length > 0 && (
      <div style={{ color: '#E8833A', marginTop: 8 }}>
        Sin lecturas recientes: {atrasadas.map(f =>
          `${nombreDe(f.e)} (última el ${fCorta(f.resumen!.ultima.fecha)})`).join(', ')}. El número que
        se muestra es de esa fecha, no de hoy.
      </div>
    )}
    {errorObservado && (
      <div style={{ color: '#E8A87C', marginTop: 8 }}>
        No se pudo traer la lluvia de las cuencas ({errorObservado}); las alturas se muestran igual.{' '}
        <button onClick={onReintentarObservado} style={boton}>Reintentar</button>
      </div>
    )}

    <div style={{ color: '#8f8f8f', marginTop: 9 }}>
      <b style={{ color: '#a0a0a0', fontWeight: 400 }}>La altura es sobre el cero de cada escala</b>, y
      ninguna tiene el cero vinculado: no se puede comparar una estación con otra en metros, ni contra
      el terreno. Sirve para ver cuándo sube, cuánto y cuánto tarda en bajar. No hay niveles de alerta:
      el INA no publica ninguno para estas escalas y acá no se inventan.
    </div>
    <div style={{ color: '#8f8f8f', marginTop: 5 }}>
      Las series se muestran como las publica el INA, sin filtrar. Son las escalas de la provincia cuya
      serie se lee como un río; las que traen puntas sueltas o un piso de sensor quedaron afuera, igual
      que el Bermejo, que trae agua de los Andes y no de lo que llueve acá. La lluvia que va al lado es
      la de la cuenca entera; la escala sólo ve lo que drena aguas arriba de ella. Las dos del canal
      Línea Paraná están sobre el límite sur o ya en Santa Fe: miden el agua que sale.
      Fuente: {vigente.fuente}.
    </div>
  </>)
}

function FilaRio({ f, cuenca, lluvia, cargandoLluvia, abierta, columnas, desde, hasta, onClick }: {
  f: Fila; cuenca: string; lluvia: DiaCuenca[] | null; cargandoLluvia: boolean
  abierta: boolean; columnas: number; desde: string; hasta: string; onClick: () => void
}) {
  const { e, serie, resumen: r } = f
  const atrasada = !!r && r.atraso > DIAS_ATRASO

  return (
    <Fragment>
      <tr onClick={onClick} style={{
        borderTop: '1px solid #141414', cursor: 'pointer',
        background: abierta ? 'rgba(245,195,0,0.05)' : 'transparent',
      }}>
        <td style={{ ...td, color: '#ccc' }}>
          {e.curso} <span style={{ color: '#a0a0a0' }}>· {e.lugar}</span>
        </td>
        <td style={{ ...td, color: '#a0a0a0' }}>
          {e.cuenca} {cuenca}
          {e.aLaSalida && <span style={{ color: '#8f8f8f' }} title="La escala está fuera del polígono de la cuenca: mide el agua que sale"> · a la salida</span>}
        </td>
        {r ? (<>
          <td style={{ ...tdD, color: atrasada ? '#a0a0a0' : '#fff', fontWeight: 700 }}>{nM(r.ultima.m)} m</td>
          <td style={{ ...tdD, color: atrasada ? '#E8833A' : '#a0a0a0' }}>{fCorta(r.ultima.fecha)}</td>
          <td style={{ ...tdD, color: '#ccc' }}>{r.cambio === null ? '—' : `${nCambio(r.cambio)} m`}</td>
          <td style={{ ...tdD, color: '#a0a0a0' }}>
            {nM(r.minima.m)}<span style={{ color: '#8f8f8f', fontSize: 11 }}> · {fCorta(r.minima.fecha)}</span>
          </td>
          <td style={{ ...tdD, color: '#a0a0a0' }}>
            {nM(r.maxima.m)}<span style={{ color: '#8f8f8f', fontSize: 11 }}> · {fCorta(r.maxima.fecha)}</span>
          </td>
          <td style={{ paddingLeft: 16 }}>
            <Linea serie={serie} r={r} alto={22} desde={desde} hasta={hasta} />
          </td>
        </>) : (
          <td colSpan={6} style={{ ...tdD, color: '#E8833A', textAlign: 'left', paddingLeft: 10 }}>
            sin lecturas en la ventana
          </td>
        )}
      </tr>

      {abierta && r && (
        <tr>
          <td colSpan={columnas} style={{ padding: '8px 0 14px' }}>
            <div style={{ ...mono }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#8f8f8f', marginBottom: 4 }}>
                <span style={{ color: C_LLUVIA }}>Lámina areal diaria de la cuenca {cuenca}, en mm</span>
                <span>
                  {cargandoLluvia ? 'cargando la lluvia…'
                    : lluvia ? `hasta ${nMm(Math.max(0, ...lluvia.map(d => d.mm ?? 0)))} mm en un día` : ''}
                </span>
              </div>
              <Lluvia serie={lluvia} dias={serie.length} desde={desde} hasta={hasta} />

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#8f8f8f', margin: '10px 0 4px' }}>
                <span style={{ color: C_AGUA }}>Altura de {nombreDe(e)}, en m sobre el cero de la escala</span>
                <span>de {nM(r.minima.m)} a {nM(r.maxima.m)} m · {r.conDato} de {r.dias} días con lectura</span>
              </div>
              <Linea serie={serie} r={r} alto={70} desde={desde} hasta={hasta} conBorde />

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#8f8f8f', marginTop: 3 }}>
                <span>{fCorta(serie[0].fecha)}</span>
                <span>
                  barra: llovió · raya gris: parte con 0 mm · vacío: sin parte o sin lectura · en amarillo, el
                  período elegido · la franja de la altura va de su mínima a su máxima, no desde cero
                </span>
                <span>{fCorta(serie[serie.length - 1].fecha)}</span>
              </div>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  )
}

/**
 * La altura como una línea, de la mínima a la máxima de la ventana.
 *
 * Donde falta una lectura la línea se corta: unir los dos lados sería dibujar
 * un tramo que nadie midió.
 */
function Linea({ serie, r, alto, desde, hasta, conBorde }: {
  serie: DiaAltura[]; r: ResumenAltura; alto: number; desde: string; hasta: string; conBorde?: boolean
}) {
  const n = serie.length
  const rango = Math.max(0.01, r.maxima.m - r.minima.m)
  // Un margen arriba y abajo, para que la línea no se pegue al borde
  const y = (m: number) => 1 + (1 - (m - r.minima.m) / rango) * (alto - 2)

  const tramos: string[] = []
  const sueltos: { x: number; y: number }[] = []
  let actual: string[] = []
  const cerrar = (i: number) => {
    if (actual.length > 1) tramos.push(actual.join(' '))
    else if (actual.length === 1) sueltos.push({ x: i - 0.5, y: y(serie[i - 1].m as number) })
    actual = []
  }
  serie.forEach((d, i) => {
    if (d.m === null) cerrar(i)
    else actual.push(`${i + 0.5},${y(d.m).toFixed(2)}`)
  })
  cerrar(n)

  const i0 = serie.findIndex(d => d.fecha >= desde)
  const i1 = serie.findLastIndex(d => d.fecha <= hasta)

  return (
    <svg viewBox={`0 0 ${n} ${alto}`} preserveAspectRatio="none" role="img"
      aria-label={`Altura de ${fCorta(serie[0].fecha)} a ${fCorta(serie[n - 1].fecha)}: de ${nM(r.minima.m)} a ${nM(r.maxima.m)} metros`}
      style={{ width: '100%', height: alto, display: 'block',
        borderBottom: conBorde ? '1px solid #2a2a2a' : undefined }}>
      {i0 >= 0 && i1 >= i0 && (
        <rect x={i0} width={i1 - i0 + 1} y={0} height={alto} fill="rgba(245,195,0,0.07)" />
      )}
      {tramos.map((p, i) => (
        <polyline key={i} points={p} fill="none" stroke={C_AGUA} strokeWidth={conBorde ? 1.6 : 1.3}
          vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      ))}
      {sueltos.map((p, i) => (
        <line key={i} x1={p.x - 0.4} x2={p.x + 0.4} y1={p.y} y2={p.y} stroke={C_AGUA} strokeWidth={2}
          vectorEffect="non-scaling-stroke" />
      ))}
      {conBorde && serie.map((d, i) => (
        <rect key={d.fecha} x={i} width={1} y={0} height={alto} fill="transparent">
          <title>{`${fCorta(d.fecha)} · ${d.m === null ? 'sin lectura' : `${nM(d.m)} m`}`}</title>
        </rect>
      ))}
    </svg>
  )
}

/**
 * La lámina diaria de la cuenca, con los mismos tres estados que el hietograma
 * de «Máximas en varios días» y sobre el mismo ancho que la altura: un día de
 * una franja queda justo encima del mismo día de la otra.
 */
function Lluvia({ serie, dias, desde, hasta }: {
  serie: DiaCuenca[] | null; dias: number; desde: string; hasta: string
}) {
  const ALTO = 44
  if (!serie || serie.length !== dias) {
    return <div style={{ height: ALTO, borderBottom: '1px solid #2a2a2a' }} />
  }
  const maximo = Math.max(1, ...serie.map(d => d.mm ?? 0))

  return (
    <svg viewBox={`0 0 ${dias} ${ALTO}`} preserveAspectRatio="none" role="img"
      aria-label="Lámina areal diaria de la cuenca"
      style={{ width: '100%', height: ALTO, display: 'block', borderBottom: '1px solid #2a2a2a' }}>
      {serie.map((d, i) => {
        const dentro = d.fecha >= desde && d.fecha <= hasta
        const mm = d.mm ?? 0
        const h = d.mm === null ? 0 : mm > 0 ? Math.max(2, (mm / maximo) * ALTO) : 1.5
        return (
          <g key={d.fecha}>
            {dentro && <rect x={i} width={1} y={0} height={ALTO} fill="rgba(245,195,0,0.07)" />}
            <rect x={i + 0.1} width={0.8} y={ALTO - h} height={h}
              fill={mm > 0 ? (dentro ? '#F5C300' : C_LLUVIA) : '#555'} />
            <rect x={i} width={1} y={0} height={ALTO} fill="transparent">
              <title>{`${fCorta(d.fecha)} · ${d.mm === null ? 'sin parte de la APA' : `${nMm(mm)} mm`}`}</title>
            </rect>
          </g>
        )
      })}
    </svg>
  )
}
