-- Fix RLS policies for master_properties table to allow users to insert properties

-- Drop the restrictive policy that only allows admin to modify
DROP POLICY IF EXISTS "Only admin can modify master properties" ON master_properties;

-- Allow authenticated users to INSERT new properties
CREATE POLICY "Users can insert master properties" 
ON master_properties FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- Allow authenticated users to UPDATE properties (for upsert operations)
CREATE POLICY "Users can update master properties" 
ON master_properties FOR UPDATE 
TO authenticated 
USING (true)
WITH CHECK (true);

-- Keep the read policy as is (everyone can read)
-- This policy already exists: "Master properties are public read"