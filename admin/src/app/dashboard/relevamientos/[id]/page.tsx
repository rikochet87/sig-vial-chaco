import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Relevamiento } from '@/types'
import dynamic from 'next/dynamic'

const RelevamientosMap = dynamic(() => import('@/components/RelevamientosMap'), { ssr: false })

function DataCard({ title, data }: { title: string; data: Record<string, unknown> | null }) {
  if (!data) return null
  const entries = Object.entries(data).filter(([, v]) => v !== null && v !== undefined && v !== '')
  if (entries.length === 0) return null
  return (
    <div style={{ background: '#2C2C2C', borderRadius: 10, padding: 20, marginBottom: 16 }}>
      <h3 style={{ color: '#F5C300', fontSize: 14, fontWeight: 700, marginBottom: 16, textTransform: 'uppercase', letterSpacing: 1 }}>{title}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        {entries.map(([k, v]) => (
          <div key={k}>
            <div style={{ color: '#9E9E9E', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{k.replace(/_/g, ' ')}</div>
            <div style={{ color: '#fff', fontSize: 14 }}>{String(v)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default async function RelevamientoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: r } = await supabase.from('relevamientos').select('*').eq('id', id).single()

  if (!r) {
    return (
      <div>
        <Link href="/dashboard/relevamientos" style={{ color: '#F5C300', textDecoration: 'none' }}>← Volver</Link>
        <p style={{ color: '#9E9E9E', marginTop: 20 }}>Relevamiento no encontrado.</p>
      </div>
    )
  }

  const rel = r as Relevamiento

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <Link href="/dashboard/relevamientos" style={{ color: '#F5C300', textDecoration: 'none', fontSize: 14 }}>← Volver</Link>
        <h1 style={{ color: '#fff', fontSize: 20, fontWeight: 700 }}>Relevamiento: {rel.tipo}</h1>
        <span style={{ background: '#F5C300', color: '#1A1A1A', fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 20 }}>{rel.tipo}</span>
      </div>

      {/* Main info */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, background: '#2C2C2C', borderRadius: 10, padding: 20, marginBottom: 16 }}>
        {[
          ['Fecha', rel.fecha],
          ['Técnico', rel.tecnico],
          ['Ruta / Tramo', rel.ruta_tramo],
          ['Estado calzada', rel.estado_calzada],
          ['Zona', rel.auto_deteccion?.zona],
          ['Consorcio', rel.auto_deteccion?.consorcio],
          ['Sync', rel.sync_status],
        ].map(([label, value]) => (
          <div key={label as string}>
            <div style={{ color: '#9E9E9E', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
            <div style={{ color: '#fff', fontSize: 14 }}>{(value as string) || '-'}</div>
          </div>
        ))}
      </div>

      {/* Observaciones */}
      {rel.observaciones && (
        <div style={{ background: '#2C2C2C', borderRadius: 10, padding: 20, marginBottom: 16 }}>
          <div style={{ color: '#9E9E9E', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Observaciones</div>
          <div style={{ color: '#fff', fontSize: 14, lineHeight: 1.6 }}>{rel.observaciones}</div>
        </div>
      )}

      {/* Tipo-specific data */}
      <DataCard title="Datos Puente" data={rel.datos_puente} />
      <DataCard title="Datos Alcantarilla" data={rel.datos_alcantarilla} />
      <DataCard title="Datos Tubos" data={rel.datos_tubos} />
      <DataCard title="Datos Ripio" data={rel.datos_ripio} />
      <DataCard title="Otros datos" data={rel.datos_otro} />

      {/* Map */}
      <div style={{ background: '#2C2C2C', borderRadius: 10, overflow: 'hidden', height: 400, marginBottom: 16 }}>
        <RelevamientosMap relevamientos={[rel]} />
      </div>

      {/* Fotos */}
      {rel.fotos && rel.fotos.length > 0 && (
        <div style={{ background: '#2C2C2C', borderRadius: 10, padding: 20 }}>
          <h3 style={{ color: '#F5C300', fontSize: 14, fontWeight: 700, marginBottom: 16, textTransform: 'uppercase', letterSpacing: 1 }}>Fotos ({rel.fotos.length})</h3>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {rel.fotos.map((foto, i) => (
              <div key={i} style={{ width: 160, height: 120, background: '#3C3C3C', borderRadius: 8, overflow: 'hidden' }}>
                {foto.startsWith('http') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={foto} alt={`Foto ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9E9E9E', fontSize: 12 }}>
                    Foto {i + 1}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
