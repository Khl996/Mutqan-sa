-- 1. Create or replace the function to handle new user creation (FIXED JSON OPERATORS)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    -- FIXED: Use single arrow -> for 'data' to keep it as JSON object, then ->> for 'role'
    COALESCE(new.raw_user_meta_data->'data'->>'role', new.raw_user_meta_data->>'role', 'user')
  )
  ON CONFLICT (id) DO UPDATE
  SET 
    email = EXCLUDED.email,
    role = CASE 
      WHEN EXCLUDED.role != 'user' THEN EXCLUDED.role 
      ELSE profiles.role 
    END;
  RETURN new;
END;
$$;

-- 2. Re-create the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. BACKFILL SCRIPT (FIXED JSON OPERATORS)
INSERT INTO public.profiles (id, email, full_name, role)
SELECT 
  id, 
  email, 
  COALESCE(raw_user_meta_data->>'full_name', split_part(email, '@', 1)),
  -- FIXED: Use single arrow -> for 'data'
  COALESCE(raw_user_meta_data->'data'->>'role', raw_user_meta_data->>'role', 'user')
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles);
