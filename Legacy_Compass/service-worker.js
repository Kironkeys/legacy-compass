/**
 * Legacy Compass Service Worker
 * Enables offline functionality and PWA features
 */

const CACHE_NAME = 'legacy-compass-v1.0.0';
const DATA_CACHE_NAME = 'legacy-compass-data-v1';

// Files to cache for offline use
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
  '/data/hayward_68k.json',
  // Mapbox offline tiles would go here
];

// Install service worker and cache assets
self.addEventListener('install', event => {
  console.log('[SW] Installing service worker...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching app shell');
        return cache.addAll(urlsToCache);
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

  // Handle API calls differently
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Clone the response before caching
          const responseToCache = response.clone();
          
          // Cache successful API responses
          if (response.status === 200) {
            caches.open(DATA_CACHE_NAME).then(cache => {
              cache.put(request, responseToCache);
            });
          }
          
          return response;
        })
        .catch(() => {
          // Return cached API response when offline
          return caches.match(request);
        })
    );
    return;
  }

  // Handle Mapbox tiles
  if (url.hostname.includes('mapbox')) {
    event.respondWith(
      caches.match(request)
        .then(response => response || fetch(request))
        .catch(() => {
          // Return placeholder tile when offline
          return new Response('', { status: 204 });
        })
    );
    return;
  }

  // Cache-first strategy for app assets
  event.respondWith(
    caches.match(request)
      .then(response => {
        if (response) {
          return response;
        }

        return fetch(request).then(response => {
          // Don't cache non-successful responses
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response
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
  console.log('[SW] Background sync event');
  
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
async function syncProperties() {
  try {
    const cache = await caches.open(DATA_CACHE_NAME);
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
    console.error('[SW] Sync failed:', error);
  }
}

async function syncEnrichmentQueue() {
  try {
    // Get pending enrichment requests from IndexedDB
    const pending = await getPendingEnrichments();
    
    for (const item of pending) {
      await fetch('/api/enrichment/browser-cloud', {
        method: 'POST',
        body: JSON.stringify(item)
      });
    }
    
    // Clear pending queue
    await clearPendingEnrichments();
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