/**
 * User Data Management for Legacy Compass
 * Handles user-specific property data, notes, and tags
 */

const UserData = {
    currentUser: null,
    propertyCache: new Map(),
    
    /**
     * Initialize user data
     */
    async init() {
        // Get current user
        const { data: { user } } = await window.supabase.auth.getUser();
        if (!user) return;
        
        this.currentUser = user;
        
        // Load user's property data
        await this.loadUserProperties();
        
        // Set up real-time listeners
        this.setupRealtimeSync();
    },
    
    /**
     * Load all user properties from Supabase
     */
    async loadUserProperties() {
        // Skip in demo mode
        if (localStorage.getItem('demo_mode') === 'true') {
            console.log('Demo mode - loading from localStorage only');
            return this.loadFromLocalStorage();
        }
        
        if (!window.supabase || !this.currentUser) {
            console.warn('Cannot load properties - Supabase or user not available');
            return this.loadFromLocalStorage();
        }
        
        if (!this.currentUser) return [];
        
        const { data, error } = await window.supabase
            .from('user_properties')
            .select('*')
            .eq('user_id', this.currentUser.id)
            .order('updated_at', { ascending: false });
        
        if (error) {
            console.error('Error loading user properties:', error);
            return [];
        }
        
        // Cache the properties
        data.forEach(prop => {
            this.propertyCache.set(prop.property_id, prop);
        });
        
        return data;
    },
    
    /**
     * Get user data for a specific property
     */
    async getPropertyData(propertyId) {
        // In demo mode, get from localStorage
        if (localStorage.getItem('demo_mode') === 'true') {
            return this.getFromLocalStorage(propertyId);
        }
        
        if (!window.supabase || !this.currentUser) {
            console.warn('Cannot get property - Supabase or user not available');
            return this.getFromLocalStorage(propertyId);
        }
        
        // Check cache first
        if (this.propertyCache.has(propertyId)) {
            return this.propertyCache.get(propertyId);
        }
        
        if (!this.currentUser) return null;
        
        const { data, error } = await window.supabase
            .from('user_properties')
            .select('*')
            .eq('user_id', this.currentUser.id)
            .eq('property_id', propertyId)
            .single();
        
        if (error && error.code !== 'PGRST116') { // Not found is OK
            console.error('Error fetching property data:', error);
        }
        
        if (data) {
            this.propertyCache.set(propertyId, data);
        }
        
        return data;
    },
    
    /**
     * Save or update property notes
     */
    async savePropertyNotes(propertyId, notes, propertyAddress = '') {
        // In demo mode, only save to localStorage
        if (localStorage.getItem('demo_mode') === 'true') {
            return this.saveToLocalStorage(propertyId, { notes, propertyAddress });
        }
        
        if (!window.supabase || !this.currentUser) {
            console.warn('Cannot save - Supabase or user not available');
            return this.saveToLocalStorage(propertyId, { notes, propertyAddress });
        }
        
        if (!this.currentUser) {
            console.error('User not authenticated');
            return null;
        }
        
        const timestamp = new Date().toISOString();
        
        // Check if property data exists
        const existing = await this.getPropertyData(propertyId);
        
        let result;
        if (existing) {
            // Update existing record
            const { data, error } = await window.supabase
                .from('user_properties')
                .update({
                    notes: notes,
                    property_address: propertyAddress || existing.property_address,
                    updated_at: timestamp
                })
                .eq('user_id', this.currentUser.id)
                .eq('property_id', propertyId)
                .select()
                .single();
            
            if (error) throw error;
            result = data;
        } else {
            // Create new record
            const { data, error } = await window.supabase
                .from('user_properties')
                .insert({
                    user_id: this.currentUser.id,
                    property_id: propertyId,
                    property_address: propertyAddress,
                    notes: notes,
                    tags: [],
                    status: 'cold',
                    is_favorite: false
                })
                .select()
                .single();
            
            if (error) throw error;
            result = data;
        }
        
        // Update cache
        this.propertyCache.set(propertyId, result);
        
        // Log activity
        await window.LegacyAuth.logActivity(
            this.currentUser.id,
            propertyId,
            'note_added',
            { notes: notes.substring(0, 100) }
        );
        
        return result;
    },
    
    /**
     * Save voice note transcription
     */
    async saveVoiceNote(propertyId, transcription, audioBlob = null) {
        if (!this.currentUser) return null;
        
        const timestamp = new Date().toISOString();
        const existing = await this.getPropertyData(propertyId);
        
        // Prepare voice note data
        const voiceNote = {
            transcription,
            timestamp,
            duration: 0 // Could calculate from audioBlob if needed
        };
        
        // Get existing voice notes or create new array
        const voiceNotes = existing?.voice_notes || [];
        voiceNotes.push(voiceNote);
        
        // Append transcription to main notes
        const currentNotes = existing?.notes || '';
        const updatedNotes = currentNotes + 
            (currentNotes ? '\n\n' : '') + 
            `🎤 Voice Note (${new Date(timestamp).toLocaleString()}):\n${transcription}`;
        
        // Update database
        const { data, error } = await window.supabase
            .from('user_properties')
            .upsert({
                user_id: this.currentUser.id,
                property_id: propertyId,
                notes: updatedNotes,
                voice_notes: voiceNotes,
                updated_at: timestamp
            })
            .select()
            .single();
        
        if (error) throw error;
        
        // Update cache
        this.propertyCache.set(propertyId, data);
        
        return data;
    },
    
    /**
     * Update property tags
     */
    async updatePropertyTags(propertyId, tags) {
        if (!this.currentUser) return null;
        
        const { data, error } = await window.supabase
            .from('user_properties')
            .upsert({
                user_id: this.currentUser.id,
                property_id: propertyId,
                tags: tags,
                updated_at: new Date().toISOString()
            })
            .select()
            .single();
        
        if (error) throw error;
        
        // Update cache
        this.propertyCache.set(propertyId, data);
        
        return data;
    },
    
    /**
     * Update property status
     */
    async updatePropertyStatus(propertyId, status) {
        if (!this.currentUser) return null;
        
        const validStatuses = ['hot', 'warm', 'cold', 'contacted', 'not_interested'];
        if (!validStatuses.includes(status)) {
            throw new Error(`Invalid status: ${status}`);
        }
        
        const { data, error } = await window.supabase
            .from('user_properties')
            .upsert({
                user_id: this.currentUser.id,
                property_id: propertyId,
                status: status,
                updated_at: new Date().toISOString()
            })
            .select()
            .single();
        
        if (error) throw error;
        
        // Update cache
        this.propertyCache.set(propertyId, data);
        
        // Log activity
        await window.LegacyAuth.logActivity(
            this.currentUser.id,
            propertyId,
            'status_changed',
            { status }
        );
        
        return data;
    },
    
    /**
     * Toggle property favorite status (hot list)
     */
    async toggleFavorite(propertyId, propertyAddress = '') {
        if (!this.currentUser) return null;
        
        const existing = await this.getPropertyData(propertyId);
        const isFavorite = existing ? !existing.is_favorite : true;
        
        const { data, error } = await window.supabase
            .from('user_properties')
            .upsert({
                user_id: this.currentUser.id,
                property_id: propertyId,
                property_address: propertyAddress || existing?.property_address,
                is_favorite: isFavorite,
                updated_at: new Date().toISOString()
            })
            .select()
            .single();
        
        if (error) throw error;
        
        // Update cache
        this.propertyCache.set(propertyId, data);
        
        return data;
    },
    
    /**
     * Get user's hot list (favorites)
     */
    async getHotList() {
        if (!this.currentUser) return [];
        
        const { data, error } = await window.supabase
            .from('user_properties')
            .select('*')
            .eq('user_id', this.currentUser.id)
            .eq('is_favorite', true)
            .order('updated_at', { ascending: false });
        
        if (error) {
            console.error('Error fetching hot list:', error);
            return [];
        }
        
        return data;
    },
    
    /**
     * Set next follow-up date
     */
    async setFollowUpDate(propertyId, date) {
        if (!this.currentUser) return null;
        
        const { data, error } = await window.supabase
            .from('user_properties')
            .upsert({
                user_id: this.currentUser.id,
                property_id: propertyId,
                next_followup_date: date,
                updated_at: new Date().toISOString()
            })
            .select()
            .single();
        
        if (error) throw error;
        
        // Update cache
        this.propertyCache.set(propertyId, data);
        
        return data;
    },
    
    /**
     * Record contact attempt
     */
    async recordContact(propertyId, contactType, notes = '') {
        if (!this.currentUser) return null;
        
        const timestamp = new Date().toISOString();
        
        const { data, error } = await window.supabase
            .from('user_properties')
            .upsert({
                user_id: this.currentUser.id,
                property_id: propertyId,
                last_contact_date: timestamp,
                updated_at: timestamp
            })
            .select()
            .single();
        
        if (error) throw error;
        
        // Update cache
        this.propertyCache.set(propertyId, data);
        
        // Log activity
        await window.LegacyAuth.logActivity(
            this.currentUser.id,
            propertyId,
            `contact_${contactType}`,
            { notes }
        );
        
        return data;
    },
    
    /**
     * Setup real-time sync
     */
    setupRealtimeSync() {
        if (!this.currentUser) return;
        
        // Subscribe to changes
        const channel = window.supabase
            .channel(`user-${this.currentUser.id}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'user_properties',
                    filter: `user_id=eq.${this.currentUser.id}`
                },
                (payload) => {
                    this.handleRealtimeUpdate(payload);
                }
            )
            .subscribe();
        
        return channel;
    },
    
    /**
     * Handle real-time updates
     */
    handleRealtimeUpdate(payload) {
        const { eventType, new: newData, old: oldData } = payload;
        
        switch (eventType) {
            case 'INSERT':
            case 'UPDATE':
                // Update cache
                if (newData) {
                    this.propertyCache.set(newData.property_id, newData);
                    
                    // Dispatch event for UI update
                    window.dispatchEvent(new CustomEvent('property-updated', {
                        detail: { property: newData }
                    }));
                }
                break;
                
            case 'DELETE':
                // Remove from cache
                if (oldData) {
                    this.propertyCache.delete(oldData.property_id);
                    
                    // Dispatch event for UI update
                    window.dispatchEvent(new CustomEvent('property-deleted', {
                        detail: { propertyId: oldData.property_id }
                    }));
                }
                break;
        }
    },
    
    /**
     * Export user data
     */
    async exportUserData() {
        if (!this.currentUser) return null;
        
        const properties = await this.loadUserProperties();
        const settings = await window.supabase
            .from('user_settings')
            .select('*')
            .eq('user_id', this.currentUser.id)
            .single();
        
        return {
            user: {
                id: this.currentUser.id,
                email: this.currentUser.email
            },
            properties: properties,
            settings: settings.data,
            exported_at: new Date().toISOString()
        };
    },
    
    /**
     * Sync offline changes
     */
    async syncOfflineChanges() {
        // Get offline changes from IndexedDB
        const offlineChanges = await this.getOfflineChanges();
        
        if (offlineChanges.length === 0) return;
        
        console.log(`Syncing ${offlineChanges.length} offline changes...`);
        
        for (const change of offlineChanges) {
            try {
                switch (change.type) {
                    case 'note':
                        await this.savePropertyNotes(
                            change.property_id,
                            change.data.notes,
                            change.data.address
                        );
                        break;
                    case 'tag':
                        await this.updatePropertyTags(
                            change.property_id,
                            change.data.tags
                        );
                        break;
                    case 'status':
                        await this.updatePropertyStatus(
                            change.property_id,
                            change.data.status
                        );
                        break;
                    case 'favorite':
                        await this.toggleFavorite(
                            change.property_id,
                            change.data.address
                        );
                        break;
                }
                
                // Remove from offline queue after successful sync
                await this.removeOfflineChange(change.id);
            } catch (error) {
                console.error('Error syncing change:', error);
            }
        }
        
        console.log('Offline sync complete');
    },
    
    /**
     * Store offline change for later sync
     */
    async storeOfflineChange(type, propertyId, data) {
        const db = await this.getIndexedDB();
        const tx = db.transaction(['offline_changes'], 'readwrite');
        const store = tx.objectStore('offline_changes');
        
        await store.add({
            type,
            property_id: propertyId,
            data,
            timestamp: new Date().toISOString()
        });
    },
    
    /**
     * Get offline changes from IndexedDB
     */
    async getOfflineChanges() {
        const db = await this.getIndexedDB();
        const tx = db.transaction(['offline_changes'], 'readonly');
        const store = tx.objectStore('offline_changes');
        
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },
    
    /**
     * Remove offline change after sync
     */
    async removeOfflineChange(id) {
        const db = await this.getIndexedDB();
        const tx = db.transaction(['offline_changes'], 'readwrite');
        const store = tx.objectStore('offline_changes');
        
        await store.delete(id);
    },
    
    /**
     * Get or create IndexedDB
     */
    async getIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('LegacyCompass', 2);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create offline changes store if it doesn't exist
                if (!db.objectStoreNames.contains('offline_changes')) {
                    const store = db.createObjectStore('offline_changes', {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    store.createIndex('property_id', 'property_id');
                    store.createIndex('timestamp', 'timestamp');
                }
            };
        });
    },
    
    /**
     * LocalStorage helper methods for demo mode and offline support
     */
    loadFromLocalStorage() {
        try {
            const stored = localStorage.getItem('legacy_compass_properties');
            if (stored) {
                const data = JSON.parse(stored);
                this.properties = data;
                console.log(`Loaded ${Object.keys(data).length} properties from localStorage`);
                return data;
            }
        } catch (error) {
            console.error('Error loading from localStorage:', error);
        }
        return {};
    },
    
    saveToLocalStorage(propertyId, data) {
        try {
            if (!this.properties) {
                this.properties = {};
            }
            
            // Update or create property data
            this.properties[propertyId] = {
                ...this.properties[propertyId],
                ...data,
                updated_at: new Date().toISOString()
            };
            
            // Save to localStorage
            localStorage.setItem('legacy_compass_properties', JSON.stringify(this.properties));
            console.log(`Saved property ${propertyId} to localStorage`);
            return true;
        } catch (error) {
            console.error('Error saving to localStorage:', error);
            return false;
        }
    },
    
    getFromLocalStorage(propertyId) {
        try {
            if (!this.properties) {
                this.loadFromLocalStorage();
            }
            return this.properties[propertyId] || null;
        } catch (error) {
            console.error('Error getting from localStorage:', error);
            return null;
        }
    },
    
    deleteFromLocalStorage(propertyId) {
        try {
            if (!this.properties) {
                this.properties = {};
            }
            
            delete this.properties[propertyId];
            
            // Save updated properties
            localStorage.setItem('legacy_compass_properties', JSON.stringify(this.properties));
            console.log(`Deleted property ${propertyId} from localStorage`);
            return true;
        } catch (error) {
            console.error('Error deleting from localStorage:', error);
            return false;
        }
    }
};

// Initialize when Supabase is ready
window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        // Initialize regardless of Supabase availability
        UserData.init().catch(error => {
            console.error('UserData init error (non-fatal):', error);
        });
    }, 1500); // Wait for Supabase and Auth to initialize
});

// Listen for online/offline events
window.addEventListener('online', () => {
    console.log('Back online - syncing changes...');
    UserData.syncOfflineChanges();
});

// Export for use in other modules
window.UserData = UserData;