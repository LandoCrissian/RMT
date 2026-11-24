const CACHE='rmt-offline-v5';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.add('/offline.html')));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('rmt-offline-')&&key!==CACHE).map(key=>caches.delete(key)))));self.clients.claim();});
// Never cache API responses, authenticated pages, or external applications.
self.addEventListener('fetch',event=>{if(event.request.mode==='navigate'&&new URL(event.request.url).origin===self.location.origin&&!new URL(event.request.url).pathname.startsWith('/api/')){event.respondWith(fetch(event.request).catch(()=>caches.match('/offline.html')));}});
