#!/usr/bin/env python3
"""
Monthly Update Script for Legacy Compass
Run this monthly to update master database with latest county data
"""

import json
import csv
from datetime import datetime
from supabase import create_client, Client

# Supabase credentials - use service role for updates
SUPABASE_URL = "https://kfomddpbpsaplyucodli.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtmb21kZHBicHNhcGx5dWNvZGxpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjYzMTYwMywiZXhwIjoyMDcyMjA3NjAzfQ.Wf0jfgKI7oByz6fYKYhDr3vqpxeRyXU5ioOoiCPwtOY"

def check_for_updates(supabase, new_csv_path):
    """
    Compare new county data with existing database
    Identify:
    - New properties
    - Title transfers (owner changes)
    - Value changes
    - Vacant status changes
    """
    
    print(f"🔄 MONTHLY UPDATE - {datetime.now().strftime('%B %Y')}")
    print("=" * 60)
    
    updates = {
        'new_properties': [],
        'title_transfers': [],
        'value_changes': [],
        'vacant_changes': []
    }
    
    # Load new county data
    print("📥 Loading new county data...")
    with open(new_csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        
        for row in reader:
            # Only process Hayward properties
            if 'HAYWARD' not in row.get('SitusCity', '').upper():
                continue
            
            apn = row.get('APN', '').strip()
            if not apn:
                continue
            
            # Get existing property from database
            existing = supabase.table('master_properties').select('*').eq('apn', apn).execute()
            
            if not existing.data:
                # New property!
                updates['new_properties'].append({
                    'apn': apn,
                    'address': row.get('SitusAddress', ''),
                    'owner': row.get('OwnerName', '')
                })
            else:
                prop = existing.data[0]
                
                # Check for title transfer
                new_owner = row.get('OwnerName', '').strip()
                if new_owner and new_owner != prop['owner_name']:
                    updates['title_transfers'].append({
                        'apn': apn,
                        'address': prop['property_address'],
                        'old_owner': prop['owner_name'],
                        'new_owner': new_owner
                    })
                
                # Check for value changes
                try:
                    new_value = float(row.get('TotalValue', 0) or 0)
                    if new_value > 0 and abs(new_value - prop['total_value']) > 1000:
                        updates['value_changes'].append({
                            'apn': apn,
                            'address': prop['property_address'],
                            'old_value': prop['total_value'],
                            'new_value': new_value,
                            'change': new_value - prop['total_value']
                        })
                except:
                    pass
    
    # Generate report
    print("\n📊 UPDATE SUMMARY")
    print("-" * 60)
    print(f"🆕 New Properties: {len(updates['new_properties'])}")
    print(f"🏠 Title Transfers: {len(updates['title_transfers'])}")
    print(f"💰 Value Changes: {len(updates['value_changes'])}")
    
    # Show hot opportunities (title transfers are gold!)
    if updates['title_transfers']:
        print("\n🔥 HOT OPPORTUNITIES - Recent Title Transfers:")
        for transfer in updates['title_transfers'][:10]:
            print(f"  • {transfer['address']}")
            print(f"    {transfer['old_owner']} → {transfer['new_owner']}")
    
    return updates

def apply_updates(supabase, updates):
    """
    Apply updates to master database
    """
    print("\n📝 Applying updates to database...")
    
    # Update title transfers
    for transfer in updates['title_transfers']:
        supabase.table('master_properties').update({
            'owner_name': transfer['new_owner'],
            'last_sale_date': datetime.now().isoformat(),
            'updated_at': datetime.now().isoformat()
        }).eq('apn', transfer['apn']).execute()
        
        # Also create alert for agents who have this property
        supabase.table('property_alerts').insert({
            'apn': transfer['apn'],
            'alert_type': 'title_transfer',
            'details': f"Owner changed from {transfer['old_owner']} to {transfer['new_owner']}",
            'created_at': datetime.now().isoformat()
        }).execute()
    
    print(f"✅ Updated {len(updates['title_transfers'])} title transfers")
    
    # Add new properties
    for prop in updates['new_properties']:
        supabase.table('master_properties').insert({
            'apn': prop['apn'],
            'property_address': prop['address'],
            'owner_name': prop['owner'],
            'city': 'Hayward',
            'state': 'CA',
            'data_source': 'county',
            'created_at': datetime.now().isoformat()
        }).execute()
    
    print(f"✅ Added {len(updates['new_properties'])} new properties")

def notify_agents(supabase, updates):
    """
    Send notifications to agents about properties in their farms
    """
    # Get all farms with title transfers
    hot_apns = [t['apn'] for t in updates['title_transfers']]
    
    if hot_apns:
        # Find which farms have these properties
        farms_to_notify = supabase.table('farm_properties').select(
            'farm_id, user_id, apn'
        ).in_('apn', hot_apns).execute()
        
        # Group by user
        user_notifications = {}
        for farm_prop in farms_to_notify.data:
            user_id = farm_prop['user_id']
            if user_id not in user_notifications:
                user_notifications[user_id] = []
            user_notifications[user_id].append(farm_prop['apn'])
        
        print(f"\n📧 Notifying {len(user_notifications)} agents about updates in their farms")

if __name__ == '__main__':
    # Example: Download latest county CSV and run update
    # You could automate this with Ghost or a cron job
    
    import sys
    if len(sys.argv) < 2:
        print("Usage: python monthly_update.py <path_to_new_county_csv>")
        sys.exit(1)
    
    csv_path = sys.argv[1]
    
    # Connect to Supabase
    supabase = create_client(SUPABASE_URL, SERVICE_ROLE_KEY)
    
    # Check for updates
    updates = check_for_updates(supabase, csv_path)
    
    # Apply updates
    if any(updates.values()):
        apply_updates(supabase, updates)
        notify_agents(supabase, updates)
        
        # Save update log
        with open(f'update_log_{datetime.now().strftime("%Y%m%d")}.json', 'w') as f:
            json.dump(updates, f, indent=2)
        
        print("\n✅ Monthly update complete!")
    else:
        print("\n✨ No updates found")