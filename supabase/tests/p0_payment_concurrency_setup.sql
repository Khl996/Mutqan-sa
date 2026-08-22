-- Committed fixture for two-session payment activation testing.
-- Isolated replay database only.
\set ON_ERROR_STOP on

DO $assert_clean$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.billing_invoices
         WHERE payment_reference IN (
             'p0-concurrent-payment-20260821',
             'p0-conflicting-payment-20260821'
         )
    ) OR EXISTS (
        SELECT 1 FROM public.tenant_subscriptions
         WHERE tenant_id = 'f1000000-0000-4000-8000-000000000001'::uuid
    ) THEN
        RAISE EXCEPTION 'Payment concurrency fixture is not clean';
    END IF;
END
$assert_clean$;

INSERT INTO public.subscription_plans (
    id, code, name, name_ar, price_monthly, price_yearly,
    is_active, trial_days, modules
)
VALUES (
    'f1000000-0000-4000-8000-000000000002',
    'P0-REPLAY',
    'P0 replay plan',
    'خطة اختبار P0',
    100,
    1000,
    true,
    7,
    '[]'::jsonb
);

INSERT INTO public.tenants (id, name, name_ar, slug)
VALUES (
    'f1000000-0000-4000-8000-000000000001',
    'P0 payment replay tenant',
    'مستأجر اختبار الدفع',
    'p0-payment-replay-tenant'
);
