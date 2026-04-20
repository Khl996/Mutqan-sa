# Mutqan Fixture Shortest Path

Goal: make `verify:staging-gate`, `verify:rls`, and `verify:payment` runnable with the fewest manual steps.

## What SQL can prepare

- Tenant A and Tenant B ids.
- Tenant-scoped rows for buildings, assets, inventory, subscriptions, invoices, PM job plans, PM schedules, work orders, and notifications.
- Disposable work orders for technician mutation checks.
- Profile rows after Auth users exist.

SQL cannot produce valid Supabase JWT sessions by itself.

## Fastest path

1. Ensure `.env.local` has:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `VITE_APP_URL`
   - `TAP_SECRET_KEY`
   - `PAYMENT_WEBHOOK_SECRET` or `TAP_WEBHOOK_SECRET`
   - `CRON_SECRET`
2. Run:

```powershell
npm run prepare:staging-fixtures
```

This creates or updates fixture Auth users, resets their fixture password, seeds tenant data, signs in as every role, and writes:

```text
.env.staging-fixtures.local
```

3. Merge generated values into `.env.local` without printing token values:

```powershell
npm run fixtures:merge-env
```

4. Run:

```powershell
npm run verify:staging-gate
npm run verify:rls
```

## Tap captured charge

Create a real Tap sandbox charge:

```powershell
npm run payment:create-sandbox-charge
```

Open the printed `redirect_url`, complete sandbox payment, then copy the printed id into `.env.local`:

```text
PAYMENT_CAPTURED_TAP_ID=<printed-charge-id>
```

Then run:

```powershell
npm run verify:payment
```

## Optional payment negatives

`PAYMENT_FAILED_TAP_ID` and `PAYMENT_MISMATCHED_AMOUNT_TAP_ID` are useful, but not required for the minimal green path while `PAYMENT_REQUIRE_FULL_RUNTIME=0`.

Set `PAYMENT_REQUIRE_FULL_RUNTIME=1` only after those two ids exist.

## Fixture users

The helper uses these emails:

- `fixture.platform.admin@mutqan.test`
- `fixture.tenant.a.admin@mutqan.test`
- `fixture.tenant.a.manager@mutqan.test`
- `fixture.tenant.a.supervisor@mutqan.test`
- `fixture.tenant.a.technician@mutqan.test`
- `fixture.tenant.a.reporter@mutqan.test`
- `fixture.tenant.b.user@mutqan.test`

Do not use these accounts for real customer data.
