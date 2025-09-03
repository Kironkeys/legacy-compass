#!/usr/bin/env python3
"""
Automatically import all 48,555 Hayward properties to Supabase
No copy-pasting required!
"""

import json
import os
import sys
import time
from datetime import datetime

# First, install the supabase library if not already installed
try:
    from supabase import create_client, Client
except ImportError:
    print("Installing supabase-py library...")
    os.system("pip3 install supabase")
    from supabase import create_client, Client

def load_properties():
    """Load properties from the JSON backup"""
    print("Loading properties from JSON backup...")
    with open('hayward_properties.json', 'r') as f:
        data = json.load(f)
    print(f"Loaded {len(data['properties'])} properties")
    return data['properties']

def batch_insert_properties(supabase: Client, properties, batch_size=100):
    """Insert properties in batches"""
    total = len(properties)
    inserted = 0
    failed = 0
    
    print(f"\nStarting import of {total} properties...")
    print(f"Batch size: {batch_size} properties")
    print("-" * 50)
    
    for i in range(0, total, batch_size):
        batch = properties[i:i+batch_size]
        batch_num = (i // batch_size) + 1
        total_batches = (total + batch_size - 1) // batch_size
        
        # Prepare batch for insertion
        batch_data = []
        for prop in batch:
            # Clean up the data
            record = {
                'apn': prop['apn'],
                'property_address': prop.get('property_address_raw', prop.get('property_address', '')),
                'city': prop.get('city', 'Hayward'),
                'state': prop.get('state', 'CA'),
                'zip_code': prop.get('zip_code', ''),
                'owner_name': prop.get('owner_name') or None,
                'owner_mailing_address': prop.get('owner_mailing_address') or None,
                'is_absentee': prop.get('is_absentee', False),
                'land_value': prop.get('land_value', 0),
                'improvement_value': prop.get('improvement_value', 0),
                'total_value': prop.get('total_value', 0),
                'latitude': prop.get('latitude') if prop.get('latitude') else None,
                'longitude': prop.get('longitude') if prop.get('longitude') else None,
                'is_vacant': prop.get('is_vacant', False),
                'data_source': 'county'
            }
            batch_data.append(record)
        
        try:
            # Insert batch
            result = supabase.table('master_properties').upsert(batch_data).execute()
            inserted += len(batch)
            
            # Progress update
            progress = (inserted / total) * 100
            print(f"Batch {batch_num}/{total_batches}: ✓ {len(batch)} properties imported ({progress:.1f}% complete)")
            
            # Small delay to avoid rate limiting
            if batch_num < total_batches:
                time.sleep(0.1)
                
        except Exception as e:
            failed += len(batch)
            print(f"Batch {batch_num}/{total_batches}: ✗ Failed - {str(e)}")
            
            # Try smaller batch on failure
            if batch_size > 10:
                print(f"  Retrying with smaller batches...")
                for j, prop in enumerate(batch):
                    try:
                        result = supabase.table('master_properties').upsert([{
                            'apn': prop['apn'],
                            'property_address': prop.get('property_address_raw', ''),
                            'city': 'Hayward',
                            'state': 'CA',
                            'zip_code': prop.get('zip_code', ''),
                            'owner_name': prop.get('owner_name'),
                            'owner_mailing_address': prop.get('owner_mailing_address'),
                            'is_absentee': prop.get('is_absentee', False),
                            'land_value': prop.get('land_value', 0),
                            'improvement_value': prop.get('improvement_value', 0),
                            'total_value': prop.get('total_value', 0),
                            'latitude': prop.get('latitude'),
                            'longitude': prop.get('longitude'),
                            'is_vacant': prop.get('is_vacant', False),
                            'data_source': 'county'
                        }]).execute()
                        inserted += 1
                        failed -= 1
                    except Exception as e2:
                        print(f"    Property {prop['apn']}: Failed - {str(e2)}")
    
    print("-" * 50)
    print(f"\n✅ Import Complete!")
    print(f"  Successfully imported: {inserted:,} properties")
    if failed > 0:
        print(f"  Failed: {failed} properties")
    print(f"  Success rate: {(inserted/total)*100:.1f}%")
    
    return inserted, failed

def main():
    print("=" * 50)
    print("LEGACY COMPASS - SUPABASE PROPERTY IMPORTER")
    print("=" * 50)
    
    # Get Supabase credentials
    print("\n📋 Please enter your Supabase credentials")
    print("(You can find these in your Supabase project settings)")
    print()
    
    supabase_url = input("Supabase Project URL (e.g., https://xxx.supabase.co): ").strip()
    if not supabase_url:
        print("❌ URL is required!")
        sys.exit(1)
    
    supabase_key = input("Supabase Anon Key (starts with 'eyJ...'): ").strip()
    if not supabase_key:
        print("❌ Anon key is required!")
        sys.exit(1)
    
    # Optional: customize batch size
    batch_size_input = input("\nBatch size (press Enter for default 100): ").strip()
    batch_size = int(batch_size_input) if batch_size_input else 100
    
    print("\n🔄 Connecting to Supabase...")
    try:
        # Create Supabase client
        supabase: Client = create_client(supabase_url, supabase_key)
        
        # Test connection by checking if table exists
        test = supabase.table('master_properties').select('apn').limit(1).execute()
        print("✅ Connected successfully!")
        
    except Exception as e:
        print(f"❌ Failed to connect: {str(e)}")
        print("\nMake sure:")
        print("1. The master_properties table exists (run master-database-schema.sql first)")
        print("2. Your URL and key are correct")
        print("3. RLS policies allow inserts")
        sys.exit(1)
    
    # Load properties
    properties = load_properties()
    
    # Confirm before starting
    print(f"\n📦 Ready to import {len(properties):,} properties")
    print(f"⚡ Batch size: {batch_size} properties per request")
    print(f"⏱️  Estimated time: {len(properties) // batch_size // 10} minutes")
    
    confirm = input("\nProceed with import? (y/n): ").strip().lower()
    if confirm != 'y':
        print("Import cancelled.")
        sys.exit(0)
    
    # Start import
    start_time = time.time()
    inserted, failed = batch_insert_properties(supabase, properties, batch_size)
    elapsed = time.time() - start_time
    
    # Summary
    print(f"\n⏱️  Total time: {elapsed:.1f} seconds")
    print(f"📊 Rate: {inserted / elapsed:.1f} properties/second")
    
    # Verify count in database
    print("\n🔍 Verifying database count...")
    try:
        count_result = supabase.table('master_properties').select('apn', count='exact').execute()
        db_count = count_result.count
        print(f"✅ Database now contains {db_count:,} properties")
    except:
        print("Could not verify count")
    
    print("\n🎉 Import complete! Your master database is ready.")
    print("\nNext steps:")
    print("1. Update index.html with the new Supabase integration")
    print("2. Test searching and farm creation")
    print("3. Start adding properties to farms!")

if __name__ == '__main__':
    main()