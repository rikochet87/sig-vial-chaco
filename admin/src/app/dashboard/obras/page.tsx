'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

const TIPOS = ['', 'terraplen', 'excavacion', 'ripio', 'canal', 'limpieza'] as const
const ESTADOS = ['', 'planificada', 'en_curso', 'ejecutada'] as const

const TIPO_LABELS: Record<string, string> = {
  terraplen: 'Terraplén', excavacion: 'Excavación', ripio: 'Ripio',
  canal: 'Canal', limpieza: 'Limpieza Vial',
}
const TIPO_COLORS: Record<string, string> = {
  terraplen: '#8D6E63', excavacion: '#FF7043', ripio: '#90A4AE',
  canal: '#29B6F6', limpieza: '#66BB6A',
}
const ESTADO_LABELS: Record<string, string> = {
  planificada: 'Planificada', en_curso: 'En curso', ejecutada: 'Ejecutada',
}
const ESTADO_COLORS: Record<string, string> = {
  planificada: '#F5C300', en_curso: '#4CAF50', ejecutada: '#2196F3',
}
const JURIS_LABELS: Record<string, string> = {
  consorcio: 'Consorcio', ruta_provincial: 'Ruta Provincial',
  metropolitana: 'Metropolitana', otra: 'Otra',
}

const PAGE_SIZE = 20

interface Obra {
  id: string
  tipo: string
  jurisdiccion: string
  consorcio_numero: number | null
  ubicacion: string | null
  descripcion: string | null
  estado: string
  fecha_inicio: string | null
  fecha_fin_estimada: string | null
  cantidad: number | null
  unidad: string | null
  presupuesto_total: number | null
  aporte_dvp: number | null
  aporte_ccc: number | null
  precio_unitario: number | null
  created_at: string
}

const mono: React.CSSProperties = { fontFamily: 'monospace' }
const selectStyle: React.CSSProperties = {
  background: '#1a1a1a', border: '1px solid #252525', color: '#e0e0e0',
  padding: '6px 10px', fontSize: 12,
}
const labelStyle: React.CSSProperties = {
  color: '#555', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase',
}
const wrapStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 }

function fmt(n: number | null) {
  if (n == null) return '-'
  return n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export default function ObrasPage() {
  const router = useRouter()
  const [obras, setObras] = useState<Obra[]>([])
  const [filtered, setFiltered] = useState<Obra[]>([])
  const [loading, setLoading] = useState(true)
  const [tipo, setTipo] = useState('')
  const [estado, setEstado] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [page, setPage] = useState(0)

  useEffect(() => {
    fetch('/api/obras')
      .then(r => r.json())
      .then((data: Obra[]) => {
        setObras(data ?? [])
        setFiltered(data ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const applyFilters = useCallback(() => {
    let rows = obras
    if (tipo)  rows = rows.filter(o => o.tipo === tipo)
    if (estado) rows = rows.filter(o => o.estado === estado)
    if (desde) rows = rows.filter(o => (o.fecha_inicio ?? o.created_at) >= desde)
    if (hasta) rows = rows.filter(o => (o.fecha_inicio ?? o.created_at) <= hasta)
    setFiltered(rows)
    setPage(0)
  }, [obras, tipo, estado, desde, hasta])

  useEffect(() => { applyFilters() }, [applyFilters])

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('¿Eliminar esta obra? Esta acción no se puede deshacer.')) return
    await fetch(`/api/obras?id=${id}`, { method: 'DELETE' })
    setObras(prev => prev.filter(o => o.id !== id))
  }

  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)

  // Totales del filtro actual
  const totalPresupuesto = filtered.reduce((s, o) => s + (o.presupuesto_total ?? 0), 0)
  const totalDVP         = filtered.reduce((s, o) => s + (o.aporte_dvp ?? 0), 0)
  const totalCCC         = filtered.reduce((s, o) => s + (o.aporte_ccc ?? 0), 0)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <h1 style={{ color: '#e0e0e0', fontSize: 20, fontWeight: 700, letterSpacing: 0.5, ...mono, margin: 0 }}>
          Obras
        </h1>
        <span style={{ color: '#333', fontSize: 12, ...mono }}>{filtered.length} registros</span>
      </div>

      {/* Filtros */}
      <div style={{ background: '#191919', border: '1px solid #1e1e1e', padding: '14px 18px',
        marginBottom: 16, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={wrapStyle}>
          <label style={labelStyle}>Tipo</label>
          <select value={tipo} onChange={e => setTipo(e.target.value)} style={selectStyle}>
            <option value="">Todos</option>
            {TIPOS.filter(Boolean).map(t => (
              <option key={t} value={t}>{TIPO_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div style={wrapStyle}>
          <label style={labelStyle}>Estado</label>
          <select value={estado} onChange={e => setEstado(e.target.value)} style={selectStyle}>
            <option value="">Todos</option>
            {ESTADOS.filter(Boolean).map(s => (
              <option key={s} value={s}>{ESTADO_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <div style={wrapStyle}>
          <label style={labelStyle}>Desde</label>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={selectStyle} />
        </div>
        <div style={wrapStyle}>
          <label style={labelStyle}>Hasta</label>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={selectStyle} />
        </div>
      </div>

      {/* Totales */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          {[
            { label: 'Presupuesto total', val: totalPresupuesto, color: '#F5C300' },
            { label: 'Aporte DVP',        val: totalDVP,         color: '#4CAF50' },
            { label: 'Aporte CCC',        val: totalCCC,         color: '#2196F3' },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ background: '#191919', border: '1px solid #1e1e1e',
              borderLeft: `3px solid ${color}`, padding: '8px 14px' }}>
              <div style={{ color: '#555', fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', ...mono }}>{label}</div>
              <div style={{ color, fontSize: 16, fontWeight: 700, ...mono, marginTop: 2 }}>
                ${fmt(val)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabla */}
      <div style={{ background: '#191919', border: '1px solid #1e1e1e', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#444', ...mono }}>Cargando...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#141414' }}>
                {['Tipo', 'Consorcio / Ubicación', 'Tramo / Desc.', 'Cantidad', 'Presupuesto', 'DVP', 'CCC', 'Estado', 'Fecha inicio', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', color: '#444', fontSize: 10, fontWeight: 600,
                    textAlign: 'left', textTransform: 'uppercase', letterSpacing: 1,
                    borderBottom: '1px solid #1e1e1e', whiteSpace: 'nowrap', ...mono }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((o, i) => {
                const color = TIPO_COLORS[o.tipo] ?? '#607D8B'
                const estadoColor = ESTADO_COLORS[o.estado] ?? '#555'
                const lugar = o.consorcio_numero
                  ? `CC Nº ${o.consorcio_numero}`
                  : (o.ubicacion ?? JURIS_LABELS[o.jurisdiccion] ?? '-')
                return (
                  <tr key={o.id}
                    style={{ borderBottom: '1px solid #1e1e1e', cursor: 'default',
                      background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(245,195,0,0.04)')}
                    onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)')}
                  >
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ background: `${color}22`, color, border: `1px solid ${color}55`,
                        borderRadius: 2, padding: '2px 8px', fontSize: 11, fontWeight: 700, ...mono,
                        whiteSpace: 'nowrap' }}>
                        {TIPO_LABELS[o.tipo] ?? o.tipo}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', color: '#aaa', fontSize: 12, ...mono,
                      maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {lugar}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#666', fontSize: 11, ...mono,
                      maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {o.descripcion ?? '-'}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#888', fontSize: 12, ...mono, whiteSpace: 'nowrap' }}>
                      {o.cantidad != null ? `${o.cantidad.toLocaleString('es-AR', { maximumFractionDigits: 2 })} ${o.unidad ?? ''}` : '-'}
                    </td>
                    <td style={{ padding: '10px 14px', color, fontSize: 12, fontWeight: 700, ...mono, whiteSpace: 'nowrap' }}>
                      {o.presupuesto_total != null ? `$${fmt(o.presupuesto_total)}` : '-'}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#4CAF50', fontSize: 12, ...mono, whiteSpace: 'nowrap' }}>
                      {o.aporte_dvp != null ? `$${fmt(o.aporte_dvp)}` : '-'}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#2196F3', fontSize: 12, ...mono, whiteSpace: 'nowrap' }}>
                      {o.aporte_ccc != null ? `$${fmt(o.aporte_ccc)}` : '-'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ background: `${estadoColor}22`, color: estadoColor,
                        border: `1px solid ${estadoColor}55`, borderRadius: 20,
                        padding: '2px 10px', fontSize: 11, fontWeight: 600, ...mono }}>
                        {ESTADO_LABELS[o.estado] ?? o.estado}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', color: '#555', fontSize: 12, ...mono, whiteSpace: 'nowrap' }}>
                      {o.fecha_inicio ?? '-'}
                    </td>
                    <td style={{ padding: '8px 12px' }} onClick={e => e.stopPropagation()}>
                      <button
                        onClick={e => handleDelete(o.id, e)}
                        title="Eliminar"
                        style={{ background: 'transparent', border: '1px solid #252525', color: '#444',
                          padding: '4px 10px', fontSize: 11, lineHeight: 1, cursor: 'pointer' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#f44336'; (e.currentTarget as HTMLButtonElement).style.color = '#f44336' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#252525'; (e.currentTarget as HTMLButtonElement).style.color = '#444' }}
                      >✕</button>
                    </td>
                  </tr>
                )
              })}
              {paged.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ padding: 40, textAlign: 'center', color: '#444', ...mono }}>
                    {obras.length === 0 ? 'No hay obras guardadas todavía.' : 'Sin resultados para los filtros aplicados.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {/* Paginación */}
        {totalPages > 1 && (
          <div style={{ padding: '10px 16px', display: 'flex', gap: 8, alignItems: 'center',
            borderTop: '1px solid #1e1e1e' }}>
            <span style={{ color: '#444', fontSize: 12, ...mono }}>{filtered.length} resultados</span>
            <div style={{ flex: 1 }} />
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
              style={{ background: '#1e1e1e', border: '1px solid #252525',
                color: page === 0 ? '#333' : '#888', padding: '6px 14px',
                cursor: page === 0 ? 'not-allowed' : 'pointer', opacity: page === 0 ? 0.4 : 1, ...mono, fontSize: 12 }}>
              ← Anterior
            </button>
            <span style={{ color: '#444', fontSize: 12, ...mono }}>Pág {page + 1} / {totalPages}</span>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
              style={{ background: '#1e1e1e', border: '1px solid #252525',
                color: page >= totalPages - 1 ? '#333' : '#888', padding: '6px 14px',
                cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer',
                opacity: page >= totalPages - 1 ? 0.4 : 1, ...mono, fontSize: 12 }}>
              Siguiente →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
