/**
 * Smart CSV Loader for Legacy Compass
 * Handles both geocoded and non-geocoded CSV files intelligently
 */

class SmartCSVLoader {
    constructor() {
        this.data = [];
        this.columns = [];
        this.hasCoordinates = false;
        this.coordinateColumns = {
            lat: null,
            lng: null
        };
        this.db = null;
    }

    /**
     * Initialize IndexedDB
     */
    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('LegacyCompassDB', 3);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Properties store with all data
                if (!db.objectStoreNames.contains('properties')) {
                    const store = db.createObjectStore('properties', { keyPath: 'id' });
                    store.createIndex('address', 'address', { unique: false });
                    store.createIndex('coordinates', ['lat', 'lng'], { unique: false });
                    store.createIndex('owner', 'ownerName', { unique: false });
                }
                
                // CSV metadata store
                if (!db.objectStoreNames.contains('csv_metadata')) {
                    db.createObjectStore('csv_metadata', { keyPath: 'filename' });
                }
            };
        });
    }

    /**
     * Auto-detect coordinate columns in CSV headers
     */
    detectCoordinateColumns(headers) {
        const latPatterns = ['lat', 'latitude', 'y', 'lat_coord', 'property_lat'];
        const lngPatterns = ['lng', 'lon', 'long', 'longitude', 'x', 'lng_coord', 'lon_coord', 'property_lng'];
        
        let latCol = null;
        let lngCol = null;
        
        headers.forEach((header, index) => {
            const lower = header.toLowerCase().trim();
            
            // Check for latitude
            if (!latCol && latPatterns.some(pattern => lower.includes(pattern))) {
                latCol = index;
            }
            
            // Check for longitude
            if (!lngCol && lngPatterns.some(pattern => lower.includes(pattern))) {
                lngCol = index;
            }
        });
        
        if (latCol !== null && lngCol !== null) {
            this.hasCoordinates = true;
            this.coordinateColumns = { lat: latCol, lng: lngCol };
            console.log(`✅ Found coordinates in columns: ${headers[latCol]} (lat), ${headers[lngCol]} (lng)`);
            return true;
        }
        
        console.log('⚠️ No coordinate columns detected - will need geocoding');
        return false;
    }

    /**
     * Parse CSV with smart column mapping
     */
    async parseCSV(csvText, filename = 'properties.csv', onProgress = null) {
        const lines = csvText.split('\n').filter(line => line.trim());
        const headers = this.parseCSVLine(lines[0]);
        this.columns = headers;
        
        // Detect coordinate columns
        this.detectCoordinateColumns(headers);
        
        // Detect other important columns
        const columnMap = this.detectColumns(headers);
        
        const properties = [];
        const totalLines = lines.length - 1;
        
        for (let i = 1; i < lines.length; i++) {
            const values = this.parseCSVLine(lines[i]);
            if (values.length !== headers.length) continue;
            
            // Build property object with smart mapping
            const property = {
                id: `${filename}_${i}`,
                // Address fields
                address: this.getValueByPattern(values, headers, columnMap.address),
                city: this.getValueByPattern(values, headers, columnMap.city) || 'Hayward',
                state: this.getValueByPattern(values, headers, columnMap.state) || 'CA',
                zip: this.getValueByPattern(values, headers, columnMap.zip) || '94544',
                
                // Owner information
                ownerName: this.buildOwnerName(values, headers, columnMap),
                ownerFirstName: this.getValueByPattern(values, headers, columnMap.ownerFirst),
                ownerLastName: this.getValueByPattern(values, headers, columnMap.ownerLast),
                mailingAddress: this.getValueByPattern(values, headers, columnMap.mailingAddress),
                ownerOccupied: this.getValueByPattern(values, headers, columnMap.ownerOccupied),
                
                // Property details
                bedrooms: parseInt(this.getValueByPattern(values, headers, columnMap.bedrooms)) || null,
                bathrooms: parseFloat(this.getValueByPattern(values, headers, columnMap.bathrooms)) || null,
                squareFeet: parseInt(this.getValueByPattern(values, headers, columnMap.squareFeet)) || null,
                lotSize: parseInt(this.getValueByPattern(values, headers, columnMap.lotSize)) || null,
                yearBuilt: parseInt(this.getValueByPattern(values, headers, columnMap.yearBuilt)) || null,
                propertyType: this.getValueByPattern(values, headers, columnMap.propertyType),
                
                // Financial
                purchasePrice: parseInt(this.getValueByPattern(values, headers, columnMap.purchasePrice)) || null,
                purchaseDate: this.getValueByPattern(values, headers, columnMap.purchaseDate),
                
                // Coordinates (if available)
                lat: this.hasCoordinates ? parseFloat(values[this.coordinateColumns.lat]) || null : null,
                lng: this.hasCoordinates ? parseFloat(values[this.coordinateColumns.lng]) || null : null,
                hasCoordinates: this.hasCoordinates && 
                               !isNaN(parseFloat(values[this.coordinateColumns.lat])) && 
                               !isNaN(parseFloat(values[this.coordinateColumns.lng])),
                
                // Metadata
                sourceFile: filename,
                importDate: new Date().toISOString(),
                
                // Activity tracking
                tags: [],
                notes: [],
                status: 'cold',
                lastContact: null
            };
            
            // Calculate derived fields
            property.isAbsentee = this.isAbsenteeOwner(property);
            property.fullAddress = `${property.address}, ${property.city}, ${property.state} ${property.zip}`;
            
            properties.push(property);
            
            // Progress callback
            if (onProgress && i % 100 === 0) {
                onProgress({
                    current: i,
                    total: totalLines,
                    percent: Math.round((i / totalLines) * 100)
                });
            }
        }
        
        this.data = properties;
        
        // Save to IndexedDB
        await this.saveToIndexedDB(properties);
        
        return {
            properties: properties,
            hasCoordinates: this.hasCoordinates,
            totalCount: properties.length,
            needsGeocoding: !this.hasCoordinates
        };
    }

    /**
     * Detect common column patterns
     */
    detectColumns(headers) {
        const patterns = {
            address: ['address', 'property_address', 'site_address', 'street', 'location'],
            city: ['city', 'site_city', 'property_city'],
            state: ['state', 'site_state', 'property_state'],
            zip: ['zip', 'zip_code', 'site_zip', 'postal'],
            ownerFirst: ['first_name', 'owner_first', '1st_owner'],
            ownerLast: ['last_name', 'owner_last', 'surname'],
            ownerFull: ['owner', 'owner_name', 'all_owners'],
            mailingAddress: ['mail_address', 'mailing_address', 'owner_address'],
            ownerOccupied: ['owner_occupied', 'occupancy', 'resident'],
            bedrooms: ['bedrooms', 'beds', 'br'],
            bathrooms: ['bathrooms', 'baths', 'ba'],
            squareFeet: ['square_feet', 'building_size', 'sqft', 'living_area'],
            lotSize: ['lot_size', 'lot_sqft', 'land_size'],
            yearBuilt: ['year_built', 'built', 'construction_year'],
            propertyType: ['property_type', 'type', 'use_code'],
            purchasePrice: ['purchase_price', 'sale_price', 'price'],
            purchaseDate: ['purchase_date', 'sale_date', 'sold_date']
        };
        
        const columnMap = {};
        
        for (const [key, searchPatterns] of Object.entries(patterns)) {
            headers.forEach((header, index) => {
                const lower = header.toLowerCase().replace(/[^a-z0-9]/g, '_');
                if (searchPatterns.some(pattern => lower.includes(pattern))) {
                    columnMap[key] = index;
                }
            });
        }
        
        return columnMap;
    }

    /**
     * Get value by column pattern
     */
    getValueByPattern(values, headers, columnIndex) {
        if (columnIndex !== undefined && columnIndex !== null) {
            return values[columnIndex]?.trim() || '';
        }
        return '';
    }

    /**
     * Build owner name from available fields
     */
    buildOwnerName(values, headers, columnMap) {
        // Try full name first
        if (columnMap.ownerFull !== undefined) {
            return this.getValueByPattern(values, headers, columnMap.ownerFull);
        }
        
        // Build from first + last
        const first = this.getValueByPattern(values, headers, columnMap.ownerFirst);
        const last = this.getValueByPattern(values, headers, columnMap.ownerLast);
        
        if (first || last) {
            return `${first} ${last}`.trim();
        }
        
        return 'Unknown Owner';
    }

    /**
     * Determine if owner is absentee
     */
    isAbsenteeOwner(property) {
        // Check owner occupied flag
        if (property.ownerOccupied) {
            const occupied = property.ownerOccupied.toLowerCase();
            if (occupied === 'n' || occupied === 'no' || occupied === 'false') {
                return true;
            }
        }
        
        // Check if mailing address differs from property address
        if (property.mailingAddress && property.address) {
            const mailing = property.mailingAddress.toLowerCase();
            const site = property.address.toLowerCase();
            if (mailing && site && !mailing.includes(site.substring(0, 10))) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Parse CSV line handling quotes
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
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        
        values.push(current.trim());
        return values;
    }

    /**
     * Save properties to IndexedDB
     */
    async saveToIndexedDB(properties) {
        if (!this.db) await this.initDB();
        
        const transaction = this.db.transaction(['properties'], 'readwrite');
        const store = transaction.objectStore('properties');
        
        for (const property of properties) {
            store.put(property);
        }
        
        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    /**
     * Load properties from IndexedDB
     */
    async loadFromDB() {
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
     * Get properties for map display
     */
    getMapProperties() {
        return this.data.filter(p => p.lat && p.lng).map(p => ({
            id: p.id,
            coordinates: [p.lng, p.lat],
            properties: {
                address: p.address,
                owner: p.ownerName,
                isAbsentee: p.isAbsentee,
                bedrooms: p.bedrooms,
                bathrooms: p.bathrooms,
                yearBuilt: p.yearBuilt,
                purchasePrice: p.purchasePrice
            }
        }));
    }

    /**
     * Export processed data
     */
    exportData() {
        const dataStr = JSON.stringify(this.data, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        
        const exportName = `legacy_compass_export_${Date.now()}.json`;
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportName);
        linkElement.click();
    }
}

// Create global instance
window.smartCSVLoader = new SmartCSVLoader();