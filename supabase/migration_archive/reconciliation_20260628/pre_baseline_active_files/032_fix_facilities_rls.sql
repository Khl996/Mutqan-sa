-- Enable RLS on buildings and floors if not enabled
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE floors ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Enable read access for all users" ON buildings;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON buildings;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON buildings;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON buildings;

DROP POLICY IF EXISTS "Enable read access for all users" ON floors;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON floors;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON floors;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON floors;

-- Create permissive policies for buildings (Allow ALL authenticated users to do EVERYTHING for now)
-- This is for development/testing ease. In production, we should restrict INSERT/UPDATE/DELETE to admins.

CREATE POLICY "Allow all actions for authenticated users on buildings"
ON public.buildings
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Create permissive policies for floors
CREATE POLICY "Allow all actions for authenticated users on floors"
ON public.floors
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
