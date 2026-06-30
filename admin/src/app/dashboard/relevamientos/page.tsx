'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Relevamiento } from '@/types'

const TIPOS = ['', 'Puente', 'Alcantarilla', 'Tubos', 'Ripio', 'Otro']
const ZONAS = ['', 'ZI', 'ZII', 'ZIII', 'ZIV', 'ZV']
const ESTADOS = ['', 'bueno', 'regular', 'malo', 'muy malo']
const PAGE_SIZE = 20

function SyncBadge({ status }: { status: string }) {
  const color = status === 'sincronizado' ? '#4CAF50' : status === 'pendiente' ? '#F5C300' : '#9E9E9E'
  return (
    <span style={{ background: color + '22', color, border: `1px solid ${color}`, borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>
      {status}
    </span>
  )
}

export default function RelevamientosPage() {
  const router = useRouter()
  const [relevamientos, setRelevamientos] = useState<Relevamiento[]>([])
  const [filtered, setFiltered] = useState<Relevamiento[]>([])
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
    supabase.from('relevamientos')
      .select('id,fecha,tipo,tecnico,estado_calzada,coords,coords_linea,auto_deteccion,ruta_tramo,sync_status,user_id,observaciones,datos_puente,datos_alcantarilla,datos_tubos,datos_ripio,datos_otro,fotos')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        const rows = (data as Relevamiento[]) ?? []
        setRelevamientos(rows)
        setFiltered(rows)
        const ts = Array.from(new Set(rows.map(r => r.tecnico).filter(Boolean)))
        setTecnicos(ts)
        setLoading(false)
      })
  }, [])

  const applyFilters = useCallback(() => {
    let rows = relevamientos
    if (tipo) rows = rows.filter(r => r.tipo === tipo)
    if (zona) rows = rows.filter(r => r.auto_deteccion?.zona === zona)
    if (tecnico) rows = rows.filter(r => r.tecnico === tecnico)
    if (estado) rows = rows.filter(r => r.estado_calzada === estado)
    if (desde) rows = rows.filter(r => r.fecha >= desde)
    if (hasta) rows = rows.filter(r => r.fecha <= hasta)
    setFiltered(rows)
    setPage(0)
  }, [relevamientos, tipo, zona, tecnico, estado, desde, hasta])

  useEffect(() => { applyFilters() }, [applyFilters])

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
          <label style={{ color: '#9E9E9E', fontSize: 12 }}>Técnico</label>
          <select value={tecnico} onChange={e => setTecnico(e.target.value)}
            style={{ background: '#3C3C3C', border: '1px solid #4C4C4C', borderRadius: 6, color: '#fff', padding: '6px 10px', fontSize: 13 }}>
            <option value="">Todos</option>
            {tecnicos.map(t => <option key={t} value={t}>{t}</option>)}
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
                {['Fecha', 'Tipo', 'Técnico', 'Zona', 'Consorcio', 'Tramo', 'Estado', 'Sync'].map(h => (
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
                  <td style={{ padding: '12px 16px', color: '#fff', fontSize: 13 }}>{r.fecha}</td>
                  <td style={{ padding: '12px 16px', color: '#F5C300', fontSize: 13, fontWeight: 600 }}>{r.tipo}</td>
                  <td style={{ padding: '12px 16px', color: '#fff', fontSize: 13 }}>{r.tecnico}</td>
                  <td style={{ padding: '12px 16px', color: '#9E9E9E', fontSize: 13 }}>{r.auto_deteccion?.zona || '-'}</td>
                  <td style={{ padding: '12px 16px', color: '#9E9E9E', fontSize: 13 }}>{r.auto_deteccion?.consorcio || '-'}</td>
                  <td style={{ padding: '12px 16px', color: '#9E9E9E', fontSize: 13, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.ruta_tramo || '-'}</td>
                  <td style={{ padding: '12px 16px', color: '#9E9E9E', fontSize: 13 }}>{r.estado_calzada || '-'}</td>
                  <td style={{ padding: '12px 16px' }}><SyncBadge status={r.sync_status} /></td>
                </tr>
              ))}
              {paged.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#9E9E9E' }}>Sin resultados</td></tr>
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
