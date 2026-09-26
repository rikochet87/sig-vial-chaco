'use client'

/**
 * El río Paraná, sobre el mismo eje de tiempo que la lluvia.
 *
 * ── Dos franjas grandes, no seis chicas ───────────────────────────────────────
 *
 * La primera versión dibujaba las seis estaciones apiladas con el mismo tamaño.
 * Con el río estable **las seis se ven idénticas**: seis líneas planas y
 * paralelas que dicen lo mismo seis veces y ocupan media pantalla.
 *
 * Lo único que justifica apilarlas es ver **pasar la onda de crecida** de aguas
 * arriba hacia abajo, y eso sólo aparece cuando algo se mueve. El resto del
 * tiempo, la información entera es el número y cuánto falta para el umbral.
 *
 * Así que van **dos franjas grandes** y el resto en renglones compactos:
 *
 * - **Barranqueras** es la del área metropolitana: la que decide acá.
 * - **Corrientes** es la que tiene serie desde 1901 y `cero_ign`. Es la única
 *   que puede sostener un "es la mayor en N años" y la única que se va a poder
 *   comparar contra cotas del terreno.
 *
 * Y las demás **se promueven solas a franja grande** si su altura observada o
 * su pronóstico llega al alerta. El criterio no es un número inventado por
 * nosotros: es el umbral que publica el INA para esa estación.
 *
 * ── Dos escalas, porque una sola miente por omisión ───────────────────────────
 *
 * Por omisión el eje incluye los dos umbrales, para ver cuán lejos está el río
 * de ellos. El costo es que con el río 1,5 m abajo **la variación real queda
 * aplastada contra el piso** y no se distingue si sube o baja. Por eso hay un
 * interruptor que ajusta el eje a la serie. Ninguna de las dos lecturas se
 * pierde a costa de la otra.
 *
 * ── Qué afirma y qué no ───────────────────────────────────────────────────────
 *
 * **No combina las dos amenazas.** La crecida se genera a miles de kilómetros y
 * la tormenta acá; son de causa distinta (ver `lib/ina.ts`). Río y lluvia
 * comparten el eje X y nada más: una serie está en metros y la otra en
 * milímetros, así que un eje Y compartido no significaría nada.
 *
 * El pronóstico se dibuja **como banda** —el INA publica `inferior`, `medio` y
 * `superior`—, porque mostrar sólo el medio presentaría como certeza algo que
 * la fuente entrega como rango.
 */

import { useEffect, useMemo, useState } from 'react'
import { COLOR_ESTADO, ETIQUETA_ESTADO, type EstadoRio, type PuntoPronostico } from '@/lib/ina'

const mono: React.CSSProperties = { fontFamily: 'monospace' }

/**
 * Las que siempre van en grande.
 *
 * Barranqueras primero por relevancia operativa, Corrientes después por ser la
 * que tiene el histórico y el datum.
 */
const DESTACADAS = [20, 19]

interface Lectura { fecha: string; m: number }

interface EstacionRio {
  id: number
  nombre: string
  rio: string
  alerta: number
  evacuacion: number
  ceroIgn: number | null
  observado: Lectura[]
  pronostico: { emitido: string; puntos: PuntoPronostico[] } | null
  ultima: { fecha: string; m: number; estado: EstadoRio } | null
  margen: number | null
}

interface Respuesta {
  desde: string; hasta: string; dias: number
  estaciones: EstacionRio[]
  sinRespuesta: string[]
  motivos: string[]
  fuente: string
}

interface Props {
  dias?: number
  desde?: string
  hasta?: string
}

const nMetros = (m: number) => m.toFixed(2).replace('.', ',')
const soloFecha = (f: string) => f.slice(0, 10).split('-').reverse().slice(0, 2).join('/')

/** ¿Esta estación merece franja grande aunque no sea destacada? */
function pideAtencion(e: EstacionRio): boolean {
  if (e.ultima && e.ultima.m >= e.alerta) return true
  const pico = e.pronostico?.puntos.reduce((a, p) => Math.max(a, p.m), -Infinity)
  return pico !== undefined && Number.isFinite(pico) && pico >= e.alerta
}

export default function PanelRio({ dias = 90, desde, hasta }: Props) {
  const [datos, setDatos] = useState<Respuesta | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [alDato, setAlDato] = useState(false)

  /*
   * El estado se toca sólo cuando llega la respuesta, no al empezar: un
   * `setError(null)` síncrono adentro del efecto provoca un render de más, y la
   * barrera de lint lo marca con razón.
   */
  useEffect(() => {
    let vivo = true
    fetch(`/api/rio?dias=${dias}`)
      .then(async r => {
        const j = await r.json()
        if (!r.ok) throw new Error(j?.error ?? `el servidor respondió ${r.status}`)
        /*
         * Se normaliza lo que viene del alambre antes de usarlo.
         *
         * No es paranoia: la respuesta se cachea media hora, así que **un campo
         * recién agregado al endpoint no está en la copia que el navegador ya
         * tiene**. Cuando se sumó `motivos`, el panel se cayó con "Cannot read
         * properties of undefined" leyendo una respuesta vieja perfectamente
         * válida. Un cliente tiene que tolerar que su servidor sea más viejo
         * que él.
         */
        return {
          ...j,
          estaciones: Array.isArray(j?.estaciones) ? j.estaciones : [],
          sinRespuesta: Array.isArray(j?.sinRespuesta) ? j.sinRespuesta : [],
          motivos: Array.isArray(j?.motivos) ? j.motivos : [],
        } as Respuesta
      })
      .then(j => { if (vivo) { setDatos(j); setError(null) } })
      .catch(e => { if (vivo) setError(e instanceof Error ? e.message : 'no se pudo consultar') })
    return () => { vivo = false }
  }, [dias])

  const { grandes, chicas, critica } = useMemo(() => {
    const est = datos?.estaciones ?? []
    const g = est.filter(e => DESTACADAS.includes(e.id) || pideAtencion(e))
    // Barranqueras y Corrientes primero, en ese orden; las promovidas después
    g.sort((a, b) => {
      const ia = DESTACADAS.indexOf(a.id), ib = DESTACADAS.indexOf(b.id)
      if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
      return 0
    })
    const c = est.filter(e => !g.includes(e))
    const conMargen = est.filter(e => e.margen !== null)
    return {
      grandes: g,
      chicas: c,
      critica: conMargen.length
        ? conMargen.reduce((a, b) => (b.margen! < a.margen! ? b : a))
        : null,
    }
  }, [datos])

  if (error) {
    return (
      <div style={{ ...mono, fontSize: 12, color: '#E8A87C', border: '1px solid #7a4a22',
        background: 'rgba(40,24,16,.5)', borderRadius: 3, padding: '8px 12px', marginTop: 8 }}>
        <b>No se pudo consultar el río.</b> {error}
        <div style={{ color: '#b98a64', marginTop: 2 }}>
          El Alerta Hidrológico del INA puede estar fuera de servicio. La lluvia no se ve afectada.
        </div>
      </div>
    )
  }

  if (!datos) {
    return (
      <div style={{ ...mono, fontSize: 12, color: '#5e656d', marginTop: 8 }}>
        Consultando el Alerta Hidrológico…
      </div>
    )
  }

  /*
   * Si no contestó ninguna, el problema es la fuente y no seis estaciones que
   * casualmente fallaron a la vez. Se dice así, con el motivo, en vez de
   * mostrar una lista de seis renglones que repiten "sin responder".
   */
  if (datos.estaciones.length === 0) {
    return (
      <div style={{ ...mono, fontSize: 12, color: '#E8A87C', border: '1px solid #7a4a22',
        background: 'rgba(40,24,16,.5)', borderRadius: 3, padding: '8px 12px', marginTop: 8 }}>
        <b>El Alerta Hidrológico del INA no respondió.</b> Ninguna de las
        {' '}{datos.sinRespuesta.length} estaciones devolvió datos.
        {datos.motivos[0] && (
          <div style={{ color: '#b98a64', marginTop: 2 }}>{datos.motivos[0]}</div>
        )}
        <div style={{ color: '#b98a64', marginTop: 2 }}>
          La lluvia no se ve afectada: son fuentes distintas.
        </div>
      </div>
    )
  }

  /** Para que las barritas del resumen sean comparables entre sí */
  const margenMax = Math.max(1, ...datos.estaciones.map(e => e.margen ?? 0))

  return (
    <div style={{ ...mono, border: '1px solid #1e1e1e', background: '#191919', marginTop: 8 }}>
      <button onClick={() => setAbierto(a => !a)} style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
        padding: '7px 12px', cursor: 'pointer', background: 'transparent', border: 'none',
        ...mono, fontSize: 12, color: '#999',
      }}>
        <span style={{ color: '#555' }}>{abierto ? '▾' : '▸'}</span>
        <span style={{ flex: 1 }}>
          Río Paraná
          {critica?.ultima && (
            <>
              {' — '}
              <b style={{ color: COLOR_ESTADO[critica.ultima.estado] }}>
                {critica.nombre} {nMetros(critica.ultima.m)} m
              </b>
              <span style={{ color: '#666' }}>
                {critica.margen !== null && critica.margen > 0
                  ? `, a ${nMetros(critica.margen)} m del alerta`
                  : ', sobre el nivel de alerta'}
              </span>
            </>
          )}
        </span>
        {datos.sinRespuesta.length > 0 && (
          <span style={{ color: '#E8833A', fontSize: 11 }}>
            sin responder: {datos.sinRespuesta.join(', ')}
          </span>
        )}
      </button>

      {abierto && (
        <div style={{ padding: '2px 12px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: '#5e656d', flex: 1, lineHeight: 1.5 }}>
              Altura sobre el cero de escala. <b style={{ color: '#7a8189' }}>La crecida no la
              genera la lluvia de acá</b>: viene de las cuencas altas con días o semanas de
              retardo. Comparten el eje de tiempo para ver si coinciden, no para sumarlas.
            </span>
            <button onClick={() => setAlDato(v => !v)} style={{
              ...mono, fontSize: 11, padding: '3px 9px', borderRadius: 3, cursor: 'pointer',
              background: 'transparent', border: '1px solid #2d2d2d',
              color: alDato ? '#F5C300' : '#8a8a8a', flexShrink: 0,
            }}>
              {alDato ? 'ver umbrales' : 'ajustar al dato'}
            </button>
          </div>

          {grandes.map(e => (
            <Franja key={e.id} est={e} desde={desde} hasta={hasta} alDato={alDato}
              promovida={!DESTACADAS.includes(e.id)} />
          ))}

          {(chicas.length > 0 || datos.sinRespuesta.length > 0) && (
            <>
              <div style={{ fontSize: 11, color: '#5e656d', borderTop: '1px solid #232323',
                paddingTop: 9, margin: '12px 0 6px' }}>
                Resto del tramo, de aguas arriba hacia abajo
              </div>
              <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                <tbody>
                  {chicas.map(e => (
                    <tr key={e.id}>
                      <td style={{ color: '#9a9a9a', padding: '3px 0' }}>{e.nombre}</td>
                      <td style={{ width: 62, textAlign: 'right', color: '#c4c4c4' }}>
                        {e.ultima ? `${nMetros(e.ultima.m)} m` : '—'}
                      </td>
                      <td style={{ paddingLeft: 12, width: '45%' }}>
                        {e.margen !== null && (
                          <>
                            <span style={{
                              display: 'inline-block', verticalAlign: 'middle', height: 6,
                              borderRadius: 3, background: COLOR_ESTADO[e.ultima!.estado],
                              width: `${Math.max(4, (e.margen / margenMax) * 70)}px`,
                            }} />
                            <span style={{ color: '#666', marginLeft: 8 }}>
                              {nMetros(e.margen)} al alerta
                            </span>
                          </>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', color: e.pronostico ? '#85B7EB' : '#4a4a4a' }}>
                        {e.pronostico ? 'pronóstico' : 'sin corrida'}
                      </td>
                    </tr>
                  ))}
                  {datos.sinRespuesta.map(n => (
                    <tr key={n}>
                      <td style={{ color: '#5e656d', padding: '3px 0' }}>{n}</td>
                      <td style={{ textAlign: 'right', color: '#5e656d' }}>—</td>
                      <td style={{ paddingLeft: 12, color: '#E8833A' }}>sin responder</td>
                      <td />
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <div style={{ fontSize: 11, color: '#4a4a4a', marginTop: 10, lineHeight: 1.5,
            borderTop: '1px solid #232323', paddingTop: 9 }}>
            Umbrales de alerta y evacuación publicados por el INA para cada estación — no son
            criterios de este sistema. Si alguna del resto llega a su alerta, se despliega
            entera. Fuente: {datos.fuente}.
            {datos.estaciones.some(e => e.id === 20 && e.ceroIgn === null) && (
              <> Barranqueras no publica su cero de escala referido al datum del IGN, así que
              su altura no se puede comparar contra cotas del terreno; Corrientes sí lo tiene.</>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Franja({ est, desde, hasta, alDato, promovida }: {
  est: EstacionRio; desde?: string; hasta?: string; alDato: boolean; promovida: boolean
}) {
  const ALTO = 34
  const serie = est.observado

  if (serie.length === 0) {
    return (
      <div style={{ fontSize: 11, color: '#5e656d', margin: '6px 0' }}>
        {est.nombre}: sin observaciones en el período.
      </div>
    )
  }

  const pron = est.pronostico?.puntos ?? []
  const medio = pron.filter(p => p.banda === 'medio')
  const inf = pron.filter(p => p.banda === 'inferior')
  const sup = pron.filter(p => p.banda === 'superior')

  /*
   * Con `alDato` el eje se ajusta a la serie y se pierden de vista los
   * umbrales; sin él, los umbrales entran siempre aunque aplasten la variación.
   * Las dos lecturas son legítimas y por eso el interruptor.
   */
  const valores = alDato
    ? [...serie.map(s => s.m), ...pron.map(p => p.m)]
    : [...serie.map(s => s.m), ...pron.map(p => p.m), est.alerta, est.evacuacion]
  const crudoMax = Math.max(...valores)
  const crudoMin = Math.min(...valores)
  const aire = Math.max(0.05, (crudoMax - crudoMin) * 0.12)
  const max = crudoMax + aire
  const min = crudoMin - aire
  const rango = max - min || 1

  const t0 = new Date(serie[0].fecha).getTime()
  const tFin = Math.max(
    new Date(serie[serie.length - 1].fecha).getTime(),
    ...pron.map(p => new Date(p.fecha).getTime()),
  )
  const span = tFin - t0 || 1

  const x = (f: string) => ((new Date(f).getTime() - t0) / span) * 100
  const y = (m: number) => ALTO - ((m - min) / rango) * ALTO
  const dentro = (m: number) => m >= min && m <= max

  const camino = (pts: { fecha: string; m: number }[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.fecha).toFixed(2)} ${y(p.m).toFixed(2)}`).join(' ')

  const banda = inf.length && sup.length
    ? `${camino(sup)} ${[...inf].reverse().map(p => `L ${x(p.fecha).toFixed(2)} ${y(p.m).toFixed(2)}`).join(' ')} Z`
    : null

  const u = est.ultima
  const color = u ? COLOR_ESTADO[u.estado] : '#8a8a8a'

  return (
    <div style={{ margin: '10px 0 14px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 11, marginBottom: 3 }}>
        <span style={{ color: '#ddd' }}>{est.nombre}</span>
        {promovida && (
          <span style={{ color: '#E8833A' }}>llega al alerta</span>
        )}
        {u && (
          <>
            <b style={{ color }}>{nMetros(u.m)} m</b>
            <span style={{ color: '#666' }}>{ETIQUETA_ESTADO[u.estado]}</span>
            <span style={{ color: '#4a4a4a' }}>
              alerta {nMetros(est.alerta)} · evac {nMetros(est.evacuacion)}
            </span>
          </>
        )}
        <span style={{ flex: 1 }} />
        {est.pronostico
          ? <span style={{ color: '#4a4a4a' }}>
              pronóstico al {soloFecha(est.pronostico.puntos[est.pronostico.puntos.length - 1].fecha)}
            </span>
          : <span style={{ color: '#4a4a4a' }}>sin corrida publicada</span>}
      </div>

      <svg viewBox={`0 0 100 ${ALTO}`} preserveAspectRatio="none"
        style={{ width: '100%', height: 96, display: 'block', background: '#141414' }}>
        {desde && hasta && (
          <rect x={x(desde)} width={Math.max(0.4, x(hasta) - x(desde))} y={0} height={ALTO}
            fill="rgba(245,195,0,0.07)" />
        )}

        {/* Al ajustar al dato, los umbrales suelen quedar fuera: no se dibujan */}
        {dentro(est.evacuacion) && (
          <line x1={0} x2={100} y1={y(est.evacuacion)} y2={y(est.evacuacion)}
            stroke="#C0392B" strokeWidth={0.4} strokeDasharray="2 1.5" vectorEffect="non-scaling-stroke" />
        )}
        {dentro(est.alerta) && (
          <line x1={0} x2={100} y1={y(est.alerta)} y2={y(est.alerta)}
            stroke="#EF9F27" strokeWidth={0.4} strokeDasharray="2 1.5" vectorEffect="non-scaling-stroke" />
        )}

        {banda && <path d={banda} fill="rgba(133,183,235,0.16)" stroke="none" />}
        {medio.length > 1 && (
          <path d={camino(medio)} fill="none" stroke="#85B7EB" strokeWidth={1}
            strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
        )}

        <path d={camino(serie)} fill="none" stroke={color} strokeWidth={1.4}
          vectorEffect="non-scaling-stroke" />
      </svg>

      {alDato && (
        <div style={{ fontSize: 11, color: '#4a4a4a', marginTop: 2 }}>
          Eje ajustado a la serie: {nMetros(min)} a {nMetros(max)} m.
          {!dentro(est.alerta) && ' El alerta queda fuera del recuadro.'}
        </div>
      )}
    </div>
  )
}
