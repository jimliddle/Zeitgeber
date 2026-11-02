/* Lets the installed app start with no connection by keeping a copy of the app page.
   It handles only that page. Requests to Zepp and to the local relay are left alone,
   and no health data passes through here: your data stays encrypted in IndexedDB. */
const CACHE = 'zeitgeber-app-v1';
const SCOPE = new URL('./', self.location).pathname;
const WAIT_MS = 3000;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.add(new Request('./', { cache: 'reload' }))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('zeitgeber-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  const isAppPage = request.mode === 'navigate' && request.method === 'GET' && url.origin === self.location.origin &&
    (url.pathname === SCOPE || url.pathname === SCOPE + 'index.html');
  if (!isAppPage) return;

  /* Prefer the live page so updates arrive straight away. Use the saved copy if the
     network fails, returns an error, or takes too long. */
  const live = fetch(request).then(async response => {
    if (response.ok && !response.redirected) (await caches.open(CACHE)).put('./', response.clone());
    return response;
  });
  event.waitUntil(live.catch(() => {}));
  event.respondWith((async () => {
    const saved = await caches.match('./', { cacheName: CACHE });
    if (!saved) return live;
    const timeout = new Promise(resolve => setTimeout(resolve, WAIT_MS, null));
    const fresh = await Promise.race([live.then(r => (r.ok ? r : null)).catch(() => null), timeout]);
    return fresh || saved;
  })());
});
