-- 1) Make the external application insert gate resilient: accept static built-in roles
CREATE OR REPLACE FUNCTION public.external_can_access_application_values(
  _user_id uuid, _applicant_id uuid, _data jsonb, _capability text
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
  -- Built-in static roles inherently imply the ability to act on their own app
  (
    _applicant_id = _user_id
    AND (
      public.has_role(_user_id, 'applicant'::app_role)
      OR public.has_role(_user_id, 'pre_licensee'::app_role)
      OR public.has_role(_user_id, 'licensee_primary'::app_role)
      OR public.has_role(_user_id, 'licensee_secondary'::app_role)
    )
  )
  OR (
    _applicant_id = _user_id
    AND public.has_portal_capability(_user_id, NULL, 'licensing'::public.portal_area, _capability)
  )
  OR (
    public.safe_uuid(_data->>'licensee_id') IS NOT NULL
    AND public.has_portal_capability(
      _user_id,
      public.safe_uuid(_data->>'licensee_id'),
      'licensing'::public.portal_area,
      _capability
    )
  );
$function$;

-- 2) Backfill missing dynamic role rows for existing external users (based on user_roles)
WITH r AS (SELECT id FROM public.roles WHERE name = 'Applicant')
INSERT INTO public.user_dynamic_roles (user_id, role_id)
SELECT DISTINCT ur.user_id, r.id
FROM public.user_roles ur, r
WHERE ur.role IN ('applicant'::app_role, 'pre_licensee'::app_role)
ON CONFLICT DO NOTHING;

WITH r AS (SELECT id FROM public.roles WHERE name = 'Regulated Entity User')
INSERT INTO public.user_dynamic_roles (user_id, role_id)
SELECT DISTINCT ur.user_id, r.id
FROM public.user_roles ur, r
WHERE ur.role IN ('licensee_primary'::app_role, 'licensee_secondary'::app_role)
ON CONFLICT DO NOTHING;

-- 3) Self-heal: trigger that seeds the dynamic role whenever a user_roles row is added
CREATE OR REPLACE FUNCTION public.tg_seed_dynamic_role_on_user_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.role IN ('applicant'::app_role, 'pre_licensee'::app_role,
                  'licensee_primary'::app_role, 'licensee_secondary'::app_role) THEN
    PERFORM public.seed_external_portal_defaults(NEW.user_id, NULL, NEW.role, NULL);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS user_roles_seed_dynamic_role ON public.user_roles;
CREATE TRIGGER user_roles_seed_dynamic_role
AFTER INSERT ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.tg_seed_dynamic_role_on_user_roles();