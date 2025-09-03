#!/usr/bin/env python3
"""
Import using service role key (bypasses RLS)
"""

import json
import time
from supabase import create_client, Client

# Your Supabase credentials - using SERVICE ROLE key
SUPABASE_URL = "https://kfomddpbpsaplyucodli.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtmb21kZHBicHNhcGx5dWNvZGxpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjYzMTYwMywiZXhwIjoyMDcyMjA3NjAzfQ.Wf0jfgKI7oByz6fYKYhDr3vqpxeRyXU5ioOoiCPwtOY"

def main():
    print("=" * 60)
    print("LEGACY COMPASS - IMPORTING WITH SERVICE ROLE KEY")
    print("=" * 60)
    
    # Load properties
    print("\n📂 Loading properties from JSON...")
    with open('hayward_properties.json', 'r') as f:
        data = json.load(f)
    properties = data['properties']
    print(f"✅ Loaded {len(properties)} properties")
    
    # Connect to Supabase with SERVICE ROLE
    print("\n🔄 Connecting to Supabase with service role...")
    supabase: Client = create_client(SUPABASE_URL, SERVICE_ROLE_KEY)
    print("✅ Connected (RLS bypassed)")
    
    # Import in batches
    batch_size = 100  # Can use larger batches with service role
    total = len(properties)
    inserted = 0
    failed_apns = []
    
    print(f"\n📤 Starting import...")
    print(f"   Batch size: {batch_size}")
    print(f"   Total batches: {(total + batch_size - 1) // batch_size}")
    print("-" * 60)
    
    for i in range(0, total, batch_size):
        batch = properties[i:i+batch_size]
        batch_num = (i // batch_size) + 1
        
        # Prepare batch data
        batch_data = []
        for prop in batch:
            record = {
                'apn': prop['apn'],
                'property_address': prop.get('property_address_raw', ''),
                'city': 'Hayward',
                'state': 'CA',
                'zip_code': prop.get('zip_code', ''),
                'owner_name': prop.get('owner_name'),
                'owner_mailing_address': prop.get('owner_mailing_address'),
                'is_absentee': prop.get('is_absentee', False),
                'land_value': float(prop.get('land_value', 0) or 0),
                'improvement_value': float(prop.get('improvement_value', 0) or 0),
                'total_value': float(prop.get('total_value', 0) or 0),
                'latitude': float(prop.get('latitude', 0) or 0) if prop.get('latitude') else None,
                'longitude': float(prop.get('longitude', 0) or 0) if prop.get('longitude') else None,
                'is_vacant': prop.get('is_vacant', False),
                'data_source': 'county'
            }
            batch_data.append(record)
        
        try:
            # Insert batch using upsert
            result = supabase.table('master_properties').upsert(batch_data).execute()
            inserted += len(batch)
            
            # Progress
            progress = (inserted / total) * 100
            print(f"Batch {batch_num:3d}: ✓ {len(batch):4d} properties | Total: {inserted:5d}/{total} ({progress:.1f}%)")
            
            # Small delay
            if batch_num % 10 == 0:
                time.sleep(0.1)
            
        except Exception as e:
            print(f"Batch {batch_num:3d}: ✗ Failed - {str(e)[:100]}")
            for prop in batch:
                failed_apns.append(prop['apn'])
    
    print("-" * 60)
    print(f"\n✅ IMPORT COMPLETE!")
    print(f"   Successfully imported: {inserted:,} properties")
    if failed_apns:
        print(f"   Failed: {len(failed_apns)} properties")
    print(f"   Success rate: {(inserted/total)*100:.1f}%")
    
    # Verify count
    print("\n🔍 Verifying database count...")
    try:
        count_result = supabase.table('master_properties').select('apn', count='exact').execute()
        db_count = count_result.count
        print(f"✅ Database contains {db_count:,} properties")
    except Exception as e:
        print(f"Could not verify count: {e}")
    
    print("\n🎉 Your master database is ready to use!")
    print("\n⚠️  Note: Used service role key for import (bypasses RLS)")
    print("    RLS policies will still work normally for regular users")

if __name__ == '__main__':
    main()