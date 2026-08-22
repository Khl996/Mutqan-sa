-- P0 authority hardening after Wave 0.
--
-- This is a forward-only reconciliation migration. It intentionally does not
-- edit the consolidated baseline or any historical migration.

BEGIN;

SET LOCAL check_function_bodies = on;

DO $executor_precondition$
BEGIN
    IF current_user <> 'postgres' THEN
        RAISE EXCEPTION
            USING ERRCODE = '42501',
                  MESSAGE = 'P0 authority migration must be executed by postgres';
    END IF;
END;
$executor_precondition$;

-- ---------------------------------------------------------------------------
-- 1. One fail-closed definition of an active authenticated actor.
--
-- `profiles.is_active` is the immediate database suspension switch. Auth bans
-- are synchronized by the server-only user-management API, but hosted-Auth
-- columns are intentionally not part of this portable database contract.
-- Service operations remain explicit at each RPC; a NULL auth.uid() is never
-- treated as an active application actor.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_actor_is_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth', 'pg_temp'
AS $function$
    SELECT EXISTS (
        SELECT 1
          FROM public.profiles p
         WHERE p.id = auth.uid()
           AND p.is_active IS TRUE
    );
$function$;

REVOKE ALL ON FUNCTION public.current_actor_is_active() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_actor_is_active() TO authenticated, postgres, service_role;

COMMENT ON FUNCTION public.current_actor_is_active() IS
    'Fail-closed application authority check: the JWT subject must have a profile whose application suspension flag is explicitly active.';

CREATE OR REPLACE FUNCTION public.get_my_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
    SELECT CASE
        WHEN public.current_actor_is_active()
        THEN (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid())
        ELSE NULL::uuid
    END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
    SELECT p.tenant_id
      FROM public.profiles p
     WHERE p.id = auth.uid()
       AND public.current_actor_is_active()
       AND public.tenant_has_operational_access(p.tenant_id)
     LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.secure_get_my_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
    SELECT public.get_user_tenant_id();
$function$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
    SELECT public.current_actor_is_active()
       AND EXISTS (
            SELECT 1
              FROM public.profiles p
             WHERE p.id = auth.uid()
               AND (p.is_super_admin IS TRUE OR p.role IN ('platform_owner', 'platform_admin'))
       );
$function$;

CREATE OR REPLACE FUNCTION public.is_platform_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
    SELECT public.current_actor_is_active()
       AND EXISTS (
            SELECT 1
              FROM public.profiles p
             WHERE p.id = auth.uid()
               AND (p.is_super_admin IS TRUE OR p.role LIKE 'platform_%')
       );
$function$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
    SELECT public.current_actor_is_active()
       AND EXISTS (
            SELECT 1
              FROM public.profiles p
             WHERE p.id = auth.uid()
               AND p.is_super_admin IS TRUE
       );
$function$;

CREATE OR REPLACE FUNCTION public.is_tenant_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
    SELECT public.current_actor_is_active()
       AND EXISTS (
            SELECT 1
              FROM public.profiles p
             WHERE p.id = auth.uid()
               AND p.role IN ('tenant_admin', 'platform_owner', 'platform_admin')
       );
$function$;

CREATE OR REPLACE FUNCTION public.tenant_has_operational_access(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
    SELECT EXISTS (
        SELECT 1
          FROM public.tenants t
         WHERE t.id = p_tenant_id
           AND t.is_active IS TRUE
           AND t.subscription_status IN ('trial', 'active')
           AND (
                COALESCE(t.subscription_ends_at, t.trial_ends_at) IS NULL
                OR COALESCE(t.subscription_ends_at, t.trial_ends_at) >= now()
           )
    );
$function$;

-- These predicates are embedded in RLS policies that do not all route through
-- get_user_tenant_id(). Preserve their legacy role matrices while making the
-- central suspension switch authoritative at the shared boundary.
CREATE OR REPLACE FUNCTION public.can_manage_assets_scope(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
    SELECT public.current_actor_is_active()
       AND EXISTS (
            SELECT 1 FROM public.profiles p
             WHERE p.id = auth.uid()
               AND (
                    p.is_super_admin IS TRUE
                    OR p.role IN ('platform_owner', 'platform_admin')
                    OR (
                        p.tenant_id = p_tenant_id
                        AND public.tenant_has_operational_access(p_tenant_id)
                        AND p.role IN ('tenant_admin', 'facility_manager')
                    )
               )
       );
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_facilities(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
    SELECT public.current_actor_is_active()
       AND EXISTS (
            SELECT 1 FROM public.profiles p
             WHERE p.id = auth.uid()
               AND (
                    p.is_super_admin IS TRUE
                    OR p.role IN ('platform_owner', 'platform_admin')
                    OR (
                        p.tenant_id = p_tenant_id
                        AND public.tenant_has_operational_access(p_tenant_id)
                        AND p.role IN ('tenant_admin', 'facility_manager')
                    )
               )
       );
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_inventory(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
    SELECT public.current_actor_is_active()
       AND EXISTS (
            SELECT 1 FROM public.profiles p
             WHERE p.id = auth.uid()
               AND (
                    p.is_super_admin IS TRUE
                    OR p.role IN ('platform_owner', 'platform_admin')
                    OR (
                        p.tenant_id = p_tenant_id
                        AND public.tenant_has_operational_access(p_tenant_id)
                        AND p.role IN ('tenant_owner', 'tenant_admin', 'maintenance_manager')
                    )
               )
       );
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_work_teams(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
    SELECT public.current_actor_is_active()
       AND EXISTS (
            SELECT 1 FROM public.profiles p
             WHERE p.id = auth.uid()
               AND (
                    p.is_super_admin IS TRUE
                    OR p.role IN ('platform_owner', 'platform_admin')
                    OR (
                        p.tenant_id = p_tenant_id
                        AND public.tenant_has_operational_access(p_tenant_id)
                        AND p.role IN ('tenant_admin', 'maintenance_manager')
                    )
               )
       );
$function$;

CREATE OR REPLACE FUNCTION public.can_view_inventory(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
    SELECT public.current_actor_is_active()
       AND EXISTS (
            SELECT 1 FROM public.profiles p
             WHERE p.id = auth.uid()
               AND (
                    p.is_super_admin IS TRUE
                    OR p.role IN ('platform_owner', 'platform_admin')
                    OR (
                        p.tenant_id = p_tenant_id
                        AND public.tenant_has_operational_access(p_tenant_id)
                    )
               )
       );
$function$;

CREATE OR REPLACE FUNCTION public.can_view_platform_tenants()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
    SELECT public.current_actor_is_active()
       AND EXISTS (
            SELECT 1 FROM public.profiles p
             WHERE p.id = auth.uid()
               AND (
                    p.is_super_admin IS TRUE
                    OR p.role IN ('platform_owner', 'platform_admin', 'platform_support')
               )
       );
$function$;

CREATE OR REPLACE FUNCTION public.can_create_work_orders_scope(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
    SELECT public.current_actor_is_active()
       AND EXISTS (
            SELECT 1
              FROM public.profiles p
             WHERE p.id = auth.uid()
               AND (
                    p.is_super_admin IS TRUE
                    OR p.role IN ('platform_owner', 'platform_admin')
                    OR (
                        p.tenant_id = p_tenant_id
                        AND public.tenant_has_operational_access(p_tenant_id)
                        AND p.role IN (
                            'tenant_admin', 'facility_manager', 'maintenance_manager',
                            'supervisor', 'engineer', 'reporter'
                        )
                    )
               )
       );
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_work_orders_scope(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
    SELECT public.current_actor_is_active()
       AND EXISTS (
            SELECT 1
              FROM public.profiles p
             WHERE p.id = auth.uid()
               AND (
                    p.is_super_admin IS TRUE
                    OR p.role IN ('platform_owner', 'platform_admin')
                    OR (
                        p.tenant_id = p_tenant_id
                        AND public.tenant_has_operational_access(p_tenant_id)
                        AND p.role IN ('tenant_admin', 'maintenance_manager')
                    )
               )
       );
$function$;

-- Existing policies call these helpers, so keep their ABI and make their ACLs
-- explicit. They reveal no data beyond the caller's own authority outcome.
REVOKE ALL ON FUNCTION public.get_my_tenant_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_user_tenant_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.secure_get_my_tenant_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_platform_staff() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_tenant_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_create_work_orders_scope(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_work_orders_scope(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tenant_has_operational_access(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_assets_scope(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_facilities(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_inventory(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_work_teams(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_inventory(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_platform_tenants() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_my_tenant_id() TO authenticated, postgres, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_tenant_id() TO authenticated, postgres, service_role;
GRANT EXECUTE ON FUNCTION public.secure_get_my_tenant_id() TO authenticated, postgres, service_role;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, postgres, service_role;
GRANT EXECUTE ON FUNCTION public.is_platform_staff() TO authenticated, postgres, service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, postgres, service_role;
GRANT EXECUTE ON FUNCTION public.is_tenant_admin() TO authenticated, postgres, service_role;
GRANT EXECUTE ON FUNCTION public.can_create_work_orders_scope(uuid) TO authenticated, postgres, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_work_orders_scope(uuid) TO authenticated, postgres, service_role;
GRANT EXECUTE ON FUNCTION public.tenant_has_operational_access(uuid) TO authenticated, postgres, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_assets_scope(uuid) TO authenticated, postgres, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_facilities(uuid) TO authenticated, postgres, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_inventory(uuid) TO authenticated, postgres, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_work_teams(uuid) TO authenticated, postgres, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_inventory(uuid) TO authenticated, postgres, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_platform_tenants() TO authenticated, postgres, service_role;

-- Recovered intake administration RPCs share this predicate and execute as
-- postgres-owned definers, so their common boundary must enforce suspension
-- before those RPCs bypass table RLS.
CREATE OR REPLACE FUNCTION public.intake_can_manage_tenant(p_tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
    v_role text;
    v_tenant_id uuid;
    v_is_super boolean;
BEGIN
    IF NOT public.current_actor_is_active() THEN
        RETURN false;
    END IF;

    SELECT p.role, p.tenant_id, p.is_super_admin IS TRUE
      INTO v_role, v_tenant_id, v_is_super
      FROM public.profiles p
     WHERE p.id = auth.uid();

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    RETURN v_is_super
        OR v_role IN ('platform_owner', 'platform_admin')
        OR (
            v_tenant_id = p_tenant_id
            AND v_role IN ('tenant_admin', 'maintenance_manager', 'facility_manager')
        );
END;
$function$;

REVOKE ALL ON FUNCTION public.intake_can_manage_tenant(uuid)
    FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.intake_can_manage_tenant(uuid)
    TO authenticated, postgres;

-- PM RPCs and RLS share these four predicates. Gate them at the common
-- boundary so an inactive assigned user or team member cannot retain PM
-- authority merely because a task already has an execution snapshot.
CREATE OR REPLACE FUNCTION public.pm_can_manage_tenant(p_tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
    v_role text;
    v_tenant_id uuid;
    v_is_super boolean;
BEGIN
    IF NOT public.current_actor_is_active() THEN
        RETURN false;
    END IF;

    SELECT p.role, p.tenant_id, p.is_super_admin IS TRUE
      INTO v_role, v_tenant_id, v_is_super
      FROM public.profiles p
     WHERE p.id = auth.uid();

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    RETURN v_is_super
        OR v_role IN ('platform_owner', 'platform_admin')
        OR (
            v_tenant_id = p_tenant_id
            AND v_role IN ('tenant_admin', 'maintenance_manager', 'facility_manager')
        );
END;
$function$;

CREATE OR REPLACE FUNCTION public.pm_can_view_tenant(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
    SELECT public.current_actor_is_active()
       AND (
            public.is_platform_admin()
            OR p_tenant_id = public.get_user_tenant_id()
       );
$function$;

CREATE OR REPLACE FUNCTION public.pm_can_execute_task(p_task_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
    v_tenant_id uuid;
    v_assigned_to uuid;
    v_assigned_team_id uuid;
BEGIN
    IF NOT public.current_actor_is_active() THEN
        RETURN false;
    END IF;

    SELECT mt.tenant_id, mt.assigned_to, mt.assigned_team_id
      INTO v_tenant_id, v_assigned_to, v_assigned_team_id
      FROM public.maintenance_tasks mt
     WHERE mt.id = p_task_id;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    RETURN public.pm_can_manage_tenant(v_tenant_id)
        OR v_assigned_to = auth.uid()
        OR EXISTS (
            SELECT 1
              FROM public.team_members tm
             WHERE tm.team_id = v_assigned_team_id
               AND tm.user_id = auth.uid()
               AND tm.is_active IS TRUE
        );
END;
$function$;

CREATE OR REPLACE FUNCTION public.pm_can_view_task(p_task_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
    v_tenant_id uuid;
    v_assigned_to uuid;
    v_assigned_team_id uuid;
BEGIN
    IF NOT public.current_actor_is_active() THEN
        RETURN false;
    END IF;

    SELECT mt.tenant_id, mt.assigned_to, mt.assigned_team_id
      INTO v_tenant_id, v_assigned_to, v_assigned_team_id
      FROM public.maintenance_tasks mt
     WHERE mt.id = p_task_id;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    RETURN public.pm_can_view_tenant(v_tenant_id)
        OR v_assigned_to = auth.uid()
        OR EXISTS (
            SELECT 1
              FROM public.team_members tm
             WHERE tm.team_id = v_assigned_team_id
               AND tm.user_id = auth.uid()
               AND tm.is_active IS TRUE
        );
END;
$function$;

REVOKE ALL ON FUNCTION public.pm_can_manage_tenant(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pm_can_view_tenant(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pm_can_execute_task(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pm_can_view_task(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pm_can_manage_tenant(uuid) TO authenticated, postgres, service_role;
GRANT EXECUTE ON FUNCTION public.pm_can_view_tenant(uuid) TO authenticated, postgres, service_role;
GRANT EXECUTE ON FUNCTION public.pm_can_execute_task(uuid) TO authenticated, postgres, service_role;
GRANT EXECUTE ON FUNCTION public.pm_can_view_task(uuid) TO authenticated, postgres, service_role;

-- ---------------------------------------------------------------------------
-- 2. Remove the caller-settable profile-guard bypass.
--
-- The trigger is SECURITY INVOKER. A protected update issued inside a vetted
-- postgres/service SECURITY DEFINER workflow therefore has explicit database
-- authority, while a client setting app.bypass_profile_guard has no effect.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_profile_update_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
    v_caller_id uuid := auth.uid();
    v_caller_role text;
    v_caller_tenant uuid;
BEGIN
    IF current_user IN ('postgres', 'service_role') THEN
        RETURN NEW;
    END IF;

    IF current_user IS DISTINCT FROM 'authenticated' OR v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authenticated profile authority is required'
            USING ERRCODE = '42501';
    END IF;

    IF NOT public.current_actor_is_active() THEN
        RAISE EXCEPTION 'Inactive or suspended users cannot update profiles'
            USING ERRCODE = '42501';
    END IF;

    SELECT p.role, p.tenant_id
      INTO v_caller_role, v_caller_tenant
      FROM public.profiles p
     WHERE p.id = v_caller_id;

    IF NOT FOUND OR v_caller_role IS NULL THEN
        RAISE EXCEPTION 'Caller profile not found' USING ERRCODE = '42501';
    END IF;

    -- Identity, role, tenant binding and suspension state must stay synchronized
    -- with Supabase Auth through the server-only managed-user workflow. No
    -- authenticated Data API caller may change these fields directly, even a
    -- tenant or platform administrator.
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.role IS DISTINCT FROM OLD.role
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin
       OR NEW.is_active IS DISTINCT FROM OLD.is_active
       OR NEW.email IS DISTINCT FROM OLD.email
    THEN
        RAISE EXCEPTION 'Protected profile authority fields require the managed-user service'
            USING ERRCODE = '42501';
    END IF;

    IF OLD.id = v_caller_id THEN
        IF NEW.role IS DISTINCT FROM OLD.role
           OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
           OR NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin
           OR NEW.is_active IS DISTINCT FROM OLD.is_active
           OR NEW.email IS DISTINCT FROM OLD.email
        THEN
            RAISE EXCEPTION 'You are not allowed to modify protected profile fields directly'
                USING ERRCODE = '42501';
        END IF;
        RETURN NEW;
    END IF;

    IF v_caller_role IN ('platform_owner', 'platform_admin') THEN
        IF OLD.role = 'platform_owner' OR NEW.role = 'platform_owner' THEN
            RAISE EXCEPTION 'Platform owner accounts cannot be changed through direct client updates'
                USING ERRCODE = '42501';
        END IF;

        IF v_caller_role = 'platform_admin'
           AND NEW.role = 'platform_admin'
           AND OLD.role IS DISTINCT FROM 'platform_admin'
        THEN
            RAISE EXCEPTION 'Only platform owners can assign platform_admin'
                USING ERRCODE = '42501';
        END IF;
        RETURN NEW;
    END IF;

    IF v_caller_role = 'tenant_admin' THEN
        IF OLD.tenant_id IS DISTINCT FROM v_caller_tenant
           OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
        THEN
            RAISE EXCEPTION 'You can only manage profiles inside your own organization'
                USING ERRCODE = '42501';
        END IF;

        IF NEW.email IS DISTINCT FROM OLD.email
           OR NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin
           OR OLD.role LIKE 'platform_%'
           OR NEW.role LIKE 'platform_%'
        THEN
            RAISE EXCEPTION 'You are not allowed to change protected identity fields'
                USING ERRCODE = '42501';
        END IF;

        IF NEW.role NOT IN (
            'tenant_admin', 'facility_manager', 'maintenance_manager',
            'supervisor', 'engineer', 'technician', 'reporter'
        ) THEN
            RAISE EXCEPTION 'Invalid tenant-scoped role assignment'
                USING ERRCODE = '42501';
        END IF;
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'You are not allowed to update this profile'
        USING ERRCODE = '42501';
END;
$function$;

COMMENT ON FUNCTION public.enforce_profile_update_permissions() IS
    'Fail-closed profile mutation guard. The historical app.bypass_profile_guard GUC is intentionally ignored; protected writes require an explicit postgres/service workflow.';

REVOKE ALL ON FUNCTION public.enforce_profile_update_permissions()
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enforce_profile_update_permissions() TO postgres;

-- The subscription guard used the same ambient-GUC pattern. Provisioning and
-- billing are already SECURITY DEFINER workflows, so an invoker trigger can
-- distinguish their explicit postgres authority from a direct client update.
CREATE OR REPLACE FUNCTION public.enforce_tenant_subscription_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
    v_has_protected_change boolean;
BEGIN
    IF TG_OP <> 'UPDATE' THEN
        RETURN NEW;
    END IF;

    v_has_protected_change :=
        NEW.plan_id IS DISTINCT FROM OLD.plan_id
        OR NEW.enabled_modules IS DISTINCT FROM OLD.enabled_modules
        OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
        OR NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier
        OR NEW.billing_cycle IS DISTINCT FROM OLD.billing_cycle
        OR NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at
        OR NEW.subscription_ends_at IS DISTINCT FROM OLD.subscription_ends_at
        OR NEW.is_active IS DISTINCT FROM OLD.is_active;

    IF NOT v_has_protected_change THEN
        RETURN NEW;
    END IF;

    IF current_user IN ('postgres', 'service_role') THEN
        RETURN NEW;
    END IF;

    IF current_user = 'authenticated'
       AND public.is_platform_admin()
    THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Tenant subscription fields are managed by billing and platform workflows only'
        USING ERRCODE = '42501';
END;
$function$;

COMMENT ON FUNCTION public.enforce_tenant_subscription_guard() IS
    'Protects tenant commercial state without caller-settable bypass GUCs; vetted postgres/service workflows and active platform admins remain authorized.';

REVOKE ALL ON FUNCTION public.enforce_tenant_subscription_guard()
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enforce_tenant_subscription_guard() TO postgres;

-- ---------------------------------------------------------------------------
-- 3. Server-owned, one-time tenant provisioning approval.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tenant_provisioning_approvals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    plan_id uuid NOT NULL REFERENCES public.subscription_plans(id) ON DELETE RESTRICT,
    status text NOT NULL DEFAULT 'approved'
        CHECK (status IN ('approved', 'consumed', 'revoked', 'expired')),
    approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    approved_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (expires_at > approved_at),
    CHECK (
        (status = 'consumed' AND consumed_at IS NOT NULL AND tenant_id IS NOT NULL)
        OR status <> 'consumed'
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_provisioning_one_open_approval
    ON public.tenant_provisioning_approvals(user_id)
    WHERE status = 'approved';

ALTER TABLE public.tenant_provisioning_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tenant_provisioning_approvals
    FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.tenant_provisioning_approvals TO service_role;

CREATE OR REPLACE FUNCTION public.approve_tenant_registration(
    p_user_id uuid,
    p_plan_code text DEFAULT NULL,
    p_expires_at timestamptz DEFAULT (now() + interval '7 days')
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
    v_actor_id uuid := auth.uid();
    v_plan_id uuid;
    v_plan_code text;
    v_approval public.tenant_provisioning_approvals%ROWTYPE;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role'
       AND NOT public.is_platform_admin()
    THEN
        RAISE EXCEPTION 'Active platform administrator authority is required'
            USING ERRCODE = '42501';
    END IF;

    IF p_user_id IS NULL OR p_expires_at IS NULL
       OR p_expires_at <= now()
       OR p_expires_at > now() + interval '30 days'
    THEN
        RAISE EXCEPTION 'Provisioning approval target or expiry is invalid'
            USING ERRCODE = '22023';
    END IF;

    PERFORM 1
      FROM public.profiles p
      JOIN auth.users u ON u.id = p.id
     WHERE p.id = p_user_id
       AND p.tenant_id IS NULL
       AND p.role = 'user'
       AND p.is_active IS TRUE
     FOR UPDATE OF p;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Approval target must be an active, unbound signup user'
            USING ERRCODE = '42501';
    END IF;

    IF p_plan_code IS NULL THEN
        SELECT sp.id, sp.code::text
          INTO v_plan_id, v_plan_code
          FROM public.subscription_plans sp
         WHERE sp.is_default IS TRUE
           AND sp.is_active IS TRUE
         ORDER BY sp.display_order, sp.created_at
         LIMIT 1;

        IF v_plan_id IS NULL THEN
            SELECT sp.id, sp.code::text
              INTO v_plan_id, v_plan_code
              FROM public.subscription_plans sp
             WHERE sp.is_active IS TRUE
             ORDER BY sp.price_monthly, sp.display_order, sp.created_at
             LIMIT 1;
        END IF;
    ELSE
        SELECT sp.id, sp.code::text
          INTO v_plan_id, v_plan_code
          FROM public.subscription_plans sp
         WHERE sp.code = btrim(p_plan_code)
           AND sp.is_active IS TRUE
         LIMIT 1;
    END IF;

    IF v_plan_id IS NULL THEN
        RAISE EXCEPTION 'No approved active subscription plan was found'
            USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.tenant_provisioning_approvals
       SET status = 'revoked', updated_at = now()
     WHERE user_id = p_user_id
       AND status = 'approved';

    INSERT INTO public.tenant_provisioning_approvals (
        user_id, plan_id, status, approved_by, approved_at, expires_at
    ) VALUES (
        p_user_id, v_plan_id, 'approved', v_actor_id, now(), p_expires_at
    )
    RETURNING * INTO v_approval;

    RETURN jsonb_build_object(
        'approval_id', v_approval.id,
        'user_id', v_approval.user_id,
        'plan_id', v_plan_id,
        'plan_code', v_plan_code,
        'expires_at', v_approval.expires_at,
        'status', v_approval.status
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.approve_tenant_registration(uuid, text, timestamptz)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_tenant_registration(uuid, text, timestamptz)
    TO authenticated, service_role, postgres;

-- Preserve the public ABI used by platform tenant creation and registration
-- recovery, while making every commercial decision server-owned.
CREATE OR REPLACE FUNCTION public.provision_tenant(
    p_name text,
    p_name_ar text DEFAULT NULL,
    p_slug text DEFAULT NULL,
    p_email text DEFAULT NULL,
    p_phone text DEFAULT NULL,
    p_address text DEFAULT NULL,
    p_cr_number text DEFAULT NULL,
    p_tax_number text DEFAULT NULL,
    p_country text DEFAULT NULL,
    p_city text DEFAULT NULL,
    p_postal_code text DEFAULT NULL,
    p_website text DEFAULT NULL,
    p_timezone text DEFAULT 'Asia/Riyadh',
    p_plan_code text DEFAULT NULL,
    p_trial_days integer DEFAULT NULL,
    p_assign_caller_as_admin boolean DEFAULT false,
    p_caller_full_name text DEFAULT NULL,
    p_caller_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
    v_auth_role text := auth.role();
    v_profile public.profiles%ROWTYPE;
    v_is_platform boolean := false;
    v_is_service boolean := v_auth_role = 'service_role';
    v_approval public.tenant_provisioning_approvals%ROWTYPE;
    v_tenant_id uuid;
    v_plan_id uuid;
    v_plan_code text;
    v_trial_days integer;
    v_slug text;
    v_base_slug text;
BEGIN
    IF NULLIF(btrim(p_name), '') IS NULL THEN
        RAISE EXCEPTION 'Tenant name is required' USING ERRCODE = '23502';
    END IF;

    IF p_trial_days IS NOT NULL THEN
        RAISE EXCEPTION 'Trial duration is server-owned and cannot be supplied by the caller'
            USING ERRCODE = '42501';
    END IF;

    IF NOT v_is_service THEN
        IF v_user_id IS NULL OR NOT public.current_actor_is_active() THEN
            RAISE EXCEPTION 'Active authenticated authority is required'
                USING ERRCODE = '42501';
        END IF;

        SELECT *
          INTO v_profile
          FROM public.profiles
         WHERE id = v_user_id
         FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Caller profile not found' USING ERRCODE = '42501';
        END IF;

        v_is_platform := v_profile.is_super_admin IS TRUE
            OR v_profile.role IN ('platform_owner', 'platform_admin');
    END IF;

    IF v_is_service OR v_is_platform THEN
        IF p_assign_caller_as_admin IS TRUE THEN
            RAISE EXCEPTION 'Platform/service provisioning cannot reassign the caller as tenant admin'
                USING ERRCODE = '42501';
        END IF;

        IF p_plan_code IS NULL THEN
            SELECT sp.id, sp.code::text, COALESCE(sp.trial_days, 0)
              INTO v_plan_id, v_plan_code, v_trial_days
              FROM public.subscription_plans sp
             WHERE sp.is_default IS TRUE
               AND sp.is_active IS TRUE
             ORDER BY sp.display_order, sp.created_at
             LIMIT 1;

            IF v_plan_id IS NULL THEN
                SELECT sp.id, sp.code::text, COALESCE(sp.trial_days, 0)
                  INTO v_plan_id, v_plan_code, v_trial_days
                  FROM public.subscription_plans sp
                 WHERE sp.is_active IS TRUE
                 ORDER BY sp.price_monthly, sp.display_order, sp.created_at
                 LIMIT 1;
            END IF;
        ELSE
            SELECT sp.id, sp.code::text, COALESCE(sp.trial_days, 0)
              INTO v_plan_id, v_plan_code, v_trial_days
              FROM public.subscription_plans sp
             WHERE sp.code = btrim(p_plan_code)
               AND sp.is_active IS TRUE
             LIMIT 1;
        END IF;
    ELSE
        IF p_assign_caller_as_admin IS NOT TRUE
           OR v_profile.tenant_id IS NOT NULL
           OR v_profile.role IS DISTINCT FROM 'user'
           OR p_plan_code IS NOT NULL
        THEN
            RAISE EXCEPTION 'A one-time approved signup flow is required for tenant provisioning'
                USING ERRCODE = '42501';
        END IF;

        SELECT a.*
          INTO v_approval
          FROM public.tenant_provisioning_approvals a
         WHERE a.user_id = v_user_id
           AND a.status = 'approved'
           AND a.expires_at > now()
         FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'A valid one-time tenant provisioning approval is required'
                USING ERRCODE = '42501';
        END IF;

        SELECT sp.id, sp.code::text, COALESCE(sp.trial_days, 0)
          INTO v_plan_id, v_plan_code, v_trial_days
          FROM public.subscription_plans sp
         WHERE sp.id = v_approval.plan_id
           AND sp.is_active IS TRUE;
    END IF;

    IF v_plan_id IS NULL OR v_trial_days IS NULL OR v_trial_days < 0 THEN
        RAISE EXCEPTION 'Approved subscription plan is unavailable or invalid'
            USING ERRCODE = 'P0002';
    END IF;

    v_base_slug := CASE
        WHEN p_slug IS NOT NULL AND length(btrim(p_slug)) >= 3
        THEN lower(regexp_replace(btrim(p_slug), '[^a-z0-9\-]', '', 'g'))
        ELSE lower(regexp_replace(p_name, '[^a-zA-Z0-9]', '', 'g'))
    END;

    IF v_base_slug IS NULL OR length(v_base_slug) < 3 THEN
        v_base_slug := 'tenant-' || substring(gen_random_uuid()::text FROM 1 FOR 8);
    END IF;

    v_slug := v_base_slug;
    WHILE EXISTS (SELECT 1 FROM public.tenants t WHERE t.slug = v_slug) LOOP
        v_slug := left(v_base_slug, 86) || '-' || substring(gen_random_uuid()::text FROM 1 FOR 8);
    END LOOP;

    INSERT INTO public.tenants (
        name, name_ar, slug, plan_id,
        cr_number, tax_number, address, country, city, postal_code,
        email, phone, website, timezone,
        created_at, updated_at
    ) VALUES (
        btrim(p_name), NULLIF(btrim(p_name_ar), ''), v_slug, v_plan_id,
        NULLIF(btrim(p_cr_number), ''), NULLIF(btrim(p_tax_number), ''),
        NULLIF(btrim(p_address), ''), NULLIF(btrim(p_country), ''),
        NULLIF(btrim(p_city), ''), NULLIF(btrim(p_postal_code), ''),
        NULLIF(btrim(p_email), ''), NULLIF(btrim(p_phone), ''),
        NULLIF(btrim(p_website), ''), COALESCE(NULLIF(btrim(p_timezone), ''), 'Asia/Riyadh'),
        now(), now()
    )
    RETURNING id INTO v_tenant_id;

    INSERT INTO public.tenant_subscriptions (
        tenant_id, plan_id, status, billing_cycle,
        trial_ends_at, current_period_start, current_period_end,
        amount, activated_by, updated_at
    ) VALUES (
        v_tenant_id, v_plan_id, 'trial', 'monthly',
        now() + make_interval(days => v_trial_days),
        now(), now() + make_interval(days => v_trial_days),
        0, 'admin', now()
    );

    IF NOT (v_is_service OR v_is_platform) THEN
        UPDATE public.profiles
           SET tenant_id = v_tenant_id,
               full_name = COALESCE(NULLIF(btrim(p_caller_full_name), ''), full_name),
               full_name_ar = COALESCE(NULLIF(btrim(p_caller_full_name), ''), full_name_ar),
               phone = COALESCE(NULLIF(btrim(p_caller_phone), ''), phone),
               role = 'tenant_admin',
               is_active = true,
               updated_at = now()
         WHERE id = v_user_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Approved signup profile could not be bound to the tenant'
                USING ERRCODE = 'P0002';
        END IF;

        UPDATE public.tenant_provisioning_approvals
           SET status = 'consumed',
               consumed_at = now(),
               tenant_id = v_tenant_id,
               updated_at = now()
         WHERE id = v_approval.id
           AND status = 'approved';

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Provisioning approval was already consumed'
                USING ERRCODE = '40001';
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'tenant_id', v_tenant_id,
        'slug', v_slug,
        'plan_id', v_plan_id,
        'plan_code', v_plan_code,
        'trial_days', v_trial_days,
        'approval_id', v_approval.id,
        'success', true
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.provision_tenant(
    text, text, text, text, text, text, text, text, text, text, text, text,
    text, text, integer, boolean, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provision_tenant(
    text, text, text, text, text, text, text, text, text, text, text, text,
    text, text, integer, boolean, text, text
) TO authenticated, service_role, postgres;

-- Existing recovery flow remains callable, but now succeeds only after the
-- bound one-time approval is present. The legacy wrappers can no longer expose
-- a second, unapproved creation path.
ALTER FUNCTION public.complete_pending_registration(jsonb)
    SET search_path TO 'pg_catalog', 'public', 'auth', 'pg_temp';
ALTER FUNCTION public.register_new_tenant(
    text, text, text, text, text, text, text, text, text, text, text, text, text
) SET search_path TO 'pg_catalog', 'public', 'pg_temp';

REVOKE ALL ON FUNCTION public.complete_pending_registration(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_pending_registration(jsonb)
    TO authenticated, service_role, postgres;

REVOKE ALL ON FUNCTION public.register_new_tenant(
    text, text, text, text, text, text, text, text, text, text, text, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_new_tenant(
    text, text, text, text, text, text, text, text, text, text, text, text, text
) TO authenticated, service_role, postgres;

-- The active history dropped this legacy RPC. If deployment drift retained it,
-- converge its ACL without recreating dead code.
DO $legacy_register_tenant_acl$
BEGIN
    IF to_regprocedure('public.register_tenant(text,text,text,text,text,text)') IS NOT NULL THEN
        EXECUTE 'REVOKE ALL ON FUNCTION public.register_tenant(text,text,text,text,text,text) FROM PUBLIC, anon, authenticated, service_role';
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.register_tenant(text,text,text,text,text,text) TO postgres';
    END IF;
END
$legacy_register_tenant_acl$;

-- ---------------------------------------------------------------------------
-- 4. Work-order authority and governance fail-closed paths.
-- ---------------------------------------------------------------------------

-- Replace the caller-settable workflow GUC with an explicit execution
-- boundary. Approved workflow RPCs are postgres-owned SECURITY DEFINER
-- functions, while direct Data API updates run as authenticated. The trigger
-- therefore needs no ambient session flag to distinguish the two paths.
CREATE OR REPLACE FUNCTION public.guard_work_order_sensitive_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
    v_new_json jsonb;
    v_old_json jsonb;
    v_field text;
    v_sensitive_fields text[] := ARRAY[
        'status',
        'assigned_to',
        'assigned_team',
        'start_time',
        'started_at',
        'end_time',
        'completed_at',
        'technician_completed_at',
        'technician_notes',
        'supervisor_approved_by',
        'supervisor_approved_at',
        'supervisor_notes',
        'engineer_approved_by',
        'engineer_approved_at',
        'engineer_notes',
        'maintenance_manager_approved_by',
        'maintenance_manager_approved_at',
        'maintenance_manager_notes',
        'customer_reviewed_by',
        'customer_reviewed_at',
        'reporter_notes',
        'pending_closure_since',
        'auto_closed_at',
        'cancelled_at',
        'cancellation_reason',
        'actual_cost',
        'sla_response_deadline',
        'sla_resolution_deadline',
        'sla_response_met',
        'sla_resolution_met',
        'completion_notes',
        'work_type',
        'source_schedule_id',
        'source_schedule_asset_id',
        'job_plan_id',
        'job_plan_snapshot',
        'scheduled_date',
        'compliance_deadline',
        'actual_duration_minutes'
    ];
BEGIN
    IF current_user IN ('postgres', 'service_role') THEN
        RETURN NEW;
    END IF;

    v_new_json := to_jsonb(NEW);
    v_old_json := to_jsonb(OLD);

    FOREACH v_field IN ARRAY v_sensitive_fields
    LOOP
        IF v_new_json ? v_field
           AND (v_new_json -> v_field) IS DISTINCT FROM (v_old_json -> v_field)
        THEN
            RAISE EXCEPTION
                'Direct update of workflow-sensitive field "%" is not allowed. Use an approved workflow RPC.',
                v_field
                USING ERRCODE = '42501';
        END IF;
    END LOOP;

    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_work_order_sensitive_fields()
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guard_work_order_sensitive_fields() TO postgres;

COMMENT ON FUNCTION public.guard_work_order_sensitive_fields() IS
    'Fail-closed sensitive-field guard: only explicit postgres-owned workflow RPCs or service_role operations may mutate workflow state; caller GUCs are ignored.';

-- Unknown cost must not be coerced to zero and routed into an auto-approval
-- tier. It can match only an explicit, non-auto, open-ended amount tier.
CREATE OR REPLACE FUNCTION public.select_approval_matrix_rule(
    p_tenant_id uuid,
    p_severity_rank integer,
    p_criticality_rank integer,
    p_amount numeric
)
RETURNS public.approval_matrix_rules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
    v_rule public.approval_matrix_rules%ROWTYPE;
BEGIN
    PERFORM public.ensure_default_approval_matrix_rules(p_tenant_id);

    SELECT *
      INTO v_rule
      FROM public.approval_matrix_rules r
     WHERE r.tenant_id = p_tenant_id
       AND r.is_active IS TRUE
       AND p_severity_rank >= r.severity_min_rank
       AND p_criticality_rank >= r.criticality_min_rank
       AND (
            (
                p_amount IS NULL
                AND r.amount_max IS NULL
                AND r.auto_approve IS FALSE
            )
            OR (
                p_amount IS NOT NULL
                AND (r.amount_min IS NULL OR p_amount >= r.amount_min)
                AND (r.amount_max IS NULL OR p_amount <= r.amount_max)
            )
       )
     ORDER BY r.priority, r.created_at
     LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'No fail-closed approval matrix rule matched tenant %, severity rank %, criticality rank %, amount %',
            p_tenant_id, p_severity_rank, p_criticality_rank, p_amount
            USING ERRCODE = 'P0002';
    END IF;

    RETURN v_rule;
END;
$function$;

REVOKE ALL ON FUNCTION public.select_approval_matrix_rule(uuid, integer, integer, numeric)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.select_approval_matrix_rule(uuid, integer, integer, numeric)
    TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.guard_work_order_governance_active_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth', 'pg_temp'
AS $function$
BEGIN
    IF auth.uid() IS NOT NULL AND NOT public.current_actor_is_active() THEN
        RAISE EXCEPTION 'Inactive or suspended users cannot mutate work-order governance'
            USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_work_order_governance_active_actor()
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guard_work_order_governance_active_actor() TO postgres;

DROP TRIGGER IF EXISTS trg_guard_work_order_governance_active_actor
    ON public.work_order_governance;
CREATE TRIGGER trg_guard_work_order_governance_active_actor
BEFORE INSERT OR UPDATE OR DELETE ON public.work_order_governance
FOR EACH ROW EXECUTE FUNCTION public.guard_work_order_governance_active_actor();

CREATE OR REPLACE FUNCTION public.guard_work_order_active_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth', 'pg_temp'
AS $function$
BEGIN
    IF auth.uid() IS NOT NULL AND NOT public.current_actor_is_active() THEN
        RAISE EXCEPTION 'Inactive or suspended users cannot mutate work orders'
            USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_work_order_active_actor()
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guard_work_order_active_actor() TO postgres;

DROP TRIGGER IF EXISTS trg_guard_work_order_active_actor ON public.work_orders;
CREATE TRIGGER trg_guard_work_order_active_actor
BEFORE INSERT OR UPDATE OR DELETE ON public.work_orders
FOR EACH ROW EXECUTE FUNCTION public.guard_work_order_active_actor();

-- Once a tenant has activated an approval matrix, absence of a governance row
-- is no longer permission to start. Explicit emergency state remains a valid
-- route and assigned-worker checks stay in start_work_order/wo_start.
CREATE OR REPLACE FUNCTION public.guard_standard_governance_before_work_order_start()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
    v_route_type text;
    v_governance_state text;
BEGIN
    IF NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.status <> 'in_progress' THEN
        RETURN NEW;
    END IF;

    -- Preventive work orders inherit their authority from the approved PM plan
    -- and retain the established wo_start/WO-triggered execution paths.
    IF NEW.work_type = 'preventive' OR NEW.source_schedule_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT g.route_type, g.governance_state
      INTO v_route_type, v_governance_state
      FROM public.work_order_governance g
     WHERE g.work_order_id = NEW.id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Work-order governance must be evaluated before work starts'
            USING ERRCODE = '42501';
    END IF;

    IF v_route_type = 'emergency_override'
       AND v_governance_state IN ('post_action_required', 'post_action_complete', 'approved')
    THEN
        RETURN NEW;
    END IF;

    IF v_route_type = 'standard' AND v_governance_state = 'approved' THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Work order cannot start from governance route/state %/%',
        v_route_type, v_governance_state
        USING ERRCODE = '42501';
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_work_order_governance_inputs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
    v_actor_role text;
    v_actor_tenant_id uuid;
    v_actor_is_super boolean;
BEGIN
    IF NEW.priority IS NOT DISTINCT FROM OLD.priority
       AND NEW.estimated_cost IS NOT DISTINCT FROM OLD.estimated_cost
       AND NEW.asset_id IS NOT DISTINCT FROM OLD.asset_id
       AND NEW.building_id IS NOT DISTINCT FROM OLD.building_id
       AND NEW.floor_id IS NOT DISTINCT FROM OLD.floor_id
       AND NEW.room_id IS NOT DISTINCT FROM OLD.room_id
    THEN
        RETURN NEW;
    END IF;

    -- Risk-driving inputs may be supplied when a report is created, but an
    -- involved worker must not be able to downgrade them before asking the
    -- approval engine to evaluate the work order.
    IF auth.uid() IS NOT NULL THEN
        IF NOT public.current_actor_is_active() THEN
            RAISE EXCEPTION 'Inactive or suspended users cannot change governance inputs'
                USING ERRCODE = '42501';
        END IF;

        SELECT p.role, p.tenant_id, p.is_super_admin IS TRUE
          INTO v_actor_role, v_actor_tenant_id, v_actor_is_super
          FROM public.profiles p
         WHERE p.id = auth.uid();

        IF NOT FOUND
           OR NOT (
                v_actor_is_super
                OR v_actor_role IN ('platform_owner', 'platform_admin')
                OR (
                    v_actor_tenant_id = OLD.tenant_id
                    AND v_actor_role IN ('tenant_admin', 'maintenance_manager')
                )
           )
        THEN
            RAISE EXCEPTION 'Only work-order management authority can change governance inputs'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.work_order_governance g
         WHERE g.work_order_id = OLD.id
           AND (
                g.route_type = 'emergency_override'
                OR g.governance_state IN ('pending_approval', 'approved')
           )
    ) THEN
        RAISE EXCEPTION 'Risk-driving work-order fields cannot change after governance evaluation'
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_work_order_governance_inputs()
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guard_work_order_governance_inputs() TO postgres;

DROP TRIGGER IF EXISTS trg_guard_work_order_governance_inputs ON public.work_orders;
CREATE TRIGGER trg_guard_work_order_governance_inputs
BEFORE UPDATE OF priority, estimated_cost, asset_id, building_id, floor_id, room_id
ON public.work_orders
FOR EACH ROW EXECUTE FUNCTION public.guard_work_order_governance_inputs();

CREATE OR REPLACE FUNCTION public.guard_emergency_governance_before_work_order_close()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
    v_governance_state text;
    v_emergency_started boolean;
BEGIN
    IF NEW.status IS NOT DISTINCT FROM OLD.status
       OR NEW.status NOT IN ('completed', 'auto_closed', 'archived')
    THEN
        RETURN NEW;
    END IF;

    SELECT g.governance_state
      INTO v_governance_state
      FROM public.work_order_governance g
     WHERE g.work_order_id = NEW.id
       AND g.route_type = 'emergency_override';

    IF FOUND THEN
        IF v_governance_state IS DISTINCT FROM 'approved' THEN
            RAISE EXCEPTION 'Emergency work order cannot close before governance approval; state=%',
                v_governance_state USING ERRCODE = '42501';
        END IF;
        RETURN NEW;
    END IF;

    SELECT EXISTS (
        SELECT 1
          FROM public.operation_log_events e
         WHERE e.work_order_id = NEW.id
           AND e.event_type = 'governance.emergency_started'
    ) INTO v_emergency_started;

    IF v_emergency_started THEN
        RAISE EXCEPTION 'Emergency governance evidence exists but its authority record is missing'
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_standard_governance_before_work_order_start()
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guard_standard_governance_before_work_order_start()
    TO postgres;
REVOKE ALL ON FUNCTION public.guard_emergency_governance_before_work_order_close()
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guard_emergency_governance_before_work_order_close()
    TO postgres;

-- Recreate emergency start with explicit governance state before the normal
-- start RPC. The caller may increase severity, but cannot lower the canonical
-- floor derived from work-order priority and asset criticality.
CREATE OR REPLACE FUNCTION public.start_work_order_emergency(
    p_work_order_id uuid,
    p_override_reason text,
    p_override_severity text,
    p_evidence jsonb,
    p_affected_asset_id uuid DEFAULT NULL,
    p_affected_building_id uuid DEFAULT NULL,
    p_affected_floor_id uuid DEFAULT NULL,
    p_affected_room_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
    v_actor_id uuid := auth.uid();
    v_wo public.work_orders%ROWTYPE;
    v_governance public.work_order_governance%ROWTYPE;
    v_affected_asset_id uuid;
    v_affected_building_id uuid;
    v_affected_floor_id uuid;
    v_affected_room_id uuid;
    v_priority_severity text;
    v_asset_severity text := 'low';
    v_effective_severity text;
    v_effective_rank integer;
BEGIN
    IF v_actor_id IS NULL OR NOT public.current_actor_is_active() THEN
        RAISE EXCEPTION 'Active authentication is required'
            USING ERRCODE = '42501';
    END IF;
    IF p_work_order_id IS NULL THEN
        RAISE EXCEPTION 'Work order id is required' USING ERRCODE = '22023';
    END IF;
    IF NULLIF(btrim(p_override_reason), '') IS NULL THEN
        RAISE EXCEPTION 'Emergency override reason is required' USING ERRCODE = '23502';
    END IF;
    IF p_override_severity NOT IN ('low', 'medium', 'high', 'critical', 'life_safety') THEN
        RAISE EXCEPTION 'Invalid emergency override severity: %', p_override_severity
            USING ERRCODE = '22023';
    END IF;
    IF p_evidence IS NULL
       OR jsonb_typeof(p_evidence) NOT IN ('array', 'object')
       OR p_evidence IN ('[]'::jsonb, '{}'::jsonb)
    THEN
        RAISE EXCEPTION 'Emergency override evidence is required' USING ERRCODE = '23502';
    END IF;

    SELECT *
      INTO v_wo
      FROM public.work_orders
     WHERE id = p_work_order_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Work order not found' USING ERRCODE = 'P0002';
    END IF;

    -- start_work_order remains the authority for tenant, role, assignment and
    -- current workflow status. The insert below is rolled back if it rejects.
    IF EXISTS (
        SELECT 1 FROM public.work_order_governance g
         WHERE g.work_order_id = p_work_order_id
    ) THEN
        RAISE EXCEPTION 'Governance record already exists for this work order'
            USING ERRCODE = '23505';
    END IF;

    v_affected_asset_id := COALESCE(p_affected_asset_id, v_wo.asset_id);
    v_affected_building_id := COALESCE(p_affected_building_id, v_wo.building_id);
    v_affected_floor_id := COALESCE(p_affected_floor_id, v_wo.floor_id);
    v_affected_room_id := COALESCE(p_affected_room_id, v_wo.room_id);

    -- Optional request fields may fill a missing scope, but may never replace
    -- canonical work-order identity to select a lower-risk asset or location.
    IF (v_wo.asset_id IS NOT NULL
            AND p_affected_asset_id IS NOT NULL
            AND p_affected_asset_id IS DISTINCT FROM v_wo.asset_id)
       OR (v_wo.building_id IS NOT NULL
            AND p_affected_building_id IS NOT NULL
            AND p_affected_building_id IS DISTINCT FROM v_wo.building_id)
       OR (v_wo.floor_id IS NOT NULL
            AND p_affected_floor_id IS NOT NULL
            AND p_affected_floor_id IS DISTINCT FROM v_wo.floor_id)
       OR (v_wo.room_id IS NOT NULL
            AND p_affected_room_id IS NOT NULL
            AND p_affected_room_id IS DISTINCT FROM v_wo.room_id)
    THEN
        RAISE EXCEPTION 'Emergency affected asset/location cannot replace canonical work-order scope'
            USING ERRCODE = '42501';
    END IF;

    IF v_affected_asset_id IS NULL
       AND v_affected_building_id IS NULL
       AND v_affected_floor_id IS NULL
       AND v_affected_room_id IS NULL
    THEN
        RAISE EXCEPTION 'Emergency override requires an affected asset or location'
            USING ERRCODE = '23502';
    END IF;

    IF NOT public.work_order_asset_location_is_valid(
        v_wo.tenant_id,
        v_affected_building_id,
        v_affected_floor_id,
        v_affected_room_id,
        v_affected_asset_id
    ) THEN
        RAISE EXCEPTION 'Invalid affected asset or location for this tenant'
            USING ERRCODE = '42501';
    END IF;

    v_priority_severity := CASE v_wo.priority
        WHEN 'urgent' THEN 'critical'
        WHEN 'high' THEN 'high'
        WHEN 'medium' THEN 'medium'
        WHEN 'low' THEN 'low'
        ELSE 'medium'
    END;

    IF v_affected_asset_id IS NOT NULL THEN
        SELECT CASE COALESCE(a.criticality, 'medium')
            WHEN 'critical' THEN 'critical'
            WHEN 'high' THEN 'high'
            WHEN 'medium' THEN 'medium'
            ELSE 'low'
        END
          INTO v_asset_severity
          FROM public.assets a
         WHERE a.id = v_affected_asset_id
           AND a.tenant_id = v_wo.tenant_id;
        v_asset_severity := COALESCE(v_asset_severity, 'medium');
    END IF;

    v_effective_rank := GREATEST(
        public.governance_severity_rank(p_override_severity),
        public.governance_severity_rank(v_priority_severity),
        public.governance_severity_rank(v_asset_severity)
    );
    v_effective_severity := CASE v_effective_rank
        WHEN 5 THEN 'life_safety'
        WHEN 4 THEN 'critical'
        WHEN 3 THEN 'high'
        WHEN 2 THEN 'medium'
        ELSE 'low'
    END;

    INSERT INTO public.work_order_governance (
        tenant_id, work_order_id, route_type, governance_state,
        override_reason, override_severity, override_evidence,
        affected_asset_id, affected_building_id, affected_floor_id, affected_room_id,
        started_by, started_at, created_at, updated_at
    ) VALUES (
        v_wo.tenant_id, p_work_order_id, 'emergency_override', 'post_action_required',
        btrim(p_override_reason), v_effective_severity, p_evidence,
        v_affected_asset_id, v_affected_building_id, v_affected_floor_id, v_affected_room_id,
        v_actor_id, now(), now(), now()
    ) RETURNING * INTO v_governance;

    PERFORM public.start_work_order(p_work_order_id);

    PERFORM public.create_governance_log_event(
        v_governance.tenant_id,
        v_governance.work_order_id,
        'Emergency override started',
        v_governance.override_reason,
        v_actor_id,
        'governance.emergency_started',
        'work_order_governance',
        v_governance.id,
        NULL,
        to_jsonb(v_governance),
        jsonb_build_object(
            'started_via', 'start_work_order',
            'requested_severity', p_override_severity,
            'effective_severity', v_effective_severity,
            'priority_floor', v_priority_severity,
            'asset_floor', v_asset_severity
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'work_order_id', p_work_order_id,
        'governance_id', v_governance.id,
        'governance_state', v_governance.governance_state,
        'requested_severity', p_override_severity,
        'effective_severity', v_effective_severity,
        'started_via', 'start_work_order'
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.start_work_order_emergency(
    uuid, text, text, jsonb, uuid, uuid, uuid, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_work_order_emergency(
    uuid, text, text, jsonb, uuid, uuid, uuid, uuid
) TO authenticated;

-- A restrictive policy composes with every existing permissive policy. This
-- makes the central suspension switch authoritative for direct Data API access
-- even where historical policies still inspect profiles or auth.uid() inline.
-- Anonymous public-portal paths and explicit service/postgres workflows retain
-- their separate authority models.
DO $active_actor_rls_gate$
DECLARE
    v_table record;
BEGIN
    FOR v_table IN
        SELECT n.nspname AS schema_name, c.relname AS table_name
          FROM pg_catalog.pg_class c
          JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relkind IN ('r', 'p')
           AND c.relrowsecurity IS TRUE
         ORDER BY c.relname
    LOOP
        EXECUTE format(
            'DROP POLICY IF EXISTS mutqan_active_authenticated_actor ON %I.%I',
            v_table.schema_name,
            v_table.table_name
        );
        EXECUTE format(
            'CREATE POLICY mutqan_active_authenticated_actor ON %I.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.current_actor_is_active()) WITH CHECK (public.current_actor_is_active())',
            v_table.schema_name,
            v_table.table_name
        );
    END LOOP;
END;
$active_actor_rls_gate$;

COMMIT;
