-- =====================================================
-- التحقق من بيانات المستخدم وتصحيح الدور
-- User UID: 048af4a6-0f48-416a-b4f3-c03b98b81757
-- =====================================================

-- 1. عرض بيانات المستخدم الحالية
SELECT 
  id,
  tenant_id,
  full_name,
  full_name_ar,
  email,
  role,
  is_super_admin,
  is_active
FROM profiles 
WHERE id = '048af4a6-0f48-416a-b4f3-c03b98b81757';

-- 2. تحديث الدور إلى platform_owner والاسم
UPDATE profiles
SET 
  role = 'platform_owner',
  full_name = 'Khalid',
  full_name_ar = 'خالد',
  is_super_admin = TRUE
WHERE id = '048af4a6-0f48-416a-b4f3-c03b98b81757';

-- 3. التحقق من التحديث
SELECT 
  id,
  tenant_id,
  full_name,
  full_name_ar,
  email,
  role,
  is_super_admin,
  is_active
FROM profiles 
WHERE id = '048af4a6-0f48-416a-b4f3-c03b98b81757';

-- رسالة تأكيد
DO $$
BEGIN
  RAISE NOTICE '✅ تم تحديث الدور إلى platform_owner والاسم إلى خالد';
END $$;
