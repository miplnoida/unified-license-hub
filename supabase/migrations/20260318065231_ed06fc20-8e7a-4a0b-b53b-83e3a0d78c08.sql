
-- Step 1: Add new role enum values only
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'pre_licensee';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'licensee_primary';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'licensee_secondary';
