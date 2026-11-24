const CACHE='rmt-offline-v6';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.add('/offline.html')));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('rmt-offline-')&&key!==CACHE).map(key=>caches.delete(key)))));self.clients.claim();});
// Auth helpers and callbacks must reach Firebase unchanged. An offline fallback
// must never replace a callback, iframe, or credential exchange.
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(url.pathname.startsWith('/__/')||url.pathname.startsWith('/api/'))return;if(event.request.mode==='navigate'&&url.origin===self.location.origin){event.respondWith(fetch(event.request).catch(()=>caches.match('/offline.html')));}});
