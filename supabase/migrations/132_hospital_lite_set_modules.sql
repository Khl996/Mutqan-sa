-- =============================================================================
-- Migration: 132_hospital_lite_set_modules.sql
-- Phase: Hospital Lite Mode — Phase 2 (Lite UI)
-- Purpose:
--   Set the hospital demo tenant's enabled_modules to the Lite scope only:
--     Enabled  : dashboard, work_orders (with workflow/approvals), employees,
--                public_portal
--     Disabled : facilities, assets, maintenance, inventory, work_teams, reports
--     Flag     : billing.enabled = false  →  sidebar hides subscription link
--                for this tenant only (frontend reads this key; backend is
--                unchanged — no billing schema touched).
--
-- Guard note: this UPDATE touches only enabled_modules, NOT plan_id, so the
--   on_tenant_plan_change trigger (sync_tenant_modules_from_plan) does NOT
--   fire and the override persists. Same pattern as migrations 097/098.
--
-- Safe to re-run: WHERE clause targets the fixed hospital-lite UUID only.
-- =============================================================================

UPDATE public.tenants
   SET enabled_modules = jsonb_build_object(
       -- ── Lite-scope modules (enabled) ──────────────────────────────────────
       'dashboard',     jsonb_build_object(
                            'enabled', TRUE,
                            'features', jsonb_build_object(
                                'quick_stats',     TRUE,
                                'charts',          TRUE,
                                'recent_activity', TRUE
                            )
                        ),
       'work_orders',   jsonb_build_object(
                            'enabled', TRUE,
                            'features', jsonb_build_object(
                                'create_wo',      TRUE,
                                'workflow',       TRUE,  -- approval steps
                                'assignment',     TRUE,
                                'parts_tracking', TRUE
                            )
                        ),
       'employees',     jsonb_build_object(
                            'enabled', TRUE,
                            'features', jsonb_build_object(
                                'user_management', TRUE,
                                'role_assignment', TRUE
                            )
                        ),
       'public_portal', jsonb_build_object(
                            'enabled', TRUE,
                            'features', jsonb_build_object(
                                'qr_portal',        TRUE,
                                'public_submission', TRUE
                            )
                        ),
       -- ── Non-Lite modules (disabled) ────────────────────────────────────────
       'facilities',    jsonb_build_object(
                            'enabled', FALSE,
                            'features', jsonb_build_object(
                                'buildings', FALSE, 'floors', FALSE,
                                'departments', FALSE, 'rooms', FALSE
                            )
                        ),
       'assets',        jsonb_build_object(
                            'enabled', FALSE,
                            'features', jsonb_build_object(
                                'asset_tracking', FALSE, 'qr_codes', FALSE,
                                'asset_history',  FALSE, 'warranty_tracking', FALSE
                            )
                        ),
       'maintenance',   jsonb_build_object(
                            'enabled', FALSE,
                            'features', jsonb_build_object(
                                'maintenance_plans', FALSE, 'schedules', FALSE
                            )
                        ),
       'inventory',     jsonb_build_object(
                            'enabled', FALSE,
                            'features', jsonb_build_object(
                                'stock_tracking', FALSE, 'low_stock_alerts', FALSE,
                                'consumption_reports', FALSE
                            )
                        ),
       'work_teams',    jsonb_build_object(
                            'enabled', FALSE,
                            'features', jsonb_build_object(
                                'team_creation', FALSE, 'member_assignment', FALSE
                            )
                        ),
       'reports',       jsonb_build_object(
                            'enabled', FALSE,
                            'features', jsonb_build_object(
                                'operational_reports', FALSE, 'export', FALSE
                            )
                        ),
       -- ── UI-only billing flag ───────────────────────────────────────────────
       -- Frontend reads tenantModules?.billing?.enabled === false to hide the
       -- Subscription sidebar link for this tenant. Other tenants do not have
       -- this key so their sidebar is unaffected (undefined !== false).
       'billing',       jsonb_build_object('enabled', FALSE)
   ),
   updated_at = NOW()
 WHERE id = 'd0000000-0000-4000-8000-000000000020';

COMMENT ON TABLE public.tenants IS
    'Hospital Lite phase 2: enabled_modules for d0000000-... set to Lite scope (dashboard+work_orders+employees+public_portal). billing.enabled=false hides subscription sidebar link.';
