-- Make sure only the "Free Trial" (تجربة مجانية) plan is default

-- 1. Reset all plans to not default
UPDATE subscription_plans SET is_default = FALSE;

-- 2. Set the plan with name containing 'تجربة' or 'Trial' to default
UPDATE subscription_plans 
SET is_default = TRUE, trial_days = 14
WHERE name_ar LIKE '%تجربة%' OR name LIKE '%Trial%' OR name_ar LIKE '%مجانية%' OR name LIKE '%Free%';

-- 3. If no plan matches, set the cheapest active one as default (fallback)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM subscription_plans WHERE is_default = TRUE) THEN
        UPDATE subscription_plans 
        SET is_default = TRUE 
        WHERE id = (SELECT id FROM subscription_plans WHERE is_active = TRUE ORDER BY price_monthly ASC LIMIT 1);
    END IF;
END $$;
