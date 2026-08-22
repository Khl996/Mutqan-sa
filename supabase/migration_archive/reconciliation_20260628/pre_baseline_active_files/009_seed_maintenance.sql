-- =====================================================
-- Seed Data for Maintenance Module Testing
-- =====================================================

DO $$
DECLARE
    tenant_id UUID := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'; -- Demo Tenant
    building_id UUID;
    hvac_cat UUID;
    elec_cat UUID;
BEGIN
    -- Get a building
    SELECT id INTO building_id FROM buildings WHERE tenant_id = tenant_id LIMIT 1;

    -- Get/Create Categories
    SELECT id INTO hvac_cat FROM asset_categories WHERE code = 'CAT-HVAC' AND tenant_id = tenant_id;
    IF hvac_cat IS NULL THEN
        INSERT INTO asset_categories (tenant_id, code, name, name_ar, icon, color)
        VALUES (tenant_id, 'CAT-HVAC', 'HVAC Systems', 'أنظمة التكييف', 'wind', '#10B981')
        RETURNING id INTO hvac_cat;
    END IF;

    SELECT id INTO elec_cat FROM asset_categories WHERE code = 'CAT-ELEC' AND tenant_id = tenant_id;
    IF elec_cat IS NULL THEN
        INSERT INTO asset_categories (tenant_id, code, name, name_ar, icon, color)
        VALUES (tenant_id, 'CAT-ELEC', 'Electrical Systems', 'الأنظمة الكهربائية', 'zap', '#F59E0B')
        RETURNING id INTO elec_cat;
    END IF;

    -- 1. Create/Update HVAC Unit (Upcoming Maintenance)
    INSERT INTO assets (
        tenant_id, code, name, name_ar, description, 
        category_id, building_id, status, criticality,
        next_maintenance_date, maintenance_frequency_days,
        model, manufacturer
    ) VALUES (
        tenant_id, 'HVAC-MAINT-01', 'Main Chiller Unit', 'وحدة التبريد الرئيسية', 'Main chiller unit for building A - Requires monthly check',
        hvac_cat, building_id, 'operational', 'high',
        (CURRENT_DATE + INTERVAL '2 days'), 30, -- In 2 days
        'CH-2000', 'Carrier'
    ) ON CONFLICT (tenant_id, code) DO UPDATE SET
        next_maintenance_date = (CURRENT_DATE + INTERVAL '2 days'),
        maintenance_frequency_days = 30;

    -- 2. Create/Update Generator (Overdue Maintenance)
    INSERT INTO assets (
        tenant_id, code, name, name_ar, description, 
        category_id, building_id, status, criticality,
        next_maintenance_date, maintenance_frequency_days,
        model, manufacturer
    ) VALUES (
        tenant_id, 'ELEC-MAINT-01', 'Backup Generator', 'مولد احتياطي', 'Diesel generator for emergency power',
        elec_cat, building_id, 'operational', 'critical',
        (CURRENT_DATE - INTERVAL '5 days'), 90, -- Overdue by 5 days
        'GEN-500', 'CAT'
    ) ON CONFLICT (tenant_id, code) DO UPDATE SET
        next_maintenance_date = (CURRENT_DATE - INTERVAL '5 days'),
        maintenance_frequency_days = 90;

    -- 3. Create/Update Pump (Far Future Maintenance)
    INSERT INTO assets (
        tenant_id, code, name, name_ar, description, 
        category_id, building_id, status, criticality,
        next_maintenance_date, maintenance_frequency_days,
        model, manufacturer
    ) VALUES (
        tenant_id, 'PUMP-MAINT-01', 'Water Pump A', 'مضخة مياه أ', 'Main water supply pump',
        hvac_cat, building_id, 'operational', 'medium',
        (CURRENT_DATE + INTERVAL '45 days'), 180, -- Far future
        'WP-100', 'Grundfos'
    ) ON CONFLICT (tenant_id, code) DO UPDATE SET
        next_maintenance_date = (CURRENT_DATE + INTERVAL '45 days'),
        maintenance_frequency_days = 180;

    RAISE NOTICE 'Maintenance seed data created successfully';
END $$;
