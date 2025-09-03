/**
 * Enhanced Map Interaction System
 * Handles dot clicks, zoom levels, and panel synchronization
 */

class MapInteractionController {
  constructor(map, properties, panelController) {
    this.map = map;
    this.properties = properties;
    this.panelController = panelController;
    this.markers = new Map();
    this.currentZoom = map.getZoom();
    this.selectedProperty = null;
    this.glowLayer = null;
    
    // Zoom thresholds
    this.ZOOM_LEVELS = {
      OVERVIEW: 13,    // City level
      TERRITORY: 15,   // Neighborhood level
      PROPERTY: 18,    // Individual property
      DETAIL: 20       // Maximum detail
    };
    
    this.init();
  }
  
  init() {
    // Listen to map zoom changes
    this.map.on('zoomend', () => {
      this.currentZoom = this.map.getZoom();
      this.updateMarkerInteractivity();
    });
    
    // Initialize markers
    this.createMarkers();
  }
  
  /**
   * Creates markers with enhanced click behavior
   */
  createMarkers() {
    this.properties.forEach(property => {
      const color = property.ownerOccupied ? '#22c55e' : '#ef4444';
      
      // Create custom icon with zoom-aware styling
      const icon = L.divIcon({
        className: 'property-marker',
        html: `
          <div class="marker-dot" 
               data-property-id="${property.id}"
               style="
                 width: 14px;
                 height: 14px;
                 border-radius: 50%;
                 background: ${color};
                 box-shadow: 0 0 0 2px #09111b, 0 0 12px ${color}66;
                 cursor: pointer;
                 transition: all 0.2s ease;
               ">
          </div>
        `,
        iconSize: [14, 14],
        iconAnchor: [7, 7]
      });
      
      // Create marker with enhanced click handler
      const marker = L.marker([property.lat, property.lng], { icon })
        .addTo(this.map)
        .on('click', () => this.handleMarkerClick(property));
      
      // Store marker reference
      this.markers.set(property.id, {
        marker: marker,
        property: property
      });
    });
  }
  
  /**
   * Enhanced marker click handler with zoom logic
   */
  handleMarkerClick(property) {
    const currentZoom = this.map.getZoom();
    
    // Determine action based on current zoom level
    if (currentZoom < this.ZOOM_LEVELS.TERRITORY) {
      // Far out - zoom to territory level
      this.zoomToTerritory(property);
    } else if (currentZoom < this.ZOOM_LEVELS.PROPERTY) {
      // Territory level - zoom to property
      this.zoomToProperty(property);
    } else {
      // Already at property level - just select and update panel
      this.selectProperty(property);
    }
  }
  
  /**
   * Zoom to territory level showing nearby properties
   */
  zoomToTerritory(property) {
    this.map.setView(
      [property.lat, property.lng], 
      this.ZOOM_LEVELS.TERRITORY,
      { 
        animate: true,
        duration: 0.5
      }
    );
    
    // Update panel to show properties in this area
    const nearbyProperties = this.findNearbyProperties(property, 0.005); // ~500m radius
    this.panelController.showPropertyList(nearbyProperties);
    
    // Highlight the clicked property
    this.highlightProperty(property, false);
  }
  
  /**
   * Zoom directly to property level
   */
  zoomToProperty(property) {
    this.map.setView(
      [property.lat, property.lng], 
      this.ZOOM_LEVELS.PROPERTY,
      { 
        animate: true,
        duration: 0.3
      }
    );
    
    // Select the property and update panel
    this.selectProperty(property);
  }
  
  /**
   * Select property and update all UI elements
   */
  selectProperty(property) {
    this.selectedProperty = property;
    
    // Update panel with full property details
    this.panelController.showPropertyDetail(property);
    
    // Add neon glow effect
    this.addNeonFootprint(property);
    
    // Ensure we're at proper zoom
    if (this.map.getZoom() < this.ZOOM_LEVELS.PROPERTY) {
      this.map.setView(
        [property.lat, property.lng],
        this.ZOOM_LEVELS.PROPERTY,
        { animate: true }
      );
    }
    
    // Trigger custom event for other components
    this.map.fire('propertyselected', { property });
  }
  
  /**
   * Add neon glow effect to selected property
   */
  addNeonFootprint(property) {
    // Remove existing glow
    if (this.glowLayer) {
      this.map.removeLayer(this.glowLayer);
      this.glowLayer = null;
    }
    
    // Calculate property boundary
    const size = 0.00035; // Adjust based on zoom
    const bounds = [
      [property.lat - size, property.lng - size],
      [property.lat - size, property.lng + size],
      [property.lat + size, property.lng + size],
      [property.lat + size, property.lng - size]
    ];
    
    // Add neon polygon
    this.glowLayer = L.polygon(bounds, {
      className: 'neon',
      color: '#49e0e8',
      weight: 3,
      opacity: 0.9,
      fillColor: '#49e0e8',
      fillOpacity: 0.15
    }).addTo(this.map);
  }
  
  /**
   * Highlight property without full selection
   */
  highlightProperty(property, temporary = true) {
    const markerData = this.markers.get(property.id);
    if (!markerData) return;
    
    const markerElement = markerData.marker.getElement();
    if (markerElement) {
      markerElement.classList.add('highlighted');
      
      if (temporary) {
        setTimeout(() => {
          markerElement.classList.remove('highlighted');
        }, 2000);
      }
    }
  }
  
  /**
   * Find properties within radius
   */
  findNearbyProperties(centerProperty, radiusDegrees) {
    return this.properties.filter(p => {
      const latDiff = Math.abs(p.lat - centerProperty.lat);
      const lngDiff = Math.abs(p.lng - centerProperty.lng);
      const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
      return distance <= radiusDegrees && p.id !== centerProperty.id;
    });
  }
  
  /**
   * Update marker interactivity based on zoom
   */
  updateMarkerInteractivity() {
    const zoom = this.map.getZoom();
    
    this.markers.forEach(({ marker, property }) => {
      const element = marker.getElement();
      if (!element) return;
      
      // Add zoom-based styling
      if (zoom >= this.ZOOM_LEVELS.PROPERTY) {
        element.classList.add('interactive');
      } else {
        element.classList.remove('interactive');
      }
    });
  }
  
  /**
   * Handle search results - narrow down to single property
   */
  handleSearchResults(results) {
    if (results.length === 1) {
      // Single result - zoom and select
      this.selectProperty(results[0]);
    } else if (results.length > 1 && results.length <= 10) {
      // Small set - show in panel and adjust map bounds
      this.panelController.showPropertyList(results);
      this.fitBoundsToProperties(results);
    } else {
      // Many results - just update panel
      this.panelController.showPropertyList(results);
    }
  }
  
  /**
   * Fit map to show all properties
   */
  fitBoundsToProperties(properties) {
    if (properties.length === 0) return;
    
    const bounds = L.latLngBounds(
      properties.map(p => [p.lat, p.lng])
    );
    
    this.map.fitBounds(bounds, {
      padding: [50, 50],
      animate: true
    });
  }
}

/**
 * Panel Controller for right-side property display
 */
class PropertyPanelController {
  constructor(panelElement) {
    this.panel = panelElement;
    this.listView = panelElement.querySelector('#list');
    this.detailView = panelElement.querySelector('#detail');
    this.currentView = 'list';
  }
  
  /**
   * Show list of properties in panel
   */
  showPropertyList(properties) {
    this.currentView = 'list';
    this.detailView.classList.remove('open');
    
    // Clear existing list
    this.listView.innerHTML = '';
    
    // Add property cards
    properties.forEach(property => {
      const card = this.createPropertyCard(property);
      this.listView.appendChild(card);
    });
    
    // Update stats
    this.updateStats(properties);
  }
  
  /**
   * Show single property detail
   */
  showPropertyDetail(property) {
    this.currentView = 'detail';
    this.detailView.classList.add('open');
    
    // Update all detail fields
    this.updateDetailFields(property);
    
    // Initialize mini map
    this.initMiniMap(property);
    
    // Load notes/activity
    this.loadPropertyActivity(property);
  }
  
  /**
   * Create property card for list view
   */
  createPropertyCard(property) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.propertyId = property.id;
    
    card.innerHTML = `
      <div class="row">
        <div>
          <div class="address">${property.address}</div>
          <div class="owner">${property.owner}</div>
        </div>
        <div class="badges">
          <span class="badge ${property.ownerOccupied ? 'green' : 'red'}">
            ${property.ownerOccupied ? 'Owner' : 'Absentee'}
          </span>
          <span class="badge">Equity ${property.equity}%</span>
          <span class="badge">${property.status}</span>
        </div>
      </div>
      <div class="actions">
        <button data-action="focus">Focus</button>
        <button data-action="details">Details</button>
        <button data-action="voice">🎤 Voice</button>
      </div>
    `;
    
    // Add click handlers
    card.querySelector('[data-action="focus"]').onclick = () => {
      window.mapController.zoomToProperty(property);
    };
    
    card.querySelector('[data-action="details"]').onclick = () => {
      this.showPropertyDetail(property);
    };
    
    card.querySelector('[data-action="voice"]').onclick = () => {
      window.voiceController.startRecording(property);
    };
    
    return card;
  }
  
  /**
   * Update detail view fields
   */
  updateDetailFields(property) {
    // Address and owner
    document.getElementById('d_addr').textContent = property.address;
    document.getElementById('d_owner').textContent = property.owner;
    
    // Badges
    document.getElementById('d_badges').innerHTML = `
      <span class="badge ${property.ownerOccupied ? 'green' : 'red'}">
        ${property.ownerOccupied ? 'Owner' : 'Absentee'}
      </span>
      <span class="badge">Equity ${property.equity}%</span>
      <span class="badge">${property.status}</span>
    `;
    
    // Owner info
    document.getElementById('d_ownerBlock').innerHTML = `
      <div><strong>Phone:</strong> ${property.ownerPhone} 
        <span class="badge green">verified</span>
      </div>
      <div><strong>Email:</strong> ${property.ownerEmail} 
        <span class="badge green">valid</span>
      </div>
      <div><strong>Mailing:</strong> ${property.mailingAddress || '123 Owner St, Phoenix, AZ'}</div>
    `;
    
    // Property details
    document.getElementById('d_propBlock').innerHTML = `
      <div>${property.beds} bd • ${property.baths} ba • ${property.sqft} sqft</div>
      <div>Lot: ${property.lot} sqft • Built ${property.yearBuilt}</div>
    `;
    
    // Market insight
    document.getElementById('d_marketBlock').innerHTML = `
      <div>Last sale: ${property.lastSale} · $${property.salePrice.toLocaleString()}</div>
      <div>Area turnover: ${this.calculateAreaTurnover(property)}%</div>
    `;
    
    // Equity info
    document.getElementById('d_equityBlock').innerHTML = `
      <div>Equity: ${property.equity}%</div>
      <div>Lender: ${property.lender}</div>
      <div>Loan date: ${property.lastSale}</div>
    `;
  }
  
  /**
   * Initialize mini map for property detail
   */
  initMiniMap(property) {
    // Implementation would create small map in detail view
    // Similar to existing mini map code
  }
  
  /**
   * Load property activity/notes
   */
  loadPropertyActivity(property) {
    // Load from localStorage or database
    const notes = window.notesDB[property.id] || [];
    // Update timeline display
  }
  
  /**
   * Update statistics display
   */
  updateStats(properties) {
    const total = properties.length;
    const absentee = properties.filter(p => !p.ownerOccupied).length;
    
    document.getElementById('statCount').textContent = `${total} homes`;
    document.getElementById('statAbs').textContent = 
      `${total ? Math.round((absentee/total) * 100) : 0}% absentee`;
  }
  
  /**
   * Calculate area turnover rate
   */
  calculateAreaTurnover(property) {
    // This would normally calculate from real data
    return 10 + (property.id.charCodeAt(1) % 5);
  }
}

// Export for use in main application
window.MapInteractionController = MapInteractionController;
window.PropertyPanelController = PropertyPanelController;