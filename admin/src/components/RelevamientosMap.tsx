'use client'
import dynamic from 'next/dynamic'
import type { Relevamiento } from '@/types'

const MapInner = dynamic(() => import('./MapInner'), { ssr: false, loading: () => (
  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#2C2C2C', color: '#9E9E9E' }}>
    Cargando mapa...
  </div>
) })

interface Props {
  relevamientos: Relevamiento[]
  measureActive?: boolean; onMeasureChange?: (v: boolean) => void
  areaActive?: boolean;    onAreaChange?:    (v: boolean) => void
  circleActive?: boolean;  onCircleChange?:  (v: boolean) => void
}

export default function RelevamientosMap({ relevamientos, measureActive, onMeasureChange, areaActive, onAreaChange, circleActive, onCircleChange }: Props) {
  return <MapInner relevamientos={relevamientos} measureActive={measureActive} onMeasureChange={onMeasureChange} areaActive={areaActive} onAreaChange={onAreaChange} circleActive={circleActive} onCircleChange={onCircleChange} />
}
