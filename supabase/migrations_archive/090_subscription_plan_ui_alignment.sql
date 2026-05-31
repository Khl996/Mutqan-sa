-- ==============================================================================
-- Migration: 090_subscription_plan_ui_alignment.sql
-- Purpose: Align subscription_plans schema with current platform management UI
-- ==============================================================================

ALTER TABLE public.subscription_plans
ADD COLUMN IF NOT EXISTS is_popular BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS max_storage_mb INTEGER DEFAULT 1000;

UPDATE public.subscription_plans
SET is_popular = COALESCE(is_popular, FALSE),
    max_storage_mb = COALESCE(max_storage_mb, 1000);
