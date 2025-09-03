/**
 * Legacy Compass Map Controller - COMPLETELY REWRITTEN
 * Using EXACT same approach as working mini map
 */

class MapController {
    constructor() {
        this.map = null;
        this.markers = [];
        this.farmBounds = null;
    }
    
    async initialize() {
        try {
            mapboxgl.accessToken = window.CONFIG?.MAPBOX_TOKEN;
            
            if (!mapboxgl.accessToken) {
                console.error('❌ Mapbox token not configured');
                return;
            }
            
            // USE MAPBOX STANDARD - THE BEAUTIFUL DEFAULT STYLE
            this.map = new mapboxgl.Map({
                container: 'map',
                style: 'mapbox://styles/mapbox/standard',  // Beautiful 3D default style!
                center: [-122.0808, 37.6688],
                zoom: 13,
                pitch: 60,
                bearing: -20,
                interactive: true,
                attributionControl: false,
                maxPitch: 85,
                config: {
                    // Set lighting for best visual effect
                    lightPreset: 'dusk'  // Options: 'dawn', 'day', 'dusk', 'night'
                }
            });
            
            // Add navigation controls with pitch
            this.map.addControl(new mapboxgl.NavigationControl({
                showCompass: true,
                showZoom: true,
                visualizePitch: true
            }), 'top-left');
            
            // Add light control PROPERLY positioned
            this.addMapControls();
            
            // COPY EXACT MINI MAP 3D SETUP
            this.map.on('load', () => {
                console.log('✅ Map loaded - adding 3D');
                
                // FORCE PITCH IMMEDIATELY
                this.map.setPitch(60);
                this.map.setBearing(-20);
                
                // Add 3D terrain - USE SAME SOURCE AS WORKING MINI MAP!
                try {
                    this.map.addSource('mapbox-dem', {
                        type: 'raster-dem',
                        url: 'mapbox://mapbox.terrain-rgb',  // SAME AS MINI MAP!
                        tileSize: 512,
                        maxzoom: 14
                    });
                    console.log('✅ Terrain source added');
                    
                    this.map.setTerrain({ 
                        source: 'mapbox-dem', 
                        exaggeration: 2.0  // Increase for more dramatic 3D (1.0 = realistic, 2.0+ = exaggerated)
                    });
                    console.log('✅ Terrain enabled with 1.5x exaggeration');
                } catch (err) {
                    console.error('❌ Failed to add terrain:', err);
                }
                
                // Add 3D buildings with SOLID appearance
                this.map.addLayer({
                    'id': '3d-buildings',
                    'source': 'composite',
                    'source-layer': 'building',
                    'filter': ['==', 'extrude', 'true'],
                    'type': 'fill-extrusion',
                    'minzoom': 15,
                    'paint': {
                        'fill-extrusion-color': [
                            'interpolate',
                            ['linear'],
                            ['get', 'height'],
                            0, '#ddd',
                            200, '#aaa'
                        ],
                        'fill-extrusion-height': ['get', 'height'],
                        'fill-extrusion-base': ['get', 'min_height'],
                        'fill-extrusion-opacity': 1.0  // SOLID, not transparent!
                    }
                });
                
                // FORCE PITCH AGAIN AFTER TERRAIN LOADS
                setTimeout(() => {
                    this.map.setPitch(60);
                    this.map.setBearing(-20);
                    console.log('✅ Forced 3D pitch to 60°');
                }, 500);
                
                console.log('✅ 3D features added');
            });
            
        } catch (error) {
            console.error('Failed to initialize map:', error);
        }
    }
    
    // Load farm properties
    loadFarmProperties(properties) {
        console.log(`🗺️ Loading ${properties.length} properties`);
        
        // Check for coordinate diversity (useful for debugging)
        const uniqueCoords = new Set();
        properties.forEach(p => {
            uniqueCoords.add(`${p.coordinates.lat.toFixed(6)},${p.coordinates.lng.toFixed(6)}`);
        });
        console.log(`📊 Properties mapped to ${uniqueCoords.size} unique locations`);
        
        // Clear existing
        this.clearMarkers();
        
        // Create GeoJSON
        const geojson = {
            type: 'FeatureCollection',
            features: properties.map(p => ({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [p.coordinates.lng, p.coordinates.lat]
                },
                properties: {
                    id: p.id,
                    address: p.address,
                    owner: p.owner.fullName,
                    equity: p.financial.equity,
                    isAbsentee: p.owner.type === 'absentee',
                    equityDollars: p.financial.equityDollars
                }
            }))
        };
        
        // Add source
        if (this.map.getSource('properties')) {
            this.map.getSource('properties').setData(geojson);
        } else {
            this.map.addSource('properties', {
                type: 'geojson',
                data: geojson,
                cluster: true,
                clusterMaxZoom: 14,
                clusterRadius: 50
            });
            
            // Clusters
            this.map.addLayer({
                id: 'clusters',
                type: 'circle',
                source: 'properties',
                filter: ['has', 'point_count'],
                paint: {
                    'circle-color': '#ff9500',
                    'circle-radius': [
                        'step', ['get', 'point_count'],
                        20, 10, 30, 20, 40
                    ],
                    'circle-stroke-width': 3,
                    'circle-stroke-color': '#ffffff',
                    'circle-opacity': 1
                }
            });
            
            // Cluster count
            this.map.addLayer({
                id: 'cluster-count',
                type: 'symbol',
                source: 'properties',
                filter: ['has', 'point_count'],
                layout: {
                    'text-field': '{point_count_abbreviated}',
                    'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
                    'text-size': 12
                },
                paint: {
                    'text-color': '#ffffff'
                }
            });
            
            // Points - BRIGHT YELLOW for maximum visibility
            this.map.addLayer({
                id: 'unclustered-point',
                type: 'circle',
                source: 'properties',
                filter: ['!', ['has', 'point_count']],
                paint: {
                    'circle-color': '#FFFF00',  // BRIGHT YELLOW
                    'circle-radius': 12,
                    'circle-stroke-width': 4,
                    'circle-stroke-color': '#FF0000',  // RED border
                    'circle-stroke-opacity': 1,
                    'circle-opacity': 1
                }
            });
            
            // Click handler
            this.map.on('click', 'unclustered-point', (e) => {
                this.showPropertyPopup(e.features[0]);
                const event = new CustomEvent('property-clicked', {
                    detail: e.features[0].properties
                });
                window.dispatchEvent(event);
            });
            
            // Hover
            this.map.on('mouseenter', 'unclustered-point', () => {
                this.map.getCanvas().style.cursor = 'pointer';
            });
            
            this.map.on('mouseleave', 'unclustered-point', () => {
                this.map.getCanvas().style.cursor = '';
            });
            
            // Cluster zoom
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
        }
        
        // Fit bounds WITH 3D
        const bounds = new mapboxgl.LngLatBounds();
        properties.forEach(p => {
            if (p.coordinates.lat && p.coordinates.lng) {
                bounds.extend([p.coordinates.lng, p.coordinates.lat]);
            }
        });
        
        this.farmBounds = bounds;
        this.map.fitBounds(bounds, { 
            padding: 50, 
            duration: 1000,
            pitch: 60,  // KEEP HIGH PITCH
            bearing: -20
        });
    }
    
    // Update markers with filtered properties
    updateMarkers(properties) {
        if (!this.map || !properties) return;
        
        console.log(`🔄 Updating map with ${properties.length} filtered properties`);
        
        // Create GeoJSON from filtered properties
        const geojson = {
            type: 'FeatureCollection',
            features: properties.map(p => ({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [p.coordinates.lng, p.coordinates.lat]
                },
                properties: {
                    id: p.id,
                    address: p.address,
                    owner: p.owner.fullName,
                    equity: p.financial?.equity || 0,
                    isAbsentee: p.owner.type === 'absentee',
                    equityDollars: p.financial?.equityDollars || 0
                }
            }))
        };
        
        // Update the source data
        if (this.map.getSource('properties')) {
            this.map.getSource('properties').setData(geojson);
        } else {
            // If source doesn't exist, load properties normally
            this.loadFarmProperties(properties);
        }
    }
    
    // Focus on property - SAME AS MINI MAP
    focusOnProperty(property) {
        if (!property.coordinates) return;
        
        this.map.flyTo({
            center: [property.coordinates.lng, property.coordinates.lat],
            zoom: 17,  // SAME AS MINI MAP
            pitch: 60,  // SAME AS MINI MAP
            bearing: -20,  // SAME AS MINI MAP
            duration: 1500
        });
        
        this.highlightProperty(property);
    }
    
    // Highlight
    highlightProperty(property) {
        if (this.map.getLayer('property-highlight')) {
            this.map.removeLayer('property-highlight');
            this.map.removeSource('property-highlight');
        }
        
        this.map.addSource('property-highlight', {
            type: 'geojson',
            data: {
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [property.coordinates.lng, property.coordinates.lat]
                }
            }
        });
        
        this.map.addLayer({
            id: 'property-highlight',
            type: 'circle',
            source: 'property-highlight',
            paint: {
                'circle-radius': 15,
                'circle-color': '#ff9500',
                'circle-stroke-width': 3,
                'circle-stroke-color': '#fff',
                'circle-opacity': 0.5
            }
        });
    }
    
    // Popup
    showPropertyPopup(feature) {
        const html = `
            <div style="padding: 10px; font-family: monospace;">
                <h3 style="margin: 0 0 10px 0; color: #ff9500;">${feature.properties.address}</h3>
                <p style="margin: 5px 0;"><strong>Owner:</strong> ${feature.properties.owner}</p>
                <p style="margin: 5px 0;"><strong>Equity:</strong> ${feature.properties.equity}%</p>
                <p style="margin: 5px 0;"><strong>Est. Equity:</strong> ${feature.properties.equityDollars}</p>
                <p style="margin: 5px 0;"><strong>Type:</strong> ${feature.properties.isAbsentee ? 'Absentee' : 'Owner Occupied'}</p>
            </div>
        `;
        
        new mapboxgl.Popup()
            .setLngLat(feature.geometry.coordinates)
            .setHTML(html)
            .addTo(this.map);
    }
    
    // Farm view
    goToFarmView() {
        if (this.farmBounds) {
            this.map.fitBounds(this.farmBounds, { 
                padding: 50, 
                duration: 1000,
                pitch: 60,
                bearing: -20
            });
        }
    }
    
    // Toggle 3D
    toggle3DView() {
        const currentPitch = this.map.getPitch();
        
        if (currentPitch < 10) {
            this.map.easeTo({
                pitch: 60,
                bearing: -20,
                duration: 1000
            });
            console.log('✅ 3D enabled');
        } else {
            this.map.easeTo({
                pitch: 0,
                bearing: 0,
                duration: 1000
            });
            console.log('✅ 2D enabled');
        }
    }
    
    // Clear markers
    clearMarkers() {
        this.markers.forEach(m => m.remove());
        this.markers = [];
        
        ['property-highlight', 'unclustered-point', 'clusters', 'cluster-count'].forEach(layer => {
            if (this.map.getLayer(layer)) {
                this.map.removeLayer(layer);
            }
        });
        
        if (this.map.getSource('properties')) {
            this.map.removeSource('properties');
        }
        if (this.map.getSource('property-highlight')) {
            this.map.removeSource('property-highlight');
        }
    }
    
    // Location
    getCurrentLocation() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    this.map.flyTo({
                        center: [position.coords.longitude, position.coords.latitude],
                        zoom: 15,
                        pitch: 60,
                        bearing: -20,
                        duration: 2000
                    });
                },
                (error) => {
                    console.error('Location error:', error);
                }
            );
        }
    }
    
    // Empty init
    initializeEmpty() {
        console.log('📍 Map ready - Load a farm to see properties');
    }
    
    // Add all custom map controls (home, pin, light)
    addMapControls() {
        // Wait for map to load
        setTimeout(() => {
            // Remove any existing custom controls
            const existingControls = document.getElementById('customMapControls');
            if (existingControls) existingControls.remove();
            
            // Create container for our controls
            const controlsContainer = document.createElement('div');
            controlsContainer.id = 'customMapControls';
            controlsContainer.style.cssText = `
                position: absolute;
                bottom: 150px;
                right: 10px;
                z-index: 1000;
                display: flex;
                flex-direction: column;
                gap: 10px;
            `;
            
            // HOME BUTTON - Show full farm view
            const homeBtn = document.createElement('button');
            homeBtn.style.cssText = `
                width: 40px;
                height: 40px;
                background: #ff9500;
                border: none;
                border-radius: 5px;
                color: white;
                cursor: pointer;
                font-size: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
            `;
            homeBtn.innerHTML = '🏠';
            homeBtn.title = 'Show full farm';
            homeBtn.onclick = () => {
                if (this.farmBounds) {
                    this.map.fitBounds(this.farmBounds, {
                        padding: 50,
                        pitch: 45,
                        bearing: 0,
                        duration: 1000
                    });
                }
            };
            
            // PIN BUTTON - Go to user location
            const pinBtn = document.createElement('button');
            pinBtn.style.cssText = `
                width: 40px;
                height: 40px;
                background: #ff9500;
                border: none;
                border-radius: 5px;
                color: white;
                cursor: pointer;
                font-size: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
            `;
            pinBtn.innerHTML = '📍';
            pinBtn.title = 'Go to my location';
            pinBtn.onclick = () => {
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                        (position) => {
                            this.map.flyTo({
                                center: [position.coords.longitude, position.coords.latitude],
                                zoom: 15,
                                pitch: 0,
                                duration: 1500
                            });
                        },
                        (error) => {
                            console.error('Error getting location:', error);
                        }
                    );
                }
            };
            
            // LIGHT TOGGLE BUTTON
            const lightBtn = document.createElement('button');
            lightBtn.style.cssText = `
                width: 40px;
                height: 40px;
                background: #ff9500;
                border: none;
                border-radius: 5px;
                color: white;
                cursor: pointer;
                font-size: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
            `;
            
            const presets = ['dawn', 'day', 'dusk', 'night'];
            const icons = ['🌄', '☀️', '🌅', '🌙'];
            let currentIndex = 2; // Start with dusk
            window.currentLightPreset = presets[currentIndex];
            
            lightBtn.innerHTML = icons[currentIndex];
            lightBtn.title = 'Change lighting';
            lightBtn.onclick = () => {
                currentIndex = (currentIndex + 1) % presets.length;
                const preset = presets[currentIndex];
                lightBtn.innerHTML = icons[currentIndex];
                window.currentLightPreset = preset;
                
                // Apply to both maps
                this.map.setConfigProperty('basemap', 'lightPreset', preset);
                if (window.miniMapInstance) {
                    window.miniMapInstance.setConfigProperty('basemap', 'lightPreset', preset);
                }
            };
            
            // Add all buttons to container
            controlsContainer.appendChild(homeBtn);
            controlsContainer.appendChild(pinBtn);
            controlsContainer.appendChild(lightBtn);
            
            // Add container to map
            document.querySelector('#map').appendChild(controlsContainer);
        }, 1000);
    }
}

// Initialize
window.mapController = new MapController();