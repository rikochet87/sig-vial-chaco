'use client'
import dynamic from 'next/dynamic'
import type { Relevamiento } from '@/types'

const Map = dynamic(() => import('@/components/RelevamientosMap'), { ssr: false })

export default function RelevamientoDetailMap({ relevamientos }: { relevamientos: Relevamiento[] }) {
  return <Map relevamientos={relevamientos} />
}
