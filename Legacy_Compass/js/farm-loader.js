/**
 * Legacy Compass Farm Loader
 * Handles loading realtor-specific farm CSVs with rich property data
 */

class FarmLoader {
    constructor() {
        this.farmProperties = [];
        this.loaded = false;
    }
    
    /**
     * Load and parse a realtor's farm CSV (Jeff & Anna format)
     * This format has WAY more data than the master list!
     * Can handle THOUSANDS of properties (Jeff & Anna have 7,140!)
     */
    async loadFarmCSV(file, options = {}) {
        try {
            const { 
                limit = 2000,  // Default to 2000 for performance
                progressive = true,  // Load in batches
                onProgress = null 
            } = options;
            
            console.log('🚜 Loading farm territory...');
            
            let csvText;
            if (typeof file === 'string') {
                // Load from URL
                const response = await fetch(file);
                csvText = await response.text();
            } else {
                // Load from file upload
                csvText = await file.text();
            }
            
            // Get total count first
            const lines = csvText.split('\n');
            const totalProperties = lines.length - 1; // Minus header
            console.log(`📊 Farm contains ${totalProperties.toLocaleString()} properties!`);
            
            // Parse with limit for performance
            if (progressive && totalProperties > limit) {
                console.log(`⚡ Loading first ${limit} properties for performance...`);
                this.farmProperties = this.parseRichCSV(csvText, limit);
                this.totalInFarm = totalProperties;
                
                // Store full CSV for later progressive loading
                this.fullCSVText = csvText;
            } else {
                // Load all if small enough
                this.farmProperties = this.parseRichCSV(csvText);
                this.totalInFarm = this.farmProperties.length;
            }
            
            console.log(`✅ Loaded ${this.farmProperties.length} farm properties with rich data!`);
            this.loaded = true;
            
            return this.farmProperties;
            
        } catch (error) {
            console.error('Failed to load farm data:', error);
            throw error;
        }
    }
    
    /**
     * Parse the rich CSV format with all property details
     */
    parseRichCSV(csvText, limit = null) {
        const lines = csvText.split('\n');
        const headers = this.parseCSVLine(lines[0]);
        const properties = [];
        
        // Map headers to indices for easier access
        const idx = {};
        headers.forEach((header, i) => {
            idx[header] = i;
        });
        
        
        // Track coordinate usage to spread out duplicate locations
        const coordCounts = new Map();
        const coordOffsets = new Map();
        
        // Determine how many lines to process
        const maxLines = limit ? Math.min(lines.length, limit + 1) : lines.length;
        
        for (let i = 1; i < maxLines; i++) {
            if (!lines[i].trim()) continue;
            
            const values = this.parseCSVLine(lines[i]);
            if (values.length !== headers.length) continue;
            
            // Calculate derived values
            const purchasePrice = parseFloat(values[idx['Purchase Price']]) || 0;
            const marketValue = parseFloat(values[idx['Market Value (Assessed)']]) || 
                               parseFloat(values[idx['Assessed Value']]) || 0;
            const purchaseDate = values[idx['Purchase Date']];
            const yearsOwned = purchaseDate ? 
                Math.floor((Date.now() - new Date(purchaseDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : 0;
            
            // Estimate current value (simple appreciation model)
            const appreciationRate = 0.05; // 5% per year average
            const estimatedValue = purchasePrice * Math.pow(1 + appreciationRate, yearsOwned) || marketValue;
            const equity = estimatedValue > purchasePrice ? 
                Math.round(((estimatedValue - purchasePrice) / estimatedValue) * 100) : 0;
            
            // Detect absentee (mailing address != property address)
            const siteAddress = values[idx['Site Address']];
            const mailAddress = values[idx['Mail Address']];
            const isAbsentee = values[idx['Owner Occupied']] === 'N' || 
                              (mailAddress && !mailAddress.includes(siteAddress));
            
            // Parse base coordinates
            let baseLat = parseFloat(values[idx['Latitude']]) || 37.6688;
            let baseLng = parseFloat(values[idx['Longitude']]) || -122.0808;
            
            // Create a key for this coordinate pair
            const coordKey = `${baseLat.toFixed(6)},${baseLng.toFixed(6)}`;
            
            // Check if we've seen this coordinate before
            if (coordCounts.has(coordKey)) {
                // This is a duplicate coordinate - add offset to spread them out
                const count = coordCounts.get(coordKey);
                coordCounts.set(coordKey, count + 1);
                
                // Calculate spiral offset to distribute units around building
                const angle = (count * 137.5) * (Math.PI / 180); // Golden angle for better distribution
                const radius = 0.00015 * Math.sqrt(count); // Gradually increasing radius (~16 meters per 0.00015 degree)
                
                // Apply offset to create a spiral pattern around the building
                baseLat += radius * Math.sin(angle);
                baseLng += radius * Math.cos(angle);
                
            } else {
                // First occurrence of this coordinate
                coordCounts.set(coordKey, 1);
            }
            
            
            // Create rich property object
            const property = {
                // Unique ID
                id: values[idx['APN / Parcel Number']] || `farm_${i}`,
                apn: values[idx['APN / Parcel Number']],
                
                // Location with scattered coordinates for multi-unit buildings
                address: `${siteAddress}, ${values[idx['Site City']]} ${values[idx['Site Zip Code']]}`,
                coordinates: {
                    lat: baseLat,
                    lng: baseLng
                },
                
                // Owner information
                owner: {
                    firstName: values[idx['1st Owner\'s First Name']],
                    lastName: values[idx['1st Owner\'s Last Name']],
                    fullName: values[idx['All Owners']] || 
                             `${values[idx['1st Owner\'s First Name']]} ${values[idx['1st Owner\'s Last Name']]}`,
                    spouse: {
                        firstName: values[idx['2nd Owner\'s First Name']],
                        lastName: values[idx['2nd Owner\'s Last Name']]
                    },
                    type: isAbsentee ? 'absentee' : 'owner_occupied',
                    occupied: values[idx['Owner Occupied']] === 'Y',
                    mailing: {
                        address: mailAddress,
                        city: values[idx['Mailing City']],
                        state: values[idx['Mailing State']],
                        zip: values[idx['Mailing Zip Code']]
                    }
                },
                
                // Property details
                property: {
                    beds: parseInt(values[idx['Bedrooms']]) || 0,
                    baths: parseFloat(values[idx['Baths']]) || 0,
                    sqft: parseInt(values[idx['Building Size']]) || 0,
                    lotSize: parseInt(values[idx['Lot Size (SqFt)']]) || 0,
                    acres: parseFloat(values[idx['Acreage']]) || 0,
                    yearBuilt: parseInt(values[idx['Year Built']]) || 0,
                    type: values[idx['Property Type']],
                    stories: parseInt(values[idx['Number Of Stories']]) || 1,
                    units: parseInt(values[idx['Number of Units']]) || 1,
                    garage: values[idx['Primary Garage Type']],
                    pool: values[idx['Pool']] === 'Y',
                    fireplace: values[idx['Fireplace']] === 'Y',
                    view: values[idx['View']]
                },
                
                // Financial data - THIS IS GOLD!
                financial: {
                    purchaseDate: purchaseDate,
                    purchasePrice: purchasePrice,
                    yearsOwned: yearsOwned,
                    assessedValue: parseFloat(values[idx['Assessed Value']]) || 0,
                    marketValue: marketValue,
                    estimatedValue: Math.round(estimatedValue),
                    equity: equity,
                    equityDollars: Math.round(estimatedValue - purchasePrice),
                    appreciation: Math.round(((estimatedValue - purchasePrice) / purchasePrice) * 100) || 0
                },
                
                // Additional data
                location: {
                    county: values[idx['County']],
                    subdivision: values[idx['Subdivision']],
                    zoning: values[idx['Zoning Code']],
                    censusTract: values[idx['Census Tract']],
                    carrierRoute: values[idx['Site Carrier Route']]
                },
                
                // Activity tracking
                activity: {
                    status: equity > 70 ? 'hot' : (equity > 40 ? 'warm' : 'cold'),
                    tags: this.generateTags(equity, isAbsentee, yearsOwned),
                    lastContact: null,
                    notes: values[idx['Notes']] || ''
                }
            };
            
            properties.push(property);
        }
        
        // Report coordinate scattering statistics
        const duplicateBuildings = Array.from(coordCounts.entries())
            .filter(([key, count]) => count > 1)
            .sort((a, b) => b[1] - a[1]);
        
        if (duplicateBuildings.length > 0) {
            console.log(`📊 Coordinate scattering applied:`);
            console.log(`   - ${duplicateBuildings.length} buildings had multiple units`);
            console.log(`   - Largest building: ${duplicateBuildings[0][1]} units`);
            console.log(`   - Total units scattered: ${duplicateBuildings.reduce((sum, [key, count]) => sum + count - 1, 0)}`);
        }
        
        return properties;
    }
    
    /**
     * Parse CSV line handling quotes and commas
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
     * Generate smart tags based on property characteristics
     */
    generateTags(equity, isAbsentee, yearsOwned) {
        const tags = [];
        
        // Equity tags
        if (equity >= 70) tags.push('high-equity');
        else if (equity >= 40) tags.push('moderate-equity');
        
        // Ownership tags
        if (isAbsentee) tags.push('absentee');
        if (yearsOwned >= 10) tags.push('long-term-owner');
        else if (yearsOwned <= 2) tags.push('recent-purchase');
        
        // Opportunity tags
        if (equity >= 60 && isAbsentee) tags.push('prime-target');
        if (yearsOwned >= 7 && equity >= 50) tags.push('ready-to-sell');
        
        return tags;
    }
    
    /**
     * Get statistics for the farm
     */
    getFarmStats() {
        const total = this.farmProperties.length;
        const absentee = this.farmProperties.filter(p => p.owner.type === 'absentee').length;
        const highEquity = this.farmProperties.filter(p => p.financial.equity >= 70).length;
        const avgEquity = Math.round(
            this.farmProperties.reduce((sum, p) => sum + p.financial.equity, 0) / total
        );
        const totalEquityDollars = this.farmProperties.reduce(
            (sum, p) => sum + p.financial.equityDollars, 0
        );
        
        return {
            total,
            absentee,
            absenteePercent: Math.round((absentee / total) * 100),
            highEquity,
            avgEquity,
            totalEquityDollars,
            avgYearsOwned: Math.round(
                this.farmProperties.reduce((sum, p) => sum + p.financial.yearsOwned, 0) / total
            )
        };
    }
    
    /**
     * Get hot opportunities
     */
    getHotOpportunities() {
        return this.farmProperties
            .filter(p => 
                p.financial.equity >= 60 && 
                p.owner.type === 'absentee' &&
                p.financial.yearsOwned >= 5
            )
            .sort((a, b) => b.financial.equity - a.financial.equity)
            .slice(0, 20);
    }
}

// Create global instance
window.farmLoader = new FarmLoader();