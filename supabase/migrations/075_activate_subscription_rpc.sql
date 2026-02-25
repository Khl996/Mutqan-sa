-- Function to activate subscription after successful payment
-- Uses SECURITY DEFINER to bypass RLS
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
BEGIN
    -- Calculate end date
    IF p_billing_cycle = 'yearly' THEN
        v_end_date := NOW() + INTERVAL '1 year';
    ELSE
        v_end_date := NOW() + INTERVAL '1 month';
    END IF;

    -- Generate invoice number
    v_invoice_number := 'INV-' || EXTRACT(EPOCH FROM NOW())::BIGINT || '-' || UPPER(SUBSTR(MD5(RANDOM()::TEXT), 1, 5));

    -- Upsert subscription (update if exists, insert if not)
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

    -- Update tenant status
    UPDATE tenants
    SET status = 'active', updated_at = NOW()
    WHERE id = p_tenant_id;

    -- Log invoice (ignore errors)
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
        -- Don't fail if invoice logging fails
        RAISE NOTICE 'Invoice logging failed: %', SQLERRM;
    END;

    v_result := jsonb_build_object(
        'success', true,
        'plan_id', p_plan_id,
        'billing_cycle', p_billing_cycle,
        'period_end', v_end_date
    );

    RETURN v_result;
END;
$$;

-- Grant execute to service role and authenticated users
GRANT EXECUTE ON FUNCTION public.activate_subscription_after_payment TO service_role;
GRANT EXECUTE ON FUNCTION public.activate_subscription_after_payment TO authenticated;

COMMENT ON FUNCTION public.activate_subscription_after_payment IS 'Activates a tenant subscription after successful payment. Uses SECURITY DEFINER to bypass RLS.';
