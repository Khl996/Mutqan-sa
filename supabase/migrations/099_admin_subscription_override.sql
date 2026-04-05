-- =====================================================
-- Migration: 099_admin_subscription_override.sql
-- Purpose: Add admin override fields to tenant_subscriptions
--          and a comprehensive admin_manage_subscription RPC
--          that supports: trial, trial extension, paid, suspended,
--          complimentary, free_forever, discounts, admin notes.
-- =====================================================

-- 1. Add override/discount/note columns to tenant_subscriptions
ALTER TABLE public.tenant_subscriptions
    ADD COLUMN IF NOT EXISTS override_type VARCHAR(32) DEFAULT 'none'
        CHECK (override_type IN ('none','trial_extension','one_time_discount','complimentary','free_forever')),
    ADD COLUMN IF NOT EXISTS discount_type VARCHAR(16) DEFAULT 'none'
        CHECK (discount_type IN ('none','percentage','fixed_amount')),
    ADD COLUMN IF NOT EXISTS discount_value NUMERIC(10,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS discount_applies_to_next_only BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS admin_note TEXT;

-- =====================================================
-- 2. New comprehensive RPC: admin_manage_subscription
--    Replaces ad-hoc admin_update_subscription calls for
--    all manual admin actions. Keeps both tables in sync.
-- =====================================================
CREATE OR REPLACE FUNCTION admin_manage_subscription(
    p_tenant_id                  UUID,
    p_status                     VARCHAR,             -- active | trial | expired | suspended | cancelled
    p_plan_id                    UUID      DEFAULT NULL,  -- keep current plan if NULL
    p_period_end                 TIMESTAMPTZ DEFAULT NULL, -- explicit end date; NULL = auto-calc from billing_cycle
    p_billing_cycle              VARCHAR   DEFAULT NULL,  -- monthly | yearly; keep current if NULL
    p_override_type              VARCHAR   DEFAULT 'none',
    p_discount_type              VARCHAR   DEFAULT 'none',
    p_discount_value             NUMERIC   DEFAULT 0,
    p_discount_applies_to_next_only BOOLEAN DEFAULT false,
    p_admin_note                 TEXT      DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_plan            RECORD;
    v_existing        RECORD;
    v_now             TIMESTAMPTZ := NOW();
    v_period_start    TIMESTAMPTZ;
    v_period_end      TIMESTAMPTZ;
    v_billing_cycle   VARCHAR;
    v_amount          NUMERIC;
    v_subscription_id UUID;
BEGIN
    -- Security: platform admins/owners only
    IF NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('platform_admin', 'platform_owner')
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Only platform admins can manage subscriptions';
    END IF;

    -- Fetch existing subscription (if any)
    SELECT * INTO v_existing
    FROM tenant_subscriptions
    WHERE tenant_id = p_tenant_id
    ORDER BY created_at DESC
    LIMIT 1;

    -- Resolve plan_id
    IF p_plan_id IS NULL THEN
        p_plan_id := v_existing.plan_id;
    END IF;
    IF p_plan_id IS NULL THEN
        RAISE EXCEPTION 'No plan specified and no existing plan found for this tenant';
    END IF;

    -- Fetch plan details
    SELECT * INTO v_plan FROM subscription_plans WHERE id = p_plan_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Plan not found: %', p_plan_id;
    END IF;

    -- Resolve billing_cycle
    v_billing_cycle := COALESCE(p_billing_cycle, v_existing.billing_cycle, 'yearly');

    -- Determine amount
    IF v_billing_cycle = 'yearly' THEN
        v_amount := v_plan.price_yearly;
    ELSE
        v_amount := v_plan.price_monthly;
    END IF;

    -- Determine period start/end
    v_period_start := COALESCE(v_existing.current_period_start, v_now);

    IF p_period_end IS NOT NULL THEN
        -- Admin explicitly set a date
        v_period_end := p_period_end;
        -- For trial status, align trial_ends_at with period_end when extending
    ELSIF p_status = 'trial' AND v_existing.trial_ends_at IS NOT NULL THEN
        -- Extending trial: keep the trial_ends_at as set (caller passes p_period_end)
        v_period_end := v_existing.current_period_end;
    ELSIF p_override_type IN ('free_forever', 'complimentary') THEN
        -- Complimentary / Free Forever: set far future date
        v_period_end := '2099-12-31 23:59:59+00'::TIMESTAMPTZ;
    ELSIF p_status = 'active' THEN
        -- New paid period from now
        IF v_billing_cycle = 'yearly' THEN
            v_period_end := v_now + INTERVAL '1 year';
        ELSE
            v_period_end := v_now + INTERVAL '1 month';
        END IF;
    ELSIF p_status IN ('suspended', 'expired', 'cancelled') THEN
        -- Keep existing period_end; don't extend
        v_period_end := COALESCE(v_existing.current_period_end, v_now);
    ELSE
        -- trial with no existing date: 14 days
        v_period_end := v_now + INTERVAL '14 days';
    END IF;

    -- Upsert tenant_subscriptions
    INSERT INTO tenant_subscriptions (
        tenant_id, plan_id, status, billing_cycle,
        current_period_start, current_period_end,
        trial_ends_at,
        amount, currency,
        override_type, discount_type, discount_value,
        discount_applies_to_next_only, admin_note,
        cancel_at_period_end,
        updated_at
    )
    VALUES (
        p_tenant_id,
        p_plan_id,
        p_status,
        v_billing_cycle,
        v_period_start,
        v_period_end,
        -- trial_ends_at: set when status=trial, clear when converting to active
        CASE WHEN p_status = 'trial' THEN v_period_end ELSE NULL END,
        v_amount,
        v_plan.currency,
        p_override_type,
        p_discount_type,
        p_discount_value,
        p_discount_applies_to_next_only,
        p_admin_note,
        false,
        v_now
    )
    ON CONFLICT (tenant_id)
    DO UPDATE SET
        plan_id                      = EXCLUDED.plan_id,
        status                       = EXCLUDED.status,
        billing_cycle                = EXCLUDED.billing_cycle,
        current_period_start         = EXCLUDED.current_period_start,
        current_period_end           = EXCLUDED.current_period_end,
        trial_ends_at                = EXCLUDED.trial_ends_at,
        amount                       = EXCLUDED.amount,
        currency                     = EXCLUDED.currency,
        override_type                = EXCLUDED.override_type,
        discount_type                = EXCLUDED.discount_type,
        discount_value               = EXCLUDED.discount_value,
        discount_applies_to_next_only = EXCLUDED.discount_applies_to_next_only,
        admin_note                   = EXCLUDED.admin_note,
        cancel_at_period_end         = false,
        updated_at                   = EXCLUDED.updated_at
    RETURNING id INTO v_subscription_id;

    -- Sync tenants table (prevent drift)
    UPDATE tenants
    SET
        subscription_status  = p_status,
        subscription_ends_at = v_period_end,
        plan_id              = p_plan_id,
        trial_ends_at        = CASE WHEN p_status = 'trial' THEN v_period_end ELSE tenants.trial_ends_at END,
        updated_at           = v_now
    WHERE id = p_tenant_id;

    -- Audit log
    INSERT INTO platform_audit_logs (
        user_id, action, action_type, target_type, target_id, new_values, metadata
    )
    VALUES (
        auth.uid(),
        'Admin managed subscription for tenant ' || p_tenant_id,
        'update',
        'subscription',
        v_subscription_id,
        jsonb_build_object(
            'plan_id',        p_plan_id,
            'plan_code',      v_plan.code,
            'status',         p_status,
            'billing_cycle',  v_billing_cycle,
            'period_end',     v_period_end,
            'override_type',  p_override_type,
            'discount_type',  p_discount_type,
            'discount_value', p_discount_value,
            'admin_note',     p_admin_note
        ),
        jsonb_build_object('tenant_id', p_tenant_id)
    );

    RETURN jsonb_build_object(
        'success',         true,
        'subscription_id', v_subscription_id,
        'period_end',      v_period_end,
        'status',          p_status,
        'override_type',   p_override_type
    );
END;
$$;

-- Grant execute to authenticated (security enforced inside function)
GRANT EXECUTE ON FUNCTION admin_manage_subscription TO authenticated;
