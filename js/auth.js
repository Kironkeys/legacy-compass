/**
 * Authentication Module for Legacy Compass
 * Handles user login, signup, and session management
 */

const Auth = {
    /**
     * Check if user is authenticated
     */
    async checkAuth() {
        // Check for demo mode first
        if (localStorage.getItem('demo_mode') === 'true') {
            console.log('🎭 Demo mode active');
            return JSON.parse(localStorage.getItem('demo_user') || '{}');
        }
        
        if (!window.supabase) {
            console.log('Waiting for Supabase to initialize...');
            return null;
        }
        
        const { data: { user }, error } = await window.supabase.auth.getUser();
        
        if (error) {
            console.error('Auth check error:', error);
            return null;
        }
        
        return user;
    },
    
    /**
     * Sign up new user
     */
    async signUp(email, password, fullName = '') {
        const { data, error } = await window.supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: fullName
                }
            }
        });
        
        if (error) throw error;
        
        // Create initial user settings
        if (data.user) {
            await this.createUserSettings(data.user.id);
        }
        
        return data;
    },
    
    /**
     * Sign in existing user
     */
    async signIn(email, password) {
        const { data, error } = await window.supabase.auth.signInWithPassword({
            email,
            password
        });
        
        if (error) throw error;
        
        // Log activity - wrap in try/catch to prevent login failure
        if (data.user) {
            try {
                await this.logActivity(data.user.id, null, 'login', {
                    timestamp: new Date().toISOString()
                });
            } catch (logError) {
                console.error('Activity logging failed (non-fatal):', logError);
                // Don't throw - let login succeed even if logging fails
            }
        }
        
        return data;
    },
    
    /**
     * Sign out current user
     */
    async signOut() {
        // Check for demo mode
        if (localStorage.getItem('demo_mode') === 'true') {
            localStorage.removeItem('demo_mode');
            localStorage.removeItem('demo_user');
            window.location.href = '/login.html';
            return;
        }
        
        const user = await this.checkAuth();
        if (user) {
            try {
                await this.logActivity(user.id, null, 'logout', {
                    timestamp: new Date().toISOString()
                });
            } catch (logError) {
                console.error('Activity logging failed (non-fatal):', logError);
            }
        }
        
        const { error } = await window.supabase.auth.signOut();
        if (error) throw error;
        
        // Redirect to login
        window.location.href = '/login.html';
    },
    
    /**
     * Reset password
     */
    async resetPassword(email) {
        const { data, error } = await window.supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password.html`
        });
        
        if (error) throw error;
        return data;
    },
    
    /**
     * Update password
     */
    async updatePassword(newPassword) {
        const { data, error } = await window.supabase.auth.updateUser({
            password: newPassword
        });
        
        if (error) throw error;
        return data;
    },
    
    /**
     * Create initial user settings
     */
    async createUserSettings(userId) {
        const { error } = await window.supabase
            .from('user_settings')
            .insert({
                user_id: userId,
                preferences: {
                    theme: 'dark',
                    notifications: true,
                    auto_save: true,
                    voice_enabled: true
                },
                territory_data: {}
            });
        
        if (error && error.code !== '23505') { // Ignore duplicate key error
            console.error('Error creating user settings:', error);
        }
    },
    
    /**
     * Log user activity
     */
    async logActivity(userId, propertyId, action, details = {}) {
        // Skip logging in demo mode
        if (localStorage.getItem('demo_mode') === 'true') {
            console.log('📝 Demo mode - skipping activity log');
            return;
        }
        
        // Don't fail if Supabase isn't available
        if (!window.supabase) {
            console.warn('Supabase not available for activity logging');
            return;
        }
        
        try {
            const { error } = await window.supabase
                .from('activity_log')
                .insert({
                    user_id: userId,
                    property_id: propertyId,
                    action: action,
                    details: details
                });
            
            if (error) {
                console.error('Error logging activity:', error);
                // Don't throw - this is non-fatal
            }
        } catch (err) {
            console.error('Failed to log activity:', err);
            // Don't throw - this is non-fatal
        }
    },
    
    /**
     * Get user profile
     */
    async getUserProfile() {
        const user = await this.checkAuth();
        if (!user) return null;
        
        const { data, error } = await window.supabase
            .from('user_settings')
            .select('*')
            .eq('user_id', user.id)
            .single();
        
        if (error) {
            console.error('Error fetching user profile:', error);
            return null;
        }
        
        return {
            ...user,
            settings: data
        };
    },
    
    /**
     * Update user profile
     */
    async updateProfile(updates) {
        const user = await this.checkAuth();
        if (!user) throw new Error('Not authenticated');
        
        const { data, error } = await window.supabase
            .from('user_settings')
            .update({
                preferences: updates,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', user.id);
        
        if (error) throw error;
        return data;
    },
    
    /**
     * Listen for auth state changes
     */
    onAuthStateChange(callback) {
        return window.supabase.auth.onAuthStateChange((event, session) => {
            callback(event, session);
        });
    },
    
    /**
     * Initialize auth listeners
     */
    init() {
        // Skip Supabase listeners in demo mode
        if (localStorage.getItem('demo_mode') === 'true') {
            console.log('🎭 Demo mode - skipping auth listeners');
            // Just check if we need to redirect
            if (window.location.pathname === '/login.html') {
                window.location.href = '/';
            }
            return;
        }
        
        // Listen for auth changes (only for real auth)
        if (window.supabase) {
            this.onAuthStateChange(async (event, session) => {
                console.log('Auth state changed:', event);
                
                switch (event) {
                    case 'SIGNED_IN':
                        // User signed in
                        console.log('User signed in:', session?.user?.email);
                        // Reload the app with user data
                        if (window.location.pathname === '/login.html') {
                            window.location.href = '/';
                        }
                        break;
                        
                    case 'SIGNED_OUT':
                        // User signed out
                        console.log('User signed out');
                        // Clear local data and redirect to login
                        if (window.location.pathname !== '/login.html') {
                            window.location.href = '/login.html';
                        }
                        break;
                        
                    case 'TOKEN_REFRESHED':
                        console.log('Token refreshed');
                        break;
                        
                    case 'USER_UPDATED':
                        console.log('User updated');
                        break;
                }
            });
        }
        
        // Check initial auth state
        this.checkAuth().then(user => {
            // Demo mode or authenticated user can access the app
            const isDemoMode = localStorage.getItem('demo_mode') === 'true';
            const isAuthenticated = user || isDemoMode;
            
            if (!isAuthenticated && window.location.pathname !== '/login.html') {
                // Not authenticated, redirect to login
                window.location.href = '/login.html';
            } else if (isAuthenticated && window.location.pathname === '/login.html') {
                // Already authenticated, redirect to main app
                window.location.href = '/';
            }
        });
    }
};

// Initialize auth when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => Auth.init(), 1000); // Wait for Supabase to load
    });
} else {
    setTimeout(() => Auth.init(), 1000);
}

// Export for use in other modules
window.LegacyAuth = Auth;