# Mutqan application and accepted-history reconciliation

**Date:** 2026-08-24 (Asia/Riyadh)

**Branch:** `codex/integrated-professional-system-20260824`

**Accepted parent:** `04fff80e3c27a1dd52925b57d8de28a9344c711f`

**Application parent:** `7eb34b25f960571837b6be5b227508b907311c7f` (`origin/main`)

**Remote mutation:** none

**Supabase/Vercel/Production mutation:** none

## Purpose

Create one reviewable source line that retains the accepted Wave 0/P0 database
history and final staging evidence while restoring the currently deployed
application capabilities from `origin/main`. This reconciliation is a required
predecessor to the Mutqan integrated professional-system programme; it does not
implement that programme by itself.

## Isolation

The original checkout contained unrelated tracked and untracked user work. It
was not stashed, reset, cleaned, or included. Reconciliation was performed in a
new sibling worktree created directly from the accepted production-review tag.

## Merge decisions

1. Retain the accepted fixed dark Brand v2 tenant/platform sidebar treatment.
2. Retain `origin/main` application additions, including Hospital Lite, PM UI,
   WhatsApp intake, rounds, locations, quality checks, and bundle splitting.
3. Retain both security improvements in the overlapping admin/auth paths:
   active-profile authority and Auth suspension from the accepted line, plus
   global sign-out, stale-token cleanup, and removal of PII debug logging from
   the application line.
4. Replace the stale handoff with the current reconciliation state and preserve
   both historical journal lineages under explicit headings.
5. Exclude the numbered migration copies `130` through `145` and `149` imported
   by `origin/main`. The accepted timestamped/recovered history remains the only
   active migration set. The merged index contains exactly the same 35 active
   migration paths as the accepted parent.

The recovered `146`, `147`, and `148` historical exceptions remain unchanged as
documented in `DB_MIGRATION_BASELINE.md`.

## Checksum preservation

Hashes below were computed from the Git index blob bytes, avoiding Windows
working-tree CRLF conversion.

| Artifact | SHA-256 | Result |
| --- | --- | --- |
| Wave 0 migration | `25d519df50c81ba7331b9f823d0cbf535e3f1c3dbd22de236b2eb8129601a7d3` | match |
| P0 central authority/provisioning | `5ab552080198f073a5fc30b49cc05dcee9cfe350942a3b355daaae17dbbb86e9` | match |
| P0 runtime-secret reconciliation | `a7e556b225ae1dc6867b67f42d2c9a35008b929eda99ed5ed8ffdd55d23f6d1c` | match |
| P0 PM explicit authority | `9bde9a93cb2804a1500287b37207ae253c0394b3a612a6f73d838583db997dc2` | match |
| P0 anonymous definer allowlist | `0eb0899d00b965fd1e92448446b5679ddf839fc062d44915a210b1cf1cdafa34` | match |
| Anonymous allowlist fixture | `9e4cd3a370a9bcdfed631a612995966be619f01e61d527d5ac3f8fc59cf1a8cf` | match |
| Controlled replay harness | `b1bacae671f563a2563e99d5ff4ed46f16ff713cae4610070ca5a584f5eb50ab` | match |
| P0 authority fixture | `1cab44153242c90fddad1f431c95a1a71ed2e65438ca84c6c1bbc321a6503d43` | match |
| P0 runtime-secret fixture | `6d362be8509e7881d8d34093cf464a55a3e7f7709e7f5685fc986847eba65209` | match |
| P0 PM fixture | `83cb654a072af7a1af608c53c2be13b84cd32dfee864dd3ef4ac51ff2cb63cff` | match |

## Verification

- `npm test`: 3 files and 28 unit tests passed; mojibake scan passed.
- ESLint: zero errors and 221 existing warnings.
- Production build: passed using Node `24.19.0`, matching the configured Vercel
  major runtime. PWA output was generated successfully.
- Largest application chunk after `origin/main` bundle splitting: approximately
  639 kB minified / 379 kB gzip; the existing >500 kB warning remains.
- No unresolved merge entries.
- Active migration path set equals the accepted parent exactly: 35/35.

## Bounded residuals

- `npm ci` reports 41 dependency advisories: 1 low, 13 moderate, 24 high, and
  3 critical. No automatic or forced dependency update was run; these require a
  separate dependency/supply-chain assessment and regression plan.
- The lint warning backlog and the large application chunk remain quality debt,
  not merge-introduced errors.
- Database runtime fixtures were not rerun against hosted environments because
  no migration artifact changed and this integration performs no remote action.

## Gate

This reconciliation may be committed as a standalone integration checkpoint.
No product, brand, EXPRO-alignment, staging, or production change should be
stacked into the same commit.
