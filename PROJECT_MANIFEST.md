# Legacy Compass Project Manifest
## Implementation Roadmap & Technical Specifications

**Project:** Legacy Compass - Bloomberg Terminal of Real Estate  
**Client:** Les's Brokerage (#1 for 40 years, $144M volume)  
**Timeline:** 7 Days (Aug 30 - Sep 6, 2025)  
**Budget:** $0 (using free tiers initially)

---

## 🎯 Project Goals

### Primary Objectives
1. **Replace $5,000/month CRM stack** with unified platform
2. **Load 68,733 Hayward properties** with enrichment pipeline
3. **Enable multi-tenant deployment** for individual realtors
4. **Integrate AI assistant** for personalized outreach
5. **Deploy as PWA** for immediate mobile use

### Success Criteria
- ✅ 100% of Hayward properties loaded and searchable
- ✅ < 2 second load time
- ✅ Works offline with full functionality
- ✅ AI generates personalized emails with context
- ✅ Realtors can upload their own CSV farms

---

## 🛠️ Technical Stack

### Frontend
```yaml
Core:
  - HTML5 + Semantic markup
  - JavaScript ES6+ (no build step required)
  - CSS3 with CSS Variables for theming
  
Frameworks:
  - Alpine.js 3.x for reactivity
  - Mapbox GL JS 3.x for mapping
  - No React/Vue (keeping it simple)

Storage:
  - LocalStorage for settings
  - IndexedDB for 68k properties
  - Service Worker for offline cache
```

### Backend (Serverless)
```yaml
Functions:
  - Vercel Functions (Node.js)
  - Edge Functions for geo-routing
  
APIs:
  - Ghost v9 for AI operations
  - Groq/OpenAI for quick LLM
  - Browser Use Cloud for scraping
  - Spokeo/BeenVerified for phones
  
Database:
  - Static JSON initially (68k properties)
  - Supabase for multi-tenant sync (later)
```

### AI/ML Stack
```yaml
LLM Providers:
  - Ghost v9 (primary, complex analysis)
  - Groq (fast, cheap inference)
  - OpenAI GPT-4 (fallback)
  
Vision:
  - Apple FastVLM (property photos)
  - On-device processing for privacy
  
Voice:
  - Web Speech API (STT)
  - Browser native (no external deps)
```

---

## 📋 Implementation Phases

### Phase 1: Foundation (Day 1-2)
**Goal:** Basic working app with map and properties

```markdown
Day 1 Morning:
□ Create folder structure
□ Set up index.html with Mapbox
□ Load sample 100 properties
□ Basic property cards

Day 1 Afternoon:
□ Implement search/filter
□ Add property details panel
□ Create responsive layout
□ Test on mobile

Day 2 Morning:
□ Load full 68k dataset
□ Optimize performance (virtualization)
□ Add LocalStorage persistence
□ Implement basic routing

Day 2 Afternoon:
□ Create CSV upload interface
□ Parse and map columns
□ Merge with existing data
□ Export functionality
```

### Phase 2: Core Features (Day 3-4)
**Goal:** Complete farming functionality

```markdown
Day 3 Morning:
□ Custom tagging system
□ Tag-based filtering
□ Hot list management
□ Activity tracking

Day 3 Afternoon:
□ Voice note recording
□ Note management system
□ Click-to-call implementation
□ Email templates

Day 4 Morning:
□ Territory drawing tools
□ Route optimization
□ Driving directions
□ Property clustering

Day 4 Afternoon:
□ Equity heat mapping
□ Absentee owner filtering
□ Advanced search
□ Bulk operations
```

### Phase 3: AI Integration (Day 5-6)
**Goal:** Smart features and enrichment

```markdown
Day 5 Morning:
□ Ghost backend connection
□ AI assistant UI component
□ Email generation API
□ Property analysis

Day 5 Afternoon:
□ Enrichment queue system
□ Browser Cloud integration
□ Phone number lookup
□ Verification UI

Day 6 Morning:
□ FastVLM integration
□ Photo analysis pipeline
□ Vacancy detection
□ Condition assessment

Day 6 Afternoon:
□ LLM verification system
□ Personalized outreach
□ Local events integration
□ Smart suggestions
```

### Phase 4: Production (Day 7)
**Goal:** Deploy and multi-tenant setup

```markdown
Day 7 Morning:
□ PWA manifest creation
□ Service worker setup
□ Icon generation
□ Offline testing

Day 7 Afternoon:
□ Deploy to Vercel
□ Multi-tenant routing
□ Performance optimization
□ Documentation
```

---

## 📁 File Creation Order

### Critical Path (Must Have First)
```
1. index.html                 # Main app structure
2. js/app.js                  # Core application logic
3. js/mapbox-init.js          # Map initialization
4. js/property-loader.js      # Load 68k properties
5. css/styles.css             # Base styling
```

### Secondary Features
```
6. js/search-engine.js        # Search functionality
7. js/csv-importer.js         # CSV upload
8. js/tagging-system.js       # Custom tags
9. js/storage-manager.js      # Data persistence
10. js/voice-recorder.js      # Voice notes
```

### AI Features
```
11. js/ai-assistant.js        # AI integration
12. js/ghost-connector.js     # Ghost backend
13. js/email-generator.js     # Email composition
14. js/data-enrichment.js     # Enrichment pipeline
15. js/fastvlm-vision.js      # Photo analysis
```

### PWA & Deploy
```
16. manifest.json             # PWA manifest
17. service-worker.js         # Offline support
18. vercel.json              # Deployment config
19. .env.example             # Environment template
20. API functions            # Serverless endpoints
```

---

## 🔧 Development Setup

### Local Development
```bash
# Clone repository
git clone [repo-url]
cd Legacy_Compass

# Install minimal deps (mostly for API functions)
npm init -y
npm install mapbox-gl alpinejs

# Copy environment variables
cp .env.example .env
# Add your API keys

# Start local server
python -m http.server 8000
# OR
npx serve .

# Access at http://localhost:8000
```

### API Keys Required
```env
MAPBOX_TOKEN=             # Required for maps
GHOST_API_URL=            # Optional (AI features)
GROQ_API_KEY=             # Optional (fast LLM)
BROWSER_CLOUD_KEY=        # Optional (enrichment)
SPOKEO_API_KEY=           # Optional (phone lookup)
```

---

## 🚀 Deployment Strategy

### Static Hosting (Vercel)
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Production deploy
vercel --prod

# Custom domain
vercel domains add legacy-compass.com
```

### Multi-Tenant Setup
```javascript
// Route structure
legacy-compass.com/          # Landing page
legacy-compass.com/jeff      # Jeff's instance
legacy-compass.com/anna      # Anna's instance
legacy-compass.com/les       # Les's full territory

// Tenant detection
const tenant = window.location.pathname.split('/')[1] || 'default';
const tenantData = await loadTenantData(tenant);
```

---

## 📊 Data Management

### Initial Data Load
```javascript
// 68k properties in compressed JSON (~5MB)
const properties = await fetch('/data/hayward_68k.json')
  .then(r => r.json());

// Store in IndexedDB for persistence
await db.properties.bulkAdd(properties);
```

### Enrichment Strategy
```javascript
// Queue-based enrichment (don't overwhelm APIs)
const enrichmentQueue = new Queue({
  concurrency: 3,
  interval: 1000, // 1 req/second
  retries: 3
});

// Priority enrichment for viewed properties
enrichmentQueue.prioritize(propertyId);
```

---

## 🎨 UI/UX Guidelines

### Design Principles
- **Dark mode first** (like Bloomberg Terminal)
- **Information density** (show lots of data)
- **Touch-friendly** (mobile farming)
- **Offline-first** (works in dead zones)
- **Fast interactions** (< 100ms response)

### Color Palette
```css
:root {
  --bg: #0b0f19;        /* Dark background */
  --panel: #0d1324;     /* Panel background */
  --text: #eaf3ff;      /* Primary text */
  --muted: #9fb4df;     /* Secondary text */
  --neon: #49e0e8;      /* Accent cyan */
  --green: #22c55e;     /* Success/equity */
  --red: #ef4444;       /* Alerts */
}
```

---

## 📈 Performance Targets

### Metrics
```yaml
Initial Load: < 2 seconds
Interaction: < 100ms
Search: < 50ms (client-side)
Map Pan: 60fps
Offline: 100% functional
Bundle Size: < 500KB (excluding map)
```

### Optimization Techniques
- Virtual scrolling for 68k properties
- Web Workers for heavy computation
- Lazy load map tiles
- IndexedDB for data persistence
- Service Worker aggressive caching

---

## 🔒 Security Considerations

### Client-Side
- API keys in environment variables only
- No sensitive data in LocalStorage
- HTTPS only deployment
- Content Security Policy headers

### Multi-Tenant Isolation
- Tenant ID validation
- Separate data namespaces
- Row-level security (when using Supabase)
- API rate limiting per tenant

---

## 📝 Testing Strategy

### Manual Testing Checklist
```markdown
□ Load 68k properties
□ Search by address/owner
□ Filter by equity %
□ Upload CSV file
□ Add custom tags
□ Record voice note
□ Generate AI email
□ Work offline
□ Export data
□ Mobile responsive
```

### Browser Support
- Chrome 90+ (primary)
- Safari 14+ (iOS)
- Firefox 88+ (secondary)
- Edge 90+ (secondary)

---

## 🎯 MVP Definition

### Must Have (Day 1-4)
- ✅ Map with 68k properties
- ✅ Search and filter
- ✅ Property details
- ✅ CSV upload
- ✅ Custom tags
- ✅ Export data

### Should Have (Day 5-6)
- ⏳ AI email generation
- ⏳ Voice notes
- ⏳ Data enrichment
- ⏳ Phone verification

### Nice to Have (Day 7+)
- ⏰ FastVLM photo analysis
- ⏰ Multi-tenant sync
- ⏰ Email tracking
- ⏰ Team collaboration

---

## 🚦 Go/No-Go Criteria

### Launch Requirements
1. **All 68k properties load** in < 2 seconds
2. **Search works** offline
3. **CSV upload** successful
4. **PWA installable** on mobile
5. **AI generates** coherent emails

### Success Metrics (Week 1)
- 10+ realtors using daily
- 1000+ properties enriched
- 100+ AI emails generated
- 0 data loss incidents
- < 2 second load time maintained

---

## 📞 Support & Maintenance

### Documentation
- User guide (in-app)
- API documentation
- Video tutorials
- FAQ section

### Monitoring
- Vercel Analytics
- Error tracking (Sentry)
- API usage metrics
- User activity logs

---

## 🎉 Launch Plan

### Soft Launch (Day 7)
- Deploy to production
- Jeff & Anna test with real data
- Gather feedback
- Fix critical issues

### Full Launch (Week 2)
- Les's entire team onboarded
- Training session conducted
- Support system in place
- Iterate based on feedback

---

*This manifest is the definitive guide for Legacy Compass development. Follow the phases sequentially for guaranteed success.*