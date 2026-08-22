# Mutqan 2.0 — Wave 0 RPC and authority review

**Review date:** 2026-08-21 (Asia/Riyadh)  
**Live project inspected:** `mzpohntjotgeeaukwnbz`  
**Mode:** read-only live inspection plus local source review  
**Production changes:** none  
**Release verdict:** **NO-GO** until the migration ledger is reconciled and the
prepared migration is replayed and tested in an isolated environment.

## Scope and evidence boundary

The review covered the live public-schema privilege census, RLS state, policies,
function definitions and selected safe denial calls; the consolidated baseline;
the active post-baseline migration chain; all repository API handlers; the
Supabase Edge Functions; and the current authentication, profile, notification,
billing, PM and navigation sinks.

The live census is complete at the privilege-metadata level. Manual source-to-
sink review prioritized every anonymous SECURITY DEFINER surface and the
high-impact authenticated/service surfaces. This document does not claim that
all 179 function bodies received equal line-by-line depth.

The native Codex Security scan could not start because the scanner rejected the
workspace target as outside its Git working tree. The exact error was
`Scan target must stay inside its Git working tree.` Manual review and independent
cross-review were used instead; this tooling limitation remains disclosed.

No customer records, secret values, payment references or notification contents
are included here.

## Live surface census

Counts below are non-exclusive because one function may be executable by more
than one role.

| Surface | Live count / state |
| --- | ---: |
| Public tables | 73 |
| Public tables with RLS enabled | 73 |
| Public functions | 179 |
| SECURITY DEFINER functions | 158 |
| SECURITY DEFINER executable by anon | 61 |
| SECURITY DEFINER executable by authenticated | 130 |
| SECURITY DEFINER executable by service_role | 158 |
| Supabase security advisor signals | 227 |
| Supabase performance advisor signals | 396 |

RLS enabled is only a control flag; permissive policies, table grants and
SECURITY DEFINER functions can still bypass the intended tenant boundary.
Advisor counts are triage signals, not an authorization to mass-revoke or mass-
rewrite policies and indexes.

## Intended authority classes

| Class | Representative surfaces | Wave 0 rule |
| --- | --- | --- |
| Public by design | public tenant/portal-token reads, token-bound intake/report submission, read-only price calculation | Keep narrow, token/ownership bound, rate limited and free of privileged writes |
| Authenticated tenant | PM snapshot, inventory statistics, tenant work and PM commands | Require an active profile and tenant/object authorization; fail closed on NULL |
| Platform administrator | quote/approval/cancel/trial wrappers, broadcast, platform audit | Active `platform_owner` or `platform_admin`; no anonymous or service-key compatibility grant where the internal contract is user-admin only |
| Service/internal | runtime-secret access, notification creation, operation/PM audit helpers, payment activation | Explicit postgres/service grants only, fixed search path, no PUBLIC default |
| Trigger only | Auth profile creation and row-event synchronization functions | Invoked only by the expected enabled row trigger; no direct Data API execution |
| Legacy/dead | retired PM stack and definitions that reference absent `asset_groups` | Do not resurrect retired tables; remove or replace callers through forward migrations |

## Validated findings

### Critical

#### W0-SEC-01 — Authenticated profile self-takeover is exposed live

Live `profiles` privileges allow authenticated INSERT and DELETE, and the
permissive `Users can manage own profile` FOR ALL policy only checks
`id = auth.uid()`. The protected-field guard runs on UPDATE, not INSERT or
DELETE. A user can therefore replace their own row with a platform role and
reach platform helpers and service-backed admin APIs.

**Prepared remediation:** the Wave 0 migration drops the permissive FOR ALL and
signup INSERT policies, revokes INSERT/DELETE/TRUNCATE and related table
authority from Data API roles, fixes the `handle_new_user` search path, and
requires or creates the exact enabled AFTER INSERT FOR EACH ROW Auth trigger.

**Required proof:** real signup creates one safe profile; self-delete and direct
privileged insert fail; tenant and platform role paths still work.

#### W0-SEC-02 — Anonymous billing mutation is exposed live

Anonymous execution exists on quote creation/approval/activation/cancel/trial
functions. Several legacy checks use `IF v_role NOT IN (...)`; a missing profile
produces NULL and the IF does not raise. The chain can create and activate
billing state or disrupt another tenant.

**Prepared remediation:** legacy bodies are renamed to postgres-only internals;
public signatures become fail-closed wrappers; anon is explicitly revoked; only
active platform administrators can use administrative billing functions.
Trusted paid self-service activation remains a separate service-role path.

#### W0-SEC-03 — Consolidated baseline reopens secret/helper RPCs on replay

Production correctly denies anon/authenticated access to
`get_runtime_secret(text)` and the sampled privileged helpers. The consolidated
baseline preserves positive grants but loses required negative PUBLIC revokes.
Because PostgreSQL functions default to PUBLIC EXECUTE, a fresh replay would
expose the secret reader and arbitrary notification/evidence writers.

**Prepared remediation:** exact-signature PUBLIC/anon/authenticated revokes,
positive service grants and fixed `public, pg_temp` search paths are repeated in
the forward Wave 0 migration.

### High

| ID | State | Finding | Disposition |
| --- | --- | --- | --- |
| W0-SEC-04 | Live | Authenticated tenant admins can call `engine_activate` with caller-controlled paid status, method, reference and amount through `self_service`. | Local wrapper rejects browser self-service; only trusted payment service may use it. |
| W0-SEC-05 | Live | Broadcast RPCs are anonymous/NULL-fail-open; attacker-controlled links reach `window.location`, and notification title/message reached email HTML unescaped. | Local active-admin wrappers, internal-relative link validation, safe browser navigation and escaped email fields. |
| W0-SEC-06 | Live/data debt | Payment reference lacks uniqueness; live aggregates show duplicate groups. Concurrent verification could create repeated invoices/renewals. | Local advisory lock, normalized reference and strict paid/Tap/tenant/plan/amount/cycle/subscription invariants. Historical cleanup and a later partial unique index remain a controlled data decision. |
| W0-SEC-07 | Live/residual | `is_active=false` does not ban the Auth user, revoke sessions or consistently affect authorization helpers. | Touched Wave 0 wrappers require `is_active IS TRUE`; central suspension remains P0. |
| W0-SEC-08 | Live/residual | Any authenticated caller can reach `provision_tenant` and choose trial parameters, enabling tenant/trial amplification. | P0 redesign: narrow service/admin authority, server-owned commercial inputs and abuse controls. |
| W0-SEC-09 | Live | PM execution snapshot is callable too broadly, honors a skip-auth ABI, and fails because it references absent `asset_groups`. | Local wrapper ignores skip-auth for authorization, requires active object access, removes retired relation and preserves trusted trigger/service paths. |
| W0-SEC-10 | Baseline + live ACL | Baseline loses `security_invoker` on `asset_maintenance_history`; live has the option but still grants anon SELECT. | Local migration enforces invoker mode, removes Data API write-like privileges and grants read only to authenticated/service. |
| W0-SEC-11 | Live/residual | Work-order governance contains missing-row/NULL fail-open branches and accepts tamperable risk inputs. | P0 focused migration and fixture suite required. |
| W0-SEC-12 | Live/residual | Tenant users can record PM PDF export evidence through an authority surface not tightly bound to a trusted renderer. | P1 service-owned evidence contract and immutable provenance. |
| W0-SEC-13 | Live/residual | Concurrent password-reset attempts can race the one-time-attempt state. | P1 transactional claim/consume semantics and concurrency test. |

### Medium

| ID | Finding | Required action |
| --- | --- | --- |
| W0-SEC-14 | OTP IP limiting attempts to log an `otp_request` action excluded by its table constraint, and the insert error is ignored. | Align constraint and limiter record, then test per-email and per-IP windows. |
| W0-SEC-15 | Public intake notification routing uses a non-atomic queued-row read and find-before-insert fan-out; concurrent token-valid calls can amplify notifications/email. | Atomically claim the event, add a unique delivery key and rate-limit the public router. |

## Counterevidence and false-positive controls

- Live runtime-secret ACL is currently safe: anon/authenticated lack EXECUTE and
  an anonymous call is denied with SQLSTATE 42501. W0-SEC-03 is a replay defect,
  not a claim of a current secret leak.
- React escapes notification title/message on-screen. The exploitable browser
  sink was the unvalidated link assignment; the email concern was separate HTML
  interpolation.
- Payment handlers re-fetch the payment from Tap and validate amount/tenant;
  spoofing the webhook body alone is not sufficient. The confirmed issue is
  concurrency/replay binding after successful capture.
- Sequential intake retries are mostly idempotent; the amplification concern is
  the concurrent claim race.
- Trigger-returning helpers with broad metadata grants are hardening warnings
  when they cannot be called as RPCs, not automatically exploitable endpoints.

## Prepared local changes

The unapplied migration
`supabase/migrations/20260820234813_wave0_harden_pm_snapshot_and_rpc_surface.sql`
provides the database-side convergence. The verification script is
`supabase/tests/wave0_rpc_surface.sql`.

Application-side defenses are in:

- `src/lib/safeNavigation.ts` and notification click consumers;
- `supabase/functions/resend-email/index.ts`;
- `api/verify-payment.ts` and `api/payment-webhook.ts`.

The migration requires a postgres executor, checks the exact Auth trigger
semantics, fixes explicit negative ACLs, and keeps renamed unguarded billing and
broadcast implementations postgres-only.

## Release gates

1. Recover the five live-ledger migrations missing from the active repository.
2. Resolve the baseline's missing `internal.runtime_secrets` prerequisite.
3. Replay the full chain in an isolated database, then apply Wave 0 there.
4. Run `supabase/tests/wave0_rpc_surface.sql`, a real Auth signup smoke test,
   tenant-A/tenant-B PM fixtures, and concurrent payment fixtures.
5. Deploy the database migration before the updated payment handlers; never
   deploy the handlers first.
6. Re-run the live privilege census, safe denial calls and Supabase advisors.
7. Address W0-SEC-07, W0-SEC-08 and W0-SEC-11 before calling production
   authority hardened.

## Safe rollback model

Do not edit or mark-repaired an applied migration. Stop on unexpected ACL,
policy, trigger or schema drift. Restore service through the named recovery
point if necessary, then use a separately reviewed compensating migration.
