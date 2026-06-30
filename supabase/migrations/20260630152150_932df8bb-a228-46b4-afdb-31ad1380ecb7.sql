
DO $$
DECLARE
  v_constraint text;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.form_templates'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%form_type%';
  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.form_templates DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

ALTER TABLE public.form_templates
  ADD CONSTRAINT form_templates_form_type_check
  CHECK (form_type IN (
    'pre_license','post_license','internal','internal_license_action',
    'registration','renewal','return','returns','complaint','fit_and_proper'
  ));

CREATE INDEX IF NOT EXISTS idx_form_templates_internal_license_action
  ON public.form_templates(form_type)
  WHERE form_type = 'internal_license_action';

CREATE OR REPLACE FUNCTION public.user_has_permission(
  _user_id uuid,
  _module text,
  _action text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_dynamic boolean;
  v_match boolean;
BEGIN
  IF _user_id IS NULL THEN
    RETURN false;
  END IF;
  IF public.has_role(_user_id, 'super_admin'::app_role) THEN
    RETURN true;
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.user_dynamic_roles WHERE user_id = _user_id) INTO v_has_dynamic;
  IF NOT v_has_dynamic THEN
    RETURN public.has_role(_user_id, 'admin'::app_role);
  END IF;
  SELECT EXISTS (
    SELECT 1
    FROM public.user_dynamic_roles udr
    JOIN public.role_permissions rp ON rp.role_id = udr.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE udr.user_id = _user_id
      AND lower(regexp_replace(coalesce(p.module,''), '\s+', '_', 'g')) = lower(regexp_replace(coalesce(_module,''), '\s+', '_', 'g'))
      AND lower(coalesce(p.name,'')) = lower(coalesce(_action,''))
  ) INTO v_match;
  RETURN v_match;
END;
$$;

GRANT EXECUTE ON FUNCTION public.user_has_permission(uuid, text, text) TO authenticated, service_role;

WITH m AS (SELECT id FROM public.permission_modules WHERE key = 'license_management')
INSERT INTO public.permission_actions (module_id, key, label, description, sort_order, is_system)
SELECT m.id, 'manage_license_actions', 'Manage License Actions',
       'Suspend, revoke, cancel, reinstate or change status of a license.', 200, true
FROM m
ON CONFLICT (module_id, key) DO NOTHING;

INSERT INTO public.permissions (module, name, description, action_id)
SELECT 'license_management', 'manage_license_actions',
       'Suspend, revoke, cancel, reinstate or change status of a license.',
       a.id
FROM public.permission_actions a
JOIN public.permission_modules m ON m.id = a.module_id
WHERE m.key = 'license_management' AND a.key = 'manage_license_actions'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE p.module = 'license_management'
  AND p.name = 'manage_license_actions'
  AND lower(r.name) IN (
    'super administrator','super admin','administrator','admin',
    'supervisor','analyst','licensing officer','legal/compliance reviewer',
    'legal & compliance','legal compliance','legal/compliance'
  )
ON CONFLICT DO NOTHING;
