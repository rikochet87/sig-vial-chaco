'use client'
import { useState } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import type { Relevamiento } from '@/types'
import { useEffect } from 'react'

const RelevamientosMap = dynamic(() => import('@/components/RelevamientosMap'), {
  ssr: false,
  loading: () => (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111', color: '#9E9E9E' }}>
      Cargando mapa...
    </div>
  ),
})

const TOOLS = [
  {
    id: 'measure',
    icon: '📏',
    label: 'Medir distancias',
    desc: 'Hacé clic en el mapa para medir tramos. Acumula la distancia total del recorrido.',
  },
  // Aquí se agregarán nuevas herramientas
]

export default function HerramientasPage() {
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [relevamientos, setRelevamientos] = useState<Relevamiento[]>([])

  useEffect(() => {
    createClient()
      .from('relevamientos')
      .select('id,fecha,tipo,tecnico_id,estado_calzada,coords_lat,coords_lng,coords_linea,cc_asociado,zona,ruta_tramo,observaciones,fotos,datos_especificos,sincronizado_en')
      .limit(500)
      .then(({ data }) => setRelevamientos((data as Relevamiento[]) ?? []))
  }, [])

  const toggle = (id: string) => setActiveTool(prev => (prev === id ? null : id))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', gap: 0 }}>
      <h1 style={{ color: '#e0e0e0', fontSize: 20, fontWeight: 700, marginBottom: 16, letterSpacing: 0.5 }}>
        Herramientas
      </h1>

      <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>

        {/* ── Panel de herramientas ── */}
        <div style={{
          width: 220, flexShrink: 0,
          background: '#191919', border: '1px solid #1e1e1e',
          borderRadius: 8, padding: '12px 10px',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <div style={{ color: '#555', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4, paddingLeft: 4 }}>
            Herramientas disponibles
          </div>

          {TOOLS.map(tool => {
            const active = activeTool === tool.id
            return (
              <button
                key={tool.id}
                onClick={() => toggle(tool.id)}
                title={tool.desc}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: active ? 'rgba(245,195,0,0.10)' : 'transparent',
                  border: `1px solid ${active ? '#F5C300' : '#252525'}`,
                  borderRadius: 8, padding: '10px 12px', cursor: 'pointer',
                  color: active ? '#F5C300' : '#9E9E9E',
                  fontSize: 13, fontWeight: active ? 700 : 400,
                  textAlign: 'left', width: '100%',
                  transition: 'background .15s, color .15s, border-color .15s',
                }}
              >
                <span style={{ fontSize: 16, flexShrink: 0 }}>{tool.icon}</span>
                <span>{tool.label}</span>
                {active && (
                  <span style={{ marginLeft: 'auto', fontSize: 9, background: '#F5C300', color: '#111', fontWeight: 800, borderRadius: 4, padding: '1px 5px', letterSpacing: 0.5 }}>
                    ACTIVO
                  </span>
                )}
              </button>
            )
          })}

          {/* Descripción de la herramienta activa */}
          {activeTool && (
            <div style={{ marginTop: 8, padding: '10px 12px', background: '#111', border: '1px solid #1e1e1e', borderRadius: 6 }}>
              <div style={{ color: '#555', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Instrucciones</div>
              <div style={{ color: '#888', fontSize: 12, lineHeight: 1.5 }}>
                {TOOLS.find(t => t.id === activeTool)?.desc}
              </div>
              <button
                onClick={() => setActiveTool(null)}
                style={{ marginTop: 10, background: 'transparent', border: '1px solid #333', color: '#555', fontSize: 11, padding: '5px 10px', borderRadius: 5, cursor: 'pointer', width: '100%' }}
              >
                Desactivar
              </button>
            </div>
          )}
        </div>

        {/* ── Mapa ── */}
        <div style={{ flex: 1, minWidth: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid #1e1e1e', position: 'relative' }}>
          <RelevamientosMap
            relevamientos={relevamientos}
            measureActive={activeTool === 'measure'}
            onMeasureChange={(v) => setActiveTool(v ? 'measure' : null)}
          />
        </div>
      </div>
    </div>
  )
}
