-- =====================================================
-- Migration: 080_buildings_floors_rls.sql
-- Purpose: Replace open RLS with tenant-scoped policies
--          buildings: direct tenant_id check
--          floors: derive tenant from building_id → building.tenant_id
-- =====================================================

-- =====================================================
-- BUILDINGS: Tenant-scoped RLS
-- =====================================================

-- Drop the open policy
DROP POLICY IF EXISTS "Allow all actions for authenticated users on buildings" ON buildings;

-- SELECT: Only members of same tenant
DROP POLICY IF EXISTS "buildings_select_tenant" ON public.buildings;
CREATE POLICY "buildings_select_tenant"
ON public.buildings FOR SELECT TO authenticated
USING (
    tenant_id = public.get_user_tenant_id()
);

-- INSERT: Only admins/owners/facility managers
DROP POLICY IF EXISTS "buildings_insert_admin" ON public.buildings;
CREATE POLICY "buildings_insert_admin"
ON public.buildings FOR INSERT TO authenticated
WITH CHECK (
    tenant_id IN (
        SELECT p.tenant_id FROM profiles p
        WHERE p.id = auth.uid()
        AND p.tenant_id = public.get_user_tenant_id()
        AND p.role IN ('tenant_admin', 'tenant_owner', 'facility_manager')
    )
);

-- UPDATE: Only admins/owners/facility managers of same tenant
DROP POLICY IF EXISTS "buildings_update_admin" ON public.buildings;
CREATE POLICY "buildings_update_admin"
ON public.buildings FOR UPDATE TO authenticated
USING (
    tenant_id IN (
        SELECT p.tenant_id FROM profiles p
        WHERE p.id = auth.uid()
        AND p.tenant_id = public.get_user_tenant_id()
        AND p.role IN ('tenant_admin', 'tenant_owner', 'facility_manager')
    )
)
WITH CHECK (
    tenant_id IN (
        SELECT p.tenant_id FROM profiles p
        WHERE p.id = auth.uid()
        AND p.tenant_id = public.get_user_tenant_id()
        AND p.role IN ('tenant_admin', 'tenant_owner', 'facility_manager')
    )
);

-- DELETE: Only admins/owners of same tenant
DROP POLICY IF EXISTS "buildings_delete_admin" ON public.buildings;
CREATE POLICY "buildings_delete_admin"
ON public.buildings FOR DELETE TO authenticated
USING (
    tenant_id IN (
        SELECT p.tenant_id FROM profiles p
        WHERE p.id = auth.uid()
        AND p.tenant_id = public.get_user_tenant_id()
        AND p.role IN ('tenant_admin', 'tenant_owner')
    )
);

-- =====================================================
-- FLOORS: Tenant-scoped via building_id → buildings.tenant_id
-- =====================================================

-- Drop the open policy
DROP POLICY IF EXISTS "Allow all actions for authenticated users on floors" ON floors;

-- SELECT: Only if the parent building belongs to user's tenant
DROP POLICY IF EXISTS "floors_select_tenant" ON public.floors;
CREATE POLICY "floors_select_tenant"
ON public.floors FOR SELECT TO authenticated
USING (
    building_id IN (
        SELECT b.id FROM buildings b
        WHERE b.tenant_id = public.get_user_tenant_id()
    )
);

-- INSERT: Only admins/owners/facility managers
DROP POLICY IF EXISTS "floors_insert_admin" ON public.floors;
CREATE POLICY "floors_insert_admin"
ON public.floors FOR INSERT TO authenticated
WITH CHECK (
    building_id IN (
        SELECT b.id FROM buildings b
        WHERE b.tenant_id IN (
            SELECT p.tenant_id FROM profiles p
            WHERE p.id = auth.uid()
              AND p.tenant_id = public.get_user_tenant_id()
              AND p.role IN ('tenant_admin', 'tenant_owner', 'facility_manager')
        )
    )
);

-- UPDATE: Only admins/owners/facility managers
DROP POLICY IF EXISTS "floors_update_admin" ON public.floors;
CREATE POLICY "floors_update_admin"
ON public.floors FOR UPDATE TO authenticated
USING (
    building_id IN (
        SELECT b.id FROM buildings b
        WHERE b.tenant_id IN (
            SELECT p.tenant_id FROM profiles p
            WHERE p.id = auth.uid()
            AND p.tenant_id = public.get_user_tenant_id()
            AND p.role IN ('tenant_admin', 'tenant_owner', 'facility_manager')
        )
    )
)
WITH CHECK (
    building_id IN (
        SELECT b.id FROM buildings b
        WHERE b.tenant_id IN (
            SELECT p.tenant_id FROM profiles p
            WHERE p.id = auth.uid()
            AND p.tenant_id = public.get_user_tenant_id()
            AND p.role IN ('tenant_admin', 'tenant_owner', 'facility_manager')
        )
    )
);

-- DELETE: Only admins/owners
DROP POLICY IF EXISTS "floors_delete_admin" ON public.floors;
CREATE POLICY "floors_delete_admin"
ON public.floors FOR DELETE TO authenticated
USING (
    building_id IN (
        SELECT b.id FROM buildings b
        WHERE b.tenant_id IN (
            SELECT p.tenant_id FROM profiles p
            WHERE p.id = auth.uid()
            AND p.tenant_id = public.get_user_tenant_id()
            AND p.role IN ('tenant_admin', 'tenant_owner')
        )
    )
);
