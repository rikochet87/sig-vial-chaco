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
}

export default function RelevamientosMap({ relevamientos }: Props) {
  return <MapInner relevamientos={relevamientos} />
}
