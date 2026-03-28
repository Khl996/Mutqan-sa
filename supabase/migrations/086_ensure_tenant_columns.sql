-- ==============================================================================
-- Migration: 086_ensure_tenant_columns.sql
-- Purpose: Ensure subscription_tier and billing_cycle columns exist on tenants
--          These are required by provision_tenant and admin_update_subscription
-- ==============================================================================

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(50);
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(20);
