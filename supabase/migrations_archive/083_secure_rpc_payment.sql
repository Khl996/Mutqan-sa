-- =====================================================
-- Migration: 083_secure_rpc_payment.sql
-- Description: Revoke public access to payment RPC
-- =====================================================

-- 1. Security Fix: Prevent unauthorized activation
-- The activate_subscription_after_payment function should only be executed
-- by the service_role (via Vercel backend during a webhook/callback), NOT by any anonymous or authenticated users.
REVOKE EXECUTE ON FUNCTION public.activate_subscription_after_payment(UUID, UUID, VARCHAR, DECIMAL, VARCHAR, VARCHAR, VARCHAR) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.activate_subscription_after_payment(UUID, UUID, VARCHAR, DECIMAL, VARCHAR, VARCHAR, VARCHAR) FROM anon;
REVOKE EXECUTE ON FUNCTION public.activate_subscription_after_payment(UUID, UUID, VARCHAR, DECIMAL, VARCHAR, VARCHAR, VARCHAR) FROM authenticated;

-- Ensure ONLY the service_role can execute this function safely to prevent hackers from artificially activating plans
GRANT EXECUTE ON FUNCTION public.activate_subscription_after_payment(UUID, UUID, VARCHAR, DECIMAL, VARCHAR, VARCHAR, VARCHAR) TO service_role;

-- 2. Make subscription plans readable to anon users globally
-- Since subscription plans are public products, we don't need to obscure them from logged-out users.
DROP POLICY IF EXISTS "Plans are viewable by authenticated users" ON public.subscription_plans;
DROP POLICY IF EXISTS "Plans are viewable by everyone" ON public.subscription_plans;

CREATE POLICY "Plans are viewable by everyone" ON public.subscription_plans 
FOR SELECT USING (true);
