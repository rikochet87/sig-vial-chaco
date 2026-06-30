import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Consorcio } from '@/types'
import EditConsorcioForm from './EditConsorcioForm'

export default async function ConsorcioDetailPage({ params }: { params: Promise<{ numero: string }> }) {
  const { numero } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('consorcios').select('*').eq('numero', parseInt(numero)).single()

  if (!data) {
    return (
      <div>
        <Link href="/dashboard/consorcios" style={{ color: '#F5C300', textDecoration: 'none' }}>← Volver</Link>
        <p style={{ color: '#9E9E9E', marginTop: 20 }}>Consorcio no encontrado.</p>
      </div>
    )
  }

  const c = data as Consorcio

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <Link href="/dashboard/consorcios" style={{ color: '#F5C300', textDecoration: 'none', fontSize: 14 }}>← Volver</Link>
        <h1 style={{ color: '#fff', fontSize: 20, fontWeight: 700 }}>Consorcio #{c.numero} — {c.nombre}</h1>
      </div>

      {/* Read-only info */}
      <div style={{ background: '#2C2C2C', borderRadius: 10, padding: 20, marginBottom: 20 }}>
        <h3 style={{ color: '#9E9E9E', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>Información general (solo lectura)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
          {[['Nombre', c.nombre], ['Localidad', c.localidad], ['Zona', c.zona], ['Latitud', c.latitude], ['Longitud', c.longitude]].map(([label, value]) => (
            <div key={label as string}>
              <div style={{ color: '#9E9E9E', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
              <div style={{ color: '#fff', fontSize: 14 }}>{String(value ?? '-')}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Editable form */}
      <EditConsorcioForm consorcio={c} />
    </div>
  )
}
