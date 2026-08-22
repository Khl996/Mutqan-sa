DO $$
DECLARE
    v_tenant_id UUID := '45976ac0-f766-43e9-b4e8-c72287a84c78'; -- The Tenant ID you provided
    v_plan_id UUID;
    v_trial_days INTEGER;
    v_price DECIMAL(10, 2);
    v_currency VARCHAR(3);
BEGIN
    -- 1. Get the Default/Free Plan
    SELECT id, trial_days, price_monthly, currency 
    INTO v_plan_id, v_trial_days, v_price, v_currency
    FROM subscription_plans 
    WHERE is_default = true 
    LIMIT 1;

    -- Fallback if no default plan found
    IF v_plan_id IS NULL THEN
        SELECT id, trial_days, price_monthly, currency 
        INTO v_plan_id, v_trial_days, v_price, v_currency
        FROM subscription_plans 
        WHERE price_monthly = 0 OR is_active = true
        ORDER BY price_monthly ASC 
        LIMIT 1;
    END IF;

    IF v_trial_days IS NULL THEN v_trial_days := 14; END IF;

    -- 2. Create/Update Subscription Record
    INSERT INTO tenant_subscriptions (
        tenant_id,
        plan_id,
        status,
        billing_cycle,
        current_period_start,
        current_period_end,
        trial_ends_at,
        amount,
        currency
    ) VALUES (
        v_tenant_id,
        v_plan_id,
        'trial',
        'monthly',
        NOW(),
        NOW() + (v_trial_days || ' days')::INTERVAL,
        NOW() + (v_trial_days || ' days')::INTERVAL,
        v_price,
        v_currency
    )
    ON CONFLICT (tenant_id) DO UPDATE SET
        plan_id = EXCLUDED.plan_id,
        status = 'trial',
        current_period_start = NOW(),
        current_period_end = NOW() + (v_trial_days || ' days')::INTERVAL,
        trial_ends_at = NOW() + (v_trial_days || ' days')::INTERVAL;

    -- 3. Update Tenant Record
    UPDATE tenants
    SET 
        subscription_plan_id = v_plan_id,
        subscription_status = 'trial',
        trial_ends_at = NOW() + (v_trial_days || ' days')::INTERVAL,
        subscription_starts_at = NOW()
    WHERE id = v_tenant_id;

    RAISE NOTICE 'Tenant % subscribed to plan % successfully.', v_tenant_id, v_plan_id;
END $$;
