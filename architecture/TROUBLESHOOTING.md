# Legacy Compass Troubleshooting Guide

## Common Issues and Solutions

### 1. Notes Not Persisting

#### Problem
User adds notes to a property, but they disappear after page refresh or don't save to the database.

#### Symptoms
- Notes appear to save but vanish on refresh
- Console shows 401 Unauthorized errors
- Notes saved in one session not visible in another

#### Root Causes
1. **Authentication token expired**
2. **RLS policies blocking writes**
3. **Missing user_id in request**
4. **Offline mode without sync**

#### Solutions

**Solution 1: Check Authentication Status**
```javascript
// In browser console, check auth status
const { data: { user }, error } = await supabase.auth.getUser();
console.log('Current user:', user);
console.log('Auth error:', error);

// If user is null, re-authenticate
if (!user) {
    await Auth.signIn(email, password);
}
```

**Solution 2: Verify RLS Policies**
```sql
-- Check if RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename = 'farm_properties';

-- Test policy with current user
SET LOCAL role TO authenticated;
SET LOCAL auth.uid TO 'your-user-uuid';
SELECT * FROM farm_properties WHERE user_id = auth.uid();
```

**Solution 3: Fix Save Function**
```javascript
// Ensure user_id is included in save
async saveNotes(propertyId, notes) {
    // Get current user first
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        console.error('No authenticated user');
        return false;
    }
    
    const { data, error } = await supabase
        .from('farm_properties')
        .upsert({
            apn: propertyId,
            user_id: user.id,  // Critical: include user_id
            notes: notes,
            updated_at: new Date().toISOString()
        }, {
            onConflict: 'farm_id,apn'
        });
    
    if (error) {
        console.error('Save failed:', error);
        // Fallback to localStorage
        localStorage.setItem(`notes_${propertyId}`, notes);
        return false;
    }
    
    return true;
}
```

**Solution 4: Implement Offline Queue**
```javascript
// Queue notes for later sync
class OfflineQueue {
    constructor() {
        this.queue = JSON.parse(localStorage.getItem('offline_queue') || '[]');
    }
    
    addToQueue(action, data) {
        this.queue.push({
            id: crypto.randomUUID(),
            action,
            data,
            timestamp: Date.now()
        });
        localStorage.setItem('offline_queue', JSON.stringify(this.queue));
    }
    
    async processQueue() {
        const pending = [...this.queue];
        this.queue = [];
        
        for (const item of pending) {
            try {
                await this.processItem(item);
            } catch (error) {
                // Re-queue failed items
                this.queue.push(item);
            }
        }
        
        localStorage.setItem('offline_queue', JSON.stringify(this.queue));
    }
}
```

### 2. Authentication Issues

#### Problem
Users cannot log in, get logged out randomly, or experience session issues.

#### Symptoms
- "Invalid login credentials" error
- Sudden logouts during use
- "Network error" when authenticating
- Session not persisting across tabs

#### Solutions

**Solution 1: Session Recovery**
```javascript
// Add session recovery to app initialization
async function initApp() {
    // Check for existing session
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
        console.error('Session error:', error);
        
        // Try to recover from localStorage
        const savedSession = localStorage.getItem('sb-session');
        if (savedSession) {
            const { data, error } = await supabase.auth.setSession(JSON.parse(savedSession));
            if (!error) {
                console.log('Session recovered');
            }
        }
    }
    
    // Set up auth state listener
    supabase.auth.onAuthStateChange((event, session) => {
        if (session) {
            localStorage.setItem('sb-session', JSON.stringify(session));
        } else {
            localStorage.removeItem('sb-session');
        }
    });
}
```

**Solution 2: Fix CORS Issues**
```javascript
// Ensure proper CORS headers in Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
    },
    global: {
        headers: {
            'x-client-info': 'legacy-compass'
        }
    }
});
```

**Solution 3: Implement Auth Retry Logic**
```javascript
class AuthManager {
    async signInWithRetry(email, password, maxAttempts = 3) {
        let lastError;
        
        for (let i = 0; i < maxAttempts; i++) {
            try {
                const { data, error } = await supabase.auth.signInWithPassword({
                    email,
                    password
                });
                
                if (error) throw error;
                
                return data;
            } catch (error) {
                lastError = error;
                console.warn(`Auth attempt ${i + 1} failed:`, error.message);
                
                // Wait before retrying (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
            }
        }
        
        throw lastError;
    }
}
```

### 3. CSV Upload Problems

#### Problem
CSV files fail to upload, parse incorrectly, or properties don't appear on the map.

#### Symptoms
- "Invalid CSV format" error
- Properties missing after upload
- Incorrect data mapping
- Geocoding failures

#### Solutions

**Solution 1: Smart Column Detection**
```javascript
// Improved column detection algorithm
class CSVParser {
    detectColumns(headers) {
        const mappings = {};
        const patterns = {
            address: /^(property[_\s]?)?address|street|location|addr$/i,
            owner: /^owner[_\s]?(name)?|name|proprietor$/i,
            apn: /^apn|parcel[_\s]?(number|id)|assessor$/i,
            value: /^(property[_\s]?)?value|price|amount|assessed$/i,
            phone: /^phone|tel|mobile|cell|contact$/i,
            email: /^email|e-mail|mail|contact[_\s]?email$/i
        };
        
        headers.forEach((header, index) => {
            const cleaned = header.trim().toLowerCase();
            
            for (const [field, pattern] of Object.entries(patterns)) {
                if (pattern.test(cleaned)) {
                    mappings[field] = index;
                    break;
                }
            }
        });
        
        return mappings;
    }
}
```

**Solution 2: Handle Encoding Issues**
```javascript
// Fix encoding problems with CSV files
async function parseCSV(file) {
    // Detect encoding
    const arrayBuffer = await file.slice(0, 1024).arrayBuffer();
    const encoding = detectEncoding(arrayBuffer);
    
    // Read with correct encoding
    const text = await file.text();
    const utf8Text = new TextDecoder(encoding).decode(
        new TextEncoder().encode(text)
    );
    
    // Parse CSV
    const lines = utf8Text.split(/\r?\n/);
    const headers = parseCSVLine(lines[0]);
    
    const data = [];
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim()) {
            data.push(parseCSVLine(lines[i]));
        }
    }
    
    return { headers, data };
}

function parseCSVLine(line) {
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
}
```

**Solution 3: Batch Geocoding with Fallback**
```javascript
// Geocode addresses with multiple fallback strategies
class Geocoder {
    async geocodeAddresses(addresses) {
        const results = [];
        const BATCH_SIZE = 10;
        
        for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
            const batch = addresses.slice(i, i + BATCH_SIZE);
            
            const geocoded = await Promise.allSettled(
                batch.map(addr => this.geocodeWithFallback(addr))
            );
            
            results.push(...geocoded.map((r, idx) => ({
                address: batch[idx],
                ...r.value || { error: r.reason }
            })));
            
            // Rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        return results;
    }
    
    async geocodeWithFallback(address) {
        // Try Mapbox first
        try {
            return await this.geocodeMapbox(address);
        } catch (error) {
            console.warn('Mapbox geocoding failed, trying alternative');
        }
        
        // Fallback to Nominatim
        try {
            return await this.geocodeNominatim(address);
        } catch (error) {
            console.warn('Nominatim failed, using approximate location');
        }
        
        // Last resort: approximate based on city
        return this.approximateLocation(address);
    }
}
```

### 4. Property Details Not Showing

#### Problem
Clicking on a property doesn't show details, or the detail panel is empty/broken.

#### Symptoms
- Detail panel doesn't open
- Data shows as "undefined" or empty
- Console errors about missing properties
- Panel opens but immediately closes

#### Solutions

**Solution 1: Fix Event Handlers**
```javascript
// Ensure proper event binding for dynamic elements
document.addEventListener('DOMContentLoaded', () => {
    // Use event delegation for dynamic property cards
    document.getElementById('property-list').addEventListener('click', (e) => {
        const card = e.target.closest('.property-card');
        if (!card) return;
        
        const propertyId = card.dataset.propertyId;
        if (!propertyId) {
            console.error('No property ID on card');
            return;
        }
        
        showPropertyDetails(propertyId);
    });
});

async function showPropertyDetails(propertyId) {
    try {
        // Fetch property data
        const property = await getPropertyData(propertyId);
        
        if (!property) {
            throw new Error('Property not found');
        }
        
        // Update detail panel
        updateDetailPanel(property);
        
        // Show panel
        document.getElementById('detail-panel').classList.add('open');
    } catch (error) {
        console.error('Failed to show property details:', error);
        showErrorToast('Unable to load property details');
    }
}
```

**Solution 2: Handle Missing Data Gracefully**
```javascript
function updateDetailPanel(property) {
    // Safe data access with fallbacks
    const safeGet = (obj, path, defaultValue = 'N/A') => {
        return path.split('.').reduce((acc, part) => 
            acc && acc[part] !== undefined ? acc[part] : defaultValue, obj);
    };
    
    // Update UI with safe values
    document.getElementById('detail-address').textContent = 
        safeGet(property, 'address', 'Unknown Address');
    
    document.getElementById('detail-owner').textContent = 
        safeGet(property, 'owner_name', 'Unknown Owner');
    
    document.getElementById('detail-value').textContent = 
        formatCurrency(safeGet(property, 'property_value', 0));
    
    document.getElementById('detail-equity').textContent = 
        `${safeGet(property, 'equity_percentage', 0)}%`;
    
    // Handle arrays safely
    const phones = property.phone_numbers || [];
    const phoneContainer = document.getElementById('detail-phones');
    phoneContainer.innerHTML = phones.length > 0 
        ? phones.map(p => `<a href="tel:${p}">${p}</a>`).join('<br>')
        : 'No phone numbers';
}
```

**Solution 3: Fix Panel Animation Issues**
```css
/* CSS fixes for detail panel */
.detail-panel {
    position: fixed;
    right: -100%;
    top: 0;
    width: 400px;
    height: 100vh;
    background: white;
    transition: right 0.3s ease-out;
    z-index: 1000;
    overflow-y: auto;
}

.detail-panel.open {
    right: 0;
}

/* Prevent layout thrashing */
.detail-panel * {
    will-change: auto;
}

/* Fix for iOS momentum scrolling */
.detail-panel {
    -webkit-overflow-scrolling: touch;
}
```

### 5. Map Performance Issues

#### Problem
Map is slow, laggy, or crashes with large datasets.

#### Solutions

**Solution 1: Implement Clustering**
```javascript
// Use clustering for large datasets
map.addSource('properties', {
    type: 'geojson',
    data: propertyGeoJSON,
    cluster: true,
    clusterMaxZoom: 14,
    clusterRadius: 50,
    clusterProperties: {
        'sum': ['+', ['get', 'property_value']]
    }
});
```

**Solution 2: Viewport-Based Loading**
```javascript
// Only load visible properties
map.on('moveend', debounce(async () => {
    const bounds = map.getBounds();
    const zoom = map.getZoom();
    
    if (zoom < 10) {
        // Too zoomed out, show message
        showMessage('Zoom in to see properties');
        return;
    }
    
    const properties = await loadPropertiesInBounds(
        bounds.getNorth(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getWest()
    );
    
    updateMapData(properties);
}, 500));
```

**Solution 3: Optimize Marker Rendering**
```javascript
// Use canvas markers for better performance
class CanvasMarkerFactory {
    createMarker(property) {
        const el = document.createElement('div');
        el.className = 'marker';
        
        // Use CSS transforms instead of repositioning
        el.style.transform = `translate(-50%, -50%)`;
        el.style.willChange = 'transform';
        
        // Lazy load marker details
        el.addEventListener('mouseenter', () => {
            this.loadMarkerDetails(el, property);
        }, { once: true });
        
        return new mapboxgl.Marker(el)
            .setLngLat([property.longitude, property.latitude]);
    }
}
```

### 6. Voice Recording Issues

#### Problem
Voice notes don't record, playback fails, or audio quality is poor.

#### Solutions

**Solution 1: Fix Microphone Permissions**
```javascript
async function initVoiceRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: 44100
            }
        });
        
        // Test recording
        const mediaRecorder = new MediaRecorder(stream);
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                console.log('Recording working');
            }
        };
        
        // Clean up test
        stream.getTracks().forEach(track => track.stop());
        
    } catch (error) {
        if (error.name === 'NotAllowedError') {
            showError('Microphone permission denied. Please enable in browser settings.');
        } else if (error.name === 'NotFoundError') {
            showError('No microphone found. Please connect a microphone.');
        } else {
            showError('Voice recording initialization failed: ' + error.message);
        }
    }
}
```

**Solution 2: Handle Recording State Properly**
```javascript
class VoiceRecorder {
    constructor() {
        this.isRecording = false;
        this.mediaRecorder = null;
        this.audioChunks = [];
    }
    
    async startRecording() {
        if (this.isRecording) {
            console.warn('Already recording');
            return;
        }
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            });
            
            this.audioChunks = [];
            
            this.mediaRecorder.ondataavailable = (event) => {
                this.audioChunks.push(event.data);
            };
            
            this.mediaRecorder.onstop = () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                this.saveRecording(audioBlob);
                
                // Clean up
                stream.getTracks().forEach(track => track.stop());
            };
            
            this.mediaRecorder.start();
            this.isRecording = true;
            
            // Update UI
            document.getElementById('record-btn').classList.add('recording');
            
        } catch (error) {
            console.error('Failed to start recording:', error);
            this.handleRecordingError(error);
        }
    }
    
    stopRecording() {
        if (!this.isRecording || !this.mediaRecorder) {
            console.warn('Not recording');
            return;
        }
        
        this.mediaRecorder.stop();
        this.isRecording = false;
        
        // Update UI
        document.getElementById('record-btn').classList.remove('recording');
    }
}
```

### 7. Data Sync Issues

#### Problem
Data doesn't sync between devices, conflicts occur, or updates are lost.

#### Solutions

**Solution 1: Implement Conflict Resolution**
```javascript
class SyncManager {
    async resolveConflict(local, remote) {
        // Last-write-wins strategy
        const localTime = new Date(local.updated_at).getTime();
        const remoteTime = new Date(remote.updated_at).getTime();
        
        if (localTime > remoteTime) {
            // Local is newer, push to server
            await this.pushToServer(local);
            return local;
        } else if (remoteTime > localTime) {
            // Remote is newer, update local
            await this.updateLocal(remote);
            return remote;
        } else {
            // Same timestamp, merge data
            return this.mergeData(local, remote);
        }
    }
    
    mergeData(local, remote) {
        // Merge strategy: combine non-conflicting fields
        const merged = { ...remote };
        
        // Preserve local notes if remote is empty
        if (local.notes && !remote.notes) {
            merged.notes = local.notes;
        }
        
        // Combine tags
        const allTags = new Set([
            ...(local.tags || []),
            ...(remote.tags || [])
        ]);
        merged.tags = Array.from(allTags);
        
        // Keep latest contact date
        merged.last_contact_date = Math.max(
            new Date(local.last_contact_date || 0),
            new Date(remote.last_contact_date || 0)
        );
        
        return merged;
    }
}
```

**Solution 2: Real-time Sync with Conflict Detection**
```javascript
// Set up real-time subscriptions with conflict detection
const subscription = supabase
    .channel('property-changes')
    .on('postgres_changes',
        {
            event: 'UPDATE',
            schema: 'public',
            table: 'farm_properties'
        },
        async (payload) => {
            const localVersion = await getLocalProperty(payload.new.id);
            
            if (localVersion && 
                localVersion.updated_at !== payload.old.updated_at) {
                // Conflict detected
                console.warn('Conflict detected for property:', payload.new.id);
                
                const resolved = await syncManager.resolveConflict(
                    localVersion,
                    payload.new
                );
                
                // Update UI with resolved data
                updatePropertyInUI(resolved);
            } else {
                // No conflict, apply update
                updatePropertyInUI(payload.new);
            }
        }
    )
    .subscribe();
```

## Debug Utilities

### Browser Console Commands

```javascript
// Useful debugging commands to run in browser console

// Check Supabase connection
window.testSupabase = async () => {
    const { data, error } = await supabase.from('master_properties').select('count');
    console.log('Connection test:', { data, error });
};

// Clear all local data
window.clearAllData = () => {
    localStorage.clear();
    sessionStorage.clear();
    indexedDB.deleteDatabase('LegacyCompassOffline');
    console.log('All local data cleared');
};

// Export debug info
window.exportDebugInfo = async () => {
    const info = {
        timestamp: new Date().toISOString(),
        browser: navigator.userAgent,
        viewport: {
            width: window.innerWidth,
            height: window.innerHeight
        },
        localStorage: { ...localStorage },
        sessionStorage: { ...sessionStorage },
        supabaseAuth: await supabase.auth.getUser(),
        errors: window.errorLog || []
    };
    
    const blob = new Blob([JSON.stringify(info, null, 2)], 
        { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `debug-${Date.now()}.json`;
    a.click();
};

// Monitor network requests
window.monitorNetwork = () => {
    const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
            if (entry.initiatorType === 'fetch' || 
                entry.initiatorType === 'xmlhttprequest') {
                console.log('Network request:', {
                    url: entry.name,
                    duration: entry.duration,
                    size: entry.transferSize
                });
            }
        }
    });
    
    observer.observe({ entryTypes: ['resource'] });
    console.log('Network monitoring started');
};
```

### Performance Profiling

```javascript
// Profile specific operations
class PerformanceProfiler {
    constructor() {
        this.marks = new Map();
    }
    
    start(label) {
        performance.mark(`${label}-start`);
        this.marks.set(label, performance.now());
    }
    
    end(label) {
        performance.mark(`${label}-end`);
        const duration = performance.now() - this.marks.get(label);
        
        performance.measure(
            label,
            `${label}-start`,
            `${label}-end`
        );
        
        console.log(`${label}: ${duration.toFixed(2)}ms`);
        
        return duration;
    }
    
    getReport() {
        const measures = performance.getEntriesByType('measure');
        return measures.map(m => ({
            name: m.name,
            duration: m.duration,
            timestamp: m.startTime
        }));
    }
}

// Usage
const profiler = new PerformanceProfiler();
profiler.start('load-properties');
await loadProperties();
profiler.end('load-properties');
```

## Emergency Recovery Procedures

### 1. Complete System Reset

```bash
# Backend reset
psql $DATABASE_URL << EOF
-- Backup user data first
CREATE TABLE farm_properties_backup AS SELECT * FROM farm_properties;
CREATE TABLE user_settings_backup AS SELECT * FROM user_settings;

-- Reset tables
TRUNCATE farm_properties CASCADE;
TRUNCATE user_settings CASCADE;

-- Restore from backup if needed
INSERT INTO farm_properties SELECT * FROM farm_properties_backup;
INSERT INTO user_settings SELECT * FROM user_settings_backup;
EOF
```

### 2. Client-Side Recovery

```javascript
// Emergency recovery function
async function emergencyRecovery() {
    console.log('Starting emergency recovery...');
    
    try {
        // 1. Clear corrupted local data
        localStorage.clear();
        sessionStorage.clear();
        
        // 2. Force logout
        await supabase.auth.signOut();
        
        // 3. Clear service worker cache
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const registration of registrations) {
                await registration.unregister();
            }
        }
        
        // 4. Clear IndexedDB
        const databases = await indexedDB.databases();
        for (const db of databases) {
            await indexedDB.deleteDatabase(db.name);
        }
        
        // 5. Reload app
        window.location.href = '/';
        
    } catch (error) {
        console.error('Recovery failed:', error);
        alert('Manual intervention required. Please contact support.');
    }
}
```

## Support Contact Information

For issues that cannot be resolved using this guide:

1. **Check System Status**: https://status.supabase.com
2. **Review Logs**: Supabase Dashboard → Logs → Error Logs
3. **Database Queries**: Supabase Dashboard → SQL Editor
4. **Browser Console**: Press F12 and check Console tab for errors

---

Last Updated: January 2025