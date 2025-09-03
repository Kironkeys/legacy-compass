#!/usr/bin/env python3
"""
Split the SQL import into much smaller chunks for Supabase
"""

def split_sql_file():
    print("Splitting import_properties.sql into smaller chunks...")
    
    # Read the original file
    with open('import_properties.sql', 'r') as f:
        lines = f.readlines()
    
    # Find where the VALUES start
    header_lines = []
    value_lines = []
    footer_lines = []
    
    in_values = False
    in_footer = False
    
    for line in lines:
        if 'VALUES' in line:
            header_lines.append(line)
            in_values = True
        elif 'ON CONFLICT' in line:
            in_values = False
            in_footer = True
            footer_lines.append(line)
        elif in_footer:
            footer_lines.append(line)
        elif in_values:
            if line.strip() and not line.strip().startswith('--'):
                value_lines.append(line)
        else:
            header_lines.append(line)
    
    # Parse individual value entries
    values = []
    current_value = []
    
    for line in value_lines:
        current_value.append(line)
        if '),' in line or (')' in line and not ',' in line):
            values.append(''.join(current_value))
            current_value = []
    
    # Split into chunks of 1000 properties each (much smaller!)
    chunk_size = 1000
    num_chunks = (len(values) + chunk_size - 1) // chunk_size
    
    print(f"Total properties: {len(values)}")
    print(f"Creating {num_chunks} SQL files with ~{chunk_size} properties each")
    
    # Create a batch runner script
    batch_script = []
    batch_script.append("-- Run these queries one by one in Supabase\n")
    batch_script.append("-- Each chunk adds 1000 properties\n\n")
    
    for i in range(num_chunks):
        start_idx = i * chunk_size
        end_idx = min((i + 1) * chunk_size, len(values))
        chunk_values = values[start_idx:end_idx]
        
        filename = f'chunk_{i+1:03d}.sql'
        
        with open(filename, 'w') as f:
            # Write header
            f.write(f"-- Chunk {i+1} of {num_chunks} - Properties {start_idx+1} to {end_idx}\n")
            f.write("INSERT INTO master_properties (\n")
            f.write("    apn, property_address, city, state,\n")
            f.write("    owner_name, owner_mailing_address, is_absentee,\n")
            f.write("    land_value, improvement_value, total_value,\n")
            f.write("    latitude, longitude, is_vacant, data_source\n")
            f.write(") VALUES\n")
            
            # Write values
            for j, value in enumerate(chunk_values):
                if j == len(chunk_values) - 1:
                    # Last value in chunk - remove trailing comma
                    value = value.rstrip().rstrip(',')
                f.write(value)
                if j < len(chunk_values) - 1 and not value.rstrip().endswith(','):
                    f.write(',')
                if not value.endswith('\n'):
                    f.write('\n')
            
            # Write footer (ON CONFLICT clause)
            f.write('\n')
            f.writelines(footer_lines)
        
        batch_script.append(f"-- {i+1}. Run chunk_{i+1:03d}.sql ({end_idx - start_idx} properties)\n")
        print(f"Created {filename} with {end_idx - start_idx} properties")
    
    # Save batch instructions
    with open('RUN_ORDER.txt', 'w') as f:
        f.write("IMPORT INSTRUCTIONS\n")
        f.write("==================\n\n")
        f.write(f"Total files: {num_chunks}\n")
        f.write(f"Properties per file: {chunk_size}\n")
        f.write(f"Total properties: {len(values)}\n\n")
        f.write("Run each file in order:\n\n")
        for i in range(num_chunks):
            f.write(f"{i+1:3d}. chunk_{i+1:03d}.sql\n")
        f.write("\nEach file is small enough for Supabase!\n")
    
    print(f"\n✅ Done! Created {num_chunks} smaller files")
    print(f"Each file is about {len(values[0]) * chunk_size / 1024:.0f} KB")
    print("\nStart with chunk_001.sql")

if __name__ == '__main__':
    split_sql_file()