
-- Add role_type to roles
ALTER TABLE public.roles
  ADD COLUMN IF NOT EXISTS role_type text NOT NULL DEFAULT 'internal'
    CHECK (role_type IN ('internal','external'));

UPDATE public.roles SET role_type = 'external'
WHERE is_system = true AND name IN ('Applicant','Regulated Entity User');

-- Add audience to permission_modules
ALTER TABLE public.permission_modules
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'internal'
    CHECK (audience IN ('internal','external','both'));

UPDATE public.permission_modules SET audience = 'both'
WHERE key IN ('licensing','returns_management','complaint_management','fit_and_proper');

UPDATE public.permission_modules SET audience = 'external'
WHERE key IN ('public_complaint_portal');

-- Add audience to permission_actions
ALTER TABLE public.permission_actions
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'internal'
    CHECK (audience IN ('internal','external','both'));

-- Within shared modules, only submitter-facing actions are external
UPDATE public.permission_actions pa
SET audience = 'external'
FROM public.permission_modules pm
WHERE pa.module_id = pm.id
  AND pm.key IN ('licensing','returns_management','complaint_management','fit_and_proper')
  AND pa.key IN ('submit','view_status','upload_documents','respond_rfi');

-- View on complaint_management & fit_and_proper is also valid for external (read-own)
UPDATE public.permission_actions pa
SET audience = 'both'
FROM public.permission_modules pm
WHERE pa.module_id = pm.id
  AND pm.key IN ('complaint_management','fit_and_proper')
  AND pa.key = 'view';

-- All actions on fully-external modules are external
UPDATE public.permission_actions pa
SET audience = 'external'
FROM public.permission_modules pm
WHERE pa.module_id = pm.id
  AND pm.audience = 'external';

-- Ensure Applicant defaults exist (no destructive change)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'Applicant' AND r.is_system = true
  AND p.module = 'licensing'
  AND p.name IN ('submit','view_status','upload_documents','respond_rfi')
ON CONFLICT DO NOTHING;

-- Ensure Regulated Entity User defaults
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'Regulated Entity User' AND r.is_system = true
  AND (
    (p.module = 'licensing' AND p.name IN ('submit','view_status','upload_documents','respond_rfi'))
    OR (p.module = 'returns_management' AND p.name IN ('submit','view_status'))
    OR (p.module = 'complaint_management' AND p.name IN ('submit','view_status'))
    OR (p.module = 'fit_and_proper' AND p.name IN ('submit','view_status'))
  )
ON CONFLICT DO NOTHING;
