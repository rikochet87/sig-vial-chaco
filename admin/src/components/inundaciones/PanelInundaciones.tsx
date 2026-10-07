'use client'
/**
 * La pestaña «Gran Resistencia» de Hidrología: qué se moja con una crecida del
 * Paraná, con una lluvia larga, o con las dos a la vez.
 *
 * El mapa es la pantalla y esto es su panel: se elige una altura del río y se
 * prenden o apagan los otros dos escenarios. Abajo, qué rutas y qué obras
 * relevadas quedan adentro de lo que se está mostrando.
 *
 * **Todo lo que se dibuja es algo que se vio**, con su fecha y la altura que
 * tenía el río ese día. No hay ninguna mancha calculada. Por eso el panel dice
 * de cada capa de qué imagen sale, y avisa cuando la altura pedida pasa lo que
 * hay observado. Ver `lib/inundaciones.ts`.
 */
import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState, useCallback } from 'react'
import type { TramoRed } from '@/lib/redLluvia'
import type { ObraRelevada } from '@/lib/redCuencas'
import type { SerieDiariaRio } from '@/lib/rioHistorico'
import { extremosAnuales, ajustarGumbel, alturaDeRecurrencia, recurrenciaDe, aniosSobre } from '@/lib/rioHistorico'
import type { Pronostico } from '@/lib/pronostico'
import { laminaPorCorrida, ventana, probSuperar } from '@/lib/pronostico'
import {
  BARRANQUERAS, TECHO_ZONAS_M, cotaMop, escenarioRio, IndicePoligonos,
  rutasDelRecuadro, caminosDelRecuadro, viaContra, resumirVias, nodosDelRecuadro,
  type IndiceInundaciones, type CapaInundacion, type MultiPoligono, type ClaseVia,
} from '@/lib/inundaciones'
import type { CapaDibujo, LineaDibujo, PuntoDibujo } from './MapaInundaciones'

const MapaInundaciones = dynamic(() => import('./MapaInundaciones'), {
  ssr: false,
  loading: () => <div style={{ fontFamily: 'monospace', color: '#8f8f8f', fontSize: 13, padding: 20 }}>Cargando mapa…</div>,
})

const mono = { fontFamily: 'monospace' } as const
const ACENTO = '#F5C300'
const f1 = (v: number) => v.toFixed(1).replace('.', ',')
const f2 = (v: number) => v.toFixed(2).replace('.', ',')
const fFecha = (f: string) => f.slice(0, 10).split('-').reverse().join('/')

/** Cómo se pinta cada capa. El orden decide qué queda arriba; menos de 10 = fondo */
const ESTILO: Record<string, { color: string; relleno: number; trazo: number; orden: number }> = {
  'urbano-hoy':  { color: '#bdbdbd', relleno: 0.32, trazo: 0,   orden: 1 },
  permanente:    { color: '#0d47a1', relleno: 0.7,  trazo: 0,   orden: 5 },
  rio:           { color: '#29b6f6', relleno: 0.55, trazo: 0,   orden: 20 },
  observada:     { color: '#ff9800', relleno: 0.2,  trazo: 1.2, orden: 30 },
  'lluvia-2019-01-22': { color: '#ce93d8', relleno: 0.28, trazo: 0, orden: 24 },
  'lluvia-2019-01-17': { color: '#8e24aa', relleno: 0.6,  trazo: 0, orden: 26 },
  combinada:     { color: '#ef5350', relleno: 0.22, trazo: 1.2, orden: 34 },
  defensa:       { color: '#ffee58', relleno: 0.22, trazo: 1.2, orden: 36 },
}
const estiloDe = (c: CapaInundacion) => ESTILO[c.id] ?? ESTILO[c.grupo] ?? ESTILO.rio

const COLOR_VIA: Record<ClaseVia, { color: string; grosor: number }> = {
  nacional:   { color: '#F5C300', grosor: 3 },
  provincial: { color: '#f5f5f5', grosor: 2.2 },
  consorcio:  { color: '#a5d6a7', grosor: 1.4 },
}
const ROTULO_VIA: Record<ClaseVia, string> = {
  nacional: 'Rutas nacionales', provincial: 'Rutas provinciales', consorcio: 'Caminos de consorcio',
}

const seccion: React.CSSProperties = { borderTop: '1px solid #1e1e1e', padding: '12px 14px' }
const rotulo: React.CSSProperties = {
  ...mono, fontSize: 11, color: '#a0a0a0', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8,
}
const texto: React.CSSProperties = { ...mono, fontSize: 12, color: '#a0a0a0', lineHeight: 1.6 }
const aviso: React.CSSProperties = {
  ...mono, fontSize: 12, color: '#E8A87C', lineHeight: 1.6, background: 'rgba(40,24,16,.6)',
  border: '1px solid #5a3a1a', borderLeft: '3px solid #E8833A', padding: '7px 10px', marginTop: 8,
}
const chip = (activo: boolean): React.CSSProperties => ({
  ...mono, fontSize: 11, padding: '4px 8px', cursor: 'pointer', borderRadius: 2,
  letterSpacing: 0.4, background: activo ? '#F5C30022' : 'transparent',
  border: `1px solid ${activo ? '#7a6200' : '#2d2d2d'}`, color: activo ? ACENTO : '#a0a0a0',
})

interface RioHoy {
  ultima: { fecha: string; m: number } | null
  /** El máximo de la banda superior del pronóstico del INA, y cuándo */
  pronMax: { fecha: string; m: number } | null
  pronMedio: { fecha: string; m: number } | null
  emitido: string | null
}

interface Geometria { coords: MultiPoligono; indice: IndicePoligonos }

async function leerJson<T>(url: string): Promise<T> {
  const r = await fetch(url)
  // Un 404 devuelve una página de error que `.json()` no puede leer
  if (!r.ok) throw new Error(`${url}: el servidor respondió ${r.status}`)
  return r.json() as Promise<T>
}

export default function PanelInundaciones({ tramos }: { tramos: TramoRed[] }) {
  const [indice, setIndice] = useState<IndiceInundaciones | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [geo, setGeo] = useState<Record<string, Geometria>>({})
  const [rio, setRio] = useState<RioHoy | null>(null)
  const [rioError, setRioError] = useState<string | null>(null)
  const [serie, setSerie] = useState<SerieDiariaRio | null>(null)
  const [prono, setProno] = useState<Pronostico | null>(null)
  /** No contestó: no es lo mismo que «no llueve», y se dice */
  const [pronoError, setPronoError] = useState(false)
  const [rutas, setRutas] = useState<ReturnType<typeof rutasDelRecuadro>>([])
  const [obras, setObras] = useState<ObraRelevada[] | null>(null)

  /** La altura elegida. `null` = todavía nadie tocó: se usa la de hoy */
  const [altura, setAltura] = useState<number | null>(null)
  const [verReferencia, setVerReferencia] = useState(true)
  const [conLluvia, setConLluvia] = useState(false)
  const [conCombinada, setConCombinada] = useState(false)
  const [conDefensa, setConDefensa] = useState(false)
  const [verUrbano, setVerUrbano] = useState(true)

  // ── Lo que se carga una vez ──
  useEffect(() => {
    let vivo = true
    leerJson<IndiceInundaciones>('/geo/inundaciones/indice.json')
      .then(j => { if (vivo) setIndice(j) })
      .catch(e => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo leer el índice de capas') })
    leerJson<SerieDiariaRio>('/rio/barranqueras_diario.json')
      .then(j => { if (vivo) setSerie(j) }).catch(() => { /* sin registro no hay recurrencia: se dice abajo */ })
    leerJson<Pronostico>('/api/lluvia/pronostico')
      .then(j => { if (vivo) setProno(j) }).catch(() => { if (vivo) setPronoError(true) })
    leerJson<{ obras: ObraRelevada[] }>('/api/lluvia/obras-de-arte')
      .then(j => { if (vivo) setObras(j.obras ?? []) }).catch(() => { if (vivo) setObras(null) })
    leerJson<{ estaciones: { id: number; ultima: { fecha: string; m: number } | null; pronostico: { emitido: string; puntos: { fecha: string; m: number; banda: string }[] } | null }[] }>('/api/rio?dias=10')
      .then(j => {
        if (!vivo) return
        const b = j.estaciones.find(e => e.id === BARRANQUERAS.id)
        if (!b) { setRioError('Barranqueras no contestó'); return }
        const mayor = (banda: string) => (b.pronostico?.puntos ?? []).filter(p => p.banda === banda)
          .reduce<{ fecha: string; m: number } | null>((a, p) => (!a || p.m > a.m ? { fecha: p.fecha, m: p.m } : a), null)
        setRio({ ultima: b.ultima, pronMax: mayor('superior'), pronMedio: mayor('medio'), emitido: b.pronostico?.emitido ?? null })
      })
      .catch(e => { if (vivo) setRioError(e instanceof Error ? e.message : 'No se pudo consultar el río') })
    return () => { vivo = false }
  }, [])

  // Las rutas nacionales y provinciales, cuando ya se sabe el recuadro
  useEffect(() => {
    if (!indice) return
    let vivo = true
    Promise.all([leerJson<Parameters<typeof rutasDelRecuadro>[0]>('/geo/geo_rn.json'), leerJson<Parameters<typeof rutasDelRecuadro>[1]>('/geo/geo_rp.json')])
      .then(([rn, rp]) => { if (vivo) setRutas(rutasDelRecuadro(rn, rp, indice.recuadro)) })
      .catch(() => { /* sin rutas el cruce queda con los caminos de consorcio */ })
    return () => { vivo = false }
  }, [indice])

  // ── El escenario ──
  const h = altura ?? rio?.ultima?.m ?? BARRANQUERAS.alerta
  const esc = useMemo(() => indice ? escenarioRio(indice.capas, h) : null, [indice, h])

  /** Los ids de las capas que hay que tener dibujadas, en un texto estable */
  const claveActivas = useMemo(() => {
    if (!esc) return ''
    return [
      'permanente', verUrbano && 'urbano-hoy', esc.zona?.id, verReferencia && esc.referencia?.id,
      conLluvia && 'lluvia-2019-01-22', conLluvia && 'lluvia-2019-01-17',
      conCombinada && 'obs-1998-05-20', conDefensa && 'obs-1982-08-14',
    ].filter(Boolean).join(',')
  }, [esc, verUrbano, verReferencia, conLluvia, conCombinada, conDefensa])

  // Cada capa se pide recién cuando se la prende, y queda guardada
  useEffect(() => {
    if (!claveActivas) return
    let vivo = true
    for (const id of claveActivas.split(',')) {
      if (geo[id]) continue
      leerJson<{ id: string; coordinates: MultiPoligono }>(`/geo/inundaciones/${id}.json`)
        .then(j => { if (vivo) setGeo(g => g[id] ? g : { ...g, [id]: { coords: j.coordinates, indice: new IndicePoligonos(j.coordinates) } }) })
        .catch(e => { if (vivo) setError(e instanceof Error ? e.message : `No se pudo leer la capa ${id}`) })
    }
    return () => { vivo = false }
    // `geo` no va en las dependencias: cada capa que llega volvería a disparar el pedido de las otras
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveActivas])

  const activas = useMemo(() => {
    if (!indice) return []
    const ids = new Set(claveActivas.split(','))
    return indice.capas.filter(c => ids.has(c.id))
  }, [indice, claveActivas])

  const dibujo: CapaDibujo[] = useMemo(() => activas.filter(c => geo[c.id]).map(c => ({
    id: c.id, coords: geo[c.id].coords, ...estiloDe(c),
    titulo: c.grupo === 'rio' ? `Se moja con el río hasta ${c.alturaM} m`
      : c.grupo === 'observada' ? `Agua del ${c.titulo}, río en ${f2(c.alturaM!)} m`
      : c.grupo === 'base' ? c.titulo : `Agua del ${c.titulo}`,
  })), [activas, geo])

  /** Las capas de agua del escenario (sin el fondo), con su índice ya armado */
  const agua = useMemo(
    () => activas.filter(c => c.grupo !== 'base' && geo[c.id]).map(c => ({ capa: c, indice: geo[c.id].indice })),
    [activas, geo])

  const vias = useMemo(
    () => indice ? [...rutas, ...caminosDelRecuadro(tramos, indice.recuadro)] : [],
    [indice, rutas, tramos])

  const permanente = geo.permanente?.indice
  const cruce = useMemo(() => {
    const idx = agua.map(a => a.indice)
    // Lo que va sobre agua permanente es un puente, no un camino inundado
    const afectadas = vias.map(v => viaContra(v, idx, permanente ? [permanente] : []))
    return { resumen: resumirVias(afectadas), partes: afectadas.flatMap(a => a.partes) }
  }, [vias, agua, permanente])

  const lineas: LineaDibujo[] = useMemo(
    () => vias.map(v => ({ puntos: v.puntos, ...COLOR_VIA[v.clase] })), [vias])

  const obrasAca = useMemo(() => {
    if (!indice || !obras) return []
    const c = indice.recuadro
    return obras.filter(o => o.lat >= c.sur && o.lat <= c.norte && o.lng >= c.oeste && o.lng <= c.este)
      .map(o => ({ ...o, dentro: agua.some(a => a.indice.contiene(o.lat, o.lng)) }))
  }, [indice, obras, agua])
  const puntos: PuntoDibujo[] = useMemo(
    () => obrasAca.map(o => ({ lat: o.lat, lng: o.lng, dentro: o.dentro, titulo: o.tipo })), [obrasAca])

  const urbanoIdx = geo['urbano-hoy']?.indice
  const leer = useCallback((lat: number, lng: number) => {
    const out = agua.filter(a => a.indice.contiene(lat, lng)).map(a =>
      a.capa.grupo === 'rio' ? `se moja con el río hasta ${a.capa.alturaM} m` : `agua del ${a.capa.titulo}`)
    if (urbanoIdx?.contiene(lat, lng)) out.push('construido hoy')
    return out
  }, [agua, urbanoIdx])

  // ── Qué tan seguido llega el río a esa altura ──
  const registro = useMemo(() => {
    if (!serie) return null
    const maximos = extremosAnuales(serie).filter(a => a.completo).map(a => a.max)
    return { maximos, g: ajustarGumbel(maximos) }
  }, [serie])
  const frecuencia = useMemo(() => {
    if (!registro) return null
    const c = aniosSobre(registro.maximos, h)
    return { ...c, cada: registro.g ? recurrenciaDe(registro.g, h) : null }
  }, [registro, h])

  // ── La lluvia pronosticada sobre el área ──
  const lluvia = useMemo(() => {
    if (!prono || !indice) return null
    const nodos = nodosDelRecuadro(prono.puntos, indice.recuadro)
    if (!nodos.length) return null
    const porCorrida = laminaPorCorrida(prono, nodos)
    const siete = ventana(porCorrida, 0, 7)
    return { nodos: nodos.length, tres: ventana(porCorrida, 0, 3), siete, p100: siete ? probSuperar(siete, 100) : null }
  }, [prono, indice])

  const atajos = useMemo(() => {
    const a: { t: string; m: number; d?: string }[] = []
    if (rio?.ultima) a.push({ t: 'Hoy', m: rio.ultima.m, d: `medido el ${fFecha(rio.ultima.fecha)}` })
    if (rio?.pronMax) a.push({ t: 'Pronóstico INA', m: rio.pronMax.m, d: `techo de la banda, ${fFecha(rio.pronMax.fecha)}` })
    a.push({ t: 'Alerta', m: BARRANQUERAS.alerta }, { t: 'Evacuación', m: BARRANQUERAS.evacuacion })
    a.push({ t: '2023', m: 7.05, d: '10/11/2023' }, { t: '1998', m: 8.17, d: '04/05/1998' }, { t: '1983', m: 8.59, d: '22/06/1983, máximo del registro' })
    if (registro?.g) for (const T of [10, 50, 100]) a.push({ t: `${T} años`, m: Math.round(alturaDeRecurrencia(registro.g, T) * 100) / 100, d: 'recurrencia ajustada (Gumbel)' })
    return a
  }, [rio, registro])

  if (error && !indice) {
    return <div style={{ ...aviso, margin: 12 }}><b>No se pudieron cargar las capas.</b> {error}</div>
  }
  if (!indice || !esc) return <div style={{ ...texto, padding: 20 }}>Cargando…</div>

  const combinado = conLluvia && h >= BARRANQUERAS.alerta
  const filaCapa = (c: CapaInundacion) => (
    <tr key={c.id}>
      <td style={{ padding: '3px 6px 3px 0', color: '#d0d0d0' }}>
        <span style={{ display: 'inline-block', width: 9, height: 9, background: estiloDe(c).color, marginRight: 6 }} />
        {c.grupo === 'rio' ? `Río hasta ${c.alturaM} m` : c.titulo}
      </td>
      <td style={{ textAlign: 'right', padding: '3px 0 3px 8px', color: '#e0e0e0' }}>{c.km2 === undefined ? '—' : f1(c.km2)}</td>
      <td style={{ textAlign: 'right', padding: '3px 0 3px 8px', color: '#e0e0e0' }}>{c.urbanoKm2 === undefined ? '—' : f1(c.urbanoKm2)}</td>
      <td style={{ textAlign: 'right', padding: '3px 0 3px 8px', color: c.construidoKm2 && c.construidoKm2 >= 0.5 ? '#E8833A' : '#e0e0e0' }}>
        {c.construidoKm2 === undefined ? '—' : f2(c.construidoKm2)}
      </td>
    </tr>
  )

  return (
    <div style={{ flex: 1, minHeight: 360, display: 'flex', gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0, position: 'relative', background: '#191919', border: '1px solid #1e1e1e' }}>
        <MapaInundaciones recuadro={indice.recuadro} urbano={indice.urbano}
          capas={dibujo} vias={lineas} afectadas={cruce.partes} obras={puntos} leer={leer} />
      </div>

      <div className="sv-panel" style={{ width: 400, flexShrink: 0, overflowY: 'auto', minHeight: 0,
        background: '#191919', border: '1px solid #1e1e1e' }}>

        {/* ── Situación ── */}
        <div style={{ ...seccion, borderTop: 'none' }}>
          <div style={rotulo}>Situación de hoy</div>
          <div style={texto}>
            {rio?.ultima ? (<>
              Río en Barranqueras: <b style={{ color: '#fff' }}>{f2(rio.ultima.m)} m</b> el {fFecha(rio.ultima.fecha)}
              {rio.ultima.m >= BARRANQUERAS.evacuacion ? <b style={{ color: '#E57373' }}> · sobre evacuación</b>
                : rio.ultima.m >= BARRANQUERAS.alerta ? <b style={{ color: '#E8833A' }}> · sobre alerta</b>
                : <> · faltan {f2(BARRANQUERAS.alerta - rio.ultima.m)} m para el alerta</>}.
            </>) : rioError ? <span style={{ color: '#E8A87C' }}>No se pudo consultar el río: {rioError}.</span> : 'Consultando el río…'}
            {rio?.pronMax && (<>
              <br />Pronóstico del INA: hasta <b style={{ color: '#fff' }}>{f2(rio.pronMax.m)} m</b> el {fFecha(rio.pronMax.fecha)}
              {rio.pronMedio && <> (valor central, {f2(rio.pronMedio.m)} m)</>}.
            </>)}
            {rio && !rio.pronMax && <><br />El INA no tiene corrida de pronóstico publicada para Barranqueras.</>}
            <br />
            {lluvia?.siete && lluvia.tres ? (<>
              Lluvia pronosticada sobre el área: <b style={{ color: '#fff' }}>{Math.round(lluvia.tres.mediana)} mm</b> en 3 días
              ({Math.round(lluvia.tres.p10)}–{Math.round(lluvia.tres.p90)}) y{' '}
              <b style={{ color: '#fff' }}>{Math.round(lluvia.siete.mediana)} mm</b> en 7
              ({Math.round(lluvia.siete.p10)}–{Math.round(lluvia.siete.p90)}).
              {lluvia.p100 !== null && lluvia.p100 >= 0.1 && <b style={{ color: '#E8833A' }}> {Math.round(lluvia.p100 * 100)} % de las corridas da 100 mm o más en la semana.</b>}
            </>) : pronoError
              ? <span style={{ color: '#E8A87C' }}>No se pudo consultar el pronóstico de lluvia. Está en Cuencas → Pronóstico.</span>
              : 'Consultando el pronóstico de lluvia…'}
          </div>
          {lluvia && <div style={{ ...texto, fontSize: 11, color: '#8f8f8f', marginTop: 4 }}>
            Mediana y rango p10–p90 del pronóstico por conjuntos, sobre {lluvia.nodos} {lluvia.nodos === 1 ? 'nodo' : 'nodos'} del modelo.
          </div>}
        </div>

        {/* ── Crecida ── */}
        <div style={seccion}>
          <div style={rotulo}>Crecida del Paraná</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ ...mono, fontSize: 26, color: '#fff', fontWeight: 700 }}>{f2(h)}</span>
            <span style={{ ...texto }}>m en Barranqueras · cota MOP {f2(cotaMop(h))}</span>
          </div>
          <input type="range" className="sv-range" min={2} max={9.5} step={0.05} value={h}
            onChange={e => setAltura(Number(e.target.value))} style={{ width: '100%', margin: '8px 0 10px' }}
            aria-label="Altura del río en Barranqueras, en metros" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {atajos.map(a => (
              <button key={a.t} type="button" title={a.d ? `${f2(a.m)} m · ${a.d}` : `${f2(a.m)} m`}
                onClick={() => setAltura(a.m)} style={chip(Math.abs(h - a.m) < 0.005)}>
                {a.t} · {f2(a.m)}
              </button>
            ))}
          </div>

          <div style={{ ...texto, marginTop: 10 }}>
            {frecuencia ? (<>
              El río llegó a esa altura en <b style={{ color: '#fff' }}>{frecuencia.veces} de {frecuencia.de}</b> años
              {frecuencia.veces > 1 && <> (1 de cada {f1(frecuencia.de / frecuencia.veces)})</>}
              {frecuencia.cada !== null && frecuencia.cada >= 1.5 && <>; el ajuste da 1 cada {frecuencia.cada >= 20 ? Math.round(frecuencia.cada) : f1(frecuencia.cada)}</>}.
            </>) : 'Sin el registro histórico no se puede decir cada cuánto pasa.'}
          </div>

          <div style={{ ...texto, marginTop: 8 }}>
            <b style={{ color: '#29b6f6' }}>Celeste:</b> lo que se moja con el río hasta {esc.zona?.alturaM} m, de{' '}
            {esc.zona?.escenas} imágenes sin nubes desde 1984.
            {esc.referencia && (<>
              <br />
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginTop: 4 }}>
                <input type="checkbox" checked={verReferencia} onChange={e => setVerReferencia(e.target.checked)} />
                <span><b style={{ color: '#ff9800' }}>Naranja:</b> el agua del {esc.referencia.titulo}, con el río en {f2(esc.referencia.alturaM!)} m</span>
              </label>
              <br /><span style={{ color: '#8f8f8f' }}>{esc.referencia.sensor} · {esc.referencia.criterio}.
                {esc.referencia.nota ? ` ${esc.referencia.nota}` : ''}</span>
            </>)}
          </div>

          {esc.sobreObservado && (
            <div style={aviso}><b>No hay ninguna imagen con el río tan alto.</b> Lo más alto que se vio es {f2(esc.referencia?.alturaM ?? 0)} m,
              {' '}{f2(esc.faltaM ?? 0)} m menos. Lo que se dibuja es un piso: con {f2(h)} m habría más agua.</div>
          )}
          {!esc.sobreObservado && esc.sobreZonas && esc.referencia && (esc.faltaM ?? 0) >= 0.3 && (
            <div style={aviso}>La imagen más cercana por debajo es de {f2(esc.referencia.alturaM!)} m, {f2(esc.faltaM!)} m menos que lo pedido. Con {f2(h)} m habría más agua que la dibujada.</div>
          )}
          {esc.referencia?.epoca && (
            <div style={aviso}><b>La imagen es de {esc.referencia.epoca}.</b> Muestra dónde llegó el agua con una ciudad de la mitad del tamaño y sin el anillo de defensas terminado.
              Dentro del recinto no dice qué pasaría hoy; fuera, sí.</div>
          )}
          {h >= TECHO_ZONAS_M && !esc.referencia?.epoca && (
            <div style={{ ...texto, fontSize: 11, color: '#8f8f8f', marginTop: 6 }}>
              Sobre {TECHO_ZONAS_M} m hay una sola imagen limpia en cuarenta años: las crecidas llegan con nubes. La zona celeste es la de 6 a 7 m.
            </div>
          )}
        </div>

        {/* ── Lluvia ── */}
        <div style={seccion}>
          <div style={rotulo}>Lluvia intensa y larga</div>
          <label style={{ ...texto, display: 'flex', alignItems: 'flex-start', gap: 7, cursor: 'pointer', color: '#d0d0d0' }}>
            <input type="checkbox" checked={conLluvia} onChange={e => setConLluvia(e.target.checked)} style={{ marginTop: 3 }} />
            <span>Mostrar lo que dejó enero de 2019: 588 mm en 17 días, con el río en 4 m</span>
          </label>
          {conLluvia && (
            <div style={{ ...texto, marginTop: 8 }}>
              <b style={{ color: '#ab47bc' }}>Violeta oscuro:</b> agua abierta el 17/01/2019, cinco días después de lo peor.<br />
              <b style={{ color: '#ce93d8' }}>Violeta claro:</b> suelo saturado el 22/01/2019.
            </div>
          )}
          <div style={{ ...texto, fontSize: 11, color: '#8f8f8f', marginTop: 8 }}>
            Es el único evento de lluvia con imagen, y la imagen llega tarde: el agua en la calle dura horas y no se ve
            a 10 m. Sirve para ver dónde se junta fuera del casco, no qué barrios se anegan. Para eso está el mapa de
            amenaza por precipitaciones de la APA (Resolución 121/14).
          </div>
        </div>

        {/* ── Las dos ── */}
        <div style={seccion}>
          <div style={rotulo}>Las dos a la vez</div>
          <div style={texto}>
            No se suman: se condicionan. Con el río alto el agua de una tormenta no sale por gravedad y depende del
            bombeo. Con imagen hay un solo caso claro: abril y mayo de 1998.
          </div>
          <label style={{ ...texto, display: 'flex', alignItems: 'flex-start', gap: 7, cursor: 'pointer', color: '#d0d0d0', marginTop: 8 }}>
            <input type="checkbox" checked={conCombinada} onChange={e => setConCombinada(e.target.checked)} style={{ marginTop: 3 }} />
            <span><b style={{ color: '#ef5350' }}>Rojo:</b> el agua del 20/05/1998, río en 7,07 m tras un pico de 8,17 y el abril más lluvioso de la serie</span>
          </label>
          <label style={{ ...texto, display: 'flex', alignItems: 'flex-start', gap: 7, cursor: 'pointer', color: '#d0d0d0', marginTop: 6 }}>
            <input type="checkbox" checked={conDefensa} onChange={e => setConDefensa(e.target.checked)} style={{ marginTop: 3 }} />
            <span><b style={{ color: '#ffee58' }}>Amarillo:</b> si falla una defensa. El 14/08/1982, tres semanas después de la rotura del dique del río Negro, con el Paraná en 5,15 m</span>
          </label>
          {combinado && (
            <div style={aviso}>
              <b>Río sobre el alerta y lluvia a la vez.</b> Lo dibujado son las dos manchas superpuestas, cada una observada por
              separado. La combinación real es peor que la superposición y no hay con qué calcularla: faltan las cotas y la
              capacidad de las estaciones de bombeo.
            </div>
          )}
        </div>

        {/* ── Qué queda adentro ── */}
        <div style={seccion}>
          <div style={rotulo}>Qué queda adentro</div>
          <table style={{ ...mono, fontSize: 12, width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: '#8f8f8f', fontSize: 11 }}>
                <th style={{ textAlign: 'left', fontWeight: 400, padding: '0 6px 4px 0' }}>Capa</th>
                <th style={{ textAlign: 'right', fontWeight: 400, padding: '0 0 4px 8px' }}>km²</th>
                <th style={{ textAlign: 'right', fontWeight: 400, padding: '0 0 4px 8px' }}>urbano</th>
                <th style={{ textAlign: 'right', fontWeight: 400, padding: '0 0 4px 8px' }}>construido</th>
              </tr>
            </thead>
            <tbody>{activas.filter(c => c.grupo !== 'base').map(filaCapa)}</tbody>
          </table>
          <div style={{ ...texto, fontSize: 11, color: '#8f8f8f', marginTop: 6 }}>
            Fuera del agua de siempre. «Urbano» es el recuadro de {Math.round(indice.urbanoKm2)} km² que contiene a Fontana,
            Resistencia, Barranqueras y Vilelas; «construido», lo edificado hoy ahí adentro ({f1(indice.construidoHoyKm2)} km²).
            Cada capa por separado: no se suman.
          </div>
          <label style={{ ...texto, display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', marginTop: 8 }}>
            <input type="checkbox" checked={verUrbano} onChange={e => setVerUrbano(e.target.checked)} />
            <span>Dibujar lo construido hoy (gris)</span>
          </label>

          <div style={{ ...rotulo, marginTop: 14 }}>Rutas y caminos dentro de la mancha</div>
          {cruce.resumen.map(r => (
            <div key={r.clase} style={{ ...texto, marginBottom: 6 }}>
              <span style={{ display: 'inline-block', width: 14, height: 3, background: COLOR_VIA[r.clase].color, marginRight: 7, verticalAlign: 'middle' }} />
              <span style={{ color: '#d0d0d0' }}>{ROTULO_VIA[r.clase]}:</span>{' '}
              <b style={{ color: r.kmDentro >= 0.05 ? '#E57373' : '#fff' }}>{f1(r.kmDentro)} km</b> de {f1(r.km)}
              {r.rutas.length > 0 && (
                <div style={{ color: '#a0a0a0', paddingLeft: 21 }}>
                  {r.rutas.slice(0, 8).map(x => `${x.nombre} ${f1(x.kmDentro)} km`).join(' · ')}
                  {r.rutas.length > 8 && ` · y ${r.rutas.length - 8} más`}
                </div>
              )}
            </div>
          ))}
          <div style={{ ...texto, fontSize: 11, color: '#8f8f8f' }}>
            Que un tramo caiga adentro no quiere decir que se corte: la mancha no ve terraplenes, y una ruta en
            terraplén cruza una zona inundada y sigue transitable. Es la lista de dónde mirar.
            {tramos.length === 0 && ' Los caminos de consorcio todavía están cargando.'}
          </div>

          <div style={{ ...rotulo, marginTop: 14 }}>Obras de arte relevadas</div>
          <div style={texto}>
            {obras === null ? 'No se pudieron leer las obras relevadas.'
              : obrasAca.length === 0 ? 'No hay ninguna obra relevada dentro del recuadro.'
              : (<>
                <b style={{ color: obrasAca.some(o => o.dentro) ? '#E57373' : '#fff' }}>{obrasAca.filter(o => o.dentro).length}</b> de{' '}
                {obrasAca.length} quedan dentro de la mancha.
                {obrasAca.filter(o => o.dentro).slice(0, 6).map(o => (
                  <div key={o.id} style={{ color: '#a0a0a0' }}>{o.tipo}{o.rutaTramo ? ` · ${o.rutaTramo}` : ''}</div>
                ))}
              </>)}
          </div>
          <div style={{ ...texto, fontSize: 11, color: '#8f8f8f', marginTop: 4 }}>
            Son las relevadas con la app, no un inventario.
          </div>
        </div>

        {/* ── Cómo leerlo ── */}
        <div style={seccion}>
          <div style={rotulo}>Cómo leerlo</div>
          <div style={{ ...texto, fontSize: 11, color: '#8f8f8f' }}>
            Todo lo dibujado es agua que se vio desde un satélite, con su fecha. No hay modelo hidráulico ni cotas del
            terreno: no da profundidades ni sirve para un lote. No ve agua debajo de monte ni de nubes, así que cada
            mancha es un piso. La zonificación que vale para un certificado de riesgo hídrico es la de la APA.
            {error && <><br /><span style={{ color: '#E8A87C' }}>{error}</span></>}
          </div>
        </div>
      </div>
    </div>
  )
}
