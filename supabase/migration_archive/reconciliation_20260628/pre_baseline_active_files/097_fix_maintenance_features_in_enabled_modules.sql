-- Migration 097: Backfill missing features object inside maintenance module config
-- Problem: tenants provisioned before feature flags were granular have:
--   enabled_modules -> maintenance -> { enabled: true }   ← no 'features' key
-- isFeatureEnabled() returned false for all maintenance features → Plans tab hidden
--
-- Fix: for every tenant whose maintenance module exists but has no features object,
-- inject the full default features map.

UPDATE public.tenants
SET enabled_modules = jsonb_set(
    enabled_modules,
    '{maintenance,features}',
    '{"maintenance_plans": true, "schedules": true, "auto_generation": false}'::jsonb,
    true   -- create key if missing
)
WHERE
    -- maintenance module exists in their config
    enabled_modules ? 'maintenance'
    -- but the features sub-key is absent or null
    AND (
        enabled_modules->'maintenance'->'features' IS NULL
        OR enabled_modules->'maintenance'->>'features' = 'null'
    );
