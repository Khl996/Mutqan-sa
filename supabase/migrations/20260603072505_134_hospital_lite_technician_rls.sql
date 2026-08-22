-- Section 1: is_technician_role()
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

-- Section 2: RESTRICTIVE SELECT policy
DROP POLICY IF EXISTS "work_orders_technician_restricted_select" ON public.work_orders;

CREATE POLICY "work_orders_technician_restricted_select"
ON public.work_orders
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
    NOT public.is_technician_role()
    OR assigned_to = auth.uid()
    OR reported_by = auth.uid()
    OR created_by  = auth.uid()
);

COMMENT ON POLICY "work_orders_technician_restricted_select" ON public.work_orders IS
    'RESTRICTIVE: non-technician roles pass immediately (no change).
    Technicians see only orders where assigned_to / reported_by / created_by = uid.
    Combines AND with existing permissive tenant-scoped SELECT policies.
    Hospital Lite phase 4.';
