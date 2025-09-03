/**
 * Legacy Compass Service Worker
 * Enables offline functionality and PWA features
 */

const CACHE_NAME = 'legacy-compass-v1.0.1';
const DATA_CACHE_NAME = 'legacy-compass-data-v1';
const TILE_CACHE_NAME = 'legacy-compass-tiles-v1';
const API_CACHE_NAME = 'legacy-compass-api-v1';

// Core files to cache for offline use
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/styles.css',
  '/js/app.js',
  '/js/mapbox-init.js',
  '/js/property-loader.js',
  '/js/storage-manager.js',
  '/js/ai-assistant.js',
  '/js/voice-recorder.js',
  '/js/data-enrichment.js',
  '/data/hayward_68k.json',
  // External dependencies
  'https://api.mapbox.com/mapbox-gl-js/v3.5.0/mapbox-gl.css',
  'https://api.mapbox.com/mapbox-gl-js/v3.5.0/mapbox-gl.js',
  'https://cdn.jsdelivr.net/npm/alpinejs@3.13.0/dist/cdn.min.js'
];

// Offline queue for API calls
let offlineQueue = [];

// Install service worker and cache assets
self.addEventListener('install', event => {
  console.log('[SW] Installing service worker...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching app shell');
        // Cache each URL individually to handle failures gracefully
        return Promise.allSettled(
          urlsToCache.map(url => 
            cache.add(url).catch(err => 
              console.warn(`[SW] Failed to cache ${url}:`, err)
            )
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// Activate service worker and clean old caches
self.addEventListener('activate', event => {
  console.log('[SW] Activating service worker...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(cacheName => {
            return cacheName.startsWith('legacy-compass-') &&
                   cacheName !== CACHE_NAME &&
                   cacheName !== DATA_CACHE_NAME;
          })
          .map(cacheName => {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Handle API calls with offline queue
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request.clone())
        .then(response => {
          // Clone the response before caching
          const responseToCache = response.clone();
          
          // Cache successful API responses
          if (response.status === 200) {
            caches.open(API_CACHE_NAME).then(cache => {
              cache.put(request, responseToCache);
            });
          }
          
          return response;
        })
        .catch(async () => {
          // Check if we have a cached response
          const cachedResponse = await caches.match(request);
          if (cachedResponse) {
            return cachedResponse;
          }
          
          // Queue write operations for later sync
          if (request.method === 'POST' || request.method === 'PUT' || request.method === 'DELETE') {
            await queueOfflineRequest(request.clone());
            return new Response(JSON.stringify({
              success: true,
              offline: true,
              message: 'Request queued for sync when online'
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          // Return error for read operations without cache
          return new Response(JSON.stringify({
            error: 'Offline',
            message: 'No cached data available'
          }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        })
    );
    return;
  }

  // Handle Mapbox tiles with intelligent caching
  if (url.hostname.includes('mapbox')) {
    event.respondWith(
      caches.open(TILE_CACHE_NAME).then(cache => {
        return cache.match(request).then(response => {
          const fetchPromise = fetch(request).then(networkResponse => {
            // Cache tiles for offline use
            if (networkResponse.status === 200) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(() => {
            // Return cached tile or empty response if offline
            return response || new Response('', { status: 204 });
          });
          
          // Return cached response immediately, fetch in background
          return response || fetchPromise;
        });
      })
    );
    return;
  }

  // Network-first for HTML (for fresh content)
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, responseToCache);
          });
          return response;
        })
        .catch(() => caches.match(request) || caches.match('/index.html'))
    );
    return;
  }

  // Cache-first strategy for static assets
  event.respondWith(
    caches.match(request)
      .then(response => {
        if (response) {
          // Return cache hit, but refresh in background
          const fetchPromise = fetch(request).then(networkResponse => {
            if (networkResponse.status === 200) {
              caches.open(CACHE_NAME).then(cache => {
                cache.put(request, networkResponse.clone());
              });
            }
            return networkResponse;
          }).catch(() => response);
          
          return response;
        }

        // No cache hit, fetch from network
        return fetch(request).then(response => {
          // Don't cache non-successful responses
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, responseToCache);
          });

          return response;
        });
      })
      .catch(() => {
        // Return offline page for navigation requests
        if (request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      })
  );
});

// Background sync for offline actions
self.addEventListener('sync', event => {
  console.log('[SW] Background sync event:', event.tag);
  
  if (event.tag === 'sync-queue') {
    event.waitUntil(syncOfflineQueue());
  }
  
  if (event.tag === 'sync-properties') {
    event.waitUntil(syncProperties());
  }
  
  if (event.tag === 'sync-enrichment') {
    event.waitUntil(syncEnrichmentQueue());
  }
});

// Push notifications
self.addEventListener('push', event => {
  const options = {
    body: event.data ? event.data.text() : 'New property update',
    icon: '/assets/icons/icon-192x192.png',
    badge: '/assets/icons/badge-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'view',
        title: 'View Property',
        icon: '/assets/icons/view.png'
      },
      {
        action: 'dismiss',
        title: 'Dismiss',
        icon: '/assets/icons/dismiss.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('Legacy Compass', options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'view') {
    clients.openWindow('/');
  }
});

// Helper functions
async function queueOfflineRequest(request) {
  try {
    const body = await request.text();
    const queueItem = {
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body: body,
      timestamp: Date.now()
    };
    
    // Store in IndexedDB for persistence
    const db = await openDB();
    const tx = db.transaction(['offline_queue'], 'readwrite');
    await tx.objectStore('offline_queue').add(queueItem);
    
    // Also keep in memory for quick access
    offlineQueue.push(queueItem);
    
    // Register for background sync
    if ('sync' in self.registration) {
      await self.registration.sync.register('sync-queue');
    }
  } catch (error) {
    console.error('[SW] Failed to queue request:', error);
  }
}

async function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('LegacyCompassOffline', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('offline_queue')) {
        db.createObjectStore('offline_queue', { 
          keyPath: 'id', 
          autoIncrement: true 
        });
      }
      
      if (!db.objectStoreNames.contains('pending_enrichments')) {
        db.createObjectStore('pending_enrichments', { 
          keyPath: 'id', 
          autoIncrement: true 
        });
      }
    };
  });
}

async function syncOfflineQueue() {
  try {
    const db = await openDB();
    const tx = db.transaction(['offline_queue'], 'readonly');
    const store = tx.objectStore('offline_queue');
    const requests = await store.getAll();
    
    for (const item of requests) {
      try {
        const response = await fetch(item.url, {
          method: item.method,
          headers: item.headers,
          body: item.body
        });
        
        if (response.ok) {
          // Remove from queue after successful sync
          const deleteTx = db.transaction(['offline_queue'], 'readwrite');
          await deleteTx.objectStore('offline_queue').delete(item.id);
        }
      } catch (error) {
        console.error('[SW] Failed to sync request:', error);
        // Keep in queue for next sync attempt
      }
    }
  } catch (error) {
    console.error('[SW] Queue sync failed:', error);
  }
}

async function syncProperties() {
  try {
    const cache = await caches.open(API_CACHE_NAME);
    const requests = await cache.keys();
    
    // Filter for property update requests
    const propertyUpdates = requests.filter(req => 
      req.url.includes('/api/data/update-property')
    );
    
    // Replay all updates
    for (const request of propertyUpdates) {
      const cachedResponse = await cache.match(request);
      const data = await cachedResponse.json();
      
      // Retry the update
      await fetch(request, {
        method: 'POST',
        body: JSON.stringify(data)
      });
      
      // Remove from cache after successful sync
      await cache.delete(request);
    }
  } catch (error) {
    console.error('[SW] Property sync failed:', error);
  }
}

async function syncEnrichmentQueue() {
  try {
    const db = await openDB();
    const tx = db.transaction(['pending_enrichments'], 'readonly');
    const store = tx.objectStore('pending_enrichments');
    const pending = await store.getAll();
    
    for (const item of pending) {
      try {
        const response = await fetch('/api/enrichment/browser-cloud', {
          method: 'POST',
          body: JSON.stringify(item.data)
        });
        
        if (response.ok) {
          const deleteTx = db.transaction(['pending_enrichments'], 'readwrite');
          await deleteTx.objectStore('pending_enrichments').delete(item.id);
        }
      } catch (error) {
        console.error('[SW] Failed to sync enrichment:', error);
      }
    }
  } catch (error) {
    console.error('[SW] Enrichment sync failed:', error);
  }
}

// Message handler for client communication
self.addEventListener('message', event => {
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data.type === 'CACHE_PROPERTIES') {
    caches.open(DATA_CACHE_NAME).then(cache => {
      cache.put('/data/hayward_68k.json', new Response(
        JSON.stringify(event.data.properties)
      ));
    });
  }
});