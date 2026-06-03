-- =============================================================================
-- Migration: 139_hospital_eradah_quryaat_lite_mode.sql
-- Target: tenant 3b0ed0d9-caeb-4bb9-8312-8ce9a92b120a (eradah quryaat /
--         مستشفى النفسية بالقريات), confirmed via khleed9999@outlook.com
-- Purpose:
--   1. Convert tenant to Hospital Lite scope (UI-only, no data deleted).
--   2. Create portal access token if none exists (public_portal was disabled;
--      enabling it without a token leaves /portal unreachable).
-- Safe to re-run: WHERE clause targets this UUID only; token INSERT is
--   guarded by NOT EXISTS.
-- =============================================================================
--
-- ── BACKUP (current enabled_modules — restore with the UPDATE below) ────────
-- UPDATE public.tenants
-- SET enabled_modules = '{
--   "assets":        {"enabled":true,"features":{"qr_codes":true,"asset_history":true,"asset_tracking":true,"warranty_tracking":true}},
--   "reports":       {"enabled":true,"features":{"export":true,"operational_reports":true}},
--   "dashboard":     {"enabled":true,"features":{"charts":true,"quick_stats":true,"recent_activity":true}},
--   "employees":     {"enabled":true,"features":{"role_assignment":true,"user_management":true}},
--   "inventory":     {"enabled":true,"features":{"stock_tracking":true,"low_stock_alerts":true,"consumption_reports":true}},
--   "facilities":    {"enabled":true,"features":{"rooms":true,"floors":true,"buildings":true,"departments":true}},
--   "work_teams":    {"enabled":true,"features":{"team_creation":true,"member_assignment":true}},
--   "maintenance":   {"enabled":true,"features":{"schedules":true,"auto_generation":true,"maintenance_plans":true}},
--   "work_orders":   {"enabled":true,"features":{"workflow":true,"create_wo":true,"assignment":true,"parts_tracking":true}},
--   "public_portal": {"enabled":false,"features":{"qr_portal":false,"public_submission":false}}
-- }'::jsonb
-- WHERE id = '3b0ed0d9-caeb-4bb9-8312-8ce9a92b120a';
-- ────────────────────────────────────────────────────────────────────────────

-- Step 1: Set Lite-scope enabled_modules
UPDATE public.tenants
SET
    enabled_modules = jsonb_build_object(
        'dashboard',     jsonb_build_object(
                             'enabled', TRUE,
                             'features', jsonb_build_object(
                                 'quick_stats', TRUE, 'charts', TRUE, 'recent_activity', TRUE
                             )
                         ),
        'work_orders',   jsonb_build_object(
                             'enabled', TRUE,
                             'features', jsonb_build_object(
                                 'create_wo', TRUE, 'workflow', TRUE,
                                 'assignment', TRUE, 'parts_tracking', TRUE
                             )
                         ),
        'employees',     jsonb_build_object(
                             'enabled', TRUE,
                             'features', jsonb_build_object(
                                 'user_management', TRUE, 'role_assignment', TRUE
                             )
                         ),
        'public_portal', jsonb_build_object(
                             'enabled', TRUE,
                             'features', jsonb_build_object(
                                 'qr_portal', TRUE, 'public_submission', TRUE
                             )
                         ),
        -- Hidden modules (data preserved in DB)
        'facilities',    jsonb_build_object('enabled', FALSE, 'features',
                             jsonb_build_object('buildings', FALSE, 'floors', FALSE,
                                                'departments', FALSE, 'rooms', FALSE)),
        'assets',        jsonb_build_object('enabled', FALSE, 'features',
                             jsonb_build_object('asset_tracking', FALSE, 'qr_codes', FALSE,
                                                'asset_history', FALSE, 'warranty_tracking', FALSE)),
        'maintenance',   jsonb_build_object('enabled', FALSE, 'features',
                             jsonb_build_object('maintenance_plans', FALSE,
                                                'schedules', FALSE, 'auto_generation', FALSE)),
        'inventory',     jsonb_build_object('enabled', FALSE, 'features',
                             jsonb_build_object('stock_tracking', FALSE,
                                                'low_stock_alerts', FALSE,
                                                'consumption_reports', FALSE)),
        'work_teams',    jsonb_build_object('enabled', FALSE, 'features',
                             jsonb_build_object('team_creation', FALSE, 'member_assignment', FALSE)),
        'reports',       jsonb_build_object('enabled', FALSE, 'features',
                             jsonb_build_object('operational_reports', FALSE, 'export', FALSE)),
        -- UI-only billing flag: hides subscription sidebar link
        'billing',       jsonb_build_object('enabled', FALSE)
    ),
    updated_at = NOW()
WHERE id = '3b0ed0d9-caeb-4bb9-8312-8ce9a92b120a';

-- Step 2: Create portal access token if none exists
-- Token format: 64-char hex (32 random bytes) — matches PortalSettingsPage.tsx
INSERT INTO public.tenant_access_tokens (tenant_id, token, name, is_active)
SELECT
    '3b0ed0d9-caeb-4bb9-8312-8ce9a92b120a',
    encode(gen_random_bytes(32), 'hex'),
    'Main QR Code',
    TRUE
WHERE NOT EXISTS (
    SELECT 1 FROM public.tenant_access_tokens
    WHERE tenant_id = '3b0ed0d9-caeb-4bb9-8312-8ce9a92b120a'
      AND is_active = TRUE
);
