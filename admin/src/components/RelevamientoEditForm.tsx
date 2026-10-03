'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Relevamiento } from '@/types'
import { esGabinete } from '@/lib/relevamientoOrigen'
import {
  ZONAS, ESTADOS, field, label, input, select, textarea, grid2, sectionCard, sectionTitle,
  EditLineal, EditPuente, EditAlcantarilla, EditTubos, EditOtro,
} from '@/components/relevamiento/editores'

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtFecha(s: string | null) {
  if (!s) return '-'
  return s.split('T')[0]
}

// ── Vista de sólo lectura ────────────────────────────────────────────────────

function ROCell({ label: l, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <div style={label}>{l}</div>
      <div style={{ color: '#fff', fontSize: 14 }}>{value === null || value === undefined || value === '' ? '-' : String(value)}</div>
    </div>
  )
}

/**
 * Cómo se llama en pantalla cada campo de `datos_especificos`. Antes la ficha
 * mostraba el nombre interno —«longitudTotal», «hBarandas»—; lo que no está
 * acá se sigue mostrando así, que es mejor que esconderlo.
 */
const ROTULOS: Record<string, string> = {
  longitudTotal: 'Longitud total (m)', cantidadPalizadas: 'Palizadas', lucesPalizadas: 'Luces de vanos (m)',
  h: 'H — altura (m)', j: 'J — ancho camino (m)', tipoEstructura: 'Tipo estructura',
  guiaRuedas: 'Guía ruedas', estadoGuiaRuedas: 'Estado guía ruedas', barandas: 'Barandas',
  hBarandas: 'H barandas (m)', estadoEstructural: 'Estado estructural',
  cantidadLuces: 'Cantidad luces', longitudLuces: 'Longitud luces (m)', anchoTotal: 'Ancho total (m)',
  anchoCalzada: 'Ancho calzada (m)', materialesAlas: 'Materiales alas', longitudAlas: 'Longitud alas (m)',
  tableroMaterial: 'Tablero — material', tableroEstado: 'Tablero — estado', losaFondoEstado: 'Losa de fondo',
  situacionHidraulica: 'Situación hidráulica',
  jAncho: 'J — ancho (m)', d: 'D — diámetro', cabezales: 'Cabezales', tapada: 'Tapada', cantidad: 'Cantidad',
  descripcion: 'Descripción',
  subtipo: 'Subtipo', ancho: 'Ancho (m)', longitud: 'Longitud (m)', espesor: 'Espesor (m)',
  empresa: 'Empresa', fechaEjecucion: 'Fecha ejecución',
  esNuevo: 'Tramo nuevo', zonaTramo: 'Zona', ccNumeroTramo: 'N° de CC', numTramo: 'N° de tramo',
  nomenclatura: 'Nomenclatura',
  anchoCanal: 'Ancho (m)', profundidad: 'Profundidad (m)', longitudCanal: 'Longitud (m)',
  estadoLimpieza: 'Estado de limpieza', tiposObstruccion: 'Obstrucción',
}

/** Qué campos son de qué subtipo de lineal: uno de ripio no muestra los de canal */
const DE_SUBTIPO: Record<string, string[]> = {
  Ripio: ['ancho', 'longitud', 'espesor', 'empresa', 'fechaEjecucion'],
  Tramo: ['esNuevo', 'zonaTramo', 'ccNumeroTramo', 'numTramo', 'nomenclatura'],
  Canal: ['anchoCanal', 'profundidad', 'longitudCanal', 'estadoLimpieza', 'tiposObstruccion'],
}

const mostrar = (v: unknown): string =>
  typeof v === 'boolean' ? (v ? 'Sí' : 'No')
    : Array.isArray(v) ? v.filter(x => x !== '').join(' · ')
      : String(v)

function DataCard({ title, data, lineal = false }: {
  title: string; data: Record<string, unknown> | null | undefined; lineal?: boolean
}) {
  if (!data) return null
  const subtipo = lineal ? String(data.subtipo || 'Ripio') : null
  const propias = subtipo ? DE_SUBTIPO[subtipo] ?? null : null
  const entries = Object.entries(data).filter(([k, v]) =>
    k !== 'subtipo' && v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.some(x => x !== ''))
    && (!propias || propias.includes(k)))
  if (entries.length === 0) return null

  /*
   * En un ripio se muestra el volumen y no las toneladas. La tarjeta vieja
   * multiplicaba por 2,1 t/m³ fijo, y la densidad del ripio es por tramo y sin
   * valor por defecto: esas toneladas eran un número con apariencia de dato.
   * El volumen es geometría y no supone nada.
   */
  const n = (k: string) => parseFloat(String(data[k] ?? '').replace(',', '.')) || 0
  const volumen = subtipo === 'Ripio' ? n('ancho') * n('longitud') * n('espesor') : 0

  return (
    <div style={sectionCard}>
      <h3 style={sectionTitle}>{subtipo ? `${title} — ${subtipo}` : title}</h3>
      <div style={grid2}>
        {entries.map(([k, v]) => <ROCell key={k} label={ROTULOS[k] ?? k} value={mostrar(v)} />)}
        {volumen > 0 && (
          <div style={{ borderLeft: '3px solid #F5C300', paddingLeft: 10 }}>
            <div style={label}>Volumen (m³)</div>
            <div style={{ color: '#F5C300', fontSize: 16, fontWeight: 700, fontFamily: 'monospace' }}>
              {volumen.toLocaleString('es-AR', { maximumFractionDigits: 1 })}
            </div>
            <div style={{ color: '#8f8f8f', fontSize: 11 }}>ancho × longitud × espesor</div>
          </div>
        )}
      </div>
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
              fontSize: 13, cursor: 'pointer', letterSpacing: 1,
            }}
          >
            EDITAR
          </button>
        </div>

        <div style={sectionCard}>
          <div style={grid2}>
            <ROCell label="Fecha"         value={fmtFecha(rel.fecha)} />
            <ROCell label={esGabinete(rel) ? 'Cargado por' : 'Técnico'} value={tecnicoNombre} />
            <ROCell label="Ruta / Tramo"  value={rel.ruta_tramo} />
            <ROCell label="Estado calzada" value={rel.estado_calzada} />
            <ROCell label="Zona"          value={rel.zona} />
            <ROCell label="Consorcio"     value={rel.cc_asociado} />
            {esGabinete(rel)
              ? <ROCell label="Origen" value="Gabinete — cargado desde el panel" />
              : <ROCell label="Sincronizado" value={rel.sincronizado_en ? new Date(rel.sincronizado_en).toLocaleString('es-AR') : 'pendiente'} />}
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
        <DataCard title="Datos lineal"       data={rel.datos_especificos?.ripio as Record<string, unknown>} lineal />
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
            fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer',
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
            background: 'transparent', color: '#a0a0a0', border: '1px solid #2a2a2a',
            padding: '9px 20px', fontWeight: 500,
            fontSize: 13, cursor: 'pointer', letterSpacing: 0.5,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#3a3a3a'; (e.currentTarget as HTMLButtonElement).style.color = '#ccc' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#2a2a2a'; (e.currentTarget as HTMLButtonElement).style.color = '#a0a0a0' }}
        >
          Cancelar
        </button>
        {error && <span style={{ color: '#E57373', fontSize: 13 }}>{error}</span>}
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
