-- =============================================================================
-- Migration: 141_fix_security_definer_view_and_dead_function
-- Purpose: Two findings from a pre-launch Supabase security advisor pass.
--
-- 1. public.pm_work_order_history (migration 108) was created without
--    security_invoker, so on Postgres 15+ it runs with the view owner's
--    privileges and bypasses RLS on work_orders/profiles/pm_schedules/
--    job_plans for the underlying SELECT. It is GRANTed to `authenticated`
--    with no tenant filter, so any logged-in user could read every tenant's
--    PM work order history via PostgREST (/rest/v1/pm_work_order_history),
--    independent of whether the frontend ever queries it (it doesn't).
--    Fix: set security_invoker = true so the view enforces the querying
--    user's own RLS, matching every other tenant-scoped table/view.
--
-- 2. public.register_tenant(text,text,text,text,text,text) is a pre-
--    provision_tenant signup function, superseded by register_new_tenant /
--    provision_tenant (migration 101). It is unused by the app (confirmed:
--    no frontend or API caller), still SECURITY DEFINER and executable by
--    anon/authenticated, and references tenants.status, a column that no
--    longer exists — so it is dead and broken. Dropping it removes
--    unnecessary attack surface with zero functional impact.
-- =============================================================================

ALTER VIEW public.pm_work_order_history SET (security_invoker = true);

DROP FUNCTION IF EXISTS public.register_tenant(text, text, text, text, text, text);
