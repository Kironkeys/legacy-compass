# Legacy Compass Complete Implementation Guide
## Build the Bloomberg Terminal of Real Estate from Scratch

**Version:** 1.0.0  
**Last Updated:** January 2025  
**Production URL:** https://legacy-compass.netlify.app

---

## Table of Contents
1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Environment Setup](#environment-setup)
4. [Supabase Configuration](#supabase-configuration)
5. [Database Setup](#database-setup)
6. [File Structure](#file-structure)
7. [Core Implementation](#core-implementation)
8. [Deployment](#deployment)
9. [Testing & Verification](#testing--verification)

---

## Overview

Legacy Compass is a Progressive Web App (PWA) that provides real estate professionals with a powerful property management and analysis platform. It features:

- **48,555 Hayward properties** pre-loaded with county data
- **Interactive TomTom maps** with satellite view and property markers
- **Multi-farm management** - organize properties into custom farms
- **CSV upload** for bulk property import
- **Notes system** with private and shared notes
- **Hot list** for priority properties
- **Voice notes** recording capability
- **Real-time sync** across devices
- **Offline support** with local storage fallback

---

## Prerequisites

### Required Accounts
1. **Supabase Account** - For database and authentication
   - Sign up at: https://supabase.com
   - Free tier is sufficient for development

2. **TomTom Maps API Key** - For mapping
   - Sign up at: https://developer.tomtom.com
   - Free tier provides 2,500 transactions/day

3. **Netlify Account** - For deployment (optional, can use Vercel)
   - Sign up at: https://netlify.com
   - Connect to GitHub for auto-deployment

### Development Tools
```bash
# Required
- Text editor (VS Code recommended)
- Git for version control
- Python 3.8+ (for data import scripts)
- Node.js 16+ (for local development server)

# Optional
- Postman or similar for API testing
- DB client for Supabase (TablePlus, DBeaver)
```

---

## Environment Setup

### 1. Clone or Create Project Structure
```bash
# Create project directory
mkdir legacy-compass
cd legacy-compass

# Initialize git
git init

# Create directory structure
mkdir -p {css,js,assets/icons,data}
```

### 2. Install Dependencies
```bash
# For local development server
npm init -y
npm install --save-dev http-server

# For Python data import scripts
pip install supabase python-dotenv
```

### 3. Create Environment Configuration

Create `.env` file in root:
```bash
# Supabase Configuration
SUPABASE_URL=https://kfomddpbpsaplyucodli.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtmb21kZHBicHNhcGx5dWNvZGxpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzA0NjYyNzgsImV4cCI6MjA0NjA0MjI3OH0.6rW7lPaIH_WCLDt61YlVsbGGfhuQpxyQoOYCPAcOSfE

# TomTom Maps
TOMTOM_API_KEY=your_tomtom_api_key_here

# Optional: Additional APIs
MAPBOX_TOKEN=pk.your_mapbox_token_if_using_mapbox
```

---

## Supabase Configuration

### 1. Create Supabase Project
1. Go to https://supabase.com/dashboard
2. Click "New Project"
3. Fill in:
   - Project name: `legacy-compass`
   - Database password: (save this securely)
   - Region: Choose closest to your users

### 2. Configure Authentication

Navigate to **Authentication > URL Configuration** and set:

```
Site URL: https://legacy-compass.netlify.app

Redirect URLs:
https://legacy-compass.netlify.app/confirm.html
https://legacy-compass.netlify.app/index.html
http://localhost:8080/confirm.html
http://localhost:8080/index.html
```

### 3. Enable Email Authentication
1. Go to **Authentication > Providers**
2. Ensure "Email" is enabled
3. Configure email templates under **Authentication > Email Templates**

---

## Database Setup

### 1. Master Database Schema

Run this SQL in Supabase SQL Editor to create all tables:

```sql
-- Legacy Compass Master Database Schema
-- Creates the complete database structure

-- Drop existing tables for clean setup
DROP TABLE IF EXISTS farm_properties CASCADE;
DROP TABLE IF EXISTS user_farms CASCADE;
DROP TABLE IF EXISTS property_enrichments CASCADE;
DROP TABLE IF EXISTS master_properties CASCADE;

-- Master Properties Table (48,555 Hayward properties)
CREATE TABLE master_properties (
    apn TEXT PRIMARY KEY,
    property_address TEXT NOT NULL,
    city TEXT DEFAULT 'Hayward',
    state TEXT DEFAULT 'CA',
    zip_code TEXT,
    
    -- Owner Information
    owner_name TEXT,
    owner_mailing_address TEXT,
    mailing_city TEXT,
    mailing_state TEXT,
    mailing_zip TEXT,
    is_absentee BOOLEAN DEFAULT false,
    
    -- Property Details
    land_value DECIMAL,
    improvement_value DECIMAL,
    total_value DECIMAL,
    year_built INTEGER,
    bedrooms INTEGER,
    bathrooms DECIMAL,
    square_feet INTEGER,
    lot_size DECIMAL,
    property_type TEXT,
    
    -- Financial Data
    purchase_price DECIMAL,
    purchase_date DATE,
    equity_percent DECIMAL,
    
    -- Location Data
    latitude DECIMAL NOT NULL,
    longitude DECIMAL NOT NULL,
    
    -- Status Flags
    is_vacant BOOLEAN DEFAULT false,
    is_verified BOOLEAN DEFAULT false,
    
    -- Metadata
    data_source TEXT DEFAULT 'county',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Farms (Private property collections)
CREATE TABLE user_farms (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    farm_name TEXT NOT NULL,
    description TEXT,
    
    -- Farm settings
    color TEXT DEFAULT '#3B82F6',
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,
    
    -- Stats
    property_count INTEGER DEFAULT 0,
    total_value DECIMAL DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, farm_name)
);

-- Farm Properties (Junction table)
CREATE TABLE farm_properties (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    farm_id UUID NOT NULL REFERENCES user_farms(id) ON DELETE CASCADE,
    apn TEXT NOT NULL REFERENCES master_properties(apn) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Farm-specific data
    is_hot_list BOOLEAN DEFAULT false,
    priority INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    
    -- Notes (KEY FEATURE)
    notes TEXT,
    private_notes TEXT,
    voice_notes_url TEXT,
    
    -- Activity tracking
    last_visited DATE,
    visit_count INTEGER DEFAULT 0,
    last_contact DATE,
    contact_attempts INTEGER DEFAULT 0,
    response_type TEXT,
    
    -- Tags
    tags TEXT[],
    
    -- Metadata
    added_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(farm_id, apn)
);

-- Property Enrichments (Shared data)
CREATE TABLE property_enrichments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    apn TEXT NOT NULL REFERENCES master_properties(apn),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    
    -- Contact Information
    phone_numbers TEXT[],
    email_addresses TEXT[],
    
    -- Additional data
    notes TEXT,
    tags TEXT[],
    verified_date DATE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(apn, user_id)
);

-- Create indexes for performance
CREATE INDEX idx_master_properties_owner ON master_properties(owner_name);
CREATE INDEX idx_master_properties_address ON master_properties(property_address);
CREATE INDEX idx_master_properties_location ON master_properties(latitude, longitude);
CREATE INDEX idx_master_properties_absentee ON master_properties(is_absentee);
CREATE INDEX idx_master_properties_city ON master_properties(city);
CREATE INDEX idx_farm_properties_farm ON farm_properties(farm_id);
CREATE INDEX idx_farm_properties_hot ON farm_properties(is_hot_list);
CREATE INDEX idx_farm_properties_apn ON farm_properties(apn);

-- Enable Row Level Security
ALTER TABLE master_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_farms ENABLE ROW LEVEL SECURITY;
ALTER TABLE farm_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_enrichments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Master properties: everyone can read
CREATE POLICY "Public read master properties" 
ON master_properties FOR SELECT 
TO authenticated 
USING (true);

-- User farms: users see only their own
CREATE POLICY "Users see own farms" 
ON user_farms FOR ALL 
TO authenticated 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Farm properties: users manage their own
CREATE POLICY "Users manage own farm properties" 
ON farm_properties FOR ALL 
TO authenticated 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Property enrichments: shared read, own write
CREATE POLICY "Read all enrichments" 
ON property_enrichments FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Write own enrichments" 
ON property_enrichments FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Update own enrichments" 
ON property_enrichments FOR UPDATE 
TO authenticated 
USING (auth.uid() = user_id);

-- Automatic timestamp update function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply timestamp triggers
CREATE TRIGGER update_master_properties_timestamp 
    BEFORE UPDATE ON master_properties 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_user_farms_timestamp 
    BEFORE UPDATE ON user_farms 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_farm_properties_timestamp 
    BEFORE UPDATE ON farm_properties 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### 2. Import Hayward Property Data

The system includes 48,555 properties split into chunks. Import process:

```python
# run_import.py - Property data import script
import os
from supabase import create_client, Client
from dotenv import load_dotenv
import glob
import time

load_dotenv()

# Initialize Supabase client
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_ANON_KEY")
supabase: Client = create_client(url, key)

def import_chunk(filename):
    """Import a single SQL chunk file"""
    print(f"Importing {filename}...")
    
    with open(filename, 'r') as file:
        sql_content = file.read()
        
    try:
        # Execute SQL directly
        result = supabase.postgrest.rpc('exec_sql', {'query': sql_content}).execute()
        print(f"✅ Successfully imported {filename}")
        return True
    except Exception as e:
        print(f"❌ Error importing {filename}: {e}")
        return False

def main():
    # Find all chunk files
    chunk_files = sorted(glob.glob("chunk_*.sql"))
    
    print(f"Found {len(chunk_files)} chunk files to import")
    
    success_count = 0
    for chunk_file in chunk_files:
        if import_chunk(chunk_file):
            success_count += 1
        time.sleep(1)  # Rate limiting
    
    print(f"\n✅ Import complete: {success_count}/{len(chunk_files)} chunks imported")

if __name__ == "__main__":
    main()
```

---

## File Structure

### Core HTML Files

#### index.html - Main Application
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Legacy Compass</title>
    
    <!-- TomTom Maps SDK -->
    <link rel='stylesheet' type='text/css' href='https://api.tomtom.com/maps-sdk-for-web/cdn/6.x/6.25.0/maps/maps.css'>
    <script src="https://api.tomtom.com/maps-sdk-for-web/cdn/6.x/6.25.0/maps/maps-web.min.js"></script>
    
    <!-- Supabase -->
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    
    <!-- Alpine.js for reactivity -->
    <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
    
    <!-- Styles -->
    <link rel="stylesheet" href="css/styles.css">
</head>
<body>
    <div id="app" x-data="legacyCompass()">
        <!-- Header with stats -->
        <header class="app-header">
            <div class="header-content">
                <div class="logo">
                    <span class="logo-dot"></span>
                    <span>Legacy Compass</span>
                    <span class="farm-name" x-text="currentFarm?.farm_name || 'Loading...'"></span>
                </div>
                
                <div class="stats">
                    <div class="stat">
                        <div class="stat-value" x-text="properties.length"></div>
                        <div class="stat-label">Properties</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value" x-text="hotListCount"></div>
                        <div class="stat-label">Hot List</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value" x-text="notesCount"></div>
                        <div class="stat-label">Notes</div>
                    </div>
                </div>
                
                <div class="user-menu">
                    <span x-text="user?.email"></span>
                    <button @click="logout()">Logout</button>
                </div>
            </div>
        </header>
        
        <!-- Main content area -->
        <div class="main-container">
            <!-- Map container -->
            <div class="map-container">
                <div id="map"></div>
            </div>
            
            <!-- Property list sidebar -->
            <div class="sidebar" :class="{ 'sidebar-open': sidebarOpen }">
                <div class="sidebar-header">
                    <input type="text" 
                           placeholder="Search properties..." 
                           x-model="searchQuery"
                           @input="filterProperties()">
                    
                    <div class="sidebar-actions">
                        <button @click="showUploadModal = true">Upload CSV</button>
                        <button @click="toggleHotListFilter()">Hot List</button>
                    </div>
                </div>
                
                <div class="property-list">
                    <template x-for="property in filteredProperties" :key="property.apn">
                        <div class="property-card" 
                             @click="selectProperty(property)"
                             :class="{ 'selected': selectedProperty?.apn === property.apn }">
                            
                            <div class="property-header">
                                <h3 x-text="property.property_address"></h3>
                                <div class="property-badges">
                                    <span class="badge" x-show="property.is_absentee">Absentee</span>
                                    <span class="badge hot" x-show="property.isHotList">🔥 Hot</span>
                                </div>
                            </div>
                            
                            <div class="property-details">
                                <div class="owner-info">
                                    <strong x-text="property.owner_name"></strong>
                                    <span x-show="property.is_absentee" x-text="property.owner_mailing_address"></span>
                                </div>
                                
                                <div class="property-stats">
                                    <span x-show="property.bedrooms">
                                        <span x-text="property.bedrooms"></span> bed
                                    </span>
                                    <span x-show="property.bathrooms">
                                        <span x-text="property.bathrooms"></span> bath
                                    </span>
                                    <span x-show="property.square_feet">
                                        <span x-text="property.square_feet"></span> sqft
                                    </span>
                                    <span x-show="property.year_built">
                                        Built <span x-text="property.year_built"></span>
                                    </span>
                                </div>
                                
                                <!-- Notes section -->
                                <div class="property-notes" x-show="property.notes || property.private_notes">
                                    <div class="notes-content">
                                        <p x-text="property.notes || property.private_notes"></p>
                                    </div>
                                </div>
                                
                                <!-- Quick actions -->
                                <div class="property-actions">
                                    <button @click.stop="toggleHotList(property)">
                                        <span x-show="!property.isHotList">Add to Hot List</span>
                                        <span x-show="property.isHotList">Remove from Hot List</span>
                                    </button>
                                    <button @click.stop="editNotes(property)">Add Note</button>
                                    <button @click.stop="showOnMap(property)">Show on Map</button>
                                </div>
                            </div>
                        </div>
                    </template>
                </div>
            </div>
        </div>
        
        <!-- Upload CSV Modal -->
        <div class="modal" x-show="showUploadModal" x-cloak>
            <div class="modal-content">
                <h2>Upload Properties CSV</h2>
                <input type="file" id="csvFile" accept=".csv">
                <div class="modal-actions">
                    <button @click="uploadCSV()">Upload</button>
                    <button @click="showUploadModal = false">Cancel</button>
                </div>
            </div>
        </div>
        
        <!-- Notes Modal -->
        <div class="modal" x-show="showNotesModal" x-cloak>
            <div class="modal-content">
                <h2>Property Notes</h2>
                <p x-text="editingProperty?.property_address"></p>
                <textarea x-model="tempNotes" 
                          placeholder="Add your notes here..." 
                          rows="10"></textarea>
                <div class="modal-actions">
                    <button @click="saveNotes()">Save</button>
                    <button @click="showNotesModal = false">Cancel</button>
                </div>
            </div>
        </div>
    </div>
    
    <!-- JavaScript -->
    <script src="js/config.js"></script>
    <script src="js/master-database.js"></script>
    <script src="js/app.js"></script>
</body>
</html>
```

#### login.html - Authentication Page
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Legacy Compass - Login</title>
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    <link rel="stylesheet" href="css/login.css">
</head>
<body>
    <div class="login-container">
        <div class="login-box">
            <h1>Legacy Compass</h1>
            <p>The Bloomberg Terminal of Real Estate</p>
            
            <form id="authForm">
                <input type="email" id="email" placeholder="Email" required>
                <input type="password" id="password" placeholder="Password" required>
                
                <div class="form-actions">
                    <button type="submit" id="loginBtn">Login</button>
                    <button type="button" id="signupBtn">Sign Up</button>
                </div>
            </form>
            
            <div id="message" class="message"></div>
        </div>
    </div>
    
    <script>
        const SUPABASE_URL = 'https://kfomddpbpsaplyucodli.supabase.co';
        const SUPABASE_ANON_KEY = 'your_anon_key_here';
        const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        
        const form = document.getElementById('authForm');
        const loginBtn = document.getElementById('loginBtn');
        const signupBtn = document.getElementById('signupBtn');
        const message = document.getElementById('message');
        
        loginBtn.onclick = async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            const { data, error } = await supabase.auth.signInWithPassword({
                email, password
            });
            
            if (error) {
                message.textContent = error.message;
                message.className = 'message error';
            } else {
                window.location.href = '/index.html';
            }
        };
        
        signupBtn.onclick = async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            const { data, error } = await supabase.auth.signUp({
                email, password
            });
            
            if (error) {
                message.textContent = error.message;
                message.className = 'message error';
            } else {
                message.textContent = 'Check your email to confirm your account!';
                message.className = 'message success';
            }
        };
    </script>
</body>
</html>
```

---

## Core Implementation

### JavaScript Core Files

#### js/config.js - Configuration
```javascript
window.LEGACY_CONFIG = {
    // TomTom Maps Configuration
    TOMTOM_API_KEY: 'your_tomtom_api_key_here',
    
    // Map Settings
    MAP_CENTER: [-122.0808, 37.6688],  // Hayward, CA
    MAP_ZOOM: 14,
    
    // Supabase Configuration
    SUPABASE_URL: 'https://kfomddpbpsaplyucodli.supabase.co',
    SUPABASE_ANON_KEY: 'your_anon_key_here',
    
    // App Settings
    DEFAULT_FARM_NAME: 'My Properties',
    MAX_PROPERTIES_DISPLAY: 1000,
    ENABLE_VOICE_NOTES: true,
    AUTO_SAVE_INTERVAL: 5000, // 5 seconds
};
```

#### js/master-database.js - Database Integration
```javascript
window.MasterDatabase = {
    userFarms: [],
    currentFarm: null,
    
    async initialize(supabase, user) {
        console.log('Initializing master database...');
        
        // Load user's farms
        await this.loadUserFarms(supabase, user);
        
        // Create default farm if none exist
        if (this.userFarms.length === 0) {
            await this.createFarm(supabase, user, 'My First Farm', true);
        } else {
            this.currentFarm = this.userFarms[0];
        }
        
        return true;
    },
    
    async loadUserFarms(supabase, user) {
        const { data, error } = await supabase
            .from('user_farms')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });
        
        if (!error) {
            this.userFarms = data || [];
        }
        return this.userFarms;
    },
    
    async createFarm(supabase, user, farmName, isDefault = false) {
        const { data, error } = await supabase
            .from('user_farms')
            .insert({
                user_id: user.id,
                farm_name: farmName,
                is_default: isDefault
            })
            .select()
            .single();
        
        if (!error) {
            this.userFarms.unshift(data);
            this.currentFarm = data;
        }
        return data;
    },
    
    async loadFarmProperties(supabase, farmId) {
        const { data, error } = await supabase
            .from('farm_properties')
            .select(`
                *,
                master_properties!inner(*)
            `)
            .eq('farm_id', farmId);
        
        if (!error) {
            // Flatten the response
            return (data || []).map(item => ({
                ...item.master_properties,
                farmPropertyId: item.id,
                isHotList: item.is_hot_list,
                notes: item.notes,
                private_notes: item.private_notes,
                tags: item.tags
            }));
        }
        return [];
    },
    
    async addPropertyToFarm(supabase, userId, farmId, apn) {
        const { data, error } = await supabase
            .from('farm_properties')
            .insert({
                farm_id: farmId,
                apn: apn,
                user_id: userId
            })
            .select()
            .single();
        
        return !error ? data : null;
    },
    
    async updatePropertyNotes(supabase, farmPropertyId, notes) {
        const { error } = await supabase
            .from('farm_properties')
            .update({ notes, updated_at: new Date() })
            .eq('id', farmPropertyId);
        
        return !error;
    },
    
    async toggleHotList(supabase, farmPropertyId, isHot) {
        const { error } = await supabase
            .from('farm_properties')
            .update({ is_hot_list: isHot })
            .eq('id', farmPropertyId);
        
        return !error;
    },
    
    async searchMasterProperties(supabase, query) {
        const { data, error } = await supabase
            .from('master_properties')
            .select('*')
            .or(`property_address.ilike.%${query}%,owner_name.ilike.%${query}%`)
            .limit(100);
        
        return error ? [] : data;
    }
};
```

#### js/app.js - Main Application Logic
```javascript
function legacyCompass() {
    return {
        // State
        user: null,
        supabase: null,
        map: null,
        properties: [],
        filteredProperties: [],
        selectedProperty: null,
        currentFarm: null,
        searchQuery: '',
        sidebarOpen: true,
        showUploadModal: false,
        showNotesModal: false,
        editingProperty: null,
        tempNotes: '',
        markers: [],
        
        // Computed
        get hotListCount() {
            return this.properties.filter(p => p.isHotList).length;
        },
        
        get notesCount() {
            return this.properties.filter(p => p.notes || p.private_notes).length;
        },
        
        // Initialization
        async init() {
            console.log('Initializing Legacy Compass...');
            
            // Initialize Supabase
            this.supabase = window.supabase.createClient(
                window.LEGACY_CONFIG.SUPABASE_URL,
                window.LEGACY_CONFIG.SUPABASE_ANON_KEY
            );
            
            // Check auth
            const { data: { user } } = await this.supabase.auth.getUser();
            if (!user) {
                window.location.href = '/login.html';
                return;
            }
            this.user = user;
            
            // Initialize database
            await window.MasterDatabase.initialize(this.supabase, user);
            this.currentFarm = window.MasterDatabase.currentFarm;
            
            // Load properties
            await this.loadProperties();
            
            // Initialize map
            this.initMap();
            
            // Set up auto-save
            setInterval(() => this.autoSave(), window.LEGACY_CONFIG.AUTO_SAVE_INTERVAL);
        },
        
        // Map initialization
        initMap() {
            this.map = tt.map({
                key: window.LEGACY_CONFIG.TOMTOM_API_KEY,
                container: 'map',
                center: window.LEGACY_CONFIG.MAP_CENTER,
                zoom: window.LEGACY_CONFIG.MAP_ZOOM,
                style: 'tomtom://vector/1/basic-main'
            });
            
            // Add navigation controls
            this.map.addControl(new tt.NavigationControl());
            
            // Load property markers
            this.loadMarkers();
        },
        
        // Load properties from database
        async loadProperties() {
            if (!this.currentFarm) return;
            
            this.properties = await window.MasterDatabase.loadFarmProperties(
                this.supabase, 
                this.currentFarm.id
            );
            
            this.filteredProperties = [...this.properties];
            console.log(`Loaded ${this.properties.length} properties`);
        },
        
        // Add markers to map
        loadMarkers() {
            // Clear existing markers
            this.markers.forEach(marker => marker.remove());
            this.markers = [];
            
            // Add new markers
            this.properties.forEach(property => {
                if (property.latitude && property.longitude) {
                    // Create marker element
                    const el = document.createElement('div');
                    el.className = 'property-marker';
                    if (property.isHotList) {
                        el.classList.add('hot-marker');
                    }
                    
                    // Create marker
                    const marker = new tt.Marker({ element: el })
                        .setLngLat([property.longitude, property.latitude])
                        .setPopup(new tt.Popup({ offset: 30 })
                            .setHTML(`
                                <div class="popup">
                                    <h4>${property.property_address}</h4>
                                    <p>${property.owner_name}</p>
                                    ${property.notes ? `<p class="notes">${property.notes}</p>` : ''}
                                </div>
                            `))
                        .addTo(this.map);
                    
                    // Store reference
                    this.markers.push(marker);
                    
                    // Click handler
                    el.addEventListener('click', () => {
                        this.selectProperty(property);
                    });
                }
            });
        },
        
        // Search/filter properties
        filterProperties() {
            const query = this.searchQuery.toLowerCase();
            
            if (!query) {
                this.filteredProperties = [...this.properties];
            } else {
                this.filteredProperties = this.properties.filter(p => 
                    p.property_address?.toLowerCase().includes(query) ||
                    p.owner_name?.toLowerCase().includes(query) ||
                    p.notes?.toLowerCase().includes(query)
                );
            }
        },
        
        // Toggle hot list filter
        toggleHotListFilter() {
            if (this.filteredProperties.length === this.hotListCount) {
                this.filteredProperties = [...this.properties];
            } else {
                this.filteredProperties = this.properties.filter(p => p.isHotList);
            }
        },
        
        // Select property
        selectProperty(property) {
            this.selectedProperty = property;
            
            // Center map on property
            if (property.latitude && property.longitude) {
                this.map.flyTo({
                    center: [property.longitude, property.latitude],
                    zoom: 18
                });
            }
        },
        
        // Show property on map
        showOnMap(property) {
            this.selectProperty(property);
        },
        
        // Toggle hot list status
        async toggleHotList(property) {
            property.isHotList = !property.isHotList;
            
            await window.MasterDatabase.toggleHotList(
                this.supabase,
                property.farmPropertyId,
                property.isHotList
            );
            
            // Update marker
            this.loadMarkers();
        },
        
        // Edit notes
        editNotes(property) {
            this.editingProperty = property;
            this.tempNotes = property.notes || '';
            this.showNotesModal = true;
        },
        
        // Save notes
        async saveNotes() {
            if (!this.editingProperty) return;
            
            this.editingProperty.notes = this.tempNotes;
            
            await window.MasterDatabase.updatePropertyNotes(
                this.supabase,
                this.editingProperty.farmPropertyId,
                this.tempNotes
            );
            
            this.showNotesModal = false;
            this.editingProperty = null;
            this.tempNotes = '';
        },
        
        // Upload CSV
        async uploadCSV() {
            const fileInput = document.getElementById('csvFile');
            const file = fileInput.files[0];
            
            if (!file) {
                alert('Please select a CSV file');
                return;
            }
            
            const reader = new FileReader();
            reader.onload = async (e) => {
                const csv = e.target.result;
                await this.processCSV(csv);
                this.showUploadModal = false;
            };
            reader.readAsText(file);
        },
        
        // Process CSV data
        async processCSV(csv) {
            const lines = csv.split('\n');
            const headers = lines[0].split(',').map(h => h.trim());
            
            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',');
                if (values.length < 2) continue;
                
                const property = {};
                headers.forEach((header, index) => {
                    property[header] = values[index]?.trim();
                });
                
                // Add to farm if has APN
                if (property.APN || property.apn) {
                    await window.MasterDatabase.addPropertyToFarm(
                        this.supabase,
                        this.user.id,
                        this.currentFarm.id,
                        property.APN || property.apn
                    );
                }
            }
            
            // Reload properties
            await this.loadProperties();
            this.loadMarkers();
        },
        
        // Auto-save (placeholder for future features)
        autoSave() {
            // Auto-save logic here
        },
        
        // Logout
        async logout() {
            await this.supabase.auth.signOut();
            window.location.href = '/login.html';
        }
    };
}
```

### CSS Styles

#### css/styles.css - Main Styles
```css
/* Reset and Base Styles */
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0a0a0a;
    color: #ffffff;
    height: 100vh;
    overflow: hidden;
}

/* Header */
.app-header {
    background: #0f0f0f;
    border-bottom: 2px solid #ff9500;
    padding: 12px 20px;
}

.header-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.logo {
    display: flex;
    align-items: center;
    gap: 10px;
    color: #ff9500;
    font-weight: bold;
    font-size: 18px;
}

.logo-dot {
    width: 10px;
    height: 10px;
    background: #ff9500;
    border-radius: 50%;
    animation: pulse 2s infinite;
}

@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
}

.farm-name {
    color: #ffb700;
    font-size: 14px;
    margin-left: 10px;
}

/* Stats */
.stats {
    display: flex;
    gap: 30px;
}

.stat {
    text-align: center;
}

.stat-value {
    font-size: 24px;
    font-weight: bold;
    color: #ff9500;
}

.stat-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #666;
    margin-top: 4px;
}

/* User Menu */
.user-menu {
    display: flex;
    align-items: center;
    gap: 15px;
    color: #999;
    font-size: 14px;
}

.user-menu button {
    background: #ff9500;
    color: #000;
    border: none;
    padding: 6px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
}

/* Main Container */
.main-container {
    display: flex;
    height: calc(100vh - 70px);
}

/* Map Container */
.map-container {
    flex: 1;
    position: relative;
}

#map {
    width: 100%;
    height: 100%;
}

/* Property Markers */
.property-marker {
    width: 12px;
    height: 12px;
    background: #3b82f6;
    border: 2px solid #fff;
    border-radius: 50%;
    cursor: pointer;
    transition: all 0.2s;
}

.property-marker:hover {
    transform: scale(1.5);
}

.property-marker.hot-marker {
    background: #ff4444;
    box-shadow: 0 0 10px rgba(255, 68, 68, 0.5);
}

/* Sidebar */
.sidebar {
    width: 400px;
    background: #0f0f0f;
    border-left: 1px solid #222;
    display: flex;
    flex-direction: column;
    transition: transform 0.3s;
}

.sidebar-header {
    padding: 15px;
    border-bottom: 1px solid #222;
}

.sidebar-header input {
    width: 100%;
    background: #1a1a1a;
    border: 1px solid #333;
    color: #fff;
    padding: 10px;
    border-radius: 4px;
    font-size: 14px;
}

.sidebar-actions {
    display: flex;
    gap: 10px;
    margin-top: 10px;
}

.sidebar-actions button {
    flex: 1;
    background: #1a1a1a;
    color: #ff9500;
    border: 1px solid #333;
    padding: 8px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
}

.sidebar-actions button:hover {
    background: #222;
}

/* Property List */
.property-list {
    flex: 1;
    overflow-y: auto;
    padding: 10px;
}

.property-card {
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 6px;
    padding: 15px;
    margin-bottom: 10px;
    cursor: pointer;
    transition: all 0.2s;
}

.property-card:hover {
    border-color: #ff9500;
}

.property-card.selected {
    background: #2a2a2a;
    border-color: #ff9500;
}

.property-header {
    display: flex;
    justify-content: space-between;
    align-items: start;
    margin-bottom: 10px;
}

.property-header h3 {
    font-size: 15px;
    color: #ff9500;
    margin: 0;
}

.property-badges {
    display: flex;
    gap: 5px;
}

.badge {
    background: #333;
    color: #999;
    padding: 2px 8px;
    border-radius: 3px;
    font-size: 11px;
    text-transform: uppercase;
}

.badge.hot {
    background: #ff4444;
    color: #fff;
}

.property-details {
    font-size: 13px;
    color: #999;
}

.owner-info {
    margin-bottom: 8px;
}

.owner-info strong {
    color: #fff;
    display: block;
    margin-bottom: 4px;
}

.property-stats {
    display: flex;
    gap: 15px;
    margin: 10px 0;
    font-size: 12px;
}

.property-notes {
    background: #0a0a0a;
    padding: 10px;
    border-radius: 4px;
    margin: 10px 0;
}

.notes-content p {
    margin: 0;
    color: #ffb700;
    font-size: 13px;
    line-height: 1.5;
}

.property-actions {
    display: flex;
    gap: 8px;
    margin-top: 10px;
}

.property-actions button {
    flex: 1;
    background: transparent;
    color: #ff9500;
    border: 1px solid #333;
    padding: 6px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s;
}

.property-actions button:hover {
    background: #ff9500;
    color: #000;
}

/* Modals */
.modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

.modal-content {
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 25px;
    width: 90%;
    max-width: 500px;
}

.modal-content h2 {
    color: #ff9500;
    margin-bottom: 20px;
}

.modal-content textarea {
    width: 100%;
    background: #0a0a0a;
    border: 1px solid #333;
    color: #fff;
    padding: 10px;
    border-radius: 4px;
    font-size: 14px;
    resize: vertical;
}

.modal-content input[type="file"] {
    width: 100%;
    padding: 10px;
    background: #0a0a0a;
    border: 1px solid #333;
    color: #fff;
    border-radius: 4px;
    margin-bottom: 20px;
}

.modal-actions {
    display: flex;
    gap: 10px;
    margin-top: 20px;
}

.modal-actions button {
    flex: 1;
    padding: 10px;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
}

.modal-actions button:first-child {
    background: #ff9500;
    color: #000;
    border: none;
}

.modal-actions button:last-child {
    background: transparent;
    color: #999;
    border: 1px solid #333;
}

/* Popup */
.popup {
    color: #000;
}

.popup h4 {
    margin: 0 0 8px 0;
    font-size: 14px;
}

.popup p {
    margin: 4px 0;
    font-size: 12px;
    color: #666;
}

.popup .notes {
    color: #ff9500;
    font-style: italic;
}

/* Utility Classes */
[x-cloak] {
    display: none !important;
}

/* Mobile Responsive */
@media (max-width: 768px) {
    .main-container {
        flex-direction: column;
    }
    
    .sidebar {
        width: 100%;
        height: 50vh;
    }
    
    .stats {
        display: none;
    }
}
```

---

## Deployment

### Netlify Deployment

1. **Create netlify.toml** in root:
```toml
[build]
  publish = "."

[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/:splat"
  status = 200

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-XSS-Protection = "1; mode=block"
    X-Content-Type-Options = "nosniff"
```

2. **Deploy via Netlify CLI**:
```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login to Netlify
netlify login

# Initialize and deploy
netlify init
netlify deploy --prod
```

3. **Or Deploy via GitHub**:
   - Push code to GitHub repository
   - Connect repository in Netlify dashboard
   - Auto-deploy on push to main branch

### Environment Variables in Netlify
Go to Site Settings > Environment Variables and add:
```
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
TOMTOM_API_KEY=your_tomtom_key
```

---

## Testing & Verification

### 1. Test Authentication Flow
```javascript
// Test signup
const { data, error } = await supabase.auth.signUp({
    email: 'test@example.com',
    password: 'testpass123'
});

// Test login
const { data, error } = await supabase.auth.signInWithPassword({
    email: 'test@example.com',
    password: 'testpass123'
});
```

### 2. Test Data Operations
```javascript
// Test loading properties
const { data } = await supabase
    .from('master_properties')
    .select('*')
    .limit(10);

console.log('Sample properties:', data);

// Test adding to farm
const { data } = await supabase
    .from('farm_properties')
    .insert({
        farm_id: 'your-farm-id',
        apn: 'test-apn',
        user_id: 'your-user-id'
    });
```

### 3. Verify Core Features
- [ ] User can sign up and receive confirmation email
- [ ] User can log in successfully
- [ ] Map loads with property markers
- [ ] Properties display in sidebar
- [ ] Search filters properties correctly
- [ ] Hot list toggle works
- [ ] Notes can be added and saved
- [ ] CSV upload processes correctly
- [ ] Data persists across sessions
- [ ] Logout works properly

### 4. Performance Checks
```javascript
// Check load time
console.time('Load Properties');
await loadProperties();
console.timeEnd('Load Properties');

// Check memory usage
console.log('Memory:', performance.memory.usedJSHeapSize / 1048576, 'MB');
```

---

## Common Issues & Solutions

### Issue: Map not loading
**Solution:** Check TomTom API key is valid and has proper permissions

### Issue: Properties not showing
**Solution:** Verify RLS policies are enabled and user is authenticated

### Issue: Notes not saving
**Solution:** Check farm_properties table has notes column and RLS allows updates

### Issue: CSV upload fails
**Solution:** Ensure APNs in CSV match master_properties table

---

## Additional Resources

- **Supabase Docs:** https://supabase.com/docs
- **TomTom Maps API:** https://developer.tomtom.com/maps-sdk-web
- **Alpine.js:** https://alpinejs.dev
- **Support:** Create issue in GitHub repository

---

## License
MIT License - Feel free to use and modify for your needs.

---

*This implementation guide provides everything needed to rebuild Legacy Compass from scratch. Follow each section carefully and test thoroughly at each step.*