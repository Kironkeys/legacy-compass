# Supabase Configuration for Legacy Compass

## Quick Setup Instructions

### 1. Go to Supabase Dashboard
**Direct Link:** https://supabase.com/dashboard/project/kfomddpbpsaplyucodli/auth/url-configuration

### 2. Update Redirect URLs
In the **Redirect URLs** field, add these URLs (one per line):
```
http://localhost:8080/confirm.html
http://localhost:8080/index.html
https://legacy-compass.netlify.app/confirm.html
https://legacy-compass.netlify.app/index.html
```

### 3. Update Site URL
Set the **Site URL** to:
```
https://legacy-compass.netlify.app
```

### 4. Email Templates (Optional)
Go to: https://supabase.com/dashboard/project/kfomddpbpsaplyucodli/auth/templates

Update the **Confirm signup** template's button URL to point to confirm.html

## What We Changed

✅ **Removed Demo Mode** - No more demo login button
✅ **Removed Test Logins** - No Jeff/Anna/Les quick login buttons  
✅ **Fixed Email Confirmation** - Now shows proper notification
✅ **Fixed Redirect** - Confirmation emails go to confirm.html, not index
✅ **Added Session Validation** - Deleted users cant access with cached sessions
✅ **Neutral Placeholder** - Changed from "Legacy Real Estate" to "Your Brokerage (Optional)"

## Files to Deploy to Netlify

You need to deploy these updated files:
- index.html (session validation fixes)
- login.html (removed demo mode)
- confirm.html (new confirmation handler)

## Testing the Flow

1. **Sign Up** → Shows "Check your email" message
2. **Click Confirm Link** → Goes to confirm.html → Auto-redirects to login
3. **Login** → Access the app with full persistence
4. **Data persists** across devices and sessions
