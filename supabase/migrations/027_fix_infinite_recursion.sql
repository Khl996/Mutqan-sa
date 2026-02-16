-- 1. Drop the problematic recursive policy
DROP POLICY IF EXISTS "Platform staff can view all profiles" ON public.profiles;

-- 2. Create a specific Security Definer function to check role
-- This bypasses RLS to avoid the infinite loop
CREATE OR REPLACE FUNCTION public.is_platform_staff()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role LIKE 'platform_%'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Re-create the policy using the safe function
-- Allows users to see ALL profiles IF they are staff, OR see their OWN profile always
CREATE POLICY "Platform staff can view all profiles"
ON public.profiles
FOR SELECT
USING (
  public.is_platform_staff() OR id = auth.uid()
);
