// Test script for Legacy Compass
const puppeteer = require('puppeteer');

async function testLegacyCompass() {
    console.log('🚀 Starting Legacy Compass test...');
    
    let browser;
    try {
        // Launch browser
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const page = await browser.newPage();
        
        // Set up console message handler
        page.on('console', msg => {
            console.log(`Browser console [${msg.type()}]:`, msg.text());
        });
        
        // Set up error handler
        page.on('pageerror', error => {
            console.error('Page error:', error.message);
        });
        
        // Navigate to test page first
        console.log('📄 Loading data test page...');
        await page.goto('http://localhost:8080/test-data-loading.html', {
            waitUntil: 'networkidle0',
            timeout: 30000
        });
        
        // Wait for data to load
        await page.waitForSelector('#results h2', { timeout: 60000 });
        
        // Get test results
        const testResults = await page.evaluate(() => {
            const status = document.querySelector('#status')?.innerText;
            const results = document.querySelector('#results')?.innerText;
            return { status, results };
        });
        
        console.log('\n📊 Data Loading Test Results:');
        console.log(testResults.results);
        
        // Now test main application
        console.log('\n🏠 Testing main Legacy Compass app...');
        await page.goto('http://localhost:8080', {
            waitUntil: 'networkidle0',
            timeout: 30000
        });
        
        // Wait for Alpine to initialize
        await page.waitForFunction(() => window.Alpine !== undefined, { timeout: 10000 });
        
        // Check if data loader exists
        const dataLoaderExists = await page.evaluate(() => {
            return window.dataLoader !== undefined;
        });
        console.log('✓ Data loader exists:', dataLoaderExists);
        
        // Check if Alpine component is initialized
        const alpineData = await page.evaluate(() => {
            const component = document.querySelector('[x-data="legacyCompass"]');
            if (component && component.__x) {
                const data = component.__x.$data;
                return {
                    propertiesCount: data.properties.length,
                    filteredCount: data.filteredProperties.length,
                    isLoading: data.isLoading,
                    stats: data.stats
                };
            }
            return null;
        });
        
        if (alpineData) {
            console.log('✓ Alpine component initialized');
            console.log('  Properties loaded:', alpineData.propertiesCount);
            console.log('  Filtered properties:', alpineData.filteredCount);
            console.log('  Loading state:', alpineData.isLoading);
            console.log('  Stats:', alpineData.stats);
        } else {
            console.log('❌ Alpine component not initialized');
        }
        
        // Check if map is initialized
        const mapExists = await page.evaluate(() => {
            return window.mapController !== undefined && window.mapController.map !== undefined;
        });
        console.log('✓ Map controller exists:', mapExists);
        
        // Test search functionality
        console.log('\n🔍 Testing search...');
        await page.type('[x-model="addressSearch"]', '1234 Main St', { delay: 50 });
        await page.keyboard.press('Enter');
        await page.waitForTimeout(2000);
        
        // Check for toasts
        const toasts = await page.evaluate(() => {
            const component = document.querySelector('[x-data="legacyCompass"]');
            if (component && component.__x) {
                return component.__x.$data.toasts;
            }
            return [];
        });
        
        if (toasts.length > 0) {
            console.log('Toasts:', toasts.map(t => `${t.type}: ${t.message}`).join(', '));
        }
        
        // Take screenshot
        await page.screenshot({ path: 'legacy-compass-test.png', fullPage: true });
        console.log('✓ Screenshot saved as legacy-compass-test.png');
        
        console.log('\n✅ Test completed successfully!');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

// Run test
testLegacyCompass();