/**
 * Legacy Compass Configuration
 * Add your API keys here
 */

window.LEGACY_CONFIG = {
    // REQUIRED: Add your Mapbox token here
    MAPBOX_TOKEN: 'pk.eyJ1IjoibGVnYWN5Y29tcGFzcyIsImEiOiJjbWV5MTNkMDAwdGR2Mm1vZTdtNmo4Nm5mIn0.wnWv7lPl2HNZNI8hmUvb1A',
    
    // Map Settings
    MAP_CENTER: [-122.0808, 37.6688],  // Hayward, CA
    MAP_ZOOM: 17,  // Much closer zoom for property-level view
    
    // MAPBOX STYLE OPTIONS - Pick one!
    // Professional/Clean:
    // MAP_STYLE: 'mapbox://styles/mapbox/streets-v12',          // Clean streets map
    // MAP_STYLE: 'mapbox://styles/mapbox/light-v11',         // Light minimal
    // MAP_STYLE: 'mapbox://styles/mapbox/dark-v11',          // Dark mode
    MAP_STYLE: 'mapbox://styles/mapbox/satellite-streets-v12', // Satellite with labels
    // MAP_STYLE: 'mapbox://styles/mapbox/navigation-night-v1',   // Navigation dark
    // MAP_STYLE: 'mapbox://styles/mapbox/navigation-day-v1',     // Navigation light
    
    // Custom Bloomberg-style (if you have Mapbox Studio):
    // MAP_STYLE: 'mapbox://styles/legacycompass/YOUR_CUSTOM_STYLE_ID',
    
    // Optional: AI/LLM APIs (can add later)
    GHOST_API_URL: '',
    GROQ_API_KEY: '',
    OPENAI_API_KEY: '',
    
    // Optional: Enrichment APIs
    BROWSER_CLOUD_KEY: '',
    SPOKEO_API_KEY: '',
    
    // App Settings
    DEFAULT_TERRITORY: 'hayward',
    MAX_PROPERTIES_DISPLAY: 1000,
    ENABLE_VOICE: true,
    ENABLE_AI: false,  // Set to true when you add AI keys
    
    // Multi-tenant
    TENANT: window.location.pathname.split('/')[1] || 'default'
};

// Make config globally accessible
window.CONFIG = window.LEGACY_CONFIG;