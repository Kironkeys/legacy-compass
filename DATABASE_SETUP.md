# Legacy Compass Database Setup Instructions

## Overview
Legacy Compass now has **full data persistence** capabilities:
- ✅ **Cloud Storage**: All data saved to Supabase database
- ✅ **Cross-Device Sync**: Access your data from any device
- ✅ **Automatic Backup**: Never lose your data
- ✅ **Real-time Updates**: Changes sync across devices instantly

## What's New
1. **Automatic Save**: Properties, notes, and tags auto-save to cloud
2. **Load on Login**: Your data loads automatically when you sign in
3. **Offline Support**: Works offline with local storage, syncs when online
4. **Data Security**: Row-level security ensures only you can see your data

## Setup Instructions

### Step 1: Create Database Tables
1. Go to your Supabase dashboard: https://app.supabase.com
2. Select your project (kfomddpbpsaplyucodli)
3. Click on "SQL Editor" in the left sidebar
4. Copy the entire contents of `supabase-schema.sql`
5. Paste it into the SQL editor
6. Click "Run" to create all tables

### Step 2: Verify Tables Were Created
After running the SQL, you should see these tables in your database:
- `user_properties` - Stores all property data
- `user_settings` - Stores user preferences
- `activity_log` - Tracks user actions

### Step 3: Deploy Latest Code
1. Commit and push the changes:
```bash
git add -A
git commit -m "Add full data persistence with Supabase"
git push
```

2. Netlify will auto-deploy the changes

### Step 4: Test Data Persistence
1. **Sign Up/Login**: Go to https://legacy-compass.netlify.app
2. **Upload CSV**: Load your property data
3. **Add Notes**: Add some notes to properties
4. **Tag Properties**: Add tags to organize
5. **Mark as Hot**: Flag important properties
6. **Sign Out**: Log out of the app
7. **Sign In Again**: Log back in - all data should reload!
8. **Try Different Device**: Sign in on another device - data syncs!

## How Data Persistence Works

### Automatic Save
- Every action saves to both localStorage (instant) and Supabase (cloud)
- Notes, tags, hot list all persist automatically
- No "Save" button needed - it just works!

### Data Loading Priority
1. **Logged In**: Loads from Supabase cloud storage
2. **Not Logged In**: Loads from browser localStorage
3. **Fallback**: If cloud fails, uses local storage

### What Gets Saved
- All property data from CSV
- Property notes and voice notes
- Tags and categories
- Hot list selections
- Farm name
- All custom data you add

### Security Features
- **Row Level Security (RLS)**: Users can only see their own data
- **Encrypted Connection**: All data transmitted securely
- **Auth Protection**: Must be logged in to save to cloud
- **Automatic Backups**: Supabase handles backups

## Troubleshooting

### Data Not Loading?
1. Check you're logged in (email shows in top bar)
2. Check browser console for errors
3. Try refreshing the page
4. Check Supabase dashboard for data

### Data Not Saving?
1. Ensure tables are created (run SQL script)
2. Check network connection
3. Look for error messages in console
4. Verify you're logged in

### Need to Reset?
If you need to clear all data and start fresh:
1. Go to Supabase SQL Editor
2. Run: `DELETE FROM user_properties WHERE user_id = auth.uid();`
3. Clear browser data: Settings > Privacy > Clear browsing data

## Next Steps
Your Legacy Compass now has enterprise-grade data persistence! Your data is:
- **Secure**: Only you can access it
- **Persistent**: Survives app updates and browser clears
- **Synced**: Available on all your devices
- **Backed Up**: Protected by Supabase infrastructure

Happy farming! 🚜