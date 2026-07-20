'use client'
import React, { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import type { Relevamiento } from '@/types'

const RelevamientosMap = dynamic(() => import('@/components/RelevamientosMap'), {
  ssr: false,
  loading: () => (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111', color: '#9E9E9E' }}>
      Cargando mapa...
    </div>
  ),
})

function HerramientasInner() {
  const searchParams  = useSearchParams()
  const router        = useRouter()
  const activeTool    = searchParams.get('tool') // 'measure' | null
  const [relevamientos, setRelevamientos] = useState<Relevamiento[]>([])

  useEffect(() => {
    createClient()
      .from('relevamientos')
      .select('id,fecha,tipo,tecnico_id,estado_calzada,coords_lat,coords_lng,coords_linea,cc_asociado,zona,ruta_tramo,observaciones,fotos,datos_especificos,sincronizado_en')
      .limit(500)
      .then(({ data }) => setRelevamientos((data as Relevamiento[]) ?? []))
  }, [])

  const setTool = (tool: string | null) =>
    router.replace(tool ? `/dashboard/herramientas?tool=${tool}` : '/dashboard/herramientas')

  const TOOL_BTN = (id: string, label: string, color: string): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 8,
    background: activeTool === id ? `${color}22` : '#191919',
    border: `1px solid ${activeTool === id ? color : '#2a2a2a'}`,
    borderRadius: 6, padding: '7px 14px', cursor: 'pointer',
    color: activeTool === id ? color : '#9E9E9E',
    fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 32px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', flexShrink: 0, flexWrap: 'wrap' }}>
        <span style={{ color: '#555', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginRight: 4 }}>Herramientas</span>
        <button style={TOOL_BTN('measure', '📏 Medir distancia', '#F5C300')} onClick={() => setTool(activeTool === 'measure' ? null : 'measure')}>
          📏 Medir distancia
        </button>
        <button style={TOOL_BTN('area', '📐 Medir área', '#ce93d8')} onClick={() => setTool(activeTool === 'area' ? null : 'area')}>
          📐 Medir área
        </button>
        <button style={TOOL_BTN('circle', '⭕ Trazar círculo', '#f0a060')} onClick={() => setTool(activeTool === 'circle' ? null : 'circle')}>
          ⭕ Trazar círculo
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid #1e1e1e', position: 'relative' }}>
        <RelevamientosMap
          relevamientos={relevamientos}
          measureActive={activeTool === 'measure'}
          onMeasureChange={v => setTool(v ? 'measure' : null)}
          areaActive={activeTool === 'area'}
          onAreaChange={v => setTool(v ? 'area' : null)}
          circleActive={activeTool === 'circle'}
          onCircleChange={v => setTool(v ? 'circle' : null)}
        />
      </div>
    </div>
  )
}

export default function HerramientasPage() {
  return (
    <Suspense fallback={<div style={{ color: '#555', padding: 32 }}>Cargando...</div>}>
      <HerramientasInner />
    </Suspense>
  )
}
