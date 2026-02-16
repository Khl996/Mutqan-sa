-- =====================================================
-- إنشاء مؤسسة وملف شخصي للمستخدم
-- User UID: 048af4a6-0f48-416a-b4f3-c03b98b81757
-- =====================================================

-- الخطوة 1: إنشاء المؤسسة
INSERT INTO tenants (
  id,
  name,
  name_ar,
  slug,
  subscription_status,
  max_users,
  max_assets,
  max_work_orders_per_month,
  max_storage_mb,
  primary_color,
  secondary_color,
  email,
  timezone,
  language,
  enabled_modules
) VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'Mutqan Demo Organization',
  'مؤسسة متقن التجريبية',
  'mutqan-demo',
  'active',
  100,
  1000,
  500,
  5000,
  '#2E3A45',
  '#3AAFA9',
  'demo@mutqan.com',
  'Asia/Riyadh',
  'ar',
  '{"dashboard": true, "facilities": true, "assets": true, "work_orders": true, "maintenance": true, "inventory": true, "teams": true, "reports": true}'
);

-- الخطوة 2: إنشاء الملف الشخصي للمستخدم
INSERT INTO profiles (
  id,
  tenant_id,
  full_name,
  full_name_ar,
  email,
  role,
  is_super_admin,
  is_active,
  language,
  timezone
) VALUES (
  '048af4a6-0f48-416a-b4f3-c03b98b81757',
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'Platform Owner',
  'مالك المنصة',
  (SELECT email FROM auth.users WHERE id = '048af4a6-0f48-416a-b4f3-c03b98b81757'),
  'platform_owner',
  TRUE,
  TRUE,
  'ar',
  'Asia/Riyadh'
);

-- الخطوة 3: إنشاء بعض المباني الاختبارية
INSERT INTO buildings (tenant_id, code, name, name_ar, description, is_active)
VALUES 
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'BLD-001', 'Main Building', 'المبنى الرئيسي', 'المبنى الرئيسي للمؤسسة', TRUE),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'BLD-002', 'Emergency Building', 'مبنى الطوارئ', 'مبنى قسم الطوارئ', TRUE),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'BLD-003', 'Administration', 'مبنى الإدارة', 'مبنى الإدارة والمكاتب', TRUE);

-- الخطوة 4: إنشاء بعض الأدوار
INSERT INTO floors (building_id, code, name, name_ar, level, is_active)
SELECT 
  b.id,
  'FLR-' || b.code || '-' || f.level,
  'Floor ' || f.level,
  'الدور ' || f.level,
  f.level,
  TRUE
FROM buildings b
CROSS JOIN (VALUES (0), (1), (2)) AS f(level)
WHERE b.tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

-- الخطوة 5: إنشاء فريق صيانة
INSERT INTO teams (tenant_id, code, name, name_ar, type, status, specializations)
VALUES 
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'TEAM-001', 'Maintenance Team A', 'فريق الصيانة أ', 'maintenance', 'active', ARRAY['electrical', 'mechanical']),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'TEAM-002', 'HVAC Team', 'فريق التكييف', 'maintenance', 'active', ARRAY['hvac']);

-- رسالة نجاح
DO $$
BEGIN
  RAISE NOTICE '✅ تم إنشاء البيانات بنجاح!';
  RAISE NOTICE '📌 Tenant ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  RAISE NOTICE '👤 User ID: 048af4a6-0f48-416a-b4f3-c03b98b81757';
  RAISE NOTICE '🏢 تم إنشاء 3 مباني و 9 أدوار و 2 فرق';
END $$;
