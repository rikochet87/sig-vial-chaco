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
      style={{ background: 'transparent', border: '1px solid #ff5252', color: '#ff5252', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}
    >
      Eliminar
    </button>
  )
}
