-- =====================================================
-- Migration: 081_admin_update_subscription.sql
-- Purpose: Unified single source of truth for admins updating subscriptions
--          to avoid drift between tenant_subscriptions and tenants table.
-- =====================================================

CREATE OR REPLACE FUNCTION admin_update_subscription(
    p_tenant_id UUID,
    p_plan_id UUID,
    p_billing_cycle VARCHAR,
    p_status VARCHAR DEFAULT 'active'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_plan RECORD;
    v_amount DECIMAL;
    v_now TIMESTAMPTZ := NOW();
    v_period_end TIMESTAMPTZ;
    v_subscription_id UUID;
    v_result JSONB;
BEGIN
    -- 1. Security check: Only platform admins/owners can use this directly
    IF NOT EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND role IN ('platform_admin', 'platform_owner')
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Only platform admins can update subscriptions directly';
    END IF;

    -- 2. Get Plan Details
    SELECT * INTO v_plan FROM subscription_plans WHERE id = p_plan_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Plan not found';
    END IF;

    -- 3. Calculate Period End and Amount
    IF p_billing_cycle = 'yearly' THEN
        v_amount := v_plan.price_yearly;
        v_period_end := v_now + INTERVAL '1 year';
    ELSE
        v_amount := v_plan.price_monthly;
        v_period_end := v_now + INTERVAL '1 month';
    END IF;

    -- 4. Upsert Tenant Subscription
    INSERT INTO tenant_subscriptions (
        tenant_id, plan_id, status, billing_cycle,
        current_period_start, current_period_end, amount, currency, updated_at
    )
    VALUES (
        p_tenant_id, p_plan_id, p_status, p_billing_cycle,
        v_now, v_period_end, v_amount, v_plan.currency, v_now
    )
    ON CONFLICT (tenant_id)
    DO UPDATE SET
        plan_id = EXCLUDED.plan_id,
        status = EXCLUDED.status,
        billing_cycle = EXCLUDED.billing_cycle,
        current_period_start = EXCLUDED.current_period_start,
        current_period_end = EXCLUDED.current_period_end,
        amount = EXCLUDED.amount,
        currency = EXCLUDED.currency,
        updated_at = EXCLUDED.updated_at
    RETURNING id INTO v_subscription_id;

    -- 5. Update Tenant table immediately (Prevent drift)
    UPDATE tenants
    SET 
        subscription_status = p_status,
        subscription_ends_at = v_period_end,
        plan_id = p_plan_id,
        updated_at = v_now
    WHERE id = p_tenant_id;

    -- 6. Log Audit Event into platform_audit_logs
    INSERT INTO platform_audit_logs (
        user_id, action, action_type, target_type, target_id, new_values, metadata
    )
    VALUES (
        auth.uid(),
        'Updated Subscripton for Tenant ' || p_tenant_id,
        'update',
        'subscription',
        v_subscription_id,
        jsonb_build_object(
            'plan_id', p_plan_id,
            'plan_code', v_plan.code,
            'status', p_status,
            'billing_cycle', p_billing_cycle,
            'period_end', v_period_end
        ),
        jsonb_build_object('tenant_id', p_tenant_id)
    );

    v_result := jsonb_build_object(
        'success', true,
        'subscription_id', v_subscription_id,
        'period_end', v_period_end
    );

    RETURN v_result;
END;
$$;
