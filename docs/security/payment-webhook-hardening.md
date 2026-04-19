# Payment Webhook Hardening - Phase 2

## Current State

`api/payment-webhook.ts` does not trust the incoming webhook body as proof of payment. It now:

1. Validates charge id shape.
2. Applies a small best-effort per-IP/per-charge rate limit.
3. Optionally validates a shared webhook secret.
4. Re-fetches the charge directly from Tap with `TAP_SECRET_KEY`.
5. Requires `CAPTURED` status.
6. Validates tenant id, plan id/code, billing cycle, paid amount, and SAR currency.
7. Checks idempotency through `billing_invoices.payment_reference`.
8. Activates through `engine_activate`, which Phase 2 narrows for service-role paid Tap activations only.

## Signature Gap

No existing Tap webhook signature header, signing secret, or verification configuration was present in the project code. Because of that, Phase 2 does not claim official Tap signature verification.

Use one of these before production payment scale:

1. If Tap supports official signatures for this account, add the documented header verification here and make it fail closed.
2. If Tap supports custom webhook headers, set `PAYMENT_WEBHOOK_SECRET` in the deployment and configure Tap to send either `x-mutqan-webhook-secret` or `Authorization: Bearer <secret>`.

Until then, protection relies on Tap API re-fetch, metadata validation, amount verification, idempotency, and rate limiting.
