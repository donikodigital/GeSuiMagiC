//frontend/public/sw.js
/* GeSuiMagiC – service worker : fonctionnement hors ligne.
 *  - fichiers statiques de l'application : mis en cache a la premiere visite (cache d'abord) ;
 *  - pages : reseau d'abord, copie locale si le reseau est coupe ;
 *  - lectures de l'API (GET) : reseau d'abord, derniere reponse connue si le reseau est coupe.
 * Les ecritures ne passent JAMAIS par ici : elles sont mises en file d'attente par l'application (IndexedDB).
 * Le cache de l'API est vide a chaque connexion/deconnexion (message CLEAR_API_CACHE) : jamais de donnees d'un autre compte. */
const VERSION = 'v1';
const STATIC_CACHE = `gsm-static-${VERSION}`;
const PAGES_CACHE = `gsm-pages-${VERSION}`;
const API_CACHE = `gsm-api-${VERSION}`;
const MAX_API_ENTRIES = 250;
const MAX_PAGE_ENTRIES = 60;

// L'application passe l'URL de l'API en parametre : /sw.js?api=https%3A%2F%2Fapi.exemple.com%2Fapi
const apiParam = new URL(self.location.href).searchParams.get('api');
const API_BASE = apiParam ? new URL(apiParam) : null;

const isApiRequest = (url) => !!API_BASE && url.origin === API_BASE.origin && url.pathname.startsWith(API_BASE.pathname);
const NEVER_CACHE_API = [/\/auth\//, /\/attachments\/presign/, /\/cron\//];

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i += 1) await cache.delete(keys[i]);
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(['/offline.html', '/manifest.webmanifest', '/icons/icon-192.png'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('gsm-') && ![STATIC_CACHE, PAGES_CACHE, API_CACHE].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_API_CACHE') {
    event.waitUntil(Promise.all([caches.delete(API_CACHE), caches.delete(PAGES_CACHE)]));
  }
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, cacheName, max, fallbackToOfflinePage) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok && response.status === 200) {
      cache.put(request, response.clone()).then(() => trim(cacheName, max));
    }
    return response;
  } catch (error) {
    const hit = await cache.match(request, { ignoreVary: true });
    if (hit) return hit;
    if (fallbackToOfflinePage) {
      const offline = await caches.match('/offline.html');
      if (offline) return offline;
    }
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (isApiRequest(url)) {
    if (NEVER_CACHE_API.some((re) => re.test(url.pathname)) || request.headers.get('range')) return;
    event.respondWith(networkFirst(request, API_CACHE, MAX_API_ENTRIES, false));
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest' || /\.(?:woff2?|png|jpg|jpeg|svg|ico)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Pages et donnees de navigation (RSC) : reseau d'abord.
  if (request.mode === 'navigate' || request.headers.get('RSC')) {
    event.respondWith(networkFirst(request, PAGES_CACHE, MAX_PAGE_ENTRIES, request.mode === 'navigate'));
  }
});
