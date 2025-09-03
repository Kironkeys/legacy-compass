/**
 * Legacy Compass - Clean Version
 * Starts empty, only loads farms when requested
 */

document.addEventListener('alpine:init', () => {
    Alpine.data('legacyCompass', () => ({
        // State - START EMPTY
        properties: [],
        filteredProperties: [],
        selectedProperty: null,
        isLoading: false,
        dataLoaded: false,
        
        // Filters
        filters: {
            search: '',
            equityMin: 0,
            absenteeOnly: false,
            selectedTags: []
        },
        
        // Stats
        stats: {
            total: 0,
            absentee: 0,
            avgEquity: 0
        },
        
        // UI State
        territory: 'No Farm Loaded',
        toasts: [],
        hotList: [],
        isRecording: false,
        recognition: null,
        recordingProperty: null,
        currentUser: null,
        isOnline: navigator.onLine,
        
        // CSV Upload State
        showCSVModal: false,
        uploadStep: 'file', // file, columns, geocoding, processing, complete
        selectedFile: null,
        isDragOver: false,
        csvStats: {
            totalRows: 0,
            detectedColumns: 0,
            hasCoordinates: false
        },
        detectedColumns: [],
        geocodingMode: null,
        uploadProgress: 0,
        progressMessage: '',
        processingStats: null,
        currentDataset: 'none', // none, jeff_anna, uploaded
        uploadedDataAvailable: false,
        jeffAnnaData: null,
        uploadedData: null,
        
        // Light presets
        lightPresets: ['dawn', 'day', 'dusk', 'night'],
        currentLightIndex: 2, // Start with dusk
        currentLight: 'Dusk',
        currentLightIcon: '🌅',
        
        // Address search
        addressSearchValue: '',
        
        // UI state
        showTags: false,
        
        // Initialize and auto-load farm data
        async init() {
            console.log('🧭 Legacy Compass ready');
            
            // Check authentication first
            await this.checkAuth();
            
            // Initialize IndexedDB
            await this.initIndexedDB();
            
            // Initialize voice recognition
            this.initVoiceRecognition();
            
            // Setup light change listener
            this.setupLightListener();
            
            // Listen for online/offline events
            window.addEventListener('online', () => {
                this.isOnline = true;
                this.showToast('✅ Back online - syncing data...', 'success');
                if (window.UserData) {
                    window.UserData.syncOfflineChanges();
                }
            });
            
            window.addEventListener('offline', () => {
                this.isOnline = false;
                this.showToast('📵 Offline mode - changes will sync when reconnected', 'warning');
            });
            
            // Try to load cached Jeff & Anna farm data first
            const cachedJeffAnna = await this.loadFromIndexedDB('jeff_anna');
            const cachedUploaded = await this.loadFromIndexedDB('uploaded');
            
            if (cachedJeffAnna && cachedJeffAnna.length > 0) {
                console.log('📦 Loading Jeff & Anna farm from cache...');
                this.jeffAnnaData = cachedJeffAnna;
                this.properties = cachedJeffAnna;
                this.filteredProperties = cachedJeffAnna;
                this.dataLoaded = true;
                this.territory = 'Jeff & Anna Farm';
                this.currentDataset = 'jeff_anna';
                this.updateStatsFromProperties(cachedJeffAnna);
                
                // Update map with cached data
                if (window.mapController) {
                    setTimeout(() => {
                        window.mapController.loadFarmProperties(cachedJeffAnna);
                    }, 1000);
                }
                
                this.showToast(`✅ Loaded ${cachedJeffAnna.length} properties from cache`, 'success');
            } else {
                // Auto-load Jeff & Anna's farm from CSV
                console.log('🚀 Auto-loading Jeff & Anna farm...');
                setTimeout(() => {
                    this.loadJeffAnnaFarm();
                }, 1000);
            }
            
            // Also check for uploaded data
            if (cachedUploaded && cachedUploaded.length > 0) {
                console.log('📦 Found uploaded data in cache');
                this.uploadedData = cachedUploaded;
                this.uploadedDataAvailable = true;
            }
            
            // Initialize map
            setTimeout(() => {
                if (window.mapController) {
                    window.mapController.initialize();
                    
                    // FORCE 3D AFTER MAP LOADS
                    setTimeout(() => {
                        if (window.mapController.map) {
                            console.log('🔧 FORCING 3D VIEW');
                            window.mapController.map.setPitch(60);
                            window.mapController.map.setBearing(-20);
                            
                            // Double check it worked
                            setTimeout(() => {
                                const pitch = window.mapController.map.getPitch();
                                console.log(`📐 Current pitch: ${pitch}`);
                                if (pitch === 0) {
                                    console.error('❌ PITCH STILL 0 - Something is resetting it!');
                                }
                            }, 1000);
                        }
                    }, 2000);
                }
            }, 500);
            
            // Add keyboard shortcut for 3D toggle
            document.addEventListener('keydown', (e) => {
                if (e.key === '3' && window.mapController && window.mapController.map) {
                    window.mapController.toggle3DView();
                }
            });
        },
        
        // Initialize IndexedDB for persistence
        async initIndexedDB() {
            return new Promise((resolve) => {
                const request = indexedDB.open('LegacyCompassDB', 4);
                
                request.onerror = () => {
                    console.error('Failed to open IndexedDB');
                    resolve(false);
                };
                
                request.onsuccess = () => {
                    this.db = request.result;
                    console.log('✅ IndexedDB initialized');
                    resolve(true);
                };
                
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    
                    // Create object store for farm data
                    if (!db.objectStoreNames.contains('farms')) {
                        const store = db.createObjectStore('farms', { keyPath: 'id' });
                        store.createIndex('dataset', 'dataset', { unique: false });
                    }
                };
            });
        },
        
        // Save farm data to IndexedDB
        async saveToIndexedDB(dataset, properties) {
            if (!this.db) return;
            
            const transaction = this.db.transaction(['farms'], 'readwrite');
            const store = transaction.objectStore('farms');
            
            // Clear existing data for this dataset
            const index = store.index('dataset');
            const range = IDBKeyRange.only(dataset);
            const deleteRequest = index.openCursor(range);
            
            deleteRequest.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    store.delete(cursor.primaryKey);
                    cursor.continue();
                }
            };
            
            // Save new data
            properties.forEach((property, index) => {
                store.add({
                    id: `${dataset}_${index}`,
                    dataset: dataset,
                    data: property,
                    savedAt: new Date().toISOString()
                });
            });
            
            return new Promise((resolve) => {
                transaction.oncomplete = () => {
                    console.log(`💾 Saved ${properties.length} properties to IndexedDB`);
                    resolve(true);
                };
                transaction.onerror = () => {
                    console.error('Failed to save to IndexedDB');
                    resolve(false);
                };
            });
        },
        
        // Load farm data from IndexedDB
        async loadFromIndexedDB(dataset) {
            if (!this.db) return null;
            
            return new Promise((resolve) => {
                const transaction = this.db.transaction(['farms'], 'readonly');
                const store = transaction.objectStore('farms');
                const index = store.index('dataset');
                const range = IDBKeyRange.only(dataset);
                const request = index.getAll(range);
                
                request.onsuccess = () => {
                    const results = request.result;
                    if (results && results.length > 0) {
                        const properties = results.map(r => r.data);
                        console.log(`📦 Loaded ${properties.length} properties from IndexedDB`);
                        resolve(properties);
                    } else {
                        resolve(null);
                    }
                };
                
                request.onerror = () => {
                    console.error('Failed to load from IndexedDB');
                    resolve(null);
                };
            });
        },
        
        // Load Jeff & Anna's Farm
        async loadJeffAnnaFarm() {
            if (this.isLoading) return;
            
            try {
                this.isLoading = true;
                this.showToast('🚜 Loading Jeff & Anna\'s farm (7,140 properties)...', 'info');
                
                // Load the farm CSV with performance limits
                const farmProperties = await window.farmLoader.loadFarmCSV('/jeff_annaFarm.csv', {
                    limit: 2000,  // Load 2000 properties (browser can handle it)
                    progressive: true
                });
                
                // Store Jeff & Anna data and set as current
                this.jeffAnnaData = farmProperties;
                this.properties = farmProperties;
                this.filteredProperties = farmProperties;
                this.dataLoaded = true;
                
                // Get farm statistics
                const stats = window.farmLoader.getFarmStats();
                
                // Update UI with farm stats
                this.stats.total = stats.total;
                this.stats.absentee = stats.absenteePercent;
                this.stats.avgEquity = stats.avgEquity;
                
                // Update map with farm properties
                if (window.mapController) {
                    window.mapController.loadFarmProperties(farmProperties);
                }
                
                // Show success
                const totalInFarm = window.farmLoader.totalInFarm || stats.total;
                this.showToast(
                    `✅ Loaded ${stats.total} of ${totalInFarm.toLocaleString()} properties! ` +
                    `${stats.absenteePercent}% absentee, ` +
                    `$${(stats.totalEquityDollars / 1000000).toFixed(1)}M equity`, 
                    'success'
                );
                
                // Update territory badge
                this.territory = 'Jeff & Anna Farm';
                this.currentDataset = 'jeff_anna';
                
                // Save to IndexedDB for persistence
                await this.saveToIndexedDB('jeff_anna', farmProperties);
                
            } catch (error) {
                console.error('Failed to load farm:', error);
                this.showToast('Failed to load farm data', 'error');
            } finally {
                this.isLoading = false;
            }
        },

        // CSV Upload Methods
        showCSVUpload() {
            this.showCSVModal = true;
            this.uploadStep = 'file';
            this.selectedFile = null;
            this.csvStats = { totalRows: 0, detectedColumns: 0, hasCoordinates: false };
            this.detectedColumns = [];
            this.geocodingMode = null;
            this.uploadProgress = 0;
            this.progressMessage = '';
            this.processingStats = null;
        },

        closeUploadModal() {
            this.showCSVModal = false;
            this.isDragOver = false;
            if (this.uploadStep === 'complete') {
                // Modal closed after successful upload - data already loaded
                return;
            }
            // Reset state
            this.uploadStep = 'file';
            this.selectedFile = null;
        },

        handleFileDrop(event) {
            this.isDragOver = false;
            const files = event.dataTransfer.files;
            if (files.length > 0) {
                this.processFile(files[0]);
            }
        },

        handleFileSelect(event) {
            const file = event.target.files[0];
            if (file) {
                this.processFile(file);
            }
        },

        async processFile(file) {
            if (!file.name.toLowerCase().endsWith('.csv')) {
                this.showToast('Please select a CSV file', 'error');
                return;
            }

            this.selectedFile = file;
            this.progressMessage = 'Analyzing CSV structure...';
            
            try {
                // Read and parse file
                const csvText = await this.readFileAsText(file);
                const parseResult = await window.smartCSVLoader.parseCSV(
                    csvText, 
                    file.name,
                    (progress) => {
                        this.uploadProgress = progress.percent;
                        this.progressMessage = `Analyzing row ${progress.current} of ${progress.total}`;
                    }
                );

                // Update CSV stats
                this.csvStats = {
                    totalRows: parseResult.totalCount,
                    detectedColumns: Object.keys(parseResult.properties[0] || {}).length,
                    hasCoordinates: parseResult.hasCoordinates
                };

                // Get detected columns for display
                this.detectedColumns = this.getDetectedColumnsDisplay(parseResult.properties[0]);

                // Move to column detection step
                this.uploadStep = 'columns';
                this.uploadProgress = 0;
                this.progressMessage = '';

            } catch (error) {
                console.error('Error processing CSV:', error);
                this.showToast('Failed to process CSV file', 'error');
            }
        },

        readFileAsText(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = e => resolve(e.target.result);
                reader.onerror = reject;
                reader.readAsText(file);
            });
        },

        getDetectedColumnsDisplay(sampleProperty) {
            const columnTypes = [
                { field: 'Address', type: 'address', keys: ['address', 'fullAddress'] },
                { field: 'Owner Name', type: 'owner', keys: ['ownerName', 'ownerFirstName', 'ownerLastName'] },
                { field: 'Property Details', type: 'property', keys: ['bedrooms', 'bathrooms', 'squareFeet', 'yearBuilt'] },
                { field: 'Financial', type: 'financial', keys: ['purchasePrice', 'purchaseDate'] },
                { field: 'Coordinates', type: 'coordinates', keys: ['lat', 'lng'] }
            ];

            const detected = [];
            for (const colType of columnTypes) {
                const hasFields = colType.keys.some(key => sampleProperty && sampleProperty[key]);
                if (hasFields) {
                    const foundKeys = colType.keys.filter(key => sampleProperty && sampleProperty[key]);
                    detected.push({
                        field: colType.field,
                        type: colType.type,
                        header: foundKeys.join(', ')
                    });
                }
            }
            return detected;
        },

        processCSVFile() {
            // Move to geocoding options
            this.uploadStep = 'geocoding';
            
            // Default to precise mode if no coordinates
            if (!this.csvStats.hasCoordinates && !this.geocodingMode) {
                this.geocodingMode = 'precise';
            }
        },

        async startGeocoding() {
            this.uploadStep = 'processing';
            this.uploadProgress = 0;
            this.processingStats = {
                processed: 0,
                total: this.csvStats.totalRows,
                cached: 0,
                failed: 0
            };

            try {
                if (this.csvStats.hasCoordinates) {
                    // Already has coordinates - just load the data
                    this.progressMessage = 'Loading properties with existing coordinates...';
                    const properties = window.smartCSVLoader.data;
                    await this.finishImport(properties);
                } else if (this.geocodingMode === 'cluster') {
                    // Quick street clustering mode
                    this.progressMessage = 'Using street clustering for approximate locations...';
                    const properties = await this.clusterByStreet(window.smartCSVLoader.data);
                    await this.finishImport(properties);
                } else {
                    // Precise geocoding mode
                    this.progressMessage = 'Starting precise geocoding...';
                    const properties = await window.geocodingService.geocodeProperties(
                        window.smartCSVLoader.data,
                        (progress) => {
                            this.uploadProgress = progress.percent;
                            this.processingStats = {
                                processed: progress.processed,
                                total: progress.total,
                                cached: progress.cached,
                                failed: progress.failed
                            };
                            this.progressMessage = `Geocoding ${progress.processed} of ${progress.total} addresses...`;
                        }
                    );
                    await this.finishImport(properties);
                }
            } catch (error) {
                console.error('Geocoding failed:', error);
                this.showToast('Failed to process locations', 'error');
                this.uploadStep = 'geocoding'; // Go back
            }
        },

        async clusterByStreet(properties) {
            // Simple street clustering for quick mode
            const streetClusters = new Map();
            
            for (let i = 0; i < properties.length; i++) {
                const property = properties[i];
                const street = this.extractStreetName(property.address);
                
                if (!streetClusters.has(street)) {
                    // Create cluster with estimated coordinates
                    const coords = this.estimateCoordinatesByStreet(street);
                    streetClusters.set(street, coords);
                }
                
                const clusterCoords = streetClusters.get(street);
                // Add small random offset for each property on the street
                property.lat = clusterCoords.lat + (Math.random() - 0.5) * 0.001;
                property.lng = clusterCoords.lng + (Math.random() - 0.5) * 0.001;
                property.hasCoordinates = true;
                
                // Update progress
                this.uploadProgress = Math.round((i / properties.length) * 100);
                if (i % 50 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 1)); // Allow UI updates
                }
            }
            
            return properties;
        },

        extractStreetName(address) {
            // Extract street name from address for clustering
            if (!address) return 'unknown';
            const parts = address.split(' ');
            return parts.slice(1).join(' ').toLowerCase(); // Remove house number
        },

        estimateCoordinatesByStreet(street) {
            // Very simple street-based coordinate estimation for Hayward area
            // In production, this would use a street geocoding service
            const baseHayward = { lat: 37.6688, lng: -122.0808 };
            const hash = this.simpleHash(street);
            return {
                lat: baseHayward.lat + ((hash % 1000) / 10000) - 0.05,
                lng: baseHayward.lng + (((hash >> 10) % 1000) / 10000) - 0.05
            };
        },

        simpleHash(str) {
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // Convert to 32-bit integer
            }
            return Math.abs(hash);
        },

        async finishImport(properties) {
            // Convert to Legacy Compass format
            const legacyProperties = this.convertToLegacyFormat(properties);
            
            // Store uploaded data and set as current
            this.uploadedData = legacyProperties;
            this.uploadedDataAvailable = true;
            this.properties = legacyProperties;
            this.filteredProperties = legacyProperties;
            this.dataLoaded = true;
            
            // Update stats
            this.updateStatsFromProperties(legacyProperties);
            
            // Update map
            if (window.mapController) {
                window.mapController.loadFarmProperties(legacyProperties);
            }
            
            // Update territory
            this.territory = `Uploaded CSV (${legacyProperties.length} properties)`;
            this.currentDataset = 'uploaded';
            
            // Save to IndexedDB for persistence
            await this.saveToIndexedDB('uploaded', legacyProperties);
            
            // Show completion
            this.uploadStep = 'complete';
            this.uploadProgress = 100;
            this.progressMessage = 'Import complete!';
            
            this.showToast(`✅ Imported ${legacyProperties.length} properties successfully!`, 'success');
        },

        convertToLegacyFormat(properties) {
            return properties.map((prop, index) => ({
                id: prop.id || `uploaded_${index}`,
                address: prop.address || prop.fullAddress || '',
                coordinates: prop.lat && prop.lng ? {
                    lat: parseFloat(prop.lat),
                    lng: parseFloat(prop.lng)
                } : null,
                owner: {
                    fullName: prop.ownerName || 'Unknown Owner',
                    name: prop.ownerName || 'Unknown Owner',
                    type: prop.isAbsentee ? 'absentee' : 'owner',
                    phone: null,
                    email: null,
                    mailing: {
                        address: prop.mailingAddress || null
                    }
                },
                property: {
                    type: prop.propertyType || 'Residential',
                    beds: prop.bedrooms || 0,
                    baths: prop.bathrooms || 0,
                    sqft: prop.squareFeet || 0,
                    units: 1,
                    yearBuilt: prop.yearBuilt || null,
                    lotSize: prop.lotSize || null
                },
                financial: {
                    purchasePrice: prop.purchasePrice || null,
                    purchaseDate: prop.purchaseDate || null,
                    lastSale: prop.purchasePrice ? {
                        date: prop.purchaseDate,
                        price: prop.purchasePrice
                    } : null
                },
                // Add tracking fields
                tags: [],
                notes: [],
                status: 'cold',
                lastContact: null,
                sourceFile: this.selectedFile?.name || 'uploaded.csv',
                importDate: new Date().toISOString()
            }));
        },

        updateStatsFromProperties(properties) {
            const total = properties.length;
            const absentee = properties.filter(p => p.owner.type === 'absentee').length;
            const withPrices = properties.filter(p => p.financial.purchasePrice);
            const avgPrice = withPrices.length > 0 ? 
                withPrices.reduce((sum, p) => sum + p.financial.purchasePrice, 0) / withPrices.length : 0;
            
            this.stats = {
                total: total,
                absentee: Math.round((absentee / total) * 100),
                avgEquity: Math.round(avgPrice / 1000) // Simplified equity calculation
            };
        },

        // Dataset Switching
        switchDataset() {
            if (!this.dataLoaded) return;
            
            let targetData = null;
            let territoryName = '';
            
            if (this.currentDataset === 'jeff_anna') {
                if (!this.jeffAnnaData) {
                    this.showToast('Jeff & Anna farm data not loaded', 'warning');
                    return;
                }
                targetData = this.jeffAnnaData;
                territoryName = 'Jeff & Anna Farm';
            } else if (this.currentDataset === 'uploaded') {
                if (!this.uploadedData) {
                    this.showToast('No uploaded data available', 'warning');
                    return;
                }
                targetData = this.uploadedData;
                territoryName = `Uploaded CSV (${this.uploadedData.length} properties)`;
            }
            
            if (targetData) {
                // Switch to the selected dataset
                this.properties = targetData;
                this.filteredProperties = targetData;
                this.territory = territoryName;
                
                // Update stats
                this.updateStatsFromProperties(targetData);
                
                // Update map
                if (window.mapController) {
                    window.mapController.loadFarmProperties(targetData);
                }
                
                // Reset filters
                this.resetFilters();
                
                this.showToast(`Switched to ${territoryName}`, 'success');
            }
        },
        
        // Apply filters
        applyFilters() {
            if (!this.dataLoaded || !this.properties.length) {
                this.filteredProperties = [];
                return;
            }
            
            let filtered = [...this.properties];
            
            // Apply search filter
            if (this.filters.search && this.filters.search.trim()) {
                const searchTerm = this.filters.search.toLowerCase();
                filtered = filtered.filter(p => {
                    const searchableText = [
                        p.address,
                        p.owner?.fullName,
                        p.owner?.name,
                        p.owner?.phone,
                        p.owner?.email,
                        p.owner?.mailing?.address
                    ].filter(Boolean).join(' ').toLowerCase();
                    
                    return searchableText.includes(searchTerm);
                });
            }
            
            // Apply absentee filter
            if (this.filters.absenteeOnly) {
                filtered = filtered.filter(p => 
                    p.owner?.type === 'absentee' || 
                    p.owner?.type === 'absentee_owner' ||
                    !p.owner?.occupied
                );
            }
            
            // Apply equity filter
            if (this.filters.equityMin > 0) {
                filtered = filtered.filter(p => {
                    // Calculate equity based on available data
                    const equity = p.financial?.equity || 0;
                    const estimatedEquity = this.calculateEquity(p);
                    return Math.max(equity, estimatedEquity) >= this.filters.equityMin;
                });
            }
            
            // Apply tag filters if any are selected
            if (this.filters.selectedTags && this.filters.selectedTags.length > 0) {
                filtered = filtered.filter(p => {
                    if (!p.tags || p.tags.length === 0) return false;
                    return this.filters.selectedTags.some(tag => p.tags.includes(tag));
                });
            }
            
            this.filteredProperties = filtered;
            
            // Update stats based on filtered properties
            this.updateStatsFromProperties(filtered);
            
            // Update map
            if (window.mapController) {
                window.mapController.updateMarkers(filtered);
            }
            
            console.log(`Filters applied: ${filtered.length} of ${this.properties.length} properties shown`);
        },
        
        // Calculate equity for a property
        calculateEquity(property) {
            if (!property.financial) return 0;
            
            const purchasePrice = property.financial.purchasePrice || 0;
            const yearsOwned = property.financial.yearsOwned || 0;
            const estimatedValue = property.financial.estimatedValue || 
                                   property.financial.marketValue || 
                                   purchasePrice;
            
            if (purchasePrice && estimatedValue) {
                // Simple equity calculation: (current value - purchase price) / current value * 100
                const equity = ((estimatedValue - purchasePrice) / estimatedValue) * 100;
                return Math.max(0, Math.round(equity));
            }
            
            // Default estimate based on years owned (5% appreciation per year)
            if (yearsOwned > 0) {
                const appreciationRate = 0.05;
                const appreciatedValue = purchasePrice * Math.pow(1 + appreciationRate, yearsOwned);
                const equity = ((appreciatedValue - purchasePrice) / appreciatedValue) * 100;
                return Math.max(0, Math.round(equity));
            }
            
            return 0;
        },
        
        // Select property
        selectProperty(property) {
            this.selectedProperty = property;
            
            // Focus map on property
            if (window.mapController && property.coordinates) {
                window.mapController.focusOnProperty(property);
            }
            
            // Initialize mini map after a short delay for DOM to update
            setTimeout(() => {
                this.initMiniMap(property);
            }, 100);
        },
        
        // Initialize mini map for selected property
        initMiniMap(property) {
            if (!property || !property.coordinates) return;
            
            const miniMapContainer = document.getElementById('miniMap');
            if (!miniMapContainer) return;
            
            // Clear any existing mini map
            miniMapContainer.innerHTML = '';
            
            // Create mini map with SAME STYLE as main map for consistent lighting
            const miniMap = new mapboxgl.Map({
                container: 'miniMap',
                style: 'mapbox://styles/mapbox/standard',  // Same as main map!
                center: [property.coordinates.lng, property.coordinates.lat],
                zoom: 17,
                pitch: 60, // High pitch for dramatic 3D view
                bearing: -20, // Slight rotation for perspective
                interactive: true, // Make it interactive so users can explore
                attributionControl: false,
                maxPitch: 85, // Allow almost vertical viewing
                config: {
                    lightPreset: 'dusk'  // Start with same light as main
                }
            });
            
            // Add navigation controls to mini map with pitch visualization
            miniMap.addControl(new mapboxgl.NavigationControl({
                showCompass: true,
                showZoom: true,
                visualizePitch: true
            }), 'top-right');
            
            // Add marker and 3D features when loaded
            miniMap.on('load', () => {
                // Sync light preset with main map
                if (window.currentLightPreset) {
                    miniMap.setConfigProperty('basemap', 'lightPreset', window.currentLightPreset);
                }
                
                // Add the property marker
                new mapboxgl.Marker({ color: '#ff9500' })
                    .setLngLat([property.coordinates.lng, property.coordinates.lat])
                    .addTo(miniMap);
                
                // Add 3D terrain
                miniMap.addSource('mapbox-dem', {
                    type: 'raster-dem',
                    url: 'mapbox://mapbox.terrain-rgb',
                    tileSize: 512,
                    maxzoom: 14
                });
                
                miniMap.setTerrain({ 
                    source: 'mapbox-dem', 
                    exaggeration: 1.5 
                });
                
                // Add 3D buildings
                miniMap.addLayer({
                    'id': '3d-buildings',
                    'source': 'composite',
                    'source-layer': 'building',
                    'filter': ['==', 'extrude', 'true'],
                    'type': 'fill-extrusion',
                    'minzoom': 15,
                    'paint': {
                        'fill-extrusion-color': '#aaa',
                        'fill-extrusion-height': ['get', 'height'],
                        'fill-extrusion-base': ['get', 'min_height'],
                        'fill-extrusion-opacity': 0.7
                    }
                });
            });
            
            // Store reference globally for light control
            this.miniMap = miniMap;
            window.miniMapInstance = miniMap;
        },
        
        // Focus main map on property
        focusOnProperty() {
            if (this.selectedProperty && window.mapController) {
                window.mapController.focusOnProperty(this.selectedProperty);
            }
        },
        
        // Toggle light preset
        toggleLightPreset() {
            this.currentLightIndex = (this.currentLightIndex + 1) % this.lightPresets.length;
            const preset = this.lightPresets[this.currentLightIndex];
            
            // Update icons and labels
            const icons = ['🌄', '☀️', '🌅', '🌙'];
            const labels = ['Dawn', 'Day', 'Dusk', 'Night'];
            this.currentLightIcon = icons[this.currentLightIndex];
            this.currentLight = labels[this.currentLightIndex];
            
            // Update map lighting
            if (window.mapController && window.mapController.map) {
                window.mapController.map.setConfigProperty('basemap', 'lightPreset', preset);
                this.showToast(`Light set to ${labels[this.currentLightIndex]}`, 'success');
            }
        },
        
        // Quick actions - Mobile optimized with haptic feedback
        async callProperty(property) {
            if (!property.owner?.phone) {
                this.vibrate([100, 50, 100]); // Error pattern
                this.showToast('📞 No phone number available', 'error');
                return;
            }
            
            try {
                // Haptic feedback for action
                this.vibrate([50]); // Quick tap feedback
                
                // Clean phone number (remove formatting)
                const cleanPhone = property.owner.phone.replace(/[^\d+]/g, '');
                
                // Record the contact attempt before making the call
                await this.recordContact(property, 'call');
                
                // Show confirmation
                this.showToast(`📞 Calling ${property.owner.name || 'owner'}...`, 'success');
                
                // Trigger phone call
                window.location.href = `tel:${cleanPhone}`;
                
                // Log for debugging
                console.log('📞 Initiated call to:', cleanPhone);
                
            } catch (error) {
                console.error('Call error:', error);
                this.vibrate([100, 50, 100, 50, 100]); // Error pattern
                this.showToast('❌ Failed to initiate call', 'error');
            }
        },
        
        async textProperty(property) {
            if (!property.owner?.phone) {
                this.vibrate([100, 50, 100]);
                this.showToast('💬 No phone number available', 'error');
                return;
            }
            
            try {
                this.vibrate([50]);
                
                const cleanPhone = property.owner.phone.replace(/[^\d+]/g, '');
                
                // Record the contact attempt
                await this.recordContact(property, 'text');
                
                // Prepare pre-filled message
                const message = `Hi! I'm interested in your property at ${property.address || 'your location'}. Are you open to discussing it?`;
                
                this.showToast(`💬 Opening text to ${property.owner.name || 'owner'}...`, 'success');
                
                // Trigger SMS with pre-filled message
                window.location.href = `sms:${cleanPhone}${this.isIOS() ? '&' : '?'}body=${encodeURIComponent(message)}`;
                
                console.log('💬 Initiated SMS to:', cleanPhone);
                
            } catch (error) {
                console.error('SMS error:', error);
                this.vibrate([100, 50, 100, 50, 100]);
                this.showToast('❌ Failed to open messaging', 'error');
            }
        },
        
        async emailProperty(property) {
            if (!property.owner?.email) {
                this.vibrate([100, 50, 100]);
                this.showToast('📧 No email available', 'error');
                return;
            }
            
            try {
                this.vibrate([50]);
                
                await this.recordContact(property, 'email');
                
                // Prepare email content
                const subject = `Inquiry about ${property.address || 'your property'}`;
                const body = `Hello ${property.owner.name || ''},\n\nI hope this email finds you well. I'm a real estate professional and I'm interested in your property at ${property.address || 'your location'}.\n\nWould you be open to discussing it? I'd be happy to schedule a brief call at your convenience.\n\nBest regards`;
                
                this.showToast(`📧 Opening email to ${property.owner.name || 'owner'}...`, 'success');
                
                // Trigger email with pre-filled content
                window.location.href = `mailto:${property.owner.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                
                console.log('📧 Initiated email to:', property.owner.email);
                
            } catch (error) {
                console.error('Email error:', error);
                this.vibrate([100, 50, 100, 50, 100]);
                this.showToast('❌ Failed to open email', 'error');
            }
        },
        
        routeToProperty(property) {
            if (property.coordinates) {
                const url = `https://www.google.com/maps/dir/?api=1&destination=${property.coordinates.lat},${property.coordinates.lng}`;
                window.open(url, '_blank');
            }
        },
        
        // Export data
        exportData() {
            if (!this.dataLoaded) {
                this.showToast('No data to export', 'warning');
                return;
            }
            
            const dataStr = JSON.stringify(this.filteredProperties, null, 2);
            const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
            
            const exportFileDefaultName = `jeff_anna_farm_${Date.now()}.json`;
            
            const linkElement = document.createElement('a');
            linkElement.setAttribute('href', dataUri);
            linkElement.setAttribute('download', exportFileDefaultName);
            linkElement.click();
            
            this.showToast('Data exported', 'success');
        },
        
        // Reset filters
        resetFilters() {
            this.filters = {
                search: '',
                equityMin: 0,
                absenteeOnly: false,
                selectedTags: []
            };
            if (this.dataLoaded) {
                this.applyFilters();
            }
        },

        // Address search
        addressSearch: '',
        searchAddress() {
            if (!this.addressSearch.trim()) return;
            
            // Find property by address
            const searchTerm = this.addressSearch.toLowerCase();
            const found = this.properties.find(p => 
                p.address && p.address.toLowerCase().includes(searchTerm)
            );
            
            if (found) {
                this.selectProperty(found);
                this.addressSearch = '';
                this.showToast('Property found and selected', 'success');
            } else {
                this.showToast('Address not found in current dataset', 'warning');
            }
        },

        // Hot list management
        async toggleHotList(property) {
            // Save to user data if authenticated
            if (window.UserData && this.currentUser) {
                try {
                    const result = await window.UserData.toggleFavorite(
                        property.id,
                        property.address
                    );
                    
                    if (result.is_favorite) {
                        this.showToast('⭐ Added to hot list', 'success');
                    } else {
                        this.showToast('Removed from hot list', 'info');
                    }
                    
                    // Update local hot list
                    await this.refreshHotList();
                } catch (error) {
                    console.error('Error updating hot list:', error);
                    // Handle offline
                    if (!this.isOnline) {
                        await window.UserData.storeOfflineChange(
                            'favorite',
                            property.id,
                            { address: property.address }
                        );
                        this.showToast('📵 Hot list updated offline', 'info');
                    }
                }
            } else {
                // Demo mode - use local storage
                const index = this.hotList.findIndex(p => p.id === property.id);
                if (index >= 0) {
                    this.hotList.splice(index, 1);
                    this.showToast('Removed from hot list', 'info');
                } else {
                    this.hotList.push(property);
                    this.showToast('Added to hot list', 'success');
                }
            }
        },
        
        async refreshHotList() {
            if (window.UserData && this.currentUser) {
                const favorites = await window.UserData.getHotList();
                // Map favorite IDs to actual properties
                this.hotList = this.properties.filter(p => 
                    favorites.some(f => f.property_id === p.id)
                );
            }
        },

        isInHotList(property) {
            if (property.isFavorite !== undefined) {
                return property.isFavorite;
            }
            return this.hotList.some(p => p.id === property.id);
        },
        
        async savePropertyNote(property, noteText) {
            if (!noteText.trim()) return;
            
            // Get existing notes and append new note
            const timestamp = new Date().toLocaleString();
            const existingNotes = property.userNotes || '';
            const newNote = `[${timestamp}] ${noteText}`;
            const combinedNotes = existingNotes ? `${existingNotes}\n\n${newNote}` : newNote;
            
            // Save to user data if authenticated
            if (window.UserData && this.currentUser) {
                try {
                    await window.UserData.savePropertyNotes(
                        property.id,
                        combinedNotes,
                        property.address
                    );
                    this.showToast('✅ Note saved', 'success');
                    
                    // Update selected property if it's the same
                    if (this.selectedProperty?.id === property.id) {
                        this.selectedProperty.userNotes = combinedNotes;
                    }
                } catch (error) {
                    console.error('Error saving note:', error);
                    // Handle offline
                    if (!this.isOnline) {
                        await window.UserData.storeOfflineChange(
                            'note',
                            property.id,
                            { notes: combinedNotes, address: property.address }
                        );
                        this.showToast('📵 Note saved offline', 'info');
                    }
                }
            } else {
                // Demo mode - save locally
                if (!property.notes) property.notes = [];
                property.notes.push({
                    text: noteText,
                    timestamp: new Date().toISOString()
                });
                property.userNotes = combinedNotes;
                this.showToast('Note added (demo mode)', 'info');
            }
        },
        
        async updatePropertyStatus(property, status) {
            if (window.UserData && this.currentUser) {
                try {
                    await window.UserData.updatePropertyStatus(property.id, status);
                    this.showToast(`Status updated to ${status}`, 'success');
                    
                    // Update selected property if it's the same
                    if (this.selectedProperty?.id === property.id) {
                        this.selectedProperty.userStatus = status;
                    }
                } catch (error) {
                    console.error('Error updating status:', error);
                    if (!this.isOnline) {
                        await window.UserData.storeOfflineChange(
                            'status',
                            property.id,
                            { status }
                        );
                        this.showToast('📵 Status updated offline', 'info');
                    }
                }
            }
        },
        
        async recordContact(property, contactType) {
            if (window.UserData && this.currentUser) {
                try {
                    await window.UserData.recordContact(property.id, contactType);
                    this.showToast(`${contactType} recorded`, 'success');
                } catch (error) {
                    console.error('Error recording contact:', error);
                }
            }
        },

        currentNote: '',
        activeCategory: 'all',
        searchQuery: '',
        noteType: 'general',
        expandedNotes: [],
        showNotesFilter: false,
        
        // Enhanced note management functions
        getAllNotes() {
            if (!this.selectedProperty || !this.selectedProperty.notes) return [];
            return this.selectedProperty.notes;
        },
        
        getFilteredNotes() {
            const notes = this.getAllNotes();
            let filtered = notes;
            
            // Filter by category
            if (this.activeCategory && this.activeCategory !== 'all') {
                filtered = filtered.filter(note => note.type === this.activeCategory);
            }
            
            // Filter by search query
            if (this.searchQuery) {
                const query = this.searchQuery.toLowerCase();
                filtered = filtered.filter(note => 
                    note.content?.toLowerCase().includes(query) ||
                    note.tags?.some(tag => tag.toLowerCase().includes(query))
                );
            }
            
            // Sort by timestamp (newest first)
            return filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        },
        
        getAllNotesCount() {
            return this.getAllNotes().length;
        },
        
        getCallNotesCount() {
            return this.getAllNotes().filter(n => n.type === 'call').length;
        },
        
        getTextNotesCount() {
            return this.getAllNotes().filter(n => n.type === 'text').length;
        },
        
        getEmailNotesCount() {
            return this.getAllNotes().filter(n => n.type === 'email').length;
        },
        
        getGeneralNotesCount() {
            return this.getAllNotes().filter(n => n.type === 'general').length;
        },
        
        getNoteIcon(type) {
            const icons = {
                'call': '📞',
                'text': '💬',
                'email': '✉️',
                'voice': '🎤',
                'general': '📝'
            };
            return icons[type] || '📝';
        },
        
        getNoteTypePlaceholder(type) {
            const placeholders = {
                'call': 'Add call notes... (e.g., "Spoke with owner, interested in selling")',
                'text': 'Add text message notes...',
                'email': 'Add email notes... (e.g., "Sent offer letter")',
                'general': 'Type a note...'
            };
            return placeholders[type] || 'Type a note...';
        },
        
        formatNoteTimestamp(timestamp) {
            const date = new Date(timestamp);
            const now = new Date();
            const diff = (now - date) / 1000; // seconds
            
            if (diff < 60) return 'Just now';
            if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
            if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
            if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
            
            return date.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric',
                year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
            });
        },
        
        extractTags(text) {
            const tagRegex = /#(\w+)/g;
            const matches = text.match(tagRegex);
            return matches ? matches.map(tag => tag.substring(1)) : [];
        },
        
        saveCurrentNote(noteType) {
            if (!this.currentNote?.trim()) {
                this.showToast('Please enter a note', 'warning');
                return;
            }
            
            if (!this.selectedProperty) {
                this.showToast('Please select a property first', 'warning');
                return;
            }
            
            // Use provided noteType or default
            const type = noteType || this.noteType || 'general';
            
            // Create note object
            const note = {
                id: Date.now() + Math.random(),
                type: type,
                content: this.currentNote.trim(),
                timestamp: new Date().toISOString(),
                tags: this.extractTags(this.currentNote)
            };
            
            // Add to notes array
            if (!this.selectedProperty.notes) {
                this.selectedProperty.notes = [];
            }
            
            this.selectedProperty.notes.push(note);
            
            // Save to backend if available
            if (window.UserData && this.currentUser) {
                window.UserData.savePropertyNote(this.selectedProperty.id, note);
            }
            
            // Clear input
            this.currentNote = '';
            this.showToast(`✅ ${this.getNoteIcon(type)} Note saved`, 'success');
            
            // Trigger UI update
            this.selectedProperty = { ...this.selectedProperty };
        },
        
        editNote(note) {
            this.currentNote = note.content;
            this.noteType = note.type;
            // Remove the old note
            this.deleteNote(note);
        },
        
        deleteNote(note) {
            if (!confirm('Delete this note?')) return;
            
            const index = this.selectedProperty.notes.findIndex(n => n.id === note.id);
            if (index > -1) {
                this.selectedProperty.notes.splice(index, 1);
                this.showToast('Note deleted', 'info');
                
                // Update backend
                if (window.UserData && this.currentUser) {
                    window.UserData.deletePropertyNote(this.selectedProperty.id, note.id);
                }
                
                // Trigger UI update
                this.selectedProperty = { ...this.selectedProperty };
            }
        },
        
        exportNotes() {
            const notes = this.getAllNotes();
            if (notes.length === 0) {
                this.showToast('No notes to export', 'warning');
                return;
            }
            
            // Create CSV content
            let csv = 'Date,Type,Content,Tags\n';
            notes.forEach(note => {
                const date = new Date(note.timestamp).toLocaleString();
                const tags = (note.tags || []).join(';');
                csv += `"${date}","${note.type}","${note.content.replace(/"/g, '""')}","${tags}"\n`;
            });
            
            // Download CSV
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `notes-${this.selectedProperty.address.replace(/ /g, '-')}-${Date.now()}.csv`;
            a.click();
            
            this.showToast('📥 Notes exported', 'success');
        },
        
        setFollowup(property) {
            // Simple follow-up date picker - for now just add 7 days
            const followupDate = new Date();
            followupDate.setDate(followupDate.getDate() + 7);
            
            if (window.UserData && this.currentUser) {
                window.UserData.setFollowUpDate(property.id, followupDate.toISOString());
                this.showToast(`Follow-up set for ${followupDate.toLocaleDateString()}`, 'success');
            }
        },
        
        // Voice recording
        isListening: false,
        recognition: null,
        
        async startVoiceRecording() {
            // Use the enhanced voice handler
            if (!window.voiceHandler) {
                window.voiceHandler = new window.VoiceHandler(this);
            }
            
            try {
                if (this.isListening) {
                    // Stop recording
                    window.voiceHandler.stopRecording();
                    this.isListening = false;
                } else {
                    // Start recording
                    await window.voiceHandler.startRecording();
                    this.isListening = true;
                }
            } catch (error) {
                console.error('Voice recording error:', error);
                this.showToast('🎤 ' + error.message, 'error');
                this.isListening = false;
            }
        },
        
        stopVoiceRecording() {
            if (window.voiceHandler) {
                window.voiceHandler.stopRecording();
            }
            this.isListening = false;
        },
        
        async logout() {
            if (localStorage.getItem('demo_mode') === 'true') {
                // Clear demo mode
                localStorage.removeItem('demo_mode');
                localStorage.removeItem('demo_user');
                window.location.href = '/login.html';
            } else if (window.LegacyAuth) {
                // Logout from Supabase
                await window.LegacyAuth.signOut();
            }
        },
        
        showHotList() {
            if (this.hotList.length === 0) {
                this.showToast('Hot list is empty', 'info');
                return;
            }
            
            // Filter current view to show only hot list properties
            this.filteredProperties = this.hotList;
            this.showToast(`Showing ${this.hotList.length} hot properties`, 'success');
        },

        // Voice notes
        startVoiceNote() {
            if (this.isRecording) {
                this.stopVoiceNote();
            } else {
                this.isRecording = true;
                this.showToast('Voice recording started', 'info');
                // In a real implementation, this would start microphone recording
                setTimeout(() => {
                    this.stopVoiceNote();
                }, 5000); // Auto-stop after 5 seconds for demo
            }
        },

        stopVoiceNote() {
            this.isRecording = false;
            this.showToast('Voice note saved', 'success');
        },

        // Missing property actions that were referenced in HTML
        generateMailer(property) {
            this.showToast('Mailer generation feature coming soon', 'info');
        },

        formatSale(sale) {
            if (!sale) return 'N/A';
            const price = sale.price ? `$${(sale.price / 1000).toFixed(0)}k` : 'Unknown';
            const date = sale.date ? new Date(sale.date).getFullYear() : 'Unknown';
            return `${price} in ${date}`;
        },
        
        // Toast notifications
        async checkAuth() {
            // Check demo mode first
            if (localStorage.getItem('demo_mode') === 'true') {
                // Demo mode
                this.currentUser = JSON.parse(localStorage.getItem('demo_user') || '{}');
                console.log('🎭 Running in demo mode');
                return;
            }
            
            // Wait for auth to initialize
            setTimeout(async () => {
                if (window.LegacyAuth) {
                    try {
                        this.currentUser = await window.LegacyAuth.checkAuth();
                        if (this.currentUser) {
                            console.log('👤 User authenticated:', this.currentUser.email);
                            // Initialize user data
                            if (window.UserData) {
                                try {
                                    await window.UserData.init();
                                } catch (err) {
                                    console.error('UserData init failed (non-fatal):', err);
                                }
                            }
                        }
                    } catch (err) {
                        console.error('Auth check failed:', err);
                        // Continue anyway - don't break the app
                    }
                }
            }, 1500);
        },
        
        initVoiceRecognition() {
            // Check if browser supports speech recognition
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            
            if (!SpeechRecognition) {
                console.warn('Speech recognition not supported in this browser');
                return;
            }
            
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.lang = 'en-US';
            
            this.recognition.onstart = () => {
                console.log('🎤 Voice recognition started');
                this.isRecording = true;
            };
            
            this.recognition.onresult = (event) => {
                let finalTranscript = '';
                let interimTranscript = '';
                
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalTranscript += transcript;
                    } else {
                        interimTranscript += transcript;
                    }
                }
                
                // Update the notes field with the transcription
                if (finalTranscript && this.recordingProperty) {
                    this.addVoiceNote(this.recordingProperty, finalTranscript);
                }
            };
            
            this.recognition.onerror = (event) => {
                console.error('Voice recognition error:', event.error);
                this.isRecording = false;
                this.showToast('Voice recognition error: ' + event.error, 'error');
            };
            
            this.recognition.onend = () => {
                console.log('🎤 Voice recognition ended');
                this.isRecording = false;
                this.recordingProperty = null;
            };
        },
        
        startVoiceNote(property = null) {
            if (!this.recognition) {
                this.showToast('Voice recognition not supported in your browser', 'error');
                return;
            }
            
            if (this.isRecording) {
                // Stop recording
                this.recognition.stop();
                this.isRecording = false;
                this.recordingProperty = null;
            } else {
                // Start recording
                this.recordingProperty = property || this.selectedProperty;
                
                if (!this.recordingProperty) {
                    this.showToast('Please select a property first', 'warning');
                    return;
                }
                
                try {
                    this.recognition.start();
                    this.showToast('🎤 Listening... Speak your note', 'info');
                } catch (error) {
                    console.error('Failed to start voice recognition:', error);
                    this.showToast('Failed to start voice recording', 'error');
                }
            }
        },
        
        async addVoiceNote(property, transcription) {
            console.log('Adding voice note:', transcription);
            
            // Save to user data if authenticated
            if (window.UserData && this.currentUser) {
                try {
                    await window.UserData.saveVoiceNote(
                        property.id,
                        transcription
                    );
                    this.showToast('✅ Voice note saved', 'success');
                } catch (error) {
                    console.error('Error saving voice note:', error);
                    // Save offline if error
                    if (!this.isOnline) {
                        await window.UserData.storeOfflineChange(
                            'voice_note',
                            property.id,
                            { transcription }
                        );
                        this.showToast('📵 Voice note saved offline', 'info');
                    }
                }
            } else {
                // Demo mode or not authenticated - save locally
                if (!property.notes) property.notes = [];
                property.notes.push({
                    text: transcription,
                    type: 'voice',
                    timestamp: new Date().toISOString()
                });
                this.showToast('Voice note added (demo mode)', 'info');
            }
            
            // Update UI if this is the selected property
            if (this.selectedProperty?.id === property.id) {
                this.selectedProperty = { ...property };
            }
        },
        
        showToast(message, type = 'info') {
            const toast = {
                id: Date.now(),
                message,
                type
            };
            this.toasts.push(toast);
            
            setTimeout(() => {
                this.toasts = this.toasts.filter(t => t.id !== toast.id);
            }, 3000);
        },
        
        // Utility functions
        formatCurrency(amount) {
            if (!amount) return 'N/A';
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: 0
            }).format(amount);
        },
        
        // Mobile helper functions
        vibrate(pattern) {
            // Haptic feedback for mobile devices
            if (navigator.vibrate) {
                navigator.vibrate(pattern);
            }
        },
        
        isIOS() {
            return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        },
        
        isMobile() {
            return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        },
        
        // Map control functions
        jumpToAddress() {
            const address = document.getElementById('addressSearch').value;
            if (address && window.mapController) {
                window.mapController.jumpToAddress(address);
                this.showToast(`🗺️ Searching for: ${address}`, 'info');
            }
        },
        
        toggle3D() {
            if (window.mapController) {
                window.mapController.toggle3DView();
                this.showToast('🏢 Toggled 3D view', 'info');
            }
        },
        
        toggleLight() {
            if (window.mapController) {
                const result = window.mapController.toggleLightPreset();
                if (result) {
                    this.currentLight = result.label;
                    this.currentLightIcon = result.icon;
                    this.currentLightIndex = window.mapController.currentLightIndex;
                    this.showToast(`${result.icon} Light set to ${result.label}`, 'success');
                }
            }
        },
        
        // Listen for light changes from map controller
        setupLightListener() {
            window.addEventListener('lightChanged', (event) => {
                const { icon, label, index } = event.detail;
                this.currentLight = label;
                this.currentLightIcon = icon;
                this.currentLightIndex = index;
            });
        },
        
        // Filter functions
        toggleAbsenteeFilter() {
            this.filters.absenteeOnly = !this.filters.absenteeOnly;
            this.applyFilters();
            const status = this.filters.absenteeOnly ? 'enabled' : 'disabled';
            this.showToast(`🏠 Absentee filter ${status}`, 'info');
        },
        
        // Hot list counter
        get hotListCount() {
            return this.hotList.length;
        }
    }));
});