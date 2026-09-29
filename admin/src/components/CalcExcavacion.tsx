'use client'

/**
 * Excavación — sección tipo, traza por tramos, y recintos de préstamo.
 *
 * ── Dos modos, porque son dos trabajos ────────────────────────────────────────
 *
 * - **Lineal** — cunetas, zanjas, cortes de camino. Se diseña la sección y se
 *   dibuja el eje sobre el mapa; la longitud sale del dibujo. Mismo circuito
 *   que ripio y terraplén.
 * - **Área** — préstamos, pozos, destapes. Se dibuja el recinto y se carga su
 *   profundidad, porque el mapa da la planta y no la cota.
 *
 * El modo se elige explícitamente y cambia la pantalla entera. No es una opción
 * escondida: son dos cómputos distintos —el lineal tiene talud y el de área
 * no— y presentarlos como variantes del mismo haría que alguien cargue una
 * cuneta como si fuera un pozo y obtenga un número plausible y equivocado.
 *
 * ── Dónde se parte la cadena de fórmulas, en el modo lineal ───────────────────
 *
 * En el mismo lugar que en terraplén: **donde el dato deja de tipearse y pasa a
 * medirse.**
 *
 *   ancho de boca → sección       ← sólo depende de la sección tipo
 *   volúmenes → peso              ← depende de la longitud MEDIDA
 *
 * ── Qué es de la obra y qué de cada tramo ─────────────────────────────────────
 *
 * Del tramo: la profundidad y la longitud medida — la profundidad sigue al
 * terreno y al proyecto de rasante. De la obra: ancho de fondo y talud, que los
 * fija la sección tipo, y densidad y esponjamiento, que son del material.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import RipioMapPanel, { type LatLng, type TramoDibujable } from '@/components/RipioMapPanel'
import InlineMapDraw from '@/components/InlineMapDraw'
import { type GuardarObraData } from '@/components/GuardarObraModal'
import {
  panel, panelCol, secLabel, Inp, Res, SectionTitle, Pipeline, SeccionCorte,
} from '@/components/calc/piezas'
import {
  perfilDe, computarTramo, computarObraLineal, computarObraArea, viajes,
  CAPACIDADES_T, SECCION_POR_DEFECTO, PROFUNDIDAD_POR_DEFECTO,
  type SeccionExcavacion, type TramoExcavacion, type RecintoExcavacion,
  type ModoExcavacion,
} from '@/lib/excavacionCalculo'

const COLOR = '#FF7043'
const mono: React.CSSProperties = { fontFamily: 'monospace' }

const fmt = (n: number) => Math.round(n).toLocaleString('es-AR')
const fmtL = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(3)} km` : `${Math.round(m)} m`)
const fmtHa = (ha: number) => `${ha.toFixed(ha >= 10 ? 2 : 4)} ha`

const ANCHO_MIN = 250, ANCHO_MAX = 620
const acotar = (w: number) => Math.min(ANCHO_MAX, Math.max(ANCHO_MIN, Math.round(w)))

type Vista = 'seccion' | 'traza'

interface Props {
  onGuardarObra?: (d: GuardarObraData) => void
  initialData?: Record<string, unknown>
  precio?: number
}

export default function CalcExcavacion({ onGuardarObra, initialData, precio = 0 }: Props) {
  /*
   * El estado inicial de una obra que se vino a editar. Cada campo cae a su
   * valor por omisión por separado: una obra guardada con una versión anterior
   * vuelve completa en vez de con `undefined` dejando inputs rotos.
   */
  const ini = (initialData?.inputs ?? {}) as {
    modo?: ModoExcavacion
    seccion?: Partial<SeccionExcavacion>
    tramos?: TramoExcavacion[]
    recintos?: RecintoExcavacion[]
  }

  const [modo, setModo] = useState<ModoExcavacion>(ini.modo ?? 'lineal')
  const [vista, setVista] = useState<Vista>('seccion')
  const [seccion, setSeccion] = useState<SeccionExcavacion>({ ...SECCION_POR_DEFECTO, ...(ini.seccion ?? {}) })
  const [tramos, setTramos] = useState<TramoExcavacion[]>(ini.tramos ?? [])
  const [recintos, setRecintos] = useState<RecintoExcavacion[]>(ini.recintos ?? [])

  const [selectedId, setSelectedId] = useState<string | null>(ini.tramos?.[0]?.id ?? null)
  const [drawingId, setDrawingId]   = useState<string | null>(null)
  const [editingId, setEditingId]   = useState<string | null>(null)
  const [fitTo, setFitTo]           = useState<{ coords: LatLng[]; token: number } | null>(null)

  // ── Medidas que siguen a la ventana ────────────────────────────────────────
  const CLAVE_ANCHO = 'excavacion.anchoColumna'
  const [anchoCol, setAnchoCol] = useState(300)
  const [altoVentana, setAltoVentana] = useState(900)
  const arrastreRef = useRef<{ x0: number; w0: number } | null>(null)

  /*
   * El ancho guardado y el alto de ventana se leen en *callback refs* y no en
   * efectos: el nodo llega ya montado, así que no hay desajuste de hidratación
   * que evitar ni `setState` en efecto que sumar a la barrera de lint.
   */
  const montarRaiz = useCallback((nodo: HTMLDivElement | null) => {
    if (!nodo) return
    const leer = () => setAltoVentana(window.innerHeight)
    leer()
    window.addEventListener('resize', leer)
    return () => window.removeEventListener('resize', leer)
  }, [])

  const montarColumna = useCallback((nodo: HTMLDivElement | null) => {
    if (!nodo) return
    try {
      const v = parseInt(localStorage.getItem(CLAVE_ANCHO) ?? '', 10)
      if (Number.isFinite(v)) setAnchoCol(acotar(v))
    } catch { /* si localStorage falla, el valor por defecto sirve igual */ }
  }, [])

  const alBajarDivisor = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    arrastreRef.current = { x0: e.clientX, w0: anchoCol }
  }
  const alMoverDivisor = (e: React.PointerEvent<HTMLDivElement>) => {
    const a = arrastreRef.current
    if (a) setAnchoCol(acotar(a.w0 + (e.clientX - a.x0)))
  }
  const alSoltarDivisor = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId)
    arrastreRef.current = null
    try { localStorage.setItem(CLAVE_ANCHO, String(anchoCol)) } catch { /* no es crítico */ }
  }

  // ── Cómputo ────────────────────────────────────────────────────────────────
  const obraL = useMemo(() => computarObraLineal(seccion, tramos), [seccion, tramos])
  const obraA = useMemo(() => computarObraArea(seccion, recintos), [seccion, recintos])
  const obra = modo === 'lineal' ? obraL : obraA

  const sel = tramos.find(t => t.id === selectedId) ?? null
  const Hdibujo = sel?.H ?? PROFUNDIDAD_POR_DEFECTO
  const perfil = perfilDe(seccion, Hdibujo)

  const altoDibujo = Math.max(190, Math.min(360, Math.round(altoVentana * 0.42)))
  const altoMiniatura = Math.max(104, Math.min(
    Math.round((anchoCol - 24) * 0.60), Math.round(altoVentana * 0.20),
  ))

  const setSec = <K extends keyof SeccionExcavacion>(k: K, v: SeccionExcavacion[K]) =>
    setSeccion(s => ({ ...s, [k]: v }))

  const nuevoId = () => `e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  // ── Tramos (modo lineal) ───────────────────────────────────────────────────
  const patch = useCallback((id: string, cambio: Partial<TramoExcavacion>) => {
    setTramos(prev => prev.map(t => (t.id === id ? { ...t, ...cambio } : t)))
  }, [])

  const agregarTramo = useCallback(() => {
    const id = nuevoId()
    setTramos(prev => {
      // Hereda la profundidad del último: en una traza continua el tramo
      // siguiente se parece más al anterior que al valor de fábrica.
      const ultimo = prev[prev.length - 1]
      return [...prev, {
        id, nombre: `Tramo ${prev.length + 1}`,
        H: ultimo?.H ?? PROFUNDIDAD_POR_DEFECTO,
        l_m: 0, coords: null, orden: prev.length, color: null,
      }]
    })
    setSelectedId(id)
    setEditingId(null)
    setDrawingId(id)      // entra directo a dibujar: es lo que se va a hacer
    setVista('traza')
  }, [])

  const eliminarTramo = useCallback((id: string) => {
    setTramos(prev => prev.filter(t => t.id !== id))
    setSelectedId(prev => (prev === id ? null : prev))
    setDrawingId(prev => (prev === id ? null : prev))
    setEditingId(prev => (prev === id ? null : prev))
  }, [])

  const alDibujar = useCallback((id: string, lengthM: number, coords: LatLng[]) => {
    patch(id, { l_m: Math.round(lengthM), coords })
  }, [patch])

  /** Partir un tramo en dos, heredando la profundidad — el caso real de uso */
  const alPartir = useCallback((
    id: string,
    a: { lengthM: number; coords: LatLng[] },
    b: { lengthM: number; coords: LatLng[] },
  ) => {
    setTramos(prev => {
      const i = prev.findIndex(t => t.id === id)
      if (i < 0) return prev
      const origen = prev[i]
      const resto = prev.slice()
      resto[i] = { ...origen, l_m: Math.round(a.lengthM), coords: a.coords }
      resto.splice(i + 1, 0, {
        ...origen, id: nuevoId(), nombre: `${origen.nombre} (2)`,
        l_m: Math.round(b.lengthM), coords: b.coords,
      })
      return resto.map((t, k) => ({ ...t, orden: k }))
    })
  }, [])

  /** Lo que el mapa necesita: la banda es el ancho de BOCA de cada tramo */
  const paraMapa: TramoDibujable[] = useMemo(
    () => tramos.map(t => ({
      id: t.id, nombre: t.nombre,
      an: computarTramo(seccion, t).anchoBanda,
      l_m: t.l_m, coords: t.coords, orden: t.orden, color: t.color,
    })),
    [tramos, seccion],
  )

  // ── Recintos (modo área) ───────────────────────────────────────────────────
  const patchRec = useCallback((id: string, cambio: Partial<RecintoExcavacion>) => {
    setRecintos(prev => prev.map(r => (r.id === id ? { ...r, ...cambio } : r)))
  }, [])

  const alConfirmarRecinto = useCallback((
    id: string, _side: string, _monte: string, area_ha: number, pts: [number, number][],
  ) => {
    setRecintos(prev => [...prev, {
      id, nombre: `Préstamo ${prev.length + 1}`,
      H: prev[prev.length - 1]?.H ?? PROFUNDIDAD_POR_DEFECTO,
      area_ha, coords: pts, orden: prev.length, color: null,
    }])
  }, [])

  const alActualizarRecinto = useCallback((id: string, area_ha: number, pts: [number, number][]) => {
    patchRec(id, { area_ha, coords: pts })
  }, [patchRec])

  const eliminarRecinto = useCallback((id: string) => {
    setRecintos(prev => prev.filter(r => r.id !== id))
  }, [])

  // ── Guardar ────────────────────────────────────────────────────────────────
  const guardar = () => {
    if (!onGuardarObra) return
    onGuardarObra({
      tipo: 'excavacion',
      cantidad: obra.W,
      unidad: 't',
      presupuesto_total: obra.W * precio,
      /*
       * El reparto de aportes va en cero y no en un 50/50 inventado: el modal
       * nunca pide el dato, así que cualquier número acá tendría apariencia de
       * dato sin que nadie lo haya elegido. Mismo criterio que en terraplén.
       */
      aporte_dvp: 0,
      aporte_ccc: 0,
      precio_unitario: precio,
      coordsLinea: modo === 'lineal'
        ? tramos.find(t => t.coords?.length)?.coords?.map(([lat, lng]) => ({ lat, lng }))
        : recintos.find(r => r.coords?.length)?.coords?.map(([lat, lng]) => ({ lat, lng })),
      datos_calculadora: {
        calculadora: 'excavacion',
        // El modo se guarda: sin él, una obra reabierta no sabría con qué
        // cómputo se hizo, y los dos dan números distintos para la misma traza.
        inputs: { modo, seccion, tramos, recintos },
        computo: {
          modo,
          L_total: obraL.L_total, ha_total: obraA.ha_total,
          H_media: obra.H_media,
          Vcorte: obra.Vcorte, Vesp: obra.Vesp, W: obra.W,
        },
        viajes: Object.fromEntries(CAPACIDADES_T.map(c => [c, viajes(obra.W, c)])),
      },
    })
  }

  const tot = modo === 'lineal'
    ? `${tramos.length} tramo${tramos.length === 1 ? '' : 's'} · ${fmtL(obraL.L_total)}`
    : `${recintos.length} recinto${recintos.length === 1 ? '' : 's'} · ${fmtHa(obraA.ha_total)}`

  return (
    <div ref={montarRaiz} style={{ display: 'flex', flexDirection: 'column', height: '100%',
      minHeight: 480, gap: 8, ...mono }}>

      {/* ── Modo y total de obra ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0,
        borderBottom: '1px solid #1a1a1a', paddingBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: '#5a5a5a', textTransform: 'uppercase', letterSpacing: 0.8 }}>
          Modo
        </span>
        {([['lineal', 'Lineal — cuneta, zanja, corte'], ['area', 'Área — préstamo, pozo']] as const)
          .map(([id, txt]) => (
            <button key={id} onClick={() => setModo(id)} style={{
              ...mono, fontSize: 12, padding: '3px 9px', cursor: 'pointer',
              background: modo === id ? `${COLOR}22` : 'transparent',
              border: `1px solid ${modo === id ? COLOR : '#2a2a2a'}`,
              color: modo === id ? COLOR : '#6a6a6a',
            }}>{txt}</button>
          ))}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: '#5a5a5a' }}>
          {tot}{' · '}
          <b style={{ color: obra.W > 0 ? '#F5C300' : '#444' }}>{fmt(obra.W)} t</b>
        </span>
      </div>

      {modo === 'lineal' ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
            {([['seccion', 'Sección tipo'], ['traza', 'Traza y tramos']] as const).map(([id, txt]) => (
              <button key={id} onClick={() => setVista(id)} style={{
                ...mono, fontSize: 13, padding: '3px 0', cursor: 'pointer',
                background: 'transparent', border: 'none',
                color: vista === id ? '#e0e0e0' : '#5a5a5a',
                borderBottom: `2px solid ${vista === id ? COLOR : 'transparent'}`,
              }}>{txt}</button>
            ))}
          </div>

          {vista === 'seccion' ? (
            // ── Sección tipo ───────────────────────────────────────────────
            <div style={{ display: 'grid', flex: 1, minHeight: 0, gap: 10,
              gridTemplateColumns: 'minmax(178px, 210px) minmax(0, 1fr) minmax(136px, 158px)' }}>
              <div style={panel}>
                <SectionTitle>Geometría</SectionTitle>
                {/*
                  No hay campo de longitud: en este flujo sale del dibujo.
                  Tenerlo invitaría a tipear un número que después se pisa.
                */}
                <Inp label="Ancho de fondo" unit="m" value={seccion.Bf} onChange={v => setSec('Bf', v)} />
                <Inp label="Talud H:V" value={seccion.m} onChange={v => setSec('m', v)} step={0.5} min={0} />
                <div style={secLabel}>Material extraído</div>
                <Inp label="Densidad natural" unit="t/m³" value={seccion.rho} onChange={v => setSec('rho', v)} step={0.05} min={0} />
                <Inp label="Esponjamiento" unit="%" value={seccion.Fe} onChange={v => setSec('Fe', v)} step={1} />
                <div style={{ marginTop: 12, padding: 8, background: '#0a0a0a', borderRadius: 4,
                  fontSize: 12, color: '#333', ...mono, lineHeight: 1.6 }}>
                  Ancho boca = {perfil.Bb.toFixed(2)} m<br />
                  A sección  = {perfil.A.toFixed(3)} m²
                </div>
              </div>

              <div style={{ ...panel, display: 'flex', flexDirection: 'column' }}>
                <SectionTitle>
                  Sección tipo — Excavación
                  {sel
                    ? <span style={{ color: '#5a5a5a' }}>{`  ·  profundidad de ${sel.nombre} (${sel.H.toFixed(2)} m)`}</span>
                    : <span style={{ color: '#E8833A' }}>  ·  profundidad de referencia: todavía no hay tramos</span>}
                </SectionTitle>
                <SeccionCorte H={Hdibujo} Bf={seccion.Bf} m={seccion.m}
                  A={perfil.A} Bb={perfil.Bb} color={COLOR} alto={altoDibujo} />
                <Pipeline color={COLOR} titulo="Procedimiento — de la sección tipo" steps={[
                  { label: 'Ancho boca', formula: 'Bb = Bf + 2·H·m',
                    sub: `${seccion.Bf} + 2·${Hdibujo}·${seccion.m}`, result: `${perfil.Bb.toFixed(3)} m` },
                  { label: 'Sección', formula: 'A = (Bf+Bb)/2 · H',
                    sub: `(${seccion.Bf}+${perfil.Bb.toFixed(2)})/2 · ${Hdibujo}`,
                    result: `${perfil.A.toFixed(3)} m²`, accent: true },
                ]} />
                <div style={{ fontSize: 12, color: '#3a3a3a', marginTop: 10, lineHeight: 1.6 }}>
                  Los volúmenes y el peso dependen de la longitud, que sale del dibujo.
                  Están en <b style={{ color: '#5a5a5a' }}>Traza y tramos</b>.
                </div>
              </div>

              <div style={panel}>
                <SectionTitle>Cómputo de obra</SectionTitle>
                <Res label="Longitud total"   value={fmtL(obraL.L_total)} unit="" />
                <Res label="Volumen de corte" value={fmt(obraL.Vcorte)}   unit="m³" />
                <Res label="Vol. esponjado"   value={fmt(obraL.Vesp)}     unit="m³" />
                <Res label="Peso a transportar" value={fmt(obraL.W)}      unit="t" accent />
                <div style={{ fontSize: 13, color: '#333', ...mono, lineHeight: 1.8 }}>
                  {CAPACIDADES_T.map(c => (
                    <span key={c}>Camiones {c}t: ~{fmt(viajes(obraL.W, c))}<br /></span>
                  ))}
                </div>
                {tramos.length === 0 && (
                  <div style={{ fontSize: 12, color: '#E8833A', marginTop: 8, lineHeight: 1.5 }}>
                    Sin tramos dibujados no hay longitud, así que el cómputo da cero.
                  </div>
                )}
              </div>
            </div>
          ) : (
            // ── Traza y tramos ─────────────────────────────────────────────
            <div style={{ display: 'grid', gridTemplateColumns: `${anchoCol}px 10px minmax(0, 1fr)`,
              gap: 0, flex: 1, minHeight: 360 }}>

              <div ref={montarColumna}
                style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0,
                  minWidth: 0, overflowY: 'auto', paddingRight: 2 }}>

                <div style={panelCol}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: '#6a6a6a', textTransform: 'uppercase',
                      letterSpacing: 0.8, flex: 1 }}>Tramos</span>
                    <button onClick={agregarTramo} style={{
                      ...mono, fontSize: 12, padding: '3px 10px', cursor: 'pointer',
                      background: `${COLOR}22`, border: `1px solid ${COLOR}`, color: COLOR,
                    }}>+ Agregar</button>
                  </div>

                  {tramos.length === 0 && (
                    <div style={{ fontSize: 12, color: '#5a5a5a', lineHeight: 1.6 }}>
                      Agregá un tramo y dibujá su eje sobre el mapa.
                      La longitud sale del dibujo.
                    </div>
                  )}

                  {tramos.map(t => {
                    const c = computarTramo(seccion, t)
                    const activo = t.id === selectedId
                    const dibujando = t.id === drawingId
                    const editando = t.id === editingId
                    return (
                      <div key={t.id} onClick={() => setSelectedId(t.id)} style={{
                        borderLeft: `3px solid ${activo ? COLOR : 'transparent'}`,
                        background: activo ? 'rgba(255,112,67,0.08)' : 'transparent',
                        padding: '7px 8px', marginBottom: 4, cursor: 'pointer',
                        borderBottom: '1px solid #151515',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <input value={t.nombre}
                            onChange={e => patch(t.id, { nombre: e.target.value })}
                            onClick={e => e.stopPropagation()}
                            style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none',
                              color: '#ccc', ...mono, fontSize: 12, outline: 'none', padding: 0 }} />
                          <span style={{ fontSize: 11, color: t.l_m > 0 ? '#9a9a9a' : '#E8833A' }}>
                            {t.l_m > 0 ? fmtL(t.l_m) : 'sin dibujar'}
                          </span>
                        </div>

                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}
                          onClick={e => e.stopPropagation()}>
                          <span style={{ color: '#7a7a7a', flex: 1 }}>Profundidad media</span>
                          <input type="number" value={t.H} step={0.1} min={0}
                            onChange={e => patch(t.id, { H: parseFloat(e.target.value) || 0 })}
                            style={{ width: 62, background: '#080808', border: '1px solid #222',
                              color: '#e0e0e0', ...mono, fontSize: 11, padding: '2px 5px', outline: 'none' }} />
                          <span style={{ color: '#4a4a4a', width: 14 }}>m</span>
                        </label>

                        <div style={{ fontSize: 11, color: '#5a5a5a', margin: '3px 0 5px' }}>
                          boca {c.anchoBanda.toFixed(2)} m · {fmt(c.W)} t
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}
                          onClick={e => e.stopPropagation()}>
                          <button onClick={() => { setSelectedId(t.id); setEditingId(null); setDrawingId(p => p === t.id ? null : t.id) }}
                            style={btn(dibujando ? COLOR : '#3a3a3a', dibujando)}>
                            {dibujando ? 'dibujando' : t.coords?.length ? 'redibujar' : 'dibujar'}
                          </button>
                          <button disabled={!t.coords?.length}
                            onClick={() => { setSelectedId(t.id); setDrawingId(null); setEditingId(p => p === t.id ? null : t.id) }}
                            style={btn(editando ? '#85B7EB' : '#3a3a3a', editando, !t.coords?.length)}>
                            {editando ? 'editando' : 'editar'}
                          </button>
                          <button disabled={!t.coords?.length}
                            onClick={() => t.coords?.length && setFitTo({ coords: t.coords, token: Date.now() })}
                            style={btn('#3a3a3a', false, !t.coords?.length)}>ver</button>
                          <button onClick={() => eliminarTramo(t.id)} style={btn('#7a3a3a', false)}>quitar</button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* La miniatura: el perfil del tramo que se está tocando */}
                {sel && (
                  <div style={panelCol}>
                    <div style={{ fontSize: 11, color: '#6a6a6a', textTransform: 'uppercase',
                      letterSpacing: 0.8, marginBottom: 4 }}>Sección del tramo</div>
                    <SeccionCorte H={sel.H} Bf={seccion.Bf} m={seccion.m}
                      A={computarTramo(seccion, sel).A} Bb={computarTramo(seccion, sel).Bb}
                      color={COLOR} alto={altoMiniatura} />
                    <div style={{ fontSize: 11, color: '#4a4a4a', marginTop: 4, lineHeight: 1.45 }}>
                      Con la profundidad de <span style={{ color: '#8a8a8a' }}>{sel.nombre}</span>.
                      Al cambiarla se mueven el perfil y la boca sobre el mapa.
                    </div>
                  </div>
                )}

                <div style={panelCol}>
                  <div style={{ fontSize: 11, color: '#6a6a6a', textTransform: 'uppercase',
                    letterSpacing: 0.8, marginBottom: 6 }}>Cómputo de la obra</div>
                  <Linea label="Longitud total"      value={fmtL(obraL.L_total)} />
                  <Linea label="Profundidad media"   value={`${obraL.H_media.toFixed(2)} m`} />
                  <div style={{ borderTop: '1px solid #1b1b1b', margin: '6px 0' }} />
                  <Linea label="Volumen de corte"    value={`${fmt(obraL.Vcorte)} m³`} />
                  <Linea label="Vol. esponjado"      value={`${fmt(obraL.Vesp)} m³`} />
                  <Linea label="Peso a transportar"  value={`${fmt(obraL.W)} t`} acento />

                  <div style={{ fontSize: 12, color: '#4a4a4a', marginTop: 6, lineHeight: 1.7 }}>
                    {CAPACIDADES_T.map(c => (
                      <span key={c}>Camiones {c}t: ~{fmt(viajes(obraL.W, c))}<br /></span>
                    ))}
                  </div>

                  {obraL.sinDibujar > 0 && (
                    <div style={{ fontSize: 11, color: '#E8833A', marginTop: 6, lineHeight: 1.5 }}>
                      {obraL.sinDibujar} tramo(s) sin dibujar: no aportan al cómputo.
                    </div>
                  )}
                  {tramos.length > 1 && (
                    <div style={{ fontSize: 11, color: '#4a4a4a', marginTop: 6, lineHeight: 1.5 }}>
                      La profundidad media se pesa por longitud y es informativa: el
                      volumen se suma tramo por tramo.
                    </div>
                  )}

                  <Guardar obra={obraL.W} precio={precio} onGuardar={onGuardarObra && guardar} />
                </div>
              </div>

              <div
                onPointerDown={alBajarDivisor}
                onPointerMove={alMoverDivisor}
                onPointerUp={alSoltarDivisor}
                title="Arrastrar para ensanchar la columna"
                style={{ cursor: 'col-resize', touchAction: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 2, height: 46, background: '#2a2a2a', borderRadius: 2 }} />
              </div>

              <div style={{ ...panel, padding: 0, minHeight: 0, overflow: 'hidden' }}>
                <RipioMapPanel
                  ripios={paraMapa}
                  selectedId={selectedId}
                  drawingId={drawingId}
                  editingId={editingId}
                  color={COLOR}
                  onLineDraw={alDibujar}
                  onDrawEnd={() => setDrawingId(null)}
                  onLineEdit={alDibujar}
                  onLineSplit={alPartir}
                  onEditEnd={() => setEditingId(null)}
                  onSelectRipio={setSelectedId}
                  onDeleteRipio={eliminarTramo}
                  fitTo={fitTo}
                />
              </div>
            </div>
          )}
        </>
      ) : (
        // ── Modo área ────────────────────────────────────────────────────────
        <div style={{ display: 'grid', gridTemplateColumns: `${anchoCol}px 10px minmax(0, 1fr)`,
          gap: 0, flex: 1, minHeight: 360 }}>

          <div ref={montarColumna}
            style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0,
              minWidth: 0, overflowY: 'auto', paddingRight: 2 }}>

            <div style={panelCol}>
              <div style={{ fontSize: 11, color: '#6a6a6a', textTransform: 'uppercase',
                letterSpacing: 0.8, marginBottom: 6 }}>Material extraído</div>
              <Inp label="Densidad natural" unit="t/m³" value={seccion.rho} onChange={v => setSec('rho', v)} step={0.05} min={0} />
              <Inp label="Esponjamiento" unit="%" value={seccion.Fe} onChange={v => setSec('Fe', v)} step={1} />
              {/*
                Ni ancho de fondo ni talud: en este modo el polígono dibujado ya
                es lo que se excava. Dejarlos a la vista sugeriría que influyen
                en el número, y no lo hacen.
              */}
            </div>

            <div style={panelCol}>
              <div style={{ fontSize: 11, color: '#6a6a6a', textTransform: 'uppercase',
                letterSpacing: 0.8, marginBottom: 6 }}>Recintos</div>

              {recintos.length === 0 && (
                <div style={{ fontSize: 12, color: '#5a5a5a', lineHeight: 1.6 }}>
                  Dibujá el recinto sobre el mapa y después cargale su profundidad:
                  la imagen da la planta, no la cota.
                </div>
              )}

              {recintos.map(r => (
                <div key={r.id} style={{ padding: '7px 8px', marginBottom: 4,
                  borderBottom: '1px solid #151515' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <input value={r.nombre}
                      onChange={e => patchRec(r.id, { nombre: e.target.value })}
                      style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none',
                        color: '#ccc', ...mono, fontSize: 12, outline: 'none', padding: 0 }} />
                    <span style={{ fontSize: 11, color: r.area_ha > 0 ? '#9a9a9a' : '#E8833A' }}>
                      {r.area_ha > 0 ? fmtHa(r.area_ha) : 'sin dibujar'}
                    </span>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                    <span style={{ color: '#7a7a7a', flex: 1 }}>Profundidad media</span>
                    <input type="number" value={r.H} step={0.1} min={0}
                      onChange={e => patchRec(r.id, { H: parseFloat(e.target.value) || 0 })}
                      style={{ width: 62, background: '#080808', border: '1px solid #222',
                        color: '#e0e0e0', ...mono, fontSize: 11, padding: '2px 5px', outline: 'none' }} />
                    <span style={{ color: '#4a4a4a', width: 14 }}>m</span>
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: '#5a5a5a', flex: 1 }}>
                      {fmt(r.area_ha * 10_000 * r.H)} m³ · {fmt(r.area_ha * 10_000 * r.H * seccion.rho)} t
                    </span>
                    <button onClick={() => eliminarRecinto(r.id)} style={btn('#7a3a3a', false)}>quitar</button>
                  </div>
                </div>
              ))}
            </div>

            <div style={panelCol}>
              <div style={{ fontSize: 11, color: '#6a6a6a', textTransform: 'uppercase',
                letterSpacing: 0.8, marginBottom: 6 }}>Cómputo de la obra</div>
              <Linea label="Superficie total"    value={fmtHa(obraA.ha_total)} />
              <Linea label="Profundidad media"   value={`${obraA.H_media.toFixed(2)} m`} />
              <div style={{ borderTop: '1px solid #1b1b1b', margin: '6px 0' }} />
              <Linea label="Volumen de corte"    value={`${fmt(obraA.Vcorte)} m³`} />
              <Linea label="Vol. esponjado"      value={`${fmt(obraA.Vesp)} m³`} />
              <Linea label="Peso a transportar"  value={`${fmt(obraA.W)} t`} acento />

              <div style={{ fontSize: 12, color: '#4a4a4a', marginTop: 6, lineHeight: 1.7 }}>
                {CAPACIDADES_T.map(c => (
                  <span key={c}>Camiones {c}t: ~{fmt(viajes(obraA.W, c))}<br /></span>
                ))}
              </div>

              <div style={{ fontSize: 11, color: '#4a4a4a', marginTop: 6, lineHeight: 1.5 }}>
                El recinto se computa como prisma recto: superficie por profundidad,
                sin talud. Sobreestima frente a un pozo con taludes reales.
              </div>

              <Guardar obra={obraA.W} precio={precio} onGuardar={onGuardarObra && guardar} />
            </div>
          </div>

          <div
            onPointerDown={alBajarDivisor}
            onPointerMove={alMoverDivisor}
            onPointerUp={alSoltarDivisor}
            title="Arrastrar para ensanchar la columna"
            style={{ cursor: 'col-resize', touchAction: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 2, height: 46, background: '#2a2a2a', borderRadius: 2 }} />
          </div>

          <div style={{ ...panel, padding: 0, minHeight: 0, overflow: 'hidden' }}>
            {/*
              Se reusa el panel de polígonos de desbosque con `hideMonte`: dibuja,
              mide la superficie y deja editar vértices, que es todo lo que hace
              falta acá. Escribir un quinto mapa para repetir eso sería sumar a la
              duplicación que ya es el problema de esta parte del repo.
            */}
            <InlineMapDraw
              color={COLOR}
              hideMonte
              onConfirm={alConfirmarRecinto}
              onUpdate={alActualizarRecinto}
              onDelete={eliminarRecinto}
            />
          </div>
        </div>
      )}
    </div>
  )
}

const btn = (color: string, activo: boolean, deshabilitado = false): React.CSSProperties => ({
  ...mono, fontSize: 11, padding: '3px 2px', textAlign: 'center',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  cursor: deshabilitado ? 'default' : 'pointer',
  background: activo ? `${color}22` : 'transparent',
  border: `1px solid ${deshabilitado ? '#222' : color}`,
  color: deshabilitado ? '#333' : activo ? color : '#8a8a8a',
})

function Linea({ label, value, acento }: { label: string; value: string; acento?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      fontSize: 12, padding: '2px 0' }}>
      <span style={{ color: '#7a7a7a' }}>{label}</span>
      <b style={{ color: acento ? '#F5C300' : '#ccc', fontWeight: acento ? 700 : 400 }}>{value}</b>
    </div>
  )
}

function Guardar({ obra, precio, onGuardar }: {
  obra: number; precio: number; onGuardar?: () => void
}) {
  if (obra <= 0 || !onGuardar) return null
  return (
    <>
      <button onClick={onGuardar} style={{
        marginTop: 10, width: '100%', padding: '8px 10px', fontSize: 13,
        ...mono, fontWeight: 700, letterSpacing: 0.6, cursor: 'pointer',
        border: '1px solid #F5C300', background: '#F5C30022', color: '#F5C300',
      }}>Guardar obra</button>
      {precio <= 0 && (
        <div style={{ fontSize: 11, color: '#E8833A', marginTop: 5, lineHeight: 1.45 }}>
          Sin precio unitario se guarda con presupuesto cero.
        </div>
      )}
    </>
  )
}
