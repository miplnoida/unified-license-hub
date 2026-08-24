CREATE OR REPLACE FUNCTION public.is_workflow_step_participant(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN _user IS NULL THEN false ELSE EXISTS (
    SELECT 1
      FROM public.approval_steps s
     WHERE s.approver_role_id IN (
             SELECT role_id FROM public.user_dynamic_roles WHERE user_id = _user
           )
        OR EXISTS (
             SELECT 1
               FROM jsonb_array_elements_text(COALESCE(s.approver_config->'role_ids','[]'::jsonb)) AS rid
              WHERE rid ~ '^[0-9a-fA-F-]{36}$'
                AND rid::uuid IN (SELECT role_id FROM public.user_dynamic_roles WHERE user_id = _user)
           )
        OR EXISTS (
             SELECT 1
               FROM jsonb_array_elements_text(COALESCE(s.approver_config->'user_ids','[]'::jsonb)) AS uid
              WHERE uid = _user::text
           )
        OR (
             s.approver_role IS NOT NULL
             AND s.approver_role::text IN (
               SELECT ur.role::text FROM public.user_roles ur WHERE ur.user_id = _user
               UNION
               SELECT ro.system_role FROM public.user_dynamic_roles udr
                 JOIN public.roles ro ON ro.id = udr.role_id
                WHERE udr.user_id = _user AND ro.system_role IS NOT NULL
             )
           )
  ) END;
$function$;

REVOKE EXECUTE ON FUNCTION public.is_workflow_step_participant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_workflow_step_participant(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_view_any_workflow_entity(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.has_any_permission(_user, ARRAY[
    'registration_management.view',
    'application_management.view',
    'returns_management.view',
    'complaint_management.view',
    'inspection_management.view',
    'licensing.view',
    'license_management.view',
    'enforcement_management.view',
    'fit_and_proper.view',
    'correspondence_management.view'
  ]);
$function$;

REVOKE EXECUTE ON FUNCTION public.can_view_any_workflow_entity(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_any_workflow_entity(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_read_workflow_instance(_user uuid, _entity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.is_super_admin(_user)
      OR public.has_permission(_user,'workflow_management','view')
      OR public.has_permission(_user,'workflow_management','view_all')
      OR public.can_view_any_workflow_entity(_user)
      OR public.is_workflow_step_participant(_user)
      OR EXISTS (SELECT 1 FROM public.applications a WHERE a.id=_entity_id AND a.applicant_id=_user)
      OR EXISTS (SELECT 1 FROM public.registrations r WHERE r.id=_entity_id AND r.user_id=_user);
$function$;

CREATE OR REPLACE FUNCTION public.can_read_approval_config(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.is_super_admin(_user)
      OR public.has_permission(_user,'workflow_management','view')
      OR public.has_permission(_user,'workflow_management','manage_config')
      OR public.can_view_any_workflow_entity(_user)
      OR public.is_workflow_step_participant(_user);
$function$;