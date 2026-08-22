
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
        'billing',       jsonb_build_object('enabled', FALSE)
    ),
    updated_at = NOW()
WHERE id = '3b0ed0d9-caeb-4bb9-8312-8ce9a92b120a';

-- Step 2: Create portal access token if none exists
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

