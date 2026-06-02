-- =============================================================================
-- Migration: 131_hospital_lite_report_foundation.sql
-- Phase: Hospital Lite Mode — Phase 1 (Foundation & Isolation)
-- Purpose:
--   Prepare the *structure* of the unified report lifecycle on work_orders
--   without building behaviour yet. Three additive, backward-compatible changes:
--     1. New terminal status 'rejected' = authority rejected the report outright
--        (reporter-visible). Distinct from the existing 'rejected_by_technician'
--        return-to-work path, which is left completely unchanged.
--     2. rejection_reason column = the reporter-visible reason for that terminal
--        rejection. Wired into the rejection RPC in a later phase.
--     3. tracking_token column = long random token for public tracking links so
--        the row UUID is never published. submit_public_work_order now returns it.
--
-- Guard note (migration 120): the tracking_token backfill below only touches
--   tracking_token, which is NOT a workflow-sensitive field, so the
--   guard_work_order_sensitive_fields trigger allows it (no sensitive field
--   changes). The future 'rejected' transition WILL be guarded and must go
--   through an authorized RPC — that belongs to the approval phase, not here.
--
-- Scope guardrails honoured:
--   * No standalone reports/approvals tables (unified model on work_orders).
--   * No change to billing/subscription logic.
--   * 'auto_closed'/'on_hold' constraint drift is intentionally NOT touched.
--   * tenant_id is still derived server-side from the token inside the RPC;
--     it is never accepted from the caller.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Terminal authority-rejection status
-- -----------------------------------------------------------------------------
-- Extend (do not replace) the existing status set from migration 011 by adding
-- 'rejected'. Every previously-allowed value is preserved verbatim.
DO $$
BEGIN
    ALTER TABLE public.work_orders DROP CONSTRAINT IF EXISTS work_orders_status_check;

    ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_status_check CHECK (
        status IN (
            'pending',
            'assigned',
            'in_progress',
            'pending_supervisor_approval',
            'pending_engineer_review',
            'pending_reporter_closure',
            'completed',
            'rejected_by_technician',
            'cancelled',
            'archived',
            'rejected'  -- NEW: authority rejected the report outright (terminal, reporter-visible)
        )
    );
END $$;

COMMENT ON CONSTRAINT work_orders_status_check ON public.work_orders IS
    'Hospital Lite phase 1: added terminal status ''rejected'' (authority rejected the report; reporter sees it with rejection_reason). ''rejected_by_technician'' is unchanged and still means return-to-work.';

-- -----------------------------------------------------------------------------
-- 2) Reporter-visible rejection reason
-- -----------------------------------------------------------------------------
ALTER TABLE public.work_orders
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

COMMENT ON COLUMN public.work_orders.rejection_reason IS
    'Reporter-visible reason captured when an authority sets status=''rejected''. Populated by the rejection RPC in a later phase; structural only here.';

-- -----------------------------------------------------------------------------
-- 3) Public tracking token
-- -----------------------------------------------------------------------------
-- Add the column nullable first, backfill with a per-row volatile random value
-- (guarantees uniqueness), then set DEFAULT + NOT NULL + UNIQUE. Doing the
-- backfill explicitly avoids any ambiguity about whether a column-add default
-- is evaluated once or per row.
ALTER TABLE public.work_orders
    ADD COLUMN IF NOT EXISTS tracking_token TEXT;

UPDATE public.work_orders
   SET tracking_token = encode(gen_random_bytes(32), 'hex')
 WHERE tracking_token IS NULL;

ALTER TABLE public.work_orders
    ALTER COLUMN tracking_token SET DEFAULT encode(gen_random_bytes(32), 'hex');

ALTER TABLE public.work_orders
    ALTER COLUMN tracking_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_work_orders_tracking_token
    ON public.work_orders (tracking_token);

COMMENT ON COLUMN public.work_orders.tracking_token IS
    'Long random token for public tracking links (phase 3). The row UUID is never published. There is no direct RLS read path for the public; a dedicated SECURITY DEFINER RPC will read a single report by this token in phase 3.';

-- -----------------------------------------------------------------------------
-- 4) submit_public_work_order now returns the tracking token
-- -----------------------------------------------------------------------------
-- The only caller (src/pages/public/PublicReportPage.tsx) destructures just
-- { error } and ignores the returned data, so enriching the return type does
-- not break it. We return JSONB { work_order_id, code, tracking_token } so the
-- reporter can be shown a short number (code) and a tracking link (token).
--
-- IMPORTANT: tenant_id is still resolved *inside* the function from the token
-- and is never accepted as an argument. All entitlement and cross-tenant
-- ownership checks are preserved exactly as before.
DROP FUNCTION IF EXISTS public.submit_public_work_order(text, text, text, text, uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.submit_public_work_order(
    p_token TEXT,
    p_reporter_name TEXT,
    p_reporter_phone TEXT,
    p_description TEXT,
    p_building_id UUID,
    p_floor_id UUID DEFAULT NULL,
    p_asset_id UUID DEFAULT NULL
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id      UUID;
    v_new_id         UUID;
    v_code           TEXT;
    v_tracking_token TEXT;
BEGIN
    -- 1. Resolve tenant from the token only (server-side tenant injection).
    SELECT tenant_id
      INTO v_tenant_id
      FROM public.tenant_access_tokens
     WHERE token = p_token
       AND is_active = TRUE
       AND public.has_public_portal_access(tenant_id)
     LIMIT 1;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Invalid or expired token';
    END IF;

    -- 2. Validate that any provided location/asset belongs to this tenant.
    IF p_building_id IS NOT NULL THEN
        PERFORM 1
          FROM public.buildings
         WHERE id = p_building_id
           AND tenant_id = v_tenant_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invalid building for this organization';
        END IF;
    END IF;

    IF p_floor_id IS NOT NULL THEN
        PERFORM 1
          FROM public.floors f
          JOIN public.buildings b ON f.building_id = b.id
         WHERE f.id = p_floor_id
           AND b.tenant_id = v_tenant_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invalid floor for this organization';
        END IF;
    END IF;

    IF p_asset_id IS NOT NULL THEN
        PERFORM 1
          FROM public.assets
         WHERE id = p_asset_id
           AND tenant_id = v_tenant_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invalid asset for this organization';
        END IF;
    END IF;

    -- 3. Create the report (work_order). tracking_token is generated by its
    --    column DEFAULT and returned to the reporter.
    -- Use core gen_random_uuid() (pg_catalog) rather than uuid_generate_v4():
    -- the function pins search_path=public, and uuid-ossp lives in the
    -- extensions schema, so uuid_generate_v4() is unresolvable here. This also
    -- repairs a pre-existing regression carried since migration 098.
    v_code := 'PUB-' || to_char(NOW(), 'YYMMDD') || '-' || substring(gen_random_uuid()::text from 1 for 4);

    INSERT INTO public.work_orders (
        tenant_id,
        code,
        title,
        description,
        status,
        priority,
        building_id,
        floor_id,
        asset_id,
        reporter_name,
        reporter_phone,
        reported_at,
        created_at
    ) VALUES (
        v_tenant_id,
        v_code,
        'بلاغ عام: ' || COALESCE(substring(p_description from 1 for 30), 'General Issue'),
        p_description,
        'pending',
        'medium',
        p_building_id,
        p_floor_id,
        p_asset_id,
        p_reporter_name,
        p_reporter_phone,
        NOW(),
        NOW()
    )
    RETURNING id, tracking_token INTO v_new_id, v_tracking_token;

    -- 4. Audit log (no user id for public submissions).
    PERFORM public.create_operation_log(
        v_tenant_id,
        v_new_id,
        'create',
        'Public report submitted by: ' || p_reporter_name,
        NULL
    );

    RETURN jsonb_build_object(
        'work_order_id', v_new_id,
        'code', v_code,
        'tracking_token', v_tracking_token
    );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.submit_public_work_order(TEXT, TEXT, TEXT, TEXT, UUID, UUID, UUID) IS
    'Submits a public report (work_order) only when the token is active and the tenant has the public_portal entitlement. tenant_id is derived server-side from the token and never accepted from the caller. Returns JSONB { work_order_id, code, tracking_token } for phase-3 tracking. (Hospital Lite phase 1.)';
