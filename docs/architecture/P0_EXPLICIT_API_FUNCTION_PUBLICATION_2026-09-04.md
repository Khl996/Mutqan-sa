# P0 explicit API function publication — acceptance evidence

**Date:** 2026-09-04
**Implementation commit:** `6afbf35b7f5c46770b768c3e87d60ced12c80157`
**Migration:** `20260903235032_p0_explicit_api_function_publication.sql`
**Canonical Git-blob SHA-256:** `1a92ee012af146c347ef0d464c5124c2f883e21f1077281c4f23dc2eb9f54520`
**Canonical size:** `1428` bytes

## Finding and correction

PostgreSQL grants `EXECUTE` on new functions to `PUBLIC` by default. A per-schema `ALTER DEFAULT PRIVILEGES ... IN SCHEMA public REVOKE` is additive and cannot remove that global built-in grant. The accepted anonymous allowlist migration correctly hardened every existing `SECURITY DEFINER` function, but its schema-scoped future default was insufficient by itself.

The forward-only correction:

1. revokes the global future `PUBLIC EXECUTE` default for functions created by `postgres`;
2. removes schema-local defaults for `PUBLIC`, `anon`, `authenticated`, and `service_role` in `public`;
3. does not rewrite any historical migration or change ACLs on existing functions;
4. requires every future API function to be published with an explicit reviewed `GRANT`.

Reference: [PostgreSQL 17 ALTER DEFAULT PRIVILEGES](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html).

## Isolated PostgreSQL 17 replay

A fresh isolated PostgreSQL 17.11 cluster replayed the accepted history through this migration and its regression test. The historical anonymous allowlist test was then repeated.

- result: `PASS`;
- recorded artifacts: `44`;
- concurrent payment activation/idempotency fixture: `PASS`;
- conflicting/default publication behavior: `PASS`;
- no existing replay artifact was modified to obtain the result.

## Hosted Staging proof

Identity was re-read before the probe:

- project: `Mutqan Staging`;
- ref: `eaawunoqdxguzlpvlxrv`;
- region: `ap-southeast-1`;
- status: `ACTIVE_HEALTHY`;
- PostgreSQL: `17.6.1.155`.

The hosted migration ledger contains:

- version: `20260903235032`;
- name: `p0_explicit_api_function_publication`.

A transactional probe created a new `postgres`-owned `SECURITY DEFINER` function and rolled the transaction back. Before any explicit grant its ACL was exactly `{postgres=X/postgres}` and `anon`, `authenticated`, and `service_role` all failed `has_function_privilege(..., 'EXECUTE')`. After an explicit grant, only `authenticated` and `service_role` could execute; `anon` remained denied. Both probe functions were absent after rollback.

The live default ACL catalog now shows owner-only function defaults for `postgres` globally and in `public`. A separate `storage`-schema default remains scoped to `storage` and is not inherited by `public`.

Existing authority remained unchanged:

- `PUBLIC`-executable `SECURITY DEFINER` functions in `public`: `0`;
- anonymous `SECURITY DEFINER` functions: exactly the reviewed five public-token endpoints;
- anonymous functions outside the reviewed allowlist: `0`.

The Supabase security advisor returned no `ERROR` findings. Its five anonymous-function warnings correspond exactly to the intentional five-function allowlist. Other rule-based warnings remain separately visible and were not treated as evidence of authorization by themselves; the catalog and adversarial privilege probes above are the acceptance authority.

## Scope boundary

Only Staging was changed. Production `mzpohntjotgeeaukwnbz` was not modified. This migration remains pending for the controlled production sequence and is gated by the fresh backup/restore checkpoint and the governance bridge.
