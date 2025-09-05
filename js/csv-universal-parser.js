/**
 * Universal CSV Parser for Legacy Compass
 * Intelligently maps any CSV format to our standard fields
 */

window.UniversalCSVParser = {
    
    // Column name mappings (handles variations)
    columnMappings: {
        address: [
            'Site Address', 'Property Address', 'Address', 'property_address',
            'Street Address', 'SitusAddress', 'FullAddress', 'Location'
        ],
        apn: [
            'APN', 'APN / Parcel Number', 'Parcel Number', 'APN_SORT',
            'Assessor Parcel Number', 'Tax ID', 'Parcel ID', 'PIN'
        ],
        owner: [
            'Owner Name', 'owner_name', 'All Owners', 'Owner', 
            'Property Owner', 'Owner Full Name', 'Owner1'
        ],
        city: [
            'Site City', 'City', 'SitusCity', 'Property City',
            'Municipality', 'Town'
        ],
        bedrooms: [
            'Bedrooms', 'Beds', 'BR', 'Bed', 'Bedroom Count',
            'Number of Bedrooms', 'TotalBedrooms'
        ],
        bathrooms: [
            'Baths', 'Bathrooms', 'Bath', 'BA', 'Full Baths',
            'Number of Bathrooms', 'TotalBathrooms'
        ],
        sqft: [
            'Building Size', 'Square Feet', 'SqFt', 'Living Area',
            'BuildingArea', 'GLA', 'Total Square Feet', 'Building SqFt'
        ],
        propertyType: [
            'Property Type', 'Type', 'PropertyType', 'Property Class',
            'Use Code', 'Land Use', 'Zoning', 'Class'
        ],
        yearBuilt: [
            'Year Built', 'YearBuilt', 'Built', 'Construction Year',
            'Year Constructed', 'Build Date', 'YrBlt'
        ],
        purchasePrice: [
            'Purchase Price', 'Sale Price', 'Last Sale Price',
            'Transfer Value', 'Sale Amount', 'Price'
        ],
        purchaseDate: [
            'Purchase Date', 'Sale Date', 'Last Sale Date',
            'Transfer Date', 'Date of Sale', 'SaleDate'
        ],
        vacant: [
            'Vacant', 'Is Vacant', 'Vacancy Status', 'Occupied',
            'Occupancy Status', 'VacantFlag'
        ],
        absentee: [
            'Owner Occupied', 'Owner Occupancy', 'is_absentee', 'Absentee Owner',
            'Non-Owner Occupied', 'Absentee', 'Owner Occ', 'Occupancy'
        ],
        units: [
            'Number of Units', 'Units', 'Unit Count', 'Total Units',
            'Dwelling Units', 'NumUnits'
        ],
        mailingAddress: [
            'owner_mailing_address', 'Mail Address', 'mail address', 
            'Mailing Address', 'mailing address', 'Owner Mailing Address',
            'Mail Situs', 'Mailing', 'Owner Address', 'Mail To'
        ]
    },

    /**
     * Property type detection based on various clues
     */
    propertyTypeRules: {
        // Direct mapping from common codes
        codes: {
            // Single Family
            'SFR': 'SFR', 'SFH': 'SFR', 'SF': 'SFR', '01': 'SFR',
            'SINGLE': 'SFR', 'HOUSE': 'SFR', 'RES': 'SFR',
            // Rcon could be various types - need to detect based on other factors
            // 'RCON': null, // Don't assume - let detection logic handle it
            // Condos and Townhomes  
            'COND': 'CONDO', 'CND': 'CONDO', '02': 'CONDO',
            // Rtrw seems to be tax district code, not property type
            // 'RTRW': null, // Don't assume - let detection logic handle it
            'TOWNHOUSE': 'CONDO', 'TOWNHOME': 'CONDO', 'TH': 'CONDO',
            // Multi-family
            'MF': 'MULTI', 'MFR': 'MULTI', 'APT': 'MULTI', '03': 'MULTI',
            'DUPLEX': 'MULTI', 'TRIPLEX': 'MULTI', 'FOURPLEX': 'MULTI',
            // Commercial
            'COM': 'COMM', 'COMM': 'COMM', 'C': 'COMM', '04': 'COMM',
            'IND': 'COMM', 'RETAIL': 'COMM', 'OFFICE': 'COMM', 'INDUSTRIAL': 'COMM'
        },
        
        // Keywords in address that hint at property type
        addressKeywords: {
            'SFR': ['house', 'home', 'residence'],
            'CONDO': ['unit', 'apt', '#', 'condo', 'suite'],
            'MULTI': ['duplex', 'triplex', 'fourplex', 'apartments'],
            'COMM': ['plaza', 'center', 'mall', 'office', 'warehouse']
        },
        
        // Guess based on bedroom count
        bedroomLogic: (beds) => {
            if (!beds || beds === 0) return 'COMM'; // No bedrooms = commercial
            if (beds >= 8) return 'MULTI'; // 8+ beds = likely multi-family
            return 'SFR'; // Default residential
        },
        
        // Guess based on square footage
        sqftLogic: (sqft) => {
            if (!sqft) return null;
            if (sqft > 10000) return 'COMM'; // Very large = commercial
            if (sqft < 1000) return 'CONDO'; // Small = likely condo
            return 'SFR'; // Medium size = house
        }
    },

    /**
     * Parse any CSV format into our standard structure
     */
    parseCSV(csvText, fileName = '') {
        const lines = csvText.split('\n');
        const headers = this.parseCSVLine(lines[0]);
        
        // Map headers to our standard fields
        const fieldMap = this.createFieldMapping(headers);
        
        const properties = [];
        let stats = {
            total: 0,
            withType: 0,
            guessedType: 0,
            sfr: 0,
            condo: 0,
            multi: 0,
            comm: 0
        };
        
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            
            const values = this.parseCSVLine(lines[i]);
            const prop = this.mapToProperty(values, fieldMap, headers, i);
            
            // First normalize the property type (handles Rcon/Rtrw)
            const normalizedType = this.normalizePropertyType(prop.propertyType);
            
            // If normalization returned null or empty, detect property type
            if (!normalizedType) {
                prop.propertyType = this.detectPropertyType(prop, fileName);
                if (prop.propertyType) stats.guessedType++;
            } else {
                prop.propertyType = normalizedType;
                stats.withType++;
            }
            
            // Count property types
            const type = prop.propertyType;
            if (type === 'SFR') stats.sfr++;
            else if (type === 'CONDO') stats.condo++;
            else if (type === 'MULTI') stats.multi++;
            else if (type === 'COMM') stats.comm++;
            
            properties.push(prop);
            stats.total++;
        }
        
        console.log('📊 CSV Parsing Stats:', stats);
        return { properties, stats, fieldMap };
    },

    /**
     * Create mapping from CSV headers to our standard fields
     */
    createFieldMapping(headers) {
        const mapping = {};
        
        for (const [field, variations] of Object.entries(this.columnMappings)) {
            for (let i = 0; i < headers.length; i++) {
                const header = headers[i].trim().toLowerCase();
                if (variations.some(v => v.toLowerCase() === header)) {
                    mapping[field] = i;
                    // Debug log for mailing address
                    if (field === 'mailingAddress') {
                        console.log(`📮 Found mailing address column "${headers[i]}" at index ${i}`);
                    }
                    break;
                }
            }
        }
        
        // Special handling for composite fields
        this.mapCompositeFields(headers, mapping);
        
        return mapping;
    },

    /**
     * Handle fields that might be split across columns
     */
    mapCompositeFields(headers, mapping) {
        // Owner name might be split into first/last
        if (!mapping.owner) {
            const firstIdx = headers.findIndex(h => 
                h.match(/1st.*Owner.*First|Owner.*First/i));
            const lastIdx = headers.findIndex(h => 
                h.match(/1st.*Owner.*Last|Owner.*Last/i));
            
            if (firstIdx >= 0 && lastIdx >= 0) {
                mapping.ownerFirst = firstIdx;
                mapping.ownerLast = lastIdx;
            }
        }
        
        // Address might be number + street
        if (!mapping.address) {
            const numIdx = headers.findIndex(h => 
                h.match(/Street.*Number|SitusStreetNumber/i));
            const nameIdx = headers.findIndex(h => 
                h.match(/Street.*Name|SitusStreetName/i));
            
            if (numIdx >= 0 && nameIdx >= 0) {
                mapping.addressNumber = numIdx;
                mapping.addressStreet = nameIdx;
            }
        }
    },

    /**
     * Map CSV row to our standard property object
     */
    mapToProperty(values, fieldMap, headers, rowIndex = 0) {
        const prop = {
            id: null,
            address: '',
            owner: '',
            city: '',
            state: 'CA', // Default to CA
            zip: '',
            bedrooms: null,
            bathrooms: null,
            sqft: null,
            yearBuilt: null,
            propertyType: '',
            purchasePrice: null,
            purchaseDate: null,
            absentee: false,
            vacant: false,
            mailingAddress: '', // Add mailing address field
            lat: null,
            lng: null
        };
        
        // Direct field mapping with trimming
        for (const [field, index] of Object.entries(fieldMap)) {
            if (index !== undefined && values[index]) {
                // Trim whitespace from all values
                prop[field] = typeof values[index] === 'string' ? values[index].trim() : values[index];
                // Debug mailing address extraction
                if (field === 'mailingAddress') {
                    console.log(`📬 Extracting mailing address from column ${index}: "${values[index]}"`);
                }
            }
        }
        
        // Handle composite fields
        if (!prop.owner && fieldMap.ownerFirst && fieldMap.ownerLast) {
            prop.owner = `${values[fieldMap.ownerFirst]} ${values[fieldMap.ownerLast]}`.trim();
        }
        
        if (!prop.address && fieldMap.addressNumber && fieldMap.addressStreet) {
            prop.address = `${values[fieldMap.addressNumber]} ${values[fieldMap.addressStreet]}`.trim();
        }
        
        // Parse absentee status - pass the column header name for proper interpretation
        if (prop.absentee !== undefined && fieldMap.absentee !== undefined) {
            const columnHeader = headers[fieldMap.absentee] || '';
            const originalValue = prop.absentee;
            prop.absentee = this.parseAbsenteeStatus(prop.absentee, columnHeader);
            
            // Debug logging for absentee status
            if (rowIndex <= 5) { // Log first few for debugging
                console.log(`🏠 Absentee parsing: Column "${columnHeader}", Value "${originalValue}" → Absentee: ${prop.absentee}`);
            }
        }
        
        // Debug mailing address
        if (prop.mailingAddress && prop.mailingAddress !== prop.address) {
            console.log('📬 Found different mailing address:', {
                property: prop.address,
                mailing: prop.mailingAddress,
                owner: prop.owner,
                absentee: prop.absentee
            });
        }
        
        // Generate ID
        prop.id = prop.apn || this.generatePropertyId(prop);
        
        return prop;
    },

    /**
     * Intelligently detect property type from various clues
     */
    detectPropertyType(prop, fileName = '') {
        // 1. MOST IMPORTANT: Check number of units
        const units = parseInt(prop.units) || parseInt(prop['Number of Units']) || 0;
        const sqft = parseInt(prop.sqft) || parseInt(prop['Building Size']) || 0;
        const address = (prop.address || '').toLowerCase();
        
        // If it's part of a multi-unit complex (units > 1), it's a condo
        if (units > 1) {
            return 'CONDO'; // Part of multi-unit building
        }
        
        // If units = 1 but small sqft and has unit number in address, likely condo/townhome
        if (units === 1) {
            // Check if address has unit indicators
            if (address.match(/\bunit\s+\d+/i) ||  // "Unit 5"
                address.match(/\bapt\s+\d+/i) ||    // "Apt 3"  
                address.match(/#\d+/) ||             // "#12"
                address.includes(' unit ')) {
                return 'CONDO';
            }
            
            // Large single unit properties (>2500 sqft) are likely SFR
            if (sqft > 2500) {
                return 'SFR';
            }
            
            // Medium townhouses (1500-2500 sqft) - need more clues
            if (sqft >= 1500 && sqft <= 2500) {
                // Look for townhouse patterns
                if (address.includes('dixon st') ||  // We know Dixon St has townhomes
                    address.includes('commons') ||
                    address.includes('villas')) {
                    return 'CONDO'; // Townhome
                }
                return 'SFR'; // Default for medium homes
            }
        }
        
        // 2. Check address for unit indicators (backup if no units data)
        if (address.match(/\bunit\s+\d+/i) ||
            address.match(/\bapt\s+\d+/i) ||
            address.match(/#\d+/) ||
            address.match(/\bsuite\s+\d+/i)) {
            return 'CONDO';
        }
        
        // 3. Size-based detection
        const bedrooms = parseInt(prop.bedrooms) || parseInt(prop.Bedrooms) || 0;
        const bathrooms = parseFloat(prop.bathrooms) || parseFloat(prop.Baths) || 0;
        
        // Very small properties (<1000 sqft) with 1-2 bedrooms are likely condos
        if (sqft > 0 && sqft < 1000 && bedrooms <= 2) {
            return 'CONDO';
        }
        
        // Properties with "Industrial Pkwy" or similar addresses are likely condos
        if (address.includes('industrial pkwy') || 
            address.includes('commons') ||
            address.includes('plaza')) {
            return 'CONDO';
        }
        
        // Medium size (1000-1600 sqft) could be either - look for more clues
        if (sqft >= 1000 && sqft <= 1600) {
            // Check lot size if available - condos usually have no/minimal lot
            const lotSize = parseFloat(prop['Lot Size']) || parseFloat(prop.lotSize) || 0;
            if (lotSize === 0 || lotSize < 1000) {
                return 'CONDO'; // No lot = likely condo/townhouse
            }
            // Check if it's in a known condo complex (address patterns)
            if (address.match(/\d+\s+\w+\s+(pkwy|commons|plaza|circle|court)\s+\d+/i)) {
                return 'CONDO';
            }
        }
        
        // Large properties (>2500 sqft) are usually SFR unless marked otherwise
        if (sqft > 2500) {
            return 'SFR';
        }
        
        // Properties with 4+ bedrooms are usually SFR
        if (bedrooms >= 4) {
            return 'SFR';
        }
        
        // Default based on size
        if (sqft > 0) {
            if (sqft < 1200) return 'CONDO';
            if (sqft > 1800) return 'SFR';
        }
        
        // 5. Default to SFR if no clear indicators
        return 'SFR';
    },

    /**
     * Normalize property type to our standard codes
     */
    normalizePropertyType(type) {
        if (!type) return null; // Let detection handle it
        
        const upperType = type.toUpperCase().trim();
        
        // Ignore Rcon/Rtrw - these are tax codes, not property types
        if (upperType === 'RCON' || upperType === 'RTRW') {
            return null; // Let detection logic determine actual type
        }
        
        // Check direct code mapping
        if (this.propertyTypeRules.codes[upperType]) {
            return this.propertyTypeRules.codes[upperType];
        }
        
        // Check for keywords
        if (upperType.includes('CONDO') || upperType.includes('TOWN')) return 'CONDO';
        if (upperType.includes('MULTI') || upperType.includes('APT')) return 'MULTI';
        if (upperType.includes('COMM') || upperType.includes('RETAIL')) return 'COMM';
        
        // Don't default - let detection handle unknown types
        return null;
    },

    /**
     * Parse absentee status from various formats
     * IMPORTANT: In hayward_owners.csv format:
     * - True = Absentee (mailing address different)
     * - False = Owner Occupied (mailing address same)
     */
    parseAbsenteeStatus(value, columnName = '') {
        if (!value) return false;
        const val = value.toString().toLowerCase().trim();
        const colName = columnName.toLowerCase();
        
        // IMPORTANT: Different CSV formats use opposite conventions!
        // For "Owner Occupied" column: Y = owner occupied (NOT absentee), N = absentee
        // For "is_absentee" column: true = absentee, false = owner occupied
        
        // Check if this is an "Owner Occupied" type column (inverted logic)
        if (colName.includes('owner') && colName.includes('occupied')) {
            // For Owner Occupied: N means absentee, Y means owner occupied
            return val === 'n' || val === 'no' || val === 'false' || val === '0';
        }
        
        // For other columns, use standard logic
        // These mean it's ABSENTEE (owner doesn't live there)
        const absenteeValues = ['true', '1', 'absentee', 'non-owner', 
                               'investor', 'tenant', 'investment', 'out of state', 
                               'investor owned', 'non-owner occupied'];
        
        // These mean it's OWNER OCCUPIED (not absentee)
        const ownerOccupiedValues = ['false', '0', 'owner', 'owner occupied', 
                                    'resident', 'lives here', 'owner occupancy'];
        
        // Check if it's explicitly absentee
        for (const absenteeVal of absenteeValues) {
            if (val === absenteeVal || val.includes(absenteeVal)) {
                return true;
            }
        }
        
        // Default to false (owner occupied) if not explicitly absentee
        return false;
    },

    /**
     * Parse CSV line handling quotes and commas
     */
    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        
        result.push(current.trim());
        return result;
    },

    /**
     * Generate unique ID for property
     */
    generatePropertyId(prop) {
        // Try to create from address
        if (prop.address) {
            return prop.address.replace(/\s+/g, '_').toLowerCase();
        }
        return `prop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
};