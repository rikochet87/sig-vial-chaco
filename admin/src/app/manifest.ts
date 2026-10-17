import type { MetadataRoute } from 'next'

/**
 * El panel se puede instalar como app (PWA). Los íconos son el «SV» de la
 * barra lateral y los genera `scripts/build_iconos_pwa.mjs`.
 *
 * `start_url` es `/` para las dos puertas: con sesión, `page.tsx` lleva al
 * panel; con el enlace público de Hidrología, el `middleware.ts` lleva a
 * `/publico/hidrologia`. Un solo manifiesto sirve a los dos.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SIG Vial Chaco',
    short_name: 'SIG Vial',
    description: 'Infraestructura vial rural e hidrología de la Provincia del Chaco',
    lang: 'es-AR',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#1A1A1A',
    theme_color: '#0e0e0e',
    icons: [
      { src: '/iconos/icono-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/iconos/icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/iconos/icono-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
