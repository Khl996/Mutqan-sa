-- Migration 098: Force-enable maintenance_plans and schedules features for all tenants
--               that have the maintenance module active.
--
-- Root cause:
--   Migration 090 runs plan_enabled_modules_json() which starts from
--   restricted_enabled_modules_json() (maintenance_plans: false, schedules: false).
--   If the subscription plan's features array maps to 'maintenance', the whole
--   module object from default_enabled_modules_json() is copied — which sets them true.
--   But if the plan did NOT include a maintenance feature code, the restricted baseline
--   stays, leaving maintenance_plans: false and schedules: false explicitly in the JSONB.
--
--   Migration 097 only patched tenants with a missing `features` key (IS NULL) — it did
--   NOT patch tenants where `features` existed but had the flags set to false.
--
-- Fix: For every tenant where maintenance module is enabled (enabled: true),
--      force maintenance_plans and schedules to true, and auto_generation to false.

UPDATE public.tenants
SET enabled_modules = jsonb_set(
    jsonb_set(
        jsonb_set(
            jsonb_set(
                enabled_modules,
                '{maintenance,enabled}',
                'true'::jsonb,
                true
            ),
            '{maintenance,features}',
            COALESCE(enabled_modules->'maintenance'->'features', '{}'::jsonb),
            true
        ),
        '{maintenance,features,maintenance_plans}',
        'true'::jsonb,
        true
    ),
    '{maintenance,features,schedules}',
    'true'::jsonb,
    true
)
WHERE
    -- Only update tenants that have a maintenance module entry
    enabled_modules ? 'maintenance'
    -- And at least one of the two features is not already true
    AND (
        (enabled_modules->'maintenance'->'features'->>'maintenance_plans')::boolean IS NOT TRUE
        OR (enabled_modules->'maintenance'->'features'->>'schedules')::boolean IS NOT TRUE
    );
