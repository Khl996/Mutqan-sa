-- Migration: 058_fix_subscription_plans_rls.sql
-- Purpose: Add missing RLS policies for managing subscription plans

-- Enable managing plans for platform admins
CREATE POLICY "Platform admins can insert plans" ON public.subscription_plans
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role IN ('platform_owner', 'platform_admin')
    ));

CREATE POLICY "Platform admins can update plans" ON public.subscription_plans
    FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role IN ('platform_owner', 'platform_admin')
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role IN ('platform_owner', 'platform_admin')
    ));

CREATE POLICY "Platform admins can delete plans" ON public.subscription_plans
    FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role IN ('platform_owner', 'platform_admin')
    ));
