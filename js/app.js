/**
 * Legacy Compass - Main Application Controller
 * The Bloomberg Terminal of Real Estate
 */

class LegacyCompass {
  constructor() {
    this.version = '1.0.0';
    this.tenant = this.detectTenant();
    this.properties = [];
    this.currentView = 'map';
    this.filters = {
      search: '',
      equityMin: 0,
      absenteeOnly: false,
      tags: []
    };
    
    // Core components (initialized in init())
    this.map = null;
    this.ai = null;
    this.storage = null;
    this.enrichment = null;
    this.voice = null;
  }

  /**
   * Initialize application
   */
  async init() {
    console.log('🏠 Legacy Compass initializing...');
    
    // Load configuration
    await this.loadConfig();
    
    // Initialize core components
    await this.initializeComponents();
    
    // Load property data
    await this.loadProperties();
    
    // Set up event listeners
    this.attachEventListeners();
    
    // Initialize PWA if supported
    this.initializePWA();
    
    console.log('✅ Legacy Compass ready!');
  }

  /**
   * Detect multi-tenant from URL
   */
  detectTenant() {
    const path = window.location.pathname.split('/')[1];
    return path || 'default';
  }

  /**
   * Load configuration
   */
  async loadConfig() {
    // Load from environment or config file
    this.config = {
      mapboxToken: window.MAPBOX_TOKEN || '',
      ghostAPI: window.GHOST_API_URL || '',
      groqKey: window.GROQ_API_KEY || '',
      tenant: this.tenant
    };
  }

  /**
   * Initialize all components
   */
  async initializeComponents() {
    // Map controller
    if (window.MapController) {
      this.map = new MapController('map');
    }
    
    // AI Assistant
    if (window.AIAssistant) {
      this.ai = new AIAssistant(this.config);
    }
    
    // Storage manager
    if (window.StorageManager) {
      this.storage = new StorageManager(this.tenant);
    }
    
    // Data enrichment
    if (window.DataEnrichment) {
      this.enrichment = new DataEnrichment(this.config);
    }
    
    // Voice recorder
    if (window.VoiceRecorder) {
      this.voice = new VoiceRecorder();
    }
  }

  /**
   * Load property data
   */
  async loadProperties() {
    try {
      // Check local storage first
      const cached = await this.storage?.getProperties();
      if (cached && cached.length > 0) {
        this.properties = cached;
        console.log(`📦 Loaded ${cached.length} properties from cache`);
        return;
      }
      
      // Load from server
      const response = await fetch('/data/hayward_68k.json');
      const data = await response.json();
      this.properties = data.properties || data;
      
      // Cache for offline use
      await this.storage?.saveProperties(this.properties);
      
      console.log(`🏘️ Loaded ${this.properties.length} properties`);
    } catch (error) {
      console.error('Failed to load properties:', error);
      // Fall back to sample data
      this.properties = this.generateSampleProperties();
    }
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Search
    document.getElementById('search')?.addEventListener('input', (e) => {
      this.filters.search = e.target.value;
      this.applyFilters();
    });
    
    // Equity filter
    document.getElementById('equityRange')?.addEventListener('change', (e) => {
      this.filters.equityMin = parseInt(e.target.value);
      this.applyFilters();
    });
    
    // Absentee filter
    document.getElementById('absenteeOnly')?.addEventListener('change', (e) => {
      this.filters.absenteeOnly = e.target.checked;
      this.applyFilters();
    });
    
    // CSV Upload
    document.getElementById('csvUpload')?.addEventListener('change', (e) => {
      this.handleCSVUpload(e.target.files[0]);
    });
    
    // Voice recording
    document.getElementById('voiceRecord')?.addEventListener('click', () => {
      this.toggleVoiceRecording();
    });
    
    // AI Assistant
    document.getElementById('aiPrompt')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleAIQuery(e.target.value);
      }
    });
  }

  /**
   * Apply filters to properties
   */
  applyFilters() {
    const filtered = this.properties.filter(property => {
      // Search filter
      if (this.filters.search) {
        const search = this.filters.search.toLowerCase();
        const matchAddress = property.address?.toLowerCase().includes(search);
        const matchOwner = property.owner?.name?.toLowerCase().includes(search);
        if (!matchAddress && !matchOwner) return false;
      }
      
      // Equity filter
      if (this.filters.equityMin > 0) {
        if ((property.financial?.equity || 0) < this.filters.equityMin) return false;
      }
      
      // Absentee filter
      if (this.filters.absenteeOnly) {
        if (property.owner?.type !== 'absentee') return false;
      }
      
      // Tag filter
      if (this.filters.tags.length > 0) {
        const propertyTags = property.activity?.tags || [];
        const hasTag = this.filters.tags.some(tag => propertyTags.includes(tag));
        if (!hasTag) return false;
      }
      
      return true;
    });
    
    this.renderProperties(filtered);
    this.map?.updateMarkers(filtered);
  }

  /**
   * Render property list
   */
  renderProperties(properties) {
    const container = document.getElementById('propertyList');
    if (!container) return;
    
    container.innerHTML = properties.slice(0, 100).map(property => `
      <div class="property-card" data-id="${property.id}">
        <div class="property-header">
          <div class="address">${property.address}</div>
          <div class="owner">${property.owner?.name || 'Unknown'}</div>
        </div>
        <div class="property-stats">
          <span class="equity">${property.financial?.equity || 0}% Equity</span>
          <span class="type">${property.owner?.type || 'owner_occupied'}</span>
        </div>
        <div class="property-actions">
          <button onclick="app.showPropertyDetails('${property.id}')">Details</button>
          <button onclick="app.generateEmail('${property.id}')">📧 Email</button>
          <button onclick="app.callProperty('${property.id}')">📞 Call</button>
        </div>
      </div>
    `).join('');
    
    document.getElementById('propertyCount').textContent = `${properties.length} properties`;
  }

  /**
   * Handle CSV upload
   */
  async handleCSVUpload(file) {
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      const csv = e.target.result;
      const parsed = this.parseCSV(csv);
      
      // Merge with existing properties
      const newProperties = parsed.map(row => this.csvRowToProperty(row));
      this.properties = [...this.properties, ...newProperties];
      
      // Save to storage
      await this.storage?.saveProperties(this.properties);
      
      // Re-render
      this.applyFilters();
      
      alert(`Imported ${newProperties.length} properties`);
    };
    reader.readAsText(file);
  }

  /**
   * Toggle voice recording
   */
  async toggleVoiceRecording() {
    if (!this.voice) return;
    
    if (this.voice.isRecording) {
      const audio = await this.voice.stop();
      // Process audio (transcribe, save, etc.)
      await this.processVoiceNote(audio);
    } else {
      await this.voice.start();
      document.getElementById('voiceIndicator')?.classList.add('recording');
    }
  }

  /**
   * Handle AI query
   */
  async handleAIQuery(query) {
    if (!this.ai || !query) return;
    
    const response = await this.ai.process(query, {
      currentProperty: this.currentProperty,
      filters: this.filters,
      properties: this.properties
    });
    
    // Display response
    document.getElementById('aiResponse').innerHTML = response;
  }

  /**
   * Show property details
   */
  showPropertyDetails(propertyId) {
    const property = this.properties.find(p => p.id === propertyId);
    if (!property) return;
    
    this.currentProperty = property;
    
    // Populate detail panel
    document.getElementById('detailAddress').textContent = property.address;
    document.getElementById('detailOwner').textContent = property.owner?.name || 'Unknown';
    document.getElementById('detailEquity').textContent = `${property.financial?.equity || 0}%`;
    
    // Show panel
    document.getElementById('detailPanel')?.classList.add('open');
  }

  /**
   * Generate email for property
   */
  async generateEmail(propertyId) {
    const property = this.properties.find(p => p.id === propertyId);
    if (!property || !this.ai) return;
    
    const email = await this.ai.generateEmail(property);
    
    // Display in modal or copy to clipboard
    if (email) {
      navigator.clipboard.writeText(email.body);
      alert('Email copied to clipboard!');
    }
  }

  /**
   * Initialize PWA features
   */
  initializePWA() {
    // Track online status
    this.isOnline = navigator.onLine;
    
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js')
        .then(registration => {
          console.log('📱 PWA service worker registered');
          
          // Check for updates periodically
          setInterval(() => {
            registration.update();
          }, 60000); // Check every minute
          
          // Handle updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New service worker available
                if (confirm('New version available! Reload to update?')) {
                  newWorker.postMessage({ type: 'SKIP_WAITING' });
                  window.location.reload();
                }
              }
            });
          });
        })
        .catch(err => console.error('PWA registration failed:', err));
      
      // Listen for messages from service worker
      navigator.serviceWorker.addEventListener('message', event => {
        if (event.data.type === 'OFFLINE_READY') {
          console.log('✅ Offline mode ready');
          this.showNotification('App ready for offline use', 'success');
        }
      });
    }
    
    // Handle online/offline status
    this.setupOfflineDetection();
    
    // Setup install prompt
    this.setupInstallPrompt();
    
    // Prefetch critical data for offline use
    this.prefetchOfflineData();
  }
  
  /**
   * Setup online/offline detection
   */
  setupOfflineDetection() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      console.log('✅ Back online');
      this.showNotification('Connection restored - syncing changes...', 'success');
      this.syncOfflineChanges();
    });
    
    window.addEventListener('offline', () => {
      this.isOnline = false;
      console.log('⚠️ Gone offline');
      this.showNotification('Working offline - changes will sync when reconnected', 'warning');
    });
  }
  
  /**
   * Setup PWA install prompt
   */
  setupInstallPrompt() {
    let deferredPrompt;
    
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      
      // Show custom install button if needed
      console.log('📱 App can be installed');
      
      // You can trigger install from any UI element
      this.installApp = async () => {
        if (deferredPrompt) {
          deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;
          console.log(`Install prompt outcome: ${outcome}`);
          deferredPrompt = null;
        }
      };
    });
    
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      console.log('✅ App is already installed');
      this.isInstalled = true;
    }
  }
  
  /**
   * Prefetch data for offline use
   */
  async prefetchOfflineData() {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      try {
        // Cache current properties
        if (this.properties && this.properties.length > 0) {
          navigator.serviceWorker.controller.postMessage({
            type: 'CACHE_PROPERTIES',
            properties: this.properties
          });
        }
        
        // Request background sync for any pending changes
        const registration = await navigator.serviceWorker.ready;
        if ('sync' in registration) {
          await registration.sync.register('sync-queue');
        }
      } catch (error) {
        console.error('Failed to prefetch offline data:', error);
      }
    }
  }
  
  /**
   * Sync offline changes when back online
   */
  async syncOfflineChanges() {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      try {
        // Trigger background sync
        const registration = await navigator.serviceWorker.ready;
        if ('sync' in registration) {
          await registration.sync.register('sync-queue');
          await registration.sync.register('sync-properties');
          await registration.sync.register('sync-enrichment');
        }
        
        // Reload properties to get latest data
        setTimeout(() => {
          this.loadProperties();
        }, 2000);
      } catch (error) {
        console.error('Failed to sync offline changes:', error);
      }
    }
  }
  
  /**
   * Show notification
   */
  showNotification(message, type = 'info') {
    // This will integrate with your existing notification system
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    // If you have a toast system, trigger it here
    if (this.toasts) {
      this.toasts.push({ message, type });
      setTimeout(() => {
        this.toasts.shift();
      }, 3000);
    }
  }

  /**
   * Generate sample properties for development
   */
  generateSampleProperties() {
    const streets = ['Main St', 'Oak Ave', 'Elm Dr', 'Park Ln', 'First St'];
    const names = ['John Smith', 'Maria Garcia', 'James Johnson', 'Linda Brown'];
    
    return Array.from({length: 100}, (_, i) => ({
      id: `sample_${i}`,
      address: `${1000 + i} ${streets[i % streets.length]}, Hayward, CA 94541`,
      coordinates: {
        lat: 37.6688 + (Math.random() - 0.5) * 0.1,
        lng: -122.0808 + (Math.random() - 0.5) * 0.1
      },
      owner: {
        name: names[i % names.length],
        type: i % 3 === 0 ? 'absentee' : 'owner_occupied'
      },
      financial: {
        equity: Math.floor(Math.random() * 100),
        value: 500000 + Math.floor(Math.random() * 500000)
      }
    }));
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new LegacyCompass();
  window.app.init();
});