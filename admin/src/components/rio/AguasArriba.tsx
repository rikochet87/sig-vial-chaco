'use client'
/**
 * Aguas arriba de Resistencia: el Paraná desde Misiones y el Paraguay desde
 * Asunción, en el panel del río.
 *
 * ── Qué contesta ──────────────────────────────────────────────────────────────
 *
 * Las franjas de Barranqueras y Corrientes dicen cuánto le falta al alerta acá.
 * Este bloque dice **qué viene**: qué está subiendo o bajando en las escalas por
 * donde pasa el agua antes de llegar. Por eso la columna central es la
 * tendencia —cuánto cambió en un día y en una semana— y no sólo la altura.
 *
 * ── Qué no afirma ─────────────────────────────────────────────────────────────
 *
 * **La columna «Llega a Barranqueras» es medida, no supuesta.** Sale del
 * registro de 1970 a hoy (`public/rio/tramo_diario.json`) con las mismas
 * funciones que la tabla «Traslado de la crecida» (`anticipaciones()` en
 * `lib/rioArriba.ts`): para el Paraná, cuántos días antes pasa el máximo de
 * una crecida por esa escala que por Barranqueras, en la mediana y con la
 * mitad de los años entre dos valores. No es un pronóstico de altura: dice
 * cuándo, no a cuánto.
 *
 * **El Paraguay y el Bermejo van aparte y se dice por qué**: no anuncian a
 * Barranqueras como el Paraná; crecen en otra época y lo que aportan es
 * caudal. A ellos se les informa el aporte, y al Bermejo, que en la altura de
 * Barranqueras no se distingue.
 *
 * **Ituzaingó está al pie de Yacyretá**: su altura la maneja la represa. Se
 * muestra con su umbral, que es el del INA, y con la aclaración.
 *
 * ── Cómo se ve ────────────────────────────────────────────────────────────────
 *
 * Renglones compactos, como el resto del tramo. Una estación que llega a su
 * alerta —medida o pronosticada— **se despliega en franja grande**, con el mismo
 * criterio que las de aguas abajo. La franja la dibuja `PanelRio`, que la pasa
 * por `franja`, para no tener dos dibujos del mismo gráfico.
 */
import { Fragment, useEffect, useMemo, useState } from 'react'
import { COLOR_ESTADO, type EstadoRio, type PuntoPronostico } from '@/lib/ina'
import {
  DIAS_ATRASO_ARRIBA, anticipaciones, sentidoDe,
  type Anticipacion, type Sentido, type Tendencia,
} from '@/lib/rioArriba'
import { useTramoDiario } from '@/hooks/useTramoDiario'

export interface EstacionArribaPanel {
  id: number
  nombre: string
  rio: 'Paraná' | 'Paraguay' | 'Bermejo'
  /** `null` donde el INA no publica umbral: El Colorado */
  alerta: number | null
  evacuacion: number | null
  observado: { fecha: string; m: number }[]
  pronostico: { emitido: string; puntos: PuntoPronostico[] } | null
  ultima: { fecha: string; m: number; estado: EstadoRio } | null
  margen: number | null
  tendencia: Tendencia | null
  descartadas: { fecha: string; m: number }[]
}

interface Respuesta {
  estaciones: EstacionArribaPanel[]
  sinRespuesta: string[]
  motivos: string[]
}

interface Props {
  dias: number
  /** Dibuja la franja grande de una estación que llegó al alerta */
  franja: (e: EstacionArribaPanel) => React.ReactNode
  /**
   * Avisa qué estaciones llegaron, para que el panel no las repita abajo.
   * **Tiene que ser estable** (un `setState`): está en las dependencias del pedido.
   */
  alCargar?: (ids: number[]) => void
}

const nMetros = (m: number) => m.toFixed(2).replace('.', ',')
const conSigno = (m: number) => `${m > 0 ? '+' : m < 0 ? '−' : '±'}${Math.abs(m).toFixed(2).replace('.', ',')}`
const soloFecha = (f: string) => f.slice(0, 10).split('-').reverse().slice(0, 2).join('/')

/** Días de serie que se dibujan en la mini serie del renglón */
const DIAS_MINI = 30

const SENTIDO: Record<Sentido, { glifo: string; color: string; texto: string }> = {
  sube:     { glifo: '▲', color: '#E8A87C', texto: 'sube' },
  baja:     { glifo: '▼', color: '#a0a0a0', texto: 'baja' },
  quieto:   { glifo: '■', color: '#8f8f8f', texto: 'estable' },
  sin_dato: { glifo: '·', color: '#8f8f8f', texto: 'sin dato de ayer' },
}

const GRUPOS: { rio: 'Paraná' | 'Paraguay' | 'Bermejo'; titulo: string; nota: string }[] = [
  {
    rio: 'Paraná',
    titulo: 'Paraná, desde Misiones',
    nota: 'La onda baja de una escala a la siguiente. «Llega a Barranqueras» es cuántos días '
      + 'antes pasa por cada una el máximo de una crecida, medido sobre 1970 a hoy. Ituzaingó '
      + 'está al pie de Yacyretá y su altura la maneja la represa.',
  },
  {
    rio: 'Paraguay',
    titulo: 'Paraguay, desde Asunción',
    nota: 'No anuncia a Barranqueras como el Paraná: crece en invierno y el Paraná en verano. '
      + 'Lo que aporta es caudal, cerca de un 18 % del que pasa frente a Barranqueras y hasta un '
      + '22 % en julio. «Llega a Barranqueras» es con qué desfase sus cambios se parecen a lo '
      + 'que el Paraná no explica.',
  },
  {
    rio: 'Bermejo',
    titulo: 'Bermejo, antes de entrar al Paraguay',
    nota: 'Crece con las lluvias de verano en Salta y Bolivia y aporta un 2 % del caudal, hasta '
      + 'un 6 % en marzo. En la altura de Barranqueras no se distingue. El INA no publica umbral '
      + 'para esta escala y la carga con meses de atraso.',
  },
]

/** Mismo criterio que las de aguas abajo: el umbral es el que publica el INA */
function pideAtencion(e: EstacionArribaPanel): boolean {
  // Sin umbral publicado no hay alerta que alcanzar
  const alerta = e.alerta
  if (alerta === null) return false
  if (e.ultima && e.ultima.m >= alerta) return true
  const pico = e.pronostico?.puntos.reduce((a, p) => Math.max(a, p.m), -Infinity)
  return pico !== undefined && Number.isFinite(pico) && pico >= alerta
}

export default function AguasArriba({ dias, franja, alCargar }: Props) {
  const [datos, setDatos] = useState<Respuesta | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    fetch(`/api/rio/arriba?dias=${dias}`)
      .then(async r => {
        const j = await r.json()
        if (!r.ok) throw new Error(j?.error ?? `el servidor respondió ${r.status}`)
        // Una respuesta cacheada puede ser más vieja que este cliente: se normaliza
        return {
          estaciones: (Array.isArray(j?.estaciones) ? j.estaciones : [])
            .map((e: EstacionArribaPanel) => ({
              ...e,
              descartadas: Array.isArray(e?.descartadas) ? e.descartadas : [],
              tendencia: e?.tendencia ?? null,
            })),
          sinRespuesta: Array.isArray(j?.sinRespuesta) ? j.sinRespuesta : [],
          motivos: Array.isArray(j?.motivos) ? j.motivos : [],
        } as Respuesta
      })
      .then(j => {
        if (!vivo) return
        setDatos(j)
        setError(null)
        alCargar?.(j.estaciones.map(e => e.id))
      })
      .catch(e => { if (vivo) setError(e instanceof Error ? e.message : 'no se pudo consultar') })
    return () => { vivo = false }
    // `alCargar` tiene que ser estable —el padre pasa un `setState`—: si
    // cambiara en cada render, este efecto volvería a pedirle todo al INA.
  }, [dias, alCargar])

  /*
   * La anticipación medida. El registro lo comparte con «Traslado de la
   * crecida» (`useTramoDiario`) y el cálculo se guarda por archivo, así que
   * abrir el panel no lo hace dos veces. Si no carga, la columna dice «—» y el
   * resto del bloque sigue: es la parte histórica, no la del día.
   */
  const { tramo } = useTramoDiario()
  const anticipa = useMemo(() => (tramo ? anticipaciones(tramo) : null), [tramo])

  const margenMax = useMemo(
    () => Math.max(1, ...(datos?.estaciones ?? []).map(e => Math.abs(e.margen ?? 0))),
    [datos],
  )

  return (
    <div style={{ borderTop: '1px solid #232323', paddingTop: 9, marginTop: 12 }}>
      <div style={{ fontSize: 11, color: '#c4c4c4', letterSpacing: 1, textTransform: 'uppercase',
        borderLeft: '3px solid #F5C300', paddingLeft: 7, marginBottom: 4 }}>
        Aguas arriba de Resistencia
      </div>
      <div style={{ fontSize: 11, color: '#8f8f8f', lineHeight: 1.5, marginBottom: 6 }}>
        Por donde pasa el agua antes de llegar a Barranqueras. Lo que sube allá se ve
        después acá: «Llega a Barranqueras» es cuántos días antes, medido sobre el registro
        de 1970 a hoy. La referencia es siempre la escala de Barranqueras.
      </div>

      {error && (
        <div style={{ fontSize: 11, color: '#E8A87C', lineHeight: 1.5 }}>
          No se pudieron consultar las escalas aguas arriba: {error}. El resto del panel no
          se ve afectado.
        </div>
      )}
      {!error && !datos && (
        <div style={{ fontSize: 11, color: '#8f8f8f' }}>Consultando las escalas aguas arriba…</div>
      )}

      {datos && GRUPOS.map(g => {
        const est = datos.estaciones.filter(e => e.rio === g.rio)
        if (est.length === 0) return null
        const grandes = est.filter(pideAtencion)
        return (
          <div key={g.rio} style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, color: '#a0a0a0', marginBottom: 2 }}>{g.titulo}</div>
            <div style={{ fontSize: 11, color: '#8f8f8f', lineHeight: 1.5, marginBottom: 4 }}>
              {g.nota}
            </div>

            {grandes.map(e => <Fragment key={e.id}>{franja(e)}</Fragment>)}

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 760, fontSize: 11, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: '#8f8f8f', textAlign: 'left' }}>
                    <th style={th}>Escala</th>
                    <th style={{ ...th, textAlign: 'right' }}>Altura</th>
                    <th style={{ ...th, textAlign: 'right' }}>24 h</th>
                    <th style={{ ...th, textAlign: 'right' }}>7 días</th>
                    <th style={{ ...th, paddingLeft: 12 }}>Llega a Barranqueras</th>
                    <th style={{ ...th, paddingLeft: 12 }}>Al alerta</th>
                    <th style={th}>Últimos {DIAS_MINI} días</th>
                    <th style={{ ...th, textAlign: 'right' }}>Pronóstico</th>
                  </tr>
                </thead>
                <tbody>
                  {est.map(e => (
                    <Renglon key={e.id} e={e} margenMax={margenMax}
                      anticipa={anticipa ? anticipa.get(e.id) ?? null : undefined} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}

      {datos && datos.sinRespuesta.length > 0 && (
        <div style={{ fontSize: 11, color: '#E8833A', marginTop: 6 }}>
          Sin responder: {datos.sinRespuesta.join(', ')}.
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = {
  fontWeight: 'normal', padding: '2px 0 4px', borderBottom: '1px solid #232323',
  textTransform: 'uppercase', letterSpacing: 0.8,
}

/**
 * La anticipación en palabras. `undefined` mientras carga el registro; `null`
 * si para esa escala no hay resultado (pocos años en común, o la cima cae en el
 * borde del rango probado).
 */
function Anticipa({ a }: { a: Anticipacion | null | undefined }) {
  if (a === undefined) return <span style={{ color: '#8f8f8f' }}>…</span>
  if (a === null) return <span style={{ color: '#8f8f8f' }}>—</span>
  const dias = (d: number) => {
    const n = Math.abs(d)
    return d === 0 ? 'el mismo día' : `${n} día${n === 1 ? '' : 's'} ${d < 0 ? 'antes' : 'después'}`
  }
  const sig = (d: number) => (d === 0 ? '0' : `${d < 0 ? '−' : '+'}${Math.abs(d)}`)
  if (a.tipo === 'traslado') {
    return (
      <span title={`Mediana sobre ${a.usados} de ${a.anios} años; la mitad entre ${sig(a.p25)} y ${sig(a.p75)} días`}>
        <span style={{ color: '#ddd' }}>{dias(a.mediana)}</span>
        <span style={{ color: '#8f8f8f' }}> · {sig(a.p25)} a {sig(a.p75)}</span>
      </span>
    )
  }
  if (a.tipo === 'aporte') {
    return (
      <span title={`Correlación ${a.r.toFixed(2).replace('.', ',')} sobre lo que el Paraná no explica`}>
        <span style={{ color: '#c4c4c4' }}>aporta, {dias(a.k)}</span>
        <span style={{ color: '#8f8f8f' }}> · {sig(a.desde)} a {sig(a.hasta)}</span>
      </span>
    )
  }
  return (
    <span style={{ color: '#8f8f8f' }} title={`Correlación ${a.r.toFixed(2).replace('.', ',')}`}>
      no se distingue
    </span>
  )
}

function Renglon({ e, margenMax, anticipa }: {
  e: EstacionArribaPanel; margenMax: number; anticipa: Anticipacion | null | undefined
}) {
  const t = e.tendencia
  const s = SENTIDO[sentidoDe(t?.cambio1 ?? null)]
  const atrasada = t !== null && t.atraso >= DIAS_ATRASO_ARRIBA
  const n = e.descartadas.length

  return (
    <>
      <tr>
        <td style={{ color: '#c4c4c4', padding: '4px 0', whiteSpace: 'nowrap' }}>
          {e.nombre}
          {atrasada && t && (
            <span style={{ color: '#E8833A', marginLeft: 6 }}>
              última {soloFecha(t.ultima.fecha)}
            </span>
          )}
        </td>
        <td style={{ textAlign: 'right', color: e.ultima ? COLOR_ESTADO[e.ultima.estado] : '#8f8f8f' }}>
          {e.ultima ? `${nMetros(e.ultima.m)} m` : '—'}
        </td>
        <td style={{ textAlign: 'right', color: s.color, whiteSpace: 'nowrap' }}
          title={s.texto}>
          {t?.cambio1 != null ? <>{s.glifo} {conSigno(t.cambio1)}</> : '—'}
        </td>
        <td style={{ textAlign: 'right', color: '#a0a0a0', whiteSpace: 'nowrap' }}>
          {t?.cambio7 != null ? conSigno(t.cambio7) : '—'}
        </td>
        <td style={{ paddingLeft: 12, whiteSpace: 'nowrap' }}>
          <Anticipa a={anticipa} />
        </td>
        <td style={{ paddingLeft: 12, whiteSpace: 'nowrap' }}>
          {e.alerta === null && <span style={{ color: '#8f8f8f' }}>sin umbral</span>}
          {e.margen !== null && e.ultima && (
            e.margen > 0 ? (
              <>
                <span style={{
                  display: 'inline-block', verticalAlign: 'middle', height: 6,
                  background: COLOR_ESTADO[e.ultima.estado],
                  width: `${Math.max(4, (e.margen / margenMax) * 60)}px`,
                }} />
                <span style={{ color: '#8f8f8f', marginLeft: 8 }}>{nMetros(e.margen)} m</span>
              </>
            ) : (
              <span style={{ color: COLOR_ESTADO[e.ultima.estado] }}>
                sobre el alerta ({nMetros(-e.margen)} m)
              </span>
            )
          )}
        </td>
        <td><MiniSerie e={e} /></td>
        <td style={{ textAlign: 'right', color: '#8f8f8f', whiteSpace: 'nowrap' }}>
          {e.pronostico && e.pronostico.puntos.length > 0
            ? <span style={{ color: '#85B7EB' }}>
                al {soloFecha(e.pronostico.puntos[e.pronostico.puntos.length - 1].fecha)}
              </span>
            : 'sin corrida'}
        </td>
      </tr>
      {n > 0 && (
        <tr>
          <td colSpan={8} style={{ color: '#b98a64', paddingBottom: 4 }}>
            {n === 1 ? 'Se omitió 1 lectura' : `Se omitieron ${n} lecturas`} del INA por salto
            imposible ({e.descartadas.slice(0, 3).map(l => `${soloFecha(l.fecha)}: ${nMetros(l.m)} m`).join(' · ')}
            {n > 3 ? '…' : ''}).
          </td>
        </tr>
      )}
    </>
  )
}

/**
 * La serie de los últimos días, ajustada al dato. Es para ver la forma —si
 * viene subiendo o bajando hace días—, no para leer alturas: para eso está el
 * número. Si el alerta cae dentro del recuadro, se marca.
 */
function MiniSerie({ e }: { e: EstacionArribaPanel }) {
  const ANCHO = 100, ALTO = 20
  if (e.observado.length < 2) return <span style={{ color: '#8f8f8f' }}>—</span>

  const fin = Date.parse(e.observado[e.observado.length - 1].fecha)
  const ini = fin - DIAS_MINI * 86_400_000
  const pts = e.observado.filter(o => Date.parse(o.fecha) >= ini)
  if (pts.length < 2) return <span style={{ color: '#8f8f8f' }}>—</span>

  const vals = pts.map(p => p.m)
  const min = Math.min(...vals), max = Math.max(...vals)
  const aire = Math.max(0.05, (max - min) * 0.15)
  const lo = min - aire, hi = max + aire
  const x = (f: string) => ((Date.parse(f) - ini) / (fin - ini)) * ANCHO
  const y = (m: number) => ALTO - ((m - lo) / (hi - lo)) * ALTO
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.fecha).toFixed(1)} ${y(p.m).toFixed(1)}`).join(' ')
  const color = e.ultima ? COLOR_ESTADO[e.ultima.estado] : '#8a8a8a'

  return (
    <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} preserveAspectRatio="none"
      style={{ width: 110, height: 20, display: 'block', background: '#141414' }}
      aria-label={`Altura de ${e.nombre} en los últimos ${DIAS_MINI} días`}>
      {e.alerta !== null && e.alerta >= lo && e.alerta <= hi && (
        <line x1={0} x2={ANCHO} y1={y(e.alerta)} y2={y(e.alerta)} stroke="#EF9F27"
          strokeWidth={0.6} strokeDasharray="2 1.5" vectorEffect="non-scaling-stroke" />
      )}
      <path d={d} fill="none" stroke={color} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
