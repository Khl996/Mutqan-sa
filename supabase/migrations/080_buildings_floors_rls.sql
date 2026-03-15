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
CREATE POLICY "buildings_select_tenant"
ON public.buildings FOR SELECT TO authenticated
USING (
    tenant_id IN (
        SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid()
    )
);

-- INSERT: Only admins/owners/facility managers
CREATE POLICY "buildings_insert_admin"
ON public.buildings FOR INSERT TO authenticated
WITH CHECK (
    tenant_id IN (
        SELECT p.tenant_id FROM profiles p
        WHERE p.id = auth.uid()
        AND p.role IN ('tenant_admin', 'tenant_owner', 'facility_manager')
    )
);

-- UPDATE: Only admins/owners/facility managers of same tenant
CREATE POLICY "buildings_update_admin"
ON public.buildings FOR UPDATE TO authenticated
USING (
    tenant_id IN (
        SELECT p.tenant_id FROM profiles p
        WHERE p.id = auth.uid()
        AND p.role IN ('tenant_admin', 'tenant_owner', 'facility_manager')
    )
)
WITH CHECK (
    tenant_id IN (
        SELECT p.tenant_id FROM profiles p
        WHERE p.id = auth.uid()
        AND p.role IN ('tenant_admin', 'tenant_owner', 'facility_manager')
    )
);

-- DELETE: Only admins/owners of same tenant
CREATE POLICY "buildings_delete_admin"
ON public.buildings FOR DELETE TO authenticated
USING (
    tenant_id IN (
        SELECT p.tenant_id FROM profiles p
        WHERE p.id = auth.uid()
        AND p.role IN ('tenant_admin', 'tenant_owner')
    )
);

-- =====================================================
-- FLOORS: Tenant-scoped via building_id → buildings.tenant_id
-- =====================================================

-- Drop the open policy
DROP POLICY IF EXISTS "Allow all actions for authenticated users on floors" ON floors;

-- SELECT: Only if the parent building belongs to user's tenant
CREATE POLICY "floors_select_tenant"
ON public.floors FOR SELECT TO authenticated
USING (
    building_id IN (
        SELECT b.id FROM buildings b
        WHERE b.tenant_id IN (
            SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid()
        )
    )
);

-- INSERT: Only admins/owners/facility managers
CREATE POLICY "floors_insert_admin"
ON public.floors FOR INSERT TO authenticated
WITH CHECK (
    building_id IN (
        SELECT b.id FROM buildings b
        WHERE b.tenant_id IN (
            SELECT p.tenant_id FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role IN ('tenant_admin', 'tenant_owner', 'facility_manager')
        )
    )
);

-- UPDATE: Only admins/owners/facility managers
CREATE POLICY "floors_update_admin"
ON public.floors FOR UPDATE TO authenticated
USING (
    building_id IN (
        SELECT b.id FROM buildings b
        WHERE b.tenant_id IN (
            SELECT p.tenant_id FROM profiles p
            WHERE p.id = auth.uid()
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
            AND p.role IN ('tenant_admin', 'tenant_owner', 'facility_manager')
        )
    )
);

-- DELETE: Only admins/owners
CREATE POLICY "floors_delete_admin"
ON public.floors FOR DELETE TO authenticated
USING (
    building_id IN (
        SELECT b.id FROM buildings b
        WHERE b.tenant_id IN (
            SELECT p.tenant_id FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role IN ('tenant_admin', 'tenant_owner')
        )
    )
);
