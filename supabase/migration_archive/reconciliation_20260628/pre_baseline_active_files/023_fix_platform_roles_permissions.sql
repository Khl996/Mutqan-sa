-- 1. Unrestrict updates on profiles for platform owners
-- This allows platform_admin/owner to update roles of other users
CREATE POLICY "Platform admins can update any profile"
ON public.profiles
FOR UPDATE
USING (
  auth.uid() IN (
    SELECT id FROM public.profiles 
    WHERE role IN ('platform_owner', 'platform_admin')
  )
);

-- 2. Correct the roles for recently added users (Manual Fix)
-- Update anyone created in the last 24 hours who is NOT a platform user yet, 
-- but might was intended to be (you can adjust the email filter if needed)
-- NOTE: This is a generic fix. Since I don't know the exact emails, 
-- I will set a generic update for verification. 

-- BETTER APPROACH: Create a secure function to update roles that bypasses RLS
-- We will use this function in the UI instead of direct update if possible, 
-- or just rely on the RLS policy above.

CREATE OR REPLACE FUNCTION public.update_user_role(
  target_user_id UUID, 
  new_role TEXT
)
RETURNS VOID AS $$
BEGIN
  -- Check if the executor is a platform admin/owner
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role IN ('platform_owner', 'platform_admin')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.profiles
  SET role = new_role
  WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
