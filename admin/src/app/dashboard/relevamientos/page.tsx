'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { esGabinete } from '@/lib/relevamientoOrigen'
import type { Relevamiento } from '@/types'

const TIPOS = ['', 'Puente', 'Alcantarilla', 'Tubos', 'Lineal', 'Otro']
const ZONAS = ['', 'ZI', 'ZII', 'ZIII', 'ZIV', 'ZV']
const ROLES = [
  { value: '', label: 'Todos' },
  { value: 'tecnico', label: 'Técnico' },
  { value: 'usuario', label: 'Usuario' },
  { value: 'panel', label: 'Oficina' },
  { value: 'admin', label: 'Admin' },
]
const PAGE_SIZE = 20

function Etiqueta({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      color, border: `1px solid ${color}66`, borderRadius: 2, padding: '2px 7px',
      fontSize: 11, fontFamily: 'monospace', letterSpacing: 0.8, textTransform: 'uppercase', whiteSpace: 'nowrap',
    }}>{children}</span>
  )
}

/**
 * Antes la columna era «Sync» y decía sincronizado o pendiente. Con la carga de
 * gabinete hay una tercera procedencia, que no pasa por la sincronización de
 * la app: se muestra el origen, y pendiente queda como el caso del campo que
 * todavía no terminó de subir.
 */
function Origen({ r }: { r: Relevamiento }) {
  if (esGabinete(r)) return <Etiqueta color="#8fd0ff">Gabinete</Etiqueta>
  return r.sincronizado_en
    ? <Etiqueta color="#4CAF50">Campo</Etiqueta>
    : <Etiqueta color="#F5C300">Pendiente</Etiqueta>
}

export default function RelevamientosPage() {
  const router = useRouter()
  const [relevamientos, setRelevamientos] = useState<Relevamiento[]>([])
  const [filtered, setFiltered] = useState<Relevamiento[]>([])
  const [profileMap, setProfileMap] = useState<Record<string, string>>({})
  const [roleById, setRoleById] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [tipo, setTipo] = useState('')
  const [rolFilter, setRolFilter] = useState('')
  const [zona, setZona]     = useState('')
  const [origen, setOrigen] = useState<'' | 'campo' | 'gabinete'>('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [page, setPage] = useState(0)

  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase.from('relevamientos')
        .select('id,fecha,tipo,tecnico_id,estado_calzada,coords_lat,coords_lng,coords_linea,cc_asociado,zona,ruta_tramo,observaciones,fotos,datos_especificos,sincronizado_en')
        .order('fecha', { ascending: false }),
      fetch('/api/tecnicos').then(r => r.json()),
    ]).then(([{ data }, tecnicos]) => {
      const rows = (data as Relevamiento[]) ?? []
      setRelevamientos(rows)
      setFiltered(rows)
      const pm: Record<string, string> = {}
      const rm: Record<string, string> = {}
      ;(tecnicos as { id: string; nombre: string; rol: string }[]).forEach(p => {
        pm[p.id] = p.nombre
        rm[p.id] = p.rol
      })
      setProfileMap(pm)
      setRoleById(rm)
      setLoading(false)
    })
  }, [])

  const applyFilters = useCallback(() => {
    let rows = relevamientos
    if (tipo) rows = rows.filter(r => r.tipo === tipo)
    if (rolFilter) rows = rows.filter(r => r.tecnico_id ? roleById[r.tecnico_id] === rolFilter : false)
    if (zona) rows = rows.filter(r => r.zona === zona)
    if (origen) rows = rows.filter(r => esGabinete(r) === (origen === 'gabinete'))
    if (desde) rows = rows.filter(r => r.fecha >= desde)
    if (hasta) rows = rows.filter(r => r.fecha <= hasta)
    setFiltered(rows)
    setPage(0)
  }, [relevamientos, tipo, rolFilter, zona, origen, desde, hasta, roleById])

  useEffect(() => { applyFilters() }, [applyFilters])

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('¿Eliminar este relevamiento? Esta acción no se puede deshacer.')) return
    const supabase = createClient()
    const { error } = await supabase.from('relevamientos').delete().eq('id', id)
    if (error) { alert('Error: ' + error.message); return }
    setRelevamientos(prev => prev.filter(r => r.id !== id))
    setFiltered(prev => prev.filter(r => r.id !== id))
  }

  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)

  const selectStyle = { background: '#1a1a1a', border: '1px solid #252525', color: '#e0e0e0', padding: '6px 10px', fontSize: 13 }
  const labelStyle = { color: '#8f8f8f', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' as const }
  const wrapStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <h1 style={{ color: '#e0e0e0', fontSize: 20, fontWeight: 700, letterSpacing: 0.5 }}>Relevamientos</h1>
        <div style={{ flex: 1 }} />
        <Link href="/dashboard/relevamientos/nuevo" title="Cargar un relevamiento desde la computadora, sin ir al lugar" style={{
          border: '1px solid #F5C300', borderLeft: '3px solid #F5C300', background: '#F5C30014', color: '#F5C300',
          padding: '8px 14px', fontSize: 12, fontFamily: 'monospace', letterSpacing: 1, textTransform: 'uppercase',
          textDecoration: 'none', borderRadius: 2,
        }}>+ Nuevo de gabinete</Link>
      </div>

      {/* Filters */}
      <div style={{ background: '#191919', border: '1px solid #1e1e1e', padding: '14px 18px', marginBottom: 16, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={wrapStyle}>
          <label style={labelStyle}>Tipo</label>
          <select value={tipo} onChange={e => setTipo(e.target.value)} style={selectStyle}>
            {TIPOS.map(o => <option key={o} value={o}>{o || 'Todos'}</option>)}
          </select>
        </div>
        <div style={wrapStyle}>
          <label style={labelStyle}>Tipo de usuario</label>
          <select value={rolFilter} onChange={e => setRolFilter(e.target.value)} style={selectStyle}>
            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <div style={wrapStyle}>
          <label style={labelStyle}>Zona</label>
          <select value={zona} onChange={e => setZona(e.target.value)} style={selectStyle}>
            {ZONAS.map(o => <option key={o} value={o}>{o || 'Todas'}</option>)}
          </select>
        </div>
        <div style={wrapStyle}>
          <label style={labelStyle}>Origen</label>
          <select value={origen} onChange={e => setOrigen(e.target.value as typeof origen)} style={selectStyle}>
            <option value="">Todos</option>
            <option value="campo">Campo</option>
            <option value="gabinete">Gabinete</option>
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

      {/* Table */}
      <div style={{ background: '#191919', border: '1px solid #1e1e1e', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#8f8f8f' }}>Cargando…</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#141414' }}>
                {['Fecha', 'Tipo', 'Cargado por', 'Zona', 'Consorcio', 'Tramo', 'Estado', 'Origen', ''].map(h => (
                  <th key={h} style={{ padding: '10px 16px', color: '#8f8f8f', fontSize: 12, fontWeight: 600, textAlign: 'left', textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid #1e1e1e' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((r, i) => (
                <tr
                  key={r.id}
                  onClick={() => router.push(`/dashboard/relevamientos/${r.id}`)}
                  style={{
                    borderBottom: '1px solid #1e1e1e',
                    cursor: 'pointer',
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(245,195,0,0.05)')}
                  onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)')}
                >
                  <td style={{ padding: '10px 16px', color: '#a0a0a0', fontSize: 13, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{r.fecha?.split('T')[0] ?? '-'}</td>
                  <td style={{ padding: '10px 16px', color: '#F5C300', fontSize: 13, fontWeight: 600 }}>{r.tipo}</td>
                  <td style={{ padding: '10px 16px', color: '#e0e0e0', fontSize: 13, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.tecnico_id ? (profileMap[r.tecnico_id] ?? r.tecnico_id) : '-'}</td>
                  <td style={{ padding: '10px 16px', color: '#a0a0a0', fontSize: 13 }}>{r.zona || '-'}</td>
                  <td style={{ padding: '10px 16px', color: '#a0a0a0', fontSize: 13 }}>{r.cc_asociado || '-'}</td>
                  <td style={{ padding: '10px 16px', color: '#a0a0a0', fontSize: 13, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.ruta_tramo || '-'}</td>
                  <td style={{ padding: '10px 16px', color: '#a0a0a0', fontSize: 13 }}>{r.estado_calzada || '-'}</td>
                  <td style={{ padding: '10px 16px' }}><Origen r={r} /></td>
                  <td style={{ padding: '8px 12px' }} onClick={e => e.stopPropagation()}>
                    <button
                      onClick={e => handleDelete(r.id, e)}
                      title="Eliminar"
                      className="glow-r"
                      style={{ background: 'transparent', border: '1px solid #2a2a2a', color: '#8f8f8f', padding: '4px 10px', fontSize: 13, lineHeight: 1, cursor: 'pointer' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#f44336'; (e.currentTarget as HTMLButtonElement).style.color = '#f44336' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#252525'; (e.currentTarget as HTMLButtonElement).style.color = '#8f8f8f' }}
                    >✕</button>
                  </td>
                </tr>
              ))}
              {paged.length === 0 && (
                <tr><td colSpan={9} style={{ padding: 32, textAlign: 'center', color: '#8f8f8f' }}>
                  {relevamientos.length ? 'Ningún relevamiento con esos filtros.' : 'Todavía no hay relevamientos.'}
                </td></tr>
              )}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {/* El conteo siempre a la vista, no sólo cuando hay más de una página */}
        {!loading && filtered.length > 0 && (
          <div style={{ padding: '10px 16px', display: 'flex', gap: 8, alignItems: 'center', borderTop: '1px solid #1e1e1e' }}>
            <span style={{ color: '#8f8f8f', fontSize: 13 }}>
              {filtered.length} {filtered.length === 1 ? 'relevamiento' : 'relevamientos'}
              {filtered.length !== relevamientos.length && ` de ${relevamientos.length}`}
            </span>
            <div style={{ flex: 1 }} />
            {totalPages > 1 && (<>
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="glow-g"
              style={{ background: '#1e1e1e', border: '1px solid #252525', color: page === 0 ? '#333' : '#888', padding: '6px 14px', cursor: page === 0 ? 'not-allowed' : 'pointer', opacity: page === 0 ? 0.4 : 1 }}>
              ← Anterior
            </button>
            <span style={{ color: '#8f8f8f', fontSize: 13 }}>Pág {page + 1} / {totalPages}</span>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="glow-g"
              style={{ background: '#1e1e1e', border: '1px solid #252525', color: page >= totalPages - 1 ? '#333' : '#888', padding: '6px 14px', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', opacity: page >= totalPages - 1 ? 0.4 : 1 }}>
              Siguiente →
            </button>
            </>)}
          </div>
        )}
      </div>
    </div>
  )
}
