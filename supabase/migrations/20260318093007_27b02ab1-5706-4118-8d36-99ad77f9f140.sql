
-- Create dynamic roles table
CREATE TABLE public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  system_role text NOT NULL DEFAULT 'analyst',
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed default roles
INSERT INTO public.roles (name, description, system_role, is_system) VALUES
  ('Super Admin', 'Full system access with all permissions', 'super_admin', true),
  ('Admin', 'Administrative access to manage the platform', 'admin', true),
  ('Supervisor', 'Supervisory access with team management', 'supervisor', true),
  ('Licensing Officer', 'Process and manage license applications', 'licensing_officer', true),
  ('Analyst', 'Data analysis and reporting access', 'analyst', true),
  ('Developer', 'System development and configuration', 'developer', true);

-- Create permissions table
CREATE TABLE public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  module text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(module, name)
);

-- Seed permissions
INSERT INTO public.permissions (name, module, description) VALUES
  ('view', 'application_management', 'View applications'),
  ('create', 'application_management', 'Create applications'),
  ('edit', 'application_management', 'Edit applications'),
  ('approve', 'application_management', 'Approve applications'),
  ('reject', 'application_management', 'Reject applications'),
  ('view', 'license_management', 'View licenses'),
  ('create', 'license_management', 'Create licenses'),
  ('edit', 'license_management', 'Edit licenses'),
  ('approve', 'license_management', 'Approve licenses'),
  ('view', 'returns_management', 'View returns'),
  ('create', 'returns_management', 'Create returns'),
  ('edit', 'returns_management', 'Edit returns'),
  ('approve', 'returns_management', 'Approve returns'),
  ('view', 'complaint_management', 'View complaints'),
  ('create', 'complaint_management', 'Create complaints'),
  ('edit', 'complaint_management', 'Edit complaints'),
  ('view', 'user_management', 'View users'),
  ('create', 'user_management', 'Create users'),
  ('edit', 'user_management', 'Edit users'),
  ('view', 'role_management', 'View roles'),
  ('create', 'role_management', 'Create roles'),
  ('edit', 'role_management', 'Edit roles'),
  ('view', 'report_management', 'View reports'),
  ('create', 'report_management', 'Create reports'),
  ('view', 'fee_management', 'View fees'),
  ('create', 'fee_management', 'Create fees'),
  ('edit', 'fee_management', 'Edit fees'),
  ('view', 'form_management', 'View forms'),
  ('create', 'form_management', 'Create forms'),
  ('edit', 'form_management', 'Edit forms'),
  ('view', 'workflow_management', 'View workflows'),
  ('create', 'workflow_management', 'Create workflows'),
  ('edit', 'workflow_management', 'Edit workflows'),
  ('view', 'settings', 'View system settings'),
  ('edit', 'settings', 'Edit system settings');

-- Create role_permissions junction table
CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(role_id, permission_id)
);

-- Add role_id and gender to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES public.roles(id);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gender text;

-- Enable RLS
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- RLS for roles
CREATE POLICY "Anyone reads roles" ON public.roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admins manage roles" ON public.roles FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- RLS for permissions
CREATE POLICY "Anyone reads permissions" ON public.permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admins manage permissions" ON public.permissions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- RLS for role_permissions
CREATE POLICY "Anyone reads role_permissions" ON public.role_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admins manage role_permissions" ON public.role_permissions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Seed Super Admin with all permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p WHERE r.name = 'Super Admin';

-- Seed Admin with all except role_management
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.name = 'Admin' AND p.module != 'role_management';

-- Seed Supervisor
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.name = 'Supervisor' AND p.module IN ('application_management', 'license_management', 'returns_management', 'complaint_management', 'user_management');

-- Seed Licensing Officer
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.name = 'Licensing Officer' AND p.module IN ('application_management', 'license_management') AND p.name IN ('view', 'create', 'edit', 'approve', 'reject');

-- Seed Analyst with view-only
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.name = 'Analyst' AND p.name = 'view';

-- Seed Developer with form and workflow management
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.name = 'Developer' AND p.module IN ('form_management', 'workflow_management', 'settings');
