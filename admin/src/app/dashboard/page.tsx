import { createServiceClient } from '@/lib/supabase/server'
import type { Relevamiento } from '@/types'
import DashboardMap from '@/components/DashboardMap'

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div style={{
      background: '#2C2C2C',
      borderRadius: 10,
      padding: '14px 18px',
      borderLeft: '4px solid #F5C300',
      flex: 1,
      minWidth: 120,
    }}>
      <div style={{ color: '#9E9E9E', fontSize: 11, marginBottom: 6 }}>{label}</div>
      <div style={{ color: '#fff', fontSize: 22, fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ color: '#9E9E9E', fontSize: 10, marginTop: 4 }}>{sub}</div>}
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

  return (
    <div>
      <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700, marginBottom: 24 }}>Dashboard</h1>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 32 }}>
        <StatCard label="Relevamientos totales" value={totalRelev ?? 0} />
        <StatCard label="Sin sincronizar" value={pendingRelev ?? 0} sub="pendiente / error" />
        <StatCard label="Técnicos registrados" value={totalTecnicos ?? 0} />
        <StatCard label="Consorcios" value={totalConsorcios ?? 0} />
      </div>

      {/* Map — full-width, borde a borde del área de contenido */}
      <div style={{ height: 560, margin: '0 -1.5rem', borderRadius: 0, position: 'relative' }}>
        <DashboardMap relevamientos={(relevamientos as Relevamiento[]) ?? []} />
      </div>
    </div>
  )
}
