-- ==============================================================================
-- Migration: 092_complete_pending_registration.sql
-- Purpose:
--   1) Make tenant self-registration resumable after auth succeeds
--   2) Reuse the same secure backend path for first-time provisioning and retries
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.complete_pending_registration(p_draft JSONB DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_profile public.profiles%ROWTYPE;
    v_draft JSONB := p_draft;
    v_result JSONB;
    v_full_name TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT *
      INTO v_profile
      FROM public.profiles
     WHERE id = v_user_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Caller profile not found';
    END IF;

    IF v_profile.tenant_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'tenant_id', v_profile.tenant_id,
            'already_completed', true
        );
    END IF;

    IF COALESCE(v_profile.is_super_admin, FALSE) = TRUE OR v_profile.role LIKE 'platform_%' THEN
        RAISE EXCEPTION 'Platform users do not require tenant provisioning';
    END IF;

    IF v_draft IS NULL THEN
        SELECT raw_user_meta_data -> 'registration_draft'
          INTO v_draft
          FROM auth.users
         WHERE id = v_user_id;
    END IF;

    IF v_draft IS NULL OR jsonb_typeof(v_draft) <> 'object' THEN
        RAISE EXCEPTION 'No pending registration draft found for this user';
    END IF;

    IF NULLIF(TRIM(v_draft->>'org_name_ar'), '') IS NULL
        OR NULLIF(TRIM(v_draft->>'org_name_en'), '') IS NULL
        OR NULLIF(TRIM(v_draft->>'org_address'), '') IS NULL
        OR NULLIF(TRIM(v_draft->>'org_city'), '') IS NULL
        OR NULLIF(TRIM(v_draft->>'cr_number'), '') IS NULL
        OR NULLIF(TRIM(v_draft->>'tax_number'), '') IS NULL
    THEN
        RAISE EXCEPTION 'Registration draft is incomplete';
    END IF;

    v_full_name := NULLIF(
        TRIM(
            CONCAT_WS(
                ' ',
                NULLIF(TRIM(v_draft->>'first_name'), ''),
                NULLIF(TRIM(v_draft->>'last_name'), '')
            )
        ),
        ''
    );

    v_result := public.provision_tenant(
        p_name                   := NULLIF(TRIM(v_draft->>'org_name_en'), ''),
        p_name_ar                := NULLIF(TRIM(v_draft->>'org_name_ar'), ''),
        p_email                  := COALESCE(NULLIF(TRIM(v_draft->>'org_email'), ''), v_profile.email),
        p_phone                  := NULLIF(TRIM(v_draft->>'org_phone'), ''),
        p_address                := NULLIF(TRIM(v_draft->>'org_address'), ''),
        p_cr_number              := NULLIF(TRIM(v_draft->>'cr_number'), ''),
        p_tax_number             := NULLIF(TRIM(v_draft->>'tax_number'), ''),
        p_country                := NULLIF(TRIM(v_draft->>'org_country'), ''),
        p_city                   := NULLIF(TRIM(v_draft->>'org_city'), ''),
        p_postal_code            := NULLIF(TRIM(v_draft->>'org_postal_code'), ''),
        p_website                := NULLIF(TRIM(v_draft->>'org_website'), ''),
        p_plan_code              := NULL,
        p_trial_days             := NULL,
        p_assign_caller_as_admin := TRUE,
        p_caller_full_name       := COALESCE(v_full_name, v_profile.full_name, v_profile.email),
        p_caller_phone           := COALESCE(
            NULLIF(TRIM(v_draft->>'admin_phone'), ''),
            NULLIF(TRIM(v_draft->>'org_phone'), ''),
            v_profile.phone
        )
    );

    UPDATE auth.users
       SET raw_user_meta_data =
            (COALESCE(raw_user_meta_data, '{}'::jsonb) - 'registration_draft')
            || jsonb_build_object('registration_status', 'completed')
     WHERE id = v_user_id;

    RETURN v_result || jsonb_build_object('completed_via', 'registration_recovery');
END;
$$;

REVOKE ALL ON FUNCTION public.complete_pending_registration(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_pending_registration(JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_pending_registration(JSONB) TO authenticated;
