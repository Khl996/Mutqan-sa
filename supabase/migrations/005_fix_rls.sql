-- =====================================================
-- إصلاح سياسات RLS للملفات الشخصية
-- هذا السكربت يسمح للمستخدمين بالوصول لملفاتهم الشخصية
-- =====================================================

-- حذف السياسات القديمة إذا فشلت
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view tenant profiles" ON profiles;
DROP POLICY IF EXISTS "Super admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Tenant admins can update tenant profiles" ON profiles;

-- إنشاء سياسة بسيطة: المستخدم يمكنه رؤية وتعديل ملفه الشخصي
CREATE POLICY "Users can manage own profile"
  ON profiles
  FOR ALL
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- السماح للمستخدمين برؤية ملفات المستخدمين الآخرين في نفس المؤسسة
CREATE POLICY "Users can view profiles in same tenant"
  ON profiles
  FOR SELECT
  USING (
    tenant_id = public.get_user_tenant_id()
  );

-- رسالة تأكيد
DO $$
BEGIN
  RAISE NOTICE '✅ تم تحديث سياسات RLS للملفات الشخصية';
END $$;
