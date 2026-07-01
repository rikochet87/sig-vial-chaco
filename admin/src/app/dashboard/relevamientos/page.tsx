'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Relevamiento } from '@/types'

const TIPOS = ['', 'Puente', 'Alcantarilla', 'Tubos', 'Ripio', 'Otro']
const ZONAS = ['', 'ZI', 'ZII', 'ZIII', 'ZIV', 'ZV']
const ESTADOS = ['', 'bueno', 'regular', 'malo', 'muy malo']
const PAGE_SIZE = 20

function SyncBadge({ sincronizado_en }: { sincronizado_en: string | null }) {
  const synced = !!sincronizado_en
  const color = synced ? '#4CAF50' : '#F5C300'
  const label = synced ? 'sincronizado' : 'pendiente'
  return (
    <span style={{ background: color + '22', color, border: `1px solid ${color}`, borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>
      {label}
    </span>
  )
}

export default function RelevamientosPage() {
  const router = useRouter()
  const [relevamientos, setRelevamientos] = useState<Relevamiento[]>([])
  const [filtered, setFiltered] = useState<Relevamiento[]>([])
  const [profileMap, setProfileMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [tipo, setTipo] = useState('')
  const [zona, setZona] = useState('')
  const [tecnico, setTecnico] = useState('')
  const [estado, setEstado] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [page, setPage] = useState(0)
  const [tecnicos, setTecnicos] = useState<string[]>([])

  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase.from('relevamientos')
        .select('id,fecha,tipo,tecnico_id,estado_calzada,coords_lat,coords_lng,coords_linea,cc_asociado,zona,ruta_tramo,observaciones,fotos,datos_especificos,sincronizado_en')
        .order('fecha', { ascending: false }),
      supabase.from('profiles').select('id,nombre'),
    ]).then(([{ data }, { data: profs }]) => {
      const rows = (data as Relevamiento[]) ?? []
      setRelevamientos(rows)
      setFiltered(rows)
      const ts = Array.from(new Set(rows.map(r => r.tecnico_id).filter(Boolean))) as string[]
      setTecnicos(ts)
      const pm: Record<string, string> = Object.fromEntries(
        (profs ?? []).map((p: { id: string; nombre: string }) => [p.id, p.nombre])
      )
      setProfileMap(pm)
      setLoading(false)
    })
  }, [])

  const applyFilters = useCallback(() => {
    let rows = relevamientos
    if (tipo) rows = rows.filter(r => r.tipo === tipo)
    if (zona) rows = rows.filter(r => r.zona === zona)
    if (tecnico) rows = rows.filter(r => r.tecnico_id === tecnico)
    if (estado) rows = rows.filter(r => r.estado_calzada === estado)
    if (desde) rows = rows.filter(r => r.fecha >= desde)
    if (hasta) rows = rows.filter(r => r.fecha <= hasta)
    setFiltered(rows)
    setPage(0)
  }, [relevamientos, tipo, zona, tecnico, estado, desde, hasta])

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

  const select = (label: string, value: string, onChange: (v: string) => void, options: string[]) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ color: '#9E9E9E', fontSize: 12 }}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ background: '#3C3C3C', border: '1px solid #4C4C4C', borderRadius: 6, color: '#fff', padding: '6px 10px', fontSize: 13 }}>
        {options.map(o => <option key={o} value={o}>{o || 'Todos'}</option>)}
      </select>
    </div>
  )

  return (
    <div>
      <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Relevamientos</h1>

      {/* Filters */}
      <div style={{ background: '#2C2C2C', borderRadius: 10, padding: 20, marginBottom: 20, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {select('Tipo', tipo, setTipo, TIPOS)}
        {select('Zona', zona, setZona, ZONAS)}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ color: '#9E9E9E', fontSize: 12 }}>Técnico (ID)</label>
          <select value={tecnico} onChange={e => setTecnico(e.target.value)}
            style={{ background: '#3C3C3C', border: '1px solid #4C4C4C', borderRadius: 6, color: '#fff', padding: '6px 10px', fontSize: 13 }}>
            <option value="">Todos</option>
            {tecnicos.map(t => <option key={t} value={t}>{profileMap[t] || t}</option>)}
          </select>
        </div>
        {select('Estado calzada', estado, setEstado, ESTADOS)}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ color: '#9E9E9E', fontSize: 12 }}>Desde</label>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
            style={{ background: '#3C3C3C', border: '1px solid #4C4C4C', borderRadius: 6, color: '#fff', padding: '6px 10px', fontSize: 13 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ color: '#9E9E9E', fontSize: 12 }}>Hasta</label>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
            style={{ background: '#3C3C3C', border: '1px solid #4C4C4C', borderRadius: 6, color: '#fff', padding: '6px 10px', fontSize: 13 }} />
        </div>
      </div>

      {/* Table */}
      <div style={{ background: '#2C2C2C', borderRadius: 10, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9E9E9E' }}>Cargando...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#3C3C3C' }}>
                {['Fecha', 'Tipo', 'Técnico', 'Zona', 'Consorcio', 'Tramo', 'Estado', 'Sync', ''].map(h => (
                  <th key={h} style={{ padding: '12px 16px', color: '#9E9E9E', fontSize: 12, fontWeight: 600, textAlign: 'left', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((r, i) => (
                <tr
                  key={r.id}
                  onClick={() => router.push(`/dashboard/relevamientos/${r.id}`)}
                  style={{
                    borderTop: '1px solid #3C3C3C',
                    cursor: 'pointer',
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(245,195,0,0.06)')}
                  onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)')}
                >
                  <td style={{ padding: '12px 16px', color: '#fff', fontSize: 13 }}>{r.fecha?.split('T')[0] ?? '-'}</td>
                  <td style={{ padding: '12px 16px', color: '#F5C300', fontSize: 13, fontWeight: 600 }}>{r.tipo}</td>
                  <td style={{ padding: '12px 16px', color: '#fff', fontSize: 13, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.tecnico_id ? (profileMap[r.tecnico_id] ?? r.tecnico_id) : '-'}</td>
                  <td style={{ padding: '12px 16px', color: '#9E9E9E', fontSize: 13 }}>{r.zona || '-'}</td>
                  <td style={{ padding: '12px 16px', color: '#9E9E9E', fontSize: 13 }}>{r.cc_asociado || '-'}</td>
                  <td style={{ padding: '12px 16px', color: '#9E9E9E', fontSize: 13, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.ruta_tramo || '-'}</td>
                  <td style={{ padding: '12px 16px', color: '#9E9E9E', fontSize: 13 }}>{r.estado_calzada || '-'}</td>
                  <td style={{ padding: '12px 16px' }}><SyncBadge sincronizado_en={r.sincronizado_en} /></td>
                  <td style={{ padding: '8px 12px' }} onClick={e => e.stopPropagation()}>
                    <button
                      onClick={e => handleDelete(r.id, e)}
                      title="Eliminar"
                      style={{ background: 'transparent', border: '1px solid #f44336', color: '#f44336', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 13, lineHeight: 1 }}
                    >✕</button>
                  </td>
                </tr>
              ))}
              {paged.length === 0 && (
                <tr><td colSpan={9} style={{ padding: 32, textAlign: 'center', color: '#9E9E9E' }}>Sin resultados</td></tr>
              )}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ padding: '12px 16px', display: 'flex', gap: 8, alignItems: 'center', borderTop: '1px solid #3C3C3C' }}>
            <span style={{ color: '#9E9E9E', fontSize: 13 }}>{filtered.length} resultados</span>
            <div style={{ flex: 1 }} />
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
              style={{ background: '#3C3C3C', border: 'none', color: '#fff', borderRadius: 6, padding: '6px 14px', cursor: page === 0 ? 'not-allowed' : 'pointer', opacity: page === 0 ? 0.5 : 1 }}>
              ← Anterior
            </button>
            <span style={{ color: '#9E9E9E', fontSize: 13 }}>Pág {page + 1} / {totalPages}</span>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
              style={{ background: '#3C3C3C', border: 'none', color: '#fff', borderRadius: 6, padding: '6px 14px', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', opacity: page >= totalPages - 1 ? 0.5 : 1 }}>
              Siguiente →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
