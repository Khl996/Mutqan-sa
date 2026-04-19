-- =============================================================================
-- Migration: 113_phase2_payment_service_role_hardening.sql
-- Purpose:
--   Fix and harden paid subscription activation from server-side payment flows.
--
-- Why:
--   api/payment-webhook.ts and api/verify-payment.ts call engine_activate with
--   the Supabase service role after re-fetching the paid Tap charge. In the
--   previous function body, auth.uid() is NULL for service_role calls, so the
--   self_service authorization branch rejects the activation.
--
-- Security model:
--   - Browser/admin calls keep the existing tenant/platform role checks.
--   - service_role is allowed only for active Tap paid-charge activation.
--   - service_role calls must provide payment method, payment reference, and
--     a positive amount; this prevents generic subscription activation through
--     the financial RPC.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.engine_activate(
    p_tenant_id          uuid,
    p_plan_id            uuid,
    p_billing_cycle      varchar  DEFAULT 'monthly',
    p_source             varchar  DEFAULT 'admin',
    p_status             varchar  DEFAULT 'active',
    p_trial_days         integer  DEFAULT NULL,
    p_discount_policy_id uuid     DEFAULT NULL,
    p_quote_id           uuid     DEFAULT NULL,
    p_payment_method     varchar  DEFAULT NULL,
    p_payment_reference  varchar  DEFAULT NULL,
    p_amount             decimal  DEFAULT NULL,
    p_admin_note         text     DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id    uuid        := auth.uid();
    v_auth_role    text        := auth.role();
    v_caller_role  text;
    v_caller_tid   uuid;
    v_now          timestamptz := now();
    v_trial_days   integer;
    v_trial_ends   timestamptz;
    v_period_start timestamptz;
    v_period_end   timestamptz;
    v_amount       decimal(10,2);
    v_calc         jsonb;
    v_sub_id       uuid;
    v_inv_id       uuid;
    v_inv_number   text;
    v_plan         RECORD;
    v_is_service_paid_charge boolean := false;
BEGIN
    SELECT role, tenant_id INTO v_caller_role, v_caller_tid
      FROM public.profiles WHERE id = v_caller_id;

    v_is_service_paid_charge :=
        v_auth_role = 'service_role'
        AND p_source = 'self_service'
        AND p_status = 'active'
        AND p_payment_method = 'tap'
        AND COALESCE(NULLIF(TRIM(p_payment_reference), ''), '') <> ''
        AND COALESCE(p_amount, 0) > 0;

    IF v_is_service_paid_charge THEN
        -- Serverless payment endpoints already re-fetch the charge from Tap,
        -- verify amount/currency/metadata, and rely on this narrow RPC gate.
        NULL;
    ELSIF p_source = 'self_service' THEN
        IF v_caller_role NOT IN ('tenant_admin','tenant_owner') OR v_caller_tid IS DISTINCT FROM p_tenant_id THEN
            RAISE EXCEPTION 'Unauthorized: self_service requires tenant_admin of the same tenant';
        END IF;
    ELSE
        IF v_caller_role NOT IN ('platform_owner','platform_admin') THEN
            RAISE EXCEPTION 'Unauthorized: source % requires platform_owner or platform_admin', p_source;
        END IF;
    END IF;

    IF p_billing_cycle NOT IN ('monthly', 'yearly') THEN
        RAISE EXCEPTION 'Invalid billing cycle: %', p_billing_cycle;
    END IF;

    SELECT * INTO v_plan FROM public.subscription_plans WHERE id = p_plan_id AND is_active = true;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Plan not found or inactive: %', p_plan_id;
    END IF;

    v_calc := public.engine_calculate(p_plan_id, p_billing_cycle, '{}', p_discount_policy_id);

    IF p_status = 'trial' THEN
        v_trial_days   := COALESCE(p_trial_days, v_plan.trial_days, 14);
        v_trial_ends   := v_now + (v_trial_days || ' days')::interval;
        v_period_start := v_now;
        v_period_end   := v_trial_ends;
        v_amount       := 0;
    ELSE
        v_period_start := v_now;
        v_period_end   := CASE p_billing_cycle
            WHEN 'yearly' THEN v_now + interval '1 year'
            ELSE               v_now + interval '1 month'
        END;
        v_amount := COALESCE(p_amount, (v_calc->>'total')::decimal);
    END IF;

    INSERT INTO public.tenant_subscriptions (
        tenant_id, plan_id, status, billing_cycle,
        trial_ends_at, current_period_start, current_period_end,
        amount, discount_policy_id, activated_by, quote_id, admin_note,
        updated_at
    ) VALUES (
        p_tenant_id, p_plan_id, p_status, p_billing_cycle,
        v_trial_ends, v_period_start, v_period_end,
        v_amount, p_discount_policy_id, p_source, p_quote_id, p_admin_note,
        v_now
    )
    ON CONFLICT (tenant_id) DO UPDATE SET
        plan_id              = EXCLUDED.plan_id,
        status               = EXCLUDED.status,
        billing_cycle        = EXCLUDED.billing_cycle,
        trial_ends_at        = EXCLUDED.trial_ends_at,
        current_period_start = EXCLUDED.current_period_start,
        current_period_end   = EXCLUDED.current_period_end,
        amount               = EXCLUDED.amount,
        discount_policy_id   = EXCLUDED.discount_policy_id,
        activated_by         = EXCLUDED.activated_by,
        quote_id             = EXCLUDED.quote_id,
        admin_note           = EXCLUDED.admin_note,
        cancelled_at         = NULL,
        updated_at           = EXCLUDED.updated_at
    RETURNING id INTO v_sub_id;

    IF p_status = 'active' THEN
        v_inv_number := 'INV-' || EXTRACT(YEAR FROM v_now)::text
                        || '-' || LPAD(nextval('public.invoice_number_seq')::text, 4, '0');

        INSERT INTO public.billing_invoices (
            invoice_number, tenant_id, subscription_id, quote_id,
            subtotal, discount_amount, tax_rate, tax_amount, total,
            status, payment_method, payment_reference, paid_at,
            billing_period_start, billing_period_end,
            created_by, created_at
        ) VALUES (
            v_inv_number, p_tenant_id, v_sub_id, p_quote_id,
            (v_calc->>'subtotal')::decimal,
            (v_calc->>'discount_amount')::decimal,
            (v_calc->>'tax_rate')::decimal,
            (v_calc->>'tax_amount')::decimal,
            v_amount,
            CASE WHEN p_payment_method IS NOT NULL THEN 'paid' ELSE 'draft' END,
            p_payment_method,
            p_payment_reference,
            CASE WHEN p_payment_method IS NOT NULL THEN v_now ELSE NULL END,
            v_period_start::date,
            v_period_end::date,
            v_caller_id,
            v_now
        )
        RETURNING id INTO v_inv_id;
    END IF;

    INSERT INTO public.platform_audit_logs
        (user_id, action, action_type, target_type, target_id, new_values, metadata)
    VALUES (
        v_caller_id,
        'engine_activate tenant=' || p_tenant_id || ' plan=' || p_plan_id || ' status=' || p_status,
        'update', 'subscription', v_sub_id::text,
        jsonb_build_object(
            'plan_id',       p_plan_id,
            'status',        p_status,
            'billing_cycle', p_billing_cycle,
            'amount',        v_amount,
            'source',        p_source,
            'period_end',    v_period_end
        ),
        jsonb_build_object(
            'tenant_id', p_tenant_id,
            'source', p_source,
            'auth_role', v_auth_role,
            'service_paid_charge', v_is_service_paid_charge
        )
    );

    RETURN jsonb_build_object(
        'subscription_id', v_sub_id,
        'invoice_id',      v_inv_id,
        'invoice_number',  v_inv_number,
        'status',          p_status,
        'period_start',    v_period_start,
        'period_end',      v_period_end,
        'amount',          v_amount
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.engine_activate(
    uuid, uuid, varchar, varchar, varchar, integer, uuid, uuid, varchar, varchar, decimal, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engine_activate(
    uuid, uuid, varchar, varchar, varchar, integer, uuid, uuid, varchar, varchar, decimal, text
) TO service_role;
