-- Fix the trigger to look for 'tenant_id' in both root metadata and nested 'data' object
-- This ensures the tenant_id is correctly captured when creating new admin users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, tenant_id)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->'data'->>'role', new.raw_user_meta_data->>'role', 'user'),
    -- FIXED: Check both nested 'data' AND root level for tenant_id
    COALESCE(
      (new.raw_user_meta_data->'data'->>'tenant_id'), 
      (new.raw_user_meta_data->>'tenant_id')
    )::uuid
  )
  ON CONFLICT (id) DO UPDATE
  SET 
    email = EXCLUDED.email,
    role = CASE WHEN EXCLUDED.role != 'user' THEN EXCLUDED.role ELSE profiles.role END,
    tenant_id = COALESCE(EXCLUDED.tenant_id, profiles.tenant_id);
  RETURN new;
END;
$$;
