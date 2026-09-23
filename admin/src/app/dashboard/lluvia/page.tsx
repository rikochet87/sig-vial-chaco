'use client'
/**
 * Lluvias — cuántos milímetros cayeron y dónde.
 *
 * El caso de uso que manda es el de después de la tormenta: entrar y ver de un
 * vistazo sobre qué parte de la red vial cayó el agua. Por eso la pantalla abre
 * con el último episodio detectado y no con un rango arbitrario: lo que se
 * quiere mirar es el evento, que puede haber durado dos o tres días.
 *
 * El número baja hasta el camino, no se queda en el consorcio: un consorcio
 * puede tener 250 km y una tormenta mojar una punta y no la otra.
 *
 * Los otros dos usos salen de los mismos datos: el rango libre sirve para
 * documentar las fechas de una obra, y el acumulado por consorcio es el
 * histórico que se va juntando solo con el cron diario.
 */

import { useEffect, useMemo, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useUser } from '@/lib/UserContext'
import {
  UMBRALES, clasificar, hace, aISO, rangoLluvia, mmRedondeado,
  type ResumenConsorcio, type Episodio,
} from '@/lib/lluvia'

import type { EstacionLluvia } from '@/components/MapaLluvia'
import { useRedLluvia } from '@/hooks/useRedLluvia'
import { kmPorRango, kmSobre, csvTramos, CORTES_MM } from '@/lib/redLluvia'
import { colorLluvia } from '@/lib/lluvia'

const PanelMediciones = dynamic(() => import('@/components/PanelMediciones'), { ssr: false })

const MapaLluvia = dynamic(() => import('@/components/MapaLluvia'), {
  ssr: false,
  loading: () => <div style={{ ...mono, color: '#444', fontSize: 13, padding: 20 }}>Cargando mapa…</div>,
})

const mono: React.CSSProperties = { fontFamily: 'monospace' }
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 12, color: '#555', textTransform: 'uppercase',
  letterSpacing: 0.8, ...mono, marginBottom: 4,
}
const inp: React.CSSProperties = {
  background: '#0a0a0a', border: '1px solid #222', color: '#ddd',
  padding: '6px 9px', fontSize: 13, ...mono, outline: 'none', borderRadius: 2,
}

const fmtFecha = (f: string) => f.split('-').reverse().join('/')

type Orden = 'mm' | 'pico' | 'numero'

export default function LluviaPage() {
  const { profile } = useUser()
  const esAdmin = profile?.rol === 'admin'

  const [desde, setDesde] = useState(hace(7))
  const [hasta, setHasta] = useState(aISO(new Date()))
  const [datos, setDatos] = useState<ResumenConsorcio[]>([])
  const [episodios, setEpisodios] = useState<Episodio[]>([])
  const [ultimaCarga, setUltimaCarga] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [seleccionado, setSeleccionado] = useState<number | null>(null)
  const [orden, setOrden] = useState<Orden>('mm')
  const [ingiriendo, setIngiriendo] = useState(false)
  const [progreso, setProgreso] = useState<
    { hecho: number; total: number; desde: string; hasta: string } | null
  >(null)
  const [autoEpisodio, setAutoEpisodio] = useState(true)
  const [vista, setVista] = useState<'mapa' | 'precision'>('mapa')
  const [verRango, setVerRango] = useState(false)

  const cargar = useCallback(async (d: string, h: string) => {
    setCargando(true); setError(null)
    try {
      const r = await fetch(`/api/lluvia?desde=${d}&hasta=${h}`)
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'No se pudo consultar')
      const j = await r.json()
      setDatos(j.consorcios ?? [])
      setEpisodios(j.episodios ?? [])
      setUltimaCarga(j.ultimaFechaCargada ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al consultar')
      setDatos([])
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargar(desde, hasta) }, [cargar, desde, hasta])

  /**
   * Las mediciones de la APA del período, para las isohietas.
   *
   * Va aparte de `cargar` a propósito: son 71 números y el mapa los usa sólo si
   * el usuario prende la capa, así que si esta consulta falla no tiene que
   * arrastrar al resto de la pantalla.
   */
  /** Desde cuántos mm se resaltan los caminos en el mapa */
  const [umbral, setUmbral] = useState(0)

  const [estaciones, setEstaciones] = useState<EstacionLluvia[]>([])
  useEffect(() => {
    let vivo = true
    fetch(`/api/lluvia/estaciones?desde=${desde}&hasta=${hasta}`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (vivo) setEstaciones(j?.estaciones ?? []) })
      .catch(() => { if (vivo) setEstaciones([]) })
    return () => { vivo = false }
  }, [desde, hasta])

  /**
   * La lluvia bajada al camino.
   *
   * Es el mismo IDW que alimenta la tabla por consorcio, pero evaluado sobre la
   * traza de cada tramo en vez del centro de la red. Un consorcio puede tener
   * 250 km y una tormenta mojar una punta y no la otra; el promedio lo tapaba.
   */
  const { tramos, lluvia } = useRedLluvia(estaciones)
  const rangos = useMemo(
    () => (tramos.length && lluvia.length ? kmPorRango(tramos, lluvia, seleccionado ?? undefined) : []),
    [tramos, lluvia, seleccionado],
  )
  const kmTotalRango = useMemo(
    () => Math.round(rangos.reduce((s, r) => s + r.km, 0)).toLocaleString('es-AR'),
    [rangos],
  )
  const kmResaltados = useMemo(
    () => (tramos.length && lluvia.length ? kmSobre(tramos, lluvia, Math.max(umbral, 0.05)) : 0),
    [tramos, lluvia, umbral],
  )

  /** Descargar la lista completa de tramos con su lluvia */
  const descargarCsv = () => {
    const csv = csvTramos(tramos, lluvia, { desde, hasta })
    // El BOM es lo que hace que Excel en español abra los acentos bien
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `lluvia-por-camino_${desde}_a_${hasta}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  /**
   * Al entrar, saltar al último episodio en vez de quedarse en "los últimos 7
   * días": si la tormenta fue el martes y hoy es viernes, el acumulado semanal
   * dice lo mismo pero el rango del evento es lo que se quiere ver y citar.
   */
  useEffect(() => {
    if (!autoEpisodio || cargando || episodios.length === 0) return
    const e = episodios[0]
    setAutoEpisodio(false)
    if (e.desde !== desde || e.hasta !== hasta) { setDesde(e.desde); setHasta(e.hasta) }
  }, [autoEpisodio, cargando, episodios, desde, hasta])

  const ordenados = useMemo(() => {
    const xs = [...datos]
    if (orden === 'mm')     xs.sort((a, b) => b.mm - a.mm || a.numero - b.numero)
    if (orden === 'pico')   xs.sort((a, b) => b.mmMaxDia - a.mmMaxDia || a.numero - b.numero)
    if (orden === 'numero') xs.sort((a, b) => a.numero - b.numero)
    return xs
  }, [datos, orden])

  const conDato = datos.filter(d => d.mm > 0)
  const mayor   = conDato.length
    ? conDato.reduce((a, b) => (b.mm > a.mm ? b : a))
    : null
  const maximo  = conDato.length ? Math.max(...conDato.map(d => d.mm)) : 0
  const promedio = conDato.length ? conDato.reduce((s, d) => s + d.mm, 0) / conDato.length : 0
  const afectados = datos.filter(d => d.mm >= 40).length

  /**
   * Trae el rango en ventanas de dos semanas, de a una.
   *
   * El servicio cobra una llamada por ubicación y corta en 600 por minuto: con
   * ~450 puntos, una ventana de 14 días entra justa y un mes entero no. Antes
   * un rango largo moría con un 429 y el mensaje crudo del servicio; ahora se
   * parte solo, se espera entre ventanas y se ve el avance.
   *
   * Cada ventana se guarda apenas llega, así que si se corta a la mitad lo
   * cargado queda: al reintentar sólo se repite lo que falta.
   */
  async function ingerir() {
    const VENTANA_DIAS = 14
    const PAUSA_MS = 20_000   // el cupo se libera por minuto

    const dia = 86_400_000
    const ventanas: [string, string][] = []
    for (let t = Date.parse(desde); t <= Date.parse(hasta); t += VENTANA_DIAS * dia) {
      const fin = Math.min(t + (VENTANA_DIAS - 1) * dia, Date.parse(hasta))
      ventanas.push([aISO(new Date(t)), aISO(new Date(fin))])
    }

    setIngiriendo(true); setError(null); setProgreso(null)
    try {
      for (let i = 0; i < ventanas.length; i++) {
        const [d, h] = ventanas[i]
        setProgreso({ hecho: i, total: ventanas.length, desde: d, hasta: h })

        const r = await fetch(`/api/lluvia/ingesta?desde=${d}&hasta=${h}`, { method: 'POST' })
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.error ?? 'No se pudo actualizar')

        // Entre ventanas hay que dejar respirar al cupo; en la última no
        if (i < ventanas.length - 1) await new Promise(res => setTimeout(res, PAUSA_MS))
      }
      setProgreso(null)
      await cargar(desde, hasta)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al actualizar')
      // Lo que alcanzó a cargarse ya está guardado: mostrarlo
      await cargar(desde, hasta)
    } finally {
      setIngiriendo(false)
      setProgreso(null)
    }
  }

  /**
   * Recalcula la fusión sin volver a pedirle nada a Open-Meteo.
   *
   * Los milímetros del modelo ya están guardados; lo único que falta es cruzarlos
   * con los partes de la APA. Por eso este botón no dispara la ingesta completa,
   * que tardaría minutos y gastaría cupo para traer lo que ya está.
   */
  const [recalculando, setRecalculando] = useState(false)
  async function recalcularFusion() {
    setRecalculando(true); setError(null)
    try {
      const r = await fetch(`/api/lluvia/ingesta?soloFusion=1&desde=${desde}&hasta=${hasta}`,
        { method: 'POST' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error ?? 'No se pudo recalcular')
      await cargar(desde, hasta)
      if (!j.filas) setError(j.aviso ?? 'No había nada para recalcular en ese rango.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al recalcular')
    } finally { setRecalculando(false) }
  }

  const hoy = aISO(new Date())
  const desactualizado = ultimaCarga !== null && ultimaCarga < hace(1)

  /**
   * Si más de la mitad de los consorcios todavía no se cruzó con los
   * pluviómetros, lo que se está mirando es el modelo crudo. Se avisa arriba en
   * vez de dejarlo escondido en el globo de cada uno de los 103 círculos.
   */
  const sinRecalcular = datos.length > 0
    && datos.filter(d => d.procedencia === 'sin_calcular').length > datos.length / 2

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)', minHeight: 0 }}>

      {/* Encabezado */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14, flexShrink: 0 }}>
        <h1 style={{ color: '#e0e0e0', fontSize: 20, fontWeight: 700, letterSpacing: 0.5, ...mono, margin: 0 }}>
          Lluvias
        </h1>
        {!cargando && vista === 'mapa' && (
          <span style={{ color: '#444', fontSize: 13, ...mono }}>
            {conDato.length} de {datos.length} consorcios con registro
          </span>
        )}

        <div style={{ display: 'flex', border: '1px solid #252525' }}>
          {([['mapa', 'Mapa'], ['precision', 'Precisión']] as const).map(([v, t]) => (
            <button key={v} onClick={() => setVista(v)} style={{
              ...mono, fontSize: 13, padding: '5px 14px', cursor: 'pointer',
              border: 'none', letterSpacing: 0.5,
              background: vista === v ? '#1e1e1e' : 'transparent',
              color: vista === v ? '#F5C300' : '#555',
            }}>{t}</button>
          ))}
        </div>
      </div>

      {vista === 'precision' && (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <PanelMediciones esAdmin={esAdmin} />
        </div>
      )}

      {vista === 'mapa' && (<>

      {/*
        Los episodios son el control principal, no las fechas.
        La pantalla contesta "qué pasó en tal evento", y el evento lo detecta
        solo el motor. Elegir fechas a mano es el caso raro, así que va plegado.
      */}
      {episodios.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ ...lbl, marginBottom: 0 }}>Qué evento mirar</span>
          {episodios.slice(0, 6).map(e => {
            const activo = e.desde === desde && e.hasta === hasta
            return (
              <button key={e.desde + e.hasta}
                onClick={() => { setDesde(e.desde); setHasta(e.hasta) }}
                style={{
                  ...mono, fontSize: 12, cursor: 'pointer', padding: '5px 10px',
                  background: activo ? 'rgba(245,195,0,0.10)' : 'transparent',
                  border: `1px solid ${activo ? '#5a4400' : '#222'}`,
                  color: activo ? '#F5C300' : '#777', textAlign: 'left', lineHeight: 1.45,
                }}>
                {e.desde === e.hasta ? fmtFecha(e.desde) : `${fmtFecha(e.desde)} → ${fmtFecha(e.hasta)}`}
                <span style={{ color: '#555' }}> · pico {mmRedondeado(e.mmPico)}</span>
              </button>
            )
          })}
        </div>
      )}

      {!verRango && (
        <button onClick={() => setVerRango(true)}
          style={{ ...mono, fontSize: 12, padding: '5px 11px', cursor: 'pointer', marginBottom: 12,
            background: 'transparent', border: '1px solid #242424', color: '#6a6a6a',
            flexShrink: 0, alignSelf: 'flex-start' }}>
          Otro rango de fechas
        </button>
      )}

      {/* Filtros */}
      {verRango && (
      <div style={{
        background: '#191919', border: '1px solid #1e1e1e', padding: '12px 16px',
        marginBottom: 12, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end', flexShrink: 0,
      }}>
        <div>
          <label style={lbl}>Desde</label>
          <input type="date" value={desde} max={hasta}
            onChange={e => { setAutoEpisodio(false); setDesde(e.target.value) }} style={inp} />
        </div>
        <div>
          <label style={lbl}>Hasta</label>
          <input type="date" value={hasta} min={desde} max={hoy}
            onChange={e => { setAutoEpisodio(false); setHasta(e.target.value) }} style={inp} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {([['Últimos 7 días', 7], ['30 días', 30], ['90 días', 90]] as const).map(([txt, d]) => (
            <button key={d} onClick={() => { setAutoEpisodio(false); setDesde(hace(d)); setHasta(hoy) }}
              style={{ ...mono, fontSize: 12, cursor: 'pointer', padding: '6px 10px',
                background: 'transparent', border: '1px solid #222', color: '#777' }}>
              {txt}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {esAdmin && (
          <button onClick={ingerir} disabled={ingiriendo}
            title="Traer de nuevo los datos de este rango desde el servicio"
            style={{
              ...mono, fontSize: 13, cursor: ingiriendo ? 'default' : 'pointer', padding: '7px 14px',
              background: 'transparent', border: `1px solid ${ingiriendo ? '#333' : '#2e6b3e'}`,
              color: ingiriendo ? '#555' : '#7BC47F', fontWeight: 700,
            }}>
            {ingiriendo
              ? progreso
                ? `Cargando ${progreso.hecho + 1} de ${progreso.total}…`
                : 'Actualizando…'
              : '↻ Actualizar rango'}
          </button>
        )}

        <button onClick={() => setVerRango(false)}
          style={{ ...mono, fontSize: 12, padding: '7px 10px', cursor: 'pointer',
            background: 'transparent', border: 'none', color: '#5a5a5a' }}>
          ocultar
        </button>
      </div>
      )}

      {/* Avance de la carga */}
      {progreso && (
        <div style={{
          ...mono, fontSize: 13, color: '#7BC47F', background: '#0a1408',
          border: '1px solid #2e6b3e', padding: '9px 13px', marginBottom: 12,
          flexShrink: 0, lineHeight: 1.5,
        }}>
          Trayendo {fmtFecha(progreso.desde)} → {fmtFecha(progreso.hasta)} · ventana{' '}
          {progreso.hecho + 1} de {progreso.total}
          <div style={{ height: 3, background: '#1a2a1a', marginTop: 7 }}>
            <div style={{
              height: '100%', background: '#2e6b3e',
              width: `${(progreso.hecho / progreso.total) * 100}%`,
              transition: 'width .3s',
            }} />
          </div>
          <div style={{ color: '#4a6a4a', fontSize: 12, marginTop: 6 }}>
            Va de a dos semanas con una pausa entre medio, porque el servicio limita
            las consultas por minuto. Cada ventana se guarda apenas llega: si cortás,
            no se pierde lo cargado.
          </div>
        </div>
      )}

      {/* Avisos */}
      {error && (
        <div style={{ ...mono, fontSize: 13, color: '#E57373', background: '#1a0c0c',
          border: '1px solid #5a2222', padding: '8px 12px', marginBottom: 12, flexShrink: 0 }}>
          {error}
        </div>
      )}
      {!error && ultimaCarga === null && !cargando && (
        <div style={{ ...mono, fontSize: 13, color: '#F5C300', background: '#2a1f00',
          border: '1px solid #5a4400', padding: '9px 13px', marginBottom: 12, flexShrink: 0, lineHeight: 1.5 }}>
          Todavía no hay datos cargados.{esAdmin
            ? ' Apretá «Actualizar rango» para traer el período, o esperá a que corra la carga automática de mañana.'
            : ' La carga automática corre cada mañana.'}
        </div>
      )}
      {!error && desactualizado && (
        <div style={{ ...mono, fontSize: 13, color: '#E8833A', background: '#1a1206',
          border: '1px solid #5a3a00', padding: '8px 12px', marginBottom: 12, flexShrink: 0 }}>
          El último día cargado es el {fmtFecha(ultimaCarga!)}. La carga automática puede haberse salteado.
        </div>
      )}

      {/*
        Sin este aviso, el único lugar donde se entera de que está mirando el
        modelo crudo es el globo de cada círculo — y hay 103. Cuando el grueso
        del rango no se cruzó con los pluviómetros hay que decirlo arriba, con
        el botón que lo arregla al lado.
      */}
      {!error && !cargando && sinRecalcular && (
        <div style={{ ...mono, fontSize: 13, color: '#bdbdbd', background: '#17191a',
          border: '1px solid #33383a', padding: '9px 12px', marginBottom: 12, flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ lineHeight: 1.6 }}>
            Estos milímetros son <b style={{ color: '#e0e0e0' }}>la estimación del modelo</b>:
            el período todavía no se cruzó con los pluviómetros de la APA.
          </span>
          <button onClick={recalcularFusion} disabled={recalculando}
            style={{
              ...mono, fontSize: 12, padding: '5px 12px', fontWeight: 700, whiteSpace: 'nowrap',
              cursor: recalculando ? 'default' : 'pointer', background: 'transparent',
              border: `1px solid ${recalculando ? '#333' : '#F5C300'}`,
              color: recalculando ? '#555' : '#F5C300',
            }}>
            {recalculando ? 'Recalculando…' : 'Recalcular con los pluviómetros'}
          </button>
        </div>
      )}

      {/*
        Una frase en vez de tres tarjetas de números.
        Máximo, promedio y "consorcios sobre 40 mm" son los mismos datos, pero
        sueltos obligan a interpretarlos; en una oración se leen de corrido.
      */}
      {!cargando && conDato.length > 0 && (
        <div style={{
          ...mono, fontSize: 14, lineHeight: 1.65, color: '#d8d8d8', flexShrink: 0,
          background: '#191919', borderLeft: '3px solid #F5C300',
          padding: '11px 14px', marginBottom: 12,
        }}>
          {desde === hasta
            ? <>El <b style={{ color: '#fff' }}>{fmtFecha(desde)}</b> </>
            : <>Entre el <b style={{ color: '#fff' }}>{fmtFecha(desde)}</b> y el{' '}
               <b style={{ color: '#fff' }}>{fmtFecha(hasta)}</b> </>}
          llovió en <b style={{ color: '#fff' }}>{conDato.length}</b> de los {datos.length}{' '}
          consorcios. El máximo fue de{' '}
          <b style={{ color: '#F5C300' }}>{mmRedondeado(maximo)}</b>
          {mayor && <> en el <b style={{ color: '#fff' }}>CC N° {mayor.numero}</b></>}
          {afectados > 0
            ? <>, y <b style={{ color: '#E8833A' }}>{afectados}</b>{' '}
               {afectados === 1 ? 'pasó' : 'pasaron'} los 40 mm.</>
            : <>, y ninguno pasó los 40 mm.</>}
        </div>
      )}

      {/*
        Kilómetros de camino por rango de lluvia.

        Es el número que se cita: "420 km recibieron más de 50 mm" dice algo que
        "el CC 37 promedió 48 mm" no dice. Sale de cruzar cada tramo con el
        mismo IDW, así que la barra y el mapa no pueden contradecirse.
      */}
      {rangos.length > 0 && rangos.some(r => r.km > 0) && (
        <div style={{ ...mono, flexShrink: 0, marginBottom: 12,
          background: '#191919', border: '1px solid #242424', padding: '10px 13px' }}>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8,
            flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: '#6a6a6a', textTransform: 'uppercase',
              letterSpacing: 0.8 }}>
              Kilómetros de camino
              {seleccionado != null && <> · CC N° {seleccionado}</>}
            </span>
            <span style={{ fontSize: 12, color: '#8a8a8a' }}>
              {kmTotalRango} km en total
            </span>
            <button onClick={descargarCsv}
              style={{ marginLeft: 'auto', ...mono, fontSize: 11, cursor: 'pointer',
                background: 'transparent', color: '#9a9a9a',
                border: '1px solid #3a3a3a', padding: '3px 9px' }}>
              Descargar CSV
            </button>
          </div>

          {/* Una barra proporcional: se ve el reparto sin leer los números */}
          <div style={{ display: 'flex', height: 13, marginBottom: 7, gap: 1 }}>
            {rangos.filter(r => r.km > 0).map(r => (
              <div key={r.desde ?? 'sin'} title={`${r.km.toLocaleString('es-AR')} km`}
                style={{
                  flex: r.km,
                  background: r.desde === null ? 'repeating-linear-gradient('
                    + '45deg,#3a3a3a,#3a3a3a 3px,#2a2a2a 3px,#2a2a2a 6px)'
                    : colorLluvia(r.desde),
                }} />
            ))}
          </div>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {rangos.filter(r => r.km > 0).map(r => (
              <span key={r.desde ?? 'sin'}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <span style={{ width: 9, height: 9, flexShrink: 0,
                  background: r.desde === null ? '#3a3a3a' : colorLluvia(r.desde),
                  border: r.desde === null ? '1px dashed #6a6a6a' : 'none' }} />
                <b style={{ color: '#fff' }}>{r.km.toLocaleString('es-AR')} km</b>
                <span style={{ color: '#8a8a8a' }}>
                  {r.desde === null ? 'sin pluviómetro cerca'
                    : r.hasta === null ? `${r.desde} mm o más`
                      : `${r.desde}–${r.hasta} mm`}
                </span>
              </span>
            ))}
          </div>

          {umbral > 0 && (
            <div style={{ fontSize: 12, color: '#F5C300', marginTop: 8 }}>
              Resaltado en el mapa: {kmResaltados.toLocaleString('es-AR')} km desde {umbral} mm.
            </div>
          )}
        </div>
      )}

      {/* Mapa + tabla */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 12 }}>

        <div style={{ flex: 1, minWidth: 0, position: 'relative',
          background: '#191919', border: '1px solid #1e1e1e' }}>
          <MapaLluvia datos={datos} seleccionado={seleccionado} onSeleccionar={setSeleccionado}
            estaciones={estaciones} tramos={tramos} lluviaTramos={lluvia}
            umbral={umbral} onUmbral={setUmbral} />

          {/* Referencias */}
          <div style={{
            position: 'absolute', bottom: 12, left: 12, zIndex: 500,
            background: 'rgba(10,10,10,0.92)', border: '1px solid #262626',
            padding: '9px 12px', ...mono,
          }}>
            <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase',
              letterSpacing: 1, marginBottom: 6 }}>Acumulado</div>
            <div style={{ fontSize: 11, color: '#555', marginBottom: 6, lineHeight: 1.4 }}>
              El círculo resume el consorcio.<br />
              Cada camino lleva su propia lluvia.
            </div>
            {UMBRALES.slice().reverse().map(u => (
              <div key={u.nivel} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                <span style={{ width: 11, height: 11, borderRadius: '50%', background: u.color,
                  border: '1px solid #111', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: '#bbb' }}>
                  {u.desde === 0 ? '0 mm' : `${u.desde}+ mm`}
                  <span style={{ color: '#555' }}> · {u.label}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Ranking */}
        <div style={{ width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column',
          background: '#191919', border: '1px solid #1e1e1e', minHeight: 0 }}>
          <div style={{ padding: '9px 12px', borderBottom: '1px solid #1e1e1e',
            display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }}>
            <span style={{ ...lbl, marginBottom: 0, flex: 1 }}>Ordenar por</span>
            {([['mm', 'Acumulado'], ['pico', 'Día pico'], ['numero', 'Nº']] as const).map(([k, t]) => (
              <button key={k} onClick={() => setOrden(k)} style={{
                ...mono, fontSize: 12, cursor: 'pointer', padding: '3px 8px', border: 'none',
                background: orden === k ? '#252525' : 'transparent',
                color: orden === k ? '#F5C300' : '#555',
              }}>{t}</button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {cargando && <div style={{ padding: 16, ...mono, fontSize: 13, color: '#555' }}>Cargando…</div>}

            {!cargando && ordenados.map(c => {
              const nivel  = clasificar(c.mm)
              const activo = c.numero === seleccionado
              return (
                <button key={c.numero}
                  onClick={() => setSeleccionado(activo ? null : c.numero)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                    padding: '8px 12px', cursor: 'pointer', ...mono,
                    background: activo ? 'rgba(245,195,0,0.07)' : 'transparent',
                    border: 'none', borderBottom: '1px solid #141414',
                    borderLeft: `3px solid ${activo ? '#F5C300' : 'transparent'}`,
                  }}>
                  <span style={{ width: 12, height: 12, borderRadius: '50%', background: nivel.color,
                    border: '1px solid #111', flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 12, color: '#999',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <b style={{ color: '#ccc' }}>Nº {c.numero}</b>
                      {' · '}
                      {c.nombre.replace(/^Consorcio Caminero N°?\s*\d+\s*/i, '').replace(/"/g, '')}
                    </span>
                    <span style={{ display: 'block', fontSize: 11, color: '#555', marginTop: 1 }}>
                      {c.zona}{c.dias > 0 ? ` · ${c.dias} día${c.dias === 1 ? '' : 's'} con agua` : ' · sin agua'}
                      {c.mmMaxDia > 0 ? ` · pico ${Math.round(c.mmMaxDia)}` : ''}
                      {/* Un solo punto = no hay traza de su red en el bundle */}
                      {c.puntos === 1 && (
                        <span title="Este consorcio no tiene su red cargada: se mide en un solo punto, no promediado sobre los caminos"
                          style={{ color: '#E8833A' }}> · 1 punto</span>
                      )}
                    </span>
                  </span>
                  <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: nivel.color }}>
                      {nivel.label}
                    </span>
                    <span style={{ display: 'block', fontSize: 12, color: '#777', marginTop: 1 }}>
                      {rangoLluvia(c.mm)}
                    </span>
                  </span>
                </button>
              )
            })}

            {!cargando && ordenados.length === 0 && (
              <div style={{ padding: 16, ...mono, fontSize: 13, color: '#555', lineHeight: 1.6 }}>
                Sin registros en este rango.
              </div>
            )}
          </div>
        </div>
      </div>

      </>)}

      {/*
        El pie tenía siete renglones explicando el método. Eso pertenece al globo
        de cada círculo, que lo dice para el caso concreto en vez de en abstracto.
        Acá queda sólo de dónde sale el dato.
      */}
      <div style={{ ...mono, fontSize: 12, color: '#3a3a3a', marginTop: 8, flexShrink: 0 }}>
        Pluviómetros de la Administración Provincial del Agua, interpolados sobre la red
        vial de cada consorcio. Tocá un círculo para ver de dónde sale su número.
      </div>
    </div>
  )
}
