# Mutqan 2.0 final staging blocker closure — 2026-08-22

## A. Verdict

**STAGING NO-GO**

The anonymous `SECURITY DEFINER` P0 blocker is closed on the isolated hosted
staging project. The real signup path is still blocked before email delivery:
Resend rejected the configured sender because `mutqan-sa.com` is not verified
in the Resend account. OTP verification, an authenticated signup session, the
one-time approval and signup-driven provisioning therefore cannot yet be
accepted as one continuous hosted path.

This is now the smallest remaining staging blocker. No database-authority P0
blocker remains demonstrated by the required regression subset.

## B. Immutable scope and target

| Evidence | Result |
| --- | --- |
| Original frozen commit | `10451638642fe4c17c2bf5cb7ea3c7f39823de0b` |
| Original frozen tag | `mutqan-2.0-controlled-staging-acceptance-20260822` |
| Prior acceptance report commit | `9be4deacfad7220f6c766afb0be56fe99ed05d79` |
| Closure branch | `codex/final-staging-blocker-closure-20260822` |
| Security migration commit | `6d15a5654cd1611b1c17f704774df9503195f484` |
| Closure reviewed tag | `mutqan-2.0-final-staging-blocker-closure-20260822` |
| Staging ref | `eaawunoqdxguzlpvlxrv` |
| Staging project | `Mutqan Staging` |
| Region | `ap-southeast-1` |
| PostgreSQL | hosted `17.6.1.155`; SQL `17.6` |
| Production deny target | `mzpohntjotgeeaukwnbz` |

The management-plane lookup again returned the staging ref, name, region,
healthy status and PostgreSQL version before this closure run executed SQL.
The database contained only the six synthetic Auth users and four synthetic
tenants created by the controlled replay and acceptance fixtures. It contained
no production customer data. Project-specific staging credentials were not
written to the repository or this report.

Production was not linked, queried, changed, merged into or deployed.

## C. Real hosted signup result

The test used a new disposable staging-only inbox and the same payload shape as
`RegisterPage.tsx`:

1. `POST /auth/v1/signup` with the pending registration draft;
2. expected delivery of the Confirm signup template containing `{{ .Token }}`;
3. expected `type=signup` OTP verification and session creation;
4. expected denial before one-time approval;
5. expected platform/service approval;
6. expected `complete_pending_registration` provisioning;
7. expected `tenant_admin` and the `P0-REPLAY` plan-derived seven-day trial.

The path stopped at step 1 with HTTP `500`, `unexpected_failure`, and
`Error sending confirmation email`. The correlated Auth log reported SMTP
response `550`: the `mutqan-sa.com` sender domain is not verified in Resend.

The configuration reload log separately proves that the hosted email limiter
changed from the built-in `2/1h` value to `30`. The former `429` blocker is
therefore closed; the remaining failure is sender-domain verification, not the
email rate limit or the OTP template. The failed signup left no persistent
unconfirmed Auth user.

Because no email was delivered, there was no OTP to verify and no legitimate
signup session with which to continue the rest of this exact chain. Admin-made
confirmed fixtures and SQL impersonation are retained only as regression
evidence; they are not substituted for this mandatory signup acceptance path.

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

## G. Smallest remaining blocker

Before another signup acceptance run:

1. verify `mutqan-sa.com` in the Resend account and confirm its DNS records are
   in Resend's verified state, or deliberately configure another verified
   Mutqan-owned staging sender;
2. rerun one fresh disposable-inbox chain from signup through OTP, session,
   preapproval denial, one-time approval, provisioning, `tenant_admin`, and the
   plan-derived seven-day trial;
3. confirm the approval row is consumed once and the second provisioning path
   cannot create another tenant.

No additional database migration is justified by the current evidence.

## H. Deferred scope

`upload-report-photo` remains P1 because its deployable source is absent. It did
not block a mandatory P0 acceptance path and was not expanded during this
closure run.

No production merge, production migration, production deployment or automatic
promotion was performed or authorized.
