'use client'
/**
 * Control de tamaño de texto — accesibilidad.
 *
 * El panel tiene ~800 tamaños de fuente escritos en px directamente en los
 * estilos inline. Subir el piso arregla el default, pero no alcanza para los
 * usuarios con visión reducida: cada uno necesita un nivel distinto.
 *
 * Se usa `zoom` sobre el contenedor principal en vez de `transform: scale()`
 * porque zoom reflowea el contenido (las tablas y paneles se reacomodan al
 * ancho disponible), mientras que scale lo agranda visualmente y lo hace
 * desbordar. Con todos los tamaños en px inline, zoom es el único mecanismo
 * que escala todo de una sin tocar los 800 valores.
 */

import { useEffect, useState } from 'react'

const CLAVE = 'sig_vial_zoom_panel'

export const NIVELES = [
  { id: 'normal', label: 'A',   zoom: 1,    titulo: 'Tamaño normal'  },
  { id: 'grande', label: 'A+',  zoom: 1.15, titulo: 'Texto más grande'  },
  { id: 'xl',     label: 'A++', zoom: 1.3,  titulo: 'Texto mucho más grande' },
] as const

type NivelId = typeof NIVELES[number]['id']

/** Aplica el zoom al área de contenido (no al header ni al sidebar) */
function aplicar(zoom: number) {
  const main = document.getElementById('panel-contenido')
  if (main) main.style.zoom = String(zoom)
}

export default function TamanoTexto() {
  const [nivel, setNivel] = useState<NivelId>('normal')

  // Restaurar la preferencia guardada
  useEffect(() => {
    try {
      const guardado = localStorage.getItem(CLAVE) as NivelId | null
      if (guardado && NIVELES.some(n => n.id === guardado)) {
        setNivel(guardado)
        aplicar(NIVELES.find(n => n.id === guardado)!.zoom)
      }
    } catch (_) {
      // localStorage puede fallar en modo privado — no es crítico
    }
  }, [])

  const elegir = (id: NivelId) => {
    const n = NIVELES.find(x => x.id === id)!
    setNivel(id)
    aplicar(n.zoom)
    try { localStorage.setItem(CLAVE, id) } catch (_) {}
  }

  return (
    <div
      role="group"
      aria-label="Tamaño del texto"
      style={{ display: 'flex', alignItems: 'center', gap: 2, marginRight: 4 }}
    >
      {NIVELES.map(n => {
        const activo = nivel === n.id
        return (
          <button
            key={n.id}
            onClick={() => elegir(n.id)}
            title={n.titulo}
            aria-pressed={activo}
            style={{
              background: activo ? '#F5C300' : 'transparent',
              border: `1px solid ${activo ? '#F5C300' : '#333'}`,
              color: activo ? '#111' : '#666',
              // Tamaño fijo: este control no se escala a sí mismo, así que
              // debe ser legible de entrada para quien lo va a necesitar
              fontSize: n.id === 'normal' ? 11 : n.id === 'grande' ? 12 : 13,
              fontWeight: 700,
              fontFamily: 'monospace',
              lineHeight: 1,
              padding: '4px 7px',
              cursor: 'pointer',
              transition: 'border-color 0.15s, color 0.15s, background 0.15s',
            }}
            onMouseEnter={e => {
              if (activo) return
              const b = e.currentTarget
              b.style.borderColor = '#F5C300'
              b.style.color = '#F5C300'
            }}
            onMouseLeave={e => {
              if (activo) return
              const b = e.currentTarget
              b.style.borderColor = '#333'
              b.style.color = '#666'
            }}
          >
            {n.label}
          </button>
        )
      })}
    </div>
  )
}
