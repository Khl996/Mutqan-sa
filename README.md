# Mutqan

Mutqan is a bilingual SaaS product for CMMS, facility operations, preventive maintenance, work orders, inventory, billing, reporting, and tenant-based administration.

This README reflects the current staging hardening state. It is intended for the solo founder and future contributors who need a quick, accurate view of what is proven, what remains, and how to verify the system.

## Project Status

Current status: controlled pilot readiness is green for the core runtime gates that have been tested.

The project has recently passed:

- RLS tenant isolation runtime verification.
- Tap payment activation runtime verification.
- Payment callback and webhook idempotency verification.
- Staging launch gate prerequisite checks.

This does not mean every product feature is complete or enterprise-ready. It means the current staging environment has proven the most important launch-gate foundations: tenant isolation, payment activation, critical secrets presence, and validation tooling.

## What Was Recently Hardened

Recent hardening work focused on trust, isolation, and staging parity:

- Payment activation after a captured Tap charge.
- Service-role-safe subscription activation through `engine_activate` and API fallback handling.
- Payment callback idempotency for duplicate callback calls.
- Payment webhook idempotency for already processed captured charges.
- Webhook shared-secret enforcement using `PAYMENT_WEBHOOK_SECRET` / `TAP_WEBHOOK_SECRET`.
- Cron protection using `CRON_SECRET`.
- Runtime API bundling for Vercel serverless payment functions.
- Staging fixture preparation for tenants, users, work orders, PM, inventory, subscriptions, and invoices.
- RLS runtime validation across tenant admin, manager, supervisor, technician, reporter, tenant B user, and platform admin roles.
- Inventory tenant-isolation fix in `supabase/migrations/117_inventory_rls_tenant_isolation_fix.sql`.

## Staging Validation Summary

The following has been proven on staging:

- Tenant A users cannot read Tenant B data across the verified tenant-scoped tables.
- Tenant B user cannot read Tenant A data across the verified tenant-scoped tables.
- Platform admin can access cross-tenant data where intended.
- Technician can start an assigned work order.
- Technician cannot start an unassigned work order.
- Reporter cannot start work orders.
- Captured Tap sandbox payment activates the subscription path successfully.
- Duplicate payment callback remains idempotent.
- Duplicate payment webhook returns an already processed or processed-safe result.
- Unauthorized payment callback is rejected.
- Invalid webhook payload is rejected.

The latest successful RLS runtime verification produced 118 pass checks.

## Runtime Verification Commands

Run the launch-gate prerequisite check:

```powershell
npm run verify:staging-gate
```

Run RLS tenant-isolation verification:

```powershell
npm run verify:rls
```

Run Tap payment runtime verification:

```powershell
npm run verify:payment
```

If JWT fixtures expire, regenerate and merge them:

```powershell
npm run prepare:staging-fixtures
npm run fixtures:merge-env
```

If a new captured Tap sandbox charge is needed:

```powershell
npm run payment:create-sandbox-charge
```

Do not commit `.env.local`, `.env.staging-fixtures.local`, or any pulled Vercel environment file.

## Current Pilot Readiness Status

Current verdict: ready for internal validation and a controlled pilot demo, assuming staging remains on the latest deployed code and migrations.

What is ready:

- Core tenant isolation proof.
- Core payment activation proof.
- Payment idempotency proof.
- Staging fixture workflow.
- Basic launch-gate repeatability.

What is not yet a full enterprise launch guarantee:

- Full negative Tap scenarios are not fully proven because failed and mismatched sandbox charge IDs are not currently supplied.
- Staging gate cannot independently prove deployment freshness or migration drift from local state; this still requires Vercel/Supabase inspection when needed.
- Broader product maturity items such as complete reporting depth, commercial packaging, and full UX polish are outside this runtime gate.

## Known Warnings / Non-Blocking Items

These warnings do not currently block controlled pilot validation:

- `PAYMENT_FAILED_TAP_ID` is missing, so failed-payment proof is skipped.
- `PAYMENT_MISMATCHED_AMOUNT_TAP_ID` is missing, so mismatched-amount proof is skipped.
- Staging gate reports deployment freshness as a warning because it cannot prove the latest deployment locally.
- Staging gate reports migration drift as a warning because it cannot fully prove remote migration history locally.
- RLS mutation tests change disposable work-order fixture status; use fixture work orders only.
- Platform admin notification checks may warn if fixture notification rows are absent or empty.

## Safe Next Steps

Recommended next steps before a broader pilot:

1. Generate one failed Tap sandbox charge and one mismatched-amount Tap sandbox charge.
2. Add `PAYMENT_FAILED_TAP_ID` and `PAYMENT_MISMATCHED_AMOUNT_TAP_ID` to local validation env.
3. Re-run `npm run verify:payment` until negative payment cases are also proven.
4. Keep `117_inventory_rls_tenant_isolation_fix.sql` applied on staging and included in future database parity work.
5. Before every pilot demo, run:

```powershell
npm run verify:staging-gate
npm run verify:rls
npm run verify:payment
```

6. Inspect Vercel deployment status when staging gate warns that latest deployment cannot be proven locally.
7. Inspect Supabase migration status when staging gate warns that remote migration drift cannot be proven locally.

## Operational Notes

- Production-like secrets belong in Vercel/Supabase only, not in source control.
- Local validation secrets belong in `.env.local`.
- Fixture JWTs expire and must be regenerated periodically.
- The Supabase CLI may create or alter files under `supabase/.temp`; avoid committing tool-generated temp changes unless they are intentional.
- Runtime validation evidence is stronger than local static checks. If they disagree, investigate the runtime result first.
