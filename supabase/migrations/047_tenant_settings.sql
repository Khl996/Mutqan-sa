-- =============================================
-- Add Tenant Settings Column
-- =============================================
-- This migration adds a flexible settings JSONB column to tenants table
-- Each tenant can customize their system behavior

-- Add settings column if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tenants' AND column_name = 'settings'
    ) THEN
        ALTER TABLE tenants ADD COLUMN settings JSONB DEFAULT '{}';
    END IF;
END $$;

-- Set default settings for existing tenants
UPDATE tenants 
SET settings = '{
    "work_orders": {
        "require_supervisor_approval": true,
        "require_engineer_review": true,
        "auto_close_after_days": 7,
        "allow_technician_reject": true,
        "max_response_time_hours": 24,
        "priority_escalation_enabled": true
    },
    "maintenance": {
        "auto_generate_work_orders": true,
        "advance_notice_days": 3,
        "allow_postpone": true
    },
    "inventory": {
        "low_stock_threshold_percent": 20,
        "require_approval_for_consumption": false,
        "track_consumption_by_technician": true
    },
    "notifications": {
        "notify_on_new_work_order": true,
        "notify_on_status_change": true,
        "notify_admins_on_escalation": true,
        "daily_summary_enabled": false
    },
    "display": {
        "default_language": "ar",
        "date_format": "DD/MM/YYYY",
        "time_format": "12h",
        "timezone": "Asia/Riyadh"
    },
    "portal": {
        "require_phone": false,
        "auto_assign_to_team": true,
        "show_estimated_time": false,
        "welcome_message": null,
        "thank_you_message": null
    }
}'::jsonb
WHERE settings IS NULL OR settings = '{}'::jsonb;

-- Index for faster settings queries
CREATE INDEX IF NOT EXISTS idx_tenants_settings ON tenants USING GIN (settings);

COMMENT ON COLUMN tenants.settings IS 'Flexible tenant-specific settings as JSONB for customization';
