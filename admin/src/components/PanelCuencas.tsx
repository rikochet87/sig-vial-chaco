'use client'

/**
 * La lluvia del período por cuenca hídrica.
 *
 * Es la tabla que le faltaba a la pantalla para hablar en términos de agua y no
 * sólo de caminos: cuánta lámina recibió cada cuenca y cuánta agua es eso.
 *
 * **Manda el número de IDW**, como en el resto de la pantalla, y al lado va el
 * de Thiessen por superficie, que es el método de manual: al abrir una fila se
 * ve su tabla de pesos, que es lo que se cita en un expediente.
 *
 * Tiene dos vistas. **Período** es la lámina y el volumen del rango elegido.
 * **Máximas en varios días** busca, en los últimos tres meses, la mayor lámina
 * que juntó cada cuenca en 1, 3, 5 y 7 días corridos: en llanura lo que anega
 * no es el pico de una tarde sino lo que se acumula en una semana.
 *
 * Va plegado por omisión, como la comparación de métodos. Y recién al abrirlo
 * se bajan las cuencas y se calcula: son 310 KB y un cálculo por período que la
 * mayoría de las visitas no necesita.
 */

import { useEffect, useMemo, useState } from 'react'
import { cargarCuencas, type Cuenca } from '@/lib/cuencas'
import { clasificar } from '@/lib/lluvia'
import { RADIO_KM } from '@/lib/fusion'
import {
  csvCuencas, csvMaximas, laminaMaxima, laminaPorCuenca, muestrasDe, pesosIdw, serieDiaria,
  totalCuencas, PASO_KM, VENTANAS_DIAS,
  type DiaCuenca, type LaminaCuenca, type LaminaMaxima, type ParteDiario,
} from '@/lib/lluviaCuencas'
import type { MedicionConNombre } from '@/lib/thiessenAreal'

const mono = { fontFamily: 'monospace' } as const

interface Props {
  /** Lo que midió cada pluviómetro en el período */
  estaciones: MedicionConNombre[]
  desde: string
  hasta: string
  /** La fecha de hoy, AAAA-MM-DD. Llega de afuera para no leer el reloj al renderizar */
  hoy: string
}

type Orden = 'mm' | 'cod'
type Vista = 'periodo' | 'maximas'

/** Cuántos días hacia atrás mira la serie diaria: los mismos que la línea de tiempo y el río */
const DIAS_SERIE = 90

/** Lo que devuelve /api/lluvia/estaciones/diario */
interface Diario {
  estaciones: { nombre: string; lat: number; lng: number }[]
  partes: ParteDiario[]
}

/** La serie y las máximas de una cuenca */
interface FilaMaximas {
  cod: number
  nombre: string
  cobertura: number
  serie: DiaCuenca[]
  maximas: (LaminaMaxima | null)[]
}

/** '2026-09-22' → '22/09' */
const fCorta = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`
const fRango = (d: string, h: string) => (d === h ? fCorta(d) : `${fCorta(d)} – ${fCorta(h)}`)

function bajarCsv(csv: string, nombre: string) {
  // El BOM es lo que hace que Excel en español abra los acentos bien
  const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Sin decimales, como el resto de la pantalla: contra el pluviómetro el error
 * típico es de varios milímetros, y "62,4" promete una precisión que no hay.
 */
const nMm = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : Math.round(v).toLocaleString('es-AR')

const nKm2 = (v: number) => Math.round(v).toLocaleString('es-AR')

const nHm3 = (v: number | null) =>
  v === null ? '—' : v.toLocaleString('es-AR', { maximumFractionDigits: v < 100 ? 1 : 0 })

const nPct = (f: number) =>
  f > 0.9995 ? '100' : (f * 100).toFixed(1).replace('.', ',')

export default function PanelCuencas({ estaciones, desde, hasta, hoy }: Props) {
  const [abierto, setAbierto] = useState(false)
  const [vista, setVista] = useState<Vista>('periodo')
  const [cuencas, setCuencas] = useState<Cuenca[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [orden, setOrden] = useState<Orden>('mm')
  const [detalle, setDetalle] = useState<number | null>(null)

  // La carga va en el clic y no en un efecto: se pide cuando alguien abre el
  // panel, que es un evento, no una consecuencia de renderizar.
  async function cargar() {
    setError(null)
    try {
      setCuencas(await cargarCuencas())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'no se pudo descargar')
    }
  }
  function alternar() {
    setAbierto(a => !a)
    if (!abierto && !cuencas) cargar()
  }

  // La grilla no depende de la fecha: una vez por carga de las cuencas.
  const muestras = useMemo(() => cuencas?.map(c => muestrasDe(c)) ?? null, [cuencas])

  const filas = useMemo(
    () => (abierto && cuencas && muestras && estaciones.length > 0
      ? laminaPorCuenca(cuencas, muestras, estaciones)
      : null),
    [abierto, cuencas, muestras, estaciones],
  )
  const total = useMemo(() => (filas ? totalCuencas(filas) : null), [filas])

  const ordenadas = useMemo(() => {
    if (!filas) return []
    return orden === 'cod'
      ? filas
      : [...filas].sort((a, b) => (b.mm ?? -1) - (a.mm ?? -1) || a.cod - b.cod)
  }, [filas, orden])

  const hayParcial = filas?.some(f => f.mm !== null && f.cobertura < 0.9995) ?? false
  const haySinDato = filas?.some(f => f.mm === null) ?? false

  /*
   * ── La serie diaria ──
   *
   * Mira los últimos 90 días, igual que la línea de tiempo y el río, y se
   * estira hacia atrás si el período elegido es anterior: una máxima de siete
   * días no se puede buscar adentro de un evento de dos.
   */
  const noventa = new Date(Date.parse(hoy) - (DIAS_SERIE - 1) * 86_400_000).toISOString().slice(0, 10)
  const serieDesde = desde < noventa ? desde : noventa

  const [diario, setDiario] = useState<(Diario & { clave: string }) | null>(null)
  const [errorDiario, setErrorDiario] = useState<string | null>(null)
  const [intentoDiario, setIntentoDiario] = useState(0)
  const claveDiario = `${serieDesde}|${hoy}`

  useEffect(() => {
    if (!abierto || vista !== 'maximas') return
    let vivo = true
    fetch(`/api/lluvia/estaciones/diario?desde=${serieDesde}&hasta=${hoy}`)
      .then(async r => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.error ?? `el servidor respondió ${r.status}`)
        return j as Diario
      })
      .then(j => { if (vivo) { setDiario({ ...j, clave: `${serieDesde}|${hoy}` }); setErrorDiario(null) } })
      .catch(e => { if (vivo) setErrorDiario(e instanceof Error ? e.message : 'no se pudo consultar') })
    return () => { vivo = false }
  }, [abierto, vista, serieDesde, hoy, intentoDiario])

  // Lo que quedó de otro rango no se muestra como si fuera de éste
  const diarioVigente = diario?.clave === claveDiario ? diario : null

  const filasMaximas = useMemo<FilaMaximas[] | null>(() => {
    if (!cuencas || !muestras || !diarioVigente) return null
    const pesos = pesosIdw(muestras, diarioVigente.estaciones)
    return cuencas.map((c, i) => {
      const serie = serieDiaria(pesos[i], diarioVigente.partes, serieDesde, hoy)
      return {
        cod: c.cod, nombre: c.nombre, cobertura: pesos[i].cobertura, serie,
        maximas: VENTANAS_DIAS.map(d => laminaMaxima(serie, d)),
      }
    })
  }, [cuencas, muestras, diarioVigente, serieDesde, hoy])

  function descargar() {
    if (!filas) return
    const csv = csvCuencas(filas, { desde, hasta })
    bajarCsv(csv, `lluvia-por-cuenca_${desde}_a_${hasta}.csv`)
  }

  return (
    <div style={{ ...mono, border: '1px solid #1e1e1e', background: '#191919', marginTop: 8, flexShrink: 0 }}>
      <button onClick={alternar} style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
        padding: '7px 12px', cursor: 'pointer', background: 'transparent', border: 'none',
        ...mono, fontSize: 12, color: '#999',
      }}>
        <span style={{ color: '#555' }}>{abierto ? '▾' : '▸'}</span>
        <span style={{ flex: 1 }}>
          Lámina por cuenca — precipitación media areal de las 13 cuencas hídricas
        </span>
        {abierto && total && total.mm !== null && (
          <span style={{ color: '#777' }}>
            provincia <b style={{ color: '#ccc' }}>{nMm(total.mm)} mm</b>
            {' · '}<b style={{ color: '#ccc' }}>{nHm3(total.hm3)} hm³</b>
          </span>
        )}
      </button>

      {abierto && (
        <div style={{ padding: '2px 12px 12px', fontSize: 12, color: '#777', lineHeight: 1.6 }}>

          {error && (
            <div style={{ color: '#E8A87C' }}>
              No se pudieron cargar las cuencas ({error}).{' '}
              <button onClick={cargar} style={boton}>Reintentar</button>
            </div>
          )}

          {!error && !cuencas && <div style={{ color: '#555' }}>Cargando las cuencas…</div>}

          {!error && cuencas && (
            <div style={{ display: 'flex', border: '1px solid #252525', width: 'fit-content', marginBottom: 8 }}>
              {([['periodo', 'Período elegido'], ['maximas', 'Máximas en varios días']] as const).map(([v, t]) => (
                <button key={v} onClick={() => { setVista(v); setDetalle(null) }} style={{
                  ...mono, fontSize: 12, padding: '4px 12px', cursor: 'pointer', border: 'none',
                  background: vista === v ? '#1e1e1e' : 'transparent',
                  color: vista === v ? '#F5C300' : '#555',
                }}>{t}</button>
              ))}
            </div>
          )}

          {!error && cuencas && vista === 'maximas' && (
            <VistaMaximas
              filas={filasMaximas} error={errorDiario}
              onReintentar={() => setIntentoDiario(v => v + 1)}
              serieDesde={serieDesde} hoy={hoy} desde={desde} hasta={hasta}
              detalle={detalle} onDetalle={setDetalle} />
          )}

          {/*
            Sin pluviómetros no hay tabla, y se dice por qué. Acá no hay
            respaldo del modelo: una tabla llena de ceros se leería como "no
            llovió", que no es lo que se sabe.
          */}
          {!error && cuencas && vista === 'periodo' && estaciones.length === 0 && (
            <div style={{ color: '#9aa0a6' }}>
              No hay mediciones de la APA en este período, así que no hay con qué
              calcular la lámina por cuenca. Este cálculo usa sólo pluviómetros.
            </div>
          )}

          {vista === 'periodo' && filas && total && (<>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ color: '#555', flex: 1 }}>
                Del {desde.split('-').reverse().join('/')} al {hasta.split('-').reverse().join('/')}
                {' · '}{estaciones.length} pluviómetros. Tocá una cuenca para ver de dónde sale su número.
              </span>
              <span style={{ color: '#555' }}>Ordenar por</span>
              {([['mm', 'Lámina'], ['cod', 'Nº']] as const).map(([k, t]) => (
                <button key={k} onClick={() => setOrden(k)} style={{
                  ...mono, fontSize: 12, cursor: 'pointer', padding: '3px 8px', border: 'none',
                  background: orden === k ? '#252525' : 'transparent',
                  color: orden === k ? '#F5C300' : '#555',
                }}>{t}</button>
              ))}
              <button onClick={descargar} style={boton}>Descargar CSV</button>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ color: '#555', textTransform: 'uppercase', letterSpacing: 0.8, fontSize: 11 }}>
                  <th style={{ ...th, width: 34 }}>Nº</th>
                  <th style={th}>Cuenca</th>
                  <th style={thD}>Superficie</th>
                  <th style={thD} title={`IDW potencia 2, radio ${RADIO_KM} km, sobre una grilla de ${PASO_KM} km`}>Lámina areal</th>
                  <th style={thD} title="Polígonos de Thiessen, cada pluviómetro pesado por los km² de su zona dentro de la cuenca">Thiessen</th>
                  <th style={thD} title="El punto de la cuenca que más recibió">Lámina máx.</th>
                  <th style={thD} title={`Parte de la cuenca con un pluviómetro a menos de ${RADIO_KM} km`}>Cobertura</th>
                  <th style={thD} title="Lámina × superficie cubierta. 1 hm³ es un millón de m³">Volumen</th>
                </tr>
              </thead>
              <tbody>
                {ordenadas.map(f => (
                  <FilaCuenca key={f.cod} f={f} abierta={detalle === f.cod}
                    onClick={() => setDetalle(detalle === f.cod ? null : f.cod)} />
                ))}
                <tr style={{ borderTop: '1px solid #2a2a2a', color: '#ccc' }}>
                  <td style={td} />
                  <td style={{ ...td, textTransform: 'uppercase', letterSpacing: 0.8, fontSize: 11, color: '#999' }}>
                    Provincia
                  </td>
                  <td style={tdD}>{nKm2(total.km2)} km²</td>
                  <td style={{ ...tdD, color: '#F5C300', fontWeight: 700 }}>{nMm(total.mm)} mm</td>
                  <td style={tdD} />
                  <td style={tdD} />
                  <td style={tdD}>{nPct(total.cobertura)} %</td>
                  <td style={{ ...tdD, fontWeight: 700 }}>{nHm3(total.hm3)} hm³</td>
                </tr>
              </tbody>
            </table>

            <div style={{ color: '#555', marginTop: 9 }}>
              La lámina areal es el promedio del IDW que usa toda la pantalla —potencia 2,
              radio {RADIO_KM} km— evaluado cada {String(PASO_KM).replace('.', ',')} km adentro de la cuenca.
              El volumen es esa lámina por la superficie cubierta: un milímetro sobre un km² son mil m³.
            </div>
            {(hayParcial || haySinDato) && (
              <div style={{ color: '#E8833A', marginTop: 5 }}>
                Donde la cobertura no llega al 100 %, la lámina y el volumen describen sólo la
                parte de la cuenca que tiene un pluviómetro a menos de {RADIO_KM} km. El resto no
                se cuenta como 0 mm: no tiene dato.
              </div>
            )}
          </>)}
        </div>
      )}
    </div>
  )
}

const boton: React.CSSProperties = {
  ...mono, fontSize: 11, padding: '3px 9px', borderRadius: 2, cursor: 'pointer',
  background: 'transparent', border: '1px solid #2d2d2d', color: '#8a8a8a',
  textTransform: 'uppercase', letterSpacing: 0.8, marginLeft: 6,
}
const th: React.CSSProperties = { textAlign: 'left', fontWeight: 400, padding: '4px 6px 4px 0' }
const thD: React.CSSProperties = { ...th, textAlign: 'right', padding: '4px 0 4px 10px' }
const td: React.CSSProperties = { padding: '4px 6px 4px 0' }
const tdD: React.CSSProperties = { padding: '4px 0 4px 10px', textAlign: 'right', whiteSpace: 'nowrap' }

function FilaCuenca({ f, abierta, onClick }: { f: LaminaCuenca; abierta: boolean; onClick: () => void }) {
  const parcial = f.mm !== null && f.cobertura < 0.9995
  const color = f.mm === null ? '#333' : clasificar(f.mm).color
  // Con cuánto de la cuenca se llega a los pluviómetros que se muestran
  const visibles = f.thiessen.aportes.slice(0, 8)

  return (
    <>
      <tr onClick={onClick} style={{
        borderTop: '1px solid #141414', cursor: 'pointer',
        background: abierta ? 'rgba(245,195,0,0.05)' : 'transparent',
      }}>
        <td style={{ ...td, color: '#777' }}>{f.cod}</td>
        <td style={{ ...td, color: '#ccc' }}>
          <span style={{ display: 'inline-block', width: 9, height: 9, background: color,
            border: '1px solid #111', marginRight: 7, verticalAlign: 'middle' }} />
          {f.nombre}
        </td>
        <td style={tdD}>{nKm2(f.km2)} km²</td>
        <td style={{ ...tdD, color: f.mm === null ? '#555' : '#F5C300', fontWeight: 700 }}>
          {f.mm === null ? 'sin dato' : `${nMm(f.mm)} mm`}
        </td>
        <td style={{ ...tdD, color: '#999' }}>{f.thiessen.mm === null ? '—' : `${nMm(f.thiessen.mm)} mm`}</td>
        <td style={{ ...tdD, color: '#999' }}>{f.mmMax === null ? '—' : `${nMm(f.mmMax)} mm`}</td>
        <td style={{ ...tdD, color: parcial || f.mm === null ? '#E8833A' : '#777' }}>{nPct(f.cobertura)} %</td>
        <td style={{ ...tdD, color: '#ccc' }}>{f.hm3 === null ? '—' : `${nHm3(f.hm3)} hm³`}</td>
      </tr>

      {abierta && (
        <tr>
          <td />
          <td colSpan={7} style={{ padding: '4px 0 10px' }}>
            {f.thiessen.aportes.length === 0 ? (
              <div style={{ color: '#9aa0a6' }}>
                Ningún pluviómetro informó a menos de {RADIO_KM} km de esta cuenca en el período.
              </div>
            ) : (<>
              <div style={{ color: '#555', marginBottom: 3 }}>
                Thiessen por superficie: {f.thiessen.aportes.length} pluviómetro(s) sobre{' '}
                {nKm2(f.thiessen.pesoTotal)} km² cubiertos.
              </div>
              <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 460 }}>
                <thead>
                  <tr style={{ color: '#555' }}>
                    <th style={th}>Pluviómetro</th>
                    <th style={thD}>Lámina</th>
                    <th style={thD}>Zona en la cuenca</th>
                    <th style={thD}>Peso</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map(a => (
                    <tr key={a.indice} style={{ borderTop: '1px solid #141414' }}>
                      <td style={{ ...td, color: '#999' }}>{a.nombre}</td>
                      <td style={tdD}>{nMm(a.mm)} mm</td>
                      <td style={tdD}>{nKm2(a.peso)} km²</td>
                      <td style={{ ...tdD, color: '#ccc' }}>{(a.fraccion * 100).toFixed(1).replace('.', ',')} %</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {f.thiessen.aportes.length > visibles.length && (
                <div style={{ color: '#555', marginTop: 4 }}>
                  … y {f.thiessen.aportes.length - visibles.length} pluviómetro(s) más, con menos peso.
                </div>
              )}
            </>)}
          </td>
        </tr>
      )}
    </>
  )
}

// ── Máximas en varios días ───────────────────────────────────────────────────

function VistaMaximas({ filas, error, onReintentar, serieDesde, hoy, desde, hasta, detalle, onDetalle }: {
  filas: FilaMaximas[] | null
  error: string | null
  onReintentar: () => void
  serieDesde: string; hoy: string; desde: string; hasta: string
  detalle: number | null
  onDetalle: (cod: number | null) => void
}) {
  /** Por qué duración se ordena: el índice en VENTANAS_DIAS, o -1 para el número de cuenca */
  const [orden, setOrden] = useState(1)

  if (error) {
    return (
      <div style={{ color: '#E8A87C' }}>
        No se pudo traer la serie diaria ({error}).{' '}
        <button onClick={onReintentar} style={boton}>Reintentar</button>
      </div>
    )
  }
  if (!filas) return <div style={{ color: '#555' }}>Cargando la serie diaria…</div>

  const conParte = filas[0]?.serie.filter(d => d.mm !== null).length ?? 0
  const totalDias = filas[0]?.serie.length ?? 0
  // Las cuencas sin cobertura no tienen serie: se cuentan los días por una que sí
  const diasConParte = Math.max(conParte, ...filas.map(f => f.serie.filter(d => d.mm !== null).length))

  if (diasConParte === 0) {
    return (
      <div style={{ color: '#9aa0a6' }}>
        La APA no publicó ningún parte entre el {fCorta(serieDesde)} y el {fCorta(hoy)}, así
        que no hay serie diaria que mirar.
      </div>
    )
  }

  const ordenadas = orden < 0
    ? filas
    : [...filas].sort((a, b) => (b.maximas[orden]?.mm ?? -1) - (a.maximas[orden]?.mm ?? -1) || a.cod - b.cod)

  return (<>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
      <span style={{ color: '#555', flex: 1 }}>
        Del {fCorta(serieDesde)} al {fCorta(hoy)} · {totalDias} días, {diasConParte} con parte de la APA.
        Tocá una cuenca para ver su serie día por día.
      </span>
      <button onClick={() => bajarCsv(
        csvMaximas(filas, { desde: serieDesde, hasta: hoy }),
        `lamina-maxima-por-cuenca_${serieDesde}_a_${hoy}.csv`)} style={boton}>Descargar CSV</button>
    </div>

    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ color: '#555', textTransform: 'uppercase', letterSpacing: 0.8, fontSize: 11 }}>
          <th style={{ ...th, width: 34, cursor: 'pointer', color: orden < 0 ? '#F5C300' : undefined }}
            onClick={() => setOrden(-1)} title="Ordenar por número de cuenca">Nº</th>
          <th style={th}>Cuenca</th>
          {VENTANAS_DIAS.map((d, i) => (
            <th key={d} onClick={() => setOrden(i)}
              title={`Mayor lámina areal acumulada en ${d} ${d === 1 ? 'día' : 'días corridos'}. Clic para ordenar`}
              style={{ ...thD, cursor: 'pointer', color: orden === i ? '#F5C300' : undefined }}>
              {d === 1 ? 'En 1 día' : `En ${d} días`}{orden === i ? ' ▾' : ''}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {ordenadas.map(f => (
          <FilaDeMaximas key={f.cod} f={f} abierta={detalle === f.cod}
            onClick={() => onDetalle(detalle === f.cod ? null : f.cod)}
            desde={desde} hasta={hasta} />
        ))}
      </tbody>
    </table>

    <div style={{ color: '#555', marginTop: 9 }}>
      Cada número es la mayor lámina areal que juntó la cuenca en esa cantidad de días corridos,
      con las fechas en que pasó. La lámina de cada día sale del mismo IDW que el resto de la pantalla.
    </div>
    <div style={{ color: '#8a8a8a', marginTop: 5 }}>
      Los días en que la APA no publicó parte suman cero. Publica sólo cuando llueve, así que
      casi siempre es cierto; si un día llovió y no hubo parte, estos números quedan cortos.
    </div>
  </>)
}

function FilaDeMaximas({ f, abierta, onClick, desde, hasta }: {
  f: FilaMaximas; abierta: boolean; onClick: () => void; desde: string; hasta: string
}) {
  const sinSerie = f.cobertura <= 0
  const parcial = !sinSerie && f.cobertura < 0.9995

  return (
    <>
      <tr onClick={onClick} style={{
        borderTop: '1px solid #141414', cursor: 'pointer',
        background: abierta ? 'rgba(245,195,0,0.05)' : 'transparent',
      }}>
        <td style={{ ...td, color: '#777' }}>{f.cod}</td>
        <td style={{ ...td, color: '#ccc' }}>
          {f.nombre}
          {parcial && (
            <span style={{ color: '#E8833A', fontSize: 11 }}
              title={`Sólo el ${nPct(f.cobertura)} % de la cuenca tiene un pluviómetro a menos de ${RADIO_KM} km`}>
              {' '}· cobertura {nPct(f.cobertura)} %
            </span>
          )}
        </td>
        {f.maximas.map((m, i) => (
          <td key={i} style={tdD}>
            {m === null ? <span style={{ color: '#555' }}>{sinSerie ? 'sin dato' : '—'}</span> : (<>
              <span style={{ display: 'inline-block', width: 9, height: 9, marginRight: 6,
                background: clasificar(m.mm).color, border: '1px solid #111', verticalAlign: 'middle' }} />
              <b style={{ color: '#ccc' }}>{nMm(m.mm)} mm</b>
              <span style={{ display: 'block', fontSize: 11, color: '#666' }}>
                {m.mm > 0 ? fRango(m.desde, m.hasta) : 'sin lluvia'}
              </span>
            </>)}
          </td>
        ))}
      </tr>

      {abierta && (
        <tr>
          <td />
          <td colSpan={1 + VENTANAS_DIAS.length} style={{ padding: '6px 0 12px' }}>
            {sinSerie
              ? <div style={{ color: '#9aa0a6' }}>
                  Ningún pluviómetro a menos de {RADIO_KM} km de esta cuenca: no tiene serie.
                </div>
              : <Hietograma serie={f.serie} desde={desde} hasta={hasta} />}
          </td>
        </tr>
      )}
    </>
  )
}

/**
 * La lámina de una cuenca día por día.
 *
 * **Tres estados que se tienen que poder distinguir**, como en el mapa: barra =
 * llovió; raya gris = hubo parte y la cuenca dio cero; nada = la APA no publicó
 * parte ese día. Los dos últimos casi siempre significan lo mismo, pero uno es
 * una medición y el otro una deducción.
 *
 * Una sola serie y un solo eje: no lleva leyenda de colores, el amarillo marca
 * el período elegido arriba y nada más.
 */
function Hietograma({ serie, desde, hasta }: { serie: DiaCuenca[]; desde: string; hasta: string }) {
  const ALTO = 64
  const maximo = Math.max(1, ...serie.map(d => d.mm ?? 0))
  const pico = serie.reduce<DiaCuenca | null>((a, d) => ((d.mm ?? 0) > (a?.mm ?? 0) ? d : a), null)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#666', marginBottom: 4 }}>
        <span>Lámina areal diaria, en mm</span>
        <span>
          {pico && (pico.mm ?? 0) > 0
            ? <>mayor día: <b style={{ color: '#ccc' }}>{nMm(pico.mm)} mm</b> el {fCorta(pico.fecha)}</>
            : 'sin lluvia en la serie'}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: ALTO,
        borderBottom: '1px solid #2a2a2a' }}>
        {serie.map(d => {
          const dentro = d.fecha >= desde && d.fecha <= hasta
          const mm = d.mm ?? 0
          const alto = d.mm === null ? 0 : mm > 0 ? Math.max(3, Math.round((mm / maximo) * ALTO)) : 2
          return (
            <div key={d.fecha}
              title={`${fCorta(d.fecha)} · ${d.mm === null ? 'sin parte de la APA' : `${nMm(mm)} mm`}`}
              style={{ flex: 1, minWidth: 2, height: ALTO, display: 'flex', alignItems: 'flex-end',
                background: dentro ? 'rgba(245,195,0,0.07)' : 'transparent' }}>
              <div style={{ width: '100%', height: alto,
                background: mm > 0 ? (dentro ? '#F5C300' : '#4A90C2') : '#555' }} />
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#555', marginTop: 3 }}>
        <span>{fCorta(serie[0].fecha)}</span>
        <span>
          barra: llovió · raya gris: parte con 0 mm · vacío: sin parte · en amarillo, el período elegido
        </span>
        <span>{fCorta(serie[serie.length - 1].fecha)}</span>
      </div>
    </div>
  )
}
