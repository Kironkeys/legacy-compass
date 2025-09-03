# Legacy Compass - Master Database Setup Instructions

## Summary
We've successfully created a master database with **48,555 Hayward properties** including:
- **99.2% match rate** with owner data (48,159 properties matched)
- **1,867 vacant properties** marked
- **17,627 absentee owner** properties identified
- All properties have **APNs** for perfect deduplication

## Step 1: Create Database Tables in Supabase

1. Go to your Supabase dashboard
2. Navigate to SQL Editor
3. Run the `master-database-schema.sql` file to create:
   - `master_properties` - Main property table with APNs
   - `property_enrichments` - Shared phone/email data
   - `user_farms` - Private farm collections
   - `farm_properties` - Properties in each farm

## Step 2: Import Property Data

1. In Supabase SQL Editor, run `import_properties.sql`
   - This imports all 48,555 Hayward properties
   - File is 11MB, may take a minute to run
   - Uses `ON CONFLICT` to handle duplicates safely

## Step 3: Update the App

### Add to index.html (in the <head> section):
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```

### Replace the Supabase initialization in your Alpine component:
```javascript
// Add these at the top of your Alpine component
supabase: null,
currentUser: null,
currentFarm: null,
userFarms: [],

// In your init() function, add:
const SUPABASE_URL = 'your-project-url.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';
this.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Check for logged in user
const { data: { user } } = await this.supabase.auth.getUser();
if (user) {
    this.currentUser = user;
    await this.loadUserFarms();
}
```

### Key New Functions to Add:

1. **Search Master Database**:
```javascript
async searchProperties(query) {
    const { data, error } = await this.supabase
        .from('master_properties')
        .select('*')
        .or(`property_address.ilike.%${query}%,owner_name.ilike.%${query}%`)
        .limit(100);
    return data || [];
}
```

2. **Create Farm**:
```javascript
async createFarm(name) {
    const { data, error } = await this.supabase
        .from('user_farms')
        .insert({
            user_id: this.currentUser.id,
            farm_name: name
        })
        .select()
        .single();
    if (!error) {
        this.userFarms.push(data);
        this.currentFarm = data;
    }
}
```

3. **Add Property to Farm**:
```javascript
async addToFarm(property) {
    if (!this.currentFarm) {
        alert('Please select or create a farm first');
        return;
    }
    
    const { data, error } = await this.supabase
        .from('farm_properties')
        .insert({
            farm_id: this.currentFarm.id,
            apn: property.apn,
            user_id: this.currentUser.id
        });
        
    if (!error) {
        // Update UI
        this.properties.push(property);
        this.updateMap();
    }
}
```

## Step 4: UI Updates Needed

### Add Farm Selector
```html
<!-- Add after login button -->
<div x-show="currentUser" class="farm-selector">
    <select x-model="currentFarm" @change="loadFarmProperties()">
        <option value="">Select Farm</option>
        <template x-for="farm in userFarms">
            <option :value="farm" x-text="farm.farm_name"></option>
        </template>
    </select>
    <button @click="createNewFarm()">+ New Farm</button>
</div>
```

### Update Property Cards
```html
<!-- Add APN and enrichment info -->
<div class="property-card">
    <div class="apn">APN: <span x-text="property.apn"></span></div>
    <div class="address" x-text="property.property_address"></div>
    <div class="owner" x-text="property.owner_name"></div>
    <div class="badges">
        <span x-show="property.is_vacant" class="badge vacant">Vacant</span>
        <span x-show="property.is_absentee" class="badge absentee">Absentee</span>
    </div>
    <button @click="addToFarm(property)">Add to Farm</button>
</div>
```

## Step 5: Test the System

1. **Login** to the app
2. **Create a farm** (e.g., "North Hayward March 2025")
3. **Search for properties** (they'll come from master database)
4. **Add properties** to your farm
5. **Mark properties** as hot list
6. **Add enrichment** data (phones/emails)

## Privacy Features Built In

✅ **Agents can't see each other's farms** - RLS policies enforce this
✅ **Enrichment data is shared** - All agents benefit from phone/email additions
✅ **Only broker (Les) sees everything** - Admin role has full access
✅ **APNs prevent duplicates** - Each property exists only once

## Next Steps

1. Add Ghost AI integration for enrichment
2. Implement door knocking tracker
3. Add export to CSV functionality
4. Create mobile PWA features
5. Add offline support

## Database Stats

- **Total Hayward Properties**: 48,555
- **Properties with Owner Data**: 48,159 (99.2%)
- **Vacant Properties**: 1,867
- **Absentee Owners**: 17,627
- **Average Property Value**: Check JSON export for details

## Files Created

1. `master-database-schema.sql` - Database structure (7.5KB)
2. `import_properties.sql` - Property data (11MB)
3. `hayward_properties.json` - JSON backup of all data
4. `supabase-integration.js` - Helper functions
5. `process_county_data.py` - Data processing script