const CACHE_NAME = 'ssi-scoring-v1'
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/icon.svg',
  '/manifest.json',
]

// Install — precache shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  )
  self.skipWaiting()
})

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Fetch — network-first for API, cache-first for assets
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Never cache API calls — always go to network
  if (url.pathname.startsWith('/api')) {
    return
  }

  // Never cache the service worker script or manifest
  if (url.pathname === '/sw.js' || url.pathname === '/manifest.json') {
    return
  }

  // For app shell and assets: network-first with cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful GET responses
        if (response.ok && request.method === 'GET') {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
        }
        return response
      })
      .catch(() =>
        caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse
          }
          return new Response('Offline', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain' },
          })
        })
      )
  )
})
