/**
 * Service worker del panel instalado. Es mínimo a propósito: no guarda datos
 * ni páginas del panel, que siempre se piden a la red. Lo único que hace es
 * mostrar `sin-conexion.html` cuando se abre una página sin señal, en vez de
 * la pantalla de error del navegador.
 *
 * Guardar capas y respuestas de la API para usarlas sin conexión es otro
 * trabajo, y obliga a decidir qué se puede mostrar viejo sin que confunda.
 *
 * Al cambiar `sin-conexion.html`, subir la versión: así se reemplaza la copia.
 */
const CACHE = 'sv-sin-conexion-1'
const PAGINA = '/sin-conexion.html'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add(PAGINA)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

// Sólo las navegaciones: los datos, los tiles y la API ni pasan por acá.
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return
  event.respondWith(
    fetch(event.request).catch(() => caches.match(PAGINA).then((r) => r || Response.error())),
  )
})
