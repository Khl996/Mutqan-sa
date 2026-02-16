-- =====================================================
-- تحديث صلاحية المستخدم إلى Platform Admin
-- هذا لتمكين الوصول إلى واجهة إدارة المنصة
-- =====================================================

-- تحديث أي مستخدم موجود ليصبح platform_admin
UPDATE profiles 
SET 
    role = 'platform_admin',
    is_super_admin = TRUE
WHERE email IS NOT NULL
  AND role NOT IN ('platform_owner', 'platform_admin');

-- أو أضف مستخدم جديد إذا لم يكن موجوداً
-- هذا يتطلب أن يكون المستخدم في auth.users أولاً

-- للتحقق من النتيجة
DO $$
DECLARE
    v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count 
    FROM profiles 
    WHERE role IN ('platform_owner', 'platform_admin');
    
    RAISE NOTICE '✅ عدد مستخدمي المنصة: %', v_count;
END $$;
