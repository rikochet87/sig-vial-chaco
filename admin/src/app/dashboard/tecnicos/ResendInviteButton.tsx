'use client'
import { useState } from 'react'

interface Props {
  id:     string
  nombre: string
}

export default function ResendInviteButton({ id, nombre }: Props) {
  const [loading,  setLoading]  = useState(false)
  const [link,     setLink]     = useState('')
  const [copied,   setCopied]   = useState(false)
  const [open,     setOpen]     = useState(false)
  const [error,    setError]    = useState('')

  async function handleClick() {
    setLoading(true); setError(''); setCopied(false)
    const res = await fetch(`/api/tecnicos/${id}/reinvite`, { method: 'POST' })
    const body = await res.json()
    if (!res.ok) {
      setError(body.error || 'Error al generar el enlace')
    } else {
      setLink(body.inviteLink)
      setOpen(true)
    }
    setLoading(false)
  }

  function handleCopy() {
    navigator.clipboard.writeText(link)
    setCopied(true)
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={loading}
        title="Reenviar invitación"
        style={{
          background: 'transparent', border: '1px solid #252525',
          color: '#444', padding: '4px 10px', fontSize: 11,
          letterSpacing: 0.5, cursor: loading ? 'not-allowed' : 'pointer',
          marginRight: 6, opacity: loading ? 0.5 : 1,
        }}
        onMouseEnter={e => { if (!loading) { (e.currentTarget as HTMLButtonElement).style.borderColor = '#2196F3'; (e.currentTarget as HTMLButtonElement).style.color = '#2196F3' } }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#252525'; (e.currentTarget as HTMLButtonElement).style.color = '#444' }}
      >
        {loading ? '...' : '✉'}
      </button>

      {open && (
        <div
          onClick={e => { if (e.target === e.currentTarget) { setOpen(false); setCopied(false) } }}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#000a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div style={{ background: '#141414', border: '1px solid #2a2a2a', padding: 28, width: 460, maxWidth: '92vw' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ color: '#e0e0e0', fontSize: 13, fontWeight: 700 }}>Enlace de invitación</span>
              <button onClick={() => { setOpen(false); setCopied(false) }} style={{ background: 'none', border: 'none', color: '#555', fontSize: 18, cursor: 'pointer' }}>×</button>
            </div>

            <p style={{ color: '#666', fontSize: 12, marginBottom: 14 }}>
              Enviá este enlace a <span style={{ color: '#e0e0e0' }}>{nombre}</span>. Expira en 24 horas.
            </p>

            <div style={{ background: '#111', border: '1px solid #2a2a2a', padding: '10px 14px', fontSize: 11, color: '#888', wordBreak: 'break-all', marginBottom: 12, fontFamily: 'monospace' }}>
              {link}
            </div>

            {error && <p style={{ color: '#f44336', fontSize: 12, marginBottom: 12 }}>{error}</p>}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleCopy}
                style={{ flex: 1, padding: '10px', background: copied ? '#4CAF50' : '#F5C300', color: '#111', fontWeight: 700, fontSize: 12, border: 'none', cursor: 'pointer', letterSpacing: 1 }}
              >
                {copied ? '✓ COPIADO' : 'COPIAR ENLACE'}
              </button>
              <button
                onClick={() => { setOpen(false); setCopied(false) }}
                style={{ padding: '10px 18px', background: 'transparent', color: '#555', fontSize: 12, border: '1px solid #252525', cursor: 'pointer' }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
