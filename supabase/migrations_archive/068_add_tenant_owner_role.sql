-- Add tenant_owner to the list of allowed roles
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check 
CHECK (role IN (
  -- Platform Roles
  'platform_owner', 
  'platform_admin', 
  'platform_support',
  'platform_finance',
  'platform_hr',
  
  -- Tenant Owner (The one missing)
  'tenant_owner',
  
  -- Tenant Management Roles
  'tenant_admin', 
  'facility_manager', 
  
  -- Operational Roles
  'maintenance_manager',
  'supervisor', 
  'technician', 
  'engineer',
  'reporter',
  
  -- Base Role
  'user'
));
