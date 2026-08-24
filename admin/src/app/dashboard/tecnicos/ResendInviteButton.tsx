'use client'
import { useState } from 'react'

interface Props {
  id:     string
  nombre: string
}

export default function ResendInviteButton({ id, nombre }: Props) {
  const [loading, setLoading] = useState(false)
  const [link,    setLink]    = useState('')
  const [copied,  setCopied]  = useState(false)
  const [error,   setError]   = useState('')

  async function handleClick() {
    if (link) { setLink(''); return } // toggle: si ya está visible, ocultar
    setLoading(true); setError(''); setCopied(false)
    const res = await fetch(`/api/tecnicos/${id}/reinvite`, { method: 'POST' })
    const body = await res.json()
    if (!res.ok) setError(body.error || 'Error')
    else setLink(body.inviteLink)
    setLoading(false)
  }

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, verticalAlign: 'top' }}>
      <button
        onClick={handleClick}
        disabled={loading}
        title={link ? 'Ocultar enlace' : `Generar enlace de invitación para ${nombre}`}
        style={{
          background: link ? 'rgba(33,150,243,0.1)' : 'transparent',
          border: `1px solid ${link ? '#2196F3' : '#252525'}`,
          color: link ? '#2196F3' : '#444',
          padding: '4px 10px', fontSize: 11,
          cursor: loading ? 'not-allowed' : 'pointer',
          marginRight: 6, opacity: loading ? 0.5 : 1,
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={e => { if (!loading && !link) { (e.currentTarget as HTMLButtonElement).style.borderColor = '#2196F3'; (e.currentTarget as HTMLButtonElement).style.color = '#2196F3' } }}
        onMouseLeave={e => { if (!link) { (e.currentTarget as HTMLButtonElement).style.borderColor = '#252525'; (e.currentTarget as HTMLButtonElement).style.color = '#444' } }}
      >
        {loading ? '...' : link ? 'Ocultar' : '✉ Invitación'}
      </button>

      {error && <span style={{ color: '#f44336', fontSize: 11 }}>{error}</span>}

      {link && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#111', border: '1px solid #1e1e1e', padding: '6px 10px', maxWidth: 420 }}>
          <span style={{ fontSize: 10, color: '#555', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>
            {link}
          </span>
          <button
            onClick={() => { navigator.clipboard.writeText(link); setCopied(true) }}
            style={{ background: copied ? '#4CAF50' : '#F5C300', border: 'none', color: '#111', fontSize: 10, fontWeight: 700, padding: '3px 8px', cursor: 'pointer', flexShrink: 0, letterSpacing: 0.5 }}
          >
            {copied ? '✓' : 'COPIAR'}
          </button>
        </span>
      )}
    </span>
  )
}
