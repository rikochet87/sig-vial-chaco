'use client'

/**
 * El Paraná en Barranqueras sobre 120 años: máximos anuales, recurrencia y
 * curva de permanencia.
 *
 * ── Para qué está ─────────────────────────────────────────────────────────────
 *
 * Las franjas de arriba dicen cuánto marca el río hoy y cuánto le falta para el
 * alerta. Lo que no dicen es **qué tan raro es eso**: si 6 m es algo que pasa
 * un año de cada dos o uno de cada veinte. Esa lectura sólo la puede dar una
 * serie larga.
 *
 * ── Lo contado y lo ajustado van separados ────────────────────────────────────
 *
 * La tabla de umbrales pone lado a lado en cuántos años se superó cada uno
 * —una cuenta— y la recurrencia que da Gumbel —un ajuste—. Son dos preguntas
 * parecidas con dos respuestas, y si alguien va a citar un número tiene que
 * saber cuál de las dos está citando. Ver `lib/rioHistorico.ts`.
 *
 * ── El período se elige, y no se esconde ──────────────────────────────────────
 *
 * El régimen del río cambió hacia 1971. Las barras de los años que quedan
 * afuera del período elegido **se atenúan en vez de desaparecer**: el gráfico
 * no se reacomoda y se ve qué se está dejando afuera.
 *
 * ── Todo en la escala de Barranqueras ─────────────────────────────────────────
 *
 * Las alturas y los umbrales son los de Barranqueras, que es la escala que
 * decide de este lado del río. Antes eran los de Corrientes, y la pantalla
 * contestaba cada cuánto se supera un alerta que no es el de acá.
 *
 * ── De dónde sale lo anterior a 1970 ──────────────────────────────────────────
 *
 * El registro son dos series del INA y la pantalla lo dice: la media diaria
 * desde 1970 y, antes, la lectura diaria de la escala. Un número que se va a
 * citar tiene que poder decir de dónde sale.
 */

import { useEffect, useMemo, useState } from 'react'
import { ESTACIONES } from '@/lib/ina'
import {
  extremosAnuales, delPeriodo, ajustarGumbel, alturaDeRecurrencia, recurrenciaDe,
  errorEstandar, bondadKS, aniosSobre, permanencia, ultimaVezSobre, etiquetaAnio,
  csvAnios, RECURRENCIAS, ANIO_REGIMEN,
  type SerieDiariaRio, type PeriodoRio, type AnioRio,
} from '@/lib/rioHistorico'
import { mono, boton, th, thD, td, tdD, bajarCsv } from '@/components/cuencas/piezas'

const BARRANQUERAS = ESTACIONES.find(e => e.id === 20)!

const C_NORMAL = '#7d7d7d'
const C_ALERTA = '#EF9F27'
const C_EVAC = '#C0392B'
const C_ACTUAL = '#85B7EB'

const nM = (m: number) => m.toFixed(2).replace('.', ',')
const n1 = (v: number) => v.toFixed(1).replace('.', ',')
const fLarga = (f: string) => f.slice(0, 10).split('-').reverse().join('/')
const colorDe = (m: number) =>
  m >= BARRANQUERAS.evacuacion ? C_EVAC : m >= BARRANQUERAS.alerta ? C_ALERTA : C_NORMAL

const rotulo: React.CSSProperties = {
  fontSize: 11, color: '#a0a0a0', textTransform: 'uppercase', letterSpacing: 1,
  margin: '16px 0 6px',
}

interface Props {
  /** La última lectura de Barranqueras del panel del día, para ubicarla en el registro */
  actual?: { fecha: string; m: number } | null
}

export default function HistoricoBarranqueras({ actual }: Props) {
  const [serie, setSerie] = useState<SerieDiariaRio | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)
  const [periodo, setPeriodo] = useState<PeriodoRio>('completo')
  const [sobreAnio, setSobreAnio] = useState<number | null>(null)
  const [sobrePct, setSobrePct] = useState<number | null>(null)

  useEffect(() => {
    let vivo = true
    fetch('/rio/barranqueras_diario.json')
      .then(r => {
        // Un 404 devuelve una página de error que `.json()` no puede leer: se
        // mira `ok` antes, para poder decir qué pasó.
        if (!r.ok) throw new Error(`el servidor respondió ${r.status}`)
        return r.json() as Promise<SerieDiariaRio>
      })
      .then(j => {
        if (!vivo) return
        if (!Array.isArray(j?.cm) || typeof j?.desde !== 'string') throw new Error('el archivo no tiene la forma esperada')
        setSerie(j)
        setError(null)
      })
      .catch(e => { if (vivo) setError(e instanceof Error ? e.message : 'no se pudo leer') })
    return () => { vivo = false }
  }, [intento])

  // Lo que no depende del período: se calcula una vez por archivo
  const anios = useMemo(
    () => serie ? extremosAnuales(serie, [BARRANQUERAS.alerta, BARRANQUERAS.evacuacion]) : [],
    [serie],
  )

  /*
   * El cambio de régimen, medido sobre el archivo que se cargó y no escrito a
   * mano en la nota: si se regenera la serie, el número que justifica tener dos
   * períodos se actualiza solo.
   */
  const regimen = useMemo(() => {
    const media = (v: number[]) => v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN
    const ok = anios.filter(a => a.completo)
    const antes = ok.filter(a => a.anio < ANIO_REGIMEN)
    const despues = ok.filter(a => a.anio >= ANIO_REGIMEN)
    return {
      minAntes: media(antes.map(a => a.min)), minDespues: media(despues.map(a => a.min)),
      maxAntes: media(antes.map(a => a.max)), maxDespues: media(despues.map(a => a.max)),
    }
  }, [anios])

  const calc = useMemo(() => {
    if (!serie) return null
    const usados = delPeriodo(anios, periodo).filter(a => a.completo)
    const maximos = usados.map(a => a.max)
    const g = ajustarGumbel(maximos)
    return {
      usados, maximos, g,
      ks: g ? bondadKS(maximos, g) : null,
      perm: permanencia(serie, periodo),
      record: usados.reduce<AnioRio | null>((a, b) => (!a || b.max > a.max ? b : a), null),
    }
  }, [serie, anios, periodo])

  if (error) {
    return (
      <div style={{ ...mono, fontSize: 12, color: '#E8A87C', border: '1px solid #7a4a22',
        background: 'rgba(40,24,16,.5)', borderLeft: '3px solid #E8833A', borderRadius: 2,
        padding: '8px 12px', marginTop: 8 }}>
        <b>No se pudo cargar el registro histórico de Barranqueras.</b> {error}
        <button onClick={() => setIntento(i => i + 1)} style={{ ...boton, marginLeft: 10 }}>
          Reintentar
        </button>
      </div>
    )
  }

  if (!serie || !calc) {
    return (
      <div style={{ ...mono, fontSize: 12, color: '#8f8f8f', marginTop: 8 }}>
        Cargando el registro histórico de Barranqueras…
      </div>
    )
  }

  const { usados, maximos, g, ks, perm, record } = calc
  const primero = usados[0]
  const ultimo = usados[usados.length - 1]
  const incompletos = delPeriodo(anios, periodo).filter(a => !a.completo)

  const umbrales = [
    { nombre: 'Alerta', h: BARRANQUERAS.alerta, color: C_ALERTA },
    { nombre: 'Evacuación', h: BARRANQUERAS.evacuacion, color: C_EVAC },
  ]
  const crecidas = usados
    .filter(a => a.max >= BARRANQUERAS.evacuacion)
    .sort((a, b) => b.max - a.max)

  return (
    <div className="sv-panel" style={{ ...mono, border: '1px solid #1e1e1e', background: '#191919',
      borderLeft: '3px solid #F5C300', marginTop: 8, padding: '10px 12px 12px' }}>

      <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
        <span style={{ fontSize: 12, color: '#ddd', textTransform: 'uppercase', letterSpacing: 1.2, flex: 1 }}>
          Barranqueras — registro histórico
        </span>
        {(['completo', 'reciente'] as const).map(p => (
          <button key={p} onClick={() => setPeriodo(p)} style={{
            ...boton, marginLeft: 0,
            color: periodo === p ? '#F5C300' : '#8f8f8f',
            borderColor: periodo === p ? '#6b5a14' : '#2d2d2d',
          }}>
            {p === 'completo' ? 'Serie completa' : `Desde ${etiquetaAnio(ANIO_REGIMEN)}`}
          </button>
        ))}
        <button style={boton} onClick={() => bajarCsv(
          csvAnios(usados, umbrales.map(u => ({ nombre: u.nombre.toLowerCase() }))),
          `barranqueras-anual-${etiquetaAnio(primero.anio).replace('/', '-')}-a-${etiquetaAnio(ultimo.anio).replace('/', '-')}.csv`,
        )}>
          CSV
        </button>
      </div>

      <div style={{ fontSize: 11, color: '#8f8f8f', lineHeight: 1.5, marginTop: 4 }}>
        Altura diaria en la escala de Barranqueras, {fLarga(serie.desde)} a {fLarga(serie.hasta)}.
        {serie.origen && (
          <> Hasta el {fLarga(diaAntes(serie.origen.mediaDesde))} es la lectura diaria de la escala;
            desde entonces, la media diaria.</>
        )}
        {' '}Se usan <b style={{ color: '#a0a0a0' }}>{usados.length} años hidrológicos</b> (septiembre
        a agosto), de {etiquetaAnio(primero.anio)} a {etiquetaAnio(ultimo.anio)}.
        {incompletos.length > 0 && (
          <> Quedan afuera por incompletos: {incompletos.map(a => etiquetaAnio(a.anio)).join(', ')}.</>
        )}
      </div>

      {actual && (
        <div style={{ fontSize: 12, color: '#c4c4c4', lineHeight: 1.6, marginTop: 10,
          borderLeft: `3px solid ${C_ACTUAL}`, paddingLeft: 9 }}>
          Hoy <b>{nM(actual.m)} m</b>. El río estuvo a esa altura o más el{' '}
          <b>{n1(perm.sobre(actual.m) * 100)} %</b> de los días del período.
          <span style={{ color: '#a0a0a0' }}>
            {' '}Última vez sobre el alerta: {fechaO(ultimaVezSobre(serie, BARRANQUERAS.alerta))};
            sobre evacuación: {fechaO(ultimaVezSobre(serie, BARRANQUERAS.evacuacion))}.
          </span>
        </div>
      )}

      {/* ── Máximos anuales ─────────────────────────────────────────────── */}
      <div style={rotulo}>Máximo de cada año hidrológico</div>
      <MaximosAnuales anios={anios} periodo={periodo} sobre={sobreAnio} onSobre={setSobreAnio} />
      <div style={{ fontSize: 11, color: '#a0a0a0', marginTop: 4, minHeight: 17 }}>
        {(() => {
          const a = anios.find(x => x.anio === sobreAnio) ?? record
          if (!a) return null
          return (
            <>
              <b style={{ color: '#ddd' }}>{etiquetaAnio(a.anio)}</b>
              {sobreAnio === null && ' (el mayor del período)'}
              {' · '}máximo <b style={{ color: '#ddd' }}>{nM(a.max)} m</b> el {fLarga(a.fechaMax)}
              {a.diasSobre[0] > 0
                ? <> · {a.diasSobre[0]} días sobre alerta, {a.diasSobre[1]} sobre evacuación</>
                : ' · no llegó al alerta'}
              {!a.completo && <span style={{ color: '#E8A87C' }}> · año incompleto ({a.dias} días), no entra en el ajuste</span>}
            </>
          )
        })()}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 28px' }}>
        {/* ── Umbrales ──────────────────────────────────────────────────── */}
        <div style={{ flex: '1 1 430px', minWidth: 0 }}>
          <div style={rotulo}>Cada cuánto se supera cada umbral</div>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', color: '#c4c4c4' }}>
            <thead>
              <tr style={{ color: '#8f8f8f', fontSize: 11 }}>
                <th style={th}>Umbral</th>
                <th style={thD}>Altura</th>
                <th style={thD}>Contado</th>
                <th style={thD}>Gumbel</th>
                <th style={thD}>Del tiempo</th>
              </tr>
            </thead>
            <tbody>
              {umbrales.map(u => {
                const c = aniosSobre(maximos, u.h)
                return (
                  <tr key={u.nombre} style={{ borderTop: '1px solid #232323' }}>
                    <td style={td}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, background: u.color, marginRight: 7 }} />
                      {u.nombre}
                    </td>
                    <td style={tdD}>{nM(u.h)} m</td>
                    <td style={tdD}>
                      {c.veces} de {c.de} años
                      <span style={{ color: '#8f8f8f' }}>{c.veces > 0 ? ` · 1 cada ${n1(c.de / c.veces)}` : ''}</span>
                    </td>
                    <td style={tdD}>{g ? `1 cada ${n1(recurrenciaDe(g, u.h))}` : '—'}</td>
                    <td style={tdD}>{(perm.sobre(u.h) * 100).toFixed(2).replace('.', ',')} %</td>
                  </tr>
                )
              })}
              {record && (
                <tr style={{ borderTop: '1px solid #232323' }}>
                  <td style={td}>Mayor del período</td>
                  <td style={tdD}>{nM(record.max)} m</td>
                  <td style={tdD}>{etiquetaAnio(record.anio)}</td>
                  <td style={tdD}>{g ? `1 cada ${Math.round(recurrenciaDe(g, record.max))}` : '—'}</td>
                  <td style={tdD} />
                </tr>
              )}
            </tbody>
          </table>
          <div style={{ fontSize: 11, color: '#8f8f8f', lineHeight: 1.5, marginTop: 5 }}>
            <b style={{ color: '#a0a0a0' }}>Contado</b> es en cuántos años el máximo llegó al umbral:
            no supone nada. <b style={{ color: '#a0a0a0' }}>Gumbel</b> es la recurrencia del ajuste,
            en años. <b style={{ color: '#a0a0a0' }}>Del tiempo</b> es la parte de los días en que el
            río estuvo por encima.
          </div>
        </div>

        {/* ── Recurrencia ───────────────────────────────────────────────── */}
        <div style={{ flex: '1 1 300px', minWidth: 0 }}>
          <div style={rotulo}>Altura por recurrencia (Gumbel)</div>
          {g && ks ? (
            <>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', color: '#c4c4c4' }}>
                <thead>
                  <tr style={{ color: '#8f8f8f', fontSize: 11 }}>
                    <th style={th}>Recurrencia</th>
                    <th style={thD}>Prob. anual</th>
                    <th style={thD}>Altura</th>
                    <th style={thD}>± 95 %</th>
                  </tr>
                </thead>
                <tbody>
                  {RECURRENCIAS.map(T => {
                    const h = alturaDeRecurrencia(g, T)
                    return (
                      <tr key={T} style={{ borderTop: '1px solid #232323' }}>
                        <td style={td}>{T} años</td>
                        <td style={tdD}>{100 / T} %</td>
                        <td style={{ ...tdD, color: colorDe(h) === C_NORMAL ? '#c4c4c4' : '#fff' }}>
                          <span style={{ display: 'inline-block', width: 8, height: 8, background: colorDe(h), marginRight: 7 }} />
                          {nM(h)} m
                        </td>
                        <td style={{ ...tdD, color: '#a0a0a0' }}>{nM(1.96 * errorEstandar(g, T))}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div style={{ fontSize: 11, color: '#8f8f8f', lineHeight: 1.5, marginTop: 5 }}>
                Ajuste por momentos sobre {g.n} máximos anuales (media {nM(g.media)} m, desvío {nM(g.desvio)} m).
                {' '}{ks.pasa
                  ? <>No se aparta de lo observado (Kolmogorov-Smirnov {ks.d.toFixed(3).replace('.', ',')} contra {ks.critico.toFixed(3).replace('.', ',')}).</>
                  : <span style={{ color: '#E8A87C' }}>El ajuste se aparta de lo observado (Kolmogorov-Smirnov {ks.d.toFixed(3).replace('.', ',')} contra {ks.critico.toFixed(3).replace('.', ',')}): tomar con reserva.</span>}
                {' '}Más allá de 50 años es extrapolación.
              </div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: '#8f8f8f' }}>No hay años suficientes para ajustar.</div>
          )}
        </div>
      </div>

      {/* ── Permanencia ─────────────────────────────────────────────────── */}
      <div style={rotulo}>Curva de permanencia</div>
      <CurvaPermanencia perm={perm} actual={actual?.m ?? null} sobre={sobrePct} onSobre={setSobrePct} />
      <div style={{ fontSize: 11, color: '#a0a0a0', marginTop: 4, minHeight: 17 }}>
        {sobrePct !== null
          ? <>El <b style={{ color: '#ddd' }}>{n1(sobrePct * 100)} %</b> de los días el río estuvo en{' '}
              <b style={{ color: '#ddd' }}>{nM(perm.alturaDe(sobrePct))} m</b> o más.</>
          : <>La mitad de los días el río estuvo en <b style={{ color: '#ddd' }}>{nM(perm.alturaDe(0.5))} m</b> o
              más; el 10 %, en {nM(perm.alturaDe(0.1))} m o más; el 90 %, en {nM(perm.alturaDe(0.9))} m o más.
              {' '}Sobre {perm.dias.toLocaleString('es-AR')} días medidos.</>}
      </div>

      {/* ── Crecidas ────────────────────────────────────────────────────── */}
      <div style={rotulo}>
        Años que llegaron al nivel de evacuación ({crecidas.length} de {usados.length})
      </div>
      <table style={{ width: '100%', maxWidth: 640, fontSize: 12, borderCollapse: 'collapse', color: '#c4c4c4' }}>
        <thead>
          <tr style={{ color: '#8f8f8f', fontSize: 11 }}>
            <th style={th}>Año hidrológico</th>
            <th style={thD}>Máximo</th>
            <th style={thD}>Fecha</th>
            <th style={thD}>Días sobre alerta</th>
            <th style={thD}>Días sobre evacuación</th>
          </tr>
        </thead>
        <tbody>
          {crecidas.map(a => (
            <tr key={a.anio} style={{ borderTop: '1px solid #232323' }}
              onMouseEnter={() => setSobreAnio(a.anio)} onMouseLeave={() => setSobreAnio(null)}>
              <td style={td}>{etiquetaAnio(a.anio)}</td>
              <td style={tdD}>{nM(a.max)} m</td>
              <td style={{ ...tdD, color: '#a0a0a0' }}>{fLarga(a.fechaMax)}</td>
              <td style={tdD}>{a.diasSobre[0]}</td>
              <td style={tdD}>{a.diasSobre[1]}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ fontSize: 11, color: '#8f8f8f', marginTop: 12, lineHeight: 1.5,
        borderTop: '1px solid #232323', paddingTop: 9 }}>
        <b style={{ color: '#a0a0a0' }}>El régimen del río cambió hacia {ANIO_REGIMEN}.</b> En esta
        serie el mínimo anual promedia {nM(regimen.minAntes)} m hasta {ANIO_REGIMEN - 1} y{' '}
        {nM(regimen.minDespues)} m después; el máximo, {nM(regimen.maxAntes)} y {nM(regimen.maxDespues)} m.
        Por eso se puede calcular con la serie completa o sólo con el período reciente: son dos
        respuestas y hay que decir cuál se cita. Las alturas son de la escala de Barranqueras y no
        se trasladan a otra escala del tramo.
        {serie.origen && (
          <> El registro junta dos series de la misma escala: la de lecturas
            ({serie.origen.deLecturaAntes.toLocaleString('es-AR')} días hasta el{' '}
            {fLarga(diaAntes(serie.origen.mediaDesde))}, una lectura por día, y{' '}
            {serie.origen.deLecturaDespues} días sueltos después) y la media diaria
            ({serie.origen.deMedia.toLocaleString('es-AR')} días). En los{' '}
            {serie.origen.comunes.toLocaleString('es-AR')} días en que existen las dos difieren{' '}
            {serie.origen.maeCm.toFixed(2).replace('.', ',')} cm en promedio.</>
        )}
        {' '}Los días sin dato no se rellenan. El registro llega al
        {' '}{fLarga(serie.hasta)}; el año hidrológico en curso no entra hasta que se regenere el
        archivo. Fuente: {serie.fuente}, series {serie.serie}
        {serie.serieLecturas !== undefined && <> y {serie.serieLecturas}</>}.
      </div>
    </div>
  )
}

const fechaO = (f: string | null) => (f ? fLarga(f) : 'nunca')

/** El día anterior a una fecha 'AAAA-MM-DD' */
const diaAntes = (f: string) =>
  new Date(Date.parse(f + 'T00:00:00Z') - 86_400_000).toISOString().slice(0, 10)

/**
 * Una barra por año hidrológico, desde cero.
 *
 * Arranca en cero y no en el mínimo: son barras, y una barra cortada exagera la
 * diferencia entre un año y otro. El color es el estado contra los umbrales del
 * INA, que además van dibujados y rotulados — no depende sólo del color.
 */
function MaximosAnuales({ anios, periodo, sobre, onSobre }: {
  anios: AnioRio[]; periodo: PeriodoRio; sobre: number | null; onSobre: (a: number | null) => void
}) {
  const ALTO = 40
  const n = anios.length
  const techo = Math.max(...anios.map(a => a.max), BARRANQUERAS.evacuacion) * 1.06
  const y = (m: number) => ALTO - (Math.max(0, m) / techo) * ALTO
  const paso = 100 / n
  const pct = (m: number) => `${(y(m) / ALTO) * 100}%`

  // Una marca cada veinte años, en el año redondo
  const marcas = anios
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => a.anio % 20 === 0)

  return (
    <div style={{ paddingRight: MARGEN }}>
      <div style={{ position: 'relative' }}
        onMouseMove={e => {
          const r = e.currentTarget.getBoundingClientRect()
          const i = Math.floor(((e.clientX - r.left) / r.width) * n)
          onSobre(anios[Math.min(n - 1, Math.max(0, i))]?.anio ?? null)
        }}
        onMouseLeave={() => onSobre(null)}>
        <svg viewBox={`0 0 100 ${ALTO}`} preserveAspectRatio="none" role="img"
          aria-label="Máximo de cada año hidrológico en Barranqueras, con los niveles de alerta y evacuación"
          style={{ width: '100%', height: 150, display: 'block', background: '#141414' }}>
          {anios.map((a, i) => {
            const fuera = periodo === 'reciente' && a.anio < ANIO_REGIMEN
            return (
              <rect key={a.anio} x={i * paso + paso * 0.15} width={paso * 0.7}
                y={y(a.max)} height={ALTO - y(a.max)}
                fill={a.completo ? colorDe(a.max) : 'none'}
                stroke={a.completo ? 'none' : '#7d7d7d'} strokeWidth={0.5} vectorEffect="non-scaling-stroke"
                opacity={a.anio === sobre ? 1 : fuera ? 0.22 : sobre === null ? 0.9 : 0.6} />
            )
          })}
          <line x1={0} x2={100} y1={y(BARRANQUERAS.evacuacion)} y2={y(BARRANQUERAS.evacuacion)}
            stroke={C_EVAC} strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
          <line x1={0} x2={100} y1={y(BARRANQUERAS.alerta)} y2={y(BARRANQUERAS.alerta)}
            stroke={C_ALERTA} strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
        </svg>
        <Etiqueta top={pct(BARRANQUERAS.evacuacion)} color={C_EVAC} arriba>evacuación {nM(BARRANQUERAS.evacuacion)} m</Etiqueta>
        <Etiqueta top={pct(BARRANQUERAS.alerta)} color={C_ALERTA}>alerta {nM(BARRANQUERAS.alerta)} m</Etiqueta>
      </div>
      <div style={{ position: 'relative', height: 16, fontSize: 11, color: '#8f8f8f' }}>
        {marcas.map(({ a, i }) => (
          <span key={a.anio} style={{ position: 'absolute', left: `${(i + 0.5) * paso}%`,
            transform: 'translateX(-50%)', top: 2 }}>
            {a.anio}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Ancho del margen derecho donde van los rótulos de los umbrales */
const MARGEN = 122

/**
 * Rótulo de una línea de referencia, en el margen derecho.
 *
 * Va afuera del gráfico y no encima: la primera versión los ponía sobre el
 * borde izquierdo y tapaban la crecida de 1905 en las barras y el tramo más
 * empinado de la curva de permanencia — justo la parte que se vino a mirar.
 */
function Etiqueta({ top, arriba = false, color, children }: {
  top: string; arriba?: boolean; color: string; children: React.ReactNode
}) {
  return (
    <span style={{
      position: 'absolute', left: `calc(100% + 6px)`, top, pointerEvents: 'none', whiteSpace: 'nowrap',
      transform: arriba ? 'translateY(-100%)' : undefined,
      fontSize: 11, color: '#c4c4c4', lineHeight: '15px',
      borderLeft: `3px solid ${color}`, paddingLeft: 5,
    }}>
      {children}
    </span>
  )
}

/**
 * La altura contra el porcentaje del tiempo en que se la iguala o supera.
 *
 * Es la forma de manual: el eje horizontal va de 0 a 100 % y la curva baja. La
 * altura de hoy va como una línea, y el punto donde corta la curva es la parte
 * del tiempo en que el río estuvo más alto que hoy.
 */
function CurvaPermanencia({ perm, actual, sobre, onSobre }: {
  perm: ReturnType<typeof permanencia>; actual: number | null
  sobre: number | null; onSobre: (p: number | null) => void
}) {
  const ALTO = 40
  const PUNTOS = 200
  const max = perm.alturaDe(0)
  const min = perm.alturaDe(1)
  const aire = (max - min) * 0.05
  const techo = max + aire
  const piso = min - aire
  const y = (m: number) => ALTO - ((m - piso) / (techo - piso)) * ALTO
  const pct = (m: number) => `${(y(m) / ALTO) * 100}%`

  const camino = Array.from({ length: PUNTOS + 1 }, (_, i) => {
    const p = i / PUNTOS
    return `${i === 0 ? 'M' : 'L'} ${(p * 100).toFixed(2)} ${y(perm.alturaDe(p)).toFixed(2)}`
  }).join(' ')

  const pActual = actual !== null ? perm.sobre(actual) : null

  return (
    <div style={{ paddingRight: MARGEN }}>
      <div style={{ position: 'relative' }}
        onMouseMove={e => {
          const r = e.currentTarget.getBoundingClientRect()
          onSobre(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)))
        }}
        onMouseLeave={() => onSobre(null)}>
        <svg viewBox={`0 0 100 ${ALTO}`} preserveAspectRatio="none" role="img"
          aria-label="Curva de permanencia de alturas del Paraná en Barranqueras"
          style={{ width: '100%', height: 150, display: 'block', background: '#141414' }}>
          {[25, 50, 75].map(v => (
            <line key={v} x1={v} x2={v} y1={0} y2={ALTO} stroke="#232323" strokeWidth={1}
              vectorEffect="non-scaling-stroke" />
          ))}
          <line x1={0} x2={100} y1={y(BARRANQUERAS.evacuacion)} y2={y(BARRANQUERAS.evacuacion)}
            stroke={C_EVAC} strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
          <line x1={0} x2={100} y1={y(BARRANQUERAS.alerta)} y2={y(BARRANQUERAS.alerta)}
            stroke={C_ALERTA} strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
          {actual !== null && actual >= piso && actual <= techo && (
            <line x1={0} x2={100} y1={y(actual)} y2={y(actual)}
              stroke={C_ACTUAL} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          )}
          <path d={camino} fill="none" stroke="#d0d0d0" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          {pActual !== null && (
            <line x1={pActual * 100} x2={pActual * 100} y1={y(actual!)} y2={ALTO}
              stroke={C_ACTUAL} strokeWidth={1} strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
          )}
          {sobre !== null && (
            <line x1={sobre * 100} x2={sobre * 100} y1={0} y2={ALTO}
              stroke="#F5C300" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        <Etiqueta top={pct(BARRANQUERAS.evacuacion)} color={C_EVAC} arriba>evacuación {nM(BARRANQUERAS.evacuacion)} m</Etiqueta>
        <Etiqueta top={pct(BARRANQUERAS.alerta)} color={C_ALERTA}>alerta {nM(BARRANQUERAS.alerta)} m</Etiqueta>
        {actual !== null && pActual !== null && (
          /*
           * A la izquierda y debajo de su línea: a la izquierda del cruce la
           * curva va siempre por arriba de la altura de hoy, así que ahí abajo
           * no hay nada que tapar.
           */
          <span style={{
            position: 'absolute', left: 4, top: pct(actual), marginTop: 2,
            pointerEvents: 'none', fontSize: 11, color: C_ACTUAL,
            background: 'rgba(20,20,20,.78)', padding: '0 4px', lineHeight: '15px',
          }}>
            hoy {nM(actual)} m · superada el {n1(pActual * 100)} %
          </span>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#8f8f8f', marginTop: 2 }}>
        <span>0 %</span><span>25 %</span><span>50 % del tiempo</span><span>75 %</span><span>100 %</span>
      </div>
    </div>
  )
}
