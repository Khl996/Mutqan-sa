ALTER VIEW public.pm_work_order_history SET (security_invoker = true);

DROP FUNCTION IF EXISTS public.register_tenant(text, text, text, text, text, text);
