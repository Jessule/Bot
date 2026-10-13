/* Service worker mínimo: hace la página instalable. No guarda nada en caché (así siempre carga la última versión). */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
