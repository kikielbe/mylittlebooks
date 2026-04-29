/* ============================================
   MY LITTLE BOOKS — Service Worker v3
   Cache busted: v3 — JS pakai network-first
   ============================================ */

// Bump versi ini setiap kali ada update JS/CSS penting
const CACHE_NAME = 'mlb-v6';

const CACHE_STATIC = [
  'index.html',
  'login.html',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js',
  'https://cdn.jsdelivr.net/npm/quill@1.3.7/dist/quill.snow.css',
  'https://cdn.jsdelivr.net/npm/quill@1.3.7/dist/quill.min.js',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.all.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js',
];

// Install — cache static CDN assets saja
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.allSettled(
        CACHE_STATIC.map(url => cache.add(url).catch(() => {}))
      ))
      .then(() => self.skipWaiting())
  );
});

// Activate — hapus semua cache lama
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('[SW] Deleting old cache:', k);
          return caches.delete(k);
        })
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch strategy:
// - API calls      → network only (selalu fresh)
// - App JS/CSS     → network-first (supaya update langsung)
// - CDN assets     → cache-first (jarang berubah)
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // API + PHP — network only, no cache
  if (url.includes('/api/') || url.endsWith('.php')) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify({ success: false, error: 'Offline' }), {
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // App JS dan CSS — network-first agar selalu fresh
  if (url.includes('/assets/js/') || url.includes('/assets/css/')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // CDN assets — cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match('index.html'));
    })
  );
});
