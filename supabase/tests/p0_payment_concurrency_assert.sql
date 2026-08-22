-- Assertions after the two concurrent activation sessions have committed.
\set ON_ERROR_STOP on

DO $assert_payment_result$
DECLARE
    v_invoice_count integer;
    v_subscription_count integer;
BEGIN
    SELECT count(*)
      INTO v_invoice_count
      FROM public.billing_invoices
     WHERE payment_reference = 'p0-concurrent-payment-20260821';

    SELECT count(*)
      INTO v_subscription_count
      FROM public.tenant_subscriptions
     WHERE tenant_id = 'f1000000-0000-4000-8000-000000000001'::uuid;

    IF v_invoice_count <> 1 OR v_subscription_count <> 1 THEN
        RAISE EXCEPTION
            'Concurrent activation produced % invoices and % subscriptions',
            v_invoice_count, v_subscription_count;
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM public.billing_invoices i
          JOIN public.tenant_subscriptions s ON s.id = i.subscription_id
         WHERE i.payment_reference = 'p0-concurrent-payment-20260821'
           AND i.status = 'paid'
           AND i.payment_method = 'tap'
           AND i.paid_at IS NOT NULL
           AND i.total = 115.00
           AND s.status = 'active'
           AND s.plan_id = 'f1000000-0000-4000-8000-000000000002'::uuid
    ) THEN
        RAISE EXCEPTION 'Concurrent activation did not preserve paid binding invariants';
    END IF;
END
$assert_payment_result$;

BEGIN;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SET LOCAL ROLE service_role;

DO $assert_conflicting_replay$
DECLARE
    v_message text;
BEGIN
    BEGIN
        PERFORM public.engine_activate(
            'f1000000-0000-4000-8000-000000000001'::uuid,
            'f1000000-0000-4000-8000-000000000002'::uuid,
            'monthly',
            'self_service',
            'active',
            NULL,
            NULL,
            NULL,
            'tap',
            'p0-concurrent-payment-20260821',
            116.00,
            'must fail: conflicting amount'
        );
        RAISE EXCEPTION 'Conflicting payment replay unexpectedly succeeded';
    EXCEPTION
        WHEN unique_violation THEN
            GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
            IF v_message IS DISTINCT FROM 'Payment reference is already bound to different billing data' THEN
                RAISE;
            END IF;
    END;
END
$assert_conflicting_replay$;

ROLLBACK;
