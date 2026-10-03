'use client'
/**
 * Las alertas vigentes del SMN que tocan el Chaco.
 *
 * Son las oficiales y nada más: acá no se calcula ninguna alerta con umbrales
 * propios (ver lib/tiempo.ts). Por eso cada una lleva su enlace al SMN y la
 * pantalla nunca muestra "sin alertas" si no pudo consultar: un error se dice
 * como error.
 *
 * `compacto` es la versión del Dashboard: una línea por alerta.
 */
import { useEffect, useState } from 'react'
import type { Alerta } from '@/lib/tiempo'
import { COLOR_NIVEL, fHora, mono } from './piezas'

export interface RespuestaAlertas { alertas: Alerta[]; revisados: number; fallaron: number; consultado: string }

export function useAlertasSmn() {
  const [datos, setDatos] = useState<RespuestaAlertas | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)
  useEffect(() => {
    let vivo = true
    fetch('/api/tiempo/alertas')
      .then(async r => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.error ?? `el servidor respondió ${r.status}`)
        return j as RespuestaAlertas
      })
      .then(j => { if (vivo) { setDatos(j); setError(null) } })
      .catch(e => { if (vivo) setError(e instanceof Error ? e.message : 'no se pudo consultar') })
    return () => { vivo = false }
  }, [intento])
  return { datos, error, reintentar: () => setIntento(v => v + 1) }
}

const enlace: React.CSSProperties = { color: '#8fd0ff', fontSize: 11, textDecoration: 'none', letterSpacing: 0.6 }
const boton: React.CSSProperties = {
  ...mono, fontSize: 11, padding: '2px 8px', borderRadius: 2, cursor: 'pointer',
  background: 'transparent', border: '1px solid #2d2d2d', color: '#a0a0a0', marginLeft: 6,
}

/** El resultado de `useAlertasSmn`: quien muestra las alertas las consulta una vez y las reparte */
export type EstadoAlertas = ReturnType<typeof useAlertasSmn>

export default function AlertasSmn({ estado, compacto = false, nombreConsorcio }: {
  estado: EstadoAlertas
  compacto?: boolean
  nombreConsorcio?: (n: number) => string
}) {
  const { datos, error, reintentar } = estado
  const [abierta, setAbierta] = useState<string | null>(null)

  if (error) {
    return (
      <div style={{ ...mono, fontSize: 12, color: '#E8A87C' }}>
        No se pudieron consultar las alertas del SMN ({error}). Esto no quiere decir que no haya.
        <button onClick={reintentar} style={boton}>Reintentar</button>
      </div>
    )
  }
  if (!datos) return <div style={{ ...mono, fontSize: 12, color: '#8f8f8f' }}>Consultando las alertas del SMN…</div>

  const { alertas, fallaron } = datos
  const faltan = fallaron > 0 && (
    <span style={{ color: '#E8A87C' }}> {fallaron} aviso{fallaron === 1 ? '' : 's'} del SMN no se pudo leer.</span>
  )

  if (!alertas.length) {
    return (
      <div style={{ ...mono, fontSize: 12, color: '#8f8f8f' }}>
        Sin alertas vigentes del SMN para el Chaco.{faltan}
        {' '}<a href="https://www.smn.gob.ar/alertas" target="_blank" rel="noopener noreferrer" style={enlace}>smn.gob.ar ↗</a>
      </div>
    )
  }

  if (compacto) {
    return (
      <div style={{ ...mono, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {alertas.map(a => (
          <div key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12, color: '#ccc',
            borderLeft: `3px solid ${COLOR_NIVEL[a.nivel]}`, paddingLeft: 8 }}>
            <b style={{ color: COLOR_NIVEL[a.nivel], textTransform: 'uppercase', letterSpacing: 0.8, fontSize: 11 }}>{a.nivel}</b>
            <span>{a.titulo}</span>
            <span style={{ color: '#8f8f8f' }}>{fHora(a.inicio)} a {fHora(a.fin)}</span>
            <span style={{ color: '#8f8f8f' }}>
              {a.consorcios.length ? `${a.consorcios.length} consorcio${a.consorcios.length === 1 ? '' : 's'}` : 'borde de la provincia'}
            </span>
          </div>
        ))}
        {faltan && <div style={{ fontSize: 11 }}>{faltan}</div>}
      </div>
    )
  }

  return (
    <div style={{ ...mono, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {alertas.map(a => {
        const c = COLOR_NIVEL[a.nivel]
        const ver = abierta === a.id
        return (
          <div key={a.id} style={{ background: '#121212', border: '1px solid #222', borderLeft: `3px solid ${c}`, padding: '7px 10px' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <b style={{ color: c, textTransform: 'uppercase', letterSpacing: 1, fontSize: 11 }}>Alerta {a.nivel}</b>
              <span style={{ color: '#e0e0e0', fontSize: 13 }}>{a.titulo}</span>
              <span style={{ color: '#a0a0a0', fontSize: 12 }}>{fHora(a.inicio)} a {fHora(a.fin)}</span>
              <span style={{ flex: 1 }} />
              {a.url && <a href={a.url} target="_blank" rel="noopener noreferrer" style={enlace}>Aviso del SMN ↗</a>}
            </div>
            <div style={{ color: '#a0a0a0', fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>
              {a.consorcios.length
                ? <>Cubre la sede de {a.consorcios.length} consorcio{a.consorcios.length === 1 ? '' : 's'}.</>
                : <>Toca el borde de la provincia, sin ninguna sede de consorcio adentro.</>}
              {' '}
              <button onClick={() => setAbierta(ver ? null : a.id)} style={{ ...boton, marginLeft: 0 }}>
                {ver ? 'Menos' : 'Detalle'}
              </button>
            </div>
            {ver && (
              <div style={{ color: '#a0a0a0', fontSize: 12, marginTop: 6, lineHeight: 1.55 }}>
                {a.descripcion && <div>{a.descripcion}</div>}
                {a.consorcios.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    <span style={{ color: '#8f8f8f' }}>Consorcios: </span>
                    {a.consorcios.map(n => (nombreConsorcio ? `${n} ${nombreConsorcio(n)}` : `N° ${n}`)).join(' · ')}
                  </div>
                )}
                {a.instruccion && <div style={{ marginTop: 4, color: '#8f8f8f' }}>{a.instruccion}</div>}
              </div>
            )}
          </div>
        )
      })}
      <div style={{ fontSize: 11, color: '#8f8f8f' }}>
        Alertas oficiales del Servicio Meteorológico Nacional. Un consorcio cuenta como cubierto si su sede cae
        adentro del área del aviso.{faltan}
      </div>
    </div>
  )
}
