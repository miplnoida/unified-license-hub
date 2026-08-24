CREATE OR REPLACE FUNCTION public.can_view_any_workflow_entity(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT _user IS NOT NULL
     AND public.sec_is_internal_user(_user)
     AND public.has_any_permission(_user, ARRAY[
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

CREATE OR REPLACE FUNCTION public.is_workflow_step_participant(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN _user IS NULL OR NOT public.sec_is_internal_user(_user) THEN false ELSE EXISTS (
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