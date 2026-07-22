import { createServiceClient } from '@/lib/supabase/server'
import type { Relevamiento } from '@/types'
import DashboardMap from '@/components/DashboardMap'

const TIPO_COLORS: Record<string, string> = {
  Puente: '#2196F3', Alcantarilla: '#FF9800', Tubos: '#9C27B0', Lineal: '#4CAF50', Otro: '#607D8B',
}
const TIPOS = ['Puente', 'Alcantarilla', 'Tubos', 'Lineal', 'Otro'] as const

function StatCard({ label, value, sub, children }: { label: string; value: number | string; sub?: string; children?: React.ReactNode }) {
  return (
    <div style={{
      background: '#191919',
      border: '1px solid #1e1e1e',
      borderLeft: '3px solid #F5C300',
      padding: '14px 18px',
      flex: 1,
      minWidth: 120,
    }}>
      <div style={{ color: '#555', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ color: '#e0e0e0', fontSize: 22, fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ color: '#444', fontSize: 10, marginTop: 4 }}>{sub}</div>}
      {children}
    </div>
  )
}

export default async function DashboardPage() {
  const supabase = createServiceClient()

  const [
    { count: totalRelev },
    { count: pendingRelev },
    { count: totalTecnicos },
    { count: totalConsorcios },
    { data: relevamientos },
  ] = await Promise.all([
    supabase.from('relevamientos').select('*', { count: 'exact', head: true }),
    supabase.from('relevamientos').select('*', { count: 'exact', head: true }).is('sincronizado_en', null),
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('consorcios').select('*', { count: 'exact', head: true }),
    supabase.from('relevamientos').select('id,fecha,tipo,tecnico_id,estado_calzada,coords_lat,coords_lng,coords_linea,cc_asociado,zona,ruta_tramo,observaciones,fotos,datos_especificos,sincronizado_en').limit(500),
  ])

  // Conteo por tipo desde los datos ya traídos
  const countByTipo: Record<string, number> = {}
  TIPOS.forEach(t => { countByTipo[t] = 0 })
  ;(relevamientos ?? []).forEach((r: unknown) => {
    const tipo = (r as { tipo?: string }).tipo
    if (tipo && tipo in countByTipo) countByTipo[tipo]++
  })

  return (
    <div>
      <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700, marginBottom: 24 }}>Dashboard</h1>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
        <StatCard label="Relevamientos totales" value={totalRelev ?? 0}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', marginTop: 8 }}>
            {TIPOS.map(t => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: TIPO_COLORS[t], display: 'inline-block', flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: '#9E9E9E' }}>{t}</span>
                <span style={{ fontSize: 10, color: '#ccc', fontWeight: 600 }}>{countByTipo[t]}</span>
              </div>
            ))}
          </div>
        </StatCard>
        <StatCard label="Sin sincronizar" value={pendingRelev ?? 0} sub="pendiente / error" />
        <StatCard label="Técnicos registrados" value={totalTecnicos ?? 0} />
        <StatCard label="Consorcios" value={totalConsorcios ?? 0} />
      </div>

      {/* Map */}
      <div style={{ height: 'calc(100vh - 236px)', minHeight: 480, margin: '0 -1.5rem', borderRadius: 0, position: 'relative' }}>
        <DashboardMap relevamientos={(relevamientos as Relevamiento[]) ?? []} />
      </div>
    </div>
  )
}
