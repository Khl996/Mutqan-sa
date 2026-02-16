-- =====================================================
-- Fix RLS Policies for Teams and Team Members
-- =====================================================

-- Enable RLS on tables if not already enabled
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- TEAMS Table Policies
-- =====================================================

-- Drop existing policies if any
DROP POLICY IF EXISTS "teams_select_policy" ON teams;
DROP POLICY IF EXISTS "teams_insert_policy" ON teams;
DROP POLICY IF EXISTS "teams_update_policy" ON teams;
DROP POLICY IF EXISTS "teams_delete_policy" ON teams;

-- SELECT: Users can view teams in their tenant
CREATE POLICY "teams_select_policy" ON teams
    FOR SELECT
    USING (
        tenant_id IN (
            SELECT tenant_id FROM profiles WHERE id = auth.uid()
        )
    );

-- INSERT: Users can create teams in their tenant
CREATE POLICY "teams_insert_policy" ON teams
    FOR INSERT
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM profiles WHERE id = auth.uid()
        )
    );

-- UPDATE: Users can update teams in their tenant
CREATE POLICY "teams_update_policy" ON teams
    FOR UPDATE
    USING (
        tenant_id IN (
            SELECT tenant_id FROM profiles WHERE id = auth.uid()
        )
    );

-- DELETE: Users can delete teams in their tenant
CREATE POLICY "teams_delete_policy" ON teams
    FOR DELETE
    USING (
        tenant_id IN (
            SELECT tenant_id FROM profiles WHERE id = auth.uid()
        )
    );

-- =====================================================
-- TEAM_MEMBERS Table Policies
-- =====================================================

-- Drop existing policies if any
DROP POLICY IF EXISTS "team_members_select_policy" ON team_members;
DROP POLICY IF EXISTS "team_members_insert_policy" ON team_members;
DROP POLICY IF EXISTS "team_members_update_policy" ON team_members;
DROP POLICY IF EXISTS "team_members_delete_policy" ON team_members;

-- SELECT: Users can view team members for teams in their tenant
CREATE POLICY "team_members_select_policy" ON team_members
    FOR SELECT
    USING (
        team_id IN (
            SELECT id FROM teams WHERE tenant_id IN (
                SELECT tenant_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

-- INSERT: Users can add members to teams in their tenant
CREATE POLICY "team_members_insert_policy" ON team_members
    FOR INSERT
    WITH CHECK (
        team_id IN (
            SELECT id FROM teams WHERE tenant_id IN (
                SELECT tenant_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

-- UPDATE: Users can update team members in their tenant's teams
CREATE POLICY "team_members_update_policy" ON team_members
    FOR UPDATE
    USING (
        team_id IN (
            SELECT id FROM teams WHERE tenant_id IN (
                SELECT tenant_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

-- DELETE: Users can remove members from teams in their tenant
CREATE POLICY "team_members_delete_policy" ON team_members
    FOR DELETE
    USING (
        team_id IN (
            SELECT id FROM teams WHERE tenant_id IN (
                SELECT tenant_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

-- Grant necessary permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON teams TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON team_members TO authenticated;
