-- =============================================================================
-- Migration: 149_hospital_enable_facilities_locations.sql
-- Target: tenant 3b0ed0d9-caeb-4bb9-8312-8ce9a92b120a (Eradah Qurayaat /
--         مستشفى الصحة النفسية بالقريات)
-- Purpose:
--   Enable the facilities (locations) module for this tenant so the
--   locations management screen is reachable and the 12 seeded department
--   locations can be managed from the UI. Config-only change: mirrors the
--   pattern used when the reports module was re-enabled for this tenant
--   (jsonb merge on tenants.enabled_modules, scoped to this UUID).
-- Safe to re-run: jsonb_set overwrites the facilities key only.
-- =============================================================================

UPDATE public.tenants
   SET enabled_modules = jsonb_set(
           COALESCE(enabled_modules, '{}'::jsonb),
           '{facilities}',
           jsonb_build_object(
               'enabled', TRUE,
               'features', jsonb_build_object(
                   'buildings',   TRUE,
                   'floors',      TRUE,
                   'departments', TRUE,
                   'rooms',       FALSE
               )
           )
       ),
       updated_at = NOW()
 WHERE id = '3b0ed0d9-caeb-4bb9-8312-8ce9a92b120a';
