-- =====================================================
-- Migration: 007_fix_user_role.sql
-- Purpose: Historical placeholder kept intentionally empty for production-safe replay
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '007_fix_user_role.sql skipped: hardcoded role escalation was removed.';
END $$;
