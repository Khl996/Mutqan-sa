-- Phase 7 أ.2 — Explicit deny policies for custom_roles and user_custom_roles
-- These tables had no RLS; add explicit USING(false) to block all direct access
-- (workflows go through SECURITY DEFINER RPCs only).

ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_custom_roles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'custom_roles' AND policyname = 'custom_roles_deny_all'
  ) THEN
    CREATE POLICY custom_roles_deny_all ON public.custom_roles
      FOR ALL TO authenticated
      USING (false);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_custom_roles' AND policyname = 'user_custom_roles_deny_all'
  ) THEN
    CREATE POLICY user_custom_roles_deny_all ON public.user_custom_roles
      FOR ALL TO authenticated
      USING (false);
  END IF;
END $$;
