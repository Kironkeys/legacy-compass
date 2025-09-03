/**
 * Legacy Compass Geocoding Service
 * Handles batch geocoding of 68k properties with caching in IndexedDB
 */

class GeocodingService {
    constructor() {
        this.db = null;
        this.mapboxToken = window.CONFIG?.MAPBOX_TOKEN;
        this.geocodingQueue = [];
        this.isProcessing = false;
        this.stats = {
            total: 0,
            processed: 0,
            cached: 0,
            failed: 0
        };
        this.onProgress = null;
        this.batchSize = 50;
        this.rateLimit = 600; // ms between batches (100 req/min for free tier)
    }

    /**
     * Initialize IndexedDB for geocoding cache
     */
    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('LegacyCompassDB', 2);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                console.log('✅ IndexedDB initialized');
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create geocoding cache store
                if (!db.objectStoreNames.contains('geocoding')) {
                    const geocodingStore = db.createObjectStore('geocoding', { keyPath: 'address' });
                    geocodingStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
                
                // Create properties store
                if (!db.objectStoreNames.contains('properties')) {
                    const propStore = db.createObjectStore('properties', { keyPath: 'id' });
                    propStore.createIndex('address', 'address', { unique: false });
                    propStore.createIndex('coordinates', ['coordinates.lat', 'coordinates.lng'], { unique: false });
                }
            };
        });
    }

    /**
     * Get cached geocoding result
     */
    async getCached(address) {
        if (!this.db) await this.initDB();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['geocoding'], 'readonly');
            const store = transaction.objectStore('geocoding');
            const request = store.get(address);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Save geocoding result to cache
     */
    async saveToCache(address, coordinates) {
        if (!this.db) await this.initDB();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['geocoding'], 'readwrite');
            const store = transaction.objectStore('geocoding');
            const request = store.put({
                address: address,
                coordinates: coordinates,
                timestamp: Date.now()
            });
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Geocode a single address using Mapbox
     */
    async geocodeAddress(address) {
        // Check cache first
        const cached = await this.getCached(address);
        if (cached?.coordinates) {
            this.stats.cached++;
            return cached.coordinates;
        }

        // Clean address for geocoding
        const cleanAddress = `${address}, Hayward, CA 94544`;
        const encodedAddress = encodeURIComponent(cleanAddress);
        
        try {
            const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedAddress}.json?access_token=${this.mapboxToken}&limit=1&types=address`;
            
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.features && data.features.length > 0) {
                const [lng, lat] = data.features[0].center;
                const coordinates = { lat, lng };
                
                // Save to cache
                await this.saveToCache(address, coordinates);
                
                return coordinates;
            } else {
                // No results found
                console.warn(`No geocoding results for: ${address}`);
                return null;
            }
        } catch (error) {
            console.error(`Geocoding failed for ${address}:`, error);
            this.stats.failed++;
            return null;
        }
    }

    /**
     * Process a batch of addresses
     */
    async processBatch(batch) {
        const results = [];
        
        for (const item of batch) {
            const coordinates = await this.geocodeAddress(item.address);
            
            if (coordinates) {
                results.push({
                    ...item,
                    coordinates: coordinates
                });
            } else {
                // Fall back to estimated coordinates
                results.push({
                    ...item,
                    coordinates: item.estimatedCoordinates
                });
            }
            
            this.stats.processed++;
            
            // Update progress
            if (this.onProgress) {
                this.onProgress({
                    processed: this.stats.processed,
                    total: this.stats.total,
                    cached: this.stats.cached,
                    failed: this.stats.failed,
                    percent: Math.round((this.stats.processed / this.stats.total) * 100)
                });
            }
        }
        
        return results;
    }

    /**
     * Process all properties in queue
     */
    async processQueue() {
        if (this.isProcessing) return;
        
        this.isProcessing = true;
        const allResults = [];
        
        while (this.geocodingQueue.length > 0) {
            const batch = this.geocodingQueue.splice(0, this.batchSize);
            const results = await this.processBatch(batch);
            allResults.push(...results);
            
            // Save batch to IndexedDB
            await this.savePropertiesToDB(results);
            
            // Rate limiting
            if (this.geocodingQueue.length > 0) {
                await this.sleep(this.rateLimit);
            }
        }
        
        this.isProcessing = false;
        return allResults;
    }

    /**
     * Save properties to IndexedDB
     */
    async savePropertiesToDB(properties) {
        if (!this.db) await this.initDB();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['properties'], 'readwrite');
            const store = transaction.objectStore('properties');
            
            properties.forEach(property => {
                store.put(property);
            });
            
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    /**
     * Load all geocoded properties from DB
     */
    async loadGeocodedProperties() {
        if (!this.db) await this.initDB();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['properties'], 'readonly');
            const store = transaction.objectStore('properties');
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Start geocoding process for all properties
     */
    async geocodeProperties(properties, onProgress) {
        this.onProgress = onProgress;
        this.stats.total = properties.length;
        this.stats.processed = 0;
        this.stats.cached = 0;
        this.stats.failed = 0;
        
        // Initialize DB
        if (!this.db) await this.initDB();
        
        // Check what's already geocoded
        const geocoded = await this.loadGeocodedProperties();
        const geocodedAddresses = new Set(geocoded.map(p => p.address));
        
        // Filter properties that need geocoding
        const needsGeocoding = properties.filter(p => !geocodedAddresses.has(p.address));
        
        console.log(`📍 Need to geocode ${needsGeocoding.length} of ${properties.length} properties`);
        
        if (needsGeocoding.length === 0) {
            // All properties already geocoded
            if (onProgress) {
                onProgress({
                    processed: properties.length,
                    total: properties.length,
                    cached: properties.length,
                    failed: 0,
                    percent: 100
                });
            }
            return geocoded;
        }
        
        // Add to queue
        this.geocodingQueue = needsGeocoding.map(p => ({
            ...p,
            estimatedCoordinates: p.coordinates // Keep original estimate as fallback
        }));
        
        // Process queue
        const newlyGeocoded = await this.processQueue();
        
        // Combine with already geocoded
        return [...geocoded, ...newlyGeocoded];
    }

    /**
     * Sleep helper for rate limiting
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get geocoding statistics
     */
    getStats() {
        return this.stats;
    }

    /**
     * Clear all cached geocoding data
     */
    async clearCache() {
        if (!this.db) await this.initDB();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['geocoding', 'properties'], 'readwrite');
            
            transaction.objectStore('geocoding').clear();
            transaction.objectStore('properties').clear();
            
            transaction.oncomplete = () => {
                console.log('✅ Geocoding cache cleared');
                resolve();
            };
            transaction.onerror = () => reject(transaction.error);
        });
    }

    /**
     * Export geocoded properties as JSON
     */
    async exportGeocodedData() {
        const properties = await this.loadGeocodedProperties();
        const dataStr = JSON.stringify(properties, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        
        const exportName = `hayward_geocoded_${Date.now()}.json`;
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportName);
        linkElement.click();
        
        return properties.length;
    }
}

// Create global instance
window.geocodingService = new GeocodingService();