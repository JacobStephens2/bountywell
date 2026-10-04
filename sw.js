// Service Worker for Bountywell

const CACHE_VERSION = 'v2.1.3';
const CACHE_NAME = `bountywell-${CACHE_VERSION}`;
const urlsToCache = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/js/categories.js',
    '/js/storage.js',
    '/js/day-log.js',
    '/js/pwa.js',
    '/js/history.js',
    '/js/auth.js',
    '/js/focus-trap.js',
    '/manifest.json',
    '/favicon.ico',
    '/assets/icons/icon-48x48.png',
    '/assets/icons/icon-72x72.png',
    '/assets/icons/icon-96x96.png',
    '/assets/icons/icon-128x128.png',
    '/assets/icons/icon-144x144.png',
    '/assets/icons/icon-152x152.png',
    '/assets/icons/icon-192x192.png',
    '/assets/icons/icon-384x384.png',
    '/assets/icons/icon-512x512.png'
];

// Install event - cache resources
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                return cache.addAll(urlsToCache);
            })
            .then(() => {
                // Skip waiting to activate immediately
                return self.skipWaiting();
            })
    );
});

// Fetch event - implement cache-first strategy with network fallback
self.addEventListener('fetch', event => {
    // Never cache API requests — let them pass through to the network
    if (event.request.url.includes('/api/')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // The KMP/Compose Wasm demo lives at /dd-kmp/ (and loads /sql-wasm.wasm from
    // root). Never cache it — it's a separate app that's redeployed independently,
    // and cache-first would pin a stale build. Always go to the network.
    if (event.request.url.includes('/dd-kmp/') || event.request.url.endsWith('/sql-wasm.wasm')) {
        event.respondWith(fetch(event.request));
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Return cached version if available
                if (response) {
                    // In background, check for updates
                    fetch(event.request)
                        .then(networkResponse => {
                            // Update cache if network response is different
                            if (networkResponse.status === 200) {
                                const responseClone = networkResponse.clone();
                                caches.open(CACHE_NAME).then(cache => {
                                    cache.put(event.request, responseClone);
                                });
                            }
                        })
                        .catch(() => {
                            // Network failed, keep using cached version
                        });
                    
                    return response;
                }
                
                // If not in cache, fetch from network
                return fetch(event.request)
                    .then(networkResponse => {
                        // Cache the response for future use
                        if (networkResponse.status === 200) {
                            const responseClone = networkResponse.clone();
                            caches.open(CACHE_NAME).then(cache => {
                                cache.put(event.request, responseClone);
                            });
                        }
                        return networkResponse;
                    });
            })
    );
});

// Activate event - clean up old caches and notify clients of update
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            // Force update of all clients
            return self.clients.claim();
        }).then(() => {
            // Notify all clients about the new version
            return self.clients.matchAll().then(clients => {
                clients.forEach(client => {
                    client.postMessage({
                        type: 'SW_UPDATED',
                        version: CACHE_VERSION,
                        timestamp: new Date().toISOString()
                    });
                });
            });
        })
    );
});

// Background sync for offline data
self.addEventListener('sync', event => {
    if (event.tag === 'background-sync') {
        event.waitUntil(doBackgroundSync());
    }
});

// Handle messages from the main app
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'GET_VERSION') {
        event.ports[0].postMessage({
            version: CACHE_VERSION,
            timestamp: new Date().toISOString()
        });
    }
});

function doBackgroundSync() {
    // Handle any background sync tasks
}
