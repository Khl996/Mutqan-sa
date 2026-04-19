# Phase 4 Staging Parity and Launch Gate

This file is the operational gate for making staging prove the local hardening.
It is intentionally short and specific to Mutqan.

## Current launch gate

Status: Not Ready for pilot until staging passes both runtime checks.

The local code contains the required hardening artifacts, but staging must prove:

- migrations 113, 114, and 115 are applied.
- Vercel has the payment, Supabase service-role, webhook, and cron secrets.
- the deployed serverless functions match the current local code.
- RLS fixtures exist and role tokens are available.
- Tap sandbox has captured, failed, and mismatched-amount charge fixtures.

## Must do before RLS validation

1. Apply migrations through `115_phase2_notification_function_hardening.sql` to the staging Supabase project.
2. Confirm these database objects exist:
   - `public.engine_activate(...)`
   - `public.get_tenant_reporting_foundation(uuid)`
   - `public.create_notification(uuid, uuid, text, text, text, text, jsonb)`
3. Create two staging tenants:
   - Tenant A with users for `tenant_admin`, `maintenance_manager`, `supervisor`, `technician`, and `reporter`.
   - Tenant B with at least one normal tenant user.
4. Seed tenant-scoped rows for:
   - `work_orders`
   - `assets`
   - `buildings`
   - `inventory_items`
   - `notifications`
   - `tenant_subscriptions`
   - `billing_invoices`
   - `job_plans`
   - `pm_schedules`
5. Capture access tokens and fill the `RLS_*` variables from `docs/staging/staging-validation-env.example`.
6. Run `npm run verify:rls`.

Optional but recommended:

- Set `RLS_ALLOW_MUTATION_TESTS=1` only with disposable work orders.
- Provide one work order assigned to the technician and one not assigned to them.

## Must do before payment validation

1. Redeploy Vercel after the current local payment hardening changes.
2. Configure Vercel environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `VITE_APP_URL`
   - `VITE_TAP_PUBLIC_KEY`
   - `TAP_SECRET_KEY`
   - `PAYMENT_WEBHOOK_SECRET` or `TAP_WEBHOOK_SECRET`
   - `CRON_SECRET`
3. In Tap sandbox, create:
   - one captured charge with valid Mutqan metadata.
   - one failed or cancelled charge.
   - one captured charge with mismatched amount metadata.
4. Fill:
   - `PAYMENT_TEST_USER_JWT`
   - `PAYMENT_CAPTURED_TAP_ID`
   - `PAYMENT_FAILED_TAP_ID`
   - `PAYMENT_MISMATCHED_AMOUNT_TAP_ID`
   - `PAYMENT_REQUIRE_FULL_RUNTIME=1`
5. Run `npm run verify:payment`.

## Must do before pilot readiness

1. `npm run build` passes locally.
2. `npm test` passes locally.
3. `npm run verify:staging-gate` has no blocking failures.
4. `npm run verify:rls` passes against staging.
5. `npm run verify:payment` passes against Tap sandbox.
6. `/reports` renders the Executive Operations and ROI Overview against a seeded demo tenant.

## Staging SQL spot checks

Run these in the Supabase SQL editor on staging:

```sql
select to_regprocedure('public.engine_activate(uuid, uuid, text, text, text, integer, uuid, uuid, text, text, numeric, text)');
select to_regprocedure('public.get_tenant_reporting_foundation(uuid)');
select to_regprocedure('public.create_notification(uuid, uuid, text, text, text, text, jsonb)');
```

Expected: no row should return `null`.

## Commands

```powershell
npm run verify:staging-gate
npm run verify:rls
npm run verify:payment
```

## Fallback if Tap signature support is unavailable

Until official Tap signature verification is configured, production-safe fallback is:

- require `PAYMENT_WEBHOOK_SECRET` or `TAP_WEBHOOK_SECRET`.
- always re-fetch charge state from Tap server-side.
- require server-created payment metadata.
- validate tenant access on callback.
- validate amount and currency before `engine_activate`.
- keep idempotency on `billing_invoices.payment_reference`.

This fallback is acceptable for sandbox and controlled pilot only. Official gateway signature verification remains the preferred production gate.
