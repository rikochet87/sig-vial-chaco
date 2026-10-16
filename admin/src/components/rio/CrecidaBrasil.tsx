'use client'

/**
 * Cuánto puede crecer el río en Barranqueras según la lluvia en Brasil: el
 * cálculo propio de `/api/rio/crecida` (`lib/crecida.ts`), en lenguaje llano.
 *
 * ── Cómo se lee, de arriba abajo ─────────────────────────────────────────────
 *
 * 1. **Una frase y una regla**: dónde está el río hoy y hasta dónde puede
 *    llegar, sobre una escala con el alerta y la evacuación. Es lo que tiene
 *    que entenderse sin leer nada más.
 * 2. **Tres tarjetas**: en 3, 7 y 14 días, lo más probable y entre qué
 *    valores, del color del nivel que tocaría.
 * 3. **El gráfico**, con los rótulos sobre las líneas y no en una leyenda
 *    aparte, y la lectura del día bajo el cursor.
 * 4. **La lluvia en Brasil** que lo explica, por cuenca.
 * 5. **Lo técnico, plegado**: cómo se calcula, cuánto acierta, fuentes.
 *
 * «Lo más probable» es la mediana de las 51 corridas; «entre a y b», del 10
 * al 90 %. La banda de todas las corridas no se dibuja: confundía más de lo
 * que decía.
 *
 * ── Qué no afirma ─────────────────────────────────────────────────────────────
 *
 * No es un pronóstico oficial, y lo dice arriba. La validación es con la
 * lluvia que cayó, no con la pronosticada: es un techo.
 *
 * Va en su propio color (`C_PROPIO`), que no es el azul del INA, el violeta de
 * las cuencas ni el arena de CHIRPS.
 */

import { useEffect, useRef, useState } from 'react'
import { mono, boton } from '@/components/cuencas/piezas'
import { COLOR_ESTADO, estadoDe, type EstadoRio, type PuntoPronostico } from '@/lib/ina'
import type { EstadoCrecida } from '@/lib/crecidaRegistro'

const C_PROPIO = '#D9A6C9'
const C_INA = '#85B7EB'
const C_MEDIDO = '#b5b5b5'

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

const nM = (v: number | null | undefined, d = 2) => (v === null || v === undefined ? '—' : v.toFixed(d).replace('.', ','))
const fC = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`
const nQ = (v: number) => Math.round(v).toLocaleString('es-AR')
const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const fDia = (f: string) => `${DIAS_SEMANA[new Date(f.slice(0, 10) + 'T12:00:00Z').getUTCDay()]} ${fC(f)}`
const cm = (d: number) => `${d >= 0 ? '+' : '−'}${Math.round(Math.abs(d) * 100)} cm`

const NOMBRE_NIVEL: Record<EstadoRio, string> = {
  aguas_bajas: 'aguas bajas', normal: 'debajo del alerta', alerta: 'en alerta',
  evacuacion: 'en evacuación', sin_umbral: 'sin umbral',
}

/** Con qué palabras se dice un cambio de altura */
function tendencia(d: number) {
  if (Math.abs(d) < 0.05) return 'seguiría prácticamente igual'
  if (d > 0) return d >= 0.3 ? 'seguiría subiendo' : 'subiría un poco'
  return d <= -0.3 ? 'bajaría' : 'bajaría un poco'
}

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
    borderLeft: `3px solid ${C_PROPIO}`, marginTop: 8, padding: '12px 14px 14px',
  }
  const titulo = (
    <div>
      <div style={{ fontSize: 13, color: '#eee', textTransform: 'uppercase', letterSpacing: 1.2 }}>
        Cuánto puede crecer el río en Barranqueras
      </div>
      <div style={{ fontSize: 11, color: '#8f8f8f', marginTop: 3 }}>
        Estimación propia a partir de la lluvia en Brasil. No reemplaza al pronóstico oficial del INA.
      </div>
    </div>
  )

  if (error) {
    return (
      <div className="sv-panel" style={marco}>
        {titulo}
        <div style={{ fontSize: 12, color: '#E8A87C', marginTop: 10 }}>
          <b>No se pudo calcular.</b> {error}{' '}
          <button onClick={() => { setError(null); setIntento(i => i + 1) }} style={boton}>Reintentar</button>
        </div>
      </div>
    )
  }
  if (!datos) {
    return (
      <div className="sv-panel" style={marco}>
        {titulo}
        <div style={{ fontSize: 12, color: '#a0a0a0', marginTop: 10 }}>
          Calculando con lo que largan las represas y la lluvia pronosticada en Brasil… puede tardar medio minuto.
        </div>
      </div>
    )
  }

  const { umbral } = datos
  const hoy = datos.alturaHoy.m
  let kPico = 0
  datos.banda.forEach((b, k) => { if ((b.p50 ?? -Infinity) > (datos.banda[kPico].p50 ?? -Infinity)) kPico = k })
  const pico = datos.banda[kPico]
  const subeHastaElFinal = kPico === datos.banda.length - 1
  const nivelHoy = estadoDe(umbral, hoy)
  const nivelPico = estadoDe(umbral, pico.p50 ?? hoy)
  const nivelMax = estadoDe(umbral, pico.p90 ?? hoy)
  const plazos = [3, 7, 14].filter(k => k < datos.banda.length)

  // La frase principal, que tiene que entenderse sola
  const subePico = (pico.p50 ?? hoy) - hoy
  const hoyTxt = <>Hoy está en <b style={{ color: '#fff' }}>{nM(hoy)} m</b>,{' '}
    <span style={{ color: COLOR_ESTADO[nivelHoy] }}>{NOMBRE_NIVEL[nivelHoy]}</span>.</>
  const frase = subePico < 0.05
    ? <>{hoyTxt} Con lo que viene de Brasil, el río no subiría más:
        en dos semanas {tendencia((datos.banda.at(-1)!.p50 ?? hoy) - hoy)}.</>
    : <>{hoyTxt} Lo más probable es que{' '}
        {subeHastaElFinal ? 'siga subiendo las dos semanas y llegue a ' : 'llegue a '}
        <b style={{ color: '#fff' }}>{nM(pico.p50, 1)} m</b>{subeHastaElFinal ? ' hacia el ' : ' alrededor del '}
        <b style={{ color: '#fff' }}>{fDia(datos.fechas[kPico])}</b>
        {nivelPico !== nivelHoy && <>, <span style={{ color: COLOR_ESTADO[nivelPico] }}>{NOMBRE_NIVEL[nivelPico]}</span></>}.</>

  return (
    <div className="sv-panel" style={marco}>
      {titulo}

      {datos.avisos.length > 0 && (
        <div style={{ fontSize: 11, color: '#E8A87C', marginTop: 10, lineHeight: 1.5 }}>
          {datos.avisos.join(' ')}
        </div>
      )}

      <div style={{ fontSize: 15, color: '#d6d6d6', lineHeight: 1.55, marginTop: 14 }}>{frase}</div>
      {nivelMax !== nivelPico && (nivelMax === 'evacuacion' || nivelMax === 'alerta') && (
        <div style={{ fontSize: 12, color: '#a0a0a0', marginTop: 4 }}>
          Si llueve más de lo esperado podría llegar a {nM(pico.p90, 1)} m,{' '}
          <span style={{ color: COLOR_ESTADO[nivelMax] }}>{NOMBRE_NIVEL[nivelMax]}</span>.
        </div>
      )}

      <Regla hoy={hoy} pico={pico} fechaPico={datos.fechas[kPico]} umbral={umbral} />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
        {plazos.map(k => <Tarjeta key={k} dias={k} fecha={datos.fechas[k]} b={datos.banda[k]} hoy={hoy} umbral={umbral} />)}
      </div>

      {datos.determinadoHasta && (
        <div style={{ fontSize: 12, color: '#a0a0a0', marginTop: 12, lineHeight: 1.5 }}>
          Hasta el <b style={{ color: '#ddd' }}>{fDia(datos.determinadoHasta)}</b> la altura ya está decidida: es
          agua que ya salió de las represas de Brasil. Después depende de cuánto llueva allá.
        </div>
      )}

      <Grafico datos={datos} observado={observado ?? []} pronosticoIna={pronosticoIna ?? []} />

      <Lluvia datos={datos} />

      <details style={{ marginTop: 14, borderTop: '1px solid #232323', paddingTop: 10 }}>
        <summary style={{ fontSize: 11, color: '#a0a0a0', textTransform: 'uppercase', letterSpacing: 1, cursor: 'pointer' }}>
          Cómo se calcula y cuánto acierta
        </summary>
        <Tecnico datos={datos} />
        <Registro emitido={datos.emitido} />
      </details>
    </div>
  )
}

/**
 * La regla: una escala horizontal con los tres niveles pintados, dónde está
 * hoy y hasta dónde puede llegar. Es la lectura de un vistazo.
 */
function Regla({ hoy, pico, fechaPico, umbral }: {
  hoy: number; pico: Banda; fechaPico: string; umbral: { alerta: number; evacuacion: number }
}) {
  const p10 = pico.p10 ?? hoy, p50 = pico.p50 ?? hoy, p90 = pico.p90 ?? hoy
  const lo = Math.min(hoy, p10, umbral.alerta) - 0.4
  const hi = Math.max(p90, umbral.evacuacion) + 0.4
  const x = (m: number) => `${((m - lo) / (hi - lo)) * 100}%`
  const tramo = (a: number, b: number, color: string) => (
    <div style={{ position: 'absolute', left: x(a), width: `calc(${x(b)} - ${x(a)})`, top: 0, bottom: 0, background: color }} />
  )
  const frac = (m: number) => (m - lo) / (hi - lo)
  const rotuloArriba = (m: number, texto: React.ReactNode, color: string, alinear: 'izq' | 'der' | 'centro', fila: number) => (
    <div style={{
      position: 'absolute', left: x(m), bottom: 22 + fila * 17, fontSize: 11, color, whiteSpace: 'nowrap',
      transform: alinear === 'centro' ? 'translateX(-50%)' : alinear === 'der' ? 'translateX(-100%)' : 'none',
    }}>{texto}</div>
  )
  const subeAlgo = p50 - hoy >= 0.05
  return (
    <div style={{ position: 'relative', marginTop: subeAlgo ? 52 : 34, marginBottom: 44 }}>
      {rotuloArriba(hoy, <>Hoy <b style={{ color: '#fff' }}>{nM(hoy)}</b></>, '#ddd', frac(hoy) < 0.5 ? 'izq' : 'der', 0)}
      {subeAlgo && rotuloArriba(p50, <>Pico probable <b style={{ color: '#fff' }}>{nM(p50, 1)}</b> · {fC(fechaPico)}</>, C_PROPIO, frac(p50) < 0.5 ? 'izq' : 'der', 1)}
      <div style={{ position: 'relative', height: 14, background: '#141414', border: '1px solid #2a2a2a' }}>
        {tramo(lo, umbral.alerta, 'rgba(93,202,165,0.18)')}
        {tramo(umbral.alerta, umbral.evacuacion, 'rgba(239,159,39,0.30)')}
        {tramo(umbral.evacuacion, hi, 'rgba(192,57,43,0.35)')}
        {/* Hasta dónde puede llegar: del 10 al 90 % de las corridas */}
        <div title="Entre qué valores puede quedar el pico" style={{
          position: 'absolute', left: x(p10), width: `calc(${x(p90)} - ${x(p10)})`, top: 3, bottom: 3,
          background: C_PROPIO, opacity: 0.55, minWidth: 2,
        }} />
        {subeAlgo && <div style={{ position: 'absolute', left: x(p50), top: -4, bottom: -4, width: 2, marginLeft: -1, background: C_PROPIO }} />}
        <div style={{ position: 'absolute', left: x(hoy), top: -6, bottom: -6, width: 2, marginLeft: -1, background: '#fff' }} />
      </div>
      {[[umbral.alerta, 'Alerta', COLOR_ESTADO.alerta, 0], [umbral.evacuacion, 'Evacuación', COLOR_ESTADO.evacuacion, 1]].map(([m, t, c, fila]) => (
        <div key={t as string} style={{ position: 'absolute', left: x(m as number), top: 20 + (fila as number) * 16, fontSize: 11, color: c as string,
          transform: frac(m as number) < 0.5 ? 'translateX(-6px)' : 'translateX(calc(-100% + 6px))', whiteSpace: 'nowrap' }}>
          ▲ {t} {nM(m as number)}
        </div>
      ))}
    </div>
  )
}

function Tarjeta({ dias, fecha, b, hoy, umbral }: {
  dias: number; fecha: string; b: Banda; hoy: number; umbral: { alerta: number; evacuacion: number }
}) {
  const v = b.p50 ?? hoy
  const nivel = estadoDe(umbral, v)
  const color = COLOR_ESTADO[nivel]
  const d = v - hoy
  return (
    <div style={{ flex: '1 1 150px', background: '#141414', border: '1px solid #262626', borderTop: `3px solid ${color}`, padding: '9px 11px' }}>
      <div style={{ fontSize: 11, color: '#a0a0a0', textTransform: 'uppercase', letterSpacing: 1 }}>
        En {dias} días · {fDia(fecha)}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
        <span style={{ fontSize: 26, color: '#fff', lineHeight: 1 }}>{nM(v)}</span>
        <span style={{ fontSize: 12, color: '#a0a0a0' }}>m</span>
        <span style={{ fontSize: 12, color: Math.abs(d) < 0.05 ? '#a0a0a0' : d > 0 ? '#E8A87C' : COLOR_ESTADO.normal, marginLeft: 'auto' }}>
          {Math.abs(d) < 0.05 ? '= igual' : `${d > 0 ? '▲' : '▼'} ${cm(d)}`}
        </span>
      </div>
      <div style={{ fontSize: 11, color: '#8f8f8f', marginTop: 6 }}>
        entre {nM(b.p10)} y {nM(b.p90)} m
      </div>
      <div style={{ fontSize: 11, color, marginTop: 2 }}>{NOMBRE_NIVEL[nivel]}</div>
    </div>
  )
}

function Grafico({ datos, observado, pronosticoIna }: {
  datos: RespuestaCrecida; observado: { fecha: string; m: number }[]; pronosticoIna: PuntoPronostico[]
}) {
  const ANCHO = 100, ALTO = 40, ALTO_PX = 220
  const caja = useRef<HTMLDivElement>(null)
  const [cursor, setCursor] = useState<number | null>(null)
  const t = (f: string) => Date.parse(f.slice(0, 10) + 'T00:00:00Z')
  const tHoy = t(datos.fechas[0])
  const tFin = t(datos.fechas[datos.fechas.length - 1])
  const t0 = tHoy - 21 * 86_400_000
  const obs = observado.filter(o => t(o.fecha) >= t0)
  const ina = pronosticoIna.filter(p => t(p.fecha) >= t0 && p.banda === 'medio')
  const vals = [
    ...obs.map(o => o.m), ...ina.map(p => p.m), datos.umbral.alerta, datos.umbral.evacuacion,
    ...datos.banda.flatMap(b => [b.p10, b.p90]).filter((v): v is number => v !== null),
    ...datos.sinLluvia.filter((v): v is number => v !== null),
  ]
  const lo = Math.min(...vals), hi = Math.max(...vals)
  const aire = Math.max(0.15, (hi - lo) * 0.12)
  const min = lo - aire, max = hi + aire
  const x = (f: string) => ((t(f) - t0) / (tFin - t0)) * ANCHO
  const y = (m: number) => ALTO - ((m - min) / (max - min)) * ALTO
  const yPct = (m: number) => `${(y(m) / ALTO) * 100}%`
  const linea = (pts: [string, number | null][]) => {
    let d = '', abierto = false
    for (const [f, m] of pts) {
      if (m === null) { abierto = false; continue }
      d += `${abierto ? 'L' : 'M'} ${x(f).toFixed(2)} ${y(m).toFixed(2)} `
      abierto = true
    }
    return d
  }
  const ok = datos.fechas.map((f, k) => [f, datos.banda[k].p90, datos.banda[k].p10] as const).filter(([, a, b]) => a !== null && b !== null)
  const area = ok.length < 2 ? '' : ok.map(([f, a], i) => `${i ? 'L' : 'M'} ${x(f).toFixed(2)} ${y(a!).toFixed(2)}`).join(' ')
    + ' ' + [...ok].reverse().map(([f, , b]) => `L ${x(f).toFixed(2)} ${y(b!).toFixed(2)}`).join(' ') + ' Z'
  // Una medida por día para la lectura bajo el cursor: la última de ese día
  const medidoDelDia = new Map<string, number>()
  for (const o of obs) medidoDelDia.set(o.fecha.slice(0, 10), o.m)
  const marcas: string[] = []
  for (let tt = t0; tt <= tFin; tt += 86_400_000) {
    const f = new Date(tt).toISOString().slice(0, 10)
    // Las del borde se cortarían
    if (['-01', '-08', '-15', '-22'].some(s => f.endsWith(s)) && (tt - t0) / (tFin - t0) > 0.04 && (tt - t0) / (tFin - t0) < 0.96) marcas.push(f)
  }
  const ult = datos.fechas.length - 1

  const mover = (e: React.MouseEvent) => {
    const r = caja.current?.getBoundingClientRect()
    if (!r) return
    const fr = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    setCursor(Math.round((t0 + fr * (tFin - t0)) / 86_400_000) * 86_400_000)
  }
  const fCursor = cursor !== null ? new Date(cursor).toISOString().slice(0, 10) : null
  const kCursor = fCursor ? datos.fechas.indexOf(fCursor) : -1
  const medCursor = fCursor ? medidoDelDia.get(fCursor) : undefined
  const inaCursor = fCursor ? ina.find(p => p.fecha.slice(0, 10) === fCursor)?.m : undefined

  const rotulo = (m: number, texto: string, color: string) => (
    <div style={{ position: 'absolute', left: 4, top: yPct(m), transform: 'translateY(-100%)', fontSize: 11, color,
      background: 'rgba(20,20,20,0.85)', padding: '0 3px', pointerEvents: 'none' }}>{texto}</div>
  )

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 11, color: '#a0a0a0', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
        Las últimas tres semanas y las próximas dos
      </div>
      <div ref={caja} onMouseMove={mover} onMouseLeave={() => setCursor(null)}
        style={{ position: 'relative', height: ALTO_PX, background: '#141414', cursor: 'crosshair' }}>
        <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} preserveAspectRatio="none" role="img"
          aria-label="Altura medida y estimada en Barranqueras"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}>
          <rect x={x(datos.fechas[0])} y={0} width={ANCHO - x(datos.fechas[0])} height={ALTO} fill="#181818" />
          {[[datos.umbral.evacuacion, COLOR_ESTADO.evacuacion], [datos.umbral.alerta, COLOR_ESTADO.alerta]].map(([u, c]) => (
            <line key={u as number} x1={0} x2={ANCHO} y1={y(u as number)} y2={y(u as number)} stroke={c as string}
              strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" opacity={0.8} />
          ))}
          {datos.determinadoHasta && (
            <rect x={x(datos.fechas[0])} y={0} width={x(datos.determinadoHasta) - x(datos.fechas[0])} height={ALTO}
              fill="rgba(255,255,255,0.025)" />
          )}
          <path d={area} fill="rgba(217,166,201,0.28)" />
          {ina.length > 1 && (
            <path d={linea(ina.map(p => [p.fecha, p.m]))} fill="none" stroke={C_INA} strokeWidth={1.2}
              strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
          )}
          <path d={linea(datos.fechas.map((f, k) => [f, datos.sinLluvia[k]]))} fill="none" stroke={C_PROPIO}
            strokeWidth={1.2} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" opacity={0.9} />
          <path d={linea(datos.fechas.map((f, k) => [f, datos.banda[k].p50]))} fill="none" stroke={C_PROPIO}
            strokeWidth={2.2} vectorEffect="non-scaling-stroke" />
          <path d={linea(obs.map(o => [o.fecha, o.m]))} fill="none" stroke={C_MEDIDO} strokeWidth={2}
            vectorEffect="non-scaling-stroke" />
          <line x1={x(datos.fechas[0])} x2={x(datos.fechas[0])} y1={0} y2={ALTO} stroke="#666"
            strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {cursor !== null && (
            <line x1={((cursor - t0) / (tFin - t0)) * ANCHO} x2={((cursor - t0) / (tFin - t0)) * ANCHO} y1={0} y2={ALTO}
              stroke="#ddd" strokeWidth={1} vectorEffect="non-scaling-stroke" opacity={0.6} />
          )}
        </svg>

        {/* Rótulos sobre el dibujo, en HTML para que no se deformen */}
        {rotulo(datos.umbral.evacuacion, `Evacuación ${nM(datos.umbral.evacuacion)} m`, COLOR_ESTADO.evacuacion)}
        {rotulo(datos.umbral.alerta, `Alerta ${nM(datos.umbral.alerta)} m`, COLOR_ESTADO.alerta)}
        <div style={{ position: 'absolute', left: `${x(datos.fechas[0])}%`, top: 4, marginLeft: 5, fontSize: 11, color: '#ddd', pointerEvents: 'none' }}>
          HOY
        </div>
        {datos.determinadoHasta && (
          <div style={{ position: 'absolute', left: `${x(datos.fechas[0])}%`, bottom: 4, marginLeft: 5, fontSize: 11, color: '#8f8f8f', pointerEvents: 'none' }}>
            ya decidido
          </div>
        )}
        {datos.banda[ult].p50 !== null && (
          <div style={{ position: 'absolute', right: 4, top: yPct(datos.banda[ult].p50!), transform: 'translateY(4px)',
            fontSize: 11, color: C_PROPIO, pointerEvents: 'none', textAlign: 'right' }}>
            lo más probable
          </div>
        )}

        {fCursor && (kCursor >= 0 || medCursor !== undefined) && (
          <div style={{
            position: 'absolute', top: 24, pointerEvents: 'none', fontSize: 11, color: '#ccc', lineHeight: 1.5,
            background: '#0e0e0e', border: '1px solid #2a2a2a', padding: '6px 8px', whiteSpace: 'nowrap',
            ...(((cursor! - t0) / (tFin - t0)) > 0.6 ? { right: `${(1 - (cursor! - t0) / (tFin - t0)) * 100 + 1}%` } : { left: `${((cursor! - t0) / (tFin - t0)) * 100 + 1}%` }),
          }}>
            <div style={{ color: '#fff' }}>{fDia(fCursor)}</div>
            {medCursor !== undefined && <div>Medido: <b style={{ color: '#fff' }}>{nM(medCursor)} m</b></div>}
            {kCursor >= 0 && datos.banda[kCursor].p50 !== null && (
              <>
                <div style={{ color: C_PROPIO }}>Lo más probable: <b>{nM(datos.banda[kCursor].p50)} m</b></div>
                <div>entre {nM(datos.banda[kCursor].p10)} y {nM(datos.banda[kCursor].p90)} m</div>
                {datos.sinLluvia[kCursor] !== null && <div>Si no llueve más: {nM(datos.sinLluvia[kCursor])} m</div>}
              </>
            )}
            {inaCursor !== undefined && <div style={{ color: C_INA }}>INA (oficial): {nM(inaCursor)} m</div>}
          </div>
        )}
      </div>
      <div style={{ position: 'relative', height: 16, fontSize: 11, color: '#8f8f8f', marginTop: 2 }}>
        {marcas.map(f => (
          <span key={f} style={{ position: 'absolute', left: `${x(f)}%`, transform: 'translateX(-50%)' }}>{fC(f)}</span>
        ))}
      </div>
      <Leyenda hayIna={ina.length > 1} />
    </div>
  )
}

function Leyenda({ hayIna }: { hayIna: boolean }) {
  const item = (estilo: React.CSSProperties, texto: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 16 }}>
      <span aria-hidden style={{ display: 'inline-block', width: 18, height: 10, ...estilo }} />{texto}
    </span>
  )
  return (
    <div style={{ fontSize: 11, color: '#a0a0a0', marginTop: 6, display: 'flex', flexWrap: 'wrap', rowGap: 4 }}>
      {item({ borderTop: `2px solid ${C_MEDIDO}`, height: 0 }, 'medido')}
      {item({ borderTop: `2px solid ${C_PROPIO}`, height: 0 }, 'lo más probable')}
      {item({ background: 'rgba(217,166,201,0.28)' }, 'rango probable')}
      {item({ borderTop: `2px dotted ${C_PROPIO}`, height: 0 }, 'si no llueve más en Brasil')}
      {hayIna && item({ borderTop: `2px dashed ${C_INA}`, height: 0 }, 'pronóstico oficial del INA')}
    </div>
  )
}

/** La lluvia en Brasil que explica la curva: lo que cayó y lo que se espera, por cuenca */
function Lluvia({ datos }: { datos: RespuestaCrecida }) {
  const cuencas = Object.values(datos.lluvia.cuencas)
  const tope = Math.max(1, ...cuencas.flatMap(c => c.medianaDiaria))
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 11, color: '#a0a0a0', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
        La lluvia en Brasil que lo explica
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {cuencas.map(c => (
          <div key={c.nombre} style={{ flex: '1 1 240px', background: '#141414', border: '1px solid #262626', padding: '9px 11px' }}>
            <div style={{ fontSize: 12, color: '#ddd' }}>{c.nombre}</div>
            <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 11, color: '#8f8f8f' }}>
              <div>
                <div>Última semana</div>
                <div style={{ fontSize: 18, color: '#fff', marginTop: 2 }}>{c.ultimos7} <span style={{ fontSize: 11, color: '#a0a0a0' }}>mm</span></div>
              </div>
              <div>
                <div>Próximas dos semanas</div>
                <div style={{ fontSize: 18, color: C_PROPIO, marginTop: 2 }}>~{c.proximos15.p50} <span style={{ fontSize: 11, color: '#a0a0a0' }}>mm</span></div>
                <div style={{ marginTop: 1 }}>entre {c.proximos15.p10} y {c.proximos15.p90}</div>
              </div>
            </div>
            {/* Lluvia diaria más probable, día por día */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 28, marginTop: 8 }} aria-hidden>
              {c.medianaDiaria.map((v, i) => (
                <div key={i} title={`${fC(datos.lluvia.fechas[i])}: ~${nM(v, 1)} mm`}
                  style={{ flex: 1, height: `${Math.max(1, (v / tope) * 100)}%`, background: v >= 1 ? C_PROPIO : '#333', opacity: v >= 1 ? 0.7 : 1 }} />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#8f8f8f', marginTop: 2 }}>
              <span>{fC(datos.lluvia.fechas[0])}</span><span>{fC(datos.lluvia.fechas.at(-1)!)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Lo que antes iba al pie a la vista: el método, la validación y las fuentes */
function Tecnico({ datos }: { datos: RespuestaCrecida }) {
  const v10 = datos.validacion?.todo?.find(f => f.dias === 10)
  return (
    <div style={{ fontSize: 11, color: '#8f8f8f', marginTop: 8, lineHeight: 1.6 }}>
      <p style={{ margin: '0 0 6px' }}>
        <b style={{ color: '#a0a0a0' }}>De dónde sale.</b> El agua que ya largaron Itaipú y el Iguazú se toma
        medida, de los datos del ONS de Brasil ({ultimosOns(datos)}). La que todavía no salió se calcula con un
        modelo lluvia–caudal (GR4J) sobre la cuenca del Iguazú y la propia de Itaipú, con la lluvia que cayó y la
        de cada una de las {datos.lluvia.corridas} corridas del pronóstico del ECMWF. De las represas a
        Barranqueras el agua tarda de 4 a 6 días, y el resto llega en dos semanas. Ese cambio de caudal se pasa a
        altura con la curva de la escala y se suma a la de hoy ({nM(datos.alturaHoy.m)} m, {datos.alturaHoy.fuente}).
      </p>
      <p style={{ margin: '0 0 6px' }}>
        «Lo más probable» es la mitad de las corridas; «entre a y b», del 10 al 90 %. No incluye el río Paraguay
        más allá de cómo viene hoy.
      </p>
      {v10 && (
        <p style={{ margin: '0 0 6px' }}>
          <b style={{ color: '#a0a0a0' }}>Probado contra crecidas pasadas.</b> En aguas altas, a 10 días, se
          equivocó un {Math.round(v10.mejora * 100)} % menos que suponer que el río no cambia ({nQ(v10.cadena)}{' '}
          contra {nQ(v10.persistencia)} m³/s de error medio). Esa prueba usó la lluvia que de verdad cayó, así
          que con la pronosticada acierta menos. En subidas muy rápidas tiende a pasarse.
        </p>
      )}
      <p style={{ margin: 0 }}>Calibrado el {fC(datos.calibracion)}. Fuentes: {datos.fuente}</p>
    </div>
  )
}

function ultimosOns(d: RespuestaCrecida) {
  const med = d.itaipuIguazu.filter(x => x.medido)
  const u = med[med.length - 1]
  return u ? `Itaipú + Iguazú ${nQ(u.m3s)} m³/s el ${fC(u.fecha)}` : 'sin dato reciente'
}

/**
 * El registro diario y el acierto medido. Un registro que se corta en silencio
 * se descubre meses después, cuando se va a medir: por eso dice cuándo fue el
 * último guardado.
 */
function Registro({ emitido }: { emitido: string }) {
  const [r, setR] = useState<EstadoCrecida | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    fetch('/api/rio/crecida/registro')
      .then(async x => {
        const j = await x.json().catch(() => null)
        if (!x.ok) throw new Error(j?.error ?? `el servidor respondió ${x.status}`)
        return j as EstadoCrecida
      })
      .then(j => { if (vivo) setR(j) })
      .catch(e => { if (vivo) setError(e instanceof Error ? e.message : 'error') })
    return () => { vivo = false }
  }, [])

  const caja: React.CSSProperties = { fontSize: 11, color: '#8f8f8f', marginTop: 12, lineHeight: 1.5 }
  const rotulo = <div style={{ fontSize: 11, color: '#a0a0a0', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>Cuánto acertó de verdad</div>
  if (error) return <div style={caja}>{rotulo}No se pudo leer el registro diario: {error}</div>
  if (!r) return <div style={caja}>{rotulo}Leyendo el registro diario…</div>

  const dia = (f: string) => Math.round(Date.parse(f + 'T00:00:00Z') / 86_400_000)
  const atrasado = r.ultimo !== null && dia(emitido) - dia(r.ultimo) > 1
  const medidos = r.acierto.filter(a => a.n > 0)
  const cmA = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)} cm`)
  const th: React.CSSProperties = { textAlign: 'right', fontWeight: 400, padding: '4px 0 4px 10px', color: '#8f8f8f' }
  const td: React.CSSProperties = { textAlign: 'right', padding: '4px 0 4px 10px' }

  return (
    <div style={caja}>
      {rotulo}
      {r.dias === 0
        ? <>Todavía no se guardó ninguna estimación. Se guarda una por día, a las 09:00.</>
        : <>Se guarda la estimación de cada día para compararla después con lo que midió la escala: hay {r.dias} {r.dias === 1 ? 'guardada' : 'guardadas'}, del {fC(r.primero!)} al {fC(r.ultimo!)}.</>}
      {atrasado && (
        <span style={{ color: '#E8A87C' }}> El último es del {fC(r.ultimo!)}: el guardado diario se cortó.</span>
      )}
      {r.dias > 0 && !medidos.length && (
        <> Mañana se puede comparar la primera.</>
      )}
      {medidos.length > 0 && (
        <>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', color: '#c4c4c4', marginTop: 6 }}>
            <thead>
              <tr style={{ fontSize: 11 }}>
                <th style={{ ...th, textAlign: 'left', paddingLeft: 0 }}>Plazo</th>
                <th style={th}>Casos</th>
                <th style={th}>Se equivocó en promedio</th>
                <th style={th}>Suponiendo que no cambia</th>
                <th style={th}>Sin más lluvia</th>
                <th style={th}>Tendencia</th>
                <th style={th}>Cayó dentro del rango</th>
              </tr>
            </thead>
            <tbody>
              {medidos.map(a => {
                const gana = a.maeMediana !== null && a.maePersistencia !== null && a.maeMediana < a.maePersistencia
                return (
                  <tr key={a.dias} style={{ borderTop: '1px solid #232323' }}>
                    <td style={{ ...td, textAlign: 'left', paddingLeft: 0 }}>{a.dias} {a.dias === 1 ? 'día' : 'días'}</td>
                    <td style={td}>{a.n}</td>
                    <td style={{ ...td, color: gana ? '#fff' : '#c4c4c4' }}>{cmA(a.maeMediana)}</td>
                    <td style={td}>{cmA(a.maePersistencia)}</td>
                    <td style={td}>{cmA(a.maeSinLluvia)}</td>
                    <td style={td}>{a.sesgo === null ? '—' : Math.abs(a.sesgo) < 0.03 ? 'pareja' : a.sesgo > 0 ? `se pasa ${cmA(a.sesgo)}` : `se queda corta ${cmA(-a.sesgo)}`}</td>
                    <td style={td}>{a.cobertura === null ? '—' : `${Math.round(a.cobertura * 100)} %`}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div style={{ marginTop: 4 }}>
            Contra la altura que midió la escala de Barranqueras. Sirve si se equivoca menos que «suponiendo que no
            cambia» (en blanco cuando le gana). Lo ideal es que la medida caiga dentro del rango unas 8 de cada 10
            veces. Con menos de treinta casos por plazo todavía no alcanza para sacar conclusiones.
          </div>
        </>
      )}
    </div>
  )
}
