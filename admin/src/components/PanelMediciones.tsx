'use client'
/**
 * Cargar partes de la APA y ver cuánto se equivoca el modelo.
 *
 * El parte se publica en prosa, así que el flujo es pegar el texto, revisar lo
 * que el lector entendió y recién ahí guardar. El paso de revisión no es
 * decorativo: el lector acierta 43 de 43 en el parte de referencia, pero cada
 * nota está redactada distinto y conviene mirar antes de meter un número que
 * después se va a usar para corregir el modelo.
 *
 * Abajo, las métricas acumuladas. Mientras haya un solo evento no se puede
 * corregir nada —cualquier factor estaría ajustado al ruido de ese día— y el
 * panel lo dice en vez de mostrar un número que parezca respuesta.
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
  const ev = precision?.evaluacion

  return (
    <div style={{ padding: '4px 0 20px' }}>

      {/* ── Precisión actual ── */}
      <div style={caja}>
        <div style={{ ...lbl, marginBottom: 10 }}>Qué tan cerca está el modelo</div>

        {!precision || precision.mediciones === 0 ? (
          <div style={{ ...mono, fontSize: 13, color: '#777', lineHeight: 1.6 }}>
            Todavía no hay mediciones cargadas. Cargá el parte de la APA después de
            cada lluvia y acá vas a ver cuánto se equivoca el modelo.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
              {[
                { l: 'Mediciones', v: String(precision.mediciones), c: '#90A4AE' },
                { l: 'Eventos',    v: String(precision.eventos),    c: '#90A4AE' },
                { l: 'Acierta si llovió', v: m ? `${Math.round(m.aciertoLlovioONo * 100)} %` : '—', c: '#7BC47F' },
                { l: 'Error típico', v: m ? `${m.errorAbsMedio} mm` : '—', c: '#E8833A' },
                { l: 'Sesgo', v: m?.sesgoRelativo != null
                    ? `${m.sesgoRelativo > 0 ? '+' : ''}${Math.round(m.sesgoRelativo * 100)} %` : '—',
                  c: '#E8833A' },
                { l: 'Ordena bien', v: m?.spearman != null ? String(m.spearman) : '—', c: '#4A90C2' },
              ].map(x => (
                <div key={x.l} style={{ background: '#111', border: '1px solid #222',
                  borderLeft: `3px solid ${x.c}`, padding: '7px 12px' }}>
                  <div style={{ ...mono, fontSize: 11, color: '#555', textTransform: 'uppercase',
                    letterSpacing: 0.8 }}>{x.l}</div>
                  <div style={{ ...mono, fontSize: 15, fontWeight: 700, color: x.c, marginTop: 2 }}>{x.v}</div>
                </div>
              ))}
            </div>

            {/* Corrección: sólo si se probó fuera de muestra */}
            <div style={{
              ...mono, fontSize: 13, lineHeight: 1.6, padding: '9px 12px',
              background: ev?.mejora ? '#0a1408' : '#151005',
              border: `1px solid ${ev?.mejora ? '#2e6b3e' : '#4a3a00'}`,
              color: ev?.mejora ? '#7BC47F' : '#C9A227',
            }}>
              {precision.eventos < 4 ? (
                <>Con {precision.eventos} evento{precision.eventos === 1 ? '' : 's'} no se puede
                corregir el sesgo: cualquier factor estaría ajustado al ruido de esos días.
                Hacen falta al menos cuatro para poder ajustar con unos y probar con otros.</>
              ) : ev == null ? (
                <>Todavía no hay suficientes pares comparables para evaluar una corrección.</>
              ) : ev.mejora ? (
                <>Corrección sugerida: multiplicar por <b>{ev.factor}</b>. Ajustada con{' '}
                {ev.eventosAjuste} eventos y probada en los {ev.eventosPrueba} restantes, el error
                típico baja de <b>{ev.antes.errorAbsMedio}</b> a <b>{ev.despues.errorAbsMedio} mm</b>.</>
              ) : (
                <>El factor <b>{ev.factor}</b> no mejora fuera de muestra (el error va de{' '}
                {ev.antes.errorAbsMedio} a {ev.despues.errorAbsMedio} mm), así que no conviene
                aplicarlo. El sesgo todavía no es estable.</>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Importar de la APA ── */}
      {esAdmin && (
        <div style={caja}>
          <div style={{ ...lbl, marginBottom: 6 }}>Traer los partes de la APA</div>
          <div style={{ ...mono, fontSize: 12, color: '#666', marginBottom: 10, lineHeight: 1.55 }}>
            La APA publica sus mediciones en <b style={{ color: '#888' }}>mapas.apachaco.gob.ar</b> y
            se pueden leer directo, sin transcribir nada. Trae sólo las fechas que
            todavía no estén cargadas, de a {25} por vez, y consulta el modelo en la
            coordenada de cada estación para dejar la comparación armada.
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
            <div style={{ ...mono, fontSize: 12, color: '#8fb98f', marginTop: 10, lineHeight: 1.6 }}>
              {resumenImp}
            </div>
          )}
        </div>
      )}

      {/* ── Cargar un parte a mano ── */}
      {esAdmin && (
        <div style={caja}>
          <div style={{ ...lbl, marginBottom: 6 }}>Cargar un parte a mano</div>
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
