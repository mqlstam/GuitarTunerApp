const CACHE_NAME = 'tunewave-cache-v2'; // Updated cache name
const APP_SHELL_URLS = [
    '/index.html',
    '/style.css',
    '/main.js',
    '/manifest.json'
];

// On install, cache the core app shell
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache and caching app shell');
                return cache.addAll(APP_SHELL_URLS);
            })
            .then(() => self.skipWaiting()) // Activate new SW immediately
    );
});

// On activate, clean up old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim()) // Take control of open clients
    );
});

// On fetch, use a stale-while-revalidate strategy
self.addEventListener('fetch', event => {
    // For navigation requests (e.g., the HTML page), use network-first
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).catch(() => caches.match('/index.html'))
        );
        return;
    }

    // For other requests (CSS, JS, images, fonts), use stale-while-revalidate
    event.respondWith(
        caches.open(CACHE_NAME).then(cache => {
            return cache.match(event.request).then(cachedResponse => {
                const fetchPromise = fetch(event.request).then(networkResponse => {
                    // If we get a valid response, update the cache
                    if (networkResponse && networkResponse.status === 200) {
                        cache.put(event.request, networkResponse.clone());
                    }
                    return networkResponse;
                }).catch(err => {
                    // Fetch failed, probably offline, do nothing.
                    console.warn('Fetch failed; serving from cache if available.', err);
                });

                // Return the cached response immediately if available,
                // while the fetch happens in the background.
                return cachedResponse || fetchPromise;
            });
        })
    );
});