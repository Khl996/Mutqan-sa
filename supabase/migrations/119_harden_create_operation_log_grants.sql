-- =============================================================================
-- Migration: 119_harden_create_operation_log_grants.sql
-- Purpose:
--   create_operation_log is a SECURITY DEFINER helper used by authorized
--   workflow and intake RPCs. It should not be directly callable by ordinary
--   API roles, because direct execution could forge or pollute operation logs.
--
-- Notes:
--   The repository defines one signature in 036_fix_workflow_logs.sql:
--     public.create_operation_log(uuid, uuid, varchar, varchar, uuid, varchar)
--
--   Revoking direct execute from PUBLIC, anon, and authenticated does not
--   remove ownership privileges. SECURITY DEFINER workflow/public RPCs owned by
--   the function owner can continue to call this helper internally.
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.create_operation_log(
    uuid, uuid, varchar, varchar, uuid, varchar
) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.create_operation_log(
    uuid, uuid, varchar, varchar, uuid, varchar
) FROM anon;

REVOKE EXECUTE ON FUNCTION public.create_operation_log(
    uuid, uuid, varchar, varchar, uuid, varchar
) FROM authenticated;

COMMENT ON FUNCTION public.create_operation_log(
    uuid, uuid, varchar, varchar, uuid, varchar
) IS 'Internal operation log helper. Direct execute is revoked from PUBLIC, anon, and authenticated; authorized RPCs call it internally.';
