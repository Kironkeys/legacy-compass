# Legacy Compass API Endpoints
## Complete API Documentation

---

## 🔐 Authentication
All API endpoints require authentication token in header:
```
Authorization: Bearer {token}
X-Tenant-ID: {tenant_id}
```

---

## 📊 Property APIs

### Load Properties
```http
GET /api/data/load-properties
```

**Query Parameters:**
- `territory` (string): hayward | oakland | fremont
- `limit` (number): Max properties to return
- `offset` (number): Pagination offset
- `filters` (object): JSON filter object

**Response:**
```json
{
  "success": true,
  "count": 68733,
  "properties": [
    {
      "id": "hayward_001",
      "address": "123 Main St",
      "owner": {...},
      "financial": {...}
    }
  ],
  "pagination": {
    "total": 68733,
    "limit": 1000,
    "offset": 0
  }
}
```

### Save Property Update
```http
POST /api/data/update-property
```

**Request Body:**
```json
{
  "propertyId": "hayward_001",
  "updates": {
    "owner.phone": "510-555-0123",
    "activity.lastContact": "2025-08-30T10:00:00Z",
    "activity.notes": ["Called, interested in selling"]
  }
}
```

---

## 🤖 AI/LLM APIs

### Analyze Property
```http
POST /api/ghost/analyze
```

**Request Body:**
```json
{
  "propertyData": {
    "address": "123 Main St",
    "equity": 67,
    "owner": "absentee",
    "lastSale": "2000-01-15"
  },
  "context": {
    "notes": ["Not home", "High equity"],
    "marketTrends": "rising"
  },
  "query": "What's the best approach for this property?"
}
```

**Response:**
```json
{
  "analysis": {
    "opportunity_score": 9.2,
    "key_factors": [
      "High equity (67%)",
      "Absentee owner",
      "Property held 25+ years"
    ],
    "recommended_approach": "Focus on equity position and tax benefits",
    "talking_points": [
      "Capital gains considerations",
      "Current market peak",
      "Rental income potential"
    ]
  }
}
```

### Generate Email
```http
POST /api/ghost/generate-email
```

**Request Body:**
```json
{
  "propertyData": {
    "address": "123 Main St",
    "owner": "Teresa Martinez",
    "equity": 67,
    "type": "absentee"
  },
  "ownerInfo": {
    "name": "Teresa Martinez",
    "phone": "602-555-7100",
    "mailing": "Phoenix, AZ"
  },
  "notes": [
    "8/15/2025 - not home",
    "Neighbor says travels frequently"
  ],
  "emailType": "initial_outreach",
  "tone": "professional_friendly",
  "includeLocalEvents": true
}
```

**Response:**
```json
{
  "subject": "Your Hayward Property - Maximizing 67% Equity",
  "body": "Dear Teresa,\n\nI hope this message finds you well in Phoenix...",
  "metadata": {
    "personalization_score": 8.5,
    "key_points_included": [
      "High equity mention",
      "Absentee owner benefits",
      "Local event reference"
    ]
  }
}
```

### Generate Strategy
```http
POST /api/ghost/strategy
```

**Request Body:**
```json
{
  "properties": ["hayward_001", "hayward_002"],
  "goal": "maximize_conversions",
  "timeframe": "30_days"
}
```

---

## 🔍 Enrichment APIs

### Browser Cloud Enrichment
```http
POST /api/enrichment/browser-cloud
```

**Request Body:**
```json
{
  "address": "123 Main St, Hayward, CA 94541",
  "dataPoints": [
    "beds",
    "baths",
    "sqft",
    "current_value",
    "tax_assessment",
    "last_sale"
  ],
  "sources": ["zillow", "redfin", "county_records"]
}
```

**Response:**
```json
{
  "success": true,
  "enrichedData": {
    "beds": 3,
    "baths": 2,
    "sqft": 1200,
    "current_value": 850000,
    "tax_assessment": 750000,
    "last_sale": {
      "date": "2000-01-15",
      "price": 150000
    }
  },
  "source": "zillow",
  "confidence": 0.95,
  "timestamp": "2025-08-30T10:00:00Z"
}
```

### Phone Lookup (Spokeo)
```http
POST /api/enrichment/spokeo
```

**Request Body:**
```json
{
  "name": "Teresa Martinez",
  "address": "123 Main St, Hayward, CA",
  "includeRelatives": true
}
```

**Response:**
```json
{
  "primary_phone": "602-555-7100",
  "phones": [
    {"number": "602-555-7100", "type": "mobile", "carrier": "Verizon"}
  ],
  "emails": ["teresa.m@example.com"],
  "relatives": [
    {"name": "Carlos Martinez", "relation": "spouse"}
  ]
}
```

### Verify Contact
```http
POST /api/enrichment/verify-contact
```

**Request Body:**
```json
{
  "phone": "602-555-7100",
  "email": "teresa@example.com"
}
```

**Response:**
```json
{
  "phone": {
    "valid": true,
    "type": "mobile",
    "carrier": "Verizon",
    "can_receive_sms": true
  },
  "email": {
    "valid": true,
    "deliverable": true,
    "domain": "example.com"
  }
}
```

---

## 📧 Communication APIs

### Send SMS
```http
POST /api/webhooks/twilio-sms
```

**Request Body:**
```json
{
  "to": "+16025557100",
  "message": "Hi Teresa, following up on your Hayward property...",
  "propertyId": "hayward_001",
  "scheduledTime": null
}
```

### Track Email
```http
GET /api/webhooks/email-tracking/:trackingId
```

**Response:**
```json
{
  "trackingId": "trk_abc123",
  "propertyId": "hayward_001",
  "sent": "2025-08-30T10:00:00Z",
  "opened": true,
  "openedAt": "2025-08-30T14:30:00Z",
  "clicks": [
    {
      "url": "https://legacy-compass.com/property/hayward_001",
      "timestamp": "2025-08-30T14:31:00Z"
    }
  ]
}
```

---

## 📁 Data Management APIs

### Import CSV
```http
POST /api/data/import-csv
```

**Request Body (multipart/form-data):**
- `file`: CSV file
- `mapping`: Column mapping configuration
- `tenantId`: Tenant identifier

**Response:**
```json
{
  "success": true,
  "imported": 723,
  "failed": 2,
  "errors": [
    {"row": 45, "error": "Invalid address format"},
    {"row": 112, "error": "Duplicate property"}
  ]
}
```

### Export Data
```http
GET /api/data/export
```

**Query Parameters:**
- `format`: csv | json | pdf
- `filters`: URL-encoded filter object
- `fields`: Comma-separated field list

**Response:** File download

---

## 🏠 Multi-Tenant APIs

### Get Tenant Config
```http
GET /api/tenant/:tenantId/config
```

**Response:**
```json
{
  "tenantId": "jeff_harrison",
  "name": "Jeff Harrison",
  "territory": "hayward",
  "settings": {
    "defaultView": "map",
    "autoEnrich": true,
    "aiProvider": "ghost"
  },
  "limits": {
    "properties": 5000,
    "enrichmentCredits": 1000
  }
}
```

### Save Tenant Data
```http
POST /api/tenant/:tenantId/save
```

**Request Body:**
```json
{
  "properties": [...],
  "tags": [...],
  "settings": {...},
  "lastSync": "2025-08-30T10:00:00Z"
}
```

---

## 🎤 Voice APIs

### Upload Voice Note
```http
POST /api/voice/upload
```

**Request Body (multipart/form-data):**
- `audio`: Audio file (webm/mp3)
- `propertyId`: Associated property
- `duration`: Recording duration in seconds

**Response:**
```json
{
  "transcription": "Visited property, no one home, grass overgrown",
  "summary": "Property appears vacant",
  "keywords": ["vacant", "overgrown"],
  "saved": true
}
```

---

## 📸 Vision APIs (FastVLM)

### Analyze Property Photo
```http
POST /api/vision/analyze
```

**Request Body (multipart/form-data):**
- `image`: Photo file
- `propertyId`: Associated property
- `analysisType`: vacancy | condition | features

**Response:**
```json
{
  "analysis": {
    "vacancy_indicators": [
      "Overgrown lawn",
      "Accumulated mail",
      "No vehicles"
    ],
    "condition": "fair",
    "maintenance_needed": ["Landscaping", "Exterior paint"],
    "confidence": 0.87
  }
}
```

---

## 🔄 Webhook Endpoints

### Receive SMS Reply
```http
POST /api/webhooks/twilio-inbound
```

**Twilio Webhook Format**

### Email Open Tracking
```http
GET /api/webhooks/email-open/:trackingId.gif
```

**Returns 1x1 transparent pixel**

---

## 📈 Analytics APIs

### Get Activity Stats
```http
GET /api/analytics/activity
```

**Query Parameters:**
- `tenantId`: Tenant identifier
- `dateFrom`: Start date
- `dateTo`: End date

**Response:**
```json
{
  "calls": 45,
  "emails": 120,
  "propertyViews": 320,
  "notesAdded": 89,
  "conversions": 3
}
```

---

## 🚨 Error Responses

All APIs return consistent error format:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_PROPERTY_ID",
    "message": "Property not found",
    "details": "Property ID hayward_999 does not exist"
  }
}
```

**Common Error Codes:**
- `UNAUTHORIZED` - Invalid or missing auth token
- `TENANT_NOT_FOUND` - Invalid tenant ID
- `RATE_LIMIT` - Too many requests
- `INVALID_REQUEST` - Malformed request body
- `ENRICHMENT_FAILED` - External service error
- `INSUFFICIENT_CREDITS` - Out of enrichment credits

---

## 🔑 Rate Limits

- **Standard APIs:** 100 requests/minute
- **AI/LLM APIs:** 20 requests/minute
- **Enrichment APIs:** 10 requests/minute
- **Bulk Operations:** 5 requests/minute

---

*This API documentation is comprehensive and covers all Legacy Compass endpoints.*