-- =============================================================================
-- Migration: 134_field_governance_wave2_decision_queue.sql
-- Purpose:
--   Phase 2 / Wave 2.5 Field Governance decision queue.
--
--   Non-destructive:
--     - Adds a security_invoker decision queue view.
--     - Keeps the queue as a filter over work_order_governance/governance_state.
--     - Replaces the existing RPC body with a SECURITY INVOKER wrapper over the
--       view so RLS remains active for all queue reads.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Role-scoped decision queue view. It stores no state and exposes only:
--      - standard rows in pending_approval
--      - emergency_override rows in post_action_complete
--    The security_invoker option is critical: RLS on work_order_governance,
--    work_orders, and profiles is evaluated as the caller.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.governance_decision_queue
WITH (security_invoker = true)
AS
SELECT
    g.id AS governance_id,
    g.tenant_id,
    g.work_order_id,
    w.code::TEXT AS work_order_code,
    w.title::TEXT AS work_order_title,
    g.route_type,
    g.governance_state,
    g.approval_tier,
    g.required_approver_role,
    g.approval_amount,
    g.approval_amount_source,
    g.severity_snapshot,
    g.asset_criticality_snapshot,
    g.approval_due_at,
    g.created_at
FROM public.work_order_governance g
JOIN public.work_orders w
  ON w.id = g.work_order_id
 AND w.tenant_id = g.tenant_id
WHERE (
        (
            g.route_type = 'standard'
            AND g.governance_state = 'pending_approval'
        )
        OR (
            g.route_type = 'emergency_override'
            AND g.governance_state = 'post_action_complete'
        )
    )
    AND EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE p.id = auth.uid()
       AND p.tenant_id = g.tenant_id
       AND COALESCE(p.is_active, TRUE) IS TRUE
       AND p.role = g.required_approver_role
);

COMMENT ON VIEW public.governance_decision_queue IS
    'Wave 2.5 role-scoped Field Governance decision queue. SECURITY INVOKER view; no duplicated queue state.';

REVOKE ALL PRIVILEGES ON TABLE public.governance_decision_queue FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.governance_decision_queue FROM PUBLIC;
GRANT SELECT ON TABLE public.governance_decision_queue TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. Preserve the existing RPC name/signature, but remove SECURITY DEFINER.
--    The function now reads from the security_invoker view, so RLS cannot be
--    bypassed through this RPC.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_governance_decision_queue()
RETURNS TABLE (
    governance_id UUID,
    work_order_id UUID,
    work_order_code TEXT,
    work_order_title TEXT,
    route_type TEXT,
    governance_state TEXT,
    approval_tier TEXT,
    required_approver_role TEXT,
    approval_amount NUMERIC,
    approval_amount_source TEXT,
    severity_snapshot TEXT,
    asset_criticality_snapshot TEXT,
    approval_due_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT
        q.governance_id,
        q.work_order_id,
        q.work_order_code,
        q.work_order_title,
        q.route_type,
        q.governance_state,
        q.approval_tier,
        q.required_approver_role,
        q.approval_amount,
        q.approval_amount_source,
        q.severity_snapshot,
        q.asset_criticality_snapshot,
        q.approval_due_at,
        q.created_at
      FROM public.governance_decision_queue q
     ORDER BY q.approval_due_at NULLS LAST, q.created_at ASC;
$$;

ALTER FUNCTION public.get_governance_decision_queue() SECURITY INVOKER;

REVOKE EXECUTE ON FUNCTION public.get_governance_decision_queue() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_governance_decision_queue() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_governance_decision_queue() TO authenticated;

COMMENT ON FUNCTION public.get_governance_decision_queue() IS
    'Wave 2.5 SECURITY INVOKER wrapper over governance_decision_queue. Queue reads are role-scoped and RLS-respecting.';
