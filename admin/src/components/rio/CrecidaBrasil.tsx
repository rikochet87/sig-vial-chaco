'use client'

/**
 * Altura en Barranqueras a partir de la lluvia en el Paraná brasileño: el
 * cálculo propio de `/api/rio/crecida` (`lib/crecida.ts`).
 *
 * ── Qué se ve ─────────────────────────────────────────────────────────────────
 *
 * - Lo medido en Barranqueras en las últimas semanas, en gris.
 * - **La banda del ensamble**: del 10 al 90 % de las 51 corridas, y más clara
 *   la de la más seca a la más lluviosa. La mediana en línea llena.
 * - **Sin más lluvia**, a rayas: el piso de lo que ya está en camino.
 * - El pronóstico del INA, si lo hay, en su azul de siempre y a rayas, **para
 *   comparar**: el oficial es ése.
 * - **Una línea vertical en el último día en que la banda no se abre**: hasta
 *   ahí la altura la decide agua que ya salió de Brasil; después, la lluvia
 *   que todavía no cayó. Es la lectura más honesta del gráfico.
 *
 * ── Qué no afirma ─────────────────────────────────────────────────────────────
 *
 * No es un pronóstico oficial. La validación, contra la persistencia, es con
 * la lluvia que cayó y no con la pronosticada: es un techo. Las dos cosas van
 * escritas al pie, con los números de `crecida_parametros.json`.
 *
 * Va en su propio color (`C_PROPIO`), que no es el azul del INA, el violeta de
 * las cuencas ni el arena de CHIRPS.
 */

import { useEffect, useState } from 'react'
import { mono, boton } from '@/components/cuencas/piezas'
import type { PuntoPronostico } from '@/lib/ina'

const C_PROPIO = '#D9A6C9'
const C_INA = '#85B7EB'

interface Banda { p10: number | null; p50: number | null; p90: number | null; min: number | null; max: number | null }
interface FilaValidacion { dias: number; persistencia: number; cadena: number; soloMedido: number; mejora: number; mejoraSoloMedido: number }
interface RespuestaCrecida {
  emitido: string
  alturaHoy: { m: number; fecha: string; fuente: string }
  umbral: { alerta: number; evacuacion: number }
  fechas: string[]
  banda: Banda[]
  sinLluvia: (number | null)[]
  determinadoHasta: string | null
  itaipuIguazu: { fecha: string; m3s: number; medido: boolean }[]
  ultimoOns: string
  lluvia: {
    fechas: string[]
    corridas: number
    cuencas: Record<string, { nombre: string; ultimos7: number; proximos15: { p10: number; p50: number; p90: number }; medianaDiaria: number[] }>
  }
  calibracion: string
  validacion: { todo: FilaValidacion[] }
  avisos: string[]
  fuente: string
}

const nM = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toFixed(2).replace('.', ','))
const fC = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`
const nQ = (v: number) => Math.round(v).toLocaleString('es-AR')

export default function CrecidaBrasil({ observado, pronosticoIna }: {
  /** Lo medido en Barranqueras, para dibujar de dónde viene la curva */
  observado?: { fecha: string; m: number }[]
  /** La banda del INA, para comparar */
  pronosticoIna?: PuntoPronostico[]
}) {
  const [datos, setDatos] = useState<RespuestaCrecida | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    let vivo = true
    fetch('/api/rio/crecida')
      .then(async r => {
        const j = await r.json().catch(() => null)
        if (!r.ok) throw new Error(j?.error ?? `el servidor respondió ${r.status}`)
        return j as RespuestaCrecida
      })
      .then(j => { if (vivo) { setDatos(j); setError(null) } })
      .catch(e => { if (vivo) setError(e instanceof Error ? e.message : 'no se pudo calcular') })
    return () => { vivo = false }
  }, [intento])

  const marco: React.CSSProperties = {
    ...mono, border: '1px solid #1e1e1e', background: '#191919',
    borderLeft: `3px solid ${C_PROPIO}`, marginTop: 8, padding: '10px 12px 12px',
  }
  const titulo = (
    <div style={{ fontSize: 12, color: '#ddd', textTransform: 'uppercase', letterSpacing: 1.2 }}>
      Barranqueras desde la lluvia en Brasil · cálculo propio
    </div>
  )

  if (error) {
    return (
      <div className="sv-panel" style={marco}>
        {titulo}
        <div style={{ fontSize: 12, color: '#E8A87C', marginTop: 6 }}>
          <b>No se pudo calcular.</b> {error}
          <button onClick={() => { setError(null); setIntento(i => i + 1) }} style={boton}>Reintentar</button>
        </div>
      </div>
    )
  }
  if (!datos) {
    return (
      <div className="sv-panel" style={marco}>
        {titulo}
        <div style={{ fontSize: 12, color: '#8f8f8f', marginTop: 6 }}>
          Calculando: represas de Brasil, lluvia y 51 corridas del ensamble… (puede tardar medio minuto)
        </div>
      </div>
    )
  }

  // Pico de la mediana y su rango
  let kPico = 0
  datos.banda.forEach((b, k) => { if ((b.p50 ?? -Infinity) > (datos.banda[kPico].p50 ?? -Infinity)) kPico = k })
  const pico = datos.banda[kPico]
  const ultimo = datos.banda.length - 1
  const fin = datos.banda[ultimo]
  const finSeco = datos.sinLluvia[ultimo]
  const v10 = datos.validacion?.todo?.find(f => f.dias === 10)

  return (
    <div className="sv-panel" style={marco}>
      {titulo}
      <div style={{ fontSize: 11, color: '#8f8f8f', lineHeight: 1.5, marginTop: 4 }}>
        Emitido el {fC(datos.emitido)} con Barranqueras en {nM(datos.alturaHoy.m)} m ({datos.alturaHoy.fuente}),
        las represas del ONS hasta el {fC(datos.ultimoOns)} y {datos.lluvia.corridas} corridas del ECMWF.
        {' '}<b style={{ color: '#a0a0a0' }}>No es el pronóstico oficial</b>: el oficial es el del INA.
      </div>

      {datos.avisos.length > 0 && (
        <div style={{ fontSize: 11, color: '#E8A87C', marginTop: 6, lineHeight: 1.5 }}>
          {datos.avisos.join(' ')}
        </div>
      )}

      <div style={{ fontSize: 12, color: '#c4c4c4', lineHeight: 1.6, marginTop: 10,
        borderLeft: `3px solid ${C_PROPIO}`, paddingLeft: 9 }}>
        Pico de la mediana: <b style={{ color: '#fff' }}>{nM(pico.p50)} m el {fC(datos.fechas[kPico])}</b>
        {' '}(del 10 al 90 % de las corridas, {nM(pico.p10)} a {nM(pico.p90)} m).
        {datos.determinadoHasta && (
          <> Hasta el {fC(datos.determinadoHasta)} la altura la decide agua que ya salió de Brasil: la
          lluvia que venga no la cambia.</>
        )}
        {' '}Al {fC(datos.fechas[ultimo])}: {nM(fin.p10)} a {nM(fin.p90)} m según cuánto llueva;
        sin más lluvia, {nM(finSeco)} m.
      </div>

      <Grafico datos={datos} observado={observado ?? []} pronosticoIna={pronosticoIna ?? []} />

      <Leyenda />

      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', color: '#c4c4c4', marginTop: 12 }}>
        <thead>
          <tr style={{ color: '#8f8f8f', fontSize: 11 }}>
            <th style={{ textAlign: 'left', fontWeight: 400, padding: '4px 6px 4px 0' }}>Cuenca</th>
            <th style={{ textAlign: 'right', fontWeight: 400, padding: '4px 0 4px 10px' }}>Últimos 7 días, mm</th>
            <th style={{ textAlign: 'right', fontWeight: 400, padding: '4px 0 4px 10px' }}>Próximos 15 días, mm (10 · 50 · 90 %)</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(datos.lluvia.cuencas).map(([k, c]) => (
            <tr key={k} style={{ borderTop: '1px solid #232323' }}>
              <td style={{ padding: '4px 6px 4px 0' }}>{c.nombre}</td>
              <td style={{ padding: '4px 0 4px 10px', textAlign: 'right' }}>{c.ultimos7}</td>
              <td style={{ padding: '4px 0 4px 10px', textAlign: 'right' }}>
                {c.proximos15.p10} · <b style={{ color: '#fff' }}>{c.proximos15.p50}</b> · {c.proximos15.p90}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ fontSize: 11, color: '#8f8f8f', marginTop: 10, lineHeight: 1.5,
        borderTop: '1px solid #232323', paddingTop: 9 }}>
        <b style={{ color: '#a0a0a0' }}>Cómo sale.</b> Lo que ya largaron Itaipú y el Iguazú se usa medido
        (ONS, con dos días de atraso: {ultimosOns(datos)}). Lo que todavía no salió lo calcula el modelo
        lluvia–caudal GR4J sobre el Iguazú y la cuenca propia de Itaipú, con la lluvia que cayó y la de cada
        corrida. De las represas a Barranqueras, una función de respuesta ajustada sobre 2008–2018: el agua
        llega entre 4 y 6 días después y el resto hasta dos semanas. El cambio de caudal se suma a la altura
        de hoy por la curva altura–caudal.
        {v10 && (
          <> <b style={{ color: '#a0a0a0' }}>Cuánto acierta.</b> En aguas altas, a 10 días, el error medio
          fue de {nQ(v10.cadena)} m³/s contra {nQ(v10.persistencia)} de suponer que el río no cambia: un{' '}
          {Math.round(v10.mejora * 100)} % menos. Medido con la lluvia que cayó, no con la pronosticada: es
          un techo. Con subidas muy rápidas tiende a pasarse.</>
        )}
        {' '}Calibrado el {fC(datos.calibracion)}. Fuente: {datos.fuente}
      </div>
    </div>
  )
}

function ultimosOns(d: RespuestaCrecida) {
  const med = d.itaipuIguazu.filter(x => x.medido)
  const u = med[med.length - 1]
  return u ? `Itaipú + Iguazú ${nQ(u.m3s)} m³/s el ${fC(u.fecha)}` : 'sin dato reciente'
}

function Leyenda() {
  const item = (estilo: React.CSSProperties, texto: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginRight: 14 }}>
      <span aria-hidden style={{ display: 'inline-block', width: 16, height: 8, ...estilo }} />{texto}
    </span>
  )
  return (
    <div style={{ fontSize: 11, color: '#8f8f8f', marginTop: 4, display: 'flex', flexWrap: 'wrap', rowGap: 4 }}>
      {item({ background: '#8a8a8a', height: 2 }, 'medido')}
      {item({ background: C_PROPIO, height: 2 }, 'mediana')}
      {item({ background: 'rgba(217,166,201,0.35)' }, '10 a 90 % de las corridas')}
      {item({ background: 'rgba(217,166,201,0.12)' }, 'todas')}
      {item({ borderTop: `2px dashed ${C_PROPIO}`, height: 0 }, 'sin más lluvia')}
      {item({ borderTop: `2px dashed ${C_INA}`, height: 0 }, 'INA (oficial)')}
    </div>
  )
}

function Grafico({ datos, observado, pronosticoIna }: {
  datos: RespuestaCrecida; observado: { fecha: string; m: number }[]; pronosticoIna: PuntoPronostico[]
}) {
  const ANCHO = 100, ALTO = 40
  const t = (f: string) => Date.parse(f.slice(0, 10) + 'T00:00:00Z')
  const tFin = t(datos.fechas[datos.fechas.length - 1])
  const t0 = tFin - 32 * 86_400_000
  const obs = observado.filter(o => t(o.fecha) >= t0)
  const ina = pronosticoIna.filter(p => t(p.fecha) >= t0)
  const vals = [
    ...obs.map(o => o.m), ...ina.map(p => p.m), datos.umbral.alerta, datos.umbral.evacuacion,
    ...datos.banda.flatMap(b => [b.min, b.max]).filter((v): v is number => v !== null),
    ...datos.sinLluvia.filter((v): v is number => v !== null),
  ]
  const lo = Math.min(...vals), hi = Math.max(...vals)
  const aire = Math.max(0.1, (hi - lo) * 0.1)
  const min = lo - aire, max = hi + aire
  const x = (f: string) => ((t(f) - t0) / (tFin - t0)) * ANCHO
  const y = (m: number) => ALTO - ((m - min) / (max - min)) * ALTO
  const linea = (pts: [string, number | null][]) => {
    let d = '', abierto = false
    for (const [f, m] of pts) {
      if (m === null) { abierto = false; continue }
      d += `${abierto ? 'L' : 'M'} ${x(f).toFixed(2)} ${y(m).toFixed(2)} `
      abierto = true
    }
    return d
  }
  const area = (arriba: (number | null)[], abajo: (number | null)[]) => {
    const ok = datos.fechas.map((f, k) => [f, arriba[k], abajo[k]] as const).filter(([, a, b]) => a !== null && b !== null)
    if (ok.length < 2) return ''
    return ok.map(([f, a], i) => `${i ? 'L' : 'M'} ${x(f).toFixed(2)} ${y(a!).toFixed(2)}`).join(' ')
      + ' ' + [...ok].reverse().map(([f, , b]) => `L ${x(f).toFixed(2)} ${y(b!).toFixed(2)}`).join(' ') + ' Z'
  }
  const inaMedio = ina.filter(p => p.banda === 'medio')
  const marcas: string[] = []
  for (let tt = t0; tt <= tFin; tt += 86_400_000) {
    const f = new Date(tt).toISOString().slice(0, 10)
    if (f.endsWith('-01') || f.endsWith('-08') || f.endsWith('-15') || f.endsWith('-22')) marcas.push(f)
  }

  return (
    <div style={{ marginTop: 10 }}>
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} preserveAspectRatio="none" role="img"
        aria-label="Altura medida y calculada en Barranqueras"
        style={{ width: '100%', height: 170, display: 'block', background: '#141414' }}>
        {[datos.umbral.evacuacion, datos.umbral.alerta].map((u, i) => (
          <line key={u} x1={0} x2={ANCHO} y1={y(u)} y2={y(u)} stroke={i ? '#EF9F27' : '#C0392B'}
            strokeWidth={0.4} strokeDasharray="2 1.5" vectorEffect="non-scaling-stroke" />
        ))}
        <line x1={x(datos.emitido)} x2={x(datos.emitido)} y1={0} y2={ALTO} stroke="#3a3a3a"
          strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {datos.determinadoHasta && (
          <line x1={x(datos.determinadoHasta)} x2={x(datos.determinadoHasta)} y1={0} y2={ALTO}
            stroke="#a0a0a0" strokeWidth={1} strokeDasharray="1 2" vectorEffect="non-scaling-stroke" />
        )}
        <path d={area(datos.banda.map(b => b.max), datos.banda.map(b => b.min))} fill="rgba(217,166,201,0.12)" />
        <path d={area(datos.banda.map(b => b.p90), datos.banda.map(b => b.p10))} fill="rgba(217,166,201,0.35)" />
        {inaMedio.length > 1 && (
          <path d={linea(inaMedio.map(p => [p.fecha, p.m]))} fill="none" stroke={C_INA} strokeWidth={1}
            strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
        )}
        <path d={linea(datos.fechas.map((f, k) => [f, datos.sinLluvia[k]]))} fill="none" stroke={C_PROPIO}
          strokeWidth={1} strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
        <path d={linea(datos.fechas.map((f, k) => [f, datos.banda[k].p50]))} fill="none" stroke={C_PROPIO}
          strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
        <path d={linea(obs.map(o => [o.fecha, o.m]))} fill="none" stroke="#8a8a8a" strokeWidth={1.4}
          vectorEffect="non-scaling-stroke" />
      </svg>
      <div style={{ position: 'relative', height: 14, fontSize: 11, color: '#8f8f8f' }}>
        {marcas.map(f => (
          <span key={f} style={{ position: 'absolute', left: `${x(f)}%`, transform: 'translateX(-50%)' }}>{fC(f)}</span>
        ))}
      </div>
      <div style={{ fontSize: 11, color: '#8f8f8f', marginTop: 2 }}>
        Eje de {nM(min)} a {nM(max)} m. Rayas naranja y roja: alerta ({nM(datos.umbral.alerta)} m) y
        evacuación ({nM(datos.umbral.evacuacion)} m). Línea gris llena: hoy
        {datos.determinadoHasta ? <>; punteada: hasta acá decide el agua ya en camino ({fC(datos.determinadoHasta)})</> : null}.
      </div>
    </div>
  )
}
