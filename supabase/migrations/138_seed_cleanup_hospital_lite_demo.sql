-- Phase 7 ب.1 — Hospital Lite demo seed cleanup
-- Removes synthetic test data inserted during Phase 3-4 seeding.
-- The tenant shell (Hospital Lite Demo, d0000000-0000-4000-8000-000000000020) is KEPT.
-- All @example.com fixture data is KEPT.

DO $$
DECLARE
  v_tech_id UUID := 'b83075f8-68fd-402d-9a60-97ee23b35b58'; -- tech1@hospital-lite.test
BEGIN
  -- Remove portal token for hospital-lite demo tenant
  DELETE FROM public.tenant_portal_tokens
  WHERE tenant_id = 'd0000000-0000-4000-8000-000000000020'::uuid;

  -- Remove floors seeded for hospital-lite demo
  DELETE FROM public.floors
  WHERE building_id IN (
    SELECT id FROM public.buildings
    WHERE tenant_id = 'd0000000-0000-4000-8000-000000000020'::uuid
  );

  -- Remove buildings seeded for hospital-lite demo
  DELETE FROM public.buildings
  WHERE tenant_id = 'd0000000-0000-4000-8000-000000000020'::uuid;

  -- Remove profile for tech1@hospital-lite.test
  DELETE FROM public.profiles WHERE id = v_tech_id;

  -- Remove auth user for tech1@hospital-lite.test
  DELETE FROM auth.users WHERE id = v_tech_id;
END $$;
