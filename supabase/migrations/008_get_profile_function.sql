-- دالة لجلب الملف الشخصي بدون abort signal
CREATE OR REPLACE FUNCTION get_my_profile()
RETURNS SETOF profiles
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- منح صلاحية التنفيذ
GRANT EXECUTE ON FUNCTION get_my_profile() TO authenticated;

DO $$
BEGIN
  RAISE NOTICE '✅ تم إنشاء دالة get_my_profile';
END $$;
