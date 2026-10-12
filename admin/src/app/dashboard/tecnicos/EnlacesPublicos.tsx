'use client'
/**
 * Enlaces públicos de Hidrología: crear, copiar y dar de baja.
 *
 * Un enlace deja ver la sección sin cuenta —sólo lectura y sin Precisión— a
 * quien lo tenga. Va uno por destinatario para poder cortar uno sin tocar los
 * demás. Qué abre exactamente está en `lib/enlacePublico.ts`.
 */
import { useCallback, useEffect, useState } from 'react'

interface Enlace {
  id: string
  token: string
  nombre: string
  creado_en: string
  revocado_en: string | null
}

async function leer(): Promise<Enlace[]> {
  const r = await fetch('/api/enlaces-publicos')
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error ?? 'No se pudieron leer los enlaces')
  return j.enlaces ?? []
}

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-AR')

const celda: React.CSSProperties = { padding: '10px 16px', fontSize: 13 }
const th: React.CSSProperties = {
  padding: '10px 16px', color: '#8f8f8f', fontSize: 12, fontWeight: 600, textAlign: 'left',
  textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid #1e1e1e',
}
const boton: React.CSSProperties = {
  background: 'transparent', border: '1px solid #2a2a2a', color: '#a0a0a0',
  padding: '4px 10px', fontSize: 13, cursor: 'pointer', marginRight: 6,
}

export default function EnlacesPublicos() {
  const [enlaces, setEnlaces] = useState<Enlace[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nombre, setNombre] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [copiado, setCopiado] = useState<string | null>(null)

  const cargar = useCallback(() => leer()
    .then(xs => { setEnlaces(xs); setError(null) })
    .catch(e => setError(e instanceof Error ? e.message : 'No se pudieron leer los enlaces')), [])

  useEffect(() => { cargar() }, [cargar])

  const direccion = (e: Enlace) => `${window.location.origin}/p/${e.token}`

  async function crear() {
    if (!nombre.trim()) return
    setOcupado(true)
    try {
      const r = await fetch('/api/enlaces-publicos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error ?? 'No se pudo crear el enlace')
      setNombre('')
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el enlace')
    } finally { setOcupado(false) }
  }

  async function copiar(e: Enlace) {
    try {
      await navigator.clipboard.writeText(direccion(e))
      setCopiado(e.id)
      setTimeout(() => setCopiado(c => (c === e.id ? null : c)), 2000)
    } catch {
      setError('El navegador no dejó copiar: seleccioná la dirección y copiala a mano.')
    }
  }

  async function darDeBaja(e: Enlace) {
    if (!confirm(`¿Dar de baja el enlace «${e.nombre}»? Quien lo tenga deja de poder entrar.`)) return
    setOcupado(true)
    try {
      const r = await fetch(`/api/enlaces-publicos/${e.id}`, { method: 'DELETE' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error ?? 'No se pudo dar de baja')
      await cargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo dar de baja')
    } finally { setOcupado(false) }
  }

  return (
    <div style={{ background: '#191919', border: '1px solid #1e1e1e', borderTop: 'none' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #1e1e1e' }}>
        <div style={{ fontSize: 13, color: '#a0a0a0', lineHeight: 1.6, marginBottom: 10, maxWidth: 760 }}>
          Quien tenga el enlace ve la sección <b style={{ color: '#e0e0e0' }}>Hidrología</b> sin
          cuenta: sólo lectura y sin la pestaña Precisión. No abre ninguna otra parte del panel.
          Conviene uno por destinatario, para poder dar de baja uno sin cortar a los demás.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') crear() }}
            placeholder="Para quién es (por ejemplo: Familia)"
            maxLength={80}
            style={{ flex: 1, maxWidth: 360, background: '#0a0a0a', border: '1px solid #2a2a2a',
              color: '#ddd', padding: '7px 10px', fontSize: 13, outline: 'none' }}
          />
          <button
            onClick={crear}
            disabled={ocupado || !nombre.trim()}
            style={{ background: '#F5C300', color: '#111', fontWeight: 700, border: 'none',
              padding: '7px 16px', fontSize: 13, letterSpacing: 1,
              cursor: ocupado || !nombre.trim() ? 'not-allowed' : 'pointer',
              opacity: ocupado || !nombre.trim() ? 0.5 : 1 }}
          >
            CREAR ENLACE
          </button>
        </div>
        {error && (
          <div style={{ marginTop: 10, fontSize: 13, color: '#E57373', background: '#1a0c0c',
            border: '1px solid #5a2222', padding: '8px 12px' }}>
            {error}
          </div>
        )}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#141414' }}>
            <th style={th}>Para quién</th>
            <th style={th}>Dirección</th>
            <th style={th}>Creado</th>
            <th style={th}>Estado</th>
            <th style={th}>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {(enlaces ?? []).map(e => (
            <tr key={e.id} style={{ borderBottom: '1px solid #1e1e1e', opacity: e.revocado_en ? 0.55 : 1 }}>
              <td style={{ ...celda, color: '#e0e0e0' }}>{e.nombre}</td>
              <td style={{ ...celda, color: '#8f8f8f', fontFamily: 'monospace', fontSize: 12,
                wordBreak: 'break-all', userSelect: 'all' }}>
                {e.revocado_en ? '—' : direccion(e)}
              </td>
              <td style={{ ...celda, color: '#8f8f8f', whiteSpace: 'nowrap' }}>{fecha(e.creado_en)}</td>
              <td style={{ ...celda, whiteSpace: 'nowrap', color: e.revocado_en ? '#8f8f8f' : '#4CAF50' }}>
                {e.revocado_en ? `Dado de baja el ${fecha(e.revocado_en)}` : 'Vigente'}
              </td>
              <td style={{ ...celda, whiteSpace: 'nowrap' }}>
                {!e.revocado_en && (<>
                  <button style={boton} onClick={() => copiar(e)}>
                    {copiado === e.id ? 'Copiado' : 'Copiar'}
                  </button>
                  <button style={boton} disabled={ocupado} onClick={() => darDeBaja(e)}>
                    Dar de baja
                  </button>
                </>)}
              </td>
            </tr>
          ))}
          {enlaces !== null && enlaces.length === 0 && (
            <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: '#8f8f8f', fontSize: 13 }}>
              Todavía no hay enlaces públicos
            </td></tr>
          )}
          {enlaces === null && !error && (
            <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: '#8f8f8f', fontSize: 13 }}>
              Cargando…
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
