-- 131_hospital_lite_report_foundation.sql (Hospital Lite phase 1)
-- 1) Terminal authority-rejection status
DO $$
BEGIN
    ALTER TABLE public.work_orders DROP CONSTRAINT IF EXISTS work_orders_status_check;
    ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_status_check CHECK (
        status IN (
            'pending','assigned','in_progress',
            'pending_supervisor_approval','pending_engineer_review','pending_reporter_closure',
            'completed','rejected_by_technician','cancelled','archived',
            'rejected'
        )
    );
END $$;

COMMENT ON CONSTRAINT work_orders_status_check ON public.work_orders IS
    'Hospital Lite phase 1: added terminal status ''rejected'' (authority rejected the report; reporter sees it with rejection_reason). ''rejected_by_technician'' is unchanged and still means return-to-work.';

-- 2) Reporter-visible rejection reason
ALTER TABLE public.work_orders
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

COMMENT ON COLUMN public.work_orders.rejection_reason IS
    'Reporter-visible reason captured when an authority sets status=''rejected''. Populated by the rejection RPC in a later phase; structural only here.';

-- 3) Public tracking token
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

-- 4) submit_public_work_order now returns the tracking token (JSONB)
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

    IF p_building_id IS NOT NULL THEN
        PERFORM 1 FROM public.buildings WHERE id = p_building_id AND tenant_id = v_tenant_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invalid building for this organization';
        END IF;
    END IF;

    IF p_floor_id IS NOT NULL THEN
        PERFORM 1 FROM public.floors f JOIN public.buildings b ON f.building_id = b.id
         WHERE f.id = p_floor_id AND b.tenant_id = v_tenant_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invalid floor for this organization';
        END IF;
    END IF;

    IF p_asset_id IS NOT NULL THEN
        PERFORM 1 FROM public.assets WHERE id = p_asset_id AND tenant_id = v_tenant_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invalid asset for this organization';
        END IF;
    END IF;

    v_code := 'PUB-' || to_char(NOW(), 'YYMMDD') || '-' || substring(uuid_generate_v4()::text from 1 for 4);

    INSERT INTO public.work_orders (
        tenant_id, code, title, description, status, priority,
        building_id, floor_id, asset_id, reporter_name, reporter_phone,
        reported_at, created_at
    ) VALUES (
        v_tenant_id, v_code,
        'بلاغ عام: ' || COALESCE(substring(p_description from 1 for 30), 'General Issue'),
        p_description, 'pending', 'medium',
        p_building_id, p_floor_id, p_asset_id, p_reporter_name, p_reporter_phone,
        NOW(), NOW()
    )
    RETURNING id, tracking_token INTO v_new_id, v_tracking_token;

    PERFORM public.create_operation_log(
        v_tenant_id, v_new_id, 'create',
        'Public report submitted by: ' || p_reporter_name, NULL
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
