-- 1. Drop the restrictive constraint
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- 2. Add a flexible constraint that allows 'user' and other standard roles
-- This ensures that simple users can be created without error
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check 
  CHECK (
    role IN ('user', 'tenant_admin', 'tenant_staff') 
    OR role LIKE 'platform_%'
  );

-- 3. Now run the backfill script again
INSERT INTO public.profiles (id, email, full_name, role)
SELECT 
  id, 
  email, 
  COALESCE(raw_user_meta_data->>'full_name', split_part(email, '@', 1)),
  COALESCE(raw_user_meta_data->'data'->>'role', raw_user_meta_data->>'role', 'user')
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles);
