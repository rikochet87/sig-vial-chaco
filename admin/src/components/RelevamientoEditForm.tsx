'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Relevamiento } from '@/types'

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtFecha(s: string | null) {
  if (!s) return '-'
  return s.split('T')[0]
}

const ZONAS = ['ZI', 'ZII', 'ZIII', 'ZIV', 'ZV', 'ZVI']
const ESTADOS: string[] = ['Bueno', 'Regular', 'Malo']

// ── small form primitives ─────────────────────────────────────────────────────

const field: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4,
}
const label: React.CSSProperties = {
  color: '#9E9E9E', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5,
}
const input: React.CSSProperties = {
  background: '#1a1a1a', border: '1px solid #252525',
  color: '#e0e0e0', fontSize: 12, padding: '8px 10px', outline: 'none', width: '100%',
}
const select: React.CSSProperties = { ...input, cursor: 'pointer' }
const textarea: React.CSSProperties = {
  ...input, resize: 'vertical', minHeight: 80, fontFamily: 'inherit',
}
const grid2: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12,
}
const sectionCard: React.CSSProperties = {
  background: '#191919', border: '1px solid #1e1e1e', padding: '16px 20px', marginBottom: 12,
}
const sectionTitle: React.CSSProperties = {
  color: '#F5C300', fontSize: 11, fontWeight: 700, marginBottom: 14,
  textTransform: 'uppercase', letterSpacing: 1.5,
}

// ── read-only cell ────────────────────────────────────────────────────────────

function ROCell({ label: l, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <div style={label}>{l}</div>
      <div style={{ color: '#fff', fontSize: 14 }}>{String(value ?? '-')}</div>
    </div>
  )
}

// ── LinealCard (read-only) ────────────────────────────────────────────────────

function LinealCard({ data }: { data: Record<string, unknown> | null | undefined }) {
  if (!data) return null
  const ancho    = parseFloat(String(data.ancho    ?? '')) || 0
  const espesor  = parseFloat(String(data.espesor  ?? '')) || 0
  const longitud = parseFloat(String(data.longitud ?? '')) || 0
  const toneladas = ancho > 0 && espesor > 0 && longitud > 0
    ? (ancho * longitud * espesor * 2.1).toFixed(2) : null
  const cellStyle: React.CSSProperties = { background: '#3C3C3C', borderRadius: 8, padding: '12px 16px' }
  const labelSt: React.CSSProperties  = { color: '#9E9E9E', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }
  const valueSt: React.CSSProperties  = { color: '#fff', fontSize: 18, fontWeight: 700 }
  const unitSt: React.CSSProperties   = { color: '#9E9E9E', fontSize: 12, marginLeft: 4 }
  return (
    <div style={{ background: '#2C2C2C', borderRadius: 10, padding: 20, marginBottom: 16 }}>
      <h3 style={sectionTitle}>Datos Lineal</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        {ancho > 0 && <div style={cellStyle}><div style={labelSt}>Ancho</div><div style={valueSt}>{ancho}<span style={unitSt}>m</span></div></div>}
        {espesor > 0 && <div style={cellStyle}><div style={labelSt}>Espesor</div><div style={valueSt}>{espesor}<span style={unitSt}>m</span></div></div>}
        {longitud > 0 && <div style={cellStyle}><div style={labelSt}>Longitud</div><div style={valueSt}>{longitud.toLocaleString('es-AR')}<span style={unitSt}>m</span></div></div>}
        {!!data.empresa && <div style={cellStyle}><div style={labelSt}>Empresa</div><div style={{ color: '#fff', fontSize: 14 }}>{String(data.empresa)}</div></div>}
        {toneladas && (
          <div style={{ ...cellStyle, borderLeft: '3px solid #F5C300', gridColumn: 'span 2' }}>
            <div style={labelSt}>Toneladas estimadas</div>
            <div style={{ color: '#F5C300', fontSize: 22, fontWeight: 700 }}>
              {parseFloat(toneladas).toLocaleString('es-AR', { maximumFractionDigits: 2 })}
              <span style={unitSt}>t</span>
            </div>
            <div style={{ color: '#666', fontSize: 10, marginTop: 4 }}>
              {ancho}m × {longitud}m × {espesor}m × 2,1 t/m³
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── DataCard (read-only generic) ──────────────────────────────────────────────

function DataCard({ title, data }: { title: string; data: Record<string, unknown> | null | undefined }) {
  if (!data) return null
  const entries = Object.entries(data).filter(([, v]) => v !== null && v !== undefined && v !== '')
  if (entries.length === 0) return null
  return (
    <div style={sectionCard}>
      <h3 style={sectionTitle}>{title}</h3>
      <div style={grid2}>
        {entries.map(([k, v]) => (
          <ROCell key={k} label={k.replace(/_/g, ' ')} value={Array.isArray(v) ? v.join(', ') : (v as string | number)} />
        ))}
      </div>
    </div>
  )
}

// ── tipo-specific edit sections ───────────────────────────────────────────────

function EditLineal({
  data, onChange,
}: {
  data: Record<string, unknown>
  onChange: (d: Record<string, unknown>) => void
}) {
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...data, [k]: e.target.value })
  return (
    <div style={sectionCard}>
      <h3 style={sectionTitle}>Datos Lineal</h3>
      <div style={grid2}>
        <div style={field}>
          <span style={label}>Ancho (m)</span>
          <input style={input} value={String(data.ancho ?? '')} onChange={set('ancho')} placeholder="0" />
        </div>
        <div style={field}>
          <span style={label}>Espesor (m)</span>
          <input style={input} value={String(data.espesor ?? '')} onChange={set('espesor')} placeholder="0" />
        </div>
        <div style={field}>
          <span style={label}>Longitud (m)</span>
          <input style={input} value={String(data.longitud ?? '')} onChange={set('longitud')} placeholder="0" />
        </div>
        <div style={field}>
          <span style={label}>Empresa</span>
          <input style={input} value={String(data.empresa ?? '')} onChange={set('empresa')} placeholder="Empresa ejecutora" />
        </div>
        <div style={field}>
          <span style={label}>Fecha ejecución</span>
          <input style={input} value={String(data.fechaEjecucion ?? '')} onChange={set('fechaEjecucion')} placeholder="DD/MM/AAAA" />
        </div>
      </div>
    </div>
  )
}

function EditPuente({
  data, onChange,
}: {
  data: Record<string, unknown>
  onChange: (d: Record<string, unknown>) => void
}) {
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...data, [k]: e.target.value })
  return (
    <div style={sectionCard}>
      <h3 style={sectionTitle}>Datos Puente</h3>
      <div style={grid2}>
        <div style={field}><span style={label}>Longitud total (m)</span><input style={input} value={String(data.longitudTotal ?? '')} onChange={set('longitudTotal')} /></div>
        <div style={field}><span style={label}>H — altura libre (m)</span><input style={input} value={String(data.h ?? '')} onChange={set('h')} /></div>
        <div style={field}><span style={label}>J — ancho camino (m)</span><input style={input} value={String(data.j ?? '')} onChange={set('j')} /></div>
        <div style={field}><span style={label}>Tipo estructura</span><input style={input} value={String(data.tipoEstructura ?? '')} onChange={set('tipoEstructura')} placeholder="Madera, Hormigón, etc." /></div>
        <div style={field}>
          <span style={label}>Estado estructural</span>
          <select style={select} value={String(data.estadoEstructural ?? 'Regular')} onChange={set('estadoEstructural')}>
            {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div style={field}><span style={label}>Cantidad palizadas</span><input style={input} type="number" value={String(data.cantidadPalizadas ?? '')} onChange={set('cantidadPalizadas')} /></div>
        <div style={field}><span style={label}>Guía ruedas</span>
          <select style={select} value={data.guiaRuedas ? 'true' : 'false'} onChange={e => onChange({ ...data, guiaRuedas: e.target.value === 'true' })}>
            <option value="false">No</option><option value="true">Sí</option>
          </select>
        </div>
        {!!data.guiaRuedas && (
          <div style={field}>
            <span style={label}>Estado guía ruedas</span>
            <select style={select} value={String(data.estadoGuiaRuedas ?? 'Regular')} onChange={set('estadoGuiaRuedas')}>
              {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
        )}
        <div style={field}><span style={label}>Barandas</span>
          <select style={select} value={data.barandas ? 'true' : 'false'} onChange={e => onChange({ ...data, barandas: e.target.value === 'true' })}>
            <option value="false">No</option><option value="true">Sí</option>
          </select>
        </div>
        {!!data.barandas && (
          <div style={field}><span style={label}>H barandas (m)</span><input style={input} value={String(data.hBarandas ?? '')} onChange={set('hBarandas')} /></div>
        )}
      </div>
    </div>
  )
}

function EditAlcantarilla({
  data, onChange,
}: {
  data: Record<string, unknown>
  onChange: (d: Record<string, unknown>) => void
}) {
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...data, [k]: e.target.value })
  return (
    <div style={sectionCard}>
      <h3 style={sectionTitle}>Datos Alcantarilla</h3>
      <div style={grid2}>
        <div style={field}><span style={label}>Longitud total (m)</span><input style={input} value={String(data.longitudTotal ?? '')} onChange={set('longitudTotal')} /></div>
        <div style={field}><span style={label}>Cantidad luces</span><input style={input} value={String(data.cantidadLuces ?? '')} onChange={set('cantidadLuces')} /></div>
        <div style={field}><span style={label}>Longitud luces (m)</span><input style={input} value={String(data.longitudLuces ?? '')} onChange={set('longitudLuces')} /></div>
        <div style={field}><span style={label}>Ancho total (m)</span><input style={input} value={String(data.anchoTotal ?? '')} onChange={set('anchoTotal')} /></div>
        <div style={field}><span style={label}>Ancho calzada (m)</span><input style={input} value={String(data.anchoCalzada ?? '')} onChange={set('anchoCalzada')} /></div>
        <div style={field}><span style={label}>H — altura (m)</span><input style={input} value={String(data.h ?? '')} onChange={set('h')} /></div>
        <div style={field}><span style={label}>Materiales alas</span><input style={input} value={String(data.materialesAlas ?? '')} onChange={set('materialesAlas')} /></div>
        <div style={field}><span style={label}>Longitud alas (m)</span><input style={input} value={String(data.longitudAlas ?? '')} onChange={set('longitudAlas')} /></div>
        <div style={field}>
          <span style={label}>Estado estructural</span>
          <select style={select} value={String(data.estadoEstructural ?? 'Regular')} onChange={set('estadoEstructural')}>
            {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div style={field}><span style={label}>Situación hidráulica</span><input style={input} value={String(data.situacionHidraulica ?? '')} onChange={set('situacionHidraulica')} /></div>
      </div>
    </div>
  )
}

function EditTubos({
  data, onChange,
}: {
  data: Record<string, unknown>
  onChange: (d: Record<string, unknown>) => void
}) {
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...data, [k]: e.target.value })
  return (
    <div style={sectionCard}>
      <h3 style={sectionTitle}>Datos Tubos</h3>
      <div style={grid2}>
        <div style={field}><span style={label}>J — ancho (m)</span><input style={input} value={String(data.jAncho ?? '')} onChange={set('jAncho')} /></div>
        <div style={field}><span style={label}>D — diámetro</span><input style={input} value={String(data.d ?? '')} onChange={set('d')} /></div>
        <div style={field}><span style={label}>Cabezales</span><input style={input} value={String(data.cabezales ?? '')} onChange={set('cabezales')} /></div>
        <div style={field}><span style={label}>Tapada</span><input style={input} value={String(data.tapada ?? '')} onChange={set('tapada')} /></div>
        <div style={field}><span style={label}>Cantidad</span><input style={input} type="number" value={String(data.cantidad ?? '')} onChange={set('cantidad')} /></div>
      </div>
    </div>
  )
}

function EditOtro({
  data, onChange,
}: {
  data: Record<string, unknown>
  onChange: (d: Record<string, unknown>) => void
}) {
  return (
    <div style={sectionCard}>
      <h3 style={sectionTitle}>Descripción</h3>
      <textarea
        style={textarea}
        value={String(data.descripcion ?? '')}
        onChange={e => onChange({ ...data, descripcion: e.target.value })}
        placeholder="Descripción libre..."
      />
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────

interface Props {
  rel: Relevamiento
  tecnicoNombre: string
}

export default function RelevamientoEditForm({ rel, tecnicoNombre }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [fecha, setFecha]               = useState(fmtFecha(rel.fecha))
  const [estadoCalzada, setEstadoCalzada] = useState(rel.estado_calzada ?? '')
  const [rutaTramo, setRutaTramo]       = useState(rel.ruta_tramo ?? '')
  const [zona, setZona]                 = useState(rel.zona ?? '')
  const [ccAsociado, setCcAsociado]     = useState(rel.cc_asociado ?? '')
  const [observaciones, setObservaciones] = useState(rel.observaciones ?? '')
  const [datosEsp, setDatosEsp] = useState<Relevamiento['datos_especificos']>(
    rel.datos_especificos ?? {}
  )

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/relevamientos/${rel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha: fecha || null,
          estado_calzada: estadoCalzada || null,
          ruta_tramo: rutaTramo || null,
          zona: zona || null,
          cc_asociado: ccAsociado || null,
          observaciones: observaciones || null,
          datos_especificos: datosEsp,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al guardar')
      setEditing(false)
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setFecha(fmtFecha(rel.fecha))
    setEstadoCalzada(rel.estado_calzada ?? '')
    setRutaTramo(rel.ruta_tramo ?? '')
    setZona(rel.zona ?? '')
    setCcAsociado(rel.cc_asociado ?? '')
    setObservaciones(rel.observaciones ?? '')
    setDatosEsp(rel.datos_especificos ?? {})
    setError(null)
    setEditing(false)
  }

  // ── READ-ONLY VIEW ────────────────────────────────────────────────────────

  if (!editing) {
    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button
            onClick={() => setEditing(true)}
            className="glow-y"
            style={{
              background: '#F5C300', color: '#111', border: 'none',
              padding: '9px 18px', fontWeight: 700,
              fontSize: 11, cursor: 'pointer', letterSpacing: 1,
            }}
          >
            EDITAR
          </button>
        </div>

        <div style={sectionCard}>
          <div style={grid2}>
            <ROCell label="Fecha"         value={fmtFecha(rel.fecha)} />
            <ROCell label="Técnico"       value={tecnicoNombre} />
            <ROCell label="Ruta / Tramo"  value={rel.ruta_tramo} />
            <ROCell label="Estado calzada" value={rel.estado_calzada} />
            <ROCell label="Zona"          value={rel.zona} />
            <ROCell label="Consorcio"     value={rel.cc_asociado} />
            <ROCell label="Sincronizado"  value={rel.sincronizado_en ? new Date(rel.sincronizado_en).toLocaleString('es-AR') : 'pendiente'} />
          </div>
        </div>

        {rel.observaciones && (
          <div style={sectionCard}>
            <div style={label}>Observaciones</div>
            <div style={{ color: '#fff', fontSize: 14, lineHeight: 1.6, marginTop: 8 }}>{rel.observaciones}</div>
          </div>
        )}

        <DataCard title="Datos Puente"       data={rel.datos_especificos?.puente as Record<string, unknown>} />
        <DataCard title="Datos Alcantarilla" data={rel.datos_especificos?.alcantarilla as Record<string, unknown>} />
        <DataCard title="Datos Tubos"        data={rel.datos_especificos?.tubos as Record<string, unknown>} />
        <LinealCard                           data={rel.datos_especificos?.ripio as Record<string, unknown>} />
        <DataCard title="Otros datos"        data={rel.datos_especificos?.otro as Record<string, unknown>} />
      </>
    )
  }

  // ── EDIT VIEW ────────────────────────────────────────────────────────────

  return (
    <>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          className="glow-y"
          style={{
            background: '#F5C300', color: '#111', border: 'none',
            padding: '9px 20px', fontWeight: 700,
            fontSize: 11, cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.6 : 1, letterSpacing: 1,
          }}
        >
          {saving ? 'GUARDANDO...' : 'GUARDAR'}
        </button>
        <button
          onClick={handleCancel}
          disabled={saving}
          className="glow-g"
          style={{
            background: 'transparent', color: '#555', border: '1px solid #252525',
            padding: '9px 20px', fontWeight: 500,
            fontSize: 11, cursor: 'pointer', letterSpacing: 0.5,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#3a3a3a'; (e.currentTarget as HTMLButtonElement).style.color = '#888' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#252525'; (e.currentTarget as HTMLButtonElement).style.color = '#555' }}
        >
          Cancelar
        </button>
        {error && <span style={{ color: '#e74c3c', fontSize: 13 }}>⚠️ {error}</span>}
      </div>

      <div style={sectionCard}>
        <h3 style={sectionTitle}>Información general</h3>
        <div style={grid2}>
          <div style={field}>
            <span style={label}>Fecha</span>
            <input style={input} type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
          </div>
          <div style={field}>
            <span style={label}>Estado calzada</span>
            <select style={select} value={estadoCalzada} onChange={e => setEstadoCalzada(e.target.value)}>
              <option value="">— seleccionar —</option>
              {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div style={field}>
            <span style={label}>Zona</span>
            <select style={select} value={zona} onChange={e => setZona(e.target.value)}>
              <option value="">— seleccionar —</option>
              {ZONAS.map(z => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>
          <div style={field}>
            <span style={label}>Ruta / Tramo</span>
            <input style={input} value={rutaTramo} onChange={e => setRutaTramo(e.target.value)} placeholder="Ruta o tramo" />
          </div>
          <div style={field}>
            <span style={label}>Consorcio</span>
            <input style={input} value={ccAsociado} onChange={e => setCcAsociado(e.target.value)} placeholder="Nombre del consorcio" />
          </div>
          <div style={field}>
            <span style={label}>Tipo</span>
            <div style={{ color: '#F5C300', fontSize: 14, fontWeight: 700, paddingTop: 8 }}>{rel.tipo}</div>
          </div>
          <div style={field}>
            <span style={label}>Técnico</span>
            <div style={{ color: '#fff', fontSize: 14, paddingTop: 8 }}>{tecnicoNombre}</div>
          </div>
        </div>
      </div>

      <div style={sectionCard}>
        <h3 style={sectionTitle}>Observaciones</h3>
        <textarea
          style={textarea}
          value={observaciones}
          onChange={e => setObservaciones(e.target.value)}
          placeholder="Observaciones del técnico..."
        />
      </div>

      {rel.tipo === 'Lineal' && (
        <EditLineal
          data={(datosEsp?.ripio ?? {}) as Record<string, unknown>}
          onChange={d => setDatosEsp(prev => ({ ...prev, ripio: d }))}
        />
      )}
      {rel.tipo === 'Puente' && (
        <EditPuente
          data={(datosEsp?.puente ?? {}) as Record<string, unknown>}
          onChange={d => setDatosEsp(prev => ({ ...prev, puente: d }))}
        />
      )}
      {rel.tipo === 'Alcantarilla' && (
        <EditAlcantarilla
          data={(datosEsp?.alcantarilla ?? {}) as Record<string, unknown>}
          onChange={d => setDatosEsp(prev => ({ ...prev, alcantarilla: d }))}
        />
      )}
      {rel.tipo === 'Tubos' && (
        <EditTubos
          data={(datosEsp?.tubos ?? {}) as Record<string, unknown>}
          onChange={d => setDatosEsp(prev => ({ ...prev, tubos: d }))}
        />
      )}
      {rel.tipo === 'Otro' && (
        <EditOtro
          data={(datosEsp?.otro ?? {}) as Record<string, unknown>}
          onChange={d => setDatosEsp(prev => ({ ...prev, otro: d }))}
        />
      )}
    </>
  )
}
