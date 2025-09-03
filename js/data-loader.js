/**
 * Legacy Compass Data Loader
 * Handles loading and parsing the 68k Hayward properties CSV
 */

class DataLoader {
    constructor() {
        this.properties = [];
        this.loaded = false;
        this.onProgress = null;
    }
    
    /**
     * Load and parse the Hayward owners CSV
     * This baby has 68k properties!
     */
    async loadHaywardData(onProgress, limit = 5000) {
        this.onProgress = onProgress;
        
        try {
            console.log(`🚀 Loading Hayward properties (limit: ${limit})...`);
            
            // Fetch the CSV file
            const response = await fetch('/data/hayward_owners.csv');
            const csvText = await response.text();
            
            // Parse the CSV with limit for performance
            this.properties = this.parseCSV(csvText, limit);
            
            console.log(`✅ Loaded ${this.properties.length} properties!`);
            this.loaded = true;
            
            // Store in localStorage for faster subsequent loads
            this.cacheProperties();
            
            return this.properties;
            
        } catch (error) {
            console.error('Failed to load Hayward data:', error);
            
            // Try to load from cache as fallback
            const cached = this.loadFromCache();
            if (cached) {
                console.log('📦 Loaded from cache');
                this.properties = cached;
                this.loaded = true;
                return cached;
            }
            
            throw error;
        }
    }
    
    /**
     * Parse CSV text into property objects
     */
    parseCSV(csvText, limit = 5000) {
        const lines = csvText.split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        const properties = [];
        
        // Process in chunks for better performance
        const chunkSize = 1000;
        const maxLines = Math.min(lines.length, limit + 1); // +1 for header
        
        for (let i = 1; i < maxLines; i++) {
            if (!lines[i].trim()) continue;
            
            // Parse CSV line (handle commas in quotes)
            const values = this.parseCSVLine(lines[i]);
            
            if (values.length !== headers.length) continue;
            
            // Create property object
            const property = {
                id: `prop_${i}`,
                address: values[0]?.trim() || '',
                owner: {
                    name: values[1]?.trim() || 'Unknown',
                    mailing: values[2]?.trim() || '',
                    type: values[3]?.toLowerCase() === 'true' ? 'absentee' : 'owner_occupied'
                },
                // We'll need to geocode these addresses later
                coordinates: this.estimateCoordinates(values[0], i),
                financial: {
                    // These will be enriched later
                    equity: Math.floor(Math.random() * 100), // Placeholder
                    value: 400000 + Math.floor(Math.random() * 600000) // Placeholder
                },
                activity: {
                    status: 'cold',
                    tags: [],
                    notes: []
                }
            };
            
            properties.push(property);
            
            // Report progress every chunk
            if (i % chunkSize === 0 && this.onProgress) {
                this.onProgress(i, lines.length - 1);
            }
        }
        
        return properties;
    }
    
    /**
     * Parse a CSV line handling commas in quotes
     */
    parseCSVLine(line) {
        const values = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        
        values.push(current); // Don't forget the last value
        return values;
    }
    
    /**
     * Estimate coordinates for properties (temporary until we geocode)
     * Groups properties by street name for more realistic clustering
     */
    estimateCoordinates(address, index) {
        // Hayward center coordinates  
        const centerLat = 37.6688;
        const centerLng = -122.0808;
        
        // Extract street name from address
        const streetMatch = address.match(/\d+\s+(.+?)(\s+\d+)?$/i);
        const streetName = streetMatch ? streetMatch[1] : address;
        
        // Create consistent coordinates for same street
        const streetHash = this.hashCode(streetName);
        const houseHash = this.hashCode(address);
        
        // Streets run in lines, houses along the street
        const streetAngle = (streetHash % 360) * Math.PI / 180;
        const streetDistance = (streetHash % 50) / 2000; // Streets within 0.025 degrees
        
        // Position along the street (houses in a line)
        const housePosition = (houseHash % 100) / 10000; // Small offset along street
        const houseSide = (houseHash % 2) * 0.0001 - 0.00005; // Alternate sides of street
        
        return {
            lat: centerLat + Math.cos(streetAngle) * streetDistance + Math.cos(streetAngle + Math.PI/2) * housePosition,
            lng: centerLng + Math.sin(streetAngle) * streetDistance + Math.sin(streetAngle + Math.PI/2) * housePosition + houseSide
        };
    }
    
    /**
     * Simple hash function for consistent coordinate generation
     */
    hashCode(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash);
    }
    
    /**
     * Cache properties in localStorage
     */
    cacheProperties() {
        try {
            // Only cache a subset for localStorage limits
            const subset = this.properties.slice(0, 5000);
            localStorage.setItem('hayward_properties_cache', JSON.stringify({
                timestamp: Date.now(),
                count: this.properties.length,
                sample: subset
            }));
        } catch (e) {
            console.warn('Could not cache properties:', e);
        }
    }
    
    /**
     * Load properties from cache
     */
    loadFromCache() {
        try {
            const cached = localStorage.getItem('hayward_properties_cache');
            if (cached) {
                const data = JSON.parse(cached);
                // Check if cache is less than 24 hours old
                if (Date.now() - data.timestamp < 86400000) {
                    return data.sample;
                }
            }
        } catch (e) {
            console.warn('Could not load from cache:', e);
        }
        return null;
    }
    
    /**
     * Get properties for display (paginated)
     */
    getProperties(limit = 100, offset = 0) {
        return this.properties.slice(offset, offset + limit);
    }
    
    /**
     * Filter properties
     */
    filterProperties(filters) {
        return this.properties.filter(property => {
            // Search filter
            if (filters.search) {
                const search = filters.search.toLowerCase();
                const matchAddress = property.address?.toLowerCase().includes(search);
                const matchOwner = property.owner?.name?.toLowerCase().includes(search);
                if (!matchAddress && !matchOwner) return false;
            }
            
            // Absentee filter
            if (filters.absenteeOnly) {
                if (property.owner?.type !== 'absentee') return false;
            }
            
            // Equity filter (once we have real equity data)
            if (filters.equityMin > 0) {
                if ((property.financial?.equity || 0) < filters.equityMin) return false;
            }
            
            return true;
        });
    }
    
    /**
     * Get statistics
     */
    getStats(properties = null) {
        const props = properties || this.properties;
        const total = props.length;
        const absenteeCount = props.filter(p => p.owner?.type === 'absentee').length;
        const totalEquity = props.reduce((sum, p) => sum + (p.financial?.equity || 0), 0);
        
        return {
            total,
            absentee: total > 0 ? Math.round((absenteeCount / total) * 100) : 0,
            avgEquity: total > 0 ? Math.round(totalEquity / total) : 0
        };
    }
}

// Create global instance
window.dataLoader = new DataLoader();