'use client'
/**
 * Una línea al pie de la vista de Pronóstico: cuántos días de pronóstico hay
 * guardados para medir después cuánto acierta, y si el guardado se cortó.
 *
 * Está a la vista a propósito. El registro lo escribe el cron de las 12:00 y,
 * si deja de andar, nada más falla: la pantalla sigue mostrando el pronóstico
 * del día. Sin este aviso el corte se descubriría meses después, cuando se
 * vaya a medir y falten los datos.
 */
import { useCallback, useEffect, useState } from 'react'
import { useUser } from '@/lib/UserContext'
import type { EstadoRegistro as Estado } from '@/lib/pronosticoRegistro'
import { boton, fCorta } from './piezas'

/** Pasado este atraso, en días, se avisa que el cron puede haberse cortado */
const ATRASO_MAX_DIAS = 1

export default function EstadoRegistro({ hoy }: { hoy: string }) {
  const { profile } = useUser()
  const [estado, setEstado] = useState<Estado | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    let vivo = true
    fetch('/api/lluvia/pronostico/registro')
      .then(async r => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.error ?? `el servidor respondió ${r.status}`)
        return j as Estado
      })
      .then(j => { if (vivo) { setEstado(j); setError(null) } })
      .catch(e => { if (vivo) setError(e instanceof Error ? e.message : 'no se pudo consultar') })
    return () => { vivo = false }
  }, [intento])

  const guardarHoy = useCallback(async () => {
    setGuardando(true)
    try {
      const r = await fetch('/api/lluvia/pronostico/registro', { method: 'POST' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error ?? `el servidor respondió ${r.status}`)
      setIntento(v => v + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'no se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }, [])

  const esAdmin = profile.rol === 'admin'
  const atraso = estado?.ultimo ? Math.round((Date.parse(hoy) - Date.parse(estado.ultimo)) / 86_400_000) : null
  const botonGuardar = esAdmin && (
    <button onClick={guardarHoy} disabled={guardando} style={boton}>
      {guardando ? 'Guardando…' : 'Guardar el de hoy'}
    </button>
  )

  return (
    <div style={{ color: '#8f8f8f', marginTop: 8, borderTop: '1px solid #222', paddingTop: 8 }}>
      <b style={{ color: '#a0a0a0', fontWeight: 400 }}>Registro para medir el acierto: </b>
      {error ? (
        <span style={{ color: '#E8A87C' }}>{error}. {botonGuardar}</span>
      ) : !estado ? (
        '…'
      ) : estado.dias === 0 ? (
        <>todavía no hay ningún día guardado. Lo guarda el cron de las 12:00. {botonGuardar}</>
      ) : (
        <>
          {estado.dias} {estado.dias === 1 ? 'día guardado' : 'días guardados'}, desde el {fCorta(estado.primero!)}.
          {' '}Cada día se guarda el pronóstico emitido, para compararlo con los pluviómetros cuando llega el parte.
          {atraso !== null && atraso > ATRASO_MAX_DIAS && (
            <span style={{ color: '#E8A87C' }}>
              {' '}El último es del {fCorta(estado.ultimo!)}: el guardado diario puede haberse cortado. {botonGuardar}
            </span>
          )}
        </>
      )}
    </div>
  )
}
