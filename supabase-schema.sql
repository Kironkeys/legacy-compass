-- Supabase Database Schema for Legacy Compass
-- Run this in the Supabase SQL Editor to set up the database

-- User Properties table
CREATE TABLE IF NOT EXISTS user_properties (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    property_id TEXT NOT NULL,
    property_address TEXT,
    notes TEXT,
    tags TEXT[],
    status TEXT CHECK (status IN ('hot', 'warm', 'cold', 'contacted', 'not_interested')),
    is_favorite BOOLEAN DEFAULT false,
    last_contact_date TIMESTAMP,
    next_followup_date TIMESTAMP,
    voice_notes JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, property_id)
);

-- User Settings table
CREATE TABLE IF NOT EXISTS user_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    preferences JSONB DEFAULT '{}',
    territory_data JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Activity Log table
CREATE TABLE IF NOT EXISTS activity_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    property_id TEXT,
    action TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE user_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies
-- User Properties policies
CREATE POLICY "Users can view their own properties" ON user_properties
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own properties" ON user_properties
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own properties" ON user_properties
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own properties" ON user_properties
    FOR DELETE USING (auth.uid() = user_id);

-- User Settings policies
CREATE POLICY "Users can view their own settings" ON user_settings
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own settings" ON user_settings
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own settings" ON user_settings
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own settings" ON user_settings
    FOR DELETE USING (auth.uid() = user_id);

-- Activity Log policies
CREATE POLICY "Users can view their own activity" ON activity_log
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own activity" ON activity_log
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_properties_user_id ON user_properties(user_id);
CREATE INDEX IF NOT EXISTS idx_user_properties_property_id ON user_properties(property_id);
CREATE INDEX IF NOT EXISTS idx_user_properties_status ON user_properties(status);
CREATE INDEX IF NOT EXISTS idx_user_properties_is_favorite ON user_properties(is_favorite);
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_user_properties_updated_at BEFORE UPDATE ON user_properties
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON user_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create view for user's favorite properties (hot list)
CREATE OR REPLACE VIEW user_hot_list AS
SELECT 
    up.*,
    al.created_at as last_activity_date
FROM user_properties up
LEFT JOIN LATERAL (
    SELECT created_at 
    FROM activity_log 
    WHERE user_id = up.user_id 
    AND property_id = up.property_id 
    ORDER BY created_at DESC 
    LIMIT 1
) al ON true
WHERE up.is_favorite = true;

-- Grant access to the view
GRANT SELECT ON user_hot_list TO authenticated;

-- Sample function to get property statistics for a user
CREATE OR REPLACE FUNCTION get_user_property_stats(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'total_properties', COUNT(*),
        'hot_properties', COUNT(*) FILTER (WHERE status = 'hot'),
        'warm_properties', COUNT(*) FILTER (WHERE status = 'warm'),
        'cold_properties', COUNT(*) FILTER (WHERE status = 'cold'),
        'contacted_properties', COUNT(*) FILTER (WHERE status = 'contacted'),
        'favorites', COUNT(*) FILTER (WHERE is_favorite = true),
        'properties_with_notes', COUNT(*) FILTER (WHERE notes IS NOT NULL AND notes != ''),
        'properties_with_followup', COUNT(*) FILTER (WHERE next_followup_date IS NOT NULL AND next_followup_date > NOW())
    ) INTO result
    FROM user_properties
    WHERE user_id = p_user_id;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_user_property_stats TO authenticated;