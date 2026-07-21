'use client'
import { useState, useEffect, Suspense } from 'react'
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
  const activeTool    = searchParams.get('tool')
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

  // Mapa ocupa toda la altura — la toolbar flotante vive dentro del mapa (MapInner)
  return (
    <div style={{ height: 'calc(100vh - 32px)', overflow: 'hidden', position: 'relative' }}>
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
  )
}

export default function HerramientasPage() {
  return (
    <Suspense fallback={<div style={{ color: '#555', padding: 32 }}>Cargando...</div>}>
      <HerramientasInner />
    </Suspense>
  )
}
