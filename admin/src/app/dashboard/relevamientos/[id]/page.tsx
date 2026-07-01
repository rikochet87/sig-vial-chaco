import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Relevamiento } from '@/types'
import RelevamientoDetailMap from '@/components/RelevamientoDetailMap'
import RelevamientoActions from '@/components/RelevamientoActions'
import RelevamientoEditForm from '@/components/RelevamientoEditForm'

export default async function RelevamientoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()

  const [{ data: r }, { data: profiles }] = await Promise.all([
    supabase.from('relevamientos').select('*').eq('id', id).single(),
    supabase.from('profiles').select('id,nombre'),
  ])

  if (!r) {
    return (
      <div>
        <Link href="/dashboard/relevamientos" style={{ color: '#F5C300', textDecoration: 'none' }}>← Volver</Link>
        <p style={{ color: '#9E9E9E', marginTop: 20 }}>Relevamiento no encontrado.</p>
      </div>
    )
  }

  const rel = r as Relevamiento
  const profileMap: Record<string, string> = Object.fromEntries(
    (profiles ?? []).map(p => [p.id, p.nombre])
  )
  const tecnicoNombre = rel.tecnico_id ? (profileMap[rel.tecnico_id] ?? rel.tecnico_id) : '-'

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <Link href="/dashboard/relevamientos" style={{ color: '#F5C300', textDecoration: 'none', fontSize: 14 }}>← Volver</Link>
        <h1 style={{ color: '#fff', fontSize: 20, fontWeight: 700 }}>Relevamiento: {rel.tipo}</h1>
        <span style={{ background: '#F5C300', color: '#1A1A1A', fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 20 }}>{rel.tipo}</span>
      </div>

      {/* Acciones: export + delete */}
      <RelevamientoActions rel={rel} />

      {/* Editable form — shows info in read mode + "Editar relevamiento" button */}
      <RelevamientoEditForm rel={rel} tecnicoNombre={tecnicoNombre} />

      {/* Map */}
      <div style={{ background: '#2C2C2C', borderRadius: 10, overflow: 'hidden', height: 400, marginBottom: 16 }}>
        <RelevamientoDetailMap relevamientos={[rel]} />
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
