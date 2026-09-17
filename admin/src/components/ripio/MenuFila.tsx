'use client'
/**
 * Menú de acciones de una fila del árbol.
 *
 * Reemplaza los botones sueltos que había por fila. El problema no era la
 * cantidad: era que archivar quedaba a cinco píxeles de trazar, y los dos ✕
 * —el del proyecto y el del tramo— se veían idénticos teniendo alcances muy
 * distintos. Acá lo destructivo queda separado, rotulado y a dos clics.
 */

import { useEffect, useRef, useState } from 'react'

const MONO = { fontFamily: 'monospace' } as const

export type AccionFila = {
  id: string
  label: string
  icono?: string
  /** Se muestra en rojo y separada del resto */
  destructiva?: boolean
  deshabilitada?: boolean
  /** Explicación cuando está deshabilitada o hace falta contexto */
  ayuda?: string
  onClick: () => void
}

export default function MenuFila({ acciones, color = '#888', titulo }: {
  acciones: AccionFila[]
  color?: string
  titulo?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [haciaArriba, setHaciaArriba] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const botonRef = useRef<HTMLButtonElement>(null)

  // Cerrar al clicar fuera o con Escape
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', esc)
    }
  }, [abierto])

  const abrir = () => {
    // Si la fila está en la mitad de abajo del panel, desplegar hacia arriba:
    // el árbol tiene scroll propio y el menú quedaría cortado.
    const r = botonRef.current?.getBoundingClientRect()
    if (r) setHaciaArriba(r.bottom > window.innerHeight - 220)
    setAbierto(a => !a)
  }

  const separables = acciones.filter(a => !a.destructiva)
  const destructivas = acciones.filter(a => a.destructiva)

  const item = (a: AccionFila) => (
    <button
      key={a.id}
      disabled={a.deshabilitada}
      title={a.ayuda}
      onClick={e => {
        e.stopPropagation()
        if (a.deshabilitada) return
        setAbierto(false)
        a.onClick()
      }}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
        padding: '7px 12px', textAlign: 'left', border: 'none',
        background: 'transparent',
        color: a.deshabilitada ? '#3a3a3a' : a.destructiva ? '#c77' : '#bbb',
        fontSize: 13, ...MONO,
        cursor: a.deshabilitada ? 'default' : 'pointer',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={e => {
        if (a.deshabilitada) return
        e.currentTarget.style.background = a.destructiva ? '#2a1010' : '#191919'
      }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      {a.icono && <span style={{ width: 14, flexShrink: 0, opacity: 0.85 }}>{a.icono}</span>}
      {a.label}
    </button>
  )

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        ref={botonRef}
        onClick={e => { e.stopPropagation(); abrir() }}
        title={titulo ?? 'Acciones'}
        aria-label={titulo ?? 'Acciones'}
        style={{
          background: abierto ? '#1e1e1e' : 'transparent',
          border: 'none', cursor: 'pointer', lineHeight: 1,
          color: abierto ? color : '#555',
          fontSize: 15, padding: '2px 5px', ...MONO,
        }}
      >
        ⋯
      </button>

      {abierto && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', right: 0, zIndex: 3000,
            [haciaArriba ? 'bottom' : 'top']: '100%',
            marginTop: haciaArriba ? 0 : 3, marginBottom: haciaArriba ? 3 : 0,
            background: '#0e0e0e', border: '1px solid #2a2a2a',
            boxShadow: '0 4px 14px #000a', minWidth: 178, padding: '3px 0',
          }}
        >
          {separables.map(item)}
          {destructivas.length > 0 && separables.length > 0 && (
            <div style={{ borderTop: '1px solid #222', margin: '3px 0' }} />
          )}
          {destructivas.map(item)}
        </div>
      )}
    </div>
  )
}
