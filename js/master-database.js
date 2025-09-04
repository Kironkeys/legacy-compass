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
                    master_properties!inner(*)
                `)
                .eq('farm_id', farmId)
                .order('added_at', { ascending: false });
            
            if (error) throw error;
            
            // Flatten the response and add farm-specific data
            const properties = (data || []).map(item => {
                // Debug logging
                if (item.notes || item.private_notes) {
                    console.log('📝 Property has notes:', item.apn, 'notes:', item.notes, 'private_notes:', item.private_notes);
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
                'Lot Size': item.master_properties.lot_size,
                type: item.master_properties.property_type,
                // Keep lowercase versions too for compatibility
                bedrooms: item.master_properties.bedrooms,
                bathrooms: item.master_properties.bathrooms,
                sqft: item.master_properties.square_feet,
                    yearBuilt: item.master_properties.year_built
                };
            });
            
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
            // First, insert properties into master_properties table
            const masterProps = properties.map(prop => ({
                apn: prop.apn || prop.id || `temp_${Date.now()}_${Math.random()}`,
                property_address: prop.address || prop.Address || '',
                owner_name: prop.owner || prop.Owner || '',
                latitude: parseFloat(prop.lat) || parseFloat(prop.latitude) || null,
                longitude: parseFloat(prop.lng) || parseFloat(prop.longitude) || null,
                is_absentee: prop.absentee === true || prop.absentee === 'true' || prop.absentee === 'Absentee Owner',
                city: prop.city || prop['Site City'] || 'Hayward',
                state: prop.state || prop['Site State'] || 'CA',
                zip_code: prop.zip || prop['Site Zip Code'] || '',
                bedrooms: parseInt(prop.bedrooms) || parseInt(prop.Bedrooms) || null,
                bathrooms: parseFloat(prop.bathrooms) || parseFloat(prop.Baths) || null,
                square_feet: parseInt(prop.sqft) || parseInt(prop['Building Size']) || null,
                year_built: parseInt(prop.yearBuilt) || parseInt(prop['Year Built']) || null,
                property_type: prop.type || prop['Property Type'] || 'SFR',
                // Add missing fields from CSV
                purchase_price: parseInt(prop.purchasePrice) || parseInt(prop['Purchase Price']) || null,
                purchase_date: prop.purchaseDate || prop['Purchase Date'] || null,
                mailing_city: prop.mailCity || prop['Mailing City'] || null,
                lot_size: parseFloat(prop['Lot Size (SqFt)']) || null
            }));

            // Insert into master_properties (skip duplicates)
            const { error: masterError } = await supabase
                .from('master_properties')
                .upsert(masterProps, { 
                    onConflict: 'apn',
                    ignoreDuplicates: true 
                });

            if (masterError && masterError.code !== '23505') {
                console.error('Error inserting master properties:', masterError);
            }

            // Now link them to the farm via farm_properties
            const farmLinks = properties.map(prop => ({
                farm_id: farmId,
                user_id: user.id,
                apn: prop.apn || prop.id || `temp_${Date.now()}_${Math.random()}`,
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
                    ignoreDuplicates: true 
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
    }
};