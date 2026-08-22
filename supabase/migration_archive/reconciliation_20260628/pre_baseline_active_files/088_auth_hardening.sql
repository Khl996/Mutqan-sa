-- ==============================================================================
-- Migration: 088_auth_hardening.sql
-- Purpose: Remove unsafe signup trust and protect sensitive profile fields
-- ==============================================================================

-- 1) Disable the global auto-confirm trigger for public signups
DROP TRIGGER IF EXISTS on_auth_user_created_auto_confirm ON auth.users;
DROP FUNCTION IF EXISTS public.auto_confirm_user();


-- 2) Recreate handle_new_user so signup metadata cannot assign role/tenant
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_full_name TEXT;
    v_full_name_ar TEXT;
BEGIN
    v_full_name := COALESCE(
        NULLIF(TRIM(new.raw_user_meta_data->>'full_name'), ''),
        SPLIT_PART(new.email, '@', 1)
    );

    v_full_name_ar := COALESCE(
        NULLIF(TRIM(new.raw_user_meta_data->>'full_name_ar'), ''),
        v_full_name
    );

    INSERT INTO public.profiles (
        id,
        email,
        full_name,
        full_name_ar,
        role,
        tenant_id,
        is_active,
        updated_at
    )
    VALUES (
        new.id,
        new.email,
        v_full_name,
        v_full_name_ar,
        'user',
        NULL,
        TRUE,
        NOW()
    )
    ON CONFLICT (id) DO UPDATE
    SET
        email = EXCLUDED.email,
        full_name = COALESCE(NULLIF(public.profiles.full_name, ''), EXCLUDED.full_name),
        full_name_ar = COALESCE(NULLIF(public.profiles.full_name_ar, ''), EXCLUDED.full_name_ar),
        updated_at = NOW();

    RETURN new;
END;
$$;


-- 3) Protect sensitive profile fields from direct client-side escalation
CREATE OR REPLACE FUNCTION public.enforce_profile_update_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role TEXT;
    v_caller_tenant UUID;
BEGIN
    IF current_setting('app.bypass_profile_guard', true) = '1' THEN
        RETURN NEW;
    END IF;

    IF auth.role() = 'service_role' OR v_caller_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT role, tenant_id
      INTO v_caller_role, v_caller_tenant
      FROM public.profiles
     WHERE id = v_caller_id;

    IF v_caller_role IS NULL THEN
        RAISE EXCEPTION 'Caller profile not found';
    END IF;

    -- Self updates may edit profile info, but never role/tenant/admin/email/activity flags
    IF OLD.id = v_caller_id THEN
        IF NEW.role IS DISTINCT FROM OLD.role
            OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
            OR COALESCE(NEW.is_super_admin, FALSE) IS DISTINCT FROM COALESCE(OLD.is_super_admin, FALSE)
            OR COALESCE(NEW.is_active, TRUE) IS DISTINCT FROM COALESCE(OLD.is_active, TRUE)
            OR COALESCE(NEW.email, '') IS DISTINCT FROM COALESCE(OLD.email, '')
        THEN
            RAISE EXCEPTION 'You are not allowed to modify protected profile fields directly';
        END IF;

        RETURN NEW;
    END IF;

    -- Platform owners/admins may manage other accounts, but never through direct client updates to owner role
    IF v_caller_role IN ('platform_owner', 'platform_admin') THEN
        IF OLD.role = 'platform_owner' OR NEW.role = 'platform_owner' THEN
            RAISE EXCEPTION 'Platform owner accounts cannot be changed through direct client updates';
        END IF;

        IF v_caller_role = 'platform_admin'
            AND NEW.role = 'platform_admin'
            AND OLD.role IS DISTINCT FROM 'platform_admin'
        THEN
            RAISE EXCEPTION 'Only platform owners can assign platform_admin';
        END IF;

        RETURN NEW;
    END IF;

    -- Tenant admins/owners may manage users inside their own tenant only
    IF v_caller_role IN ('tenant_admin', 'tenant_owner') THEN
        IF OLD.tenant_id IS DISTINCT FROM v_caller_tenant OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
            RAISE EXCEPTION 'You can only manage profiles inside your own organization';
        END IF;

        IF COALESCE(NEW.email, '') IS DISTINCT FROM COALESCE(OLD.email, '')
            OR COALESCE(NEW.is_super_admin, FALSE) IS DISTINCT FROM COALESCE(OLD.is_super_admin, FALSE)
        THEN
            RAISE EXCEPTION 'You are not allowed to change protected identity fields';
        END IF;

        IF OLD.role LIKE 'platform_%' OR NEW.role LIKE 'platform_%' THEN
            RAISE EXCEPTION 'Tenant managers cannot assign platform roles';
        END IF;

        IF OLD.role = 'tenant_owner' OR NEW.role = 'tenant_owner' THEN
            RAISE EXCEPTION 'Tenant owner role cannot be reassigned through direct client updates';
        END IF;

        IF NEW.role NOT IN (
            'tenant_admin',
            'facility_manager',
            'maintenance_manager',
            'supervisor',
            'technician',
            'engineer',
            'reporter',
            'user'
        ) THEN
            RAISE EXCEPTION 'Invalid tenant-scoped role assignment';
        END IF;

        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'You are not allowed to update this profile';
END;
$$;

DROP TRIGGER IF EXISTS enforce_profile_update_permissions ON public.profiles;
CREATE TRIGGER enforce_profile_update_permissions
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_profile_update_permissions();
