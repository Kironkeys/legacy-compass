// Legacy Compass - Master Database Integration
// This file contains the updated Supabase integration for the master properties database

// Initialize Supabase client (add to index.html)
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

// Main app modifications for master database
const masterDatabaseIntegration = {
    // Search for properties in master database
    async searchMasterProperties(query) {
        try {
            const { data, error } = await this.supabase
                .from('master_properties')
                .select('*')
                .or(`property_address.ilike.%${query}%,owner_name.ilike.%${query}%,apn.ilike.%${query}%`)
                .limit(100);
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error searching properties:', error);
            return [];
        }
    },

    // Load user's farms
    async loadUserFarms() {
        if (!this.currentUser) return [];
        
        try {
            const { data, error } = await this.supabase
                .from('user_farms')
                .select('*')
                .eq('user_id', this.currentUser.id)
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error loading farms:', error);
            return [];
        }
    },

    // Create a new farm
    async createFarm(farmName, description = '') {
        if (!this.currentUser) {
            alert('Please log in to create farms');
            return null;
        }
        
        try {
            const { data, error } = await this.supabase
                .from('user_farms')
                .insert({
                    user_id: this.currentUser.id,
                    farm_name: farmName,
                    description: description,
                    is_default: false
                })
                .select()
                .single();
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error creating farm:', error);
            alert('Failed to create farm: ' + error.message);
            return null;
        }
    },

    // Add property to farm
    async addPropertyToFarm(farmId, apn, notes = '') {
        if (!this.currentUser) return false;
        
        try {
            const { data, error } = await this.supabase
                .from('farm_properties')
                .insert({
                    farm_id: farmId,
                    apn: apn,
                    user_id: this.currentUser.id,
                    private_notes: notes
                })
                .select()
                .single();
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error adding property to farm:', error);
            return null;
        }
    },

    // Load properties in a farm
    async loadFarmProperties(farmId) {
        if (!this.currentUser) return [];
        
        try {
            const { data, error } = await this.supabase
                .from('farm_properties')
                .select(`
                    *,
                    property:master_properties(*)
                `)
                .eq('farm_id', farmId)
                .eq('user_id', this.currentUser.id);
            
            if (error) throw error;
            
            // Flatten the response
            return data.map(item => ({
                ...item.property,
                farmPropertyId: item.id,
                isHotList: item.is_hot_list,
                privateNotes: item.private_notes,
                lastVisited: item.last_visited,
                visitCount: item.visit_count
            }));
        } catch (error) {
            console.error('Error loading farm properties:', error);
            return [];
        }
    },

    // Toggle hot list status
    async toggleHotList(farmPropertyId, isHot) {
        try {
            const { error } = await this.supabase
                .from('farm_properties')
                .update({ is_hot_list: isHot })
                .eq('id', farmPropertyId)
                .eq('user_id', this.currentUser.id);
            
            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error updating hot list:', error);
            return false;
        }
    },

    // Add enrichment data (phone, email)
    async addEnrichment(apn, phones = [], emails = [], notes = '') {
        if (!this.currentUser) return false;
        
        try {
            const { data, error } = await this.supabase
                .from('property_enrichments')
                .upsert({
                    apn: apn,
                    user_id: this.currentUser.id,
                    phone_numbers: phones,
                    email_addresses: emails,
                    notes: notes
                })
                .select()
                .single();
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error adding enrichment:', error);
            return null;
        }
    },

    // Get all enrichments for a property
    async getPropertyEnrichments(apn) {
        try {
            const { data, error } = await this.supabase
                .from('property_enrichments')
                .select('*')
                .eq('apn', apn);
            
            if (error) throw error;
            
            // Combine all phone numbers and emails from all agents
            const allPhones = new Set();
            const allEmails = new Set();
            
            data.forEach(enrichment => {
                (enrichment.phone_numbers || []).forEach(p => allPhones.add(p));
                (enrichment.email_addresses || []).forEach(e => allEmails.add(e));
            });
            
            return {
                phones: Array.from(allPhones),
                emails: Array.from(allEmails),
                enrichments: data
            };
        } catch (error) {
            console.error('Error getting enrichments:', error);
            return { phones: [], emails: [], enrichments: [] };
        }
    },

    // Record a door knock visit
    async recordVisit(farmPropertyId, responseType) {
        try {
            const { data: current, error: fetchError } = await this.supabase
                .from('farm_properties')
                .select('visit_count')
                .eq('id', farmPropertyId)
                .single();
            
            if (fetchError) throw fetchError;
            
            const { error } = await this.supabase
                .from('farm_properties')
                .update({
                    last_visited: new Date().toISOString().split('T')[0],
                    visit_count: (current.visit_count || 0) + 1,
                    response_type: responseType
                })
                .eq('id', farmPropertyId)
                .eq('user_id', this.currentUser.id);
            
            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error recording visit:', error);
            return false;
        }
    },

    // Get vacant properties
    async getVacantProperties(limit = 100) {
        try {
            const { data, error } = await this.supabase
                .from('master_properties')
                .select('*')
                .eq('is_vacant', true)
                .limit(limit);
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error loading vacant properties:', error);
            return [];
        }
    },

    // Get absentee owner properties
    async getAbsenteeProperties(limit = 100) {
        try {
            const { data, error } = await this.supabase
                .from('master_properties')
                .select('*')
                .eq('is_absentee', true)
                .limit(limit);
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error loading absentee properties:', error);
            return [];
        }
    },

    // Load properties by area (using coordinates)
    async loadPropertiesByBounds(bounds) {
        try {
            const { data, error } = await this.supabase
                .from('master_properties')
                .select('*')
                .gte('latitude', bounds.south)
                .lte('latitude', bounds.north)
                .gte('longitude', bounds.west)
                .lte('longitude', bounds.east)
                .limit(500);
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error loading properties by bounds:', error);
            return [];
        }
    }
};

// Export for use in main app
if (typeof module !== 'undefined' && module.exports) {
    module.exports = masterDatabaseIntegration;
}