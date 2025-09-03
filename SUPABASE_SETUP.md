# Supabase Setup for Legacy Compass

## Features Implemented

### ✅ Authentication System
- Email/password authentication
- Session management with auto-refresh
- Protected routes (auto-redirect to login)
- Demo mode for testing without signup

### ✅ User-Specific Data
- **Property Notes**: Each user's notes are private and persist across devices
- **Voice Notes**: Speech-to-text transcription saved per property
- **Hot List**: User's favorite properties tracked individually
- **Property Status**: Track cold/warm/hot/contacted status
- **Activity Logging**: Track all user actions for analytics

### ✅ Offline Support
- Works offline with local storage
- Automatic sync when connection restored
- Conflict-free updates using timestamps

### ✅ Real-time Sync
- Live updates across multiple devices
- Real-time collaboration ready

## Setup Instructions

### 1. Supabase Project Setup

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Your project is already created with these credentials:
   - **URL**: `https://kfomddpbpsaplyucodli.supabase.co`
   - **Anon Key**: Already configured in the app

### 2. Database Setup

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy the entire contents of `supabase-schema.sql`
4. Paste and run in the SQL Editor
5. This creates all necessary tables, policies, and indexes

### 3. Authentication Setup

1. In Supabase Dashboard, go to **Authentication** → **Providers**
2. Ensure **Email** provider is enabled (should be by default)
3. Optional: Configure email templates in **Authentication** → **Email Templates**

### 4. Testing the App

#### Demo Mode (No Signup Required)
Login with:
- Email: `demo@legacycompass.com`
- Password: `demo123`

This works locally without Supabase connection for testing.

#### Real Account
1. Click "Sign Up" on login page
2. Enter your email and password
3. Check email for confirmation link
4. Sign in with your credentials

## File Structure

```
js/
├── supabase-client.js    # Supabase initialization and connection
├── auth.js               # Authentication logic
├── user-data.js          # User-specific data management
└── app-clean.js          # Updated with user data integration

login.html                # Login/signup page
index.html                # Updated with user info and notes UI
supabase-schema.sql      # Database schema
```

## Key Features

### Voice-to-Text Notes
1. Click the 🎤 Voice button when viewing a property
2. Speak your note
3. Transcription automatically saved to Supabase
4. Works with Web Speech API (Chrome, Edge, Safari)

### Property Notes
- Type notes in the detail view
- Auto-saves to Supabase
- Syncs across all devices
- Persists between sessions

### Hot List (Favorites)
- Click ⭐ to add/remove from hot list
- User-specific favorites
- Syncs across devices
- Quick filter to show only hot properties

### Property Status Tracking
- Set status: Cold, Warm, Hot, Contacted, Not Interested
- Track follow-up dates
- Record contact attempts

### Offline Mode
- Continues working when offline
- Changes queued locally
- Auto-syncs when reconnected
- Visual indicator when offline

## API Usage

### JavaScript Examples

```javascript
// Save a note
await UserData.savePropertyNotes(propertyId, noteText, address);

// Add to hot list
await UserData.toggleFavorite(propertyId, address);

// Update status
await UserData.updatePropertyStatus(propertyId, 'hot');

// Save voice note
await UserData.saveVoiceNote(propertyId, transcription);

// Get user's hot list
const favorites = await UserData.getHotList();
```

## Security

- Row Level Security (RLS) enabled on all tables
- Users can only see/edit their own data
- Secure authentication with JWT tokens
- API keys are public (anon key) but secure with RLS

## Monitoring

View your data in Supabase Dashboard:
1. **Table Editor**: See all user data
2. **Authentication**: Monitor user signups
3. **Logs**: Track API usage
4. **Real-time**: Monitor active connections

## Troubleshooting

### User can't see their notes
- Check if user is authenticated: `window.supabase.auth.getUser()`
- Verify RLS policies are enabled
- Check browser console for errors

### Voice recognition not working
- Ensure using HTTPS (required for Web Speech API)
- Check browser compatibility (Chrome/Edge/Safari)
- Grant microphone permissions

### Offline sync issues
- Check IndexedDB in browser DevTools
- Clear cache if needed: `localStorage.clear()`
- Check network tab for failed requests

## Next Steps

1. **Email Templates**: Customize confirmation emails in Supabase
2. **Social Auth**: Add Google/GitHub login if desired
3. **Analytics**: Use activity_log table for insights
4. **Backup**: Enable Point-in-Time Recovery in Supabase
5. **Custom Domain**: Configure custom domain for auth emails

## Support

- Supabase Docs: https://supabase.com/docs
- Legacy Compass Issues: Create issue in this repo
- Database Issues: Check SQL Editor logs in Supabase