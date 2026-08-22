-- One half of the concurrent payment fixture. The first caller can hold its
-- transaction briefly so the second is forced through the advisory-lock path.
\set ON_ERROR_STOP on
\if :{?hold_seconds}
\else
\set hold_seconds 0
\endif

BEGIN;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SET LOCAL ROLE service_role;

SELECT public.engine_activate(
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
    115.00,
    'isolated PG17 concurrency fixture'
);

SELECT pg_catalog.pg_sleep(:hold_seconds);
COMMIT;
