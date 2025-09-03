# Legacy Compass - Complete System Architecture
## The Bloomberg Terminal of Real Estate

**Version:** 1.0.0  
**Created:** August 30, 2025  
**Status:** In Development  
**Target Launch:** September 6, 2025

---

## 🏗️ System Overview

Legacy Compass is a Progressive Web App (PWA) that replaces $5,000/month legacy CRM systems with a modern, AI-powered real estate intelligence platform. Built for Les's #1 brokerage (40 years running, $144M annual volume).

### Core Technologies
- **Frontend:** HTML5, JavaScript (ES6+), Alpine.js for reactivity
- **Mapping:** Mapbox GL JS (3D buildings, satellite view)
- **AI/LLM:** Ghost v9 backend, Groq API, OpenAI, Apple FastVLM
- **Data:** 68,733 Hayward properties (pre-loaded)
- **Storage:** LocalStorage, IndexedDB, optional Supabase sync
- **Deployment:** Static hosting (Vercel/Netlify), PWA-ready

---

## 📁 Complete File Structure

```
Legacy_Compass/
│
├── 📄 Core Files
│   ├── index.html                    # Main application
│   ├── manifest.json                  # PWA manifest
│   ├── service-worker.js              # Offline functionality
│   ├── robots.txt                     # SEO/crawler rules
│   └── .env.example                   # Environment variables template
│
├── 📁 /css/
│   ├── styles.css                     # Main styles
│   ├── mapbox-overrides.css          # Map customization
│   ├── components.css                 # UI components
│   └── mobile.css                     # Mobile responsive
│
├── 📁 /js/
│   ├── 🎯 Core System
│   │   ├── app.js                     # Main application controller
│   │   ├── config.js                  # Configuration management
│   │   ├── router.js                  # URL routing (multi-tenant)
│   │   └── state.js                   # Global state management
│   │
│   ├── 🗺️ Mapping System
│   │   ├── mapbox-init.js             # Mapbox GL initialization
│   │   ├── property-markers.js        # Property pin management
│   │   ├── territory-draw.js          # Territory drawing tools
│   │   ├── heat-mapping.js            # Equity heat visualization
│   │   └── routing.js                 # Driving directions
│   │
│   ├── 🤖 AI System
│   │   ├── ai-assistant.js            # Main AI controller
│   │   ├── ghost-connector.js         # Ghost v9 integration
│   │   ├── llm-providers.js           # Groq/OpenAI/Claude APIs
│   │   ├── email-generator.js         # Smart email composition
│   │   ├── opportunity-analyzer.js    # Property opportunity scoring
│   │   └── fastvlm-vision.js          # Apple FastVLM integration
│   │
│   ├── 📊 Data Management
│   │   ├── property-loader.js         # Load 68k properties
│   │   ├── csv-importer.js            # CSV upload/parsing
│   │   ├── data-enrichment.js         # Browser Use Cloud scraping
│   │   ├── storage-manager.js         # LocalStorage/IndexedDB
│   │   ├── sync-engine.js             # Cloud sync (optional)
│   │   └── export-manager.js          # Export to CSV/PDF
│   │
│   ├── 🎤 Voice & Communication
│   │   ├── voice-recorder.js          # Voice note recording
│   │   ├── speech-to-text.js          # Whisper STT integration
│   │   ├── call-system.js             # Click-to-call
│   │   ├── sms-composer.js            # Text message templates
│   │   └── email-client.js            # Email integration
│   │
│   ├── 🏷️ Features
│   │   ├── tagging-system.js          # Custom tags
│   │   ├── search-engine.js           # Advanced search
│   │   ├── hot-list.js                # Priority properties
│   │   ├── activity-tracker.js        # Call/visit logging
│   │   ├── notes-manager.js           # Property notes
│   │   └── verification-ui.js         # Phone/email verification
│   │
│   └── 🔧 Utilities
│       ├── api-client.js              # HTTP request wrapper
│       ├── date-utils.js              # Date formatting
│       ├── geo-utils.js               # GPS calculations
│       ├── format-utils.js            # Phone/address formatting
│       └── error-handler.js           # Global error handling
│
├── 📁 /api/                           # Backend endpoints (serverless functions)
│   ├── /ghost/
│   │   ├── analyze.js                 # Property analysis
│   │   ├── generate-email.js          # Email generation
│   │   └── memory-ops.js              # Ghost memory operations
│   │
│   ├── /enrichment/
│   │   ├── browser-cloud.js           # Browser Use Cloud
│   │   ├── spokeo.js                  # Phone lookup
│   │   ├── property-details.js        # Property data scraping
│   │   └── verify-contact.js          # Contact verification
│   │
│   ├── /data/
│   │   ├── load-properties.js         # Load Hayward dataset
│   │   ├── save-tenant-data.js        # Multi-tenant storage
│   │   └── export-data.js             # Export operations
│   │
│   └── /webhooks/
│       ├── twilio-sms.js              # SMS webhooks
│       ├── email-tracking.js          # Email open tracking
│       └── calendar-sync.js           # Calendar integration
│
├── 📁 /data/
│   ├── hayward_68k.json               # Full Hayward dataset
│   ├── sample_100.json                # Development subset
│   ├── mock_enriched.json             # Mock enriched data
│   └── /schemas/
│       ├── property.schema.json       # Property data structure
│       ├── owner.schema.json          # Owner information
│       └── activity.schema.json       # Activity logging
│
├── 📁 /assets/
│   ├── /icons/
│   │   ├── app-icon-*.png             # PWA icons (multiple sizes)
│   │   ├── markers/                   # Map markers
│   │   └── ui-icons.svg               # UI icon sprite
│   │
│   ├── /images/
│   │   ├── logo.svg                   # Legacy Compass logo
│   │   ├── onboarding/                # Tutorial images
│   │   └── empty-states/              # Empty state illustrations
│   │
│   └── /sounds/
│       ├── notification.mp3           # Notification sound
│       └── voice-start.mp3            # Voice recording start
│
├── 📁 /templates/                     # Email/SMS templates
│   ├── /emails/
│   │   ├── initial-outreach.html
│   │   ├── follow-up.html
│   │   ├── high-equity.html
│   │   └── absentee-owner.html
│   │
│   └── /sms/
│       ├── introduction.txt
│       └── appointment.txt
│
├── 📁 /docs/
│   ├── API_ENDPOINTS.md               # All API documentation
│   ├── DATA_STRUCTURES.md             # Data schemas
│   ├── DEPLOYMENT.md                  # Deployment guide
│   ├── MULTI_TENANT.md                # Multi-tenant setup
│   └── AI_PROMPTS.md                  # LLM prompt engineering
│
└── 📁 /tests/
    ├── unit/                          # Unit tests
    ├── integration/                   # Integration tests
    └── e2e/                          # End-to-end tests
```

---

## 🔌 API Endpoints Documentation

### Core Application APIs

#### Property Management
```javascript
GET  /api/data/load-properties
     ?territory={hayward|oakland|fremont}
     ?limit={number}
     Response: Array of property objects

POST /api/data/save-tenant-data
     Body: { tenantId, data }
     Response: { success: true }

GET  /api/data/export-data
     ?format={csv|json|pdf}
     ?filters={...}
     Response: File download
```

#### AI/LLM Operations
```javascript
POST /api/ghost/analyze
     Body: { propertyData, context, query }
     Response: { analysis, recommendations, score }

POST /api/ghost/generate-email
     Body: { 
       propertyData, 
       ownerInfo, 
       notes, 
       emailType: 'outreach|followup|offer' 
     }
     Response: { subject, body, tone }

POST /api/ghost/memory-ops
     Body: { operation: 'save|retrieve|search', data }
     Response: { memories, context }
```

#### Data Enrichment
```javascript
POST /api/enrichment/browser-cloud
     Body: { address, dataPoints: ['beds','baths','sqft','value'] }
     Response: { enrichedData }

POST /api/enrichment/spokeo
     Body: { name, address }
     Response: { phone, email, relatives }

POST /api/enrichment/verify-contact
     Body: { phone, email }
     Response: { valid, carrier, type }
```

#### Communication
```javascript
POST /api/webhooks/twilio-sms
     Body: { to, message, propertyId }
     Response: { messageId, status }

GET  /api/webhooks/email-tracking/:trackingId
     Response: { opened, clicks, timestamp }
```

---

## 🧩 Component Architecture

### 1. Property Card Component
```javascript
class PropertyCard {
  constructor(property) {
    this.data = property;
    this.ui = {
      miniMap: MapboxGL instance,
      ownerInfo: ContactDetails,
      aiAssistant: AIChat,
      quickActions: ActionButtons,
      notes: NotesManager
    };
  }
  
  methods: {
    render(),
    updateData(),
    generateEmail(),
    addNote(),
    verify(),
    enrichData()
  }
}
```

### 2. AI Assistant Component
```javascript
class AIAssistant {
  constructor(propertyContext) {
    this.context = propertyContext;
    this.providers = {
      ghost: GhostConnector,
      groq: GroqAPI,
      openai: OpenAIAPI
    };
  }
  
  methods: {
    analyze(),
    generateEmail(),
    suggestStrategy(),
    predictResponse(),
    summarizeNotes()
  }
}
```

### 3. Map Controller
```javascript
class MapController {
  constructor(containerId) {
    this.map = new mapboxgl.Map();
    this.markers = PropertyMarkerManager;
    this.territories = TerritoryManager;
    this.heatmap = EquityHeatmap;
  }
  
  methods: {
    loadProperties(),
    filterByEquity(),
    drawTerritory(),
    routeToProperties(),
    toggleSatellite()
  }
}
```

---

## 💾 Data Structures

### Property Object
```json
{
  "id": "hayward_001",
  "address": "123 Main St, Hayward, CA 94541",
  "coordinates": { "lat": 37.6688, "lng": -122.0808 },
  "owner": {
    "name": "John Smith",
    "type": "absentee|owner_occupied",
    "phone": "510-555-0123",
    "email": "john@example.com",
    "mailing": "456 Other St, Phoenix, AZ"
  },
  "property": {
    "beds": 3,
    "baths": 2,
    "sqft": 1200,
    "lot": 5000,
    "year": 1990,
    "type": "single_family"
  },
  "financial": {
    "value": 850000,
    "lastSale": { "date": "2000-01-15", "price": 150000 },
    "equity": 67,
    "lender": "Chase",
    "loanDate": "2000-01-15"
  },
  "enrichment": {
    "verified": false,
    "lastUpdated": null,
    "source": null
  },
  "activity": {
    "lastContact": "2025-08-15T12:49:54",
    "notes": ["Not home", "High equity opportunity"],
    "tags": ["hot", "absentee", "high-equity"],
    "status": "follow-up"
  },
  "tenant": "jeff_harrison"  // Multi-tenant identifier
}
```

---

## 🚀 Deployment Architecture

### Static Hosting (Vercel/Netlify)
```yaml
# vercel.json
{
  "functions": {
    "api/**/*.js": {
      "maxDuration": 30
    }
  },
  "rewrites": [
    { "source": "/:tenant", "destination": "/index.html" }
  ]
}
```

### Multi-Tenant URLs
```
https://legacy-compass.com/jeff     → Jeff's properties
https://legacy-compass.com/anna     → Anna's properties  
https://legacy-compass.com/les      → Les's full territory
```

### Environment Variables
```bash
# .env.example
MAPBOX_TOKEN=pk.xxx
GHOST_API_URL=https://ghost-backend.com
GROQ_API_KEY=gsk_xxx
OPENAI_API_KEY=sk-xxx
BROWSER_CLOUD_KEY=xxx
SPOKEO_API_KEY=xxx
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=xxx
```

---

## 📱 PWA Configuration

### manifest.json
```json
{
  "name": "Legacy Compass",
  "short_name": "LegacyC",
  "description": "Bloomberg Terminal of Real Estate",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0b0f19",
  "theme_color": "#49e0e8",
  "icons": [
    {
      "src": "/assets/icons/app-icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/assets/icons/app-icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

---

## 🔄 Development Workflow

### Phase 1: Foundation (Day 1-2)
- [ ] Set up project structure
- [ ] Load 68k properties
- [ ] Basic map with Mapbox GL
- [ ] Property cards UI

### Phase 2: Core Features (Day 3-4)
- [ ] CSV upload system
- [ ] Custom tagging
- [ ] Voice notes
- [ ] Search & filter

### Phase 3: AI Integration (Day 5-6)
- [ ] Ghost backend connection
- [ ] Email generation
- [ ] Property analysis
- [ ] FastVLM vision

### Phase 4: Polish & Deploy (Day 7)
- [ ] PWA setup
- [ ] Multi-tenant routing
- [ ] Performance optimization
- [ ] Deploy to production

---

## 🎯 Success Metrics

- **Load Time:** < 2 seconds
- **Offline:** 100% functionality
- **Properties:** 68,733 loaded
- **Enrichment:** 90% accuracy
- **Email Personalization:** Context-aware
- **Cost:** $0 (free tier hosting)

---

*This architecture document is the single source of truth for Legacy Compass development.*