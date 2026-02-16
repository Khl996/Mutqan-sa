-- ==============================================================================
-- 061_add_features_to_plans.sql
-- Enable controlling modules via subscription plans
-- ==============================================================================

-- 1. Add 'features' column to subscription_plans to store allowed modules
ALTER TABLE subscription_plans 
ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '[]'::jsonb;

-- 2. Function to Sync Tenant Modules when Plan Changes
CREATE OR REPLACE FUNCTION sync_tenant_modules_from_plan()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_plan_features JSONB;
    v_new_modules JSONB;
    v_module TEXT;
    v_default_modules JSONB;
BEGIN
    -- Only proceed if subscription_plan_id has changed
    IF OLD.subscription_plan_id IS NOT DISTINCT FROM NEW.subscription_plan_id THEN
        RETURN NEW;
    END IF;

    -- Get features from the new plan
    SELECT features INTO v_plan_features
    FROM subscription_plans
    WHERE id = NEW.subscription_plan_id;

    -- If no plan or no features, do nothing (or set defaults)
    IF v_plan_features IS NULL OR jsonb_array_length(v_plan_features) = 0 THEN
        RETURN NEW;
    END IF;

    -- Construct new enabled_modules JSONB
    -- We start with an empty object
    v_new_modules := '{}'::jsonb;

    -- Iterate through the plan features (which are module codes like 'assets', 'work_orders')
    FOR v_module IN SELECT jsonb_array_elements_text(v_plan_features)
    LOOP
        -- Enable the module with default features enabled
        -- Structure: "code": { "enabled": true, "features": {} }
        -- We assume all sub-features are enabled by default if the module is enabled via plan
        -- In a more complex system, we might want to control sub-features too
        v_new_modules := jsonb_set(
            v_new_modules, 
            ARRAY[v_module], 
            jsonb_build_object('enabled', true, 'features', '{}'::jsonb)
        );
    END LOOP;

    -- Always ensure CORE modules are enabled (dashboard, etc.)
    -- This is a safeguard. In app logic dashboard is usually hardcoded as enabled.
    v_new_modules := jsonb_set(v_new_modules, '{dashboard}', jsonb_build_object('enabled', true, 'features', '{}'::jsonb));
    v_new_modules := jsonb_set(v_new_modules, '{employees}', jsonb_build_object('enabled', true, 'features', '{}'::jsonb));
    

    -- Update the tenant's allowed modules
    NEW.enabled_modules := v_new_modules;

    RETURN NEW;
END;
$$;

-- 3. Trigger on Tenants Table
DROP TRIGGER IF EXISTS on_tenant_plan_change ON tenants;

CREATE TRIGGER on_tenant_plan_change
BEFORE UPDATE ON tenants
FOR EACH ROW
EXECUTE FUNCTION sync_tenant_modules_from_plan();
