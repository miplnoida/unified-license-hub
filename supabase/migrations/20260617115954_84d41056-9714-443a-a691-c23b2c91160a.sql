
-- 1) Seed portal-area permissions in existing modules (idempotent)
INSERT INTO public.permissions (module, name, description) VALUES
  ('licensing', 'submit', 'Submit licensing applications'),
  ('licensing', 'view_status', 'View licensing case status'),
  ('licensing', 'upload_documents', 'Upload licensing documents'),
  ('licensing', 'respond_rfi', 'Respond to licensing RFIs'),
  ('returns_management', 'submit', 'Submit prudential / regulatory returns'),
  ('returns_management', 'view_status', 'View own returns status'),
  ('returns_management', 'upload_documents', 'Upload return supporting documents'),
  ('returns_management', 'respond_rfi', 'Respond to return RFIs'),
  ('complaint_management', 'submit', 'Submit complaints'),
  ('complaint_management', 'view_status', 'View complaint status'),
  ('complaint_management', 'upload_documents', 'Upload complaint attachments'),
  ('fit_and_proper', 'submit', 'Submit F&P declarations'),
  ('fit_and_proper', 'view_status', 'View F&P declaration status'),
  ('fit_and_proper', 'upload_documents', 'Upload F&P supporting documents')
ON CONFLICT (module, name) DO NOTHING;

-- 2) Seed 11 system roles (idempotent by name)
INSERT INTO public.roles (name, description, system_role, is_system) VALUES
  ('Applicant',                  'External applicant — can submit licence applications and respond to RFIs.', 'applicant',         true),
  ('Regulated Entity User',      'Licensed entity user — licensing, returns, complaints and F&P.',             'licensee_primary',  true),
  ('Licensing Officer',          'Internal licensing officer.',                                                'licensing_officer', true),
  ('Analyst',                    'Internal analyst / reviewer.',                                               'analyst',           true),
  ('Legal/Compliance Reviewer',  'Internal legal & compliance reviewer.',                                      'analyst',           true),
  ('Approver/Decision-Maker',    'Final approver / decision-maker.',                                           'admin',             true),
  ('Prudential Supervisor',      'Prudential supervision lead.',                                               'supervisor',        true),
  ('Market Conduct Supervisor',  'Market conduct supervision lead.',                                           'supervisor',        true),
  ('Committee Member',           'F&P / decision committee member.',                                           'analyst',           true),
  ('Executive Supervisor',       'Executive oversight.',                                                       'supervisor',        true),
  ('System Administrator',       'Full system administrator.',                                                 'super_admin',       true)
ON CONFLICT (name) DO UPDATE
  SET description = EXCLUDED.description,
      system_role = EXCLUDED.system_role,
      is_system   = true,
      updated_at  = now();

-- 3) Default permissions for the two auto-assigned external roles
-- Applicant: licensing portal only
WITH r AS (SELECT id FROM public.roles WHERE name = 'Applicant')
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM r, public.permissions p
WHERE (p.module, p.name) IN (
  ('licensing','submit'), ('licensing','view_status'),
  ('licensing','upload_documents'), ('licensing','respond_rfi')
)
ON CONFLICT DO NOTHING;

-- Regulated Entity User: licensing + returns + complaints + F&P portals
WITH r AS (SELECT id FROM public.roles WHERE name = 'Regulated Entity User')
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM r, public.permissions p
WHERE (p.module, p.name) IN (
  ('licensing','submit'), ('licensing','view_status'),
  ('licensing','upload_documents'), ('licensing','respond_rfi'),
  ('returns_management','submit'), ('returns_management','view_status'),
  ('returns_management','upload_documents'), ('returns_management','respond_rfi'),
  ('complaint_management','submit'), ('complaint_management','view_status'),
  ('complaint_management','upload_documents'),
  ('fit_and_proper','submit'), ('fit_and_proper','view_status'),
  ('fit_and_proper','upload_documents')
)
ON CONFLICT DO NOTHING;

-- System Administrator: every permission
WITH r AS (SELECT id FROM public.roles WHERE name = 'System Administrator')
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM r, public.permissions p
ON CONFLICT DO NOTHING;

-- 4) Backfill user_dynamic_roles for existing external users
-- Applicants / pre-licensees → Applicant role
WITH r AS (SELECT id FROM public.roles WHERE name = 'Applicant')
INSERT INTO public.user_dynamic_roles (user_id, role_id)
SELECT pr.id, r.id
FROM public.profiles pr, r
WHERE pr.role IN ('applicant','pre_licensee')
ON CONFLICT DO NOTHING;

WITH r AS (SELECT id FROM public.roles WHERE name = 'Applicant')
INSERT INTO public.user_dynamic_roles (user_id, role_id)
SELECT plu.id, r.id
FROM public.pre_license_users plu, r
WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = plu.id)
ON CONFLICT DO NOTHING;

-- Licensee primary / secondary → Regulated Entity User
WITH r AS (SELECT id FROM public.roles WHERE name = 'Regulated Entity User')
INSERT INTO public.user_dynamic_roles (user_id, role_id)
SELECT pr.id, r.id
FROM public.profiles pr, r
WHERE pr.role IN ('licensee_primary','licensee_secondary')
ON CONFLICT DO NOTHING;

-- 5) Rewrite seed_external_portal_defaults to use unified RBAC
CREATE OR REPLACE FUNCTION public.seed_external_portal_defaults(
  _user_id uuid, _entity_id uuid, _role app_role, _actor uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_role_id uuid;
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;

  IF _role IN ('applicant'::app_role, 'pre_licensee'::app_role) THEN
    SELECT id INTO v_role_id FROM public.roles WHERE name = 'Applicant' LIMIT 1;
  ELSIF _role IN ('licensee_primary'::app_role, 'licensee_secondary'::app_role) THEN
    SELECT id INTO v_role_id FROM public.roles WHERE name = 'Regulated Entity User' LIMIT 1;
  END IF;

  IF v_role_id IS NOT NULL THEN
    INSERT INTO public.user_dynamic_roles (user_id, role_id)
    VALUES (_user_id, v_role_id)
    ON CONFLICT DO NOTHING;
  END IF;
END; $function$;

-- 6) Rewrite has_portal_capability to consult unified RBAC
CREATE OR REPLACE FUNCTION public.has_portal_capability(
  _user_id uuid, _entity_id uuid, _area portal_area, _capability text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_module text;
  v_action text;
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> _user_id AND NOT public.is_internal_staff_user(auth.uid()) THEN
    RETURN false;
  END IF;
  -- Internal staff and super admins always allowed at the portal layer.
  IF public.is_internal_staff_user(_user_id) OR public.has_role(_user_id, 'super_admin'::app_role) THEN
    RETURN true;
  END IF;

  v_module := CASE _area
    WHEN 'licensing'        THEN 'licensing'
    WHEN 'returns'          THEN 'returns_management'
    WHEN 'complaints'       THEN 'complaint_management'
    WHEN 'fp_declarations'  THEN 'fit_and_proper'
  END;

  v_action := CASE _capability
    WHEN 'can_submit'                  THEN 'submit'
    WHEN 'can_submit_returns'          THEN 'submit'
    WHEN 'can_submit_complaints'       THEN 'submit'
    WHEN 'can_submit_fp_declarations'  THEN 'submit'
    WHEN 'can_upload_documents'        THEN 'upload_documents'
    WHEN 'can_view_status'             THEN 'view_status'
    WHEN 'can_respond_rfi'             THEN 'respond_rfi'
    ELSE _capability
  END;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_dynamic_roles udr
    JOIN public.role_permissions rp ON rp.role_id = udr.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE udr.user_id = _user_id
      AND p.module = v_module
      AND p.name = v_action
  );
END; $function$;

-- 7) Rewrite external_user_entity_ids to drop external_portal_access dependency
CREATE OR REPLACE FUNCTION public.external_user_entity_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT entity_id FROM public.entity_user_access
    WHERE user_id = _user_id AND is_active = true AND entity_id IS NOT NULL
  UNION
  SELECT licensee_id FROM public.profiles
    WHERE id = _user_id AND licensee_id IS NOT NULL;
$function$;

-- 8) Drop legacy audit trigger function (no triggers reference it any more)
DROP FUNCTION IF EXISTS public.log_external_portal_access_change() CASCADE;

-- 9) Drop legacy external portal tables
DROP TABLE IF EXISTS public.external_user_portal_roles CASCADE;
DROP TABLE IF EXISTS public.external_portal_role_capabilities CASCADE;
DROP TABLE IF EXISTS public.external_portal_roles CASCADE;
DROP TABLE IF EXISTS public.external_portal_access CASCADE;
