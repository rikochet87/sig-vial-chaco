'use client'
/**
 * «Qué viene río arriba», en la pestaña Gran Resistencia.
 *
 * El deslizador dice qué se moja con el río a cierta altura. Esto dice si hay
 * agua en camino: qué está subiendo o bajando en las escalas por donde pasa el
 * río antes de llegar a Barranqueras, y cuántos días antes pasa por cada una.
 *
 * Es el mismo dato que el bloque «Aguas arriba» de la pestaña Río Paraná, en
 * corto: la misma ruta (`/api/rio/arriba`), la misma tendencia contra el día
 * exacto y la misma anticipación medida (`anticipaciones()` sobre
 * `tramo_diario.json`). Dos pestañas no pueden decir cosas distintas del mismo
 * río.
 *
 * **No traslada alturas.** Que Posadas suba 40 cm no dice a cuánto llega
 * Barranqueras: entre las dos entra el Paraguay y el cauce es otro. Dice que
 * viene agua y cuándo; a cuánto, lo dice el pronóstico del INA, que va en
 * «Situación de hoy» y en la marca del deslizador. Por eso nada de esto mueve
 * el deslizador.
 */
import { useEffect, useMemo, useState } from 'react'
import { anticipaciones, DIAS_ATRASO_ARRIBA, type Anticipacion, type Tendencia } from '@/lib/rioArriba'
import { useTramoDiario } from '@/hooks/useTramoDiario'

interface Estacion {
  id: number
  nombre: string
  rio: 'Paraná' | 'Paraguay' | 'Bermejo'
  alerta: number | null
  margen: number | null
  tendencia: Tendencia | null
}

const mono = { fontFamily: 'monospace' } as const
const ACENTO = '#F5C300'
const f2 = (v: number) => v.toFixed(2).replace('.', ',')
const conSigno = (m: number) => `${m > 0 ? '+' : m < 0 ? '−' : '±'}${f2(Math.abs(m))}`
const fCorta = (f: string) => f.slice(0, 10).split('-').reverse().slice(0, 2).join('/')

const SUBE = '#E8833A', BAJA = '#4fc3f7'
const GLIFO = { sube: '▲', baja: '▼', quieto: '■', sin_dato: '·' } as const
const COLOR = { sube: SUBE, baja: BAJA, quieto: '#a0a0a0', sin_dato: '#8f8f8f' } as const

/**
 * Sube, baja o está estable en la semana. Diez centímetros en siete días: por
 * debajo, en un río grande, es lo que se mueve sin que venga nada.
 */
const SEMANA_M = 0.1
type Sentido = 'sube' | 'baja' | 'quieto' | 'sin_dato'
const enLaSemana = (c7: number | null): Sentido =>
  c7 === null ? 'sin_dato' : c7 >= SEMANA_M ? 'sube' : c7 <= -SEMANA_M ? 'baja' : 'quieto'

/** Cuándo pasa por Barranqueras lo que pasa hoy por la escala, en corto */
function cuando(a: Anticipacion | undefined): { t: string; d?: string } {
  if (!a) return { t: '—' }
  if (a.tipo === 'traslado') {
    const n = Math.abs(a.mediana)
    return {
      t: a.mediana === 0 ? 'mismo día' : `${n} d antes`,
      d: `El pico de una crecida pasa ${n} día${n === 1 ? '' : 's'} antes que por Barranqueras (mediana de ${a.usados} años; la mitad entre ${Math.abs(a.p75)} y ${Math.abs(a.p25)})`,
    }
  }
  if (a.tipo === 'aporte') return { t: 'aporta', d: `No anuncia la crecida: crece en otra época. Lo que suma es caudal, alrededor de ${Math.abs(a.k)} días después` }
  return { t: 'no se ve', d: 'Se midió y en la altura de Barranqueras no se distingue' }
}

export default function RioArriba() {
  const [est, setEst] = useState<Estacion[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { tramo } = useTramoDiario()
  const an = useMemo(() => (tramo ? anticipaciones(tramo) : null), [tramo])

  useEffect(() => {
    let vivo = true
    fetch('/api/rio/arriba?dias=10')
      .then(async r => {
        if (!r.ok) throw new Error(`el servidor respondió ${r.status}`)
        return r.json() as Promise<{ estaciones: Estacion[] }>
      })
      .then(j => { if (vivo) setEst(j.estaciones) })
      .catch(e => { if (vivo) setError(e instanceof Error ? e.message : 'no se pudo consultar') })
    return () => { vivo = false }
  }, [])

  // Lo que se dice en una línea: del Paraná, que es el que anuncia
  const resumen = useMemo(() => {
    if (!est) return null
    const parana = est.filter(e => e.rio === 'Paraná' && e.tendencia)
    const suben = parana.filter(e => (e.tendencia!.cambio7 ?? 0) >= SEMANA_M)
    const bajan = parana.filter(e => (e.tendencia!.cambio7 ?? 0) <= -SEMANA_M)
    // La más lejana que sube es la que avisa con más tiempo; la lista va de arriba hacia abajo
    const lejana = suben[0]
    const a = lejana ? an?.get(lejana.id) : undefined
    return { total: parana.length, suben: suben.length, bajan: bajan.length, lejana, dias: a?.tipo === 'traslado' ? Math.abs(a.mediana) : null }
  }, [est, an])

  if (error) return <div style={{ ...mono, fontSize: 12, color: '#E8A87C' }}>No se pudo consultar el río arriba: {error}.</div>
  if (!est) return <div style={{ ...mono, fontSize: 12, color: '#8f8f8f' }}>Consultando las escalas río arriba…</div>

  const fila = (e: Estacion) => {
    const t = e.tendencia
    const s = enLaSemana(t?.cambio7 ?? null)
    const c = cuando(an?.get(e.id))
    const atrasada = t && t.atraso >= DIAS_ATRASO_ARRIBA
    const enAlerta = e.margen !== null && e.margen <= 0
    return (
      <tr key={e.id}>
        <td style={{ padding: '2px 6px 2px 0', color: '#d0d0d0', whiteSpace: 'nowrap' }}>
          <span style={{ color: COLOR[s], marginRight: 5 }}>{GLIFO[s]}</span>{e.nombre}
        </td>
        <td style={{ textAlign: 'right', padding: '2px 0 2px 6px', color: enAlerta ? SUBE : '#e0e0e0' }}
          title={atrasada ? `Última lectura del ${fCorta(t!.ultima.fecha)}` : enAlerta ? 'Sobre su nivel de alerta' : undefined}>
          {t ? f2(t.ultima.m) : '—'}
          {atrasada && <span style={{ color: SUBE }}> {fCorta(t!.ultima.fecha)}</span>}
        </td>
        <td style={{ textAlign: 'right', padding: '2px 0 2px 6px', color: COLOR[s] }}>
          {t?.cambio7 === null || t?.cambio7 === undefined ? '—' : conSigno(t.cambio7)}
        </td>
        <td style={{ textAlign: 'right', padding: '2px 0 2px 6px', color: '#a0a0a0', whiteSpace: 'nowrap' }} title={c.d}>{c.t}</td>
      </tr>
    )
  }

  const grupo = (rio: Estacion['rio']) => est.filter(e => e.rio === rio)

  return (
    <div>
      {resumen && resumen.total > 0 && (
        <div style={{ ...mono, fontSize: 12, color: '#a0a0a0', lineHeight: 1.6, marginBottom: 8 }}>
          {resumen.suben > 0 ? (<>
            En el Paraná <b style={{ color: SUBE }}>sube{resumen.suben === 1 ? '' : 'n'} {resumen.suben} de {resumen.total}</b> escalas en la semana.
            {resumen.lejana && resumen.dias !== null && <> La más lejana, <b style={{ color: '#fff' }}>{resumen.lejana.nombre}</b>, pasa unos {resumen.dias} días antes que Barranqueras.</>}
          </>) : resumen.bajan === resumen.total
            ? <>El Paraná <b style={{ color: BAJA }}>baja en las {resumen.total}</b> escalas: no viene agua por ese lado esta semana.</>
            : <>El Paraná está <b style={{ color: '#fff' }}>estable</b> río arriba: ninguna escala subió 10 cm en la semana.</>}
        </div>
      )}
      <table style={{ ...mono, fontSize: 12, width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ color: '#8f8f8f', fontSize: 11 }}>
            <th style={{ textAlign: 'left', fontWeight: 400, padding: '0 6px 4px 0' }}>Escala</th>
            <th style={{ textAlign: 'right', fontWeight: 400, padding: '0 0 4px 6px' }}>m</th>
            <th style={{ textAlign: 'right', fontWeight: 400, padding: '0 0 4px 6px' }}>7 días</th>
            <th style={{ textAlign: 'right', fontWeight: 400, padding: '0 0 4px 6px' }}>llega</th>
          </tr>
        </thead>
        <tbody>
          <tr><td colSpan={4} style={{ color: ACENTO, fontSize: 11, letterSpacing: 1, padding: '4px 0 2px' }}>PARANÁ</td></tr>
          {grupo('Paraná').map(fila)}
          <tr><td colSpan={4} style={{ color: ACENTO, fontSize: 11, letterSpacing: 1, padding: '6px 0 2px' }}>PARAGUAY Y BERMEJO</td></tr>
          {grupo('Paraguay').map(fila)}
          {grupo('Bermejo').map(fila)}
        </tbody>
      </table>
      <div style={{ ...mono, fontSize: 11, color: '#8f8f8f', lineHeight: 1.6, marginTop: 6 }}>
        ▲ subió 10 cm o más en siete días · ▼ bajó · ■ estable. «Llega» es cuántos días antes que por Barranqueras pasa
        el pico de una crecida, medido desde 1970. Dice que viene agua y cuándo, no a qué altura: eso es el pronóstico
        del INA. <a href="/dashboard/lluvia?vista=rio" style={{ color: '#c4c4c4' }}>Detalle en Río Paraná</a>
      </div>
    </div>
  )
}
