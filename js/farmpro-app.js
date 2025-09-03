/**
 * FarmPro App - Dark Theme Professional Real Estate Interface
 * Main application controller for Legacy Compass FarmPro UI
 */

class FarmProApp {
    constructor() {
        this.properties = [];
        this.filteredProperties = [];
        this.currentPage = 1;
        this.propertiesPerPage = 50;
        this.selectedProperty = null;
        this.tags = new Set();
        this.notes = {};
        this.voiceNotes = {};
        
        // Initialize on DOM ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }
    
    init() {
        console.log('🚀 FarmPro App initializing...');
        
        // Load saved data
        this.loadFromLocalStorage();
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Load initial data if available
        this.loadPropertiesFromStorage();
        
        // Initialize map if needed
        this.initializeMiniMap();
        
        console.log('✅ FarmPro App ready');
    }
    
    setupEventListeners() {
        // CSV Upload
        const csvInput = document.getElementById('csvInput');
        if (csvInput) {
            csvInput.addEventListener('change', (e) => this.handleCSVUpload(e));
        }
        
        // Search
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
        }
        
        // Filters
        const filterButtons = document.querySelectorAll('[data-filter]');
        filterButtons.forEach(button => {
            button.addEventListener('click', (e) => this.handleFilter(e.target.dataset.filter));
        });
        
        // Notes saving
        const notesTextarea = document.getElementById('propertyNotes');
        if (notesTextarea) {
            notesTextarea.addEventListener('blur', () => this.saveNotes());
        }
        
        // Voice recording
        const voiceBtn = document.getElementById('voiceRecordBtn');
        if (voiceBtn) {
            voiceBtn.addEventListener('click', () => this.toggleVoiceRecording());
        }
        
        // Action buttons
        this.setupActionButtons();
    }
    
    setupActionButtons() {
        // Call button
        const callBtn = document.getElementById('callBtn');
        if (callBtn) {
            callBtn.addEventListener('click', () => this.handleCall());
        }
        
        // Text button
        const textBtn = document.getElementById('textBtn');
        if (textBtn) {
            textBtn.addEventListener('click', () => this.handleText());
        }
        
        // Email button
        const emailBtn = document.getElementById('emailBtn');
        if (emailBtn) {
            emailBtn.addEventListener('click', () => this.handleEmail());
        }
        
        // Route button
        const routeBtn = document.getElementById('routeBtn');
        if (routeBtn) {
            routeBtn.addEventListener('click', () => this.handleRoute());
        }
        
        // Mailer button
        const mailerBtn = document.getElementById('mailerBtn');
        if (mailerBtn) {
            mailerBtn.addEventListener('click', () => this.handleMailer());
        }
    }
    
    handleCSVUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const csv = e.target.result;
            this.parseCSV(csv);
        };
        reader.readAsText(file);
    }
    
    parseCSV(csv) {
        const lines = csv.split('\n').filter(line => line.trim());
        if (lines.length < 2) {
            alert('CSV file appears to be empty');
            return;
        }
        
        const headers = this.parseCSVLine(lines[0]);
        console.log('📊 CSV Headers:', headers);
        
        // Map Jeff's CSV columns
        const columnMap = {
            address: this.findColumn(headers, ['Site Address', 'site address', 'address', 'property address']),
            owner: this.findColumn(headers, ['All Owners', 'all owners', 'owner', 'owner name']),
            lat: this.findColumn(headers, ['Latitude', 'latitude', 'lat']),
            lng: this.findColumn(headers, ['Longitude', 'longitude', 'lng', 'lon']),
            absentee: this.findColumn(headers, ['Owner Occupied', 'owner occupied', 'absentee']),
            equity: this.findColumn(headers, ['Equity', 'equity', 'equity %', 'equity_percent']),
            phone: this.findColumn(headers, ['Phone', 'phone', 'Phone Number', 'phone number']),
            email: this.findColumn(headers, ['Email', 'email', 'Email Address', 'email address']),
            bedrooms: this.findColumn(headers, ['Bedrooms', 'bedrooms', 'beds', 'Beds']),
            bathrooms: this.findColumn(headers, ['Bathrooms', 'bathrooms', 'baths', 'Baths']),
            sqft: this.findColumn(headers, ['Building Area', 'building area', 'sqft', 'square feet']),
            yearBuilt: this.findColumn(headers, ['Year Built', 'year built', 'year_built']),
            purchasePrice: this.findColumn(headers, ['Sale Amount', 'sale amount', 'purchase price', 'last sale']),
            purchaseDate: this.findColumn(headers, ['Sale Date', 'sale date', 'purchase date']),
            mailingAddress: this.findColumn(headers, ['Mail Address', 'mail address', 'mailing address']),
            propertyType: this.findColumn(headers, ['Property Type', 'property type', 'type'])
        };
        
        this.properties = [];
        
        for (let i = 1; i < lines.length; i++) {
            const values = this.parseCSVLine(lines[i]);
            if (values.length < 2) continue;
            
            const property = {
                id: `prop_${i}`,
                address: values[columnMap.address] || 'Unknown Address',
                owner: values[columnMap.owner] || 'Unknown Owner',
                lat: parseFloat(values[columnMap.lat]) || null,
                lng: parseFloat(values[columnMap.lng]) || null,
                isAbsentee: columnMap.absentee !== -1 ? values[columnMap.absentee] === 'N' : false,
                equity: this.parseEquity(values[columnMap.equity]),
                phone: values[columnMap.phone] || '',
                email: values[columnMap.email] || '',
                bedrooms: parseInt(values[columnMap.bedrooms]) || 0,
                bathrooms: parseFloat(values[columnMap.bathrooms]) || 0,
                sqft: parseInt(values[columnMap.sqft]) || 0,
                yearBuilt: parseInt(values[columnMap.yearBuilt]) || 0,
                purchasePrice: this.parsePrice(values[columnMap.purchasePrice]),
                purchaseDate: values[columnMap.purchaseDate] || '',
                mailingAddress: values[columnMap.mailingAddress] || '',
                propertyType: this.detectPropertyType(values[columnMap.propertyType] || values[columnMap.address]),
                tags: [],
                notes: '',
                voiceNotes: []
            };
            
            // Auto-add tags based on data
            if (property.isAbsentee) property.tags.push('Absentee');
            if (property.equity > 50) property.tags.push('High Equity');
            if (property.equity > 70) property.tags.push('Hot');
            
            this.properties.push(property);
        }
        
        console.log(`✅ Loaded ${this.properties.length} properties`);
        this.filteredProperties = [...this.properties];
        this.saveToLocalStorage();
        this.renderProperties();
    }
    
    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim());
        return result;
    }
    
    findColumn(headers, possibleNames) {
        for (let name of possibleNames) {
            const index = headers.findIndex(h => 
                h.toLowerCase().trim() === name.toLowerCase()
            );
            if (index !== -1) return index;
        }
        return -1;
    }
    
    parseEquity(value) {
        if (!value) return 0;
        const cleaned = value.replace(/[^0-9.-]/g, '');
        return parseFloat(cleaned) || 0;
    }
    
    parsePrice(value) {
        if (!value) return 0;
        const cleaned = value.replace(/[^0-9.-]/g, '');
        return parseFloat(cleaned) || 0;
    }
    
    detectPropertyType(value) {
        const text = value.toLowerCase();
        if (text.includes('condo') || text.includes('condominium')) return 'Condo';
        if (text.includes('multi') || text.includes('duplex') || text.includes('triplex')) return 'Multi';
        if (text.includes('commercial') || text.includes('retail') || text.includes('office')) return 'Commercial';
        return 'SFR'; // Default to Single Family Residential
    }
    
    renderProperties() {
        const container = document.getElementById('propertiesContainer');
        if (!container) return;
        
        container.innerHTML = '';
        
        // Calculate pagination
        const startIndex = (this.currentPage - 1) * this.propertiesPerPage;
        const endIndex = startIndex + this.propertiesPerPage;
        const pageProperties = this.filteredProperties.slice(startIndex, endIndex);
        
        // Render each property card
        pageProperties.forEach(property => {
            const card = this.createPropertyCard(property);
            container.appendChild(card);
        });
        
        // Update stats
        this.updateStats();
    }
    
    createPropertyCard(property) {
        const card = document.createElement('div');
        card.className = 'bg-gray-800 rounded-lg p-4 hover:bg-gray-750 transition-colors cursor-pointer border border-gray-700';
        card.innerHTML = `
            <div class="flex justify-between items-start mb-3">
                <div class="flex-1">
                    <h3 class="text-white font-semibold text-sm mb-1">${property.address}</h3>
                    <p class="text-gray-400 text-xs">${property.owner}</p>
                </div>
                <div class="text-right">
                    <div class="text-cyan-400 font-bold text-lg">${property.equity.toFixed(0)}%</div>
                    <div class="text-gray-500 text-xs">Equity</div>
                </div>
            </div>
            
            <div class="flex gap-2 mb-3">
                ${property.isAbsentee ? '<span class="px-2 py-1 bg-yellow-900/50 text-yellow-400 text-xs rounded">Absentee</span>' : '<span class="px-2 py-1 bg-green-900/50 text-green-400 text-xs rounded">Owner</span>'}
                ${property.equity > 50 ? '<span class="px-2 py-1 bg-cyan-900/50 text-cyan-400 text-xs rounded">High Equity</span>' : ''}
                ${property.tags.map(tag => `<span class="px-2 py-1 bg-gray-700 text-gray-300 text-xs rounded">${tag}</span>`).join('')}
            </div>
            
            <div class="flex gap-2">
                <button onclick="farmProApp.focusProperty('${property.id}')" class="flex-1 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs rounded transition-colors">
                    <i class="fas fa-crosshairs mr-1"></i> Focus
                </button>
                <button onclick="farmProApp.showDetails('${property.id}')" class="flex-1 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded transition-colors">
                    <i class="fas fa-info-circle mr-1"></i> Details
                </button>
                <button onclick="farmProApp.startVoiceNote('${property.id}')" class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded transition-colors">
                    <i class="fas fa-microphone"></i>
                </button>
            </div>
        `;
        
        return card;
    }
    
    focusProperty(propertyId) {
        const property = this.properties.find(p => p.id === propertyId);
        if (!property || !property.lat || !property.lng) {
            alert('No GPS coordinates for this property');
            return;
        }
        
        // If we have a main map, center on property
        if (window.mainMap) {
            window.mainMap.setCenter([property.lng, property.lat]);
            window.mainMap.setZoom(18);
        }
    }
    
    showDetails(propertyId) {
        const property = this.properties.find(p => p.id === propertyId);
        if (!property) return;
        
        this.selectedProperty = property;
        
        // Update detail panel
        document.getElementById('detailAddress').textContent = property.address;
        document.getElementById('detailOwner').textContent = property.owner;
        document.getElementById('detailPhone').textContent = property.phone || 'Not available';
        document.getElementById('detailEmail').textContent = property.email || 'Not available';
        document.getElementById('detailBeds').textContent = property.bedrooms || 'N/A';
        document.getElementById('detailBaths').textContent = property.bathrooms || 'N/A';
        document.getElementById('detailSqft').textContent = property.sqft ? `${property.sqft.toLocaleString()} sq ft` : 'N/A';
        document.getElementById('detailYear').textContent = property.yearBuilt || 'N/A';
        document.getElementById('detailEquity').textContent = `${property.equity.toFixed(0)}%`;
        document.getElementById('detailPurchasePrice').textContent = property.purchasePrice ? `$${property.purchasePrice.toLocaleString()}` : 'N/A';
        
        // Load notes
        const notesTextarea = document.getElementById('propertyNotes');
        if (notesTextarea) {
            notesTextarea.value = this.notes[propertyId] || '';
        }
        
        // Update mini map
        if (property.lat && property.lng) {
            this.updateMiniMap(property.lat, property.lng);
        }
        
        // Show detail panel
        const detailPanel = document.getElementById('propertyDetail');
        if (detailPanel) {
            detailPanel.classList.remove('hidden');
        }
    }
    
    initializeMiniMap() {
        // Initialize a small map for property detail view
        const mapContainer = document.getElementById('miniMap');
        if (!mapContainer) return;
        
        // We'll initialize this when a property is selected
    }
    
    updateMiniMap(lat, lng) {
        const mapContainer = document.getElementById('miniMap');
        if (!mapContainer) return;
        
        // Clear existing map
        mapContainer.innerHTML = '';
        
        // Create simple map placeholder for now
        mapContainer.innerHTML = `
            <div class="flex items-center justify-center h-full bg-gray-800 rounded">
                <div class="text-center text-gray-400">
                    <i class="fas fa-map-marker-alt text-3xl mb-2"></i>
                    <p class="text-xs">${lat.toFixed(4)}, ${lng.toFixed(4)}</p>
                </div>
            </div>
        `;
    }
    
    handleCall() {
        if (!this.selectedProperty || !this.selectedProperty.phone) {
            alert('No phone number available for this property');
            return;
        }
        window.location.href = `tel:${this.selectedProperty.phone}`;
    }
    
    handleText() {
        if (!this.selectedProperty || !this.selectedProperty.phone) {
            alert('No phone number available for this property');
            return;
        }
        window.location.href = `sms:${this.selectedProperty.phone}`;
    }
    
    handleEmail() {
        if (!this.selectedProperty || !this.selectedProperty.email) {
            alert('No email address available for this property');
            return;
        }
        window.location.href = `mailto:${this.selectedProperty.email}`;
    }
    
    handleRoute() {
        if (!this.selectedProperty) return;
        const address = encodeURIComponent(this.selectedProperty.address);
        window.open(`https://maps.google.com/?q=${address}`, '_blank');
    }
    
    handleMailer() {
        if (!this.selectedProperty) return;
        alert(`Mailer feature coming soon for:\n${this.selectedProperty.address}\n${this.selectedProperty.mailingAddress || this.selectedProperty.address}`);
    }
    
    startVoiceNote(propertyId) {
        // Voice recording placeholder
        alert('Voice recording feature coming soon!');
        // Will integrate with Web Audio API
    }
    
    toggleVoiceRecording() {
        // Voice recording for detail view
        alert('Voice recording feature coming soon!');
    }
    
    saveNotes() {
        if (!this.selectedProperty) return;
        
        const notesTextarea = document.getElementById('propertyNotes');
        if (notesTextarea) {
            this.notes[this.selectedProperty.id] = notesTextarea.value;
            this.saveToLocalStorage();
            console.log('💾 Notes saved for', this.selectedProperty.address);
        }
    }
    
    handleSearch(query) {
        if (!query) {
            this.filteredProperties = [...this.properties];
        } else {
            const searchTerm = query.toLowerCase();
            this.filteredProperties = this.properties.filter(p => 
                p.address.toLowerCase().includes(searchTerm) ||
                p.owner.toLowerCase().includes(searchTerm) ||
                p.tags.some(tag => tag.toLowerCase().includes(searchTerm))
            );
        }
        this.currentPage = 1;
        this.renderProperties();
    }
    
    handleFilter(filterType) {
        switch(filterType) {
            case 'all':
                this.filteredProperties = [...this.properties];
                break;
            case 'hot':
                this.filteredProperties = this.properties.filter(p => p.equity > 50 && p.isAbsentee);
                break;
            case 'absentee':
                this.filteredProperties = this.properties.filter(p => p.isAbsentee);
                break;
            case 'highEquity':
                this.filteredProperties = this.properties.filter(p => p.equity > 50);
                break;
            case 'sfr':
                this.filteredProperties = this.properties.filter(p => p.propertyType === 'SFR');
                break;
            case 'condo':
                this.filteredProperties = this.properties.filter(p => p.propertyType === 'Condo');
                break;
            case 'multi':
                this.filteredProperties = this.properties.filter(p => p.propertyType === 'Multi');
                break;
            case 'commercial':
                this.filteredProperties = this.properties.filter(p => p.propertyType === 'Commercial');
                break;
        }
        this.currentPage = 1;
        this.renderProperties();
    }
    
    updateStats() {
        const statsContainer = document.getElementById('statsContainer');
        if (!statsContainer) return;
        
        const absenteeCount = this.filteredProperties.filter(p => p.isAbsentee).length;
        const highEquityCount = this.filteredProperties.filter(p => p.equity > 50).length;
        const hotCount = this.filteredProperties.filter(p => p.equity > 50 && p.isAbsentee).length;
        
        statsContainer.innerHTML = `
            <div class="flex gap-4 text-sm">
                <span class="text-gray-400">Total: <span class="text-white font-semibold">${this.filteredProperties.length}</span></span>
                <span class="text-gray-400">Absentee: <span class="text-yellow-400 font-semibold">${absenteeCount}</span></span>
                <span class="text-gray-400">High Equity: <span class="text-cyan-400 font-semibold">${highEquityCount}</span></span>
                <span class="text-gray-400">Hot: <span class="text-red-400 font-semibold">${hotCount}</span></span>
            </div>
        `;
    }
    
    saveToLocalStorage() {
        localStorage.setItem('farmPro_properties', JSON.stringify(this.properties));
        localStorage.setItem('farmPro_notes', JSON.stringify(this.notes));
        localStorage.setItem('farmPro_voiceNotes', JSON.stringify(this.voiceNotes));
        localStorage.setItem('farmPro_tags', JSON.stringify([...this.tags]));
    }
    
    loadFromLocalStorage() {
        try {
            const savedProperties = localStorage.getItem('farmPro_properties');
            if (savedProperties) {
                this.properties = JSON.parse(savedProperties);
                this.filteredProperties = [...this.properties];
            }
            
            const savedNotes = localStorage.getItem('farmPro_notes');
            if (savedNotes) {
                this.notes = JSON.parse(savedNotes);
            }
            
            const savedVoiceNotes = localStorage.getItem('farmPro_voiceNotes');
            if (savedVoiceNotes) {
                this.voiceNotes = JSON.parse(savedVoiceNotes);
            }
            
            const savedTags = localStorage.getItem('farmPro_tags');
            if (savedTags) {
                this.tags = new Set(JSON.parse(savedTags));
            }
        } catch (error) {
            console.error('Error loading from localStorage:', error);
        }
    }
    
    loadPropertiesFromStorage() {
        if (this.properties.length > 0) {
            this.renderProperties();
        }
    }
    
    exportData() {
        const dataStr = JSON.stringify({
            properties: this.properties,
            notes: this.notes,
            voiceNotes: this.voiceNotes,
            tags: [...this.tags]
        }, null, 2);
        
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `farmPro_export_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
    }
}

// Initialize the app
const farmProApp = new FarmProApp();

// Make it globally accessible
window.farmProApp = farmProApp;