-- Legacy Compass Master Database Schema
-- This creates the authoritative properties table with APNs as primary keys

-- Drop existing tables if they exist (for clean setup)
DROP TABLE IF EXISTS farm_properties CASCADE;
DROP TABLE IF EXISTS user_farms CASCADE;
DROP TABLE IF EXISTS property_enrichments CASCADE;
DROP TABLE IF EXISTS master_properties CASCADE;

-- Master Properties Table (Authoritative source from County data)
CREATE TABLE master_properties (
    apn TEXT PRIMARY KEY,
    property_address TEXT NOT NULL,
    city TEXT DEFAULT 'Hayward',
    state TEXT DEFAULT 'CA',
    zip_code TEXT,
    
    -- Owner Information
    owner_name TEXT,
    owner_mailing_address TEXT,
    is_absentee BOOLEAN DEFAULT false,
    
    -- Property Details
    land_value DECIMAL,
    improvement_value DECIMAL,
    total_value DECIMAL,
    year_built INTEGER,
    bedrooms INTEGER,
    bathrooms DECIMAL,
    square_feet INTEGER,
    lot_size DECIMAL,
    property_type TEXT,
    
    -- Location Data
    latitude DECIMAL,
    longitude DECIMAL,
    parcel_geometry JSONB,
    
    -- Status Flags
    is_vacant BOOLEAN DEFAULT false,
    is_verified BOOLEAN DEFAULT false,
    
    -- Metadata
    data_source TEXT DEFAULT 'county',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Property Enrichments (Shared data from all agents)
CREATE TABLE property_enrichments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    apn TEXT NOT NULL REFERENCES master_properties(apn) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Contact Information (can be added by any agent)
    phone_numbers TEXT[],
    email_addresses TEXT[],
    
    -- Additional enrichment
    notes TEXT,
    tags TEXT[],
    last_contact_date DATE,
    contact_attempts INTEGER DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(apn, user_id)
);

-- User Farms (Private to each agent)
CREATE TABLE user_farms (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    farm_name TEXT NOT NULL,
    description TEXT,
    
    -- Farm settings
    color TEXT DEFAULT '#3B82F6',
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, farm_name)
);

-- Farm Properties (Junction table - which properties are in which farms)
CREATE TABLE farm_properties (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    farm_id UUID NOT NULL REFERENCES user_farms(id) ON DELETE CASCADE,
    apn TEXT NOT NULL REFERENCES master_properties(apn) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Property-specific farm data
    is_hot_list BOOLEAN DEFAULT false,
    priority INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    private_notes TEXT,
    
    -- Door knocking tracking
    last_visited DATE,
    visit_count INTEGER DEFAULT 0,
    response_type TEXT, -- 'not_home', 'no_interest', 'callback', 'interested'
    
    -- Metadata
    added_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(farm_id, apn)
);

-- Indexes for performance
CREATE INDEX idx_master_properties_address ON master_properties(property_address);
CREATE INDEX idx_master_properties_owner ON master_properties(owner_name);
CREATE INDEX idx_master_properties_vacant ON master_properties(is_vacant);
CREATE INDEX idx_master_properties_location ON master_properties(latitude, longitude);
CREATE INDEX idx_property_enrichments_apn ON property_enrichments(apn);
CREATE INDEX idx_farm_properties_farm ON farm_properties(farm_id);
CREATE INDEX idx_farm_properties_user ON farm_properties(user_id);
CREATE INDEX idx_farm_properties_hot ON farm_properties(is_hot_list);

-- Row Level Security Policies

-- Enable RLS on all tables
ALTER TABLE master_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_enrichments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_farms ENABLE ROW LEVEL SECURITY;
ALTER TABLE farm_properties ENABLE ROW LEVEL SECURITY;

-- Master Properties: Everyone can read
CREATE POLICY "Master properties are public read" 
ON master_properties FOR SELECT 
TO authenticated 
USING (true);

-- Only admin (Les) can modify master properties
CREATE POLICY "Only admin can modify master properties" 
ON master_properties FOR ALL 
TO authenticated 
USING (auth.uid() IN (
    SELECT id FROM auth.users 
    WHERE raw_user_meta_data->>'role' = 'admin'
));

-- Property Enrichments: Everyone can read all enrichments
CREATE POLICY "Enrichments are shared - everyone can read" 
ON property_enrichments FOR SELECT 
TO authenticated 
USING (true);

-- Users can only create/update their own enrichments
CREATE POLICY "Users can manage their own enrichments" 
ON property_enrichments FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own enrichments" 
ON property_enrichments FOR UPDATE 
TO authenticated 
USING (auth.uid() = user_id);

-- User Farms: Users can only see/manage their own farms
CREATE POLICY "Users can view their own farms" 
ON user_farms FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own farms" 
ON user_farms FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own farms" 
ON user_farms FOR UPDATE 
TO authenticated 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own farms" 
ON user_farms FOR DELETE 
TO authenticated 
USING (auth.uid() = user_id);

-- Farm Properties: Users can only see/manage properties in their farms
CREATE POLICY "Users can view their farm properties" 
ON farm_properties FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

CREATE POLICY "Users can add properties to their farms" 
ON farm_properties FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their farm properties" 
ON farm_properties FOR UPDATE 
TO authenticated 
USING (auth.uid() = user_id);

CREATE POLICY "Users can remove properties from farms" 
ON farm_properties FOR DELETE 
TO authenticated 
USING (auth.uid() = user_id);

-- Admin (Les) can see everything
CREATE POLICY "Admin can view all farms" 
ON user_farms FOR SELECT 
TO authenticated 
USING (auth.uid() IN (
    SELECT id FROM auth.users 
    WHERE raw_user_meta_data->>'role' = 'admin'
));

CREATE POLICY "Admin can view all farm properties" 
ON farm_properties FOR SELECT 
TO authenticated 
USING (auth.uid() IN (
    SELECT id FROM auth.users 
    WHERE raw_user_meta_data->>'role' = 'admin'
));

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_master_properties_updated_at 
    BEFORE UPDATE ON master_properties 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_property_enrichments_updated_at 
    BEFORE UPDATE ON property_enrichments 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_farms_updated_at 
    BEFORE UPDATE ON user_farms 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_farm_properties_updated_at 
    BEFORE UPDATE ON farm_properties 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();