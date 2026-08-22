
-- ب.1 — Remove Hospital-Lite demo seed data.
-- Tenant d0000000-0000-4000-8000-000000000020 (Hospital Lite Demo) is KEPT.
-- Only the test data seeded by hospital_lite_tenant_seed.sql is removed.

-- 1. Test work order
DELETE FROM public.work_orders
WHERE id = 'd0000000-0000-4000-8000-000000000041';

-- 2. Portal access token (demo QR token)
DELETE FROM public.tenant_access_tokens
WHERE id = 'fe3a0f90-3a62-4e54-b2ed-fcba9022a252';

-- 3. Floors (FK → buildings; must go before buildings)
DELETE FROM public.floors
WHERE id IN (
    'd0000000-0000-4000-8000-f00000000001',
    'd0000000-0000-4000-8000-f00000000002',
    'd0000000-0000-4000-8000-f00000000003',
    'd0000000-0000-4000-8000-f00000000004',
    'd0000000-0000-4000-8000-f00000000005',
    'd0000000-0000-4000-8000-f00000000006',
    'd0000000-0000-4000-8000-f00000000007'
);

-- 4. Buildings
DELETE FROM public.buildings
WHERE id IN (
    'd0000000-0000-4000-8000-b00000000001',
    'd0000000-0000-4000-8000-b00000000002',
    'd0000000-0000-4000-8000-b00000000003'
);

-- 5. Profile (must precede auth.users delete)
DELETE FROM public.profiles
WHERE id = 'd0000000-0000-4000-8000-000000000031';

-- 6. Auth user
DELETE FROM auth.users
WHERE id = 'd0000000-0000-4000-8000-000000000031';

