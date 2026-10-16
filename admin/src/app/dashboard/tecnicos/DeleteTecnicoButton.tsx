'use client'
import { useRouter } from 'next/navigation'

interface Props {
  id: string
  nombre: string
}

export default function DeleteTecnicoButton({ id, nombre }: Props) {
  const router = useRouter()

  async function handleDelete() {
    if (!confirm(`¿Eliminar a ${nombre}? Esta acción no se puede deshacer.`)) return
    const res = await fetch(`/api/tecnicos/${id}`, { method: 'DELETE' })
    if (res.ok) {
      router.refresh()
    } else {
      const body = await res.json()
      alert('Error: ' + body.error)
    }
  }

  return (
    <button
      onClick={handleDelete}
      className="glow-r"
      style={{ background: 'transparent', border: '1px solid #2a2a2a', color: '#a0a0a0', padding: '4px 12px', fontSize: 12, letterSpacing: 0.5 }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#f44336'; (e.currentTarget as HTMLButtonElement).style.color = '#f44336' }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#2a2a2a'; (e.currentTarget as HTMLButtonElement).style.color = '#a0a0a0' }}
    >
      Eliminar
    </button>
  )
}
