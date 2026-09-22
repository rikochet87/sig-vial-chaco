'use client'
/**
 * Traer las mediciones de la APA, y de paso ver cómo anda el modelo de respaldo.
 *
 * ── Orden de la pantalla ──────────────────────────────────────────────────────
 *
 * Arriba va **la acción**, no el diagnóstico. El trabajo de quien entra acá es
 * traer los pluviómetros; los indicadores son consecuencia. La versión anterior
 * abría con seis números y el botón quedaba abajo, y eso hacía que la pantalla
 * pareciera un tablero cuando en realidad es un formulario de una sola tarea.
 *
 * Los indicadores se resumen en **una frase en castellano**. El detalle técnico
 * —MAE, sesgo, Spearman— queda plegado: sigue estando para quien lo busque, pero
 * no es lo primero que ve alguien que sólo quiere cargar los datos del mes.
 *
 * ── Qué se sacó y por qué ─────────────────────────────────────────────────────
 *
 * Había un cartel de "Corrección sugerida: multiplicar por X". Se sacó por dos
 * motivos, los dos medidos el 22/09/2026:
 *
 *   1. **Corregir con un factor único está mal.** El modelo subestima la lluvia
 *      liviana y aplasta los picos (`APA ≈ 2,3·modelo^0,68`), así que un factor
 *      arregla el promedio y empeora los eventos grandes, que son los que
 *      importan.
 *   2. **Ya no viene al caso.** El número que se muestra en el mapa sale de
 *      interpolar los pluviómetros, no del modelo. Esta pantalla mide el
 *      respaldo.
 *
 * El factor nunca se aplicaba a nada —era informativo— pero invitaba a hacer
 * algo que no conviene.
 *
 * ── Una advertencia sobre los indicadores ─────────────────────────────────────
 *
 * Se calculan sólo sobre los pares donde la APA reportó lluvia, y por eso se dan
 * vuelta según la muestra: con 5 fechas el modelo parecía sobreestimar 28 %, con
 * 162 parecía subestimar 26 %. La pantalla lo dice en vez de mostrar el número
 * pelado como si fuera una verdad.
 */

import { useEffect, useState, useCallback } from 'react'
import type { LecturaParte, Metricas, EvaluacionCorreccion } from '@/lib/calibracion'

const mono: React.CSSProperties = { fontFamily: 'monospace' }
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 12, color: '#555', textTransform: 'uppercase',
  letterSpacing: 0.8, ...mono, marginBottom: 4,
}
const inp: React.CSSProperties = {
  background: '#0a0a0a', border: '1px solid #222', color: '#ddd',
  padding: '6px 9px', fontSize: 13, ...mono, outline: 'none', borderRadius: 2,
}
const caja: React.CSSProperties = {
  background: '#191919', border: '1px solid #1e1e1e', padding: '14px 16px', marginBottom: 12,
}

interface Precision {
  mediciones: number
  eventos: number
  comparables?: number
  /** Cuántos pares se resolvieron en la coordenada exacta de la estación */
  enCoordenadaExacta?: number
  metricas: Metricas | null
  factor: number | null
  evaluacion: EvaluacionCorreccion | null
  rango?: { desde: string; hasta: string }
  aviso?: string
}

const fmtFecha = (f: string) => f.split('-').reverse().join('/')

export default function PanelMediciones({ esAdmin }: { esAdmin: boolean }) {
  const [fecha, setFecha] = useState('')
  const [texto, setTexto] = useState('')
  const [url, setUrl] = useState('')
  const [leidas, setLeidas] = useState<LecturaParte[] | null>(null)
  const [desconocidas, setDesconocidas] = useState<{ nombre: string; mm: number }[]>([])
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [precision, setPrecision] = useState<Precision | null>(null)
  const [verDetalle, setVerDetalle] = useState(false)
  const [verManual, setVerManual] = useState(false)

  // Importación automática: por defecto, el último mes
  const hoy = new Date().toISOString().slice(0, 10)
  const haceUnMes = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)
  const [impDesde, setImpDesde] = useState(haceUnMes)
  const [impHasta, setImpHasta] = useState(hoy)
  const [resumenImp, setResumenImp] = useState<string | null>(null)

  const cargarPrecision = useCallback(async () => {
    try {
      const r = await fetch('/api/lluvia/mediciones')
      if (r.ok) setPrecision(await r.json())
    } catch { /* el panel de precisión es informativo: si falla, no molesta */ }
  }, [])
  useEffect(() => { cargarPrecision() }, [cargarPrecision])

  async function importar() {
    setOcupado(true); setError(null); setAviso(null); setResumenImp(null)
    try {
      const r = await fetch('/api/lluvia/mediciones', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ importar: true, desde: impDesde, hasta: impHasta }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'No se pudo importar')

      if (!j.guardadas) {
        setResumenImp(j.aviso ?? 'No había nada nuevo para traer.')
      } else {
        const partes = [
          `${j.guardadas} mediciones de ${j.fechas} ${j.fechas === 1 ? 'fecha' : 'fechas'}`,
          j.conModelo != null && `${j.conModelo} con el modelo ya comparado`,
          j.periodo && `período informado ${j.periodo}`,
          j.pendientes > 0 && `quedan ${j.pendientes} fechas: volvé a tocar Importar`,
        ].filter(Boolean)
        setResumenImp(partes.join(' · '))
      }
      if (j.aviso && j.guardadas) setAviso(j.aviso)
      if (j.sinReconocer?.length) {
        setAviso(`La APA informó estaciones que no están en la lista: ${j.sinReconocer.join(', ')}`)
      }
      await cargarPrecision()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al importar')
    } finally { setOcupado(false) }
  }

  async function leer() {
    setOcupado(true); setError(null); setAviso(null)
    try {
      const r = await fetch('/api/lluvia/mediciones', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha, texto }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'No se pudo leer el parte')
      setLeidas(j.lecturas ?? [])
      setDesconocidas(j.desconocidos ?? [])
      if ((j.lecturas ?? []).length === 0) {
        setError('No se reconoció ninguna localidad. Revisá que el texto sea el del parte.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al leer')
    } finally { setOcupado(false) }
  }

  async function guardar() {
    if (!leidas?.length) return
    setOcupado(true); setError(null)
    try {
      const r = await fetch('/api/lluvia/mediciones', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha, guardar: true, fuenteUrl: url || null,
          lecturas: leidas.map(l => ({ estacion: l.estacion, mm: l.mm })) }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'No se pudo guardar')
      setAviso(`Guardadas ${j.guardadas} mediciones del ${fmtFecha(fecha)}.`)
      setLeidas(null); setTexto(''); setDesconocidas([])
      await cargarPrecision()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally { setOcupado(false) }
  }

  const m = precision?.metricas
  const hay = (precision?.mediciones ?? 0) > 0

  return (
    <div style={{ padding: '4px 0 20px' }}>

      {/* ── Paso 1: traer los datos. Es la tarea de esta pantalla ── */}
      {esAdmin && (
        <div style={{ ...caja, borderLeft: '3px solid #F5C300' }}>
          <div style={{ ...mono, fontSize: 15, fontWeight: 700, color: '#e0e0e0', marginBottom: 6 }}>
            Traer las mediciones de la APA
          </div>
          <div style={{ ...mono, fontSize: 13, color: '#8a8a8a', marginBottom: 12, lineHeight: 1.6 }}>
            Elegí un período y tocá Importar. Trae sólo las fechas que falten, de a 25
            por vez — si quedan más, volvé a tocarlo hasta que avise que no hay nada nuevo.
            <br />
            <b style={{ color: '#a8a8a8' }}>Esto es lo que alimenta el mapa</b>: los milímetros
            de cada consorcio y las isohietas salen de acá.
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={lbl}>Desde</label>
              <input type="date" value={impDesde} onChange={e => setImpDesde(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Hasta</label>
              <input type="date" value={impHasta} onChange={e => setImpHasta(e.target.value)} style={inp} />
            </div>
            <button onClick={importar} disabled={ocupado || !impDesde || !impHasta}
              style={{
                ...mono, fontSize: 13, padding: '7px 16px', fontWeight: 700,
                cursor: ocupado || !impDesde || !impHasta ? 'default' : 'pointer',
                background: 'transparent',
                border: `1px solid ${ocupado || !impDesde || !impHasta ? '#333' : '#F5C300'}`,
                color: ocupado || !impDesde || !impHasta ? '#555' : '#F5C300',
              }}>
              {ocupado ? 'Trayendo…' : 'Importar'}
            </button>
          </div>

          {resumenImp && (
            <div style={{ ...mono, fontSize: 13, color: '#8fb98f', marginTop: 10, lineHeight: 1.6 }}>
              {resumenImp}
            </div>
          )}
        </div>
      )}

      {/* ── Qué hay cargado, en una frase ── */}
      <div style={caja}>
        {!hay ? (
          <div style={{ ...mono, fontSize: 13, color: '#8a8a8a', lineHeight: 1.6 }}>
            Todavía no hay ninguna medición cargada. Importá un período de arriba y el
            mapa va a empezar a mostrar los milímetros de los pluviómetros en vez de la
            estimación del modelo.
          </div>
        ) : (
          <>
            <div style={{ ...mono, fontSize: 14, color: '#d0d0d0', lineHeight: 1.65 }}>
              Hay <b style={{ color: '#F5C300' }}>{precision!.mediciones.toLocaleString('es-AR')}</b>{' '}
              mediciones de pluviómetro cargadas, de{' '}
              <b style={{ color: '#F5C300' }}>{precision!.eventos}</b>{' '}
              {precision!.eventos === 1 ? 'día de lluvia' : 'días de lluvia'}
              {precision!.rango && (
                <> — entre el {fmtFecha(precision!.rango.desde)} y el {fmtFecha(precision!.rango.hasta)}</>
              )}.
            </div>

            {m && (
              <div style={{ ...mono, fontSize: 13, color: '#8a8a8a', marginTop: 8, lineHeight: 1.65 }}>
                Comparadas contra el modelo de respaldo, coinciden en si llovió o no{' '}
                <b style={{ color: '#7BC47F' }}>{Math.round(m.aciertoLlovioONo * 100)} de cada 100 veces</b>,
                y cuando los dos marcan lluvia se llevan{' '}
                <b style={{ color: '#E8833A' }}>{m.errorAbsMedio} mm</b> de diferencia en promedio.
              </div>
            )}

            <div style={{ ...mono, fontSize: 12, color: '#6a6a6a', marginTop: 10, lineHeight: 1.6 }}>
              Esto mide <b style={{ color: '#8a8a8a' }}>el modelo de respaldo</b>, no lo que ves en el
              mapa. El número del mapa sale de interpolar estos mismos pluviómetros, y el modelo
              sólo aparece donde no hay ninguna estación a menos de 60 km.
            </div>

            <button onClick={() => setVerDetalle(v => !v)}
              style={{
                ...mono, fontSize: 12, marginTop: 10, padding: '4px 10px', cursor: 'pointer',
                background: 'transparent', border: '1px solid #333', color: '#8a8a8a',
              }}>
              {verDetalle ? 'Ocultar el detalle técnico' : 'Ver el detalle técnico'}
            </button>

            {verDetalle && m && (
              <div style={{ marginTop: 12, borderTop: '1px solid #262626', paddingTop: 12 }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {[
                    { l: 'Pares comparables', v: String(precision!.comparables ?? precision!.mediciones) },
                    { l: 'Error absoluto medio', v: `${m.errorAbsMedio} mm` },
                    { l: 'Sesgo relativo', v: m.sesgoRelativo != null
                        ? `${m.sesgoRelativo > 0 ? '+' : ''}${Math.round(m.sesgoRelativo * 100)} %` : '—' },
                    { l: 'Spearman', v: m.spearman != null ? String(m.spearman) : '—' },
                    { l: 'En coordenada exacta', v: String(precision!.enCoordenadaExacta ?? 0) },
                  ].map(x => (
                    <div key={x.l} style={{ background: '#111', border: '1px solid #222', padding: '7px 12px' }}>
                      <div style={{ ...mono, fontSize: 11, color: '#555', textTransform: 'uppercase',
                        letterSpacing: 0.8 }}>{x.l}</div>
                      <div style={{ ...mono, fontSize: 14, fontWeight: 700, color: '#bdbdbd', marginTop: 2 }}>
                        {x.v}
                      </div>
                    </div>
                  ))}
                </div>

                {/*
                  Este aviso no es un tecnicismo de más: sin él, el sesgo se lee como
                  una propiedad del modelo cuando es un artefacto de la muestra.
                */}
                <div style={{ ...mono, fontSize: 12, color: '#C9A227', marginTop: 12, lineHeight: 1.6,
                  background: '#151005', border: '1px solid #3a2e05', padding: '9px 12px' }}>
                  Estos indicadores se calculan sólo donde la APA reportó lluvia, así que
                  <b> se dan vuelta según cuántas fechas haya cargadas</b>: con 5 fechas el modelo
                  parecía sobreestimar 28 %, y con las 162 parecía subestimar 26 %. No los tomes
                  como una medida fija de cuánto se equivoca.
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/*
        Cargar a mano es el camino raro: sólo sirve si el mapa de la APA está
        caído. Va plegado para que no compita con Importar, que es lo que se usa
        siempre.
      */}
      {esAdmin && !verManual && (
        <button onClick={() => setVerManual(true)}
          style={{
            ...mono, fontSize: 12, padding: '7px 12px', cursor: 'pointer', marginBottom: 12,
            background: 'transparent', border: '1px solid #262626', color: '#6a6a6a',
          }}>
          ¿La APA no responde? Cargar un parte a mano
        </button>
      )}

      {esAdmin && verManual && (
        <div style={caja}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
            <div style={{ ...lbl, marginBottom: 0 }}>Cargar un parte a mano</div>
            <button onClick={() => setVerManual(false)}
              style={{ ...mono, fontSize: 11, background: 'transparent', border: 'none',
                color: '#6a6a6a', cursor: 'pointer', padding: 0 }}>
              ocultar
            </button>
          </div>
          <div style={{ ...mono, fontSize: 12, color: '#666', marginBottom: 10, lineHeight: 1.5 }}>
            Respaldo para cuando el mapa de la APA no responde y el dato sólo está en la prensa.
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
            <div>
              <label style={lbl}>Fecha de la lluvia</label>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={inp} />
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <label style={lbl}>Link de la nota (opcional)</label>
              <input type="url" value={url} onChange={e => setUrl(e.target.value)}
                placeholder="https://…" style={{ ...inp, width: '100%' }} />
            </div>
          </div>

          <div style={{ ...mono, fontSize: 12, color: '#555', marginBottom: 6, lineHeight: 1.5 }}>
            Pegá el texto del parte tal como viene. La fecha es la del día que llovió,
            no la de publicación: la APA acumula hasta las 7 y lo informa al otro día.
          </div>
          <textarea
            value={texto} onChange={e => setTexto(e.target.value)} rows={7}
            placeholder="De acuerdo con la planilla oficial, Pampa Almirón encabezó los registros…"
            style={{ ...inp, width: '100%', resize: 'vertical', lineHeight: 1.5 }} />

          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={leer} disabled={ocupado || !fecha || texto.trim().length < 40}
              style={{
                ...mono, fontSize: 13, padding: '7px 16px', fontWeight: 700,
                cursor: ocupado || !fecha || texto.trim().length < 40 ? 'default' : 'pointer',
                background: 'transparent',
                border: `1px solid ${!fecha || texto.trim().length < 40 ? '#333' : '#4A90C2'}`,
                color: !fecha || texto.trim().length < 40 ? '#555' : '#4A90C2',
              }}>
              {ocupado ? 'Leyendo…' : 'Leer el parte'}
            </button>
            {!fecha && (
              <span style={{ ...mono, fontSize: 12, color: '#666', alignSelf: 'center' }}>
                Poné la fecha primero
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Revisión antes de guardar ── */}
      {leidas && leidas.length > 0 && (
        <div style={caja}>
          <div style={{ ...lbl, marginBottom: 4 }}>
            Revisá antes de guardar — {leidas.length} localidades
          </div>
          <div style={{ ...mono, fontSize: 12, color: '#666', marginBottom: 10, lineHeight: 1.5 }}>
            Cada valor sale del fragmento que está debajo. Si alguno quedó mal, corregilo acá.
          </div>

          <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #1e1e1e' }}>
            {leidas.map((l, i) => (
              <div key={l.estacion} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px',
                borderBottom: '1px solid #141414', ...mono,
              }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, color: '#ccc' }}>{l.estacion}</span>
                  <span style={{ display: 'block', fontSize: 11, color: '#4a4a4a',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    …{l.contexto}…
                  </span>
                </span>
                <input type="number" value={l.mm} min={0} max={600} step={0.1}
                  onChange={e => {
                    const v = parseFloat(e.target.value)
                    setLeidas(prev => prev!.map((x, j) => j === i ? { ...x, mm: isNaN(v) ? 0 : v } : x))
                  }}
                  style={{ ...inp, width: 74, textAlign: 'right' }} />
                <span style={{ fontSize: 12, color: '#555', width: 20 }}>mm</span>
                <button onClick={() => setLeidas(prev => prev!.filter((_, j) => j !== i))}
                  title="Descartar esta lectura"
                  style={{ ...mono, fontSize: 13, cursor: 'pointer', padding: '2px 8px',
                    background: 'transparent', border: '1px solid #252525', color: '#555' }}>✕</button>
              </div>
            ))}
          </div>

          {desconocidas.length > 0 && (
            <div style={{
              ...mono, fontSize: 12, color: '#E8833A', background: '#1a1206',
              border: '1px solid #5a3a00', padding: '8px 11px', marginTop: 10, lineHeight: 1.5,
            }}>
              El parte menciona localidades que no están en la lista de estaciones, así que
              esas mediciones no se guardan: {desconocidas.map(d => `${d.nombre} (${d.mm} mm)`).join(', ')}.
              Para incluirlas hay que agregarlas con sus coordenadas.
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={guardar} disabled={ocupado}
              style={{
                ...mono, fontSize: 13, padding: '7px 18px', fontWeight: 700,
                cursor: ocupado ? 'default' : 'pointer', background: 'transparent',
                border: '1px solid #2e6b3e', color: '#7BC47F',
              }}>
              {ocupado ? 'Guardando…' : `Guardar ${leidas.length} mediciones`}
            </button>
            <button onClick={() => { setLeidas(null); setDesconocidas([]) }}
              style={{
                ...mono, fontSize: 13, padding: '7px 16px', cursor: 'pointer',
                background: 'transparent', border: '1px solid #252525', color: '#666',
              }}>Descartar</button>
          </div>
        </div>
      )}

      {error && (
        <div style={{ ...mono, fontSize: 13, color: '#E57373', background: '#1a0c0c',
          border: '1px solid #5a2222', padding: '8px 12px', marginBottom: 12 }}>{error}</div>
      )}
      {aviso && (
        <div style={{ ...mono, fontSize: 13, color: '#7BC47F', background: '#0a1408',
          border: '1px solid #2e6b3e', padding: '8px 12px', marginBottom: 12 }}>{aviso}</div>
      )}
    </div>
  )
}
