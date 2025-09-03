-- Legacy Compass Database Schema for Supabase (FIXED VERSION)
-- This version handles existing tables/policies gracefully

-- First, drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own properties" ON user_properties;
DROP POLICY IF EXISTS "Users can insert their own properties" ON user_properties;
DROP POLICY IF EXISTS "Users can update their own properties" ON user_properties;
DROP POLICY IF EXISTS "Users can delete their own properties" ON user_properties;
DROP POLICY IF EXISTS "Users can view their own settings" ON user_settings;
DROP POLICY IF EXISTS "Users can insert their own settings" ON user_settings;
DROP POLICY IF EXISTS "Users can update their own settings" ON user_settings;
DROP POLICY IF EXISTS "Users can view their own activity" ON activity_log;
DROP POLICY IF EXISTS "Users can insert their own activity" ON activity_log;

-- Drop existing tables if they exist
DROP TABLE IF EXISTS user_properties CASCADE;
DROP TABLE IF EXISTS user_settings CASCADE;
DROP TABLE IF EXISTS activity_log CASCADE;

-- Create user_properties table for storing all property data
CREATE TABLE user_properties (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    property_id TEXT NOT NULL,
    property_address TEXT,
    owner_name TEXT,
    phone TEXT,
    email TEXT,
    notes TEXT,
    tags TEXT[],
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    equity INTEGER DEFAULT 0,
    is_absentee BOOLEAN DEFAULT false,
    is_hot BOOLEAN DEFAULT false,
    mailing_address TEXT,
    purchase_price DECIMAL(12, 2),
    purchase_date DATE,
    farm_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, property_id)
);

-- Create user_settings table for preferences
CREATE TABLE user_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    preferences JSONB DEFAULT '{}',
    territory_data JSONB DEFAULT '{}',
    last_farm_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create activity_log table for tracking user actions
CREATE TABLE activity_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    property_id TEXT,
    action TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE user_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies - Users can only see/edit their own data
CREATE POLICY "Users can view their own properties" 
    ON user_properties FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own properties" 
    ON user_properties FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own properties" 
    ON user_properties FOR UPDATE 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own properties" 
    ON user_properties FOR DELETE 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own settings" 
    ON user_settings FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own settings" 
    ON user_settings FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own settings" 
    ON user_settings FOR UPDATE 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own activity" 
    ON activity_log FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own activity" 
    ON activity_log FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_properties_user_id ON user_properties(user_id);
CREATE INDEX IF NOT EXISTS idx_user_properties_property_id ON user_properties(property_id);
CREATE INDEX IF NOT EXISTS idx_user_properties_farm_name ON user_properties(farm_name);
CREATE INDEX IF NOT EXISTS idx_user_properties_is_hot ON user_properties(is_hot);
CREATE INDEX IF NOT EXISTS idx_user_properties_is_absentee ON user_properties(is_absentee);
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers to auto-update updated_at
DROP TRIGGER IF EXISTS update_user_properties_updated_at ON user_properties;
CREATE TRIGGER update_user_properties_updated_at 
    BEFORE UPDATE ON user_properties 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_settings_updated_at ON user_settings;
CREATE TRIGGER update_user_settings_updated_at 
    BEFORE UPDATE ON user_settings 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Success message
DO $$ 
BEGIN 
    RAISE NOTICE '✅ Legacy Compass database schema created successfully!';
    RAISE NOTICE 'Tables created: user_properties, user_settings, activity_log';
    RAISE NOTICE 'Row Level Security enabled - users can only see their own data';
END $$;