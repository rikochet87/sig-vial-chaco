'use client'
/**
 * Lluvias — cuántos milímetros cayeron y dónde.
 *
 * El caso de uso que manda es el de después de la tormenta: entrar y ver de un
 * vistazo qué consorcios recibieron más agua, para decidir a dónde mandar
 * equipos y a dónde no. Por eso la pantalla abre con el último episodio
 * detectado y no con un rango arbitrario: lo que se quiere mirar es el evento,
 * que puede haber durado dos o tres días.
 *
 * Los otros dos usos salen de los mismos datos: el rango libre sirve para
 * documentar las fechas de una obra, y el acumulado por consorcio es el
 * histórico que se va juntando solo con el cron diario.
 */

import { useEffect, useMemo, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useUser } from '@/lib/UserContext'
import {
  UMBRALES, clasificar, hace, aISO, rangoLluvia, mmRedondeado,
  type ResumenConsorcio, type Episodio,
} from '@/lib/lluvia'

const PanelMediciones = dynamic(() => import('@/components/PanelMediciones'), { ssr: false })

const MapaLluvia = dynamic(() => import('@/components/MapaLluvia'), {
  ssr: false,
  loading: () => <div style={{ ...mono, color: '#444', fontSize: 13, padding: 20 }}>Cargando mapa…</div>,
})

const mono: React.CSSProperties = { fontFamily: 'monospace' }
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 12, color: '#555', textTransform: 'uppercase',
  letterSpacing: 0.8, ...mono, marginBottom: 4,
}
const inp: React.CSSProperties = {
  background: '#0a0a0a', border: '1px solid #222', color: '#ddd',
  padding: '6px 9px', fontSize: 13, ...mono, outline: 'none', borderRadius: 2,
}

const fmtFecha = (f: string) => f.split('-').reverse().join('/')

type Orden = 'mm' | 'pico' | 'numero'

export default function LluviaPage() {
  const { profile } = useUser()
  const esAdmin = profile?.rol === 'admin'

  const [desde, setDesde] = useState(hace(7))
  const [hasta, setHasta] = useState(aISO(new Date()))
  const [datos, setDatos] = useState<ResumenConsorcio[]>([])
  const [episodios, setEpisodios] = useState<Episodio[]>([])
  const [ultimaCarga, setUltimaCarga] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [seleccionado, setSeleccionado] = useState<number | null>(null)
  const [orden, setOrden] = useState<Orden>('mm')
  const [ingiriendo, setIngiriendo] = useState(false)
  const [progreso, setProgreso] = useState<
    { hecho: number; total: number; desde: string; hasta: string } | null
  >(null)
  const [autoEpisodio, setAutoEpisodio] = useState(true)
  const [vista, setVista] = useState<'mapa' | 'precision'>('mapa')

  const cargar = useCallback(async (d: string, h: string) => {
    setCargando(true); setError(null)
    try {
      const r = await fetch(`/api/lluvia?desde=${d}&hasta=${h}`)
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'No se pudo consultar')
      const j = await r.json()
      setDatos(j.consorcios ?? [])
      setEpisodios(j.episodios ?? [])
      setUltimaCarga(j.ultimaFechaCargada ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al consultar')
      setDatos([])
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargar(desde, hasta) }, [cargar, desde, hasta])

  /**
   * Al entrar, saltar al último episodio en vez de quedarse en "los últimos 7
   * días": si la tormenta fue el martes y hoy es viernes, el acumulado semanal
   * dice lo mismo pero el rango del evento es lo que se quiere ver y citar.
   */
  useEffect(() => {
    if (!autoEpisodio || cargando || episodios.length === 0) return
    const e = episodios[0]
    setAutoEpisodio(false)
    if (e.desde !== desde || e.hasta !== hasta) { setDesde(e.desde); setHasta(e.hasta) }
  }, [autoEpisodio, cargando, episodios, desde, hasta])

  const ordenados = useMemo(() => {
    const xs = [...datos]
    if (orden === 'mm')     xs.sort((a, b) => b.mm - a.mm || a.numero - b.numero)
    if (orden === 'pico')   xs.sort((a, b) => b.mmMaxDia - a.mmMaxDia || a.numero - b.numero)
    if (orden === 'numero') xs.sort((a, b) => a.numero - b.numero)
    return xs
  }, [datos, orden])

  const conDato = datos.filter(d => d.mm > 0)
  const maximo  = conDato.length ? Math.max(...conDato.map(d => d.mm)) : 0
  const promedio = conDato.length ? conDato.reduce((s, d) => s + d.mm, 0) / conDato.length : 0
  const afectados = datos.filter(d => d.mm >= 40).length

  /**
   * Trae el rango en ventanas de dos semanas, de a una.
   *
   * El servicio cobra una llamada por ubicación y corta en 600 por minuto: con
   * ~450 puntos, una ventana de 14 días entra justa y un mes entero no. Antes
   * un rango largo moría con un 429 y el mensaje crudo del servicio; ahora se
   * parte solo, se espera entre ventanas y se ve el avance.
   *
   * Cada ventana se guarda apenas llega, así que si se corta a la mitad lo
   * cargado queda: al reintentar sólo se repite lo que falta.
   */
  async function ingerir() {
    const VENTANA_DIAS = 14
    const PAUSA_MS = 20_000   // el cupo se libera por minuto

    const dia = 86_400_000
    const ventanas: [string, string][] = []
    for (let t = Date.parse(desde); t <= Date.parse(hasta); t += VENTANA_DIAS * dia) {
      const fin = Math.min(t + (VENTANA_DIAS - 1) * dia, Date.parse(hasta))
      ventanas.push([aISO(new Date(t)), aISO(new Date(fin))])
    }

    setIngiriendo(true); setError(null); setProgreso(null)
    try {
      for (let i = 0; i < ventanas.length; i++) {
        const [d, h] = ventanas[i]
        setProgreso({ hecho: i, total: ventanas.length, desde: d, hasta: h })

        const r = await fetch(`/api/lluvia/ingesta?desde=${d}&hasta=${h}`, { method: 'POST' })
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.error ?? 'No se pudo actualizar')

        // Entre ventanas hay que dejar respirar al cupo; en la última no
        if (i < ventanas.length - 1) await new Promise(res => setTimeout(res, PAUSA_MS))
      }
      setProgreso(null)
      await cargar(desde, hasta)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al actualizar')
      // Lo que alcanzó a cargarse ya está guardado: mostrarlo
      await cargar(desde, hasta)
    } finally {
      setIngiriendo(false)
      setProgreso(null)
    }
  }

  const hoy = aISO(new Date())
  const desactualizado = ultimaCarga !== null && ultimaCarga < hace(1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)', minHeight: 0 }}>

      {/* Encabezado */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14, flexShrink: 0 }}>
        <h1 style={{ color: '#e0e0e0', fontSize: 20, fontWeight: 700, letterSpacing: 0.5, ...mono, margin: 0 }}>
          Lluvias
        </h1>
        {!cargando && vista === 'mapa' && (
          <span style={{ color: '#444', fontSize: 13, ...mono }}>
            {conDato.length} de {datos.length} consorcios con registro
          </span>
        )}

        <div style={{ display: 'flex', border: '1px solid #252525' }}>
          {([['mapa', 'Mapa'], ['precision', 'Precisión']] as const).map(([v, t]) => (
            <button key={v} onClick={() => setVista(v)} style={{
              ...mono, fontSize: 13, padding: '5px 14px', cursor: 'pointer',
              border: 'none', letterSpacing: 0.5,
              background: vista === v ? '#1e1e1e' : 'transparent',
              color: vista === v ? '#F5C300' : '#555',
            }}>{t}</button>
          ))}
        </div>
      </div>

      {vista === 'precision' && (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <PanelMediciones esAdmin={esAdmin} />
        </div>
      )}

      {vista === 'mapa' && (<>

      {/* Episodios detectados */}
      {episodios.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ ...lbl, marginBottom: 0 }}>Episodios</span>
          {episodios.slice(0, 6).map(e => {
            const activo = e.desde === desde && e.hasta === hasta
            return (
              <button key={e.desde + e.hasta}
                onClick={() => { setDesde(e.desde); setHasta(e.hasta) }}
                style={{
                  ...mono, fontSize: 12, cursor: 'pointer', padding: '5px 10px',
                  background: activo ? 'rgba(245,195,0,0.10)' : 'transparent',
                  border: `1px solid ${activo ? '#5a4400' : '#222'}`,
                  color: activo ? '#F5C300' : '#777', textAlign: 'left', lineHeight: 1.45,
                }}>
                {e.desde === e.hasta ? fmtFecha(e.desde) : `${fmtFecha(e.desde)} → ${fmtFecha(e.hasta)}`}
                <span style={{ color: '#555' }}> · pico {mmRedondeado(e.mmPico)}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Filtros */}
      <div style={{
        background: '#191919', border: '1px solid #1e1e1e', padding: '12px 16px',
        marginBottom: 12, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end', flexShrink: 0,
      }}>
        <div>
          <label style={lbl}>Desde</label>
          <input type="date" value={desde} max={hasta}
            onChange={e => { setAutoEpisodio(false); setDesde(e.target.value) }} style={inp} />
        </div>
        <div>
          <label style={lbl}>Hasta</label>
          <input type="date" value={hasta} min={desde} max={hoy}
            onChange={e => { setAutoEpisodio(false); setHasta(e.target.value) }} style={inp} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {([['Últimos 7 días', 7], ['30 días', 30], ['90 días', 90]] as const).map(([txt, d]) => (
            <button key={d} onClick={() => { setAutoEpisodio(false); setDesde(hace(d)); setHasta(hoy) }}
              style={{ ...mono, fontSize: 12, cursor: 'pointer', padding: '6px 10px',
                background: 'transparent', border: '1px solid #222', color: '#777' }}>
              {txt}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {esAdmin && (
          <button onClick={ingerir} disabled={ingiriendo}
            title="Traer de nuevo los datos de este rango desde el servicio"
            style={{
              ...mono, fontSize: 13, cursor: ingiriendo ? 'default' : 'pointer', padding: '7px 14px',
              background: 'transparent', border: `1px solid ${ingiriendo ? '#333' : '#2e6b3e'}`,
              color: ingiriendo ? '#555' : '#7BC47F', fontWeight: 700,
            }}>
            {ingiriendo
              ? progreso
                ? `Cargando ${progreso.hecho + 1} de ${progreso.total}…`
                : 'Actualizando…'
              : '↻ Actualizar rango'}
          </button>
        )}
      </div>

      {/* Avance de la carga */}
      {progreso && (
        <div style={{
          ...mono, fontSize: 13, color: '#7BC47F', background: '#0a1408',
          border: '1px solid #2e6b3e', padding: '9px 13px', marginBottom: 12,
          flexShrink: 0, lineHeight: 1.5,
        }}>
          Trayendo {fmtFecha(progreso.desde)} → {fmtFecha(progreso.hasta)} · ventana{' '}
          {progreso.hecho + 1} de {progreso.total}
          <div style={{ height: 3, background: '#1a2a1a', marginTop: 7 }}>
            <div style={{
              height: '100%', background: '#2e6b3e',
              width: `${(progreso.hecho / progreso.total) * 100}%`,
              transition: 'width .3s',
            }} />
          </div>
          <div style={{ color: '#4a6a4a', fontSize: 12, marginTop: 6 }}>
            Va de a dos semanas con una pausa entre medio, porque el servicio limita
            las consultas por minuto. Cada ventana se guarda apenas llega: si cortás,
            no se pierde lo cargado.
          </div>
        </div>
      )}

      {/* Avisos */}
      {error && (
        <div style={{ ...mono, fontSize: 13, color: '#E57373', background: '#1a0c0c',
          border: '1px solid #5a2222', padding: '8px 12px', marginBottom: 12, flexShrink: 0 }}>
          {error}
        </div>
      )}
      {!error && ultimaCarga === null && !cargando && (
        <div style={{ ...mono, fontSize: 13, color: '#F5C300', background: '#2a1f00',
          border: '1px solid #5a4400', padding: '9px 13px', marginBottom: 12, flexShrink: 0, lineHeight: 1.5 }}>
          Todavía no hay datos cargados.{esAdmin
            ? ' Apretá «Actualizar rango» para traer el período, o esperá a que corra la carga automática de mañana.'
            : ' La carga automática corre cada mañana.'}
        </div>
      )}
      {!error && desactualizado && (
        <div style={{ ...mono, fontSize: 13, color: '#E8833A', background: '#1a1206',
          border: '1px solid #5a3a00', padding: '8px 12px', marginBottom: 12, flexShrink: 0 }}>
          El último día cargado es el {fmtFecha(ultimaCarga!)}. La carga automática puede haberse salteado.
        </div>
      )}

      {/* Resumen */}
      {!cargando && conDato.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', flexShrink: 0 }}>
          {[
            { label: 'Máximo',    val: mmRedondeado(maximo),   color: '#F5C300' },
            { label: 'Promedio',  val: mmRedondeado(promedio), color: '#4A90C2' },
            { label: 'Consorcios sobre 40 mm', val: String(afectados), color: afectados > 0 ? '#E8833A' : '#555' },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ background: '#191919', border: '1px solid #1e1e1e',
              borderLeft: `3px solid ${color}`, padding: '7px 13px' }}>
              <div style={{ color: '#555', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', ...mono }}>{label}</div>
              <div style={{ color, fontSize: 16, fontWeight: 700, ...mono, marginTop: 2 }}>{val}</div>
            </div>
          ))}
        </div>
      )}

      {/* Mapa + tabla */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 12 }}>

        <div style={{ flex: 1, minWidth: 0, position: 'relative',
          background: '#191919', border: '1px solid #1e1e1e' }}>
          <MapaLluvia datos={datos} seleccionado={seleccionado} onSeleccionar={setSeleccionado} />

          {/* Referencias */}
          <div style={{
            position: 'absolute', bottom: 12, left: 12, zIndex: 500,
            background: 'rgba(10,10,10,0.92)', border: '1px solid #262626',
            padding: '9px 12px', ...mono,
          }}>
            <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase',
              letterSpacing: 1, marginBottom: 6 }}>Acumulado</div>
            <div style={{ fontSize: 11, color: '#555', marginBottom: 6, lineHeight: 1.4 }}>
              Los caminos llevan el color de su consorcio
            </div>
            {UMBRALES.slice().reverse().map(u => (
              <div key={u.nivel} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                <span style={{ width: 11, height: 11, borderRadius: '50%', background: u.color,
                  border: '1px solid #111', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: '#bbb' }}>
                  {u.desde === 0 ? '0 mm' : `${u.desde}+ mm`}
                  <span style={{ color: '#555' }}> · {u.label}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Ranking */}
        <div style={{ width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column',
          background: '#191919', border: '1px solid #1e1e1e', minHeight: 0 }}>
          <div style={{ padding: '9px 12px', borderBottom: '1px solid #1e1e1e',
            display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }}>
            <span style={{ ...lbl, marginBottom: 0, flex: 1 }}>Ordenar por</span>
            {([['mm', 'Acumulado'], ['pico', 'Día pico'], ['numero', 'Nº']] as const).map(([k, t]) => (
              <button key={k} onClick={() => setOrden(k)} style={{
                ...mono, fontSize: 12, cursor: 'pointer', padding: '3px 8px', border: 'none',
                background: orden === k ? '#252525' : 'transparent',
                color: orden === k ? '#F5C300' : '#555',
              }}>{t}</button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {cargando && <div style={{ padding: 16, ...mono, fontSize: 13, color: '#555' }}>Cargando…</div>}

            {!cargando && ordenados.map(c => {
              const nivel  = clasificar(c.mm)
              const activo = c.numero === seleccionado
              return (
                <button key={c.numero}
                  onClick={() => setSeleccionado(activo ? null : c.numero)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                    padding: '8px 12px', cursor: 'pointer', ...mono,
                    background: activo ? 'rgba(245,195,0,0.07)' : 'transparent',
                    border: 'none', borderBottom: '1px solid #141414',
                    borderLeft: `3px solid ${activo ? '#F5C300' : 'transparent'}`,
                  }}>
                  <span style={{ width: 12, height: 12, borderRadius: '50%', background: nivel.color,
                    border: '1px solid #111', flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 12, color: '#999',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <b style={{ color: '#ccc' }}>Nº {c.numero}</b>
                      {' · '}
                      {c.nombre.replace(/^Consorcio Caminero N°?\s*\d+\s*/i, '').replace(/"/g, '')}
                    </span>
                    <span style={{ display: 'block', fontSize: 11, color: '#555', marginTop: 1 }}>
                      {c.zona}{c.dias > 0 ? ` · ${c.dias} día${c.dias === 1 ? '' : 's'} con agua` : ' · sin agua'}
                      {c.mmMaxDia > 0 ? ` · pico ${Math.round(c.mmMaxDia)}` : ''}
                      {/* Un solo punto = no hay traza de su red en el bundle */}
                      {c.puntos === 1 && (
                        <span title="Este consorcio no tiene su red cargada: se mide en un solo punto, no promediado sobre los caminos"
                          style={{ color: '#E8833A' }}> · 1 punto</span>
                      )}
                    </span>
                  </span>
                  <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: nivel.color }}>
                      {nivel.label}
                    </span>
                    <span style={{ display: 'block', fontSize: 12, color: '#777', marginTop: 1 }}>
                      {rangoLluvia(c.mm)}
                    </span>
                  </span>
                </button>
              )
            })}

            {!cargando && ordenados.length === 0 && (
              <div style={{ padding: 16, ...mono, fontSize: 13, color: '#555', lineHeight: 1.6 }}>
                Sin registros en este rango.
              </div>
            )}
          </div>
        </div>
      </div>

      </>)}

      <div style={{ ...mono, fontSize: 12, color: '#3a3a3a', marginTop: 8, flexShrink: 0 }}>
        Los caminos van pintados con el nivel de lluvia de su consorcio; el círculo, en el
        centro de gravedad de esa red, resume los milímetros acumulados del período —
        promediados sobre varios puntos de la red y ponderados por kilómetros de camino.
        Datos de Open-Meteo (reanálisis de Copernicus y ECMWF, celda de 9 a 11 km): sirven
        para el orden de magnitud y el patrón espacial, no reemplazan al pluviómetro.
      </div>
    </div>
  )
}
