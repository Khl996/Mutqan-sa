-- Migration 096: Add recurrence, checklist, and completion_notes to maintenance_tasks

ALTER TABLE maintenance_tasks
    ADD COLUMN IF NOT EXISTS recurrence_type    text    NOT NULL DEFAULT 'once',
    ADD COLUMN IF NOT EXISTS recurrence_interval integer NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS checklist          jsonb   NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS completion_notes   text;

-- Validate recurrence_type values
ALTER TABLE maintenance_tasks
    DROP CONSTRAINT IF EXISTS maintenance_tasks_recurrence_type_check;

ALTER TABLE maintenance_tasks
    ADD CONSTRAINT maintenance_tasks_recurrence_type_check
    CHECK (recurrence_type IN ('once', 'daily', 'weekly', 'monthly', 'custom'));

-- recurrence_interval must be positive
ALTER TABLE maintenance_tasks
    DROP CONSTRAINT IF EXISTS maintenance_tasks_recurrence_interval_check;

ALTER TABLE maintenance_tasks
    ADD CONSTRAINT maintenance_tasks_recurrence_interval_check
    CHECK (recurrence_interval >= 1);

COMMENT ON COLUMN maintenance_tasks.recurrence_type IS
    'Repeat cadence: once | daily | weekly | monthly | custom (uses recurrence_interval)';
COMMENT ON COLUMN maintenance_tasks.recurrence_interval IS
    'Interval in days for custom recurrence type (ignored for other types)';
COMMENT ON COLUMN maintenance_tasks.checklist IS
    'JSON array of checklist steps: [{id: uuid, text: string, text_ar: string, checked: boolean}]';
COMMENT ON COLUMN maintenance_tasks.completion_notes IS
    'Free-text notes entered by the technician when marking the task as completed';
