#!/usr/bin/env python3
"""
Clean up test users and their data from Legacy Compass
Preserves master_properties table
"""

from supabase import create_client, Client

# Use SERVICE ROLE key to bypass RLS
SUPABASE_URL = "https://kfomddpbpsaplyucodli.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtmb21kZHBicHNhcGx5dWNvZGxpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjYzMTYwMywiZXhwIjoyMDcyMjA3NjAzfQ.Wf0jfgKI7oByz6fYKYhDr3vqpxeRyXU5ioOoiCPwtOY"

def cleanup_database():
    print("=" * 60)
    print("LEGACY COMPASS - DATABASE CLEANUP")
    print("=" * 60)
    
    # Connect with service role
    supabase: Client = create_client(SUPABASE_URL, SERVICE_ROLE_KEY)
    print("✅ Connected with service role (bypassing RLS)")
    
    # Clean up in order (due to foreign keys)
    tables_to_clean = [
        'farm_properties',      # Properties in farms
        'user_farms',          # User farms
        'property_enrichments', # Enrichment data
        'user_properties',     # Legacy user properties
        'user_settings',       # User settings
        'activity_log'         # Activity logs
    ]
    
    print("\n🧹 Cleaning up test data...")
    print("-" * 60)
    
    for table in tables_to_clean:
        try:
            # Get count before
            count_result = supabase.table(table).select('*', count='exact').execute()
            count_before = count_result.count if count_result else 0
            
            if count_before == 0:
                print(f"✅ {table}: Already empty")
                continue
            
            # Delete all records - use different approach for each table
            if table == 'farm_properties':
                # Delete all farm properties
                result = supabase.table(table).delete().gte('id', 0).execute()
            elif table == 'user_farms':
                # Delete all farms
                result = supabase.table(table).delete().gte('id', 0).execute()
            else:
                # For other tables, try to delete all
                result = supabase.table(table).delete().gte('created_at', '2020-01-01').execute()
            
            # Get count after
            count_after = supabase.table(table).select('*', count='exact').execute()
            deleted = count_before - (count_after.count if count_after else 0)
            
            print(f"✅ {table}: Deleted {deleted} records (was {count_before})")
        except Exception as e:
            print(f"⚠️  {table}: {str(e)[:100]}")
    
    print("-" * 60)
    
    # Verify master_properties is still intact
    master_count = supabase.table('master_properties').select('apn', count='exact').execute()
    print(f"\n✅ Master properties preserved: {master_count.count:,} properties")
    
    # List auth users (can't delete via API easily)
    print("\n📋 Current auth users:")
    print("-" * 60)
    print("Note: Auth users must be deleted from Supabase Dashboard")
    print("Go to: Authentication > Users in your Supabase project")
    print("Direct link: https://supabase.com/dashboard/project/kfomddpbpsaplyucodli/auth/users")
    
    print("\n✨ Database cleaned!")
    print("\n🎯 Next steps:")
    print("1. Go to Supabase Dashboard > Authentication > Users")
    print("2. Delete any test users manually")
    print("3. Sign up fresh at: http://localhost:8080")
    print("4. Your first farm will be created automatically")
    print("5. Upload Jeff's CSV to test import")

if __name__ == '__main__':
    cleanup_database()