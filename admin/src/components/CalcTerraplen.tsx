'use client'

/**
 * Terraplén — sección tipo y traza por tramos.
 *
 * ── El flujo, en dos actos ────────────────────────────────────────────────────
 *
 * **Se diseña la sección, después se dibuja la traza.** Son dos cosas distintas
 * y por eso son dos pestañas:
 *
 * - **Sección tipo** — ancho de corona, talud y material. Acto de diseño: el
 *   dibujo grande y la cadena de fórmulas.
 * - **Traza y tramos** — se dibuja el eje sobre el mapa y **la longitud sale del
 *   dibujo, no se tipea**. Mismo circuito que ripio.
 *
 * ── Dónde se parte la cadena de fórmulas ──────────────────────────────────────
 *
 * El corte no es arbitrario: **la cadena se parte exactamente donde el dato deja
 * de tipearse y pasa a medirse.**
 *
 *   ancho de base → sección        ← sólo depende de la sección tipo
 *   volúmenes → peso               ← depende de la longitud MEDIDA
 *
 * Por eso el primer par vive en la pestaña Sección y el resto en Traza, por
 * tramo y con el total de la obra.
 *
 * ── Por qué la sección también aparece en la pestaña del mapa ─────────────────
 *
 * El momento en que más se necesita ver el perfil **no es al diseñarlo** sino al
 * ajustar la altura de un tramo, porque ahí cambian tres cosas a la vez: el
 * perfil, el área y la huella sobre el mapa. Con las dos cosas en pestañas
 * separadas habría que ir y volver para ver el efecto de tocar un número. De ahí
 * la miniatura al lado de la lista.
 *
 * Y **la miniatura siempre muestra una altura real** — la del tramo
 * seleccionado, con su nombre al pie. Un perfil genérico tendría que inventar
 * una altura, y sería lo único de la pantalla que no corresponde a nada.
 *
 * ── Qué es de la obra y qué de cada tramo ─────────────────────────────────────
 *
 * Del tramo: la altura media y la longitud medida — la altura sigue al terreno.
 * De la obra: ancho de corona y talud, que los fija la norma del camino, y
 * densidad, esponjamiento y compactación, que son del material y del pliego.
 *
 * ── Y el cómputo se suma tramo por tramo ──────────────────────────────────────
 *
 * Nunca se computa con la altura media. El volumen crece con el cuadrado de la
 * altura por el ensanche del talud, así que promediar primero subestima —
 * casi 10 % en el caso de prueba. Lo afirma `verificar-terraplen.ts`.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import RipioMapPanel, { type LatLng, type TramoDibujable } from '@/components/RipioMapPanel'
import { type GuardarObraData } from '@/components/GuardarObraModal'
import {
  panel, secLabel, Inp, Res, SectionTitle, Pipeline, SeccionTerraplen,
} from '@/components/calc/piezas'
import {
  computarObra, computarTramo, computarTerraplen, viajes, CAPACIDADES_T,
  SECCION_POR_DEFECTO, ENTRADA_POR_DEFECTO,
  type SeccionTipo, type TramoTerraplen,
} from '@/lib/terraplenCalculo'

const COLOR = '#8D6E63'

/**
 * Los límites del ancho de la columna.
 *
 * El mínimo no es estético: por debajo de 250 px los cuatro botones del tramo
 * no entran y el perfil deja de leerse. El máximo deja siempre mapa visible —
 * una columna que se come la pantalla convierte la pestaña de traza en otra
 * cosa.
 */
const ANCHO_MIN = 250, ANCHO_MAX = 620
const acotar = (w: number) => Math.min(ANCHO_MAX, Math.max(ANCHO_MIN, Math.round(w)))

const mono: React.CSSProperties = { fontFamily: 'monospace' }

const fmt = (n: number) => Math.round(n).toLocaleString('es-AR')
const fmtL = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(3)} km` : `${Math.round(m)} m`)

type Vista = 'seccion' | 'traza'

interface Props {
  onGuardarObra?: (d: GuardarObraData) => void
  initialData?: Record<string, unknown>
  precio?: number
}

export default function CalcTerraplen({ onGuardarObra, initialData, precio = 0 }: Props) {
  /*
   * Estado inicial de una obra que se vino a editar. Cada campo cae a su valor
   * por omisión por separado: una obra guardada con una versión anterior, a la
   * que le falte alguno, vuelve completa en vez de con `undefined` dejando
   * inputs rotos.
   */
  const ini = (initialData?.inputs ?? {}) as {
    seccion?: Partial<SeccionTipo>; tramos?: TramoTerraplen[]
  }

  const [vista, setVista] = useState<Vista>('seccion')
  const [seccion, setSeccion] = useState<SeccionTipo>({ ...SECCION_POR_DEFECTO, ...(ini.seccion ?? {}) })
  const [tramos, setTramos] = useState<TramoTerraplen[]>(
    Array.isArray(ini.tramos) && ini.tramos.length > 0 ? ini.tramos : [],
  )

  /*
   * El ancho de la columna de tramos, arrastrable.
   *
   * No es un capricho de layout: en esa columna conviven la lista de tramos, el
   * perfil de la sección y el cómputo. Cuánto espacio merece cada cosa depende
   * de qué se esté haciendo — al ajustar alturas se quiere el perfil grande, al
   * trazar se quiere el mapa grande — y eso cambia de minuto a minuto, así que
   * ningún ancho fijo es el correcto.
   *
   * Se guarda en localStorage, pero **se lee en el callback ref y no en un
   * efecto**: el nodo llega ya montado, así que no hay desajuste de hidratación
   * que evitar ni `setState` dentro de un efecto que sumar a la barrera de lint.
   */
  const CLAVE_ANCHO = 'terraplen.anchoColumna'
  const [anchoCol, setAnchoCol] = useState(300)
  const arrastreRef = useRef<{ x0: number; w0: number } | null>(null)

  const montarColumna = useCallback((nodo: HTMLDivElement | null) => {
    if (!nodo) return
    try {
      const v = parseInt(localStorage.getItem(CLAVE_ANCHO) ?? '', 10)
      if (Number.isFinite(v)) setAnchoCol(acotar(v))
    } catch { /* localStorage puede fallar; el valor por defecto sirve igual */ }
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

  const [selectedId, setSelectedId] = useState<string | null>(ini.tramos?.[0]?.id ?? null)
  const [drawingId, setDrawingId]   = useState<string | null>(null)
  const [editingId, setEditingId]   = useState<string | null>(null)
  const [fitTo, setFitTo]           = useState<{ coords: LatLng[]; token: number } | null>(null)

  const obra = useMemo(() => computarObra(seccion, tramos), [seccion, tramos])
  const sel  = tramos.find(t => t.id === selectedId) ?? null

  /*
   * La altura con la que se dibuja el perfil.
   *
   * Es la del tramo seleccionado. Sin tramos todavía, la de fábrica — y la
   * pantalla lo dice, para que nadie lea ese dibujo como si describiera algo.
   */
  const Hdibujo = sel?.H ?? ENTRADA_POR_DEFECTO.H
  const perfil = computarTerraplen({ ...seccion, H: Hdibujo, L: 0 })

  const setSec = <K extends keyof SeccionTipo>(k: K, v: SeccionTipo[K]) =>
    setSeccion(s => ({ ...s, [k]: v }))

  const patch = useCallback((id: string, cambio: Partial<TramoTerraplen>) => {
    setTramos(prev => prev.map(t => (t.id === id ? { ...t, ...cambio } : t)))
  }, [])

  const nuevoId = () => `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  const agregar = useCallback(() => {
    const id = nuevoId()
    setTramos(prev => {
      // Hereda la altura del último: en una traza continua el tramo siguiente
      // se parece más al anterior que al valor de fábrica.
      const ultimo = prev[prev.length - 1]
      return [...prev, {
        id, nombre: `Tramo ${prev.length + 1}`,
        H: ultimo?.H ?? ENTRADA_POR_DEFECTO.H,
        l_m: 0, coords: null, orden: prev.length, color: null,
      }]
    })
    setSelectedId(id)
    setEditingId(null)
    setDrawingId(id)      // entra directo a dibujar: es lo que se va a hacer
    setVista('traza')
  }, [])

  const eliminar = useCallback((id: string) => {
    setTramos(prev => prev.filter(t => t.id !== id))
    setSelectedId(prev => (prev === id ? null : prev))
    setDrawingId(prev => (prev === id ? null : prev))
    setEditingId(prev => (prev === id ? null : prev))
  }, [])

  /** Dibujo y edición de vértices guardan igual: el cómputo se rehace solo */
  const alDibujar = useCallback((id: string, lengthM: number, coords: LatLng[]) => {
    patch(id, { l_m: Math.round(lengthM), coords })
  }, [patch])

  /**
   * Partir un tramo en dos, heredando la altura.
   *
   * Es justamente el caso en que se parte: el terreno cambia a mitad de traza y
   * hace falta darle a cada mitad su propia altura.
   */
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

  /** Lo que el mapa necesita: la banda es el ancho de base de cada tramo */
  const paraMapa: TramoDibujable[] = useMemo(
    () => tramos.map(t => ({
      id: t.id, nombre: t.nombre,
      an: computarTramo(seccion, t).anchoBanda,
      l_m: t.l_m, coords: t.coords, orden: t.orden, color: t.color,
    })),
    [tramos, seccion],
  )

  const guardar = () => {
    if (!onGuardarObra) return
    onGuardarObra({
      tipo: 'terraplen',
      cantidad: obra.W,
      unidad: 't',
      presupuesto_total: obra.W * precio,
      /*
       * El reparto de aportes va en cero, no en un 50/50 inventado. La versión
       * anterior escribía `total * 0.5` para cada parte y el modal nunca pidió
       * el dato: toda obra guardada quedaba con una distribución que nadie
       * eligió y con apariencia de dato.
       */
      aporte_dvp: 0,
      aporte_ccc: 0,
      precio_unitario: precio,
      coordsLinea: tramos.find(t => t.coords?.length)?.coords?.map(([lat, lng]) => ({ lat, lng })),
      datos_calculadora: {
        calculadora: 'terraplen',
        inputs: { seccion, tramos },
        computo: {
          L_total: obra.L_total, H_media: obra.H_media,
          Vneto: obra.Vneto, Vbanco: obra.Vbanco, Vesp: obra.Vesp, W: obra.W,
          porTramo: obra.porTramo,
        },
        viajes: Object.fromEntries(CAPACIDADES_T.map(c => [c, viajes(obra.W, c)])),
      },
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8, ...mono }}>

      {/* ── Pestañas, con el total de obra siempre a la vista ──────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0,
        borderBottom: '1px solid #1a1a1a', paddingBottom: 6 }}>
        {([['seccion', 'Sección tipo'], ['traza', 'Traza y tramos']] as const).map(([id, txt]) => (
          <button key={id} onClick={() => setVista(id)} style={{
            ...mono, fontSize: 13, padding: '3px 0', cursor: 'pointer',
            background: 'transparent', border: 'none',
            color: vista === id ? '#e0e0e0' : '#5a5a5a',
            borderBottom: `2px solid ${vista === id ? COLOR : 'transparent'}`,
          }}>{txt}</button>
        ))}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: '#5a5a5a' }}>
          {tramos.length} tramo{tramos.length === 1 ? '' : 's'}
          {' · '}{fmtL(obra.L_total)}
          {' · '}<b style={{ color: obra.W > 0 ? '#F5C300' : '#444' }}>{fmt(obra.W)} t</b>
        </span>
      </div>

      {vista === 'seccion' ? (
        // ── Sección tipo ───────────────────────────────────────────────────
        <div style={{ display: 'grid', gridTemplateColumns: '210px 1fr 158px', gap: 10,
          flex: 1, minHeight: 0 }}>
          <div style={panel}>
            <SectionTitle>Geometría</SectionTitle>
            {/*
              No hay campo de longitud: en este flujo la longitud sale del
              dibujo. Tenerlo invitaría a tipear un número que después se pisa.
            */}
            <Inp label="Ancho de corona" unit="m" value={seccion.Bc} onChange={v => setSec('Bc', v)} />
            <Inp label="Talud H:V" value={seccion.m} onChange={v => setSec('m', v)} step={0.5} min={0} />
            <div style={secLabel}>Material</div>
            <Inp label="Densidad" unit="t/m³" value={seccion.rho} onChange={v => setSec('rho', v)} step={0.05} min={0} />
            <Inp label="Esponjamiento" unit="%" value={seccion.Fe} onChange={v => setSec('Fe', v)} step={1} />
            <Inp label="Compactación" unit="%" value={seccion.Fc} onChange={v => setSec('Fc', v)} step={1} min={1} />
            <div style={{ marginTop: 12, padding: 8, background: '#0a0a0a', borderRadius: 4,
              fontSize: 12, color: '#333', ...mono, lineHeight: 1.6 }}>
              Ancho base = {perfil.Bb.toFixed(2)} m<br />
              A sección  = {perfil.A.toFixed(3)} m²
            </div>
          </div>

          <div style={{ ...panel, display: 'flex', flexDirection: 'column' }}>
            <SectionTitle>
              Sección tipo — Terraplén
              {sel
                ? <span style={{ color: '#5a5a5a' }}>{`  ·  altura de ${sel.nombre} (${sel.H.toFixed(2)} m)`}</span>
                : <span style={{ color: '#E8833A' }}>  ·  altura de referencia: todavía no hay tramos</span>}
            </SectionTitle>
            <SeccionTerraplen H={Hdibujo} Bc={seccion.Bc} m={seccion.m}
              A={perfil.A} Bb={perfil.Bb} color={COLOR} alto={330} />
            {/*
              La cadena se corta acá: estos dos pasos dependen sólo de la
              sección. Los volúmenes y el peso necesitan la longitud medida, y
              viven en la otra pestaña.
            */}
            <Pipeline color={COLOR} titulo="Procedimiento — de la sección tipo" steps={[
              { label: 'Ancho base', formula: 'Bb = Bc + 2·H·m',
                sub: `${seccion.Bc} + 2·${Hdibujo}·${seccion.m}`, result: `${perfil.Bb.toFixed(3)} m` },
              { label: 'Sección', formula: 'A = (Bc+Bb)/2 · H',
                sub: `(${seccion.Bc}+${perfil.Bb.toFixed(2)})/2 · ${Hdibujo}`,
                result: `${perfil.A.toFixed(3)} m²`, accent: true },
            ]} />
            <div style={{ fontSize: 12, color: '#3a3a3a', marginTop: 10, lineHeight: 1.6 }}>
              Los volúmenes y el peso dependen de la longitud, que sale del dibujo.
              Están en <b style={{ color: '#5a5a5a' }}>Traza y tramos</b>.
            </div>
          </div>

          <div style={panel}>
            <SectionTitle>Cómputo de obra</SectionTitle>
            <Res label="Longitud total"    value={fmtL(obra.L_total)} unit="" />
            <Res label="Vol. compactado"   value={fmt(obra.Vneto)}    unit="m³" />
            <Res label="Material en banco" value={fmt(obra.Vbanco)}   unit="m³" />
            <Res label="Vol. esponjado"    value={fmt(obra.Vesp)}     unit="m³" />
            <Res label="Peso total"        value={fmt(obra.W)}        unit="t" accent />
            <div style={{ fontSize: 13, color: '#333', ...mono, lineHeight: 1.8 }}>
              {CAPACIDADES_T.map(c => (
                <span key={c}>Camiones {c}t: ~{fmt(viajes(obra.W, c))}<br /></span>
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
        // ── Traza y tramos ─────────────────────────────────────────────────
        <div style={{ display: 'grid', gridTemplateColumns: `${anchoCol}px 10px 1fr`, gap: 0,
          flex: 1, minHeight: 0 }}>

          <div ref={montarColumna}
            style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0,
              minWidth: 0, overflowY: 'auto', paddingRight: 2 }}>
            <div style={{ ...panel, padding: 11, overflowY: 'visible' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: '#6a6a6a', textTransform: 'uppercase',
                  letterSpacing: 0.8, flex: 1 }}>Tramos</span>
                <button onClick={agregar} style={{
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
                    background: activo ? 'rgba(141,110,99,0.08)' : 'transparent',
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
                      <span style={{ color: '#7a7a7a', flex: 1 }}>Altura media</span>
                      <input type="number" value={t.H} step={0.1} min={0}
                        onChange={e => patch(t.id, { H: parseFloat(e.target.value) || 0 })}
                        style={{ width: 62, background: '#080808', border: '1px solid #222',
                          color: '#e0e0e0', ...mono, fontSize: 11, padding: '2px 5px', outline: 'none' }} />
                      <span style={{ color: '#4a4a4a', width: 14 }}>m</span>
                    </label>

                    <div style={{ fontSize: 11, color: '#5a5a5a', margin: '3px 0 5px' }}>
                      huella {c.anchoBanda.toFixed(2)} m · {fmt(c.W)} t
                    </div>

                    {/*
                      Grilla y no flex: con flex el botón de quitar se empujaba
                      fuera de la columna y quedaba cortado por la mitad. Cuatro
                      columnas iguales entran siempre, porque el ancho mínimo de
                      la columna está fijado para que entren.
                    */}
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
                      <button onClick={() => eliminar(t.id)} style={btn('#7a3a3a', false)}>quitar</button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* La miniatura: el perfil del tramo que se está tocando */}
            {sel && (
              <div style={{ ...panel, padding: 11, overflowY: 'visible' }}>
                <div style={{ fontSize: 11, color: '#6a6a6a', textTransform: 'uppercase',
                  letterSpacing: 0.8, marginBottom: 4 }}>Sección del tramo</div>
                {/* El alto sigue al ancho: ensanchar la columna agranda el perfil */}
                <SeccionTerraplen H={sel.H} Bc={seccion.Bc} m={seccion.m}
                  A={computarTramo(seccion, sel).A} Bb={computarTramo(seccion, sel).Bb}
                  color={COLOR} alto={Math.round((anchoCol - 24) * 0.60)} />
                <div style={{ fontSize: 11, color: '#4a4a4a', marginTop: 4, lineHeight: 1.45 }}>
                  Con la altura de <span style={{ color: '#8a8a8a' }}>{sel.nombre}</span>.
                  Al cambiarla se mueven el perfil y la huella del mapa.
                </div>
              </div>
            )}

            <div style={{ ...panel, padding: 11, overflowY: 'visible' }}>
              <div style={{ fontSize: 11, color: '#6a6a6a', textTransform: 'uppercase',
                letterSpacing: 0.8, marginBottom: 6 }}>Cómputo de la obra</div>
              <Linea label="Longitud total"    value={fmtL(obra.L_total)} />
              <Linea label="Altura media"      value={`${obra.H_media.toFixed(2)} m`} />
              <div style={{ borderTop: '1px solid #1b1b1b', margin: '6px 0' }} />
              <Linea label="Vol. compactado"   value={`${fmt(obra.Vneto)} m³`} />
              <Linea label="Material en banco" value={`${fmt(obra.Vbanco)} m³`} />
              <Linea label="Vol. esponjado"    value={`${fmt(obra.Vesp)} m³`} />
              <Linea label="Peso total"        value={`${fmt(obra.W)} t`} acento />

              <div style={{ fontSize: 12, color: '#4a4a4a', marginTop: 6, lineHeight: 1.7 }}>
                {CAPACIDADES_T.map(c => (
                  <span key={c}>Camiones {c}t: ~{fmt(viajes(obra.W, c))}<br /></span>
                ))}
              </div>

              {obra.sinDibujar > 0 && (
                <div style={{ fontSize: 11, color: '#E8833A', marginTop: 6, lineHeight: 1.5 }}>
                  {obra.sinDibujar} tramo(s) sin dibujar: no aportan al cómputo.
                </div>
              )}
              {tramos.length > 1 && (
                <div style={{ fontSize: 11, color: '#4a4a4a', marginTop: 6, lineHeight: 1.5 }}>
                  La altura media se pesa por longitud y es informativa: el volumen
                  se suma tramo por tramo.
                </div>
              )}

              {obra.W > 0 && onGuardarObra && (
                <>
                  <button onClick={guardar} style={{
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
              )}
            </div>
          </div>

          {/*
            El divisor. Va con `touchAction: none` porque sin eso el navegador
            se queda con el gesto y lo interpreta como scroll, y el arrastre no
            llega nunca.
          */}
          <div
            onPointerDown={alBajarDivisor}
            onPointerMove={alMoverDivisor}
            onPointerUp={alSoltarDivisor}
            title="Arrastrar para ensanchar la columna"
            style={{
              cursor: 'col-resize', touchAction: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
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
              onDeleteRipio={eliminar}
              fitTo={fitTo}
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
