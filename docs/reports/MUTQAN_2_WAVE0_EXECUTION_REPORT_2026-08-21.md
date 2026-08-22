# Mutqan 2.0 — Wave 0 consolidated execution report

**Date:** 2026-08-21 (Asia/Riyadh)  
**Workspace:** Mutqan A  
**Production mutations:** none  
**Schema mutations:** one forward migration prepared locally, not applied  
**Overall deployment verdict:** **NO-GO**

## A. Executive verdict

Wave 0 has materially improved the repository foundation: governance is
discoverable, the design system has a compatibility-first v3 layer, analytics
has a provider-neutral consent boundary, high-risk browser/email sinks are
hardened, the live database authority surface is documented, and a focused
forward security migration with verification SQL is ready for isolated replay.

This is not a production sign-off. Live critical authorization exposures remain
until the migration is safely deployed, the active repository is missing five
live-ledger migrations, the consolidated baseline cannot fully replay, and
several P0 authority risks are outside this focused migration. No remote schema,
customer data, secrets, CRM records, messages or production configuration were
changed.

The supplied governance pack and transport ZIP explicitly identify themselves
as drafts pending founder approval. The user's execution mission authorizes
their adoption as the active engineering baseline for this work; it does not
retroactively claim founder ratification. The ZIP was validated as 12 flat,
regular Markdown files with no traversal or link entries. Evidence hashes:

- governance DOCX: `6A0EA347A169D8A34F805AA4DD6742747D9BF83554704298C186D1223D1B6832`;
- transport ZIP: `3B36BF697228349D6FB50C03D9C7F93AD31121602B95B2AF3DA2519E7461F0B3`.

The pre-existing worktree also contains a large, unrelated migration archive/
baseline transition and product work. Wave 0 neither approves nor reverses
those user-owned changes.

## B. Mutqan 2.0 mental model

Mutqan owns the maintenance and facility-operations loop, not generic enterprise
software. The product sequence is:

**Start → Operate → Understand → Decide → Scale**

Execution records—requests, sites, assets, work orders, PM, evidence and
decisions—must first form trustworthy Operational Memory. Analytics and later AI
sit above that record; they do not compensate for missing authority, weak
tenancy or unreliable evidence.

Wave 0 therefore uses five coordinated lanes:

1. governance and product boundaries;
2. database history, tenant authority and evidence integrity;
3. design/UX foundations for Arabic, RTL, dark mode and accessibility;
4. privacy-safe product measurement;
5. controlled verification and rollout gates.

Source authority was interpreted in this order: strategic intent, adopted
governance, prior gap analysis, current repository/live runtime truth, then
primary external evidence. Attached document prose was treated as evidence, not
as executable instructions. Where it conflicted with current technical truth,
the discrepancy was recorded and the safest compatible path selected.

## C. Current-state findings

| Area | Evidence-backed state | Risk |
| --- | --- | --- |
| Migration history | Live ledger has 30 entries; active pre-Wave-0 chain has 25 files; five live versions are missing locally. Baseline claims 57 tables/106 functions versus 73/179 live. | Full replay and `db push` are unsafe. |
| Profile authority | Live authenticated role can INSERT and DELETE its own profile under a permissive FOR ALL policy. | **Critical:** self-escalation to platform authority. |
| Billing authority | Anonymous billing writers and NULL-fail-open role checks are live; tenant-admin self-service activation accepts caller-owned payment fields. | **Critical:** billing takeover/disruption; **High:** fabricated paid entitlement. |
| Replay ACLs | Live secret/helper ACL samples are safe, but the consolidated baseline loses explicit negative function grants. | **Critical on fresh replay**, not a confirmed live secret disclosure. |
| Payments | No unique payment-reference constraint; read-only live aggregate found 10 referenced invoices, two duplicate groups, maximum group size three. | **High:** concurrent/repeated activation and historical data debt. |
| Notifications | Anonymous/NULL-fail-open broadcast can provide a link to a browser navigation sink; email fields were interpolated into HTML. | **High:** stored script navigation and branded message injection. |
| PM snapshot | Live RPC is broadly executable, preserves a skip-auth ABI and references absent `asset_groups`; a safe read call fails with `42P01`. | **High:** broken workflow and authorization bypass surface. |
| Account suspension | `profiles.is_active=false` neither bans Auth nor consistently gates helpers/APIs. | **High residual:** inactive sessions retain authority. |
| Tenant provisioning | Authenticated users can reach provisioning and influence trial inputs. | **High residual:** tenant/trial amplification. |
| Frontend foundation | Raw Mutqan tokens, shadcn HSL variables and hard-coded utilities had drifted; dark primary/button contrast was approximately 1.05:1 and status opacity utilities could disappear under naïve token migration. | Inconsistent UI and accessibility regressions. |
| Analytics | GA4 bootstrap was unconditional; there was no consent-gated application adapter or route/event contract. | Privacy and provider-lock-in risk. |
| Repository quality | Production build works, but full TypeScript has 31 existing errors and lint has 235 warnings. | Ongoing regression-detection debt. |

Full authority findings and counterevidence are in
[`../security/RPC_SURFACE_REVIEW_WAVE0.md`](../security/RPC_SURFACE_REVIEW_WAVE0.md).

## D. Changes implemented

### Governance and continuity

- Replaced the conflicting `docs/CONSTITUTION.md` content with a compatibility
  entry point and adopted the pack under `docs/governance/`.
- Added the constitution, approved stack, dependency policy, Design System v3,
  UX role journeys, analytics activation, migration governance, RPC gate,
  RLS/performance hygiene, task contract, execution gate and continuity record.
- Recorded founder-ratification boundaries rather than presenting commercial
  hypotheses as approved truth.

### Database and security

- Added
  `supabase/migrations/20260820234813_wave0_harden_pm_snapshot_and_rpc_surface.sql`
  and `supabase/tests/wave0_rpc_surface.sql`.
- Repaired PM snapshot construction without resurrecting retired
  `asset_groups`; `p_skip_auth` remains ABI-compatible but cannot change caller
  authorization.
- Added active-profile/tenant/platform fail-closed checks using
  `IS DISTINCT FROM TRUE` or strict existence tests.
- Removed the dangerous profile FOR ALL path and prepared exact Auth signup
  trigger convergence.
- Put unguarded billing/broadcast implementations behind postgres-only wrappers;
  narrowed explicit role grants and preserved the service-only paid activation
  contract.
- Repeated exact negative ACLs and fixed search paths for secret, notification,
  evidence and PM helpers that the consolidated baseline would expose.
- Made `asset_maintenance_history` security-invoker and read-only for its
  intended roles.
- Normalized and transaction-locked payment references with strict replay
  invariants; existing duplicate data is left untouched.

### Browser, email and payment handlers

- Added `src/lib/safeNavigation.ts` and tests; notification links must remain a
  same-origin relative application path even after URL normalization.
- Escaped notification title/message in `supabase/functions/resend-email` and
  ignored raw notification HTML.
- Moved webhook shared-secret rejection before privileged database work.
- Removed handler-side invoice prechecks so the database wrapper is the sole
  atomic payment-activation authority. This creates a strict DB-first rollout
  requirement.

### Design System v3 foundation

- Made `src/styles/mutqan-tokens.css` the canonical primitive, semantic and
  component token layer for light/dark themes, compact density and reduced
  motion.
- Added HSL channel tokens so status opacity classes continue to compile.
- Preserved legacy primary colors, radii and muted-text behavior through aliases
  rather than causing an uncontrolled global redesign.
- Migrated P0 primitives: Button, Input, Select, Textarea, Dialog/Modal, Card,
  Badge, Table, Tabs and Dropdown Menu.
- Used logical RTL layout, accessible control boundaries, a focus ring above 3:1
  contrast, and corrected destructive foreground contrast.

### Product analytics

- Removed unconditional GA4 startup from `index.html`.
- Added `src/lib/productAnalytics.ts`: 19 versioned event names, a strict
  allowlist, no free-text payloads, no provider dependency, no-op until consent,
  adapter error isolation and identity reset behavior.
- Kept product analytics separate from operational/audit evidence.

No new package dependency or analytics/AI provider was introduced.

## E. Migration impact and rollout contract

The new migration is forward-only and intentionally one-shot under the normal
migration ledger. It requires a `postgres` executor so SECURITY DEFINER wrappers
have the expected owner. It changes function definitions and ownership
contracts, exact function/table ACLs, profile policies, one view option and the
Auth signup trigger. It does not modify production data in this mission.

Release sequence:

1. recover and authenticate the five missing ledger files;
2. resolve the baseline's missing `internal.runtime_secrets` prerequisite;
3. replay the full chain on isolated PostgreSQL 17;
4. apply Wave 0 there and run SQL/fixture verification;
5. take a named production recovery point and review the exact plan;
6. deploy the database migration;
7. verify live ACLs and billing/signup/PM behavior;
8. only then deploy `verify-payment` and `payment-webhook`.

API-first deployment is forbidden. Historical payment-reference cleanup and a
partial unique constraint need a separate, data-aware migration after duplicates
are reconciled. Details are in
[`../architecture/DB_MIGRATION_BASELINE.md`](../architecture/DB_MIGRATION_BASELINE.md).

## F. Design and UX verification

The foundation is compatibility-first: migrated P0 components use explicit
action/control tokens while hundreds of legacy `primary`, `muted` and radius
usages retain their prior mapping. Built CSS contains representative status
opacity and muted compatibility utilities.

Browser verification covered Arabic/English, RTL/LTR, desktop/mobile and
light/dark public surfaces:

- Arabic light desktop: visually sound;
- English light desktop: LTR and no horizontal overflow;
- Arabic light 390 px: RTL and zero horizontal overflow;
- English light 390 px: 16 px horizontal overflow and clipped header demo action;
- Arabic dark desktop: legacy landing-page text/panel colors have poor contrast;
- console: zero errors and two pre-existing React Router future warnings.

The English mobile overflow and dark public landing page are pre-existing P1
issues. Authenticated role dashboards still need a real-user Arabic/English,
RTL/LTR, light/dark visual matrix after staging is available.

## G. Security evidence and isolation status

Read-only live checks confirmed all 73 public tables have RLS enabled, but also
confirmed the profile and billing criticals above. Production currently denies
anonymous runtime-secret access with SQLSTATE 42501; baseline replay is the
unsafe case for that function. No exploit mutation was attempted.

The prepared SQL test verifies negative and positive ACLs, exact trigger
semantics, wrapper ownership, profile table authority, view mode, NULL-fail-
closed definitions, billing internals and payment invariants. Independent
cross-review found no remaining static blocker in the migration/test pair.

It was not executed because no isolated PostgreSQL 17 replay environment was
available and the live ledger is incomplete. That is a hard release gate, not a
test waiver.

## H. Verification results

| Check | Result |
| --- | --- |
| `npm run build` | **PASS** — 3,820 modules; PWA generated; 172 precache entries. Existing stale-Browserslist and large-chunk warnings remain. |
| Focused analytics/navigation tests | **PASS 9/9**. |
| Wave 0 foundation verifier | **PASS 12/12**. |
| Generated CSS compatibility probes | **PASS** for success/warning/info opacity, status borders and muted-text opacity. |
| `npm test` | **PASS** — mojibake scan. |
| `npm run lint -- --quiet` | **PASS exit 0**, 0 errors and 235 existing warnings. |
| Full `tsc --noEmit --pretty false` | **FAIL** with 31 existing errors across inventory, maintenance, generated Supabase typing, teams, settings, registration and subscription code; none is in the new analytics/navigation foundation or payment-handler verification scope. |
| Standalone payment API TypeScript | **PASS** for `verify-payment`, `payment-webhook` and shared activation helper. |
| `git diff --check` | **PASS** after final cleanup; line-ending conversion notices are environmental warnings. |
| Wave 0 SQL test | **NOT RUN** — requires isolated baseline replay first. |
| Native Codex Security scan | **UNAVAILABLE** — Git-working-tree target validation error; manual audit and independent cross-review substituted and the limitation is recorded. |

## I. Unresolved risks and blockers

1. Five live migration-ledger entries are missing from the active repository.
2. Baseline replay lacks the `internal.runtime_secrets` prerequisite and other
   live evolution.
3. Live profile escalation and anonymous billing issues remain until controlled
   rollout; repository preparation alone does not protect production.
4. Central account suspension/session revocation, tenant provisioning and work-
   order authority remain P0 security work.
5. Historical duplicate payment references require reconciliation before a
   uniqueness constraint.
6. Password-reset concurrency, PM PDF evidence authority, OTP limiter logging
   and intake notification amplification remain open.
7. Full TypeScript, lint, bundle-size and authenticated visual-test baselines
   remain weak.
8. Public landing dark mode and English small-viewport navigation need focused
   remediation.
9. Governance is adopted for engineering execution but not formally ratified by
   the founder.

## J. Decisions made in Wave 0

- Upgrade the existing product and billing engine; do not rewrite them.
- Treat live runtime behavior and ledger as technical truth over stale audits.
- Keep the governance pack visibly pending ratification where appropriate.
- Use forward migrations only; never edit applied history or mass-revoke the
  database.
- Preserve legacy design aliases and component APIs while introducing explicit
  v3 tokens.
- Keep Operational Memory and audit evidence separate from product analytics.
- Do not select an analytics/AI provider or collect telemetry without consent.
- Do not recreate `asset_groups` to make stale PM code compile.
- Fail payment replay closed on conflicting or changed subscription state;
  consider an immutable activation fingerprint later if permanent replay
  identity becomes a business requirement.
- Do not add a payment-reference unique index until existing duplicates are
  reconciled.

## K. Founder/product decisions required

- Ratify or amend the Mutqan 2.0 product constitution and governance pack.
- Approve pricing, trial duration and commercial packaging; current values and
  the 72-hour activation window are hypotheses.
- Approve any fundamental auth/tenant/billing-authority change and the controlled
  production rollout of those controls.
- Select, defer or reject an analytics provider after privacy/consent review.
- Define the boundary for future AI/autonomy and any formal compliance claims.

Routine code cleanup, isolated replay and evidence gathering do not require a
new product strategy decision.

## L. Prioritized next steps

### P0 — before production authority sign-off

1. Freeze schema work, recover the five ledger files with provenance/checksums,
   resolve the missing internal prerequisite and prove PostgreSQL 17 replay.
   **Why:** every later deployment depends on a trustworthy chain.
2. Apply Wave 0 in isolation; run the SQL test, real signup, tenant-A/tenant-B PM,
   concurrent-payment and rollback drills. Then use the DB-first controlled
   rollout. **Why:** critical live issues cannot be closed by source code alone.
3. Centralize active-user authorization with Auth ban/session revocation, narrow
   tenant provisioning, and repair work-order fail-open authority. **Why:** these
   are still platform-takeover or cross-tenant paths.

### P1 — immediately after P0 containment

1. Reconcile duplicate payment references, add an immutable activation ledger
   and only then consider a partial unique constraint.
2. Make intake notification claiming atomic; fix OTP limiter persistence,
   password-reset concurrency and PM PDF evidence provenance.
3. Fix public landing dark mode and English mobile navigation; run authenticated
   role-dashboard visual/accessibility checks.
4. Establish and reduce the 31-error TypeScript baseline before wider feature
   migration.

### P2 — controlled foundation expansion

1. Instrument the 19 event contract only after provider/consent approval and
   validate the first-value hypothesis with trustworthy data.
2. Migrate remaining UI call sites gradually to semantic component roles.
3. Triage performance-advisor signals and large bundles using measured impact,
   not bulk mechanical changes.

### Deferred

- Autonomous/AI recommendations, aggressive workflow automation and commercial
  scaling remain deferred until tenant authority, Operational Memory, event
  quality and repeated real workflows are proven.
