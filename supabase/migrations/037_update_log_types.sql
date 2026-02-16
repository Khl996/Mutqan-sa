-- =====================================================
-- UPDATE OPERATION LOGS TYPES
-- =====================================================

-- Drop old constraint
ALTER TABLE operation_logs DROP CONSTRAINT IF EXISTS operation_logs_type_check;

-- Add new constraint with expanded types
ALTER TABLE operation_logs ADD CONSTRAINT operation_logs_type_check CHECK (
    type IN (
        -- Original types
        'maintenance', 'repair', 'inspection', 'emergency', 'routine', 
        'installation', 'calibration', 'other',
        
        -- New types for workflow
        'status_change', 
        'comment', 
        'assignment',
        'create',
        'update'
    )
);
