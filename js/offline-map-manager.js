/**
 * Offline Map Manager for Legacy Compass
 * Handles caching and serving of map tiles for offline use
 */

class OfflineMapManager {
    constructor() {
        this.tileCache = 'legacy-compass-tiles-v1';
        this.maxZoom = 18;
        this.minZoom = 10;
        this.tileUrls = new Set();
    }

    /**
     * Cache tiles for a specific area
     * @param {Object} bounds - Map bounds to cache
     * @param {Number} minZoom - Minimum zoom level
     * @param {Number} maxZoom - Maximum zoom level
     */
    async cacheAreaTiles(bounds, minZoom = 12, maxZoom = 16) {
        const tiles = this.getTilesForBounds(bounds, minZoom, maxZoom);
        const totalTiles = tiles.length;
        let cached = 0;

        console.log(`📍 Caching ${totalTiles} map tiles for offline use...`);

        // Cache tiles in batches to avoid overwhelming the browser
        const batchSize = 10;
        for (let i = 0; i < tiles.length; i += batchSize) {
            const batch = tiles.slice(i, i + batchSize);
            await Promise.allSettled(
                batch.map(tile => this.cacheTile(tile))
            );
            cached += batch.length;
            
            // Update progress
            if (this.onProgress) {
                this.onProgress(cached, totalTiles);
            }
        }

        console.log(`✅ Cached ${cached} map tiles successfully`);
        return cached;
    }

    /**
     * Get all tiles needed for a bounds area
     */
    getTilesForBounds(bounds, minZoom, maxZoom) {
        const tiles = [];
        
        for (let z = minZoom; z <= maxZoom; z++) {
            const minTile = this.latLngToTile(bounds.getNorth(), bounds.getWest(), z);
            const maxTile = this.latLngToTile(bounds.getSouth(), bounds.getEast(), z);
            
            for (let x = minTile.x; x <= maxTile.x; x++) {
                for (let y = minTile.y; y <= maxTile.y; y++) {
                    tiles.push({ x, y, z });
                }
            }
        }
        
        return tiles;
    }

    /**
     * Convert lat/lng to tile coordinates
     */
    latLngToTile(lat, lng, zoom) {
        const x = Math.floor((lng + 180) / 360 * Math.pow(2, zoom));
        const y = Math.floor((1 - Math.log(
            Math.tan(lat * Math.PI / 180) + 
            1 / Math.cos(lat * Math.PI / 180)
        ) / Math.PI) / 2 * Math.pow(2, zoom));
        
        return { x, y };
    }

    /**
     * Cache a single tile
     */
    async cacheTile(tile) {
        const urls = this.getTileUrls(tile);
        
        try {
            const cache = await caches.open(this.tileCache);
            
            for (const url of urls) {
                if (!await cache.match(url)) {
                    const response = await fetch(url);
                    if (response.ok) {
                        await cache.put(url, response);
                        this.tileUrls.add(url);
                    }
                }
            }
        } catch (error) {
            console.warn(`Failed to cache tile ${tile.z}/${tile.x}/${tile.y}:`, error);
        }
    }

    /**
     * Get URLs for different tile providers
     */
    getTileUrls(tile) {
        const urls = [];
        
        // Mapbox Streets
        if (window.MAPBOX_TOKEN) {
            urls.push(
                `https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/${tile.z}/${tile.x}/${tile.y}?access_token=${window.MAPBOX_TOKEN}`
            );
        }
        
        // OpenStreetMap fallback
        urls.push(
            `https://tile.openstreetmap.org/${tile.z}/${tile.x}/${tile.y}.png`
        );
        
        return urls;
    }

    /**
     * Clear cached tiles
     */
    async clearCache() {
        try {
            await caches.delete(this.tileCache);
            this.tileUrls.clear();
            console.log('✅ Map tile cache cleared');
        } catch (error) {
            console.error('Failed to clear tile cache:', error);
        }
    }

    /**
     * Get cache size
     */
    async getCacheSize() {
        try {
            const cache = await caches.open(this.tileCache);
            const keys = await cache.keys();
            
            let totalSize = 0;
            for (const request of keys) {
                const response = await cache.match(request);
                const blob = await response.blob();
                totalSize += blob.size;
            }
            
            return {
                tiles: keys.length,
                size: totalSize,
                sizeFormatted: this.formatBytes(totalSize)
            };
        } catch (error) {
            console.error('Failed to get cache size:', error);
            return { tiles: 0, size: 0, sizeFormatted: '0 B' };
        }
    }

    /**
     * Format bytes to human readable
     */
    formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 B';
        
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    /**
     * Prefetch tiles for current viewport
     */
    async prefetchViewport(map) {
        if (!navigator.onLine) return;
        
        const bounds = map.getBounds();
        const zoom = Math.floor(map.getZoom());
        
        // Cache current zoom and one level up/down
        const minZ = Math.max(this.minZoom, zoom - 1);
        const maxZ = Math.min(this.maxZoom, zoom + 1);
        
        return this.cacheAreaTiles(bounds, minZ, maxZ);
    }

    /**
     * Setup automatic caching based on map movement
     */
    setupAutoCaching(map) {
        let cacheTimeout;
        
        const debouncedCache = () => {
            clearTimeout(cacheTimeout);
            cacheTimeout = setTimeout(() => {
                if (navigator.onLine) {
                    this.prefetchViewport(map);
                }
            }, 2000); // Wait 2 seconds after map stops moving
        };
        
        map.on('moveend', debouncedCache);
        map.on('zoomend', debouncedCache);
    }
}

// Export for use in app
window.OfflineMapManager = OfflineMapManager;