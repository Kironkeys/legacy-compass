/**
 * Master Database Integration for Legacy Compass
 * Connects to the new master_properties table with 48,555 Hayward properties
 */

window.MasterDatabase = {
    // Current user's farms
    userFarms: [],
    currentFarm: null,
    
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
            const { data, error } = await supabase
                .from('farm_properties')
                .select(`
                    *,
                    property:master_properties(*)
                `)
                .eq('farm_id', farmId)
                .order('added_at', { ascending: false });
            
            if (error) throw error;
            
            // Flatten the response and add farm-specific data
            const properties = (data || []).map(item => ({
                ...item.property,
                farmPropertyId: item.id,
                isHotList: item.is_hot_list,
                privateNotes: item.private_notes,
                lastVisited: item.last_visited,
                visitCount: item.visit_count,
                priority: item.priority,
                // Add coordinates for map
                lat: item.property.latitude,
                lng: item.property.longitude,
                address: item.property.property_address,
                owner: item.property.owner_name,
                absentee: item.property.is_absentee,
                vacant: item.property.is_vacant
            }));
            
            console.log('🏘️ Loaded', properties.length, 'properties from farm');
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
     * Save multiple properties to farm (for CSV upload)
     */
    async savePropertiesToFarm(supabase, user, farmId, properties) {
        try {
            // Prepare properties for insertion - only essential fields
            const propsToInsert = properties.map(prop => {
                // Create a clean data object with only essential extra fields
                const cleanData = {
                    city: prop.city,
                    state: prop.state,
                    zip: prop.zip,
                    bedrooms: prop.bedrooms,
                    bathrooms: prop.bathrooms,
                    sqft: prop.sqft,
                    yearBuilt: prop.yearBuilt,
                    purchasePrice: prop.purchasePrice,
                    purchaseDate: prop.purchaseDate
                };
                
                return {
                    farm_id: farmId,
                    user_id: user.id,
                    apn: prop.apn || prop.id || `${Date.now()}_${Math.random()}`,
                    address: prop.address || prop.Address || '',
                    owner: prop.owner || prop.Owner || '',
                    lat: parseFloat(prop.lat) || parseFloat(prop.latitude) || null,
                    lng: parseFloat(prop.lng) || parseFloat(prop.longitude) || null,
                    equity: parseInt(prop.equity) || 0,
                    type: prop.type || 'SFR',
                    absentee: prop.absentee === true || prop.absentee === 'true',
                    private_notes: prop.privateNotes || '',
                    tags: prop.tags || [],
                    is_hot_list: prop.isHotList || false,
                    data: cleanData // Store only essential extra data
                };
            });

            // Insert in batches
            const { data, error } = await supabase
                .from('farm_properties')
                .upsert(propsToInsert, { onConflict: 'apn,farm_id' });

            if (error) throw error;
            
            console.log(`✅ Saved ${propsToInsert.length} properties to farm`);
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
     * Update property notes
     */
    async updatePropertyNotes(supabase, farmPropertyId, notes) {
        try {
            const { error } = await supabase
                .from('farm_properties')
                .update({ 
                    private_notes: notes,
                    updated_at: new Date().toISOString()
                })
                .eq('id', farmPropertyId);
            
            if (error) throw error;
            
            console.log('✅ Updated property notes');
            return true;
        } catch (error) {
            console.error('Error updating notes:', error);
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
    }
};