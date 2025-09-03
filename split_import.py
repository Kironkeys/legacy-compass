#!/usr/bin/env python3
"""
Split the large SQL import file into smaller chunks for Supabase
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
    
    # Split into chunks of 5000 properties each
    chunk_size = 5000
    num_chunks = (len(values) + chunk_size - 1) // chunk_size
    
    print(f"Total properties: {len(values)}")
    print(f"Creating {num_chunks} SQL files with ~{chunk_size} properties each")
    
    for i in range(num_chunks):
        start_idx = i * chunk_size
        end_idx = min((i + 1) * chunk_size, len(values))
        chunk_values = values[start_idx:end_idx]
        
        filename = f'import_chunk_{i+1:02d}.sql'
        
        with open(filename, 'w') as f:
            # Write header for first chunk or modified header for others
            if i == 0:
                f.writelines(header_lines)
            else:
                f.write("-- Legacy Compass Master Properties Import - Chunk " + str(i+1) + "\n")
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
        
        print(f"Created {filename} with {end_idx - start_idx} properties")
    
    print("\n✅ Done! Run each import_chunk_XX.sql file in order in Supabase")
    print("\nOrder to run:")
    for i in range(num_chunks):
        print(f"  {i+1}. import_chunk_{i+1:02d}.sql")

if __name__ == '__main__':
    split_sql_file()