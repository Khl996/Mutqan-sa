# Mutqan Billing Engine

## Overview

The unified billing engine (migration `101_unified_billing_engine.sql`) replaces the old `pricing_*` / `platform_invoices` tables with a single, consistent system. The backend is authoritative — **no pricing logic lives in the frontend**.

Key design rules:
- All state changes go through `engine_*` RPCs, never direct table writes.
- `engine_calculate()` drives every live pricing preview.
- VAT is always 15% (Saudi regulations). Currency is always SAR.
- Invoices are created automatically by the engine on activation — never manually.

---

## The Four Activation Paths

| Path | Trigger | RPC |
|------|---------|-----|
| **Admin activation** | Admin activates from the platform dashboard | `engine_activate` |
| **Quote-based activation** | Admin creates a quote → approves → activates | `engine_create_quote` → `engine_approve_quote` → `engine_activate_from_quote` |
| **Self-service payment** | Tenant selects plan → pays via Tap → callback | `engine_activate` (called by `/api/verify-payment` server-side) |
| **Trial start** | Admin starts a trial (status = 'trial') | `engine_activate` with `p_status = 'trial'` and `p_trial_days` |

---

## Database Schema

### Core Tables

```
subscription_plans          — plan definitions (price_monthly, price_yearly, limits)
billing_add_ons             — optional add-ons (single `price` field)
discount_policies           — discount codes (percentage or fixed SAR)
tenant_subscriptions        — one row per tenant, current subscription state
billing_quotes              — quotes (draft → approved → activated → expired)
billing_invoices            — auto-created on activation (paid / draft / void)
billing_line_items          — line items on quotes (plan + add-ons + discounts)
billing_events              — append-only audit trail of all engine actions
```

### Relationships

```
tenants ──< tenant_subscriptions >── subscription_plans
tenant_subscriptions ──< billing_invoices
tenant_subscriptions ──< billing_quotes >── billing_line_items
billing_add_ons ──< billing_line_items
discount_policies ──< billing_line_items
```

### Subscription Status Values

| Status | Meaning |
|--------|---------|
| `trial` | Free trial period, full access |
| `active` | Paid, full access |
| `past_due` | Payment failed, grace period |
| `expired` | Period ended, read-only |
| `cancelled` | Admin or user cancelled, read-only |

---

## Engine RPCs

### `engine_calculate(p_plan_id, p_billing_cycle, p_add_on_ids, p_discount_policy_id)`
Pure read — no DB writes. Returns `PricingBreakdown`:
```typescript
{ plan_amount, add_ons_amount, subtotal, discount_amount, taxable_amount,
  tax_rate, tax_amount, total, currency, breakdown: BillingLineItem[] }
```
Use for live pricing previews before any payment.

### `engine_activate(p_tenant_id, p_plan_id, p_billing_cycle, ...)`
Creates / updates `tenant_subscriptions` and auto-creates a `billing_invoice`.
Returns `ActivationResult`:
```typescript
{ subscription_id, invoice_id, invoice_number, status, period_start, period_end, amount }
```
Key optional params:
- `p_status`: `'active'` (default) or `'trial'`
- `p_trial_days`: number of trial days (when `p_status = 'trial'`)
- `p_payment_method` / `p_payment_reference`: for Tap payments
- `p_source`: `'admin'` | `'self_service'` | `'quote'`

### `engine_cancel(p_tenant_id, p_admin_note?)`
Sets subscription status to `'cancelled'`. Read-only mode kicks in immediately.

### `engine_extend_trial(p_tenant_id, p_extra_days, p_admin_note?)`
Extends `trial_ends_at` by N days. Only works on `trial` status.

### `engine_create_quote(p_tenant_id, p_plan_id, p_billing_cycle, ...)`
Creates a draft quote. Returns `{ quote_id, quote_number, total, valid_until }`.

### `engine_approve_quote(p_quote_id, p_admin_notes?)`
Moves quote from `draft` → `approved`. Client can now pay.

### `engine_activate_from_quote(p_quote_id)`
Activates subscription from an approved quote. Creates invoice, sets status `active`.

---

## Frontend Hooks

All hooks are in `src/hooks/useBillingEngine.ts`. Import types from `src/types/billing.ts`.

```typescript
// Read
useTenantSubscriptionNew(tenantId)   // current subscription state
useBillingInvoices({ tenantId })     // tenant's invoices
useBillingStats()                    // platform-wide stats
useEngineCalculate({ planId, billingCycle, addOnIds, discountPolicyId })
useBillingQuotes({ tenantId, status })
useBillingAddOns()
useDiscountPolicies()

// Write (mutations)
useEngineActivate()
useEngineCancel()
useEngineExtendTrial()
useEngineCreateQuote()
useEngineApproveQuote()
useEngineActivateFromQuote()
```

---

## Tenant Payment Flow (Self-Service)

```
1. Tenant opens /subscription
2. Selects plan + billing cycle
3. useEngineCalculate() shows live price breakdown
4. Clicks "Pay Now" → usePayment.initiatePayment()
5. POST /api/create-charge → Tap payment page (redirect)
6. Tap redirects to /payment/callback?tap_id=...
7. PaymentCallbackPage calls usePayment.verifyPayment(tap_id)
8. POST /api/verify-payment (server-side):
   a. Calls Tap API to verify charge
   b. Calls engine_activate() with payment_method='tap', payment_reference=tap_id
   c. Returns { success, subscription: ActivationResult }
9. Frontend refreshes TenantContext → subscription_status updates
10. Auto-redirect to /subscription after 3 seconds
```

---

## DashboardLayout Blocking Logic

| Subscription Status | Access | Banner |
|--------------------|--------|--------|
| `trial` (> 3 days left) | Full | None |
| `trial` (≤ 3 days left) | Full | Amber warning with countdown |
| `active` | Full | None |
| `past_due` | Full | (future: payment warning) |
| `expired` | Read-only | Red banner + "Choose a Plan" |
| `cancelled` | Read-only | Red banner + "Choose a Plan" |

Non-admin users on expired/cancelled tenants see `ServiceSuspended` screen.

---

## How to Add a New Plan

1. Insert row into `subscription_plans` via the Platform → Subscription Plans admin page.
2. Set `is_active = true` and `sort_order` for display order.
3. Set `trial_days` for trial length.
4. No code changes needed — plans are fetched dynamically.

## How to Add a New Add-On

1. Insert row into `billing_add_ons` (via Platform → Subscription → Add-ons tab).
2. Set `code` (unique), `price`, `billing_type` (`recurring` or `one_time`).
3. Add-ons are available immediately when creating quotes or activating.

## How to Add a Discount Policy

1. Insert via Platform → Subscription → Discount Policies tab.
2. Set `discount_type`: `percentage` (e.g. 20 = 20%) or `fixed` (e.g. 100 = 100 SAR off).
3. Set `valid_from` / `valid_to` for time-limited discounts.

## How to Handle a Subscription Problem Manually

```sql
-- Extend a trial by 7 days
SELECT engine_extend_trial('TENANT_ID', 7, 'Support extension');

-- Reactivate an expired subscription
SELECT engine_activate(
  p_tenant_id := 'TENANT_ID',
  p_plan_id := 'PLAN_ID',
  p_billing_cycle := 'monthly',
  p_source := 'admin',
  p_status := 'active',
  p_payment_method := 'manual',
  p_admin_note := 'Manually reactivated by support'
);

-- Cancel a subscription
SELECT engine_cancel('TENANT_ID', 'Cancelled by admin request');

-- View subscription audit trail
SELECT * FROM billing_events WHERE tenant_id = 'TENANT_ID' ORDER BY created_at DESC;
```

---

## Key Files

| File | Purpose |
|------|---------|
| `supabase/migrations/101_unified_billing_engine.sql` | Schema + RPCs |
| `src/hooks/useBillingEngine.ts` | All billing hooks + types |
| `src/hooks/useSubscriptionPlans.ts` | Plan CRUD hooks |
| `src/types/billing.ts` | Public type re-exports |
| `src/pages/platform/QuotesPage.tsx` | Admin quote management |
| `src/pages/platform/FinancialsPage.tsx` | Admin invoice view |
| `src/pages/platform/SubscriptionPage.tsx` | Admin plan/add-on/discount management |
| `src/pages/platform/TenantsManagementPage.tsx` | Admin tenant subscription actions |
| `src/pages/subscriptions/TenantSubscriptionPage.tsx` | Tenant self-service page |
| `src/pages/payment/PaymentCallbackPage.tsx` | Tap payment callback handler |
| `src/hooks/usePayment.ts` | Tap payment initiation + verification |
| `src/utils/invoiceGenerator.ts` | PDF invoice generation |
| `src/components/layout/DashboardLayout.tsx` | Read-only / warning banner logic |
| `api/create-charge.ts` | Tap charge creation endpoint |
| `api/verify-payment.ts` | Tap verification + engine_activate endpoint |
