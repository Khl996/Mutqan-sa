
-- أ.2 — Explicit deny policies for custom_roles + user_custom_roles
-- These features are not active in Hospital-Lite. Explicit deny is clearer than implicit (0 policies).
-- Idempotent: DROP IF EXISTS before CREATE

DROP POLICY IF EXISTS custom_roles_deny_all       ON public.custom_roles;
DROP POLICY IF EXISTS user_custom_roles_deny_all  ON public.user_custom_roles;

-- Deny all access until custom_roles feature is implemented
CREATE POLICY custom_roles_deny_all ON public.custom_roles
    FOR ALL TO authenticated
    USING (false)
    WITH CHECK (false);

CREATE POLICY user_custom_roles_deny_all ON public.user_custom_roles
    FOR ALL TO authenticated
    USING (false)
    WITH CHECK (false);

