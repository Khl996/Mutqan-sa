-- =============================================================================
-- Migration: 126_disable_auto_close_stale_work_orders.sql
-- Purpose:
--   Disable auto_close_stale_work_orders for Pilot v1 by replacing its body
--   with a safe no-op that returns 0.
--
-- WHY DISABLED
-- ============
-- The function defined in migrations 052 and 120 has two pre-existing schema
-- bugs that would cause a runtime error on first execution:
--
--   1. closed_at = NOW()
--      Column does not exist. The actual column added in migration 002 is
--      auto_closed_at TIMESTAMPTZ. Any UPDATE referencing closed_at would fail
--      with: ERROR: column "closed_at" of relation "work_orders" does not exist.
--
--   2. closed_notes = '...'
--      Column does not exist. No equivalent column exists in work_orders as of
--      migration 002 through 125. Any UPDATE referencing closed_notes would
--      fail with: ERROR: column "closed_notes" of relation "work_orders" does
--      not exist.
--
-- Beyond the schema bugs, the function's second UPDATE block auto-closes work
-- orders with status IN ('in_progress', 'on_hold') after 2× auto_close_after_days
-- of inactivity. For Pilot v1 this is too aggressive: active execution-stage
-- work orders should not be silently closed by a background batch process
-- without explicit operational review.
--
-- NOTE: status = 'auto_closed' IS a valid value per the work_orders.status
-- CHECK constraint defined in migration 002. The comment in migration 120 that
-- said it was "not in constraint" was inaccurate. The status itself is safe to
-- use once the column names are corrected.
--
-- PILOT V1 BEHAVIOR
-- =================
-- Reporter closure remains manual via close_work_order RPC. A work order that
-- reaches pending_reporter_closure will stay there until the reporter closes it
-- or a manager/admin closes it. No background auto-close runs.
--
-- RE-ENABLE PATH (future migration, post-Pilot v1)
-- =================================================
-- Before re-enabling auto-close, a future migration must:
--   1. Fix closed_at  → auto_closed_at  (column exists since migration 002).
--   2. Remove closed_notes assignment (no such column; use reporter_notes if
--      desired, or omit the note entirely — auto_closed_at is the audit signal).
--   3. Decide which statuses are eligible for auto-close in production:
--      - pending_reporter_closure only (conservative), or
--      - also in_progress / on_hold (requires product decision and SLA policy).
--   4. Add create_operation_log() call per auto-closed work order for
--      operation audit trail.
--   5. Verify against staging with a fixture work order in
--      pending_reporter_closure state older than auto_close_after_days.
--   6. Only then schedule via pg_cron:
--      SELECT cron.schedule('auto-close-daily', '0 0 * * *',
--             'SELECT auto_close_stale_work_orders()');
-- =============================================================================

CREATE OR REPLACE FUNCTION public.auto_close_stale_work_orders()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Disabled for Pilot v1.
    -- Pre-existing schema bugs: references non-existent columns closed_at and
    -- closed_notes. Correct column is auto_closed_at; closed_notes has no
    -- equivalent. Additionally, auto-closing in_progress/on_hold orders is
    -- too aggressive for Pilot v1. Reporter closure remains manual via the
    -- close_work_order RPC. See migration 126 for the full re-enable path.
    RETURN 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.auto_close_stale_work_orders() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_close_stale_work_orders() FROM anon;

COMMENT ON FUNCTION public.auto_close_stale_work_orders() IS
    'Pilot v1: disabled no-op returning 0. Pre-existing schema bugs (closed_at '
    'and closed_notes columns do not exist) and aggressive in_progress/on_hold '
    'auto-close prevented safe use. Reporter closure is manual via close_work_order. '
    'See migration 126 for re-enable path. Added by migration 126.';
