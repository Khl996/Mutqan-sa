-- =====================================================
-- إصلاح شامل لسياسات RLS
-- =====================================================

-- 1. حذف جميع السياسات القديمة من جدول profiles
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view tenant profiles" ON profiles;
DROP POLICY IF EXISTS "Super admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Tenant admins can update tenant profiles" ON profiles;
DROP POLICY IF EXISTS "Users can manage own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view profiles in same tenant" ON profiles;

-- 2. تعطيل RLS مؤقتاً على profiles للتأكد من أن المشكلة في السياسات
-- ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- 3. إنشاء سياسة بسيطة جداً - السماح للمستخدم برؤية ملفه فقط
CREATE POLICY "Allow users to read own profile"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- 4. السماح للمستخدم بتحديث ملفه
CREATE POLICY "Allow users to update own profile"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- 5. السماح بإدراج الملف (للتسجيل الجديد)
CREATE POLICY "Allow insert profile on signup"
  ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- تأكيد
DO $$
BEGIN
  RAISE NOTICE '✅ تم إعادة إنشاء سياسات RLS البسيطة';
END $$;
