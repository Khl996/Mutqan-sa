-- Add CR and Tax numbers to tenants table
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS cr_number VARCHAR(50),
ADD COLUMN IF NOT EXISTS tax_number VARCHAR(50);
