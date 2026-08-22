# Mutqan 2.0 final staging blocker closure — 2026-08-22

## A. Verdict

**READY FOR PRODUCTION DEPLOYMENT REVIEW**

The anonymous `SECURITY DEFINER` P0 blocker remains closed on the isolated
hosted staging project. After `mutqan-sa.com` was verified, one fresh external
inbox completed the real hosted path continuously from signup email delivery
through OTP verification, authenticated session creation, preapproval denial,
one-time approval, provisioning, `tenant_admin`, and the plan-derived trial.

The required database-authority regression subset passed again after that
hosted signup. No demonstrated P0 staging blocker remains. This verdict permits
a separate production deployment review only; it does not authorize or perform
a production merge, migration, deployment or promotion.

## B. Immutable scope and target

| Evidence | Result |
| --- | --- |
| Original frozen commit | `10451638642fe4c17c2bf5cb7ea3c7f39823de0b` |
| Original frozen tag | `mutqan-2.0-controlled-staging-acceptance-20260822` |
| Prior acceptance report commit | `9be4deacfad7220f6c766afb0be56fe99ed05d79` |
| Closure branch | `codex/final-staging-blocker-closure-20260822` |
| Security migration commit | `6d15a5654cd1611b1c17f704774df9503195f484` |
| Closure reviewed tag | `mutqan-2.0-final-staging-blocker-closure-20260822` |
| Production-review acceptance tag | `mutqan-2.0-production-deployment-review-20260823` |
| Staging ref | `eaawunoqdxguzlpvlxrv` |
| Staging project | `Mutqan Staging` |
| Region | `ap-southeast-1` |
| PostgreSQL | hosted `17.6.1.155`; SQL `17.6` |
| Production deny target | `mzpohntjotgeeaukwnbz` |

The management-plane lookup again returned the staging ref, name, region,
healthy status and PostgreSQL version before this closure run executed SQL.
Before the final hosted signup, the database contained only the six synthetic
Auth users and four synthetic tenants created by the controlled replay and
acceptance fixtures. The accepted signup added one confirmed synthetic Auth
user and one synthetic tenant, which are retained as staging acceptance
evidence. It contained no production customer data. Project-specific staging
credentials, mailbox address, password, OTP and session tokens were not written
to the repository or this report.

Production was not linked, queried, changed, merged into or deployed.

## C. Real hosted signup result

The accepted test used a new disposable staging-only external inbox and the
same payload shape as `RegisterPage.tsx`:

1. `POST /auth/v1/signup` with the pending registration draft;
2. real delivery through the configured Resend custom SMTP sender of the
   Confirm signup template containing `{{ .Token }}`;
3. `type=signup` OTP verification and session creation;
4. denial before one-time approval;
5. service-role approval for the staging-only `P0-REPLAY` plan;
6. `complete_pending_registration` provisioning;
7. `tenant_admin` and the plan-derived seven-day trial;
8. a second completion and a direct second provisioning attempt.

Observed results:

- signup returned HTTP `200` with no pre-confirmation session;
- the external inbox received the real message; the current Auth configuration
  generated an eight-digit `{{ .Token }}` value, which verified with HTTP
  `200` and returned an authenticated access/refresh session;
- completion before approval failed with HTTP `403`, SQLSTATE `42501`, because
  no valid one-time approval existed;
- service approval returned HTTP `200`, status `approved`, bound to
  `P0-REPLAY`;
- completion returned HTTP `200`, provisioned exactly one tenant, and reported
  `registration_recovery`, `P0-REPLAY`, and seven trial days;
- the temporary external mailbox was deleted after verification;
- the second completion returned the same tenant with `already_completed`;
- a direct second `provision_tenant` attempt failed with HTTP `403`, SQLSTATE
  `42501`.

The database-side readback independently confirmed that the Auth user is email
confirmed, the registration draft was removed, registration status is
`completed`, the profile is active `tenant_admin`, the approval is `consumed`
once and bound to the same tenant, and the tenant subscription is `trial` on
`P0-REPLAY` with the plan-owned seven-day window.

The earlier `429` rate-limit blocker and SMTP `550` unverified-domain blocker
are both closed. Admin-created confirmed fixtures and SQL impersonation were
not substituted for this mandatory hosted signup path.

## D. Anonymous definer closure migration

| Artifact | SHA-256 |
| --- | --- |
| `supabase/migrations/20260822165746_p0_anonymous_definer_allowlist.sql` | `0eb0899d00b965fd1e92448446b5679ddf839fc062d44915a210b1cf1cdafa34` |
| `supabase/tests/p0_anonymous_definer_allowlist.sql` | `9e4cd3a370a9bcdfed631a612995966be619f01e61d527d5ac3f8fc59cf1a8cf` |

The migration was created through the Supabase CLI, reviewed in a clean
worktree, committed separately, dry-run inside a rolled-back hosted
transaction, then applied as the only pending migration. Version
`20260822165746` is present in the hosted migration ledger, which now has 35
rows.

The migration:

- revokes `EXECUTE` from `PUBLIC` and `anon` on every public
  `SECURITY DEFINER` function;
- removes the postgres default `PUBLIC EXECUTE` privilege for future functions
  in the public schema;
- explicitly grants anonymous execution only to the five reviewed
  capability-token endpoints;
- leaves explicit authenticated and service-role grants intact;
- pins the 21 previously mutable public function search paths to reviewed
  schemas with `pg_catalog` first and `pg_temp` last;
- fails migration if a public definer is owned by an unreviewed non-postgres
  role or if a required reviewed function is absent.

The anonymous allowlist is exactly:

1. `get_public_tenant_data(text)`;
2. `submit_public_work_order(...)`;
3. `get_public_work_order_status(text)`;
4. `create_intake_report_from_public_token(...)`;
5. `submit_intake_report(...)`.

No public pricing function was added because no separately justified anonymous
pricing surface was found in the accepted application paths.

## E. Required regression subset

### Catalog and transactional suites

- new anonymous-definer allowlist suite: passed;
- P0 runtime-secret reconciliation: passed;
- P0 PM explicit snapshot authority: passed;
- P0 central authority/provisioning adversarial suite: passed.

All four suites passed again after the accepted hosted signup on 2026-08-23.

The historical Wave 0 surface test contains an assertion that the PM wrapper
must still use `pg_trigger_depth()`. That assertion is intentionally superseded
by the later P0 explicit-authority migration and its dedicated regression
suite, which proves the postgres-only internal snapshot builder and checked
public wrapper. The historical test remains valid at its replay point, not as a
post-P0 final-state gate.

### Real anonymous Data API

The five previously demonstrated leaks now fail with HTTP `401` and SQLSTATE
`42501` for an anonymous caller:

- `pm_calculate_compliance_stats`;
- `check_subscription_limits`;
- `is_tenant_feature_enabled`;
- `facility_location_is_valid`;
- `work_order_asset_location_is_valid`.

Using a newly issued staging-only capability token:

- tenant context returned exactly the token-bound tenant;
- an invalid token returned no tenant context;
- public work-order creation succeeded;
- the tracking token returned the matching minimal status;
- public intake creation succeeded;
- intake submission created its review draft.

The test capability token was disabled immediately afterward.

### Real authenticated Data API

A temporary, confirmed staging fixture user was created through the hosted Auth
admin path, bound to Hosted Tenant A, and then used only through a real password
login and user JWT. The hosted login returned a session, `get_my_profile`
returned only the bound tenant, and authenticated PM compliance statistics
remained callable. The fixture user and profile were deleted after the test.

This proves that removing inherited anonymous execution did not remove the
explicit authenticated surface. It does not replace the blocked public signup
email/OTP path.

## F. Final authority graph and advisor delta

| Item | Before closure | After closure |
| --- | ---: | ---: |
| Public tables / RLS-enabled | `74 / 74` | `74 / 74` |
| Public functions | `193` | `193` |
| Public `SECURITY DEFINER` functions | `169` | `169` |
| Anonymous-executable definers | `49` | `5` intentional allowlist entries |
| Mutable public function search paths | `21` | `0` |
| Security advisor notices | `202` | `137` |
| Anonymous-definer notices | `49` | `5` intentional allowlist entries |
| Migration ledger rows | `34` | `35` |
| Unconfirmed Auth users | n/a | `0` |
| Runtime-secret rows | `0` | `0` |

All `74` public tables still have RLS. `CREATE` on the public schema remains
false for `anon`, `authenticated` and `service_role`. The remaining five
anonymous-definer linter warnings correspond exactly to the reviewed token
allowlist and use explicit grants; they are not inherited defaults.

The remaining 132 security notices and the performance-advisor backlog are not
new regressions from this migration and are outside the demonstrated final P0
blocker. They remain review debt, including leaked-password protection and
historical extension placement.

## G. Production deployment review boundary

No demonstrated P0 staging blocker remains and no additional database
migration is justified by the current evidence. Production deployment still
requires a separate reviewed decision, an explicit production plan, protected
credentials, backup/rollback checks and operator authorization. This staging
acceptance does not grant any of those permissions.

## H. Deferred scope

`upload-report-photo` remains P1 because its deployable source is absent. It did
not block a mandatory P0 acceptance path and was not expanded during this
closure run.

No production merge, production migration, production deployment or automatic
promotion was performed or authorized.
