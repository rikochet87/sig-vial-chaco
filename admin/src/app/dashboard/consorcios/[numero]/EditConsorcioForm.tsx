'use client'
import { useState } from 'react'
import type { Consorcio } from '@/types'

interface Props {
  consorcio: Consorcio
}

export default function EditConsorcioForm({ consorcio }: Props) {
  const [form, setForm] = useState({
    presidente: consorcio.presidente ?? '',
    vicepresidente: consorcio.vicepresidente ?? '',
    secretario: consorcio.secretario ?? '',
    tesorero: consorcio.tesorero ?? '',
    red_km: consorcio.red_km ?? 0,
    red_primaria: consorcio.red_primaria ?? 0,
    red_secundaria: consorcio.red_secundaria ?? 0,
    red_terciaria: consorcio.red_terciaria ?? 0,
  })
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const res = await fetch(`/api/consorcios/${consorcio.numero}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const body = await res.json()
    if (res.ok) {
      showToast('Cambios guardados correctamente.', true)
    } else {
      showToast('Error: ' + body.error, false)
    }
    setLoading(false)
  }

  const inputStyle = { width: '100%', padding: '10px 12px', background: '#3C3C3C', border: '1px solid #4C4C4C', borderRadius: 8, color: '#fff', fontSize: 14, boxSizing: 'border-box' as const }
  const labelStyle = { display: 'block' as const, color: '#9E9E9E', fontSize: 12, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 6 }

  return (
    <div style={{ background: '#2C2C2C', borderRadius: 10, padding: 24, position: 'relative' }}>
      <h3 style={{ color: '#F5C300', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 20 }}>Datos editables</h3>

      {toast && (
        <div style={{
          position: 'fixed', top: 24, right: 24, zIndex: 1000,
          background: toast.ok ? '#4CAF5022' : '#ff525222',
          border: `1px solid ${toast.ok ? '#4CAF50' : '#ff5252'}`,
          color: toast.ok ? '#4CAF50' : '#ff5252',
          borderRadius: 8, padding: '12px 20px', fontSize: 14,
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        }}>
          {toast.msg}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
          {([
            ['presidente', 'Presidente'],
            ['vicepresidente', 'Vicepresidente'],
            ['secretario', 'Secretario/a'],
            ['tesorero', 'Tesorero/a'],
          ] as const).map(([key, label]) => (
            <div key={key}>
              <label style={labelStyle}>{label}</label>
              <input
                type="text"
                value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                style={inputStyle}
              />
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
          {([
            ['red_km', 'Red total (km)'],
            ['red_primaria', 'Red primaria (km)'],
            ['red_secundaria', 'Red secundaria (km)'],
            ['red_terciaria', 'Red terciaria (km)'],
          ] as const).map(([key, label]) => (
            <div key={key}>
              <label style={labelStyle}>{label}</label>
              <input
                type="number"
                step="0.1"
                value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: parseFloat(e.target.value) || 0 }))}
                style={inputStyle}
              />
            </div>
          ))}
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{ background: '#F5C300', color: '#1A1A1A', fontWeight: 700, padding: '10px 24px', borderRadius: 8, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 15, opacity: loading ? 0.7 : 1 }}
        >
          {loading ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </form>
    </div>
  )
}
