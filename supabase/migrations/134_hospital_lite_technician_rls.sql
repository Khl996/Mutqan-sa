-- =============================================================================
-- Migration: 134_hospital_lite_technician_rls.sql
-- Phase: Hospital Lite Mode — Phase 4 (Technician RLS + deep-link foundation)
--
-- Sections:
--   1. is_technician_role() — SECURITY DEFINER helper for RLS policies
--   2. RESTRICTIVE SELECT policy on work_orders for technician role
--
-- Security design:
--   • Non-technicians (admin, manager, engineer, supervisor): pass RESTRICTIVE
--     check immediately (NOT is_technician_role() = TRUE). No change to their
--     existing access.
--   • Technicians: RESTRICTIVE policy AND-s with existing permissive SELECT
--     policies. Net result: technician sees only orders where they are the
--     assigned technician, the reporter, or the creator.
--
-- Idempotency: CREATE OR REPLACE + DROP POLICY IF EXISTS + CREATE.
-- Backward-compat: existing UPDATE policy ("Users can update assigned work
--   orders") already restricts technicians to assigned/reported/created orders
--   for writes. This migration brings SELECT parity.
-- Guard: is_technician_role uses SET search_path = public (same pattern as
--   is_tenant_admin, can_manage_work_orders_scope) to avoid search_path
--   injection inside RLS policy evaluation.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1 — is_technician_role()
-- ─────────────────────────────────────────────────────────────────────────────
-- Returns TRUE if the calling auth.uid() has role = 'technician' in profiles.
-- SECURITY DEFINER: runs as the function owner (not the caller) — required for
--   safe profile lookup inside RLS policy context.
-- SET search_path = public: pins the schema so table references are unambiguous
--   and immune to search_path manipulation attacks (same pattern as all other
--   RLS helper functions in this codebase).
-- COALESCE(..., FALSE): handles null (no profile row or uid = null → FALSE).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_technician_role()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        (SELECT role = 'technician' FROM public.profiles WHERE id = auth.uid()),
        FALSE
    );
$$;

COMMENT ON FUNCTION public.is_technician_role() IS
    'Returns TRUE iff the current session user has role = ''technician'' in
    public.profiles. SECURITY DEFINER + SET search_path = public for safe RLS
    policy evaluation. Hospital Lite phase 4.';


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2 — RESTRICTIVE SELECT policy on work_orders
-- ─────────────────────────────────────────────────────────────────────────────
-- PostgreSQL RESTRICTIVE policies combine with AND (not OR) against all other
-- policies. This means:
--
--   For non-technicians: NOT is_technician_role() = TRUE → RESTRICTIVE passes.
--     The existing permissive policies then grant access as before.
--     ⇒ Zero change for admin, maintenance_manager, engineer, supervisor.
--
--   For technicians: NOT is_technician_role() = FALSE.
--     The RESTRICTIVE gate then requires assigned_to OR reported_by OR created_by.
--     The existing permissive policy also still applies (tenant-scoped).
--     ⇒ Technician sees ONLY their own orders. A technician guessing another
--       order's UUID gets empty data (no error, no data leakage).
--
-- This is the DB-level "Layer 1" required by the spec. Layer 2 (graceful UI)
-- is implemented in WorkOrderDetailsPage (existing wError / !workOrder branch
-- already shows a friendly "not found / no permission" screen).
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "work_orders_technician_restricted_select" ON public.work_orders;

CREATE POLICY "work_orders_technician_restricted_select"
ON public.work_orders
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
    -- Non-technicians: pass immediately (no restriction added)
    NOT public.is_technician_role()
    -- Technicians: must be assigned, or be the reporter/creator
    OR assigned_to = auth.uid()
    OR reported_by = auth.uid()
    OR created_by  = auth.uid()
);

COMMENT ON POLICY "work_orders_technician_restricted_select" ON public.work_orders IS
    'RESTRICTIVE: non-technician roles pass immediately (no change).
    Technicians see only orders where assigned_to / reported_by / created_by = uid.
    Combines AND with existing permissive tenant-scoped SELECT policies.
    Hospital Lite phase 4.';
