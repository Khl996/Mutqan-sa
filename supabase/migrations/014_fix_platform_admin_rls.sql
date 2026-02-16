-- =====================================================
-- إصلاح RLS لمدراء المنصة (بدون tenant_id)
-- Platform admins should work without tenant_id
-- =====================================================

-- تحديث دالة التحقق من super admin لتشمل platform roles
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    SELECT (is_super_admin = TRUE OR role IN ('platform_owner', 'platform_admin'))
    FROM profiles 
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- تحديث دالة get_my_profile لتعمل بشكل أفضل
CREATE OR REPLACE FUNCTION get_my_profile()
RETURNS SETOF profiles
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- إضافة policy جديد لمدراء المنصة بدون tenant_id
DROP POLICY IF EXISTS "Platform admins can view own profile" ON profiles;
CREATE POLICY "Platform admins can view own profile"
  ON profiles FOR SELECT
  USING (
    id = auth.uid() AND 
    (role IN ('platform_owner', 'platform_admin', 'platform_support') OR is_super_admin = TRUE)
  );

-- تحقق من أن المستخدم لديه profile صحيح
DO $$
DECLARE
    v_count INT;
BEGIN
    -- Check if profile exists
    SELECT COUNT(*) INTO v_count 
    FROM profiles 
    WHERE id = '048af4a6-0f48-416a-b4f3-c03b98b81757';
    
    IF v_count = 0 THEN
        RAISE NOTICE '⚠️ Profile does not exist! Creating...';
        INSERT INTO profiles (id, email, role, is_super_admin, is_active)
        VALUES (
            '048af4a6-0f48-416a-b4f3-c03b98b81757',
            'khalid.a.kh990@gmail.com',
            'platform_admin',
            TRUE,
            TRUE
        );
    ELSE
        RAISE NOTICE '✅ Profile exists, updating role...';
        UPDATE profiles 
        SET 
            tenant_id = NULL,
            role = 'platform_admin',
            is_super_admin = TRUE
        WHERE id = '048af4a6-0f48-416a-b4f3-c03b98b81757';
    END IF;
    
    RAISE NOTICE '✅ Platform admin profile configured';
END $$;

-- تأكيد النتيجة
SELECT id, email, role, tenant_id, is_super_admin, is_active 
FROM profiles 
WHERE id = '048af4a6-0f48-416a-b4f3-c03b98b81757';
