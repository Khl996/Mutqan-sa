-- Tighten privileges for the MVP 0 intake tables after initial creation.
-- RLS was already enabled by the foundation migration; this removes inherited
-- table access and leaves application writes behind RPC boundaries.

REVOKE ALL ON public.intake_reports FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.intake_messages FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.work_order_drafts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.operational_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.notification_logs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.intake_report_number_seq FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.intake_reports TO authenticated;
GRANT SELECT ON public.intake_messages TO authenticated;
GRANT SELECT ON public.work_order_drafts TO authenticated;
GRANT SELECT ON public.operational_events TO authenticated;
GRANT SELECT ON public.notification_logs TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.intake_reports TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intake_messages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_order_drafts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operational_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_logs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.intake_report_number_seq TO service_role;
