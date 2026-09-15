import { createServiceClient } from '@/lib/supabase/server'
import type { Relevamiento } from '@/types'
import DashboardMap from '@/components/DashboardMap'

const TIPO_COLORS: Record<string, string> = {
  Puente: '#2196F3', Alcantarilla: '#FF9800', Tubos: '#9C27B0', Lineal: '#4CAF50', Otro: '#607D8B',
}
const TIPOS = ['Puente', 'Alcantarilla', 'Tubos', 'Lineal', 'Otro'] as const

/**
 * Tarjeta compacta: la etiqueta y el número van en la misma línea.
 * Antes iban apiladas y la cabecera se comía casi 200 px de alto, espacio que
 * en un tablero con mapa se lo tiene que quedar el mapa.
 */
function StatCard({ label, value, sub, children, flex = 1 }: {
  label: string; value: number | string; sub?: string
  children?: React.ReactNode; flex?: number
}) {
  return (
    <div style={{
      background: '#191919',
      border: '1px solid #1e1e1e',
      borderLeft: '3px solid #F5C300',
      padding: '7px 14px',
      flex,
      minWidth: 140,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ color: '#555', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' }}>
          {label}
        </span>
        <span style={{ color: '#e0e0e0', fontSize: 20, fontWeight: 700, lineHeight: 1.1 }}>
          {value}
        </span>
      </div>
      {sub && <div style={{ color: '#444', fontSize: 12, marginTop: 1 }}>{sub}</div>}
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
    // Sin limit: countByTipo se calcula de estos datos — un limit rompería el subtotal.
    // Revisar paginación si el dataset supera ~5000 registros.
    supabase.from('relevamientos').select('id,fecha,tipo,tecnico_id,estado_calzada,coords_lat,coords_lng,coords_linea,cc_asociado,zona,ruta_tramo,observaciones,fotos,datos_especificos,sincronizado_en'),
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
      {/* Título y tarjetas en una sola fila: en un tablero con mapa, el alto
          es el recurso escaso y lo tiene que aprovechar el mapa. */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'stretch', marginBottom: 8 }}>
        <h1 style={{
          color: '#fff', fontSize: 18, fontWeight: 700, margin: 0,
          alignSelf: 'center', paddingRight: 6, whiteSpace: 'nowrap',
        }}>
          Dashboard
        </h1>

        <StatCard label="Relevamientos" value={totalRelev ?? 0} flex={2}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 9px', marginTop: 2 }}>
            {TIPOS.map(t => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: TIPO_COLORS[t], display: 'inline-block', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: '#9E9E9E' }}>{t}</span>
                <span style={{ fontSize: 12, color: '#ccc', fontWeight: 600 }}>{countByTipo[t]}</span>
              </div>
            ))}
          </div>
        </StatCard>
        <StatCard label="Sin sincronizar" value={pendingRelev ?? 0} sub="pendiente / error" />
        <StatCard label="Técnicos" value={totalTecnicos ?? 0} />
        <StatCard label="Consorcios" value={totalConsorcios ?? 0} />
      </div>

      {/* Map — gana el alto que dejó la cabecera */}
      <div style={{ height: 'calc(100vh - 118px)', minHeight: 480, margin: '0 -1.5rem', borderRadius: 0, position: 'relative' }}>
        <DashboardMap relevamientos={(relevamientos as Relevamiento[]) ?? []} />
      </div>
    </div>
  )
}
