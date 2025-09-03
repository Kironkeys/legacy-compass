#!/usr/bin/env python3
"""
Process Alameda County parcel data and merge with existing property lists
Creates a master database of Hayward properties with APNs
"""

import csv
import json
import re
from datetime import datetime

def normalize_address(addr):
    """Normalize address for matching"""
    if not addr:
        return ""
    addr = str(addr).upper().strip()
    
    # Standardize abbreviations
    replacements = {
        ' STREET': ' ST', ' AVENUE': ' AVE', ' BOULEVARD': ' BLVD',
        ' DRIVE': ' DR', ' ROAD': ' RD', ' LANE': ' LN',
        ' PLACE': ' PL', ' COURT': ' CT', ' PARKWAY': ' PKWY',
        ' CIRCLE': ' CIR', ' TERRACE': ' TER', ' TRAIL': ' TRL',
        ' EAST ': ' E ', ' WEST ': ' W ', ' NORTH ': ' N ', ' SOUTH ': ' S ',
        'FIRST': '1ST', 'SECOND': '2ND', 'THIRD': '3RD', 'FOURTH': '4TH',
        'FIFTH': '5TH', 'SIXTH': '6TH', 'SEVENTH': '7TH', 'EIGHTH': '8TH',
        'NINTH': '9TH', 'TENTH': '10TH'
    }
    for old, new in replacements.items():
        addr = addr.replace(old, new)
    
    # Remove extra spaces
    return ' '.join(addr.split())

def normalize_name(name):
    """Normalize owner name for matching"""
    if not name:
        return ""
    name = str(name).upper().strip()
    # Remove common suffixes
    name = re.sub(r'\b(LLC|LP|INC|TRUST|LTD|FAMILY|LIVING TR|REV TR|SURVIVORS TR)\b', '', name)
    # Remove extra spaces
    return ' '.join(name.split())

def parse_county_csv():
    """Parse Alameda County CSV and filter for Hayward properties"""
    print("Loading Alameda County parcels...")
    hayward_properties = {}
    
    county_file = '/Users/kiron/Downloads/Parcels_6078659232109355209.csv'
    
    with open(county_file, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Check if it's in Hayward based on SitusCity column
            situs_city = row.get('SitusCity', '').upper()
            if 'HAYWARD' in situs_city:
                apn = row.get('APN', '').strip()
                if apn:
                    # Build street address from components
                    street_num = row.get('SitusStreetNumber', '').strip()
                    street_name = row.get('SitusStreetName', '').strip()
                    street_unit = row.get('SitusUnit', '').strip()
                    
                    # Construct full street address
                    street_address = f"{street_num} {street_name}".strip()
                    if street_unit:
                        street_address += f" {street_unit}"
                    
                    # Get coordinates
                    try:
                        lat = float(row.get('CENTROID_Y', 0))
                        lon = float(row.get('CENTROID_X', 0))
                    except:
                        lat, lon = 0, 0
                    
                    # Get property values
                    try:
                        land_value = float(row.get('Land', 0) or 0)
                        improvement_value = float(row.get('Imps', 0) or 0)
                        total_value = land_value + improvement_value
                    except:
                        land_value = improvement_value = total_value = 0
                    
                    # Get mailing address for owner info
                    mailing_address = row.get('MailingAddress', '')
                    
                    hayward_properties[apn] = {
                        'apn': apn,
                        'property_address': normalize_address(street_address),
                        'property_address_raw': street_address,
                        'city': 'Hayward',
                        'state': 'CA',
                        'zip_code': row.get('SitusZip', ''),
                        'latitude': lat,
                        'longitude': lon,
                        'land_value': land_value,
                        'improvement_value': improvement_value,
                        'total_value': total_value,
                        'data_source': 'county',
                        'owner_name': None,
                        'owner_mailing_address': mailing_address,
                        'is_absentee': False,
                        'is_vacant': False
                    }
    
    print(f"Found {len(hayward_properties)} Hayward properties with APNs")
    return hayward_properties

def load_hayward_owners():
    """Load the 68k hayward_owners.csv file"""
    print("\nLoading hayward_owners.csv...")
    owners_by_address = {}
    
    owners_file = '/Users/kiron/Desktop/legacy compass/legacy-compass-complete-working 4/data/hayward_owners.csv'
    
    with open(owners_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            addr = normalize_address(row['property_address'])
            if addr:
                owners_by_address[addr] = {
                    'owner_name': row['owner_name'],
                    'owner_mailing_address': row['owner_mailing_address'],
                    'is_absentee': row.get('is_absentee', '').lower() == 'true'
                }
    
    print(f"Loaded {len(owners_by_address)} properties from hayward_owners.csv")
    return owners_by_address

def load_jeff_vacant():
    """Load Jeff's vacant properties list"""
    print("\nLoading Jeff's vacant properties...")
    vacant_apns = set()
    vacant_by_address = {}
    
    jeff_file = '/Users/kiron/Desktop/legacy compass/legacy-compass-complete-working 4/jeff list vacant homes csv file.csv'
    
    with open(jeff_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        # Skip header rows
        for line in lines[2:]:
            if 'Hayward,CA' in line:
                parts = line.strip().split(',')
                if len(parts) > 5:
                    apn = parts[0].strip()
                    street_addr = parts[4].strip()
                    
                    if apn:
                        vacant_apns.add(apn)
                    
                    addr = normalize_address(street_addr)
                    if addr:
                        vacant_by_address[addr] = True
    
    print(f"Found {len(vacant_apns)} vacant properties with APNs")
    print(f"Found {len(vacant_by_address)} vacant properties by address")
    return vacant_apns, vacant_by_address

def merge_data(county_properties, owners_by_address, vacant_apns, vacant_by_address):
    """Merge all data sources"""
    print("\n=== MERGING DATA ===")
    
    matched_owners = 0
    matched_vacant = 0
    
    # Match owner data by address
    for apn, prop in county_properties.items():
        addr = prop['property_address']
        
        # Try to match owner data
        if addr in owners_by_address:
            owner_data = owners_by_address[addr]
            prop['owner_name'] = owner_data['owner_name']
            prop['owner_mailing_address'] = owner_data['owner_mailing_address']
            prop['is_absentee'] = owner_data['is_absentee']
            matched_owners += 1
        
        # Check if vacant by APN
        if apn in vacant_apns:
            prop['is_vacant'] = True
            matched_vacant += 1
        # Check if vacant by address
        elif addr in vacant_by_address:
            prop['is_vacant'] = True
            matched_vacant += 1
    
    print(f"Matched {matched_owners} properties with owner data ({matched_owners*100/len(county_properties):.1f}%)")
    print(f"Marked {matched_vacant} properties as vacant")
    
    return county_properties

def generate_sql_inserts(properties, output_file='import_properties.sql'):
    """Generate SQL INSERT statements for Supabase"""
    print(f"\nGenerating SQL import file: {output_file}")
    
    with open(output_file, 'w') as f:
        f.write("-- Legacy Compass Master Properties Import\n")
        f.write(f"-- Generated: {datetime.now().isoformat()}\n")
        f.write(f"-- Total properties: {len(properties)}\n\n")
        
        f.write("-- Clear existing data (optional - comment out if appending)\n")
        f.write("-- TRUNCATE master_properties CASCADE;\n\n")
        
        f.write("-- Insert properties\n")
        f.write("INSERT INTO master_properties (\n")
        f.write("    apn, property_address, city, state,\n")
        f.write("    owner_name, owner_mailing_address, is_absentee,\n")
        f.write("    land_value, improvement_value, total_value,\n")
        f.write("    latitude, longitude, is_vacant, data_source\n")
        f.write(") VALUES\n")
        
        values = []
        for apn, prop in properties.items():
            # Escape single quotes in text fields
            def escape(s):
                return s.replace("'", "''") if s else ''
            
            owner_name = f"'{escape(prop['owner_name'])}'" if prop['owner_name'] else 'NULL'
            owner_mail = f"'{escape(prop['owner_mailing_address'])}'" if prop['owner_mailing_address'] else 'NULL'
            
            value = f"""(
    '{apn}',
    '{escape(prop['property_address_raw'])}',
    'Hayward',
    'CA',
    {owner_name},
    {owner_mail},
    {str(prop['is_absentee']).lower()},
    {prop['land_value']},
    {prop['improvement_value']},
    {prop['total_value']},
    {prop['latitude'] if prop['latitude'] else 'NULL'},
    {prop['longitude'] if prop['longitude'] else 'NULL'},
    {str(prop['is_vacant']).lower()},
    'county'
)"""
            values.append(value)
        
        f.write(',\n'.join(values))
        f.write('\nON CONFLICT (apn) DO UPDATE SET\n')
        f.write('    property_address = EXCLUDED.property_address,\n')
        f.write('    owner_name = COALESCE(EXCLUDED.owner_name, master_properties.owner_name),\n')
        f.write('    owner_mailing_address = COALESCE(EXCLUDED.owner_mailing_address, master_properties.owner_mailing_address),\n')
        f.write('    is_absentee = EXCLUDED.is_absentee,\n')
        f.write('    land_value = EXCLUDED.land_value,\n')
        f.write('    improvement_value = EXCLUDED.improvement_value,\n')
        f.write('    total_value = EXCLUDED.total_value,\n')
        f.write('    latitude = EXCLUDED.latitude,\n')
        f.write('    longitude = EXCLUDED.longitude,\n')
        f.write('    is_vacant = EXCLUDED.is_vacant,\n')
        f.write('    updated_at = NOW();\n')
    
    print(f"SQL file generated with {len(properties)} properties")

def generate_json_export(properties, output_file='hayward_properties.json'):
    """Generate JSON export for backup/analysis"""
    print(f"\nGenerating JSON export: {output_file}")
    
    # Convert to list for JSON
    props_list = list(properties.values())
    
    with open(output_file, 'w') as f:
        json.dump({
            'generated': datetime.now().isoformat(),
            'total_properties': len(props_list),
            'properties': props_list
        }, f, indent=2)
    
    print(f"JSON file generated with {len(props_list)} properties")

def main():
    print("=== LEGACY COMPASS DATA PROCESSOR ===")
    print("Processing county data and creating master database...")
    
    # Step 1: Load county parcels
    county_properties = parse_county_csv()
    
    # Step 2: Load owner data
    owners_by_address = load_hayward_owners()
    
    # Step 3: Load vacant properties
    vacant_apns, vacant_by_address = load_jeff_vacant()
    
    # Step 4: Merge all data
    master_properties = merge_data(
        county_properties, 
        owners_by_address, 
        vacant_apns, 
        vacant_by_address
    )
    
    # Step 5: Generate SQL import file
    sql_file = '/Users/kiron/Desktop/legacy compass/legacy-compass-complete-working 4/import_properties.sql'
    generate_sql_inserts(master_properties, sql_file)
    
    # Step 6: Generate JSON backup
    json_file = '/Users/kiron/Desktop/legacy compass/legacy-compass-complete-working 4/hayward_properties.json'
    generate_json_export(master_properties, json_file)
    
    print("\n=== SUMMARY ===")
    print(f"Total Hayward properties with APNs: {len(master_properties)}")
    print(f"Properties with owner data: {sum(1 for p in master_properties.values() if p['owner_name'])}")
    print(f"Vacant properties: {sum(1 for p in master_properties.values() if p['is_vacant'])}")
    print(f"Absentee owners: {sum(1 for p in master_properties.values() if p['is_absentee'])}")
    print(f"\nSQL import file: {sql_file}")
    print(f"JSON backup file: {json_file}")
    print("\nNext steps:")
    print("1. Run master-database-schema.sql in Supabase to create tables")
    print("2. Run import_properties.sql to import all properties")
    print("3. Update the app to use the new master database")

if __name__ == '__main__':
    main()