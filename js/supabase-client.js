/**
 * Supabase Client Setup for Legacy Compass
 * Handles connection and authentication with Supabase
 */

// Initialize Supabase client
const SUPABASE_URL = 'https://kfomddpbpsaplyucodli.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtmb21kZHBicHNhcGx5dWNvZGxpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2MzE2MDMsImV4cCI6MjA3MjIwNzYwM30.ETQMg3cVef_wrMRy7eMoI4RkHT6bRHobPPRZf2GYrsY';

// Import Supabase from CDN
const script = document.createElement('script');
script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
script.onload = () => {
    // Skip Supabase initialization in demo mode
    if (localStorage.getItem('demo_mode') === 'true') {
        console.log('🎭 Demo mode - Supabase client not initialized');
        return;
    }
    
    try {
        window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
                persistSession: true,
                autoRefreshToken: true
            },
            realtime: {
                params: {
                    eventsPerSecond: 10
                }
            }
        });
        
        console.log('✅ Supabase client initialized');
        
        // Initialize database tables on first load
        initializeDatabase();
    } catch (error) {
        console.error('Failed to initialize Supabase:', error);
        // Continue without Supabase - don't break the app
    }
};
script.onerror = () => {
    console.error('Failed to load Supabase library');
    // Continue without Supabase - don't break the app
};
document.head.appendChild(script);

/**
 * Initialize database tables if they don't exist
 * Using Supabase's SQL Editor or migrations would be better for production
 */
async function initializeDatabase() {
    // Skip in demo mode
    if (localStorage.getItem('demo_mode') === 'true') {
        console.log('🎭 Demo mode - skipping database initialization');
        return;
    }
    
    if (!window.supabase) {
        console.warn('Supabase not available for database initialization');
        return;
    }
    
    try {
        // Check if user is authenticated
        const { data: { user } } = await window.supabase.auth.getUser();
        
        if (user) {
            console.log('👤 User authenticated:', user.email);
            
            // Subscribe to real-time changes for user's property notes
            subscribeToRealtimeUpdates(user.id);
        }
    } catch (error) {
        console.error('Database initialization error:', error);
        // Continue without real-time updates - don't break the app
    }
}

/**
 * Subscribe to real-time updates for user's data
 */
function subscribeToRealtimeUpdates(userId) {
    // Skip in demo mode or if Supabase not available
    if (localStorage.getItem('demo_mode') === 'true' || !window.supabase) {
        console.log('Skipping real-time subscriptions');
        return null;
    }
    
    try {
        // Subscribe to changes in user_properties table
        const channel = window.supabase.channel('user-properties-changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'user_properties',
                    filter: `user_id=eq.${userId}`
                },
                (payload) => {
                    console.log('Real-time update:', payload);
                    handleRealtimeUpdate(payload);
                }
            )
            .subscribe();
        
        return channel;
    } catch (error) {
        console.error('Failed to subscribe to real-time updates:', error);
        return null;
    }
}

/**
 * Handle real-time updates
 */
function handleRealtimeUpdate(payload) {
    const { eventType, new: newData, old: oldData } = payload;
    
    // Dispatch custom event for the app to handle
    window.dispatchEvent(new CustomEvent('supabase-update', {
        detail: {
            type: eventType,
            data: newData || oldData,
            table: 'user_properties'
        }
    }));
}

/**
 * Database Schema (to be created in Supabase Dashboard)
 * 
 * -- Users table is handled by Supabase Auth
 * 
 * -- User Properties table
 * CREATE TABLE user_properties (
 *     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *     user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
 *     property_id TEXT NOT NULL,
 *     property_address TEXT,
 *     notes TEXT,
 *     tags TEXT[],
 *     status TEXT CHECK (status IN ('hot', 'warm', 'cold', 'contacted', 'not_interested')),
 *     is_favorite BOOLEAN DEFAULT false,
 *     last_contact_date TIMESTAMP,
 *     next_followup_date TIMESTAMP,
 *     voice_notes JSONB,
 *     created_at TIMESTAMP DEFAULT NOW(),
 *     updated_at TIMESTAMP DEFAULT NOW(),
 *     UNIQUE(user_id, property_id)
 * );
 * 
 * -- User Settings table
 * CREATE TABLE user_settings (
 *     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *     user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
 *     preferences JSONB DEFAULT '{}',
 *     territory_data JSONB DEFAULT '{}',
 *     created_at TIMESTAMP DEFAULT NOW(),
 *     updated_at TIMESTAMP DEFAULT NOW()
 * );
 * 
 * -- Activity Log table
 * CREATE TABLE activity_log (
 *     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *     user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
 *     property_id TEXT,
 *     action TEXT NOT NULL,
 *     details JSONB,
 *     created_at TIMESTAMP DEFAULT NOW()
 * );
 * 
 * -- Enable Row Level Security
 * ALTER TABLE user_properties ENABLE ROW LEVEL SECURITY;
 * ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
 * ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
 * 
 * -- Create RLS Policies
 * CREATE POLICY "Users can only see their own properties" ON user_properties
 *     FOR ALL USING (auth.uid() = user_id);
 * 
 * CREATE POLICY "Users can only see their own settings" ON user_settings
 *     FOR ALL USING (auth.uid() = user_id);
 * 
 * CREATE POLICY "Users can only see their own activity" ON activity_log
 *     FOR ALL USING (auth.uid() = user_id);
 * 
 * -- Create indexes for performance
 * CREATE INDEX idx_user_properties_user_id ON user_properties(user_id);
 * CREATE INDEX idx_user_properties_property_id ON user_properties(property_id);
 * CREATE INDEX idx_user_properties_status ON user_properties(status);
 * CREATE INDEX idx_activity_log_user_id ON activity_log(user_id);
 */

// Export for use in other modules
window.SupabaseClient = {
    client: () => window.supabase,
    subscribeToRealtimeUpdates,
    handleRealtimeUpdate
};