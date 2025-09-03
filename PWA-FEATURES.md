# Legacy Compass PWA Features

## Overview
Legacy Compass is now a fully-featured Progressive Web App (PWA) that works seamlessly offline, enabling field agents to continue working even without internet connectivity.

## Key Features

### 1. Offline Functionality
- **Complete offline support**: App works without internet connection
- **Cached assets**: All CSS, JavaScript, and HTML files are cached
- **Property data persistence**: Uses IndexedDB for local storage
- **Map tile caching**: Automatically caches viewed map areas for offline use

### 2. Offline Queue System
- **Automatic queuing**: API calls made while offline are queued
- **Background sync**: Queued requests sync automatically when connection restored
- **Smart conflict resolution**: Handles updates intelligently when syncing
- **Visual feedback**: Shows offline status and pending sync count

### 3. Map Offline Support
- **Tile caching**: Viewed map tiles are cached automatically
- **Smart prefetching**: Caches surrounding areas at multiple zoom levels
- **Fallback tiles**: Shows cached tiles when offline
- **Cache management**: Automatic cleanup of old tiles

### 4. Installation
- **Install on mobile**: Add to home screen on iOS/Android
- **Desktop installation**: Install as desktop app on Chrome/Edge
- **Standalone mode**: Runs like native app when installed
- **Auto-updates**: Updates automatically in background

### 5. Data Synchronization
- **IndexedDB storage**: Properties stored locally
- **Offline edits**: Make changes while offline
- **Automatic sync**: Changes sync when online
- **Conflict resolution**: Smart merging of offline/online changes

## How to Use

### Installing the App

#### On Mobile (iOS/Android):
1. Open Legacy Compass in Safari (iOS) or Chrome (Android)
2. Tap the share button
3. Select "Add to Home Screen"
4. The app will now work offline

#### On Desktop (Chrome/Edge):
1. Look for install icon in address bar
2. Click "Install Legacy Compass"
3. App opens in its own window

### Working Offline

1. **Offline Indicator**: Red "Offline" badge appears in header when disconnected
2. **Continue Working**: All features remain functional
3. **Queue Status**: Yellow indicator shows pending sync items
4. **Auto-Sync**: Changes sync automatically when reconnected

### Caching Map Areas

#### Automatic Caching:
- Map tiles cache automatically as you browse
- Surrounding areas prefetch in background
- Works for zoom levels ±1 from current view

#### Manual Cache:
```javascript
// In browser console:
const offlineManager = new OfflineMapManager();
await offlineManager.cacheAreaTiles(map.getBounds(), 12, 16);
```

### Managing Cache

#### Check Cache Size:
```javascript
// In browser console:
const offlineManager = new OfflineMapManager();
const stats = await offlineManager.getCacheSize();
console.log(stats); // { tiles: 245, sizeFormatted: "12.3 MB" }
```

#### Clear Cache:
```javascript
// Clear map tiles
await offlineManager.clearCache();

// Clear all app cache (requires page reload)
caches.keys().then(names => {
    names.forEach(name => caches.delete(name));
});
```

## Technical Details

### Service Worker Strategy
- **Cache-first**: Static assets served from cache
- **Network-first**: HTML for fresh content
- **Background sync**: API calls queued and synced
- **Stale-while-revalidate**: Map tiles updated in background

### Storage Layers
1. **Service Worker Cache**: Static assets, API responses
2. **IndexedDB**: Property data, offline queue
3. **LocalStorage**: User preferences, session data
4. **Cache API**: Map tiles, images

### Update Process
1. Service worker checks for updates every 60 seconds
2. New version downloads in background
3. User prompted to reload for update
4. Old cache cleaned automatically

## Troubleshooting

### App Not Working Offline
1. Ensure service worker is registered (check DevTools > Application)
2. Verify cache is populated (DevTools > Application > Cache Storage)
3. Check IndexedDB has data (DevTools > Application > IndexedDB)

### Updates Not Installing
1. Close all tabs with the app
2. Reopen the app
3. Force update: `navigator.serviceWorker.getRegistration().then(r => r.update())`

### Cache Too Large
1. Open DevTools Console
2. Run: `await new OfflineMapManager().clearCache()`
3. Reload the page

### Sync Not Working
1. Check online status in header
2. Open DevTools > Application > Background Sync
3. Trigger manual sync: `registration.sync.register('sync-queue')`

## Browser Support

### Full Support:
- Chrome 68+ (Desktop & Mobile)
- Edge 79+
- Safari 11.3+ (iOS 11.3+)
- Firefox 61+
- Samsung Internet 8.2+

### Partial Support:
- Older Safari versions (no background sync)
- Firefox on iOS (uses Safari engine)

### Not Supported:
- Internet Explorer
- Opera Mini
- Browsers in privacy mode

## Performance Tips

1. **Pre-cache areas**: Cache your farming territory before going offline
2. **Limit zoom range**: Cache only needed zoom levels (12-16 recommended)
3. **Regular cleanup**: Clear old cache monthly
4. **Update regularly**: Install updates for bug fixes and improvements

## Security

- **HTTPS only**: PWA features require secure connection
- **Isolated storage**: Each tenant has separate storage
- **Encrypted sync**: API sync uses secure tokens
- **Auto-logout**: Session expires after inactivity

## Future Enhancements

- [ ] Selective area download for offline regions
- [ ] Compression for cached data
- [ ] P2P sync between devices
- [ ] Offline AI predictions
- [ ] Background location tracking
- [ ] Push notifications for hot properties

## Support

For issues or questions about PWA features:
1. Check browser console for errors
2. Verify service worker status in DevTools
3. Clear cache and reinstall if needed
4. Contact support with console logs