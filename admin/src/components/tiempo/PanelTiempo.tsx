'use client'
/**
 * La pestaña «Tiempo» de Hidrología: alertas del SMN, la semana en la provincia
 * y el pronóstico de cada consorcio.
 *
 * Sirve a cuatro usos a la vez —planificar obras, enterarse de un evento,
 * mirar el tiempo, preparar una salida de campo— y por eso va en tres niveles:
 * lo oficial y urgente arriba (alertas), el panorama en el medio (la semana),
 * y el detalle abajo (cada consorcio, y al elegir uno, día por día).
 *
 * **La planificación se apoya en días con y sin lluvia pronosticada**, no en
 * "días aptos". Si un camino está para trabajar depende de cuánto llovió antes
 * y del suelo, y ese índice se descartó a propósito (ver «Lluvia — para qué es
 * la pantalla» en el CLAUDE.md). El corte de 1 mm es la convención
 * climatológica para contar un día de lluvia.
 */
import { useEffect, useMemo, useState } from 'react'
import { colorLluvia } from '@/lib/lluvia'
import { cieloDe, DIA_LLUVIA_MM, resumenProvincia, rumbo, type PronosticoTiempo, type TiempoConsorcio } from '@/lib/tiempo'
import AlertasSmn, { useAlertasSmn } from './AlertasSmn'
import { COLOR_NIVEL, FlechaViento, IconoCielo, fDia, mono, n0 } from './piezas'

/** 'Consorcio Caminero Nº01 "General Capdevila"' → 'General Capdevila' */
export const nombreCorto = (n: string) => n.match(/"([^"]+)"/)?.[1] ?? n

const caja: React.CSSProperties = { ...mono, background: '#191919', border: '1px solid #1e1e1e', padding: '9px 12px', marginBottom: 10 }
const titulo: React.CSSProperties = {
  fontSize: 12, color: '#a0a0a0', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8,
  borderLeft: '3px solid #F5C300', paddingLeft: 8,
}
const sel: React.CSSProperties = {
  ...mono, background: '#111', border: '1px solid #2a2a2a', color: '#ccc', fontSize: 12, padding: '4px 6px', borderRadius: 2,
}

export function usePronosticoTiempo() {
  const [datos, setDatos] = useState<PronosticoTiempo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)
  useEffect(() => {
    let vivo = true
    fetch('/api/tiempo/pronostico')
      .then(async r => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.error ?? `el servidor respondió ${r.status}`)
        return j as PronosticoTiempo
      })
      .then(j => { if (vivo) { setDatos(j); setError(null) } })
      .catch(e => { if (vivo) setError(e instanceof Error ? e.message : 'no se pudo consultar') })
    return () => { vivo = false }
  }, [intento])
  return { datos, error, reintentar: () => setIntento(v => v + 1) }
}

export default function PanelTiempo() {
  const alertas = useAlertasSmn()
  const { datos, error, reintentar } = usePronosticoTiempo()
  const [zona, setZona] = useState('')
  const [buscar, setBuscar] = useState('')
  const [elegido, setElegido] = useState<number | null>(null)

  const consorcios = useMemo(() => datos?.consorcios ?? [], [datos])
  const resumen = useMemo(() => resumenProvincia(consorcios), [consorcios])
  const nombre = (n: number) => nombreCorto(consorcios.find(c => c.numero === n)?.nombre ?? '')

  // El peor nivel de alerta que cubre a cada consorcio
  const alertaDe = useMemo(() => {
    const m = new Map<number, keyof typeof COLOR_NIVEL>()
    for (const a of alertas.datos?.alertas ?? []) {
      for (const n of a.consorcios) {
        const previo = m.get(n)
        if (!previo || (previo === 'amarillo' && a.nivel !== 'amarillo') || a.nivel === 'rojo') m.set(n, a.nivel)
      }
    }
    return m
  }, [alertas.datos])

  const filas = consorcios.filter(c =>
    (!zona || c.zona === zona)
    && (!buscar || `${c.numero} ${c.nombre}`.toLowerCase().includes(buscar.toLowerCase())))
  const detalle = consorcios.find(c => c.numero === elegido) ?? null

  return (
    <div style={{ ...mono }}>
      <div style={caja}>
        <div style={titulo}>Alertas del SMN</div>
        <AlertasSmn estado={alertas} nombreConsorcio={consorcios.length ? nombre : undefined} />
      </div>

      {error && (
        <div style={{ ...caja, color: '#E8A87C', fontSize: 12 }}>
          No se pudo consultar el pronóstico ({error}).
          <button onClick={reintentar} style={{ ...sel, marginLeft: 8, cursor: 'pointer' }}>Reintentar</button>
        </div>
      )}
      {!error && !datos && <div style={{ ...caja, color: '#8f8f8f', fontSize: 12 }}>Consultando el pronóstico…</div>}

      {datos && (<>
        <div style={caja}>
          <div style={titulo}>La semana en la provincia</div>
          <SemanaProvincia resumen={resumen} total={consorcios.length} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: detalle ? 'minmax(0, 1fr) 420px' : '1fr', gap: 10, alignItems: 'start' }}>
          <div style={caja}>
            <div style={{ ...titulo, display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ flex: 1 }}>Por consorcio</span>
              <select value={zona} onChange={e => setZona(e.target.value)} style={sel}>
                <option value="">Todas las zonas</option>
                {['ZI', 'ZII', 'ZIII', 'ZIV', 'ZV'].map(z => <option key={z} value={z}>{z}</option>)}
              </select>
              <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar" style={{ ...sel, width: 140 }} />
            </div>
            <TablaConsorcios filas={filas} dias={consorcios[0]?.dias.map(d => d.fecha) ?? []}
              alertaDe={alertaDe} elegido={elegido} onElegir={n => setElegido(elegido === n ? null : n)} />
            <div style={{ fontSize: 11, color: '#8f8f8f', marginTop: 8, lineHeight: 1.5 }}>
              Cada celda: el cielo y los mm de lluvia pronosticados en la sede del consorcio. «Sin lluvia» cuenta los días
              con menos de {DIA_LLUVIA_MM} mm: sirve para ver qué días vienen secos, no para decir si un camino está para
              trabajar, que depende de lo que llovió antes. Elegí un consorcio para ver el detalle.
            </div>
          </div>
          {detalle && <DetalleConsorcio c={detalle} alerta={alertaDe.get(detalle.numero) ?? null} onCerrar={() => setElegido(null)} />}
        </div>

        <div style={{ fontSize: 11, color: '#8f8f8f', lineHeight: 1.5 }}>
          Pronóstico de {datos.modelo}, consultado {new Date(datos.consultado).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}.
          Es un modelo numérico, no un pronóstico emitido por el SMN: lo oficial son las alertas de arriba. Las celdas del
          modelo miden de 10 a 25 km, así que consorcios vecinos dan parecido.
        </div>
      </>)}
    </div>
  )
}

function SemanaProvincia({ resumen, total }: { resumen: ReturnType<typeof resumenProvincia>; total: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${resumen.length}, minmax(0, 1fr))`, gap: 6 }}>
      {resumen.map(d => {
        const c = cieloDe(d.codigo)
        return (
          <div key={d.fecha} style={{ background: '#121212', border: '1px solid #222', padding: '7px 8px', minWidth: 0 }}>
            <div style={{ fontSize: 12, color: '#a0a0a0' }}>{fDia(d.fecha)}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '5px 0' }}>
              <IconoCielo cielo={c.cielo} tam={22} />
              <span style={{ fontSize: 12, color: '#ccc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.texto}>{c.texto}</span>
            </div>
            <div style={{ fontSize: 13, color: '#e0e0e0' }}>{n0(d.tMin)}° / {n0(d.tMax)}°</div>
            <div style={{ fontSize: 12, color: (d.probMax ?? 0) >= 50 ? '#8fd0ff' : '#a0a0a0', marginTop: 3 }}
              title={`probabilidad de lluvia: hasta ${n0(d.probMax)} % en algún consorcio, ${n0(d.probMedia)} % en promedio`}>
              {n0(d.probMax)} % de lluvia
            </div>
            <div style={{ fontSize: 12, color: d.conLluvia ? '#8fd0ff' : '#8f8f8f' }}>
              {d.conLluvia ? `lluvia en ${d.conLluvia} de ${total}` : 'sin lluvia'}
            </div>
            {d.conLluvia > 0 && <div style={{ fontSize: 11, color: '#8f8f8f' }}>hasta {n0(d.lluviaMax)} mm</div>}
            <div style={{ fontSize: 11, color: '#8f8f8f' }}>ráfagas hasta {n0(d.rafagaMax)} km/h</div>
          </div>
        )
      })}
    </div>
  )
}

function TablaConsorcios({ filas, dias, alertaDe, elegido, onElegir }: {
  filas: TiempoConsorcio[]; dias: string[]
  alertaDe: Map<number, keyof typeof COLOR_NIVEL>
  elegido: number | null; onElegir: (n: number) => void
}) {
  const th: React.CSSProperties = { textAlign: 'left', fontWeight: 400, padding: '4px 6px', color: '#8f8f8f', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, whiteSpace: 'nowrap' }
  return (
    <div style={{ overflowX: 'auto', maxHeight: 520, overflowY: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
        <thead style={{ position: 'sticky', top: 0, background: '#191919' }}>
          <tr>
            <th style={th}>Nº</th>
            <th style={th}>Consorcio</th>
            <th style={th}>Zona</th>
            {dias.map(f => <th key={f} style={{ ...th, textAlign: 'center' }}>{fDia(f)}</th>)}
            <th style={{ ...th, textAlign: 'right' }} title={`Días con menos de ${DIA_LLUVIA_MM} mm pronosticados`}>Sin lluvia</th>
          </tr>
        </thead>
        <tbody>
          {filas.map(c => {
            const nivel = alertaDe.get(c.numero)
            const secos = c.dias.filter(d => (d.lluvia ?? 0) < DIA_LLUVIA_MM).length
            return (
              <tr key={c.numero} onClick={() => onElegir(c.numero)} style={{
                borderTop: '1px solid #141414', cursor: 'pointer',
                background: elegido === c.numero ? 'rgba(245,195,0,0.06)' : 'transparent',
              }}>
                <td style={{ padding: '3px 6px', color: '#a0a0a0' }}>{c.numero}</td>
                <td style={{ padding: '3px 6px', color: '#ccc', whiteSpace: 'nowrap' }}>
                  {nivel && <span title={`Alerta ${nivel} del SMN`} style={{ display: 'inline-block', width: 7, height: 7, background: COLOR_NIVEL[nivel], marginRight: 6 }} />}
                  {nombreCorto(c.nombre)}
                </td>
                <td style={{ padding: '3px 6px', color: '#a0a0a0' }}>{c.zona}</td>
                {c.dias.map(d => {
                  const mm = d.lluvia ?? 0
                  const llueve = mm >= DIA_LLUVIA_MM
                  return (
                    <td key={d.fecha} title={`${fDia(d.fecha)} · ${cieloDe(d.codigo).texto} · ${n0(d.lluvia)} mm (${n0(d.probLluvia)} %) · ${n0(d.tMin)}°/${n0(d.tMax)}°`}
                      style={{ padding: '3px 4px', textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <IconoCielo cielo={cieloDe(d.codigo).cielo} tam={14} />
                        <span style={{
                          minWidth: 24, padding: '0 3px', fontSize: 11,
                          color: llueve ? '#111' : '#8f8f8f', background: llueve ? colorLluvia(mm) : 'transparent',
                        }}>{llueve ? n0(mm) : '·'}</span>
                      </div>
                    </td>
                  )
                })}
                <td style={{ padding: '3px 6px', textAlign: 'right', color: secos >= 5 ? '#ccc' : '#a0a0a0' }}>{secos}</td>
              </tr>
            )
          })}
          {!filas.length && <tr><td colSpan={dias.length + 4} style={{ padding: 16, color: '#8f8f8f', textAlign: 'center' }}>Ningún consorcio con ese filtro.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

function DetalleConsorcio({ c, alerta, onCerrar }: { c: TiempoConsorcio; alerta: keyof typeof COLOR_NIVEL | null; onCerrar: () => void }) {
  return (
    <div style={{ ...caja, position: 'sticky', top: 0 }}>
      <div style={{ ...titulo, display: 'flex', alignItems: 'center' }}>
        <span style={{ flex: 1 }}>N° {c.numero} — {nombreCorto(c.nombre)} · {c.zona}</span>
        <button onClick={onCerrar} title="Cerrar" style={{ ...sel, border: 'none', background: 'none', cursor: 'pointer', color: '#8f8f8f' }}>✕</button>
      </div>
      {alerta && (
        <div style={{ fontSize: 12, color: COLOR_NIVEL[alerta], marginBottom: 8 }}>
          La sede está dentro de una alerta {alerta} del SMN: ver arriba.
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {c.dias.map(d => {
          const ci = cieloDe(d.codigo)
          return (
            <div key={d.fecha} style={{ display: 'grid', gridTemplateColumns: '76px 22px 1fr 70px', gap: 8, alignItems: 'center',
              background: '#121212', border: '1px solid #222', padding: '6px 8px', fontSize: 12 }}>
              <span style={{ color: '#a0a0a0' }}>{fDia(d.fecha)}</span>
              <IconoCielo cielo={ci.cielo} tam={20} />
              <div style={{ minWidth: 0 }}>
                <div style={{ color: '#e0e0e0' }}>{ci.texto}</div>
                <div style={{ color: '#8f8f8f', fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ color: (d.lluvia ?? 0) >= DIA_LLUVIA_MM ? '#8fd0ff' : '#8f8f8f' }}>
                    {n0(d.lluvia)} mm · {n0(d.probLluvia)} %
                  </span>
                  <span>· viento {n0(d.viento)} km/h del {rumbo(d.dirViento)}</span>
                  <FlechaViento grados={d.dirViento} />
                  <span>· ráfagas {n0(d.rafagas)}</span>
                </div>
              </div>
              <span style={{ color: '#e0e0e0', textAlign: 'right' }}>{n0(d.tMin)}° / {n0(d.tMax)}°</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
