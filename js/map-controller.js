/**
 * Legacy Compass Map Controller
 * Handles all map functionality including 3D, lighting, and property display
 */

class MapController {
    constructor() {
        this.map = null;
        this.markers = [];
        this.initialized = false;
        this.currentLightPreset = 'dusk';
        this.lightPresets = ['dawn', 'day', 'dusk', 'night'];
        this.currentLightIndex = 2; // Start with dusk
        this.is3DMode = true;
    }

    initialize() {
        if (this.initialized) return;
        
        console.log('🗺️ Initializing Map Controller...');
        
        const config = window.LEGACY_CONFIG || window.CONFIG;
        if (!config || !config.MAPBOX_TOKEN) {
            console.error('❌ No Mapbox token found');
            return;
        }

        mapboxgl.accessToken = config.MAPBOX_TOKEN;
        
        this.map = new mapboxgl.Map({
            container: 'map',
            style: 'mapbox://styles/mapbox/standard',
            center: config.MAP_CENTER || [-122.0808, 37.6688],
            zoom: config.MAP_ZOOM || 17,
            pitch: 60,
            bearing: -20,
            antialias: true,
            config: {
                lightPreset: 'dusk'
            }
        });

        // Add controls
        this.map.addControl(new mapboxgl.NavigationControl({
            showCompass: true,
            showZoom: true,
            visualizePitch: true
        }), 'top-right');

        // Store global reference
        window.mapInstance = this.map;
        window.currentLightPreset = 'dusk';

        this.map.on('load', () => {
            console.log('✅ Map loaded successfully');
            this.setupMapFeatures();
            this.initialized = true;
            
            // Force 3D mode
            setTimeout(() => {
                this.enable3D();
            }, 1000);
        });

        this.map.on('error', (e) => {
            console.error('❌ Map error:', e.error);
        });
    }

    setupMapFeatures() {
        // Add 3D terrain
        this.map.addSource('mapbox-dem', {
            type: 'raster-dem',
            url: 'mapbox://mapbox.terrain-rgb',
            tileSize: 512,
            maxzoom: 14
        });

        this.map.setTerrain({ 
            source: 'mapbox-dem', 
            exaggeration: 1.5 
        });

        // Add 3D buildings
        this.map.addLayer({
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
                'fill-extrusion-opacity': 0.6
            }
        });

        // Set initial light preset
        this.map.setConfigProperty('basemap', 'lightPreset', 'dusk');
        
        console.log('🌟 3D features and lighting enabled');
    }

    enable3D() {
        if (!this.map) return;
        
        this.map.setPitch(60);
        this.map.setBearing(-20);
        this.is3DMode = true;
        
        // Verify it worked
        setTimeout(() => {
            const pitch = this.map.getPitch();
            console.log(`📐 3D Mode enabled - Current pitch: ${pitch}°`);
        }, 500);
    }

    toggle3DView() {
        if (!this.map) return;

        if (this.is3DMode) {
            // Switch to 2D
            this.map.easeTo({
                pitch: 0,
                bearing: 0,
                duration: 1000
            });
            this.is3DMode = false;
            console.log('📐 Switched to 2D view');
        } else {
            // Switch to 3D
            this.map.easeTo({
                pitch: 60,
                bearing: -20,
                duration: 1000
            });
            this.is3DMode = true;
            console.log('📐 Switched to 3D view');
        }
    }

    toggleLightPreset() {
        if (!this.map) return;

        this.currentLightIndex = (this.currentLightIndex + 1) % this.lightPresets.length;
        const preset = this.lightPresets[this.currentLightIndex];
        
        this.map.setConfigProperty('basemap', 'lightPreset', preset);
        this.currentLightPreset = preset;
        window.currentLightPreset = preset;
        
        // Update mini map if it exists
        if (window.miniMapInstance) {
            window.miniMapInstance.setConfigProperty('basemap', 'lightPreset', preset);
        }
        
        const icons = ['🌄', '☀️', '🌅', '🌙'];
        const labels = ['Dawn', 'Day', 'Dusk', 'Night'];
        
        console.log(`🌅 Light set to ${labels[this.currentLightIndex]}`);
        
        // Dispatch event for UI updates
        window.dispatchEvent(new CustomEvent('lightChanged', {
            detail: {
                preset,
                icon: icons[this.currentLightIndex],
                label: labels[this.currentLightIndex],
                index: this.currentLightIndex
            }
        }));
        
        return {
            preset,
            icon: icons[this.currentLightIndex],
            label: labels[this.currentLightIndex]
        };
    }

    loadFarmProperties(properties) {
        if (!this.map || !properties) return;
        
        console.log(`🏠 Loading ${properties.length} properties on map...`);
        
        // Clear existing markers
        this.clearMarkers();
        
        // Add property markers
        const features = properties.map(property => {
            if (!property.coordinates) return null;
            
            return {
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [property.coordinates.lng, property.coordinates.lat]
                },
                properties: {
                    id: property.id,
                    address: property.address,
                    owner: property.owner?.fullName || property.owner?.name || 'Unknown',
                    equity: property.financial?.equity || 0,
                    isAbsentee: property.owner?.type === 'absentee',
                    status: property.activity?.status || 'cold'
                }
            };
        }).filter(Boolean);

        // Add source for property markers
        if (this.map.getSource('properties')) {
            this.map.getSource('properties').setData({
                type: 'FeatureCollection',
                features: features
            });
        } else {
            this.map.addSource('properties', {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: features
                },
                cluster: true,
                clusterMaxZoom: 14,
                clusterRadius: 50
            });

            // Add cluster layer
            this.map.addLayer({
                id: 'clusters',
                type: 'circle',
                source: 'properties',
                filter: ['has', 'point_count'],
                paint: {
                    'circle-color': [
                        'step',
                        ['get', 'point_count'],
                        '#ff9500',
                        100,
                        '#ffb700',
                        750,
                        '#ffd700'
                    ],
                    'circle-radius': [
                        'step',
                        ['get', 'point_count'],
                        20,
                        100,
                        30,
                        750,
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

            // Add individual property points
            this.map.addLayer({
                id: 'unclustered-point',
                type: 'circle',
                source: 'properties',
                filter: ['!', ['has', 'point_count']],
                paint: {
                    'circle-color': [
                        'case',
                        ['get', 'isAbsentee'], '#ff9500',  // Orange for absentee
                        '#ffb700'  // Amber for owner-occupied
                    ],
                    'circle-radius': [
                        'interpolate',
                        ['linear'],
                        ['get', 'equity'],
                        0, 4,
                        50, 6,
                        80, 8
                    ],
                    'circle-stroke-width': 1,
                    'circle-stroke-color': '#fff'
                }
            });
        }

        // Add click handlers for property selection
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

        this.map.on('click', 'unclustered-point', (e) => {
            const coordinates = e.features[0].geometry.coordinates.slice();
            const properties = e.features[0].properties;
            
            // Find the full property data
            const property = properties.find(p => p.id === properties.id);
            
            // Dispatch property selection event
            window.dispatchEvent(new CustomEvent('propertySelected', {
                detail: { property, coordinates }
            }));
            
            this.map.flyTo({
                center: coordinates,
                zoom: 18
            });
        });

        // Change cursor on hover
        this.map.on('mouseenter', 'clusters', () => {
            this.map.getCanvas().style.cursor = 'pointer';
        });
        this.map.on('mouseleave', 'clusters', () => {
            this.map.getCanvas().style.cursor = '';
        });
        this.map.on('mouseenter', 'unclustered-point', () => {
            this.map.getCanvas().style.cursor = 'pointer';
        });
        this.map.on('mouseleave', 'unclustered-point', () => {
            this.map.getCanvas().style.cursor = '';
        });

        console.log(`✅ ${features.length} properties loaded on map`);
    }

    focusOnProperty(property) {
        if (!this.map || !property.coordinates) return;
        
        this.map.flyTo({
            center: [property.coordinates.lng, property.coordinates.lat],
            zoom: 18,
            pitch: 60,
            bearing: -20
        });
    }

    updateMarkers(filteredProperties) {
        // Update the property source with filtered data
        if (this.map && this.map.getSource('properties')) {
            const features = filteredProperties.map(property => {
                if (!property.coordinates) return null;
                
                return {
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: [property.coordinates.lng, property.coordinates.lat]
                    },
                    properties: {
                        id: property.id,
                        address: property.address,
                        owner: property.owner?.fullName || property.owner?.name || 'Unknown',
                        equity: property.financial?.equity || 0,
                        isAbsentee: property.owner?.type === 'absentee',
                        status: property.activity?.status || 'cold'
                    }
                };
            }).filter(Boolean);

            this.map.getSource('properties').setData({
                type: 'FeatureCollection',
                features: features
            });
        }
    }

    clearMarkers() {
        // Clear existing property layers
        const layersToRemove = ['clusters', 'cluster-count', 'unclustered-point'];
        layersToRemove.forEach(layerId => {
            if (this.map.getLayer(layerId)) {
                this.map.removeLayer(layerId);
            }
        });

        if (this.map.getSource('properties')) {
            this.map.removeSource('properties');
        }
    }

    jumpToAddress(address) {
        if (!address.trim()) return;
        
        // Simple geocoding using Mapbox
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${mapboxgl.accessToken}&proximity=${this.map.getCenter().lng},${this.map.getCenter().lat}`;
        
        fetch(url)
            .then(response => response.json())
            .then(data => {
                if (data.features && data.features.length > 0) {
                    const [lng, lat] = data.features[0].center;
                    this.map.flyTo({
                        center: [lng, lat],
                        zoom: 17
                    });
                } else {
                    console.warn('Address not found');
                }
            })
            .catch(error => {
                console.error('Geocoding error:', error);
            });
    }
}

// Create global instance
window.mapController = new MapController();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (window.mapController) {
            window.mapController.initialize();
        }
    }, 500);
});