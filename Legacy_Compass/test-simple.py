#!/usr/bin/env python3
"""
Simple test script for Legacy Compass
Tests that all components are accessible and CSV loads correctly
"""

import requests
import csv
import json
import time
from urllib.parse import urljoin

BASE_URL = "http://localhost:8080"

def test_server():
    """Test if server is running"""
    try:
        r = requests.get(BASE_URL)
        print("✅ Server is running")
        return True
    except:
        print("❌ Server is not running at", BASE_URL)
        return False

def test_csv_file():
    """Test if CSV file is accessible"""
    try:
        url = urljoin(BASE_URL, "/data/hayward_owners.csv")
        r = requests.head(url)
        if r.status_code == 200:
            size_mb = int(r.headers.get('Content-Length', 0)) / 1024 / 1024
            print(f"✅ CSV file accessible ({size_mb:.1f} MB)")
            
            # Get first few lines
            r = requests.get(url, stream=True)
            lines = []
            for i, line in enumerate(r.iter_lines(decode_unicode=True)):
                lines.append(line)
                if i >= 5:
                    break
            
            print(f"   Headers: {lines[0]}")
            print(f"   Sample row: {lines[1][:100]}...")
            return True
        else:
            print(f"❌ CSV file not found (status: {r.status_code})")
            return False
    except Exception as e:
        print(f"❌ Error accessing CSV: {e}")
        return False

def test_javascript_files():
    """Test if all JavaScript files are accessible"""
    files = [
        "/js/config.js",
        "/js/data-loader.js", 
        "/js/app-simple.js",
        "/js/mapbox-init.js"
    ]
    
    all_good = True
    for file in files:
        try:
            url = urljoin(BASE_URL, file)
            r = requests.head(url)
            if r.status_code == 200:
                print(f"✅ {file} loaded")
            else:
                print(f"❌ {file} not found")
                all_good = False
        except:
            print(f"❌ Error loading {file}")
            all_good = False
    
    return all_good

def test_mapbox_token():
    """Check if Mapbox token is configured"""
    try:
        url = urljoin(BASE_URL, "/js/config.js")
        r = requests.get(url)
        if 'MAPBOX_TOKEN' in r.text and 'pk.' in r.text:
            print("✅ Mapbox token configured")
            return True
        else:
            print("❌ Mapbox token not configured")
            return False
    except:
        print("❌ Could not check Mapbox token")
        return False

def test_data_loading():
    """Test the data loading test page"""
    try:
        url = urljoin(BASE_URL, "/test-data-loading.html")
        r = requests.get(url)
        if r.status_code == 200:
            print("✅ Data loading test page accessible")
            print("   → Open http://localhost:8080/test-data-loading.html to see results")
            return True
        else:
            print("❌ Data loading test page not found")
            return False
    except:
        print("❌ Error accessing test page")
        return False

def analyze_csv():
    """Analyze the CSV data"""
    try:
        url = urljoin(BASE_URL, "/data/hayward_owners.csv")
        r = requests.get(url)
        lines = r.text.strip().split('\n')
        
        print(f"\n📊 CSV Analysis:")
        print(f"   Total rows: {len(lines) - 1:,} properties")
        
        # Count absentee owners
        absentee_count = 0
        for i, line in enumerate(lines[1:101], 1):  # Sample first 100
            if line.strip():
                parts = line.split(',')
                if len(parts) >= 4 and parts[3].strip().lower() == 'true':
                    absentee_count += 1
        
        print(f"   Absentee owners (sample): {absentee_count}/100")
        
        # Show unique streets (sample)
        streets = set()
        for i, line in enumerate(lines[1:1001], 1):  # Sample first 1000
            if line.strip():
                parts = line.split(',')
                if parts[0]:
                    # Extract street name
                    import re
                    match = re.search(r'\d+\s+(.+?)(?:\s+\d+)?$', parts[0])
                    if match:
                        streets.add(match.group(1))
        
        print(f"   Unique streets (sample): {len(streets)}")
        if streets:
            print(f"   Sample streets: {', '.join(list(streets)[:5])}")
        
        return True
    except Exception as e:
        print(f"❌ Error analyzing CSV: {e}")
        return False

def main():
    print("🧪 Testing Legacy Compass Components")
    print("=" * 50)
    
    tests = [
        ("Server Status", test_server),
        ("CSV File Access", test_csv_file),
        ("JavaScript Files", test_javascript_files),
        ("Mapbox Configuration", test_mapbox_token),
        ("Data Loading Test Page", test_data_loading),
        ("CSV Data Analysis", analyze_csv)
    ]
    
    results = []
    for name, test_func in tests:
        print(f"\n📍 {name}:")
        result = test_func()
        results.append((name, result))
        time.sleep(0.5)
    
    print("\n" + "=" * 50)
    print("📋 Test Summary:")
    passed = sum(1 for _, r in results if r)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"   {name}: {status}")
    
    print(f"\n🎯 Result: {passed}/{total} tests passed")
    
    if passed == total:
        print("✨ All tests passed! Legacy Compass is ready to use.")
        print("\n🚀 Next steps:")
        print("   1. Open http://localhost:8080 in your browser")
        print("   2. Wait for 68k properties to load")
        print("   3. Try searching for addresses")
        print("   4. Click on map markers to see details")
    else:
        print("\n⚠️  Some tests failed. Please check the errors above.")

if __name__ == "__main__":
    main()