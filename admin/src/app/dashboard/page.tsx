import { createClient } from '@/lib/supabase/server'
import type { Relevamiento } from '@/types'
import DashboardMap from '@/components/DashboardMap'

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div style={{
      background: '#2C2C2C',
      borderRadius: 10,
      padding: '20px 24px',
      borderLeft: '4px solid #F5C300',
      flex: 1,
      minWidth: 160,
    }}>
      <div style={{ color: '#9E9E9E', fontSize: 13, marginBottom: 8 }}>{label}</div>
      <div style={{ color: '#fff', fontSize: 32, fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ color: '#9E9E9E', fontSize: 12, marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const [
    { count: totalRelev },
    { count: pendingRelev },
    { count: totalTecnicos },
    { count: totalConsorcios },
    { data: relevamientos },
  ] = await Promise.all([
    supabase.from('relevamientos').select('*', { count: 'exact', head: true }),
    supabase.from('relevamientos').select('*', { count: 'exact', head: true }).neq('sync_status', 'sincronizado'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('consorcios').select('*', { count: 'exact', head: true }),
    supabase.from('relevamientos').select('id,fecha,tipo,tecnico,estado_calzada,coords,coords_linea,auto_deteccion,ruta_tramo,sync_status,user_id,observaciones,datos_puente,datos_alcantarilla,datos_tubos,datos_ripio,datos_otro,fotos').limit(500),
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

      {/* Map */}
      <div style={{ background: '#2C2C2C', borderRadius: 10, overflow: 'hidden', height: 480 }}>
        <DashboardMap relevamientos={(relevamientos as Relevamiento[]) ?? []} />
      </div>
    </div>
  )
}
