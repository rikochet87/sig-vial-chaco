'use client'

import dynamic from 'next/dynamic'
import type { Relevamiento } from '@/types'

const RelevamientosMap = dynamic(() => import('@/components/RelevamientosMap'), { ssr: false })

export default function DashboardMap({ relevamientos }: { relevamientos: Relevamiento[] }) {
  return <RelevamientosMap relevamientos={relevamientos} />
}
