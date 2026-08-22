-- Allow platform staff (owner, admin, support, etc.) to VIEW all profiles
-- This fixes the issue where the staff list is empty or incomplete
CREATE POLICY "Platform staff can view all profiles"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.id = auth.uid()
    AND p.role LIKE 'platform_%'
  )
);
