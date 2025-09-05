/**
 * Master Database Integration for Legacy Compass
 * Connects to the new master_properties table with 48,555 Hayward properties
 */

window.MasterDatabase = {
    // Current user's farms
    userFarms: [],
    currentFarm: null,
    
    /**
     * Validate and clean date values
     */
    validateDate(dateStr) {
        if (!dateStr) return null;
        
        // Check for invalid dates like "0000-00-00" or "00/00/0000"
        if (dateStr === '0000-00-00' || dateStr === '00/00/0000' || 
            dateStr === '0' || dateStr === '0000') {
            return null;
        }
        
        // Try to parse the date
        const parsed = new Date(dateStr);
        if (isNaN(parsed.getTime())) {
            return null;
        }
        
        // Check if date is reasonable (between 1900 and 2030)
        const year = parsed.getFullYear();
        if (year < 1900 || year > 2030) {
            return null;
        }
        
        // Return in YYYY-MM-DD format
        return parsed.toISOString().split('T')[0];
    },
    
    /**
     * Parse and validate positive integers (no negative values)
     */
    parsePositiveInt(value) {
        if (!value && value !== 0) return null;
        const num = parseInt(value);
        // Return null for invalid or negative numbers
        return (isNaN(num) || num < 0) ? null : num;
    },
    
    /**
     * Parse and validate positive floats (no negative values)
     */
    parsePositiveFloat(value) {
        if (!value && value !== 0) return null;
        const num = parseFloat(value);
        // Return null for invalid or negative numbers
        return (isNaN(num) || num < 0) ? null : num;
    },
    
    /**
     * Initialize master database connection
     */
    async initialize(supabase, user) {
        if (!supabase || !user) {
            console.log('Master database requires authenticated user');
            return false;
        }
        
        console.log('🏠 Initializing master database...');
        
        // Load user's farms
        await this.loadUserFarms(supabase, user);
        
        // Check for default farm or create one
        if (this.userFarms.length === 0) {
            await this.createFarm(supabase, user, 'My First Farm', true);
        } else {
            // Set the first farm as current
            this.currentFarm = this.userFarms[0];
        }
        
        console.log('✅ Master database ready with', this.userFarms.length, 'farms');
        return true;
    },
    
    /**
     * Load user's farms
     */
    async loadUserFarms(supabase, user) {
        try {
            const { data, error } = await supabase
                .from('user_farms')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            
            this.userFarms = data || [];
            console.log('📁 Loaded', this.userFarms.length, 'farms');
            return this.userFarms;
        } catch (error) {
            console.error('Error loading farms:', error);
            return [];
        }
    },
    
    /**
     * Create a new farm
     */
    async createFarm(supabase, user, farmName, isDefault = false) {
        try {
            const { data, error } = await supabase
                .from('user_farms')
                .insert({
                    user_id: user.id,
                    farm_name: farmName,
                    is_default: isDefault,
                    description: `Created ${new Date().toLocaleDateString()}`
                })
                .select()
                .single();
            
            if (error) throw error;
            
            this.userFarms.unshift(data);
            this.currentFarm = data;
            console.log('✅ Created farm:', farmName);
            return data;
        } catch (error) {
            console.error('Error creating farm:', error);
            return null;
        }
    },
    
    /**
     * Load properties in current farm
     */
    async loadFarmProperties(supabase, farmId) {
        if (!farmId) return [];
        
        try {
            // Fetch ALL properties using pagination (Supabase limits to 1000 per request)
            let allData = [];
            let offset = 0;
            const limit = 1000; // Supabase max per request
            let hasMore = true;
            
            console.log('📊 Starting to load all farm properties...');
            
            while (hasMore) {
                const { data, error } = await supabase
                    .from('farm_properties')
                    .select(`
                        *,
                        master_properties!inner(*)
                    `)
                    .eq('farm_id', farmId)
                    .order('added_at', { ascending: false })
                    .range(offset, offset + limit - 1);
                
                if (error) throw error;
                
                if (data && data.length > 0) {
                    allData = [...allData, ...data];
                    console.log(`📦 Loaded batch: ${data.length} properties (Total: ${allData.length})`);
                    
                    // If we got less than limit, we've reached the end
                    hasMore = data.length === limit;
                    offset += limit;
                } else {
                    hasMore = false;
                }
            }
            
            console.log('🔍 Total properties loaded from Supabase:', allData.length);
            
            // Flatten the response and add farm-specific data
            const properties = allData.map(item => {
                // Debug logging
                if (item.notes || item.private_notes) {
                    console.log('📝 Property has notes:', item.apn, 'notes:', item.notes, 'private_notes:', item.private_notes);
                }
                
                // Get property type from database
                let propertyType = item.master_properties.property_type;
                
                // Normalize existing property types
                if (propertyType) {
                    const upperType = propertyType.toUpperCase();
                    // Only trust clear property type codes
                    if (upperType === 'SFR' || upperType === 'SINGLE FAMILY') {
                        propertyType = 'SFR';
                    } else if (upperType === 'CONDO' || upperType === 'CONDOMINIUM') {
                        propertyType = 'CONDO';
                    } else if (upperType === 'MULTI' || upperType === 'MULTI-FAMILY') {
                        propertyType = 'MULTI';
                    } else if (upperType === 'RCON' || upperType === 'RTRW') {
                        // These are NOT property types - Rcon is construction code, Rtrw is tax district
                        // We'll detect the actual type based on other factors below
                        propertyType = null;
                    }
                }
                
                // If property type is missing, try to detect it from other fields
                if (!propertyType || propertyType === '' || propertyType === 'null' || propertyType === null) {
                    // Check multiple indicators for condos
                    const address = (item.master_properties.property_address || '').toLowerCase();
                    const sqft = parseInt(item.master_properties.square_feet) || 0;
                    
                    // Strong condo indicators - explicit unit/apt markers
                    const hasUnitNumber = address.match(/\bunit\s+\d+/i) || 
                                         address.match(/\bapt\s+\d+/i) || 
                                         address.match(/#\d+/) ||
                                         address.includes(' unit ');
                    
                    // Better detection logic based on multiple factors
                    
                    // Check for explicit unit/apt numbers (strongest indicator)
                    if (hasUnitNumber) {
                        propertyType = 'CONDO';
                    }
                    // Very small properties (<900 sqft) are usually condos
                    else if (sqft > 0 && sqft < 900) {
                        propertyType = 'CONDO';
                    }
                    // Very large properties (>10,000 sqft) are either SFR or commercial
                    else if (sqft > 10000) {
                        // Could be large estate home or commercial - default to SFR for residential
                        propertyType = 'SFR';
                    }
                    // Check for patterns like "260 Industrial Pkwy 1" (ends with small number)
                    else if (address.match(/\s+\d{1,2}$/) && !address.match(/(st|street|ave|avenue|dr|drive|rd|road|way|court|place|ln|lane)\s*$/i)) {
                        // Likely a unit number at the end
                        propertyType = 'CONDO';
                    }
                    // Medium properties (900-3000 sqft) - check other clues
                    else if (sqft > 0 && sqft <= 3000) {
                        // If it has keywords suggesting attached housing
                        if (address.includes('townhouse') || address.includes('townhome') || 
                            address.includes('commons') || address.includes('villas')) {
                            propertyType = 'CONDO';
                        } else {
                            propertyType = 'SFR'; // Default for medium-sized properties
                        }
                    }
                    else {
                        // Default to SFR for everything else
                        propertyType = 'SFR';
                    }
                    
                    console.log(`🏠 Auto-detected type for ${address}: ${propertyType} (sqft: ${sqft})`);
                }
                
                return {
                    ...item.master_properties,
                    farmPropertyId: item.id,
                    isHotList: item.is_hot_list,
                    privateNotes: item.private_notes,
                    notes: item.notes || item.private_notes || '',
                    lastVisited: item.last_visited,
                    visitCount: item.visit_count,
                    priority: item.priority,
                    // Map the fields to match frontend expectations
                    id: item.master_properties.apn,
                lat: item.master_properties.latitude,
                lng: item.master_properties.longitude,
                address: item.master_properties.property_address,
                owner: item.master_properties.owner_name,
                absentee: item.master_properties.is_absentee,
                vacant: item.master_properties.is_vacant,
                city: item.master_properties.city,
                state: item.master_properties.state,
                zip: item.master_properties.zip_code,
                // Map to the exact field names the UI expects
                Bedrooms: item.master_properties.bedrooms,
                Baths: item.master_properties.bathrooms,
                'Building Size': item.master_properties.square_feet,
                'Year Built': item.master_properties.year_built,
                'Purchase Price': item.master_properties.purchase_price || 0,
                'Purchase Date': item.master_properties.purchase_date || '',
                'Mailing City': item.master_properties.mailing_city || item.master_properties.city,
                'Mailing Address': item.master_properties.mailing_address || item.master_properties.property_address,
                mailingAddress: item.master_properties.mailing_address || item.master_properties.property_address,
                'Lot Size': item.master_properties.lot_size,
                type: propertyType,
                propertyType: propertyType,
                'Property Type': propertyType,
                // Keep lowercase versions too for compatibility
                bedrooms: item.master_properties.bedrooms,
                bathrooms: item.master_properties.bathrooms,
                sqft: item.master_properties.square_feet,
                    yearBuilt: item.master_properties.year_built
                };
            });
            
            console.log('🏘️ Loaded', properties.length, 'properties from farm');
            
            // Debug: Check property types
            const typeCounts = {};
            properties.forEach(p => {
                const type = p.property_type || p.propertyType || p.type || 'UNKNOWN';
                typeCounts[type] = (typeCounts[type] || 0) + 1;
            });
            console.log('📊 Property types in database:', typeCounts);
            
            // If first few properties, log their types
            if (properties.length > 0) {
                console.log('Sample property types:', properties.slice(0, 3).map(p => ({
                    address: p.address,
                    type: p.type,
                    propertyType: p.propertyType,
                    property_type: p.property_type
                })));
            }
            
            return properties;
        } catch (error) {
            console.error('Error loading farm properties:', error);
            return [];
        }
    },
    
    /**
     * Search master properties database
     */
    async searchProperties(supabase, query, limit = 100) {
        if (!query || query.length < 2) return [];
        
        try {
            // Search by address, owner name, or APN
            const { data, error } = await supabase
                .from('master_properties')
                .select('*')
                .or(`property_address.ilike.%${query}%,owner_name.ilike.%${query}%,apn.ilike.%${query}%`)
                .limit(limit);
            
            if (error) throw error;
            
            // Format for display
            const results = (data || []).map(prop => ({
                ...prop,
                lat: prop.latitude,
                lng: prop.longitude,
                address: prop.property_address,
                owner: prop.owner_name,
                absentee: prop.is_absentee,
                vacant: prop.is_vacant,
                id: prop.apn // Use APN as unique ID
            }));
            
            console.log('🔍 Found', results.length, 'properties matching:', query);
            return results;
        } catch (error) {
            console.error('Error searching properties:', error);
            return [];
        }
    },
    
    /**
     * Detect property type from CSV data
     */
    detectPropertyType(prop) {
        // Check explicit type field first
        const explicitType = prop.type || prop['Property Type'] || prop['PropertyType'];
        
        // Check common type indicators
        if (explicitType) {
            const upperType = explicitType.toUpperCase();
            
            // Single Family Residential
            if (upperType.includes('SFR') || upperType.includes('SINGLE') || 
                upperType.includes('HOUSE') || upperType.includes('DETACHED')) {
                return 'SFR';
            }
            
            // Condos/Townhomes
            if (upperType.includes('CONDO') || upperType.includes('TOWNHOME') || 
                upperType.includes('TOWNHOUSE') || upperType.includes('ATTACHED')) {
                return 'CONDO';
            }
            
            // Commercial
            if (upperType.includes('COMM') || upperType.includes('RETAIL') || 
                upperType.includes('OFFICE') || upperType.includes('INDUSTRIAL') ||
                upperType.includes('WAREHOUSE')) {
                return 'COMM';
            }
            
            // Multi-family
            if (upperType.includes('MULTI') || upperType.includes('DUPLEX') || 
                upperType.includes('TRIPLEX') || upperType.includes('FOURPLEX') ||
                upperType.includes('APARTMENT') || upperType.includes('UNITS')) {
                return 'MULTI';
            }
        }
        
        // Check address patterns
        const address = (prop.address || prop.Address || '').toLowerCase();
        if (address.includes('unit') || address.includes('apt') || address.includes('#')) {
            return 'CONDO';
        }
        
        // Check for unit count
        const units = parseInt(prop.units) || parseInt(prop.Units) || 0;
        if (units > 1) return 'MULTI';
        
        // Default to SFR
        return 'SFR';
    },
    
    /**
     * Save multiple properties to farm (for CSV upload)
     */
    async savePropertiesToFarm(supabase, user, farmId, properties) {
        try {
            // Debug logging for first property
            if (properties.length > 0) {
                console.log('🔍 First property absentee value:', properties[0].absentee, 'Type:', typeof properties[0].absentee);
            }
            
            // First, insert properties into master_properties table
            const masterProps = properties.map(prop => {
                // Properly handle boolean absentee status
                const isAbsentee = prop.absentee === true || prop.absentee === 'true' || 
                                  prop.absentee === 'Absentee Owner' || prop.absentee === 1;
                
                // Debug specific properties
                if (prop.address && prop.address.includes('35 Raintree Ct 10')) {
                    console.log('🏠 35 Raintree Ct 10 - absentee value:', prop.absentee, 'is_absentee:', isAbsentee);
                }
                
                return {
                apn: prop.apn || prop.id || `temp_${Date.now()}_${Math.random()}`,
                property_address: prop.address || prop.Address || '',
                owner_name: prop.owner || prop.Owner || '',
                latitude: parseFloat(prop.lat) || parseFloat(prop.latitude) || null,
                longitude: parseFloat(prop.lng) || parseFloat(prop.longitude) || null,
                is_absentee: isAbsentee,
                city: prop.city || prop['Site City'] || 'Hayward',
                state: prop.state || prop['Site State'] || 'CA',
                zip_code: prop.zip || prop['Site Zip Code'] || '',
                bedrooms: this.parsePositiveInt(prop.bedrooms) || this.parsePositiveInt(prop.Bedrooms),
                bathrooms: this.parsePositiveFloat(prop.bathrooms) || this.parsePositiveFloat(prop.Baths),
                square_feet: this.parsePositiveInt(prop.sqft) || this.parsePositiveInt(prop['Building Size']),
                year_built: this.parsePositiveInt(prop.yearBuilt) || this.parsePositiveInt(prop['Year Built']),
                property_type: prop.propertyType || prop.type || prop['Property Type'] || 'SFR',
                // Add missing fields from CSV
                purchase_price: this.parsePositiveInt(prop.purchasePrice) || this.parsePositiveInt(prop['Purchase Price']),
                purchase_date: this.validateDate(prop.purchaseDate || prop['Purchase Date']),
                mailing_city: prop.mailCity || prop['Mailing City'] || null,
                mailing_address: (() => {
                    const mailingAddr = prop.mailingAddress || prop['Mailing Address'] || prop.owner_mailing_address || prop['owner_mailing_address'];
                    const propAddr = prop.property_address || prop.address;
                    
                    // Debug logging for mailing address
                    if (mailingAddr && mailingAddr !== propAddr) {
                        console.log('💌 Saving different mailing address:', {
                            apn: prop.apn,
                            property: propAddr,
                            mailing: mailingAddr
                        });
                    }
                    
                    return mailingAddr || propAddr;
                })(),
                lot_size: this.parsePositiveFloat(prop['Lot Size (SqFt)']),
                number_of_units: this.parsePositiveInt(prop.units) || this.parsePositiveInt(prop['Number of Units'])
                };  // Close the return object
            }); // Close the map function

            // Don't insert into master_properties - they should already exist
            // The master database has 48,555 Hayward properties already!
            // Just update the ones that exist with new info (like property type)
            const { error: masterError } = await supabase
                .from('master_properties')
                .upsert(masterProps, { 
                    onConflict: 'apn',
                    ignoreDuplicates: false  // MUST be false to update existing records!
                });

            if (masterError && masterError.code !== '23505') {
                console.error('Error updating master properties:', masterError);
            }

            // Link ALL properties to the farm (they should all exist in master)
            const farmLinks = properties
                .map(prop => ({
                    farm_id: farmId,
                    user_id: user.id,
                    apn: prop.apn || prop.id,
                    private_notes: prop.privateNotes || '',
                    is_hot_list: prop.isHotList || false,
                    priority: 0,
                    status: 'active'
                }));

            // Insert farm links and return the data to get IDs
            const { data, error } = await supabase
                .from('farm_properties')
                .upsert(farmLinks, { 
                    onConflict: 'farm_id,apn',
                    ignoreDuplicates: false  // MUST be false to allow re-linking with updated data
                })
                .select();

            if (error) throw error;
            
            console.log(`✅ Saved ${farmLinks.length} properties to farm`);
            return true;
        } catch (error) {
            console.error('Error saving properties:', error);
            return false;
        }
    },
    
    /**
     * Add property to farm
     */
    async addPropertyToFarm(supabase, user, farmId, apn, notes = '') {
        if (!farmId || !apn) return false;
        
        try {
            const { data, error } = await supabase
                .from('farm_properties')
                .insert({
                    farm_id: farmId,
                    apn: apn,
                    user_id: user.id,
                    private_notes: notes,
                    is_hot_list: false,
                    priority: 0
                })
                .select()
                .single();
            
            if (error) {
                // Check if it's a duplicate
                if (error.code === '23505') {
                    console.warn('Property already in farm');
                    return false;
                }
                throw error;
            }
            
            console.log('✅ Added property to farm:', apn);
            return data;
        } catch (error) {
            console.error('Error adding property to farm:', error);
            return false;
        }
    },
    
    /**
     * Remove property from farm
     */
    async removePropertyFromFarm(supabase, farmPropertyId) {
        try {
            const { error } = await supabase
                .from('farm_properties')
                .delete()
                .eq('id', farmPropertyId);
            
            if (error) throw error;
            
            console.log('✅ Removed property from farm');
            return true;
        } catch (error) {
            console.error('Error removing property:', error);
            return false;
        }
    },
    
    /**
     * Toggle hot list status
     */
    async toggleHotList(supabase, farmPropertyId, isHot) {
        try {
            const { error } = await supabase
                .from('farm_properties')
                .update({ is_hot_list: isHot })
                .eq('id', farmPropertyId);
            
            if (error) throw error;
            
            console.log('✅ Updated hot list status');
            return true;
        } catch (error) {
            console.error('Error updating hot list:', error);
            return false;
        }
    },
    
    /**
     * Update property notes (syncs to cloud)
     */
    async updatePropertyNotes(supabase, farmPropertyId, notes) {
        try {
            console.log('📝 Updating notes for farmPropertyId:', farmPropertyId);
            console.log('📝 Notes content:', notes);
            
            if (!farmPropertyId) {
                console.error('No farmPropertyId provided for notes update');
                return false;
            }
            
            // Use RPC function for reliable updates
            const { data, error } = await supabase
                .rpc('update_property_notes', {
                    p_farm_property_id: farmPropertyId,
                    p_notes: notes
                });
            
            if (error) {
                // Fallback to direct update if function doesn't exist
                console.log('RPC function not found, using direct update');
                const { data: updateData, error: updateError } = await supabase
                    .from('farm_properties')
                    .update({ 
                        notes: notes,
                        private_notes: notes,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', farmPropertyId)
                    .select()
                    .single();
                
                if (updateError) throw updateError;
                
                console.log('✅ Updated property notes via direct update:', updateData);
                return true;
            }
            
            console.log('✅ Updated property notes via RPC:', data);
            return true;
        } catch (error) {
            console.error('Error updating notes:', error);
            console.error('Error details:', error.message, error.code, error.details);
            return false;
        }
    },
    
    /**
     * Get vacant properties
     */
    async getVacantProperties(supabase, limit = 100) {
        try {
            const { data, error } = await supabase
                .from('master_properties')
                .select('*')
                .eq('is_vacant', true)
                .limit(limit);
            
            if (error) throw error;
            
            const results = (data || []).map(prop => ({
                ...prop,
                lat: prop.latitude,
                lng: prop.longitude,
                address: prop.property_address,
                owner: prop.owner_name,
                absentee: prop.is_absentee,
                vacant: true,
                id: prop.apn
            }));
            
            console.log('🏚️ Found', results.length, 'vacant properties');
            return results;
        } catch (error) {
            console.error('Error loading vacant properties:', error);
            return [];
        }
    },
    
    /**
     * Get absentee owner properties
     */
    async getAbsenteeProperties(supabase, limit = 100) {
        try {
            const { data, error } = await supabase
                .from('master_properties')
                .select('*')
                .eq('is_absentee', true)
                .limit(limit);
            
            if (error) throw error;
            
            const results = (data || []).map(prop => ({
                ...prop,
                lat: prop.latitude,
                lng: prop.longitude,
                address: prop.property_address,
                owner: prop.owner_name,
                absentee: true,
                vacant: prop.is_vacant,
                id: prop.apn
            }));
            
            console.log('📬 Found', results.length, 'absentee owner properties');
            return results;
        } catch (error) {
            console.error('Error loading absentee properties:', error);
            return [];
        }
    },
    
    /**
     * Record a door knock visit
     */
    async recordVisit(supabase, farmPropertyId, responseType) {
        try {
            // Get current visit count
            const { data: current } = await supabase
                .from('farm_properties')
                .select('visit_count')
                .eq('id', farmPropertyId)
                .single();
            
            const { error } = await supabase
                .from('farm_properties')
                .update({
                    last_visited: new Date().toISOString().split('T')[0],
                    visit_count: (current?.visit_count || 0) + 1,
                    response_type: responseType
                })
                .eq('id', farmPropertyId);
            
            if (error) throw error;
            
            console.log('✅ Recorded visit:', responseType);
            return true;
        } catch (error) {
            console.error('Error recording visit:', error);
            return false;
        }
    },
    
    /**
     * Delete a farm and all its associated properties
     */
    async deleteFarm(farmId, supabaseClient) {
        try {
            // Accept supabase as parameter or try to get from window
            const supabase = supabaseClient || window.supabaseClient || window.supabase;
            if (!supabase) {
                console.error('Supabase not initialized');
                return false;
            }
            
            console.log(`🗑 Deleting farm ID: ${farmId}`);
            
            // First, delete all farm_properties associated with this farm
            const { error: propError } = await supabase
                .from('farm_properties')
                .delete()
                .eq('farm_id', farmId);
            
            if (propError) {
                console.error('Error deleting farm properties:', propError);
                return false;
            }
            
            // Then delete the farm itself
            const { error: farmError } = await supabase
                .from('user_farms')
                .delete()
                .eq('id', farmId);
            
            if (farmError) {
                console.error('Error deleting farm:', farmError);
                return false;
            }
            
            // Remove from local cache
            this.userFarms = this.userFarms.filter(f => f.id !== farmId);
            
            // Clear current farm if it was the deleted one
            if (this.currentFarm && this.currentFarm.id === farmId) {
                this.currentFarm = null;
            }
            
            console.log(`✅ Successfully deleted farm ID: ${farmId}`);
            return true;
            
        } catch (error) {
            console.error('Error in deleteFarm:', error);
            return false;
        }
    }
};
// Cache bust removed - version 2.0
