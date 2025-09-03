-- Temporarily disable RLS on master_properties for bulk import
ALTER TABLE master_properties DISABLE ROW LEVEL SECURITY;

-- After import is complete, you can re-enable it with:
-- ALTER TABLE master_properties ENABLE ROW LEVEL SECURITY;