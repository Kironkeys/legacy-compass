/**
 * Mapbox GL JS Initialization
 * The Bloomberg Terminal-style map
 */

class MapController {
    constructor(containerId) {
        this.containerId = containerId;
        this.map = null;
        this.markers = [];
        this.currentView = 'dark';
        this.heatmapVisible = false;
        this.propertyMarkers = new Map();
        
        // Drawing tools
        this.isDrawing = false;
        this.drawnPolygon = null;
        
        // Visualization modes
        this.visualizationMode = 'default'; // default, matrix, tron, equity
        this.autoRotate = false;
        this.dataStreams = [];
        this.streetViewMode = false;
        this.walkingSpeed = 0;
    }
    
    /**
     * Initialize the map with CRAZY 3D effects
     */
    async init() {
        // Check for Mapbox token
        if (!window.CONFIG?.MAPBOX_TOKEN || window.CONFIG.MAPBOX_TOKEN.includes('YOUR_MAPBOX_TOKEN')) {
            console.warn('⚠️ No Mapbox token found. Add your token to js/config.js');
            this.showMapPlaceholder();
            return;
        }
        
        // Set Mapbox access token
        mapboxgl.accessToken = window.CONFIG.MAPBOX_TOKEN;
        
        try {
            // Create map instance with 3D perspective
            this.map = new mapboxgl.Map({
                container: this.containerId,
                style: window.CONFIG.MAP_STYLE || 'mapbox://styles/mapbox/dark-v11',
                center: window.CONFIG.MAP_CENTER,
                zoom: window.CONFIG.MAP_ZOOM,
                pitch: 60,  // 3D tilt angle for sick perspective
                bearing: -17.6,  // Rotate for dramatic angle
                antialias: true,
                maxPitch: 85,  // Allow extreme tilting
                maxZoom: 20
            });
            
            // Add navigation controls
            this.map.addControl(new mapboxgl.NavigationControl(), 'top-left');
            
            // Add geolocate control
            this.geolocateControl = new mapboxgl.GeolocateControl({
                positionOptions: {
                    enableHighAccuracy: true
                },
                trackUserLocation: true,
                showUserHeading: true
            });
            this.map.addControl(this.geolocateControl, 'top-left');
            
            // Add scale control
            this.map.addControl(new mapboxgl.ScaleControl(), 'bottom-left');
            
            // Wait for map to load
            this.map.on('load', () => {
                console.log('✅ Mapbox loaded successfully');
                
                // Check if satellite style
                const isSatellite = window.CONFIG.MAP_STYLE.includes('satellite');
                
                if (!isSatellite) {
                    this.setup3DTerrain(); // Add 3D terrain elevation
                    this.setup3DBuildings();
                    this.setupRealWorldData(); // Add real streets, POIs, parcels
                }
                
                this.setupMapLayers();
                this.loadProperties();
                this.addFohlOfficeMarker(); // Add Les's building
                this.startMapAnimations();
            });
            
            // Handle map interactions
            this.map.on('click', (e) => {
                if (!this.isDrawing) {
                    this.handleMapClick(e);
                }
            });
            
            // Handle cluster clicks to zoom in
            this.map.on('click', 'clusters', (e) => {
                const features = this.map.queryRenderedFeatures(e.point, {
                    layers: ['clusters']
                });
                const clusterId = features[0].properties.cluster_id;
                
                this.map.getSource('properties').getClusterExpansionZoom(
                    clusterId,
                    (err, zoom) => {
                        if (err) return;
                        
                        // Zoom into the cluster to see individual properties
                        this.map.easeTo({
                            center: features[0].geometry.coordinates,
                            zoom: zoom + 1, // Extra zoom to really get in there
                            duration: 1000
                        });
                    }
                );
            });
            
            // Add hover effects
            this.map.on('mouseenter', 'unclustered-point', (e) => {
                this.map.getCanvas().style.cursor = 'pointer';
                
                // Create popup on hover
                const coordinates = e.features[0].geometry.coordinates.slice();
                const property = e.features[0].properties;
                
                // Show quick info popup
                const popup = new mapboxgl.Popup({ offset: 25, closeButton: false })
                    .setLngLat(coordinates)
                    .setHTML(`
                        <div style="color: #000; font-family: system-ui; padding: 5px;">
                            <div style="font-weight: 700; font-size: 12px;">${property.address}</div>
                            <div style="color: #666; font-size: 11px;">${property.owner}</div>
                            <div style="margin-top: 4px;">
                                <span style="background: ${property.equity >= 70 ? '#00ff41' : property.equity >= 40 ? '#ffb700' : '#ff3333'}; color: #000; padding: 2px 6px; border-radius: 4px; font-size: 10px;">
                                    ${property.equity}% Equity
                                </span>
                            </div>
                        </div>
                    `)
                    .addTo(this.map);
                    
                this.currentPopup = popup;
            });
            
            this.map.on('mouseleave', 'unclustered-point', () => {
                this.map.getCanvas().style.cursor = '';
                if (this.currentPopup) {
                    this.currentPopup.remove();
                    this.currentPopup = null;
                }
            });
            
        } catch (error) {
            console.error('Failed to initialize Mapbox:', error);
            this.showMapPlaceholder();
        }
    }
    
    /**
     * Show placeholder when map can't load
     */
    showMapPlaceholder() {
        const container = document.getElementById(this.containerId);
        container.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; height: 100%; background: #0a0a0a;">
                <div style="text-align: center; color: #ffb700;">
                    <div style="font-size: 48px; margin-bottom: 16px;">🗺️</div>
                    <div style="font-size: 18px; font-weight: 600;">Map Loading...</div>
                    <div style="margin-top: 8px; color: #808080;">Add your Mapbox token to js/config.js</div>
                    <div style="margin-top: 16px;">
                        <a href="https://www.mapbox.com/signup" target="_blank" 
                           style="color: #ff9500; text-decoration: none; border: 1px solid #ff9500; padding: 8px 16px; border-radius: 6px; display: inline-block;">
                            Get Free Mapbox Token →
                        </a>
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * Add 3D terrain with satellite imagery
     */
    setup3DTerrain() {
        // Add Mapbox's DEM (Digital Elevation Model) source for terrain
        this.map.addSource('mapbox-dem', {
            'type': 'raster-dem',
            'url': 'mapbox://mapbox.mapbox-terrain-dem-v1',
            'tileSize': 512,
            'maxzoom': 14
        });
        
        // Set the terrain with exaggeration for dramatic effect
        this.map.setTerrain({ 
            'source': 'mapbox-dem', 
            'exaggeration': 1.5  // Exaggerate terrain height for drama
        });
        
        // Add sky layer for realistic atmosphere
        this.map.addLayer({
            'id': 'sky',
            'type': 'sky',
            'paint': {
                'sky-type': 'atmosphere',
                'sky-atmosphere-sun': [0.0, 90.0],
                'sky-atmosphere-sun-intensity': 15
            }
        });
    }
    
    /**
     * Add REALISTIC 3D buildings with proper textures
     */
    setup3DBuildings() {
        // Add 3D building layer
        const layers = this.map.getStyle().layers;
        const labelLayerId = layers.find(
            (layer) => layer.type === 'symbol' && layer.layout['text-field']
        ).id;
        
        // Add realistic 3D buildings
        this.map.addLayer({
            'id': '3d-buildings',
            'source': 'composite',
            'source-layer': 'building',
            'filter': ['==', 'extrude', 'true'],
            'type': 'fill-extrusion',
            'minzoom': 13,
            'paint': {
                'fill-extrusion-color': [
                    'interpolate',
                    ['linear'],
                    ['get', 'height'],
                    0, '#1a1a1a',     // Black for ground level
                    10, '#2a2a2a',    // Dark gray for low buildings
                    20, '#3a3a3a',    // Medium dark gray
                    40, '#4a4a4a',    // Medium gray
                    100, '#5a5a5a',   // Lighter gray for tall
                    200, '#6a6a6a'    // Light gray for skyscrapers
                ],
                'fill-extrusion-height': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    15, 0,
                    15.05, ['get', 'height']
                ],
                'fill-extrusion-base': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    15, 0,
                    15.05, ['get', 'min_height']
                ],
                'fill-extrusion-opacity': 0.6,
                'fill-extrusion-vertical-gradient': false
            }
        }, labelLayerId);
        
        // Add subtle lighting
        this.map.setLight({
            'anchor': 'viewport',
            'color': 'white',
            'intensity': 0.15,
            'position': [1.5, 210, 30]
        });
        
        // Add subtle fog for depth
        this.map.setFog({
            'color': 'rgba(0, 0, 0, 0.4)',
            'high-color': 'rgba(20, 20, 20, 0.2)',
            'horizon-blend': 0.03,
            'space-color': 'rgba(0, 0, 0, 0.8)',
            'star-intensity': 0
        });
    }
    
    /**
     * Add real-world data layers
     */
    setupRealWorldData() {
        // Add street names
        this.map.addLayer({
            id: 'street-labels',
            type: 'symbol',
            source: 'composite',
            'source-layer': 'road',
            layout: {
                'text-field': ['get', 'name'],
                'text-font': ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'],
                'text-size': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    10, 10,
                    18, 16
                ],
                'text-transform': 'uppercase',
                'text-letter-spacing': 0.1,
                'text-rotation-alignment': 'map',
                'text-pitch-alignment': 'viewport'
            },
            paint: {
                'text-color': '#ffb700',
                'text-halo-color': '#000000',
                'text-halo-width': 2
            }
        });
        
        // Add points of interest (stores, schools, etc)
        this.map.addLayer({
            id: 'poi-labels',
            type: 'symbol',
            source: 'composite',
            'source-layer': 'poi_label',
            filter: ['in', 'maki', 'shop', 'grocery', 'school', 'hospital', 'bank', 'restaurant'],
            layout: {
                'text-field': ['get', 'name'],
                'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Regular'],
                'text-size': 11,
                'icon-image': ['concat', ['get', 'maki'], '-11'],
                'text-offset': [0, 1.5],
                'text-anchor': 'top'
            },
            paint: {
                'text-color': '#49e0e8',
                'text-halo-color': '#000000',
                'text-halo-width': 1
            }
        });
        
        // Add property lot boundaries
        this.map.addLayer({
            id: 'parcel-boundaries',
            type: 'line',
            source: 'composite',
            'source-layer': 'landuse',
            filter: ['==', 'class', 'residential'],
            paint: {
                'line-color': '#ff9500',
                'line-width': 0.5,
                'line-opacity': 0.3
            },
            minzoom: 16
        });
        
        // Add neighborhood labels
        this.map.addLayer({
            id: 'neighborhood-labels',
            type: 'symbol',
            source: 'composite',
            'source-layer': 'place_label',
            filter: ['==', 'type', 'neighbourhood'],
            layout: {
                'text-field': ['get', 'name'],
                'text-font': ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'],
                'text-size': 14,
                'text-transform': 'uppercase',
                'text-letter-spacing': 0.2
            },
            paint: {
                'text-color': '#ffd700',
                'text-halo-color': '#000000',
                'text-halo-width': 2,
                'text-opacity': 0.8
            }
        });
    }
    
    /**
     * Setup map layers for property visualization
     */
    setupMapLayers() {
        // Add a source for property data
        this.map.addSource('properties', {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: []
            },
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
                    '#ffb700',  // Amber for small clusters
                    10,
                    '#ff9500',  // Orange for medium
                    30,
                    '#ff6b00'   // Deep orange for large
                ],
                'circle-radius': [
                    'step',
                    ['get', 'point_count'],
                    20, 10,
                    30, 30,
                    40
                ],
                'circle-opacity': 0.9,
                'circle-stroke-width': 3,
                'circle-stroke-color': '#ffffff'  // White border for satellite
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
            },
            paint: {
                'text-color': '#000000'
            }
        });
        
        // Add individual property points
        this.map.addLayer({
            id: 'unclustered-point',
            type: 'circle',
            source: 'properties',
            filter: ['!', ['has', 'point_count']],
            paint: {
                'circle-color': [
                    'case',
                    ['>=', ['get', 'equity'], 70], '#00ff41',  // Green for high equity
                    ['>=', ['get', 'equity'], 40], '#ffb700',  // Amber for medium
                    '#ff3333'  // Red for low equity
                ],
                'circle-radius': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    10, 6,
                    14, 10,
                    18, 14
                ],
                'circle-stroke-width': 3,
                'circle-stroke-color': '#ffffff',  // White border for visibility on satellite
                'circle-opacity': 0.95
            }
        });
        
        // Add pulsing glow effect for hot properties
        this.map.addLayer({
            id: 'property-glow',
            type: 'circle',
            source: 'properties',
            filter: ['all', 
                ['!', ['has', 'point_count']], 
                ['>=', ['get', 'equity'], 70]
            ],
            paint: {
                'circle-radius': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    10, 15,
                    14, 35,
                    18, 50
                ],
                'circle-color': '#00ff41',
                'circle-opacity': 0,
                'circle-opacity-transition': {
                    duration: 2000
                },
                'circle-blur': 1
            }
        });
        
        // Add data-driven line layers for connections
        this.map.addLayer({
            id: 'connection-lines',
            type: 'line',
            source: {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: []
                }
            },
            paint: {
                'line-color': '#49e0e8',
                'line-width': 2,
                'line-opacity': 0.4,
                'line-dasharray': [2, 4]
            }
        });
    }
    
    /**
     * Start sick map animations
     */
    startMapAnimations() {
        let timestamp = 0;
        
        // Animate property glow pulses
        const animateGlow = () => {
            timestamp += 1;
            
            // Pulse hot properties
            const opacity = Math.abs(Math.sin(timestamp * 0.002));
            if (this.map.getLayer('property-glow')) {
                this.map.setPaintProperty('property-glow', 'circle-opacity', opacity * 0.5);
            }
            
            // Rotate map for Tron mode
            if (this.autoRotate && timestamp % 2 === 0) {
                this.map.setBearing(this.map.getBearing() + 0.2);
            }
            
            requestAnimationFrame(animateGlow);
        };
        
        animateGlow();
        
        // Add sky gradient animation
        this.animateSky();
    }
    
    /**
     * Animate sky gradient for time-of-day effect
     */
    animateSky() {
        const hours = new Date().getHours();
        let skyGradient;
        
        if (hours >= 6 && hours < 12) {
            // Morning: warm sunrise colors
            skyGradient = {
                'sky-color': '#ff9500',
                'horizon-color': '#ffd700',
                'horizon-fog-blend': 0.5,
                'fog-color': '#ffb700'
            };
        } else if (hours >= 12 && hours < 18) {
            // Afternoon: bright clear
            skyGradient = {
                'sky-color': '#49e0e8',
                'horizon-color': '#ffffff',
                'horizon-fog-blend': 0.3,
                'fog-color': '#f0f0f0'
            };
        } else {
            // Night: dark with neon glow
            skyGradient = {
                'sky-color': '#0a0a0a',
                'horizon-color': '#1a1a1a',
                'horizon-fog-blend': 0.8,
                'fog-color': '#000000'
            };
        }
        
        if (this.map.getStyle()) {
            this.map.setSky(skyGradient);
        }
    }
    
    /**
     * Load properties onto the map
     */
    loadProperties() {
        // Get properties from the data loader (real data!)
        const properties = window.dataLoader?.getProperties(500) || [];
        
        // Convert to GeoJSON
        const geojson = {
            type: 'FeatureCollection',
            features: properties.map(prop => ({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [
                        prop.coordinates?.lng || prop.lng || -122.0808 + (Math.random() - 0.5) * 0.1,
                        prop.coordinates?.lat || prop.lat || 37.6688 + (Math.random() - 0.5) * 0.1
                    ]
                },
                properties: {
                    id: prop.id,
                    address: prop.address,
                    owner: prop.owner?.name || 'Unknown',
                    equity: prop.financial?.equity || Math.floor(Math.random() * 100),
                    value: prop.financial?.value || 500000 + Math.floor(Math.random() * 500000),
                    type: prop.owner?.type || 'owner_occupied'
                }
            }))
        };
        
        // Update the map source
        if (this.map.getSource('properties')) {
            this.map.getSource('properties').setData(geojson);
        }
        
        console.log(`📍 Loaded ${properties.length} properties on map`);
    }
    
    /**
     * Cycle through SICK visualization modes
     */
    toggleVisualization() {
        const modes = ['default', 'matrix', 'tron', 'equity'];
        const currentIndex = modes.indexOf(this.visualizationMode);
        this.visualizationMode = modes[(currentIndex + 1) % modes.length];
        
        // Show mode indicator
        this.showModeIndicator(this.visualizationMode);
        
        switch(this.visualizationMode) {
            case 'matrix':
                this.applyMatrixMode();
                this.showToast('🟢 MATRIX MODE - Digital Rain Active');
                break;
            case 'tron':
                this.applyTronMode();
                this.showToast('⚡ TRON MODE - Neon Grid Active');
                break;
            case 'equity':
                this.applyEquityMode();
                this.showToast('💰 EQUITY MODE - 3D Value Towers Active');
                break;
            default:
                this.applyDefaultMode();
                this.showToast('🏙️ DEFAULT MODE - Bloomberg Terminal');
        }
    }
    
    /**
     * Apply Matrix visualization - green data rain
     */
    applyMatrixMode() {
        // Clean up previous mode layers
        this.cleanupModeLayers();
        
        // Matrix camera angle
        this.map.setPitch(45);
        this.map.setBearing(0);
        
        // DARK green matrix atmosphere
        this.map.setFog({
            'color': 'rgba(0, 0, 0, 0.98)',
            'high-color': 'rgba(0, 255, 0, 0.5)',
            'horizon-blend': 0.02,
            'space-color': 'rgba(0, 0, 0, 1)',
            'star-intensity': 0
        });
        
        this.map.setLight({
            'anchor': 'viewport',
            'color': '#00ff00',
            'intensity': 1,
            'position': [1.5, 180, 80]
        });
        
        // Make EVERYTHING green
        if (this.map.getLayer('unclustered-point')) {
            this.map.setPaintProperty('unclustered-point', 'circle-color', '#00ff00');
            this.map.setPaintProperty('unclustered-point', 'circle-stroke-color', '#00ff00');
            this.map.setPaintProperty('unclustered-point', 'circle-radius', 10);
            this.map.setPaintProperty('unclustered-point', 'circle-blur', 0.5);
        }
        
        if (this.map.getLayer('clusters')) {
            this.map.setPaintProperty('clusters', 'circle-color', '#00ff00');
            this.map.setPaintProperty('clusters', 'circle-stroke-color', '#00ff00');
            this.map.setPaintProperty('clusters', 'circle-stroke-width', 3);
        }
        
        if (this.map.getLayer('3d-buildings')) {
            this.map.setPaintProperty('3d-buildings', 'fill-extrusion-color', '#00ff00');
            this.map.setPaintProperty('3d-buildings', 'fill-extrusion-opacity', 0.3);
        }
        
        // Add falling green text rain
        this.addMatrixRain();
        
        // Add scanlines effect
        this.addScanlines();
    }
    
    /**
     * Apply Tron visualization - neon grid
     */
    applyTronMode() {
        // Clean up previous mode layers
        this.cleanupModeLayers();
        
        // Tron camera - dramatic angle with auto rotation
        this.map.setPitch(70);
        this.map.setBearing(45);
        this.autoRotate = true; // Enable rotation for Tron
        
        // DARK blue tron atmosphere
        this.map.setFog({
            'color': 'rgba(0, 0, 10, 0.98)',
            'high-color': 'rgba(73, 224, 232, 0.6)',
            'horizon-blend': 0.1,
            'space-color': 'rgba(0, 0, 30, 1)',
            'star-intensity': 0.8
        });
        
        this.map.setLight({
            'anchor': 'viewport',
            'color': '#49e0e8',
            'intensity': 1.2,
            'position': [1.5, 45, 60]
        });
        
        // NEON cyan/magenta style
        if (this.map.getLayer('unclustered-point')) {
            this.map.setPaintProperty('unclustered-point', 'circle-color', '#00ffff');
            this.map.setPaintProperty('unclustered-point', 'circle-stroke-color', '#ff00ff');
            this.map.setPaintProperty('unclustered-point', 'circle-stroke-width', 4);
            this.map.setPaintProperty('unclustered-point', 'circle-radius', 12);
            this.map.setPaintProperty('unclustered-point', 'circle-blur', 1);
        }
        
        if (this.map.getLayer('clusters')) {
            this.map.setPaintProperty('clusters', 'circle-color', '#ff00ff');
            this.map.setPaintProperty('clusters', 'circle-stroke-color', '#00ffff');
            this.map.setPaintProperty('clusters', 'circle-stroke-width', 4);
        }
        
        if (this.map.getLayer('3d-buildings')) {
            this.map.setPaintProperty('3d-buildings', 'fill-extrusion-color', '#49e0e8');
            this.map.setPaintProperty('3d-buildings', 'fill-extrusion-opacity', 0.4);
        }
        
        // Add the TRON grid
        this.addTronGrid();
        
        // Add light trails
        this.addLightTrails();
    }
    
    /**
     * Apply Equity Mode - value-based 3D towers
     */
    applyEquityMode() {
        // Clean up previous mode layers
        this.cleanupModeLayers();
        
        // EXTREME 3D angle
        this.map.setPitch(80);
        this.map.setBearing(-17);
        this.autoRotate = false; // No rotation for equity mode
        
        // Golden atmosphere for money
        this.map.setFog({
            'color': 'rgba(10, 10, 0, 0.9)',
            'high-color': 'rgba(255, 215, 0, 0.4)',
            'horizon-blend': 0.1,
            'space-color': 'rgba(0, 0, 0, 1)',
            'star-intensity': 0.3
        });
        
        this.map.setLight({
            'anchor': 'viewport',
            'color': '#ffd700',
            'intensity': 0.8,
            'position': [1.5, 90, 80]
        });
        
        // Add MASSIVE 3D towers for equity
        const properties = window.app?.filteredProperties || [];
        const features = properties.map(prop => ({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [prop.coordinates?.lng || -122.0808, prop.coordinates?.lat || 37.6688]
            },
            properties: {
                height: (prop.financial?.equity || 50) * 20, // SUPER TALL towers
                equity: prop.financial?.equity || 50,
                value: prop.financial?.value || 500000
            }
        }));
        
        // Add value towers layer
        if (!this.map.getSource('value-towers')) {
            this.map.addSource('value-towers', {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: features
                }
            });
        } else {
            this.map.getSource('value-towers').setData({
                type: 'FeatureCollection',
                features: features
            });
        }
        
        if (!this.map.getLayer('equity-towers')) {
            this.map.addLayer({
                id: 'equity-towers',
                type: 'fill-extrusion',
                source: 'value-towers',
                paint: {
                    'fill-extrusion-color': [
                        'interpolate',
                        ['linear'],
                        ['get', 'equity'],
                        0, '#ff0000',     // Red for 0% equity
                        30, '#ff6600',    // Orange for 30%
                        50, '#ffb700',    // Amber for 50%
                        70, '#ffd700',    // Gold for 70%
                        100, '#00ff41'    // Green for 100% equity
                    ],
                    'fill-extrusion-height': ['get', 'height'],
                    'fill-extrusion-base': 0,
                    'fill-extrusion-opacity': 0.9
                }
            });
        }
        
        // Hide regular markers in equity mode
        if (this.map.getLayer('unclustered-point')) {
            this.map.setLayoutProperty('unclustered-point', 'visibility', 'none');
        }
        if (this.map.getLayer('clusters')) {
            this.map.setLayoutProperty('clusters', 'visibility', 'none');
            this.map.setLayoutProperty('cluster-count', 'visibility', 'none');
        }
    }
    
    /**
     * Clean up mode-specific layers
     */
    cleanupModeLayers() {
        // Remove Matrix layers
        if (this.map.getLayer('matrix-drops')) {
            this.map.removeLayer('matrix-drops');
        }
        if (this.map.getSource('matrix-rain')) {
            this.map.removeSource('matrix-rain');
        }
        
        // Remove Tron layers
        if (this.map.getLayer('grid-lines')) {
            this.map.removeLayer('grid-lines');
        }
        if (this.map.getSource('tron-grid')) {
            this.map.removeSource('tron-grid');
        }
        if (this.map.getLayer('light-trails')) {
            this.map.removeLayer('light-trails');
        }
        if (this.map.getSource('light-trails-source')) {
            this.map.removeSource('light-trails-source');
        }
        
        // Remove Equity layers
        if (this.map.getLayer('equity-towers')) {
            this.map.removeLayer('equity-towers');
        }
        if (this.map.getSource('value-towers')) {
            this.map.removeSource('value-towers');
        }
        
        // Remove scanlines
        if (this.map.getLayer('scanlines')) {
            this.map.removeLayer('scanlines');
        }
        if (this.map.getSource('scanlines-source')) {
            this.map.removeSource('scanlines-source');
        }
        
        // Show regular markers again
        if (this.map.getLayer('unclustered-point')) {
            this.map.setLayoutProperty('unclustered-point', 'visibility', 'visible');
        }
        if (this.map.getLayer('clusters')) {
            this.map.setLayoutProperty('clusters', 'visibility', 'visible');
            this.map.setLayoutProperty('cluster-count', 'visibility', 'visible');
        }
        
        // Stop auto rotation
        this.autoRotate = false;
    }
    
    /**
     * Show mode indicator overlay
     */
    showModeIndicator(mode) {
        const indicator = document.createElement('div');
        indicator.className = 'mode-indicator';
        
        const modeInfo = {
            'matrix': { icon: '🟢', text: 'MATRIX MODE', desc: 'Digital Rain' },
            'tron': { icon: '⚡', text: 'TRON MODE', desc: 'Neon Grid' },
            'equity': { icon: '💰', text: 'EQUITY MODE', desc: '3D Towers by Value' },
            'default': { icon: '🏙️', text: 'DEFAULT MODE', desc: 'Bloomberg Terminal' }
        };
        
        const info = modeInfo[mode] || modeInfo['default'];
        indicator.innerHTML = `
            <div class="mode-icon">${info.icon}</div>
            <div class="mode-text">${info.text}</div>
            <div class="mode-desc">${info.desc}</div>
        `;
        
        indicator.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0,0,0,0.95);
            border: 2px solid ${mode === 'matrix' ? '#00ff00' : mode === 'tron' ? '#49e0e8' : mode === 'equity' ? '#ffd700' : '#ff9500'};
            color: ${mode === 'matrix' ? '#00ff00' : mode === 'tron' ? '#49e0e8' : mode === 'equity' ? '#ffd700' : '#ff9500'};
            padding: 30px 50px;
            border-radius: 10px;
            font-family: monospace;
            text-align: center;
            z-index: 10000;
            animation: modeIndicatorPulse 1s ease;
        `;
        
        document.body.appendChild(indicator);
        setTimeout(() => indicator.remove(), 2000);
    }
    
    /**
     * Add scanlines effect for Matrix mode
     */
    addScanlines() {
        // Create horizontal scanlines
        const scanlines = [];
        const bounds = this.map.getBounds();
        const north = bounds.getNorth();
        const south = bounds.getSouth();
        const east = bounds.getEast();
        const west = bounds.getWest();
        
        for (let i = 0; i < 20; i++) {
            const lat = south + (north - south) * (i / 20);
            scanlines.push({
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: [[west, lat], [east, lat]]
                }
            });
        }
        
        if (!this.map.getSource('scanlines-source')) {
            this.map.addSource('scanlines-source', {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: scanlines
                }
            });
        }
        
        if (!this.map.getLayer('scanlines')) {
            this.map.addLayer({
                id: 'scanlines',
                type: 'line',
                source: 'scanlines-source',
                paint: {
                    'line-color': '#00ff00',
                    'line-width': 0.5,
                    'line-opacity': 0.2
                }
            });
        }
    }
    
    /**
     * Add light trails for Tron mode
     */
    addLightTrails() {
        // Create animated light trails between properties
        const properties = window.app?.filteredProperties || [];
        const trails = [];
        
        // Create random connections between properties
        for (let i = 0; i < Math.min(20, properties.length - 1); i++) {
            const from = properties[Math.floor(Math.random() * properties.length)];
            const to = properties[Math.floor(Math.random() * properties.length)];
            
            if (from && to && from.id !== to.id) {
                trails.push({
                    type: 'Feature',
                    geometry: {
                        type: 'LineString',
                        coordinates: [
                            [from.coordinates?.lng || -122.0808, from.coordinates?.lat || 37.6688],
                            [to.coordinates?.lng || -122.0808, to.coordinates?.lat || 37.6688]
                        ]
                    }
                });
            }
        }
        
        if (!this.map.getSource('light-trails-source')) {
            this.map.addSource('light-trails-source', {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: trails
                }
            });
        }
        
        if (!this.map.getLayer('light-trails')) {
            this.map.addLayer({
                id: 'light-trails',
                type: 'line',
                source: 'light-trails-source',
                paint: {
                    'line-color': '#00ffff',
                    'line-width': 3,
                    'line-opacity': 0.6,
                    'line-blur': 2
                }
            });
        }
    }
    
    /**
     * Add Matrix-style data rain effect
     */
    addMatrixRain() {
        // Create falling data points
        const rainData = [];
        for (let i = 0; i < 100; i++) {
            const lng = -122.0808 + (Math.random() - 0.5) * 0.2;
            const lat = 37.6688 + (Math.random() - 0.5) * 0.2;
            rainData.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [lng, lat]
                },
                properties: {
                    value: Math.random()
                }
            });
        }
        
        if (!this.map.getSource('matrix-rain')) {
            this.map.addSource('matrix-rain', {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: rainData
                }
            });
        }
        
        if (!this.map.getLayer('matrix-drops')) {
            this.map.addLayer({
                id: 'matrix-drops',
                type: 'symbol',
                source: 'matrix-rain',
                layout: {
                    'text-field': ['concat', 
                        ['to-string', ['round', ['*', ['get', 'value'], 100]]],
                        '%'
                    ],
                    'text-font': ['DIN Offc Pro Medium'],
                    'text-size': 10
                },
                paint: {
                    'text-color': '#00ff00',
                    'text-opacity': ['get', 'value']
                }
            });
        }
    }
    
    /**
     * Add Tron-style grid lines
     */
    addTronGrid() {
        const gridLines = [];
        const center = window.CONFIG.MAP_CENTER;
        
        // Create grid lines
        for (let i = -10; i <= 10; i++) {
            // Horizontal lines
            gridLines.push({
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: [
                        [center[0] - 0.1, center[1] + i * 0.01],
                        [center[0] + 0.1, center[1] + i * 0.01]
                    ]
                }
            });
            // Vertical lines
            gridLines.push({
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: [
                        [center[0] + i * 0.01, center[1] - 0.1],
                        [center[0] + i * 0.01, center[1] + 0.1]
                    ]
                }
            });
        }
        
        if (!this.map.getSource('tron-grid')) {
            this.map.addSource('tron-grid', {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: gridLines
                }
            });
        }
        
        if (!this.map.getLayer('grid-lines')) {
            this.map.addLayer({
                id: 'grid-lines',
                type: 'line',
                source: 'tron-grid',
                paint: {
                    'line-color': '#49e0e8',
                    'line-width': 1,
                    'line-opacity': 0.5
                }
            });
        }
    }
    
    /**
     * Reset to default mode
     */
    applyDefaultMode() {
        this.autoRotate = false;
        this.map.setPitch(60);
        this.map.setBearing(-17.6);
        
        // Reset fog and light to default Bloomberg style
        this.map.setFog({
            'color': 'rgba(10, 10, 10, 0.8)',
            'high-color': 'rgba(255, 149, 0, 0.2)',
            'horizon-blend': 0.05,
            'space-color': 'rgba(0, 0, 0, 0.9)',
            'star-intensity': 0.2
        });
        
        this.map.setLight({
            'anchor': 'viewport',
            'color': '#ff9500',
            'intensity': 0.4,
            'position': [1.5, 90, 80]
        });
        
        // Reset colors to default
        if (this.map.getLayer('unclustered-point')) {
            this.map.setPaintProperty('unclustered-point', 'circle-color', [
                'case',
                ['>=', ['get', 'equity'], 70], '#00ff41',
                ['>=', ['get', 'equity'], 40], '#ffb700',
                '#ff3333'
            ]);
            this.map.setPaintProperty('unclustered-point', 'circle-stroke-color', '#000000');
            this.map.setPaintProperty('unclustered-point', 'circle-stroke-width', 2);
        }
        
        if (this.map.getLayer('clusters')) {
            this.map.setPaintProperty('clusters', 'circle-color', [
                'step',
                ['get', 'point_count'],
                '#ffb700',
                10,
                '#ff9500',
                30,
                '#ff6b00'
            ]);
        }
        
        if (this.map.getLayer('3d-buildings')) {
            this.map.setPaintProperty('3d-buildings', 'fill-extrusion-color', [
                'interpolate',
                ['linear'],
                ['get', 'height'],
                0, 'rgba(255, 183, 0, 0.3)',
                50, 'rgba(255, 149, 0, 0.5)',
                100, 'rgba(255, 107, 0, 0.7)',
                200, 'rgba(255, 0, 0, 0.9)'
            ]);
        }
        
        // Remove special layers
        if (this.map.getLayer('matrix-drops')) {
            this.map.removeLayer('matrix-drops');
        }
        if (this.map.getSource('matrix-rain')) {
            this.map.removeSource('matrix-rain');
        }
        if (this.map.getLayer('grid-lines')) {
            this.map.removeLayer('grid-lines');
        }
        if (this.map.getSource('tron-grid')) {
            this.map.removeSource('tron-grid');
        }
        if (this.map.getLayer('equity-towers')) {
            this.map.removeLayer('equity-towers');
        }
        if (this.map.getSource('value-towers')) {
            this.map.removeSource('value-towers');
        }
    }
    
    /**
     * Toggle satellite view
     */
    toggleSatellite() {
        if (this.currentView === 'dark' || this.currentView === 'streets') {
            this.map.setStyle('mapbox://styles/mapbox/satellite-streets-v12');
            this.currentView = 'satellite';
            
            // Re-add ALL layers after style loads
            this.map.once('style.load', () => {
                // Set pitch for 3D view
                this.map.setPitch(60);
                
                // Add terrain for elevation (check if source exists first)
                if (!this.map.getSource('mapbox-dem')) {
                    this.map.addSource('mapbox-dem', {
                        'type': 'raster-dem',
                        'url': 'mapbox://mapbox.mapbox-terrain-dem-v1',
                        'tileSize': 512,
                        'maxzoom': 14
                    });
                }
                
                this.map.setTerrain({ 
                    'source': 'mapbox-dem', 
                    'exaggeration': 1.2  // Slight exaggeration for effect
                });
                
                // Add 3D buildings on satellite
                this.addSatellite3DBuildings();
                
                // Better lighting for satellite 3D
                this.map.setLight({
                    'anchor': 'viewport',
                    'color': 'white',
                    'intensity': 0.4,
                    'position': [1.15, 210, 30]
                });
                
                // CRITICAL: Use longer delay to ensure style AND 3D buildings are fully loaded
                setTimeout(() => {
                    // Re-add all property layers
                    this.setupMapLayers();
                    this.loadProperties();
                    
                    // Re-add Fohl landmark
                    this.addFohlOfficeMarker();
                    
                    // Re-enable animations
                    if (this.animationFrame) {
                        this.startMapAnimations();
                    }
                    
                    console.log('✅ Satellite view loaded with properties');
                }, 500); // Increased delay for satellite imagery to fully load
            });
            
            this.showToast('🛰️ SATELLITE VIEW - Real imagery');
        } else {
            // Return to original style
            const originalStyle = window.CONFIG.MAP_STYLE || 'mapbox://styles/mapbox/dark-v11';
            this.map.setStyle(originalStyle);
            this.currentView = originalStyle.includes('dark') ? 'dark' : 'streets';
            
            // Re-add layers after style loads
            this.map.once('style.load', () => {
                // Check if we should add 3D buildings
                if (!originalStyle.includes('satellite')) {
                    // Restore fog for dark mode
                    this.map.setFog({
                        'color': 'rgba(10, 10, 10, 0.8)',
                        'high-color': 'rgba(255, 149, 0, 0.2)',
                        'horizon-blend': 0.05,
                        'space-color': 'rgba(0, 0, 0, 0.9)',
                        'star-intensity': 0.2
                    });
                    
                    this.map.setLight({
                        'anchor': 'viewport',
                        'color': '#ff9500',
                        'intensity': 0.4,
                        'position': [1.5, 90, 80]
                    });
                    
                    this.setup3DBuildings();
                    this.setupRealWorldData();
                }
                
                // CRITICAL: Use setTimeout to ensure style is fully loaded
                setTimeout(() => {
                    // Re-add property layers
                    this.setupMapLayers();
                    this.loadProperties();
                    
                    // Re-enable animations
                    if (this.animationFrame) {
                        this.startMapAnimations();
                    }
                    
                    console.log('✅ Returned to map view with properties');
                }, 100);
            });
            
            this.showToast('🌃 Returning to map view');
        }
    }
    
    /**
     * Add 3D buildings specifically for satellite view
     */
    addSatellite3DBuildings() {
        const layers = this.map.getStyle().layers;
        const labelLayerId = layers.find(
            (layer) => layer.type === 'symbol' && layer.layout['text-field']
        ).id;
        
        // Add 3D building layer with semi-transparent buildings
        this.map.addLayer({
            'id': '3d-buildings-satellite',
            'source': 'composite',
            'source-layer': 'building',
            'filter': ['==', 'extrude', 'true'],
            'type': 'fill-extrusion',
            'minzoom': 14,
            'paint': {
                'fill-extrusion-color': [
                    'interpolate',
                    ['linear'],
                    ['get', 'height'],
                    0, 'rgba(200, 200, 200, 0.5)',     // Light gray for low buildings
                    10, 'rgba(180, 180, 180, 0.6)',    
                    20, 'rgba(160, 160, 160, 0.7)',    
                    40, 'rgba(140, 140, 140, 0.8)',    
                    100, 'rgba(120, 120, 120, 0.9)'    // Darker for tall buildings
                ],
                'fill-extrusion-height': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    15, 0,
                    15.05, ['*', ['get', 'height'], 1.5]  // Exaggerate height for visibility
                ],
                'fill-extrusion-base': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    15, 0,
                    15.05, ['get', 'min_height']
                ],
                'fill-extrusion-opacity': 0.7,
                'fill-extrusion-vertical-gradient': true
            }
        }, labelLayerId);
    }
    
    /**
     * Toggle equity heatmap
     */
    toggleHeatmap() {
        if (!this.heatmapVisible) {
            // Hide regular markers first
            if (this.map.getLayer('clusters')) {
                this.map.setLayoutProperty('clusters', 'visibility', 'none');
                this.map.setLayoutProperty('cluster-count', 'visibility', 'none');
                this.map.setLayoutProperty('unclustered-point', 'visibility', 'none');
            }
            
            // Add or show heatmap
            if (!this.map.getLayer('heatmap')) {
                this.map.addLayer({
                    id: 'heatmap',
                    type: 'heatmap',
                    source: 'properties',
                    paint: {
                        'heatmap-weight': [
                            'interpolate',
                            ['linear'],
                            ['get', 'equity'],
                            0, 0,
                            100, 1
                        ],
                        'heatmap-intensity': [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            0, 1,
                            9, 3
                        ],
                        'heatmap-color': [
                            'interpolate',
                            ['linear'],
                            ['heatmap-density'],
                            0, 'rgba(0,0,0,0)',
                            0.2, 'rgba(255,51,51,0.5)',      // Red for low
                            0.4, 'rgba(255,149,0,0.7)',      // Orange
                            0.6, 'rgba(255,183,0,0.8)',      // Amber
                            0.8, 'rgba(255,215,0,0.9)',      // Gold
                            1, 'rgba(0,255,65,1)'             // Green for high
                        ],
                        'heatmap-radius': [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            0, 2,
                            9, 20,
                            14, 30
                        ],
                        'heatmap-opacity': 0.7
                    }
                });
            } else {
                this.map.setLayoutProperty('heatmap', 'visibility', 'visible');
            }
            this.heatmapVisible = true;
            
            // Show toast
            this.showToast('Equity Heatmap ON - Red=Low, Green=High Equity');
            
        } else {
            // Hide heatmap
            if (this.map.getLayer('heatmap')) {
                this.map.setLayoutProperty('heatmap', 'visibility', 'none');
            }
            
            // Show regular markers again
            if (this.map.getLayer('clusters')) {
                this.map.setLayoutProperty('clusters', 'visibility', 'visible');
                this.map.setLayoutProperty('cluster-count', 'visibility', 'visible');
                this.map.setLayoutProperty('unclustered-point', 'visibility', 'visible');
            }
            this.heatmapVisible = false;
            
            this.showToast('Equity Heatmap OFF');
        }
    }
    
    /**
     * Show toast notification
     */
    showToast(message) {
        // Simple toast for map feedback
        const toast = document.createElement('div');
        toast.className = 'map-toast';
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.9);
            color: #ffb700;
            padding: 12px 24px;
            border-radius: 8px;
            border: 1px solid #ffb700;
            font-size: 14px;
            z-index: 1000;
            animation: fadeInOut 3s ease;
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
    
    /**
     * Get current GPS location
     */
    getCurrentLocation() {
        this.geolocateControl.trigger();
    }
    
    /**
     * Return to farm view - zoom out to see entire territory
     */
    goToFarmView() {
        // Store the farm bounds for quick return
        if (!this.farmBounds) {
            // Calculate bounds from all properties
            const properties = window.app?.filteredProperties || [];
            if (properties.length > 0) {
                const bounds = new mapboxgl.LngLatBounds();
                properties.forEach(prop => {
                    if (prop.coordinates) {
                        bounds.extend([prop.coordinates.lng, prop.coordinates.lat]);
                    }
                });
                this.farmBounds = bounds;
            }
        }
        
        // Animate to farm view
        if (this.farmBounds) {
            this.map.fitBounds(this.farmBounds, {
                padding: 50,
                duration: 1500,
                pitch: 45,
                bearing: 0
            });
        } else {
            // Fallback to default center
            this.map.flyTo({
                center: window.CONFIG.MAP_CENTER,
                zoom: window.CONFIG.MAP_ZOOM,
                duration: 1500,
                pitch: 45,
                bearing: 0
            });
        }
    }
    
    /**
     * Handle map clicks
     */
    handleMapClick(e) {
        // Check if clicking on a property
        const features = this.map.queryRenderedFeatures(e.point, {
            layers: ['unclustered-point']
        });
        
        if (features.length > 0) {
            const propertyData = features[0].properties;
            
            // Find the full property object from data loader
            const fullProperty = window.dataLoader?.properties.find(p => p.id === propertyData.id);
            
            if (fullProperty) {
                // Tell the Alpine app to select this property (opens detail panel)
                if (window.Alpine && window.Alpine.$data) {
                    const appData = document.querySelector('[x-data="legacyCompass"]').__x.$data;
                    appData.selectProperty(fullProperty);
                }
                
                // Also focus the map on it
                this.focusOnProperty(fullProperty);
            }
        }
    }
    
    /**
     * Focus on a specific property with satellite view
     */
    focusOnProperty(property) {
        if (!property || !property.coordinates) return;
        
        // Switch to satellite for best view
        if (!this.map.getStyle().name?.includes('satellite')) {
            this.map.setStyle('mapbox://styles/mapbox/satellite-streets-v12');
            
            this.map.once('style.load', () => {
                this.performFocus(property);
            });
        } else {
            this.performFocus(property);
        }
    }
    
    /**
     * Perform the actual focus animation
     */
    performFocus(property) {
        // Fly to property with top-down view
        this.map.flyTo({
            center: [property.coordinates.lng, property.coordinates.lat],
            zoom: 19,  // Very close zoom like old MVP
            pitch: 0,   // Top-down satellite view
            bearing: 0,
            duration: 1500,
            essential: true
        });
        
        // Re-add layers after style change if needed
        setTimeout(() => {
            this.setupMapLayers();
            this.loadProperties();
            this.highlightProperty(property);
            
            // Initialize mini map
            this.initMiniMap(property);
        }, 500);
    }
    
    /**
     * Initialize mini map in detail panel
     */
    initMiniMap(property) {
        // Wait for mini map container to be visible
        setTimeout(() => {
            const miniMapContainer = document.getElementById('miniMap');
            if (!miniMapContainer) return;
            
            // Destroy existing mini map if it exists
            if (this.miniMap) {
                this.miniMap.remove();
                this.miniMap = null;
            }
            
            // Create new mini map
            this.miniMap = new mapboxgl.Map({
                container: 'miniMap',
                style: 'mapbox://styles/mapbox/standard',
                center: [property.coordinates.lng, property.coordinates.lat],
                zoom: 18,
                pitch: 0,
                interactive: false,
                attributionControl: false
            });
            
            // Add property marker when loaded
            this.miniMap.on('load', () => {
                new mapboxgl.Marker({
                    color: '#ff9500'
                })
                .setLngLat([property.coordinates.lng, property.coordinates.lat])
                .addTo(this.miniMap);
            });
        }, 100);
    }
    
    /**
     * Highlight a property on the map
     */
    highlightProperty(property) {
        // Remove existing highlight
        if (this.highlightMarker) {
            this.highlightMarker.remove();
        }
        
        // Create highlight marker
        const el = document.createElement('div');
        el.className = 'property-highlight';
        el.style.width = '30px';
        el.style.height = '30px';
        el.style.border = '3px solid #ff9500';
        el.style.borderRadius = '50%';
        el.style.backgroundColor = 'rgba(255, 149, 0, 0.3)';
        el.style.animation = 'pulse 2s infinite';
        
        this.highlightMarker = new mapboxgl.Marker(el)
            .setLngLat([property.coordinates.lng, property.coordinates.lat])
            .addTo(this.map);
    }
    
    /**
     * Show property popup
     */
    showPropertyPopup(property, lngLat) {
        const popup = new mapboxgl.Popup({ offset: 25 })
            .setLngLat(lngLat)
            .setHTML(`
                <div style="color: #000; font-family: system-ui;">
                    <div style="font-weight: 700; font-size: 14px;">${property.address}</div>
                    <div style="color: #666; font-size: 12px;">${property.owner}</div>
                    <div style="margin-top: 8px;">
                        <span style="background: #00ff41; color: #000; padding: 2px 6px; border-radius: 4px; font-size: 11px;">
                            ${property.equity}% Equity
                        </span>
                    </div>
                </div>
            `)
            .addTo(this.map);
    }
    
    /**
     * Add Les Fohl's office as a MASSIVE 3D landmark
     */
    addFohlOfficeMarker() {
        // Les's office coordinates - 22326 Main St, Hayward
        const fohlOffice = {
            lng: -122.0808,
            lat: 37.6744
        };
        
        // Create the actual building footprint (curved corner design)
        // But make it MASSIVE - like a skyscraper version of the real building
        this.map.addSource('fohl-office', {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: [
                    // Main building with realistic proportions but extreme height
                    {
                        type: 'Feature',
                        geometry: {
                            type: 'Polygon',
                            coordinates: [[
                                [fohlOffice.lng - 0.0004, fohlOffice.lat - 0.0002],
                                [fohlOffice.lng + 0.0002, fohlOffice.lat - 0.0002],
                                [fohlOffice.lng + 0.0003, fohlOffice.lat - 0.0001], // Curved corner
                                [fohlOffice.lng + 0.0003, fohlOffice.lat + 0.0002],
                                [fohlOffice.lng - 0.0004, fohlOffice.lat + 0.0002],
                                [fohlOffice.lng - 0.0004, fohlOffice.lat - 0.0002]
                            ]]
                        },
                        properties: {
                            height: 800, // MASSIVE height - like 80 story version
                            base_height: 0,
                            name: 'FOHL REALTY TOWER'
                        }
                    },
                    // Glass top section (represents the windows)
                    {
                        type: 'Feature',
                        geometry: {
                            type: 'Polygon',
                            coordinates: [[
                                [fohlOffice.lng - 0.0003, fohlOffice.lat - 0.0001],
                                [fohlOffice.lng + 0.0002, fohlOffice.lat - 0.0001],
                                [fohlOffice.lng + 0.0002, fohlOffice.lat + 0.0001],
                                [fohlOffice.lng - 0.0003, fohlOffice.lat + 0.0001],
                                [fohlOffice.lng - 0.0003, fohlOffice.lat - 0.0001]
                            ]]
                        },
                        properties: {
                            height: 850, // Even taller glass crown
                            base_height: 800,
                            name: 'FOHL CROWN'
                        }
                    }
                ]
            }
        });
        
        // Add the main building - white/cream like the real building
        this.map.addLayer({
            id: 'fohl-office-3d',
            type: 'fill-extrusion',
            source: 'fohl-office',
            filter: ['==', ['get', 'name'], 'FOHL REALTY TOWER'],
            paint: {
                'fill-extrusion-color': [
                    'interpolate',
                    ['linear'],
                    ['get', 'height'],
                    0, '#f5f5dc',     // Cream at base (like real building)
                    400, '#ffd700',   // Transitions to gold
                    800, '#ff9500'    // Orange at top
                ],
                'fill-extrusion-height': ['get', 'height'],
                'fill-extrusion-base': ['get', 'base_height'],
                'fill-extrusion-opacity': 0.95,
                'fill-extrusion-vertical-gradient': true
            }
        });
        
        // Add the glass crown - representing the windows
        this.map.addLayer({
            id: 'fohl-glass-crown',
            type: 'fill-extrusion',
            source: 'fohl-office',
            filter: ['==', ['get', 'name'], 'FOHL CROWN'],
            paint: {
                'fill-extrusion-color': '#87CEEB', // Sky blue glass
                'fill-extrusion-height': ['get', 'height'],
                'fill-extrusion-base': ['get', 'base_height'],
                'fill-extrusion-opacity': 0.7
            }
        });
        
        // Add ground glow effect
        this.map.addSource('fohl-ground-glow', {
            type: 'geojson',
            data: {
                type: 'Feature',
                geometry: {
                    type: 'Polygon',
                    coordinates: [[
                        [fohlOffice.lng - 0.0006, fohlOffice.lat - 0.0004],
                        [fohlOffice.lng + 0.0004, fohlOffice.lat - 0.0004],
                        [fohlOffice.lng + 0.0004, fohlOffice.lat + 0.0004],
                        [fohlOffice.lng - 0.0006, fohlOffice.lat + 0.0004],
                        [fohlOffice.lng - 0.0006, fohlOffice.lat - 0.0004]
                    ]]
                }
            }
        });
        
        // Add the ground glow
        this.map.addLayer({
            id: 'fohl-ground-glow',
            type: 'fill',
            source: 'fohl-ground-glow',
            paint: {
                'fill-color': '#ffd700',
                'fill-opacity': 0.2
            }
        }, 'fohl-office-3d'); // Place below the building
        
        // Add a pulsing marker at the top
        this.map.addSource('fohl-marker', {
            type: 'geojson',
            data: {
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [fohlOffice.lng, fohlOffice.lat]
                },
                properties: {
                    title: 'FOHL REALTY & INVESTMENTS',
                    description: '#1 Brokerage - 40 Years Strong'
                }
            }
        });
        
        // Add glowing marker
        this.map.addLayer({
            id: 'fohl-marker-glow',
            type: 'circle',
            source: 'fohl-marker',
            paint: {
                'circle-radius': 30,
                'circle-color': '#ffd700',
                'circle-opacity': 0,
                'circle-blur': 1
            }
        });
        
        // Add text label
        this.map.addLayer({
            id: 'fohl-label',
            type: 'symbol',
            source: 'fohl-marker',
            layout: {
                'text-field': 'FOHL\nREALTY\n#1',
                'text-font': ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'],
                'text-size': 20,
                'text-anchor': 'center',
                'text-transform': 'uppercase',
                'text-letter-spacing': 0.2
            },
            paint: {
                'text-color': '#ffd700',
                'text-halo-color': '#000000',
                'text-halo-width': 3,
                'text-halo-blur': 1
            }
        });
        
        // Animate the glow
        let glowOpacity = 0;
        let increasing = true;
        
        const animateGlow = () => {
            if (increasing) {
                glowOpacity += 0.02;
                if (glowOpacity >= 0.8) increasing = false;
            } else {
                glowOpacity -= 0.02;
                if (glowOpacity <= 0) increasing = true;
            }
            
            if (this.map.getLayer('fohl-marker-glow')) {
                this.map.setPaintProperty('fohl-marker-glow', 'circle-opacity', glowOpacity);
                this.map.setPaintProperty('fohl-marker-glow', 'circle-radius', 30 + glowOpacity * 20);
            }
            
            requestAnimationFrame(animateGlow);
        };
        
        animateGlow();
        
        console.log('🏢 FOHL OFFICE LANDMARK ADDED - 22326 Main St, Hayward');
    }
    
    /**
     * Generate sample properties for demo
     */
    generateSampleProperties() {
        const streets = ['Main St', 'Oak Ave', 'Elm Dr', 'Park Ln', 'First St', 'Mission Blvd', 'Foothill Blvd', 'Jackson St'];
        const firstNames = ['John', 'Maria', 'James', 'Linda', 'Robert', 'Patricia', 'Michael', 'Jennifer'];
        const lastNames = ['Smith', 'Garcia', 'Johnson', 'Brown', 'Martinez', 'Davis', 'Wilson', 'Anderson'];
        
        return Array.from({length: 500}, (_, i) => ({
            id: `prop_${i}`,
            address: `${1000 + Math.floor(Math.random() * 9000)} ${streets[i % streets.length]}, Hayward, CA`,
            coordinates: {
                lat: 37.6688 + (Math.random() - 0.5) * 0.15,
                lng: -122.0808 + (Math.random() - 0.5) * 0.15
            },
            owner: {
                name: `${firstNames[i % firstNames.length]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`,
                type: Math.random() > 0.7 ? 'absentee' : 'owner_occupied'
            },
            financial: {
                equity: Math.floor(Math.random() * 100),
                value: 400000 + Math.floor(Math.random() * 600000)
            }
        }));
    }
    
    /**
     * Update markers based on filtered properties
     */
    updateMarkers(properties) {
        if (!this.map) return;
        
        // Update the data source
        const geojson = {
            type: 'FeatureCollection',
            features: properties.map(prop => ({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [
                        prop.coordinates?.lng || -122.0808,
                        prop.coordinates?.lat || 37.6688
                    ]
                },
                properties: {
                    id: prop.id,
                    address: prop.address,
                    owner: prop.owner?.name,
                    equity: prop.financial?.equity || 0
                }
            }))
        };
        
        this.map.getSource('properties')?.setData(geojson);
    }
    
    /**
     * Open Google Street View at current location
     */
    openGoogleStreetView() {
        const center = this.map.getCenter();
        const lat = center.lat;
        const lng = center.lng;
        
        // Open Google Street View in a new window
        const streetViewUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
        window.open(streetViewUrl, '_blank');
        
        this.showToast('📸 Opening Google Street View...');
    }
    
    /**
     * Toggle Street View mode for walking around (Mapbox 3D)
     */
    toggleStreetView() {
        this.streetViewMode = !this.streetViewMode;
        
        if (this.streetViewMode) {
            // Try to use photorealistic 3D tiles if available
            // Note: This requires Mapbox GL JS v3+ and may require upgraded API plan
            const usePhotorealistic = true;
            
            if (usePhotorealistic) {
                // Switch to Mapbox Standard style with 3D photorealistic tiles
                // This provides more realistic buildings and terrain
                this.map.setStyle('mapbox://styles/mapbox/standard');
                
                this.map.once('style.load', () => {
                    // Configure for photorealistic view
                    this.map.setConfigProperty('basemap', 'lightPreset', 'day');
                    this.map.setConfigProperty('basemap', 'showPlaceLabels', true);
                    this.map.setConfigProperty('basemap', 'showRoadLabels', true);
                    
                    // Fly to street level
                    this.map.flyTo({
                        pitch: 80, // Very steep angle
                        bearing: this.map.getBearing(),
                        zoom: 19,  // Maximum detail
                        duration: 1500
                    });
                    
                    // Re-add property layers
                    setTimeout(() => {
                        this.setupMapLayers();
                        this.loadProperties();
                    }, 500);
                });
            } else {
                // Fallback to basic 3D view
                this.map.flyTo({
                    pitch: 75,
                    bearing: this.map.getBearing(),
                    zoom: 18,
                    duration: 1500
                });
                
                // Enable 3D buildings
                if (!this.map.getLayer('3d-buildings')) {
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
                            'fill-extrusion-height': [
                                'interpolate',
                                ['linear'],
                                ['zoom'],
                                15, 0,
                                15.05, ['get', 'height']
                            ],
                            'fill-extrusion-base': [
                                'interpolate',
                                ['linear'],
                                ['zoom'],
                                15, 0,
                                15.05, ['get', 'min_height']
                            ],
                            'fill-extrusion-opacity': 0.9
                        }
                    });
                }
            }
            
            // Add keyboard controls for walking
            this.enableWalkingControls();
            
            // Show instructions
            this.showToast('🚶 STREET VIEW - Use arrow keys to walk, mouse to look around');
            
            // Add walking indicator
            this.showWalkingIndicator();
            
        } else {
            // Exit street view
            this.map.flyTo({
                pitch: 45,
                zoom: 15,
                duration: 1500
            });
            
            // Disable walking controls
            this.disableWalkingControls();
            
            // Remove walking indicator
            this.hideWalkingIndicator();
            
            this.showToast('🗺️ Exited street view');
        }
    }
    
    /**
     * Enable keyboard controls for walking
     */
    enableWalkingControls() {
        const speed = 0.00005; // Walking speed
        const rotateSpeed = 2; // Rotation speed
        
        this.walkingControls = (e) => {
            if (!this.streetViewMode) return;
            
            const center = this.map.getCenter();
            const bearing = this.map.getBearing();
            
            switch(e.key) {
                case 'ArrowUp':
                case 'w':
                case 'W':
                    // Walk forward
                    const forwardLng = center.lng + speed * Math.sin(bearing * Math.PI / 180);
                    const forwardLat = center.lat + speed * Math.cos(bearing * Math.PI / 180);
                    this.map.setCenter([forwardLng, forwardLat]);
                    break;
                    
                case 'ArrowDown':
                case 's':
                case 'S':
                    // Walk backward
                    const backLng = center.lng - speed * Math.sin(bearing * Math.PI / 180);
                    const backLat = center.lat - speed * Math.cos(bearing * Math.PI / 180);
                    this.map.setCenter([backLng, backLat]);
                    break;
                    
                case 'ArrowLeft':
                case 'a':
                case 'A':
                    // Turn left
                    this.map.setBearing(bearing - rotateSpeed);
                    break;
                    
                case 'ArrowRight':
                case 'd':
                case 'D':
                    // Turn right
                    this.map.setBearing(bearing + rotateSpeed);
                    break;
                    
                case 'q':
                case 'Q':
                    // Strafe left
                    const leftLng = center.lng - speed * Math.sin((bearing + 90) * Math.PI / 180);
                    const leftLat = center.lat - speed * Math.cos((bearing + 90) * Math.PI / 180);
                    this.map.setCenter([leftLng, leftLat]);
                    break;
                    
                case 'e':
                case 'E':
                    // Strafe right
                    const rightLng = center.lng + speed * Math.sin((bearing + 90) * Math.PI / 180);
                    const rightLat = center.lat + speed * Math.cos((bearing + 90) * Math.PI / 180);
                    this.map.setCenter([rightLng, rightLat]);
                    break;
            }
        };
        
        document.addEventListener('keydown', this.walkingControls);
    }
    
    /**
     * Disable walking controls
     */
    disableWalkingControls() {
        if (this.walkingControls) {
            document.removeEventListener('keydown', this.walkingControls);
            this.walkingControls = null;
        }
    }
    
    /**
     * Show walking indicator
     */
    showWalkingIndicator() {
        const indicator = document.createElement('div');
        indicator.id = 'walking-indicator';
        indicator.style.cssText = `
            position: absolute;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            color: #ff9500;
            padding: 15px 25px;
            border-radius: 10px;
            border: 2px solid #ff9500;
            font-family: monospace;
            z-index: 1000;
        `;
        indicator.innerHTML = `
            <div style="text-align: center; margin-bottom: 10px;">🚶 STREET MODE</div>
            <div style="font-size: 12px;">
                W/↑ Forward | S/↓ Back | A/← Turn Left | D/→ Turn Right<br>
                Q Strafe Left | E Strafe Right | Click 🚶 to exit
            </div>
        `;
        document.querySelector('.map-panel').appendChild(indicator);
    }
    
    /**
     * Hide walking indicator
     */
    hideWalkingIndicator() {
        const indicator = document.getElementById('walking-indicator');
        if (indicator) {
            indicator.remove();
        }
    }
    
    /**
     * Fly to a specific location on the map
     */
    flyToLocation(lng, lat) {
        this.map.flyTo({
            center: [lng, lat],
            zoom: 18,
            pitch: 45,
            bearing: 0,
            duration: 2000,
            essential: true
        });
    }
    
    /**
     * Add a temporary search marker with popup
     */
    addSearchMarker(lng, lat, address) {
        // Remove any existing search marker
        if (this.searchMarker) {
            this.searchMarker.remove();
        }
        
        // Create a custom marker element
        const el = document.createElement('div');
        el.className = 'search-marker';
        el.style.width = '40px';
        el.style.height = '40px';
        el.style.backgroundImage = 'radial-gradient(circle, rgba(255,149,0,0.8), rgba(255,183,0,0.4))';
        el.style.borderRadius = '50%';
        el.style.border = '3px solid #ff9500';
        el.style.boxShadow = '0 0 20px rgba(255,149,0,0.8)';
        el.style.cursor = 'pointer';
        
        // Add pulsing animation
        el.style.animation = 'pulse 2s infinite';
        
        // Create the marker
        this.searchMarker = new mapboxgl.Marker(el)
            .setLngLat([lng, lat])
            .setPopup(
                new mapboxgl.Popup({ offset: 25 })
                    .setHTML(`
                        <div style="padding: 10px; background: #1a1a1a; color: white; border-radius: 8px;">
                            <h3 style="margin: 0 0 5px 0; color: #ff9500;">📍 Search Result</h3>
                            <p style="margin: 0; font-size: 12px;">${address}</p>
                        </div>
                    `)
            )
            .addTo(this.map);
        
        // Show the popup immediately
        this.searchMarker.togglePopup();
        
        // Remove the marker after 10 seconds
        setTimeout(() => {
            if (this.searchMarker) {
                this.searchMarker.remove();
                this.searchMarker = null;
            }
        }, 10000);
    }
}

// Initialize map when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const mapController = new MapController('map');
    mapController.init();
    
    // Make it globally accessible
    window.mapController = mapController;
});

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
