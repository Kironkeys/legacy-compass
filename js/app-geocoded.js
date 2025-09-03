/**
 * Legacy Compass - Main Application with Real Geocoded Data
 * Uses Jeff & Anna's 7,140 properties with actual coordinates
 */

document.addEventListener('alpine:init', () => {
    Alpine.data('legacyCompass', () => ({
        // Core data
        properties: [],
        filteredProperties: [],
        selectedProperty: null,
        
        // UI state
        loading: true,
        loadingMessage: 'Initializing Legacy Compass...',
        mapReady: false,
        sidebarOpen: true,
        detailsOpen: false,
        
        // Filters
        searchQuery: '',
        filters: {
            absenteeOnly: false,
            minBedrooms: 0,
            minBathrooms: 0,
            yearBuiltMin: 0,
            minPrice: 0,
            maxPrice: 0
        },
        
        // Statistics
        stats: {
            total: 0,
            absentee: 0,
            withCoords: 0,
            avgPrice: 0,
            avgSqft: 0
        },
        
        // Map reference
        map: null,
        markers: null,
        
        async init() {
            console.log('🚀 Legacy Compass initializing with geocoded data...');
            
            // Load smart CSV loader
            await this.loadScript('/js/smart-csv-loader.js');
            
            // Initialize map
            await this.initMap();
            
            // Load Jeff & Anna's geocoded data
            await this.loadGeocodedData();
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Apply initial filters
            this.applyFilters();
            
            this.loading = false;
        },
        
        async loadScript(src) {
            return new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = src;
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        },
        
        async loadGeocodedData() {
            try {
                this.loadingMessage = 'Loading Jeff & Anna\'s territory (7,140 properties)...';
                
                // Fetch the geocoded CSV
                const response = await fetch('/jeff_annaFarm.csv');
                const csvText = await response.text();
                
                // Parse with smart loader
                const loader = new SmartCSVLoader();
                const result = await loader.parseCSV(csvText, 'jeff_anna_farm', (progress) => {
                    this.loadingMessage = `Loading properties: ${progress.percent}%`;
                });
                
                this.properties = result.properties;
                console.log(`✅ Loaded ${result.totalCount} properties with coordinates!`);
                
                // Update stats
                this.updateStats();
                
                // Add to map
                this.addPropertiesToMap();
                
            } catch (error) {
                console.error('Failed to load geocoded data:', error);
                this.showToast('Failed to load property data', 'error');
            }
        },
        
        async initMap() {
            // Wait for Mapbox to be ready
            if (!window.mapboxgl) {
                console.error('Mapbox GL JS not loaded');
                return;
            }
            
            mapboxgl.accessToken = window.CONFIG.MAPBOX_TOKEN;
            
            this.map = new mapboxgl.Map({
                container: 'map',
                style: 'mapbox://styles/mapbox/satellite-streets-v12',
                center: [-122.0808, 37.6688], // Hayward center
                zoom: 13,
                pitch: 0,
                bearing: 0
            });
            
            // Add navigation controls
            this.map.addControl(new mapboxgl.NavigationControl(), 'top-right');
            
            // Add search control
            this.map.addControl(
                new MapboxGeocoder({
                    accessToken: mapboxgl.accessToken,
                    mapboxgl: mapboxgl,
                    placeholder: 'Search address...',
                    bbox: [-122.2, 37.5, -121.9, 37.8], // Hayward area
                    proximity: {
                        longitude: -122.0808,
                        latitude: 37.6688
                    }
                }),
                'top-left'
            );
            
            // Wait for map to load
            await new Promise(resolve => {
                this.map.on('load', () => {
                    this.mapReady = true;
                    resolve();
                });
            });
        },
        
        addPropertiesToMap() {
            if (!this.mapReady) return;
            
            // Filter properties with valid coordinates
            const validProperties = this.filteredProperties.filter(p => p.lat && p.lng);
            
            // Create GeoJSON
            const geojson = {
                type: 'FeatureCollection',
                features: validProperties.map(p => ({
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: [p.lng, p.lat]
                    },
                    properties: {
                        id: p.id,
                        address: p.address,
                        owner: p.ownerName,
                        isAbsentee: p.isAbsentee,
                        bedrooms: p.bedrooms,
                        bathrooms: p.bathrooms,
                        squareFeet: p.squareFeet,
                        yearBuilt: p.yearBuilt,
                        price: p.purchasePrice
                    }
                }))
            };
            
            // Remove existing source/layer if exists
            if (this.map.getSource('properties')) {
                this.map.removeLayer('property-circles');
                this.map.removeLayer('property-labels');
                this.map.removeSource('properties');
            }
            
            // Add source
            this.map.addSource('properties', {
                type: 'geojson',
                data: geojson,
                cluster: true,
                clusterMaxZoom: 14,
                clusterRadius: 50
            });
            
            // Add clustered circles
            this.map.addLayer({
                id: 'clusters',
                type: 'circle',
                source: 'properties',
                filter: ['has', 'point_count'],
                paint: {
                    'circle-color': [
                        'step',
                        ['get', 'point_count'],
                        '#51bbd6',
                        10,
                        '#f1f075',
                        50,
                        '#f28cb1'
                    ],
                    'circle-radius': [
                        'step',
                        ['get', 'point_count'],
                        20,
                        10,
                        30,
                        50,
                        40
                    ]
                }
            });
            
            // Add cluster count labels
            this.map.addLayer({
                id: 'cluster-count',
                type: 'symbol',
                source: 'properties',
                filter: ['has', 'point_count'],
                layout: {
                    'text-field': '{point_count_abbreviated}',
                    'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
                    'text-size': 12
                }
            });
            
            // Add individual property circles
            this.map.addLayer({
                id: 'property-circles',
                type: 'circle',
                source: 'properties',
                filter: ['!', ['has', 'point_count']],
                paint: {
                    'circle-color': [
                        'case',
                        ['get', 'isAbsentee'],
                        '#ff6b6b', // Red for absentee
                        '#4ecdc4'  // Teal for owner-occupied
                    ],
                    'circle-radius': 8,
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#fff'
                }
            });
            
            // Add click handler
            this.map.on('click', 'property-circles', (e) => {
                const properties = e.features[0].properties;
                this.selectPropertyFromMap(properties.id);
            });
            
            // Change cursor on hover
            this.map.on('mouseenter', 'property-circles', () => {
                this.map.getCanvas().style.cursor = 'pointer';
            });
            
            this.map.on('mouseleave', 'property-circles', () => {
                this.map.getCanvas().style.cursor = '';
            });
            
            // Zoom on cluster click
            this.map.on('click', 'clusters', (e) => {
                const features = this.map.queryRenderedFeatures(e.point, {
                    layers: ['clusters']
                });
                const clusterId = features[0].properties.cluster_id;
                this.map.getSource('properties').getClusterExpansionZoom(
                    clusterId,
                    (err, zoom) => {
                        if (err) return;
                        
                        this.map.easeTo({
                            center: features[0].geometry.coordinates,
                            zoom: zoom
                        });
                    }
                );
            });
        },
        
        applyFilters() {
            // Apply all filters
            this.filteredProperties = this.properties.filter(property => {
                // Search filter
                if (this.searchQuery) {
                    const search = this.searchQuery.toLowerCase();
                    const matchAddress = property.address?.toLowerCase().includes(search);
                    const matchOwner = property.ownerName?.toLowerCase().includes(search);
                    if (!matchAddress && !matchOwner) return false;
                }
                
                // Absentee filter
                if (this.filters.absenteeOnly && !property.isAbsentee) {
                    return false;
                }
                
                // Bedrooms filter
                if (this.filters.minBedrooms > 0 && property.bedrooms < this.filters.minBedrooms) {
                    return false;
                }
                
                // Bathrooms filter
                if (this.filters.minBathrooms > 0 && property.bathrooms < this.filters.minBathrooms) {
                    return false;
                }
                
                // Year built filter
                if (this.filters.yearBuiltMin > 0 && property.yearBuilt < this.filters.yearBuiltMin) {
                    return false;
                }
                
                // Price filters
                if (this.filters.minPrice > 0 && property.purchasePrice < this.filters.minPrice) {
                    return false;
                }
                if (this.filters.maxPrice > 0 && property.purchasePrice > this.filters.maxPrice) {
                    return false;
                }
                
                return true;
            });
            
            // Update map
            this.addPropertiesToMap();
            
            // Update stats
            this.updateStats();
        },
        
        updateStats() {
            const total = this.filteredProperties.length;
            const absenteeCount = this.filteredProperties.filter(p => p.isAbsentee).length;
            const withCoords = this.filteredProperties.filter(p => p.lat && p.lng).length;
            
            const pricesAvailable = this.filteredProperties.filter(p => p.purchasePrice > 0);
            const avgPrice = pricesAvailable.length > 0 
                ? pricesAvailable.reduce((sum, p) => sum + p.purchasePrice, 0) / pricesAvailable.length
                : 0;
            
            const sqftAvailable = this.filteredProperties.filter(p => p.squareFeet > 0);
            const avgSqft = sqftAvailable.length > 0
                ? sqftAvailable.reduce((sum, p) => sum + p.squareFeet, 0) / sqftAvailable.length
                : 0;
            
            this.stats = {
                total,
                absentee: total > 0 ? Math.round((absenteeCount / total) * 100) : 0,
                withCoords,
                avgPrice: Math.round(avgPrice),
                avgSqft: Math.round(avgSqft)
            };
        },
        
        selectProperty(property) {
            this.selectedProperty = property;
            this.detailsOpen = true;
            
            // Fly to property on map
            if (property.lat && property.lng && this.map) {
                this.map.flyTo({
                    center: [property.lng, property.lat],
                    zoom: 18,
                    pitch: 45,
                    bearing: -17.6,
                    duration: 2000
                });
            }
        },
        
        selectPropertyFromMap(propertyId) {
            const property = this.properties.find(p => p.id === propertyId);
            if (property) {
                this.selectProperty(property);
            }
        },
        
        closeDetails() {
            this.selectedProperty = null;
            this.detailsOpen = false;
        },
        
        setupEventListeners() {
            // Search on input
            this.$watch('searchQuery', () => {
                this.applyFilters();
            });
            
            // Watch all filters
            this.$watch('filters', () => {
                this.applyFilters();
            }, { deep: true });
        },
        
        formatCurrency(value) {
            if (!value) return 'N/A';
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                maximumFractionDigits: 0
            }).format(value);
        },
        
        formatNumber(value) {
            if (!value) return 'N/A';
            return new Intl.NumberFormat('en-US').format(value);
        },
        
        exportData() {
            const dataStr = JSON.stringify(this.filteredProperties, null, 2);
            const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
            
            const exportName = `legacy_compass_export_${Date.now()}.json`;
            const linkElement = document.createElement('a');
            linkElement.setAttribute('href', dataUri);
            linkElement.setAttribute('download', exportName);
            linkElement.click();
            
            this.showToast(`Exported ${this.filteredProperties.length} properties`);
        },
        
        showToast(message, type = 'info') {
            // Simple toast notification
            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            toast.textContent = message;
            toast.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                padding: 12px 24px;
                background: ${type === 'error' ? '#ef4444' : '#10b981'};
                color: white;
                border-radius: 8px;
                z-index: 9999;
                animation: slideIn 0.3s ease;
            `;
            document.body.appendChild(toast);
            
            setTimeout(() => {
                toast.remove();
            }, 3000);
        }
    }));
});