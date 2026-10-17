'use client'

import { useEffect } from 'react'

/**
 * Registra `public/sw.js`, que es lo que hace instalable al panel. Sólo en
 * producción: en `next dev` un service worker deja páginas viejas pegadas.
 */
export default function RegistrarSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {})
  }, [])
  return null
}
