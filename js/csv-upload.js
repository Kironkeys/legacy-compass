/**
 * CSV Upload Handler for Legacy Compass
 * Matches uploaded properties against master database
 */

window.CSVUpload = {
    /**
     * Process uploaded CSV file
     */
    async processCSV(file, supabase, currentUser, currentFarmId, options = {}) {
        console.log('📄 Processing CSV:', file.name);
        
        // Default options for large-scale imports
        const settings = {
            filterResidential: true,  // Only SFR, condos, townhouses
            splitIntoFarms: false,    // Split large imports into multiple farms
            farmsPerSplit: 1000,      // Properties per farm when splitting
            batchSize: 100,           // Process in batches to avoid timeouts
            showProgress: true,       // Show progress indicator
            ...options
        };
        
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = async (e) => {
                try {
                    const csvText = e.target.result;
                    const properties = this.parseCSV(csvText);
                    
                    console.log(`Found ${properties.length} properties in CSV`);
                    
                    // Filter properties if requested
                    let filteredProperties = properties;
                    if (settings.filterResidential) {
                        filteredProperties = this.filterResidentialProperties(properties);
                        console.log(`Filtered to ${filteredProperties.length} residential properties`);
                    }
                    
                    // Check if we need to split into multiple farms
                    if (settings.splitIntoFarms && filteredProperties.length > settings.farmsPerSplit) {
                        const result = await this.processLargeImportWithSplit(
                            filteredProperties, 
                            supabase, 
                            currentUser, 
                            file.name, 
                            settings
                        );
                        resolve(result);
                    } else {
                        // Regular processing
                        const results = await this.matchPropertiesInBatches(
                            filteredProperties, 
                            supabase, 
                            settings.batchSize,
                            settings.showProgress
                        );
                        
                        // Add matched properties to farm
                        if (results.matched.length > 0 && currentFarmId) {
                            await this.addToFarmInBatches(
                                results.matched, 
                                supabase, 
                                currentUser, 
                                currentFarmId,
                                settings.batchSize
                            );
                        }
                        
                        resolve(results);
                    }
                } catch (error) {
                    console.error('CSV processing error:', error);
                    reject(error);
                }
            };
            
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    },
    
    /**
     * Parse CSV text into property objects
     */
    parseCSV(csvText) {
        const lines = csvText.split('\n');
        const properties = [];
        
        // Try to detect header
        const firstLine = lines[0].toLowerCase();
        let hasHeader = firstLine.includes('address') || 
                       firstLine.includes('owner') || 
                       firstLine.includes('apn');
        
        const startIndex = hasHeader ? 1 : 0;
        
        for (let i = startIndex; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            // Handle different CSV formats
            const parts = this.parseCSVLine(line);
            
            if (parts.length > 0) {
                // Try to extract address (usually first column)
                const address = parts[0];
                
                // Try to extract owner (usually second column)
                const owner = parts.length > 1 ? parts[1] : '';
                
                // Try to extract APN if present
                const apn = parts.length > 2 ? parts[2] : '';
                
                if (address) {
                    properties.push({
                        address: this.normalizeAddress(address),
                        owner: owner,
                        apn: apn,
                        originalLine: line
                    });
                }
            }
        }
        
        return properties;
    },
    
    /**
     * Parse a single CSV line handling quotes
     */
    parseCSVLine(line) {
        const parts = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                parts.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        
        if (current) {
            parts.push(current.trim());
        }
        
        return parts;
    },
    
    /**
     * Normalize address for matching
     */
    normalizeAddress(addr) {
        if (!addr) return '';
        
        return addr
            .toUpperCase()
            .replace(/\./g, '')
            .replace(/,/g, '')
            .replace(/\s+/g, ' ')
            .replace(' STREET', ' ST')
            .replace(' AVENUE', ' AVE')
            .replace(' BOULEVARD', ' BLVD')
            .replace(' DRIVE', ' DR')
            .replace(' ROAD', ' RD')
            .replace(' LANE', ' LN')
            .replace(' COURT', ' CT')
            .replace(' PLACE', ' PL')
            .trim();
    },
    
    /**
     * Filter for residential properties only
     */
    filterResidentialProperties(properties) {
        const residentialKeywords = [
            'SFR', 'SINGLE FAMILY', 'CONDO', 'CONDOMINIUM', 
            'TOWNHOUSE', 'TOWNHOME', 'RESIDENTIAL', 'DUPLEX',
            'HOME', 'HOUSE'
        ];
        
        const commercialKeywords = [
            'LLC', 'CORP', 'INC', 'TRUST', 'PARTNERSHIP',
            'COMMERCIAL', 'RETAIL', 'OFFICE', 'INDUSTRIAL',
            'WAREHOUSE', 'SHOPPING', 'HOTEL', 'MOTEL'
        ];
        
        return properties.filter(prop => {
            const combined = `${prop.address} ${prop.owner} ${prop.type || ''}`.toUpperCase();
            
            // Exclude if has commercial keywords
            const hasCommercial = commercialKeywords.some(keyword => 
                combined.includes(keyword)
            );
            if (hasCommercial) return false;
            
            // Include if has residential keywords or no type specified
            const hasResidential = residentialKeywords.some(keyword => 
                combined.includes(keyword)
            );
            
            // If no type keywords found, include it (assume residential)
            return hasResidential || !prop.type;
        });
    },
    
    /**
     * Process large import with farm splitting
     */
    async processLargeImportWithSplit(properties, supabase, user, fileName, settings) {
        const baseFarmName = fileName.replace('.csv', '').substring(0, 30);
        const chunks = [];
        const results = {
            farms: [],
            totalMatched: 0,
            totalImported: 0
        };
        
        // Split into chunks
        for (let i = 0; i < properties.length; i += settings.farmsPerSplit) {
            chunks.push(properties.slice(i, i + settings.farmsPerSplit));
        }
        
        console.log(`📊 Splitting ${properties.length} properties into ${chunks.length} farms`);
        
        // Create a farm for each chunk
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const farmName = chunks.length > 1 
                ? `${baseFarmName} - Part ${i + 1}` 
                : baseFarmName;
            
            // Create farm
            const farm = await window.MasterDatabase.createFarm(
                supabase, 
                user, 
                farmName, 
                i === 0
            );
            
            if (farm) {
                // Match and add properties
                const matched = await this.matchPropertiesInBatches(
                    chunk, 
                    supabase, 
                    settings.batchSize
                );
                
                await this.addToFarmInBatches(
                    matched.matched,
                    supabase,
                    user,
                    farm.id,
                    settings.batchSize
                );
                
                results.farms.push({
                    name: farmName,
                    matched: matched.matched.length,
                    total: chunk.length
                });
                results.totalMatched += matched.matched.length;
                results.totalImported += chunk.length;
            }
        }
        
        return results;
    },
    
    /**
     * Match properties in batches to avoid timeouts
     */
    async matchPropertiesInBatches(properties, supabase, batchSize = 100, showProgress = true) {
        const matched = [];
        const unmatched = [];
        const total = properties.length;
        
        console.log(`🔍 Matching ${total} properties in batches of ${batchSize}...`);
        
        for (let i = 0; i < total; i += batchSize) {
            const batch = properties.slice(i, i + batchSize);
            const batchNum = Math.floor(i / batchSize) + 1;
            const totalBatches = Math.ceil(total / batchSize);
            
            if (showProgress) {
                const progress = Math.min(100, (i / total) * 100);
                console.log(`Batch ${batchNum}/${totalBatches} (${progress.toFixed(0)}%)`);
                
                // Update UI if progress element exists
                const progressEl = document.getElementById('csv-upload-progress');
                if (progressEl) {
                    progressEl.style.width = `${progress}%`;
                    progressEl.textContent = `${progress.toFixed(0)}%`;
                }
            }
            
            // Process batch
            for (const prop of batch) {
                let found = false;
                
                // Try to match by APN first
                if (prop.apn) {
                    const { data } = await supabase
                        .from('master_properties')
                        .select('*')
                        .eq('apn', prop.apn)
                        .single();
                    
                    if (data) {
                        matched.push({
                            ...data,
                            csvData: prop
                        });
                        found = true;
                    }
                }
                
                // Try address match if no APN match
                if (!found && prop.address) {
                    const { data } = await supabase
                        .from('master_properties')
                        .select('*')
                        .ilike('property_address', `%${prop.address}%`)
                        .limit(1);
                    
                    if (data && data.length > 0) {
                        const dbAddr = this.normalizeAddress(data[0].property_address);
                        if (dbAddr.includes(prop.address) || prop.address.includes(dbAddr)) {
                            matched.push({
                                ...data[0],
                                csvData: prop
                            });
                            found = true;
                        }
                    }
                }
                
                if (!found) {
                    unmatched.push(prop);
                }
            }
            
            // Small delay between batches to avoid rate limiting
            if (i + batchSize < total) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        console.log(`✅ Matched: ${matched.length} (${(matched.length/total*100).toFixed(1)}%)`);
        console.log(`❌ Unmatched: ${unmatched.length}`);
        
        return {
            matched,
            unmatched,
            total,
            matchRate: (matched.length / total * 100).toFixed(1)
        };
    },
    
    /**
     * Add properties to farm in batches
     */
    async addToFarmInBatches(properties, supabase, user, farmId, batchSize = 100) {
        let added = 0;
        let skipped = 0;
        const total = properties.length;
        
        console.log(`📤 Adding ${total} properties to farm...`);
        
        for (let i = 0; i < total; i += batchSize) {
            const batch = properties.slice(i, i + batchSize);
            
            // Prepare batch insert
            const records = batch.map(prop => ({
                farm_id: farmId,
                apn: prop.apn,
                user_id: user.id,
                private_notes: prop.csvData ? 
                    `Imported from CSV: ${prop.csvData.originalLine}` : 
                    'Imported from CSV',
                is_hot_list: false,
                priority: 0
            }));
            
            try {
                const { data, error } = await supabase
                    .from('farm_properties')
                    .insert(records)
                    .select();
                
                if (error) {
                    if (error.code === '23505') {
                        // Some duplicates
                        skipped += batch.length;
                    }
                } else {
                    added += data.length;
                }
            } catch (err) {
                console.error('Batch insert error:', err);
            }
            
            // Progress update
            const progress = Math.min(100, ((i + batch.length) / total) * 100);
            console.log(`Progress: ${progress.toFixed(0)}% (${added} added, ${skipped} skipped)`);
        }
        
        console.log(`✅ Import complete: ${added} added, ${skipped} duplicates skipped`);
        return { added, skipped };
    },
    
    /**
     * Match properties against master database
     */
    async matchProperties(properties, supabase) {
        const matched = [];
        const unmatched = [];
        
        console.log('🔍 Matching properties against master database...');
        
        for (const prop of properties) {
            let found = false;
            
            // Try to match by APN first (most accurate)
            if (prop.apn) {
                const { data } = await supabase
                    .from('master_properties')
                    .select('*')
                    .eq('apn', prop.apn)
                    .single();
                
                if (data) {
                    matched.push({
                        ...data,
                        csvData: prop
                    });
                    found = true;
                }
            }
            
            // If no APN match, try address match
            if (!found && prop.address) {
                const { data } = await supabase
                    .from('master_properties')
                    .select('*')
                    .ilike('property_address', `%${prop.address}%`)
                    .limit(1);
                
                if (data && data.length > 0) {
                    // Check if it's a reasonable match
                    const dbAddr = this.normalizeAddress(data[0].property_address);
                    if (dbAddr.includes(prop.address) || prop.address.includes(dbAddr)) {
                        matched.push({
                            ...data[0],
                            csvData: prop
                        });
                        found = true;
                    }
                }
            }
            
            if (!found) {
                unmatched.push(prop);
            }
        }
        
        console.log(`✅ Matched: ${matched.length}`);
        console.log(`❌ Unmatched: ${unmatched.length}`);
        
        return {
            matched,
            unmatched,
            total: properties.length,
            matchRate: (matched.length / properties.length * 100).toFixed(1)
        };
    },
    
    /**
     * Add matched properties to farm
     */
    async addToFarm(matchedProperties, supabase, currentUser, farmId) {
        let added = 0;
        let skipped = 0;
        
        for (const prop of matchedProperties) {
            try {
                const { error } = await supabase
                    .from('farm_properties')
                    .insert({
                        farm_id: farmId,
                        apn: prop.apn,
                        user_id: currentUser.id,
                        private_notes: `Imported from CSV: ${prop.csvData.originalLine}`,
                        is_hot_list: false
                    });
                
                if (!error) {
                    added++;
                } else if (error.code === '23505') {
                    // Duplicate - already in farm
                    skipped++;
                }
            } catch (err) {
                console.error('Error adding property:', err);
            }
        }
        
        console.log(`✅ Added ${added} properties to farm`);
        console.log(`⏭️ Skipped ${skipped} duplicates`);
        
        return { added, skipped };
    },
    
    /**
     * Create upload UI element
     */
    createUploadButton() {
        return `
            <div class="csv-upload-container">
                <input 
                    type="file" 
                    id="csv-upload" 
                    accept=".csv,.txt" 
                    style="display: none"
                    onchange="handleCSVUpload(this)"
                />
                <button 
                    onclick="document.getElementById('csv-upload').click()"
                    class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm"
                >
                    📁 Upload CSV
                </button>
            </div>
        `;
    }
};