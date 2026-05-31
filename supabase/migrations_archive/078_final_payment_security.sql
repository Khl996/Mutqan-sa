-- =====================================================
-- Migration: 078_final_payment_security.sql
-- Purpose: Close remaining critical security gaps in payment flow
-- Date: 2026-03-14
-- =====================================================

-- =====================================================
-- FIX 1: Remove authenticated access to activate_subscription PERMANENTLY
-- Problem: 076 re-granted EXECUTE to authenticated (with internal checks),
--          but a tenant_admin can still call the RPC directly without paying.
-- Solution: ONLY service_role can call this function. Period.
-- =====================================================

REVOKE EXECUTE ON FUNCTION public.activate_subscription_after_payment FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.activate_subscription_after_payment FROM public;
REVOKE EXECUTE ON FUNCTION public.activate_subscription_after_payment FROM anon;

-- Ensure only service_role (server-side API endpoints) can call this
GRANT EXECUTE ON FUNCTION public.activate_subscription_after_payment TO service_role;

COMMENT ON FUNCTION public.activate_subscription_after_payment IS 
'Activates tenant subscription after payment. 
RESTRICTED TO service_role ONLY — must be called from server-side API (verify-payment.ts or payment-webhook.ts).
Never callable from client-side browser code.';

-- =====================================================
-- FIX 2: Ensure subscription_tier is synced during payment activation
-- Problem: activate_subscription_after_payment updates plan_id but not subscription_tier.
--          Frontend stats read subscription_tier, causing stale data after payment.
-- Solution: Also update subscription_tier from the plan's code.
-- =====================================================

CREATE OR REPLACE FUNCTION public.activate_subscription_after_payment(
    p_tenant_id UUID,
    p_plan_id UUID,
    p_billing_cycle VARCHAR DEFAULT 'yearly',
    p_amount DECIMAL DEFAULT 0,
    p_currency VARCHAR DEFAULT 'SAR',
    p_payment_reference VARCHAR DEFAULT NULL,
    p_plan_name VARCHAR DEFAULT 'Subscription'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_end_date TIMESTAMPTZ;
    v_invoice_number VARCHAR;
    v_result JSONB;
    v_existing_ref INT;
    v_plan_code VARCHAR;
BEGIN
    -- =========================================
    -- NO AUTH CHECK NEEDED: Only callable by service_role
    -- The REVOKE above ensures no authenticated user can reach here
    -- =========================================

    -- =========================================
    -- IDEMPOTENCY CHECK: Prevent duplicate activations
    -- =========================================
    IF p_payment_reference IS NOT NULL AND p_payment_reference != '' THEN
        SELECT COUNT(*) INTO v_existing_ref
        FROM platform_invoices
        WHERE payment_reference = p_payment_reference
        AND status = 'paid';

        IF v_existing_ref > 0 THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'This payment reference has already been processed',
                'duplicate', true
            );
        END IF;
    ELSE
        -- Reject calls without a payment reference for safety
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Payment reference is required'
        );
    END IF;

    -- =========================================
    -- Get plan code for subscription_tier sync
    -- =========================================
    SELECT code INTO v_plan_code FROM subscription_plans WHERE id = p_plan_id;
    IF v_plan_code IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid plan ID'
        );
    END IF;

    -- =========================================
    -- BUSINESS LOGIC
    -- =========================================

    -- Calculate end date
    IF p_billing_cycle = 'yearly' THEN
        v_end_date := NOW() + INTERVAL '1 year';
    ELSE
        v_end_date := NOW() + INTERVAL '1 month';
    END IF;

    -- Generate invoice number
    v_invoice_number := 'INV-' || EXTRACT(EPOCH FROM NOW())::BIGINT || '-' || UPPER(SUBSTR(MD5(RANDOM()::TEXT), 1, 5));

    -- Upsert subscription
    INSERT INTO tenant_subscriptions (
        tenant_id,
        plan_id,
        status,
        billing_cycle,
        current_period_start,
        current_period_end,
        amount,
        currency,
        cancel_at_period_end,
        updated_at
    ) VALUES (
        p_tenant_id,
        p_plan_id,
        'active',
        p_billing_cycle,
        NOW(),
        v_end_date,
        p_amount,
        p_currency,
        false,
        NOW()
    )
    ON CONFLICT (tenant_id) DO UPDATE SET
        plan_id = EXCLUDED.plan_id,
        status = 'active',
        billing_cycle = EXCLUDED.billing_cycle,
        current_period_start = NOW(),
        current_period_end = v_end_date,
        amount = EXCLUDED.amount,
        currency = EXCLUDED.currency,
        cancel_at_period_end = false,
        updated_at = NOW();

    -- Update tenant — sync ALL subscription fields (single source of truth)
    UPDATE tenants
    SET 
        subscription_status = 'active',
        subscription_ends_at = v_end_date,
        plan_id = p_plan_id,
        subscription_tier = v_plan_code,   -- ← NEW: sync tier from plan code
        updated_at = NOW()
    WHERE id = p_tenant_id;

    -- Log invoice
    BEGIN
        INSERT INTO platform_invoices (
            invoice_number,
            tenant_id,
            plan_id,
            plan_name,
            subtotal,
            total,
            currency,
            status,
            payment_method,
            payment_reference,
            paid_at,
            due_date,
            billing_period_start,
            billing_period_end
        ) VALUES (
            v_invoice_number,
            p_tenant_id,
            p_plan_id,
            p_plan_name,
            p_amount,
            p_amount,
            p_currency,
            'paid',
            'tap',
            p_payment_reference,
            NOW(),
            CURRENT_DATE,
            CURRENT_DATE,
            v_end_date::DATE
        );
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Invoice logging failed: %', SQLERRM;
    END;

    v_result := jsonb_build_object(
        'success', true,
        'plan_id', p_plan_id,
        'plan_code', v_plan_code,
        'billing_cycle', p_billing_cycle,
        'period_end', v_end_date
    );

    RETURN v_result;
END;
$$;

-- Re-apply grants (only service_role)
REVOKE ALL ON FUNCTION public.activate_subscription_after_payment FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_subscription_after_payment TO service_role;
