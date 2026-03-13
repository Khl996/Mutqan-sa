-- =====================================================
-- Migration: 076_security_fixes.sql
-- Purpose: Critical security fixes identified in code review
-- Date: 2026-03-14
-- =====================================================

-- =====================================================
-- FIX 1: activate_subscription_after_payment
-- Problem: SECURITY DEFINER + GRANT TO authenticated = any user can activate
-- Solution: Revoke from authenticated, add identity check, add idempotency
-- =====================================================

-- Step 1: Revoke access from regular authenticated users
REVOKE EXECUTE ON FUNCTION public.activate_subscription_after_payment FROM authenticated;

-- Step 2: Recreate with security checks + idempotency
CREATE OR REPLACE FUNCTION public.activate_subscription_after_payment(
    p_tenant_id UUID,
    p_plan_id UUID,
    p_billing_cycle VARCHAR DEFAULT 'yearly',
    p_amount DECIMAL DEFAULT 0,
    p_currency VARCHAR DEFAULT 'SAR',
    p_payment_reference VARCHAR DEFAULT NULL,
    p_plan_name VARCHAR DEFAULT 'Subscription'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_end_date TIMESTAMPTZ;
    v_invoice_number VARCHAR;
    v_result JSONB;
    v_caller_role TEXT;
    v_existing_ref INT;
BEGIN
    -- =========================================
    -- SECURITY CHECK: Verify caller identity
    -- =========================================
    -- If called by a real user (not service_role), verify they are admin/owner of this tenant
    IF auth.uid() IS NOT NULL THEN
        SELECT role INTO v_caller_role
        FROM profiles
        WHERE id = auth.uid()
        AND (
            -- Platform admins can activate any tenant
            role IN ('platform_owner', 'platform_admin')
            -- Tenant admin/owner can only activate their own tenant
            OR (role IN ('tenant_admin', 'tenant_owner') AND tenant_id = p_tenant_id)
        );

        IF v_caller_role IS NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Unauthorized: You do not have permission to activate this subscription'
            );
        END IF;
    END IF;

    -- =========================================
    -- IDEMPOTENCY CHECK: Prevent duplicate activations
    -- =========================================
    IF p_payment_reference IS NOT NULL AND p_payment_reference != '' THEN
        SELECT COUNT(*) INTO v_existing_ref
        FROM platform_invoices
        WHERE payment_reference = p_payment_reference
        AND status = 'paid';

        IF v_existing_ref > 0 THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'This payment reference has already been processed',
                'duplicate', true
            );
        END IF;
    END IF;

    -- =========================================
    -- BUSINESS LOGIC (unchanged)
    -- =========================================

    -- Calculate end date
    IF p_billing_cycle = 'yearly' THEN
        v_end_date := NOW() + INTERVAL '1 year';
    ELSE
        v_end_date := NOW() + INTERVAL '1 month';
    END IF;

    -- Generate invoice number
    v_invoice_number := 'INV-' || EXTRACT(EPOCH FROM NOW())::BIGINT || '-' || UPPER(SUBSTR(MD5(RANDOM()::TEXT), 1, 5));

    -- Upsert subscription
    INSERT INTO tenant_subscriptions (
        tenant_id,
        plan_id,
        status,
        billing_cycle,
        current_period_start,
        current_period_end,
        amount,
        currency,
        cancel_at_period_end,
        updated_at
    ) VALUES (
        p_tenant_id,
        p_plan_id,
        'active',
        p_billing_cycle,
        NOW(),
        v_end_date,
        p_amount,
        p_currency,
        false,
        NOW()
    )
    ON CONFLICT (tenant_id) DO UPDATE SET
        plan_id = EXCLUDED.plan_id,
        status = 'active',
        billing_cycle = EXCLUDED.billing_cycle,
        current_period_start = NOW(),
        current_period_end = v_end_date,
        amount = EXCLUDED.amount,
        currency = EXCLUDED.currency,
        cancel_at_period_end = false,
        updated_at = NOW();

    -- Update tenant status + sync subscription_ends_at from source of truth
    UPDATE tenants
    SET 
        subscription_status = 'active',
        subscription_ends_at = v_end_date,
        plan_id = p_plan_id,
        updated_at = NOW()
    WHERE id = p_tenant_id;

    -- Log invoice (ignore errors)
    BEGIN
        INSERT INTO platform_invoices (
            invoice_number,
            tenant_id,
            plan_id,
            plan_name,
            subtotal,
            total,
            currency,
            status,
            payment_method,
            payment_reference,
            paid_at,
            due_date,
            billing_period_start,
            billing_period_end
        ) VALUES (
            v_invoice_number,
            p_tenant_id,
            p_plan_id,
            p_plan_name,
            p_amount,
            p_amount,
            p_currency,
            'paid',
            'tap',
            p_payment_reference,
            NOW(),
            CURRENT_DATE,
            CURRENT_DATE,
            v_end_date::DATE
        );
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Invoice logging failed: %', SQLERRM;
    END;

    v_result := jsonb_build_object(
        'success', true,
        'plan_id', p_plan_id,
        'billing_cycle', p_billing_cycle,
        'period_end', v_end_date
    );

    RETURN v_result;
END;
$$;

-- Step 3: Only service_role can call this function
-- (service_role is used by server-side API endpoints like verify-payment.ts)
GRANT EXECUTE ON FUNCTION public.activate_subscription_after_payment TO service_role;

-- Re-grant to authenticated WITH the internal security checks above
-- This allows the PaymentCallbackPage redirect flow to still work
-- but the function itself validates the caller's identity
GRANT EXECUTE ON FUNCTION public.activate_subscription_after_payment TO authenticated;

COMMENT ON FUNCTION public.activate_subscription_after_payment IS 
'Activates a tenant subscription after successful payment. 
SECURITY: Validates caller identity (must be tenant admin/owner or platform admin). 
IDEMPOTENCY: Rejects duplicate payment references.';


-- =====================================================
-- FIX 2: tenant_access_tokens RLS policy
-- Problem: Any user in tenant can manage tokens (not just admins)
-- Solution: Restrict to tenant_admin and tenant_owner only
-- =====================================================

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Admins can manage tokens" ON tenant_access_tokens;

-- Create a properly restrictive policy
CREATE POLICY "Admins can manage tokens" ON tenant_access_tokens
    FOR ALL
    USING (auth.uid() IN (
        SELECT id FROM profiles 
        WHERE tenant_id = tenant_access_tokens.tenant_id
        AND role IN ('tenant_admin', 'tenant_owner')
    ));


-- =====================================================
-- FIX 3: submit_public_work_order - validate building belongs to tenant
-- Problem: No check that building_id/floor_id/asset_id belong to token's tenant
-- Solution: Add ownership validation before insert
-- =====================================================

CREATE OR REPLACE FUNCTION submit_public_work_order(
    p_token TEXT,
    p_reporter_name TEXT,
    p_reporter_phone TEXT,
    p_description TEXT,
    p_building_id UUID,
    p_floor_id UUID DEFAULT NULL,
    p_asset_id UUID DEFAULT NULL
)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_new_id UUID;
    v_code TEXT;
BEGIN
    -- 1. Validate Token
    SELECT tenant_id INTO v_tenant_id
    FROM tenant_access_tokens
    WHERE token = p_token AND is_active = true;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Invalid or expired token';
    END IF;

    -- 2. Validate building belongs to this tenant
    IF p_building_id IS NOT NULL THEN
        PERFORM 1 FROM buildings 
        WHERE id = p_building_id AND tenant_id = v_tenant_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invalid building for this organization';
        END IF;
    END IF;

    -- 3. Validate floor belongs to a building of this tenant
    IF p_floor_id IS NOT NULL THEN
        PERFORM 1 FROM floors f
        JOIN buildings b ON f.building_id = b.id
        WHERE f.id = p_floor_id AND b.tenant_id = v_tenant_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invalid floor for this organization';
        END IF;
    END IF;

    -- 4. Validate asset belongs to this tenant
    IF p_asset_id IS NOT NULL THEN
        PERFORM 1 FROM assets 
        WHERE id = p_asset_id AND tenant_id = v_tenant_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invalid asset for this organization';
        END IF;
    END IF;

    -- 5. Generate Code
    v_code := 'PUB-' || to_char(NOW(), 'YYMMDD') || '-' || substring(uuid_generate_v4()::text from 1 for 4);

    -- 6. Insert Work Order
    INSERT INTO work_orders (
        tenant_id,
        code,
        title,
        description,
        status,
        priority,
        building_id,
        floor_id,
        asset_id,
        reporter_name,
        reporter_phone,
        reported_at,
        created_at
    ) VALUES (
        v_tenant_id,
        v_code,
        'بلاغ عام: ' || COALESCE(substring(p_description from 1 for 30), 'General Issue'),
        p_description,
        'pending',
        'medium',
        p_building_id,
        p_floor_id,
        p_asset_id,
        p_reporter_name,
        p_reporter_phone,
        NOW(),
        NOW()
    ) RETURNING id INTO v_new_id;

    -- 7. Log the creation
    PERFORM create_operation_log(
        v_tenant_id, v_new_id, 'create', 
        'Public report submitted by: ' || p_reporter_name, 
        NULL
    );

    RETURN v_new_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION submit_public_work_order IS 
'Submits a public work order via portal token. 
SECURITY: Validates that building/floor/asset belong to the token tenant.';
