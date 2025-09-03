/**
 * Legacy Compass - Simple App Controller
 * Works with Alpine.js for reactivity
 */

// Alpine.js component
document.addEventListener('alpine:init', () => {
    Alpine.data('legacyCompass', () => ({
        // State
        properties: [],
        filteredProperties: [],
        selectedProperty: null,
        isLoading: false,
        isRecording: false,
        showCSVModal: false,
        
        // Filters
        filters: {
            search: '',
            equityMin: 0,
            absenteeOnly: false,
            tags: []
        },
        
        // Stats
        stats: {
            total: 0,
            absentee: 0,
            avgEquity: 0
        },
        
        // Lists
        hotList: [],
        toasts: [],
        
        // Settings
        territory: 'Hayward',
        addressSearch: '', // For map address search only
        
        // Initialize
        async init() {
            console.log('🚀 Legacy Compass initializing...');
            this.isLoading = true;
            
            // Load properties
            await this.loadProperties();
            
            // Initialize map after properties load
            setTimeout(() => {
                if (window.mapController) {
                    window.mapController.loadProperties();
                }
            }, 1000);
            
            this.isLoading = false;
        },
        
        // Load properties from real CSV data
        async loadProperties() {
            try {
                this.isLoading = true;
                this.loadingMessage = 'Loading 68k Hayward properties...';
                
                // Load real data from CSV
                const properties = await window.dataLoader.loadHaywardData((current, total) => {
                    // Update loading progress
                    const percent = Math.round((current / total) * 100);
                    this.loadingMessage = `Loading properties... ${percent}%`;
                });
                
                this.properties = properties;
                console.log(`🏠 Loaded ${this.properties.length} REAL Hayward properties!`);
                
                // Limit display for performance - show first 1000 only
                this.filteredProperties = this.properties.slice(0, 1000);
                this.updateStats();
                
                // Update map with limited set for performance
                if (window.mapController) {
                    // Only show 1000 on map to prevent browser freeze
                    window.mapController.updateMarkers(this.filteredProperties);
                }
                
                this.showToast(`Loaded ${this.properties.length.toLocaleString()} properties!`, 'success');
                
            } catch (error) {
                console.error('Failed to load properties:', error);
                this.showToast('Failed to load property data', 'error');
            } finally {
                this.isLoading = false;
            }
        },
        
        // Generate sample properties
        generateSampleProperties() {
            const streets = ['Main St', 'Oak Ave', 'Elm Dr', 'Park Ln', 'First St', 'Mission Blvd', 'Foothill Blvd', 'Jackson St', 'A St', 'B St'];
            const firstNames = ['John', 'Maria', 'James', 'Linda', 'Robert', 'Patricia', 'Michael', 'Jennifer', 'David', 'Lisa'];
            const lastNames = ['Smith', 'Garcia', 'Johnson', 'Brown', 'Martinez', 'Davis', 'Wilson', 'Anderson', 'Lee', 'Taylor'];
            
            const properties = [];
            for (let i = 0; i < 500; i++) {
                const isAbsentee = Math.random() > 0.7;
                const equity = Math.floor(Math.random() * 100);
                
                properties.push({
                    id: `prop_${i}`,
                    address: `${1000 + Math.floor(Math.random() * 30000)} ${streets[i % streets.length]}`,
                    coordinates: {
                        lat: 37.6688 + (Math.random() - 0.5) * 0.15,
                        lng: -122.0808 + (Math.random() - 0.5) * 0.15
                    },
                    owner: {
                        name: `${firstNames[i % firstNames.length]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`,
                        type: isAbsentee ? 'absentee' : 'owner_occupied',
                        phone: isAbsentee ? `(${Math.floor(Math.random() * 900) + 100}) ${Math.floor(Math.random() * 900) + 100}-${Math.floor(Math.random() * 9000) + 1000}` : null,
                        email: Math.random() > 0.5 ? `contact${i}@email.com` : null
                    },
                    property: {
                        beds: Math.floor(Math.random() * 4) + 1,
                        baths: Math.floor(Math.random() * 3) + 1,
                        sqft: 800 + Math.floor(Math.random() * 2500),
                        lot: 3000 + Math.floor(Math.random() * 7000),
                        year: 1950 + Math.floor(Math.random() * 70)
                    },
                    financial: {
                        equity: equity,
                        value: 400000 + Math.floor(Math.random() * 600000),
                        lastSale: {
                            date: `${1990 + Math.floor(Math.random() * 30)}-01-15`,
                            price: 100000 + Math.floor(Math.random() * 300000)
                        }
                    },
                    activity: {
                        status: equity > 70 ? 'hot' : (equity > 40 ? 'warm' : 'cold'),
                        tags: equity > 70 ? ['high-equity'] : [],
                        notes: []
                    }
                });
            }
            
            return properties;
        },
        
        // Apply filters using data loader
        applyFilters() {
            if (!window.dataLoader.loaded) return;
            
            // Use data loader's filter method
            const filtered = window.dataLoader.filterProperties(this.filters);
            
            // Store all filtered for map
            this.filteredProperties = filtered;
            
            // Update stats based on ALL filtered properties
            const stats = window.dataLoader.getStats(filtered);
            this.stats = stats;
            
            this.updateStats();
            
            // Update map with ALL filtered properties
            if (window.mapController) {
                window.mapController.updateMarkers(filtered);
            }
            
            // Show count
            this.showToast(`Showing ${filtered.length.toLocaleString()} properties on map`, 'info');
        },
        
        // Update statistics
        updateStats() {
            this.stats.total = this.filteredProperties.length;
            
            const absenteeCount = this.filteredProperties.filter(p => p.owner?.type === 'absentee').length;
            this.stats.absentee = this.stats.total > 0 ? Math.round((absenteeCount / this.stats.total) * 100) : 0;
            
            const totalEquity = this.filteredProperties.reduce((sum, p) => sum + (p.financial?.equity || 0), 0);
            this.stats.avgEquity = this.stats.total > 0 ? Math.round(totalEquity / this.stats.total) : 0;
        },
        
        // Select property and focus map
        selectProperty(property) {
            this.selectedProperty = property;
            
            // Focus the main map on this property
            if (window.mapController && property.coordinates) {
                window.mapController.focusOnProperty(property);
            }
            
            // Scroll to top to see the detail panel
            document.getElementById('propertyList').scrollTop = 0;
        },
        
        // Focus on selected property  
        focusOnProperty() {
            if (this.selectedProperty && window.mapController) {
                // Focus the map on the property with satellite view
                window.mapController.focusOnProperty(this.selectedProperty);
                
                // Scroll to map if on mobile
                if (window.innerWidth < 768) {
                    document.getElementById('map').scrollIntoView({ behavior: 'smooth' });
                }
            }
        },
        
        // Quick actions
        callProperty(property) {
            if (property.owner?.phone) {
                window.location.href = `tel:${property.owner.phone}`;
            } else {
                this.showToast('No phone number available', 'error');
            }
        },
        
        textProperty(property) {
            if (property.owner?.phone) {
                window.location.href = `sms:${property.owner.phone}`;
            } else {
                this.showToast('No phone number available', 'error');
            }
        },
        
        emailProperty(property) {
            if (property.owner?.email) {
                window.location.href = `mailto:${property.owner.email}`;
            } else {
                this.showToast('No email available', 'error');
            }
        },
        
        routeToProperty(property) {
            if (property.coordinates) {
                const url = `https://www.google.com/maps/dir/?api=1&destination=${property.coordinates.lat},${property.coordinates.lng}`;
                window.open(url, '_blank');
            }
        },
        
        // Hot list management
        toggleHotList(property) {
            const index = this.hotList.findIndex(p => p.id === property.id);
            if (index > -1) {
                this.hotList.splice(index, 1);
                this.showToast('Removed from hot list', 'success');
            } else {
                this.hotList.push(property);
                this.showToast('Added to hot list', 'success');
            }
        },
        
        isInHotList(property) {
            return this.hotList.some(p => p.id === property.id);
        },
        
        // Voice recording
        startVoiceNote() {
            this.isRecording = !this.isRecording;
            if (this.isRecording) {
                // Start recording logic
                this.showToast('Recording started...', 'success');
            } else {
                // Stop recording logic
                this.showToast('Recording saved', 'success');
            }
        },
        
        // CSV Upload
        showCSVUpload() {
            this.showCSVModal = true;
        },
        
        handleFileDrop(event) {
            const file = event.dataTransfer.files[0];
            if (file && file.type === 'text/csv') {
                this.processCSV(file);
            }
        },
        
        handleFileSelect(event) {
            const file = event.target.files[0];
            if (file) {
                this.processCSV(file);
            }
        },
        
        processCSV(file) {
            // CSV processing logic here
            this.showToast(`Processing ${file.name}...`, 'success');
            this.showCSVModal = false;
        },
        
        // Export data
        exportData() {
            const dataStr = JSON.stringify(this.filteredProperties, null, 2);
            const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
            
            const exportFileDefaultName = `legacy_compass_export_${Date.now()}.json`;
            
            const linkElement = document.createElement('a');
            linkElement.setAttribute('href', dataUri);
            linkElement.setAttribute('download', exportFileDefaultName);
            linkElement.click();
            
            this.showToast('Data exported', 'success');
        },
        
        // Show hot list
        showHotList() {
            this.filteredProperties = this.hotList;
            this.updateStats();
            this.showToast(`Showing ${this.hotList.length} hot properties`, 'success');
        },
        
        // Load Jeff & Anna's Farm
        async loadJeffAnnaFarm() {
            try {
                this.isLoading = true;
                this.showToast('🚜 Loading Jeff & Anna\'s MASSIVE 7,140 property farm...', 'info');
                
                // Load the farm CSV with performance limits
                const farmProperties = await window.farmLoader.loadFarmCSV('/jeff_annaFarm.csv', {
                    limit: 500,  // Load 500 for smooth performance
                    progressive: true
                });
                
                // Replace current properties with farm data
                this.properties = farmProperties;
                this.filteredProperties = farmProperties;
                
                // Get farm statistics
                const stats = window.farmLoader.getFarmStats();
                
                // Update UI with farm stats
                this.stats.total = stats.total;
                this.stats.absentee = stats.absenteePercent;
                this.stats.avgEquity = stats.avgEquity;
                
                // Update map with farm properties (they have real coordinates!)
                if (window.mapController) {
                    // Convert to map format
                    const mapData = farmProperties.map(p => ({
                        ...p,
                        owner: {
                            ...p.owner,
                            name: p.owner.fullName,
                            phone: p.owner.phone || null,
                            email: p.owner.email || null
                        }
                    }));
                    window.mapController.updateMarkers(mapData);
                    
                    // Zoom to farm area
                    if (farmProperties.length > 0) {
                        const bounds = new mapboxgl.LngLatBounds();
                        farmProperties.forEach(p => {
                            if (p.coordinates.lat && p.coordinates.lng) {
                                bounds.extend([p.coordinates.lng, p.coordinates.lat]);
                            }
                        });
                        window.mapController.map.fitBounds(bounds, { padding: 50 });
                    }
                }
                
                // Show success with rich stats
                const hotOpps = window.farmLoader.getHotOpportunities();
                const totalInFarm = window.farmLoader.totalInFarm || stats.total;
                
                if (totalInFarm > stats.total) {
                    this.showToast(
                        `✅ Loaded ${stats.total} of ${totalInFarm.toLocaleString()} properties! ` +
                        `${stats.absenteePercent}% absentee, ` +
                        `$${(stats.totalEquityDollars / 1000000).toFixed(1)}M equity in sample, ` +
                        `${hotOpps.length} HOT opportunities!`, 
                        'success'
                    );
                } else {
                    this.showToast(
                        `✅ Loaded ${stats.total} properties! ${stats.absenteePercent}% absentee, ` +
                        `$${(stats.totalEquityDollars / 1000000).toFixed(1)}M total equity, ` +
                        `${hotOpps.length} HOT opportunities!`, 
                        'success'
                    );
                }
                
                // Update territory badge
                this.territory = 'Jeff & Anna Farm';
                
                this.isLoading = false;
                
            } catch (error) {
                console.error('Failed to load farm:', error);
                this.showToast('Failed to load farm data', 'error');
                this.isLoading = false;
            }
        },
        
        // Reset filters
        resetFilters() {
            this.filters = {
                search: '',
                equityMin: 0,
                absenteeOnly: false,
                tags: []
            };
            this.applyFilters();
        },
        
        // Toast notifications
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
        
        // AI functions (placeholders)
        generateEmail() {
            this.showToast('AI email generation coming soon!', 'info');
        },
        
        analyzeOpportunity() {
            this.showToast('AI analysis coming soon!', 'info');
        },
        
        suggestStrategy() {
            this.showToast('AI strategy coming soon!', 'info');
        },
        
        handleAIQuery(query) {
            this.showToast('AI assistant coming soon!', 'info');
        },
        
        // Map controls
        goToFarmView() {
            // Return to full farm view
            window.mapController?.goToFarmView();
            this.showToast('Returning to farm view', 'success');
        },
        
        toggleVisualization() {
            window.mapController?.toggleVisualization();
        },
        
        toggleSatellite() {
            window.mapController?.toggleSatellite();
        },
        
        toggleHeatmap() {
            window.mapController?.toggleHeatmap();
        },
        
        drawTerritory() {
            this.showToast('Territory drawing coming soon!', 'info');
        },
        
        toggleStreetView() {
            window.mapController?.toggleStreetView();
        },
        
        openGoogleStreetView() {
            window.mapController?.openGoogleStreetView();
        },
        
        getCurrentLocation() {
            window.mapController?.getCurrentLocation();
        },
        
        // Search for an address using Mapbox Geocoding API
        async searchAddress() {
            if (!this.addressSearch || this.addressSearch.trim() === '') {
                this.showToast('Please enter an address', 'error');
                return;
            }
            
            const query = encodeURIComponent(this.addressSearch);
            const token = window.CONFIG?.MAPBOX_TOKEN;
            
            if (!token) {
                this.showToast('Mapbox token not configured', 'error');
                return;
            }
            
            try {
                // Use Mapbox Geocoding API
                const response = await fetch(
                    `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?` +
                    `access_token=${token}&` +
                    `proximity=-122.0808,37.6688&` + // Bias results to Hayward area
                    `bbox=-122.2,37.5,-121.9,37.8&` + // Bounding box for Bay Area
                    `types=address&` +
                    `limit=1`
                );
                
                if (!response.ok) {
                    throw new Error('Geocoding failed');
                }
                
                const data = await response.json();
                
                if (data.features && data.features.length > 0) {
                    const result = data.features[0];
                    const [lng, lat] = result.center;
                    
                    // Fly to the location on the map
                    if (window.mapController) {
                        window.mapController.flyToLocation(lng, lat);
                        
                        // Add a temporary marker for the searched address
                        window.mapController.addSearchMarker(lng, lat, result.place_name);
                    }
                    
                    this.showToast(`Found: ${result.place_name}`, 'success');
                    
                    // Clear the search after successful find
                    setTimeout(() => {
                        this.addressSearch = '';
                    }, 1000);
                } else {
                    this.showToast('Address not found. Try a more specific search.', 'error');
                }
            } catch (error) {
                console.error('Address search error:', error);
                this.showToast('Failed to search address', 'error');
            }
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
        
        formatSale(lastSale) {
            if (!lastSale) return 'N/A';
            return `${this.formatCurrency(lastSale.price)} (${lastSale.date})`;
        }
    }));
});

// Make app globally available
window.app = Alpine.data('legacyCompass');

// === Premium 3D Mapbox Enhancements (injected by Keyz) ===
(function enhanceMapbox3D(map){
  try {
    if (!map) return;
    map.on('style.load', () => {
      if (!map.getSource('mapbox-dem')) {
        map.addSource('mapbox-dem', { type: 'raster-dem', url: 'mapbox://mapbox.terrain-rgb', tileSize: 512 });
      }
      map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.45 });
      map.setFog({
        color: "rgb(186,210,235)", "high-color": "rgb(36,92,223)", "horizon-blend": 0.2,
        "space-color": "rgb(11,11,25)", "star-intensity": 0.15
      });
      if (!map.getLayer('sky')) {
        map.addLayer({ id: 'sky', type: 'sky',
          paint: { "sky-type": "atmosphere", "sky-atmosphere-sun-intensity": 15 } });
      }
      if (!map.getSource('satellite')) {
        map.addSource('satellite', { type: 'raster', url: 'mapbox://mapbox.satellite', tileSize: 256 });
      }
      if (!map.getLayer('satellite-base')) {
        const before = map.getStyle().layers.find(l => l.id.includes('road-label'))?.id || undefined;
        map.addLayer({ id: 'satellite-base', type: 'raster', source: 'satellite',
                       paint: { 'raster-opacity': 0.85 } }, before);
      }
      // Label polish
      map.getStyle().layers.forEach(l => {
        if (l.type === 'symbol' && l.layout && l.layout['text-field']) {
          map.setPaintProperty(l.id, 'text-halo-color', '#0b0b0b');
          map.setPaintProperty(l.id, 'text-halo-width', 1.2);
          map.setPaintProperty(l.id, 'text-color', '#ffffff');
        }
      });
      // Optional: declutter POIs
      ['poi-label','airport-label'].forEach(id => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none'); });
    });
    // Ambient rotate
    let _spin = true;
    function spin() {
      if (!_spin) return;
      const b = (map.getBearing() - 0.03) % 360;
      map.setBearing(b);
      requestAnimationFrame(spin);
    }
    map.on('load', spin);
    // Expose a helper
    map.focusProperty = function(lon, lat){
      map.flyTo({ center: [lon, lat], zoom: 17.2, pitch: 68, bearing: -35, speed: 0.6, curve: 1.4, essential: true });
    };
    console.log('[Keyz] 3D enhancements applied.');
  } catch(e){ console.warn('[Keyz] 3D enhance error', e); }
})(window.__legacyMapInstance || window.map || undefined);
// === End inject ===
