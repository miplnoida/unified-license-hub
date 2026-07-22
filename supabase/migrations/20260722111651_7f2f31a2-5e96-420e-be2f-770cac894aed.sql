CREATE OR REPLACE FUNCTION public.rbac_delete_role(_role_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  target public.roles;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501'; END IF;
  IF NOT (public.is_super_admin(uid) OR public.has_permission(uid,'role_management','delete')) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO target FROM public.roles WHERE id = _role_id FOR UPDATE;
  IF target.id IS NULL THEN
    RAISE EXCEPTION 'role_not_found' USING ERRCODE = '02000';
  END IF;
  IF COALESCE(target.is_system, false) THEN
    RAISE EXCEPTION 'system_role_not_deletable' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.role_permissions WHERE role_id = _role_id;
  DELETE FROM public.user_dynamic_roles WHERE role_id = _role_id;
  DELETE FROM public.roles WHERE id = _role_id;
  RETURN jsonb_build_object('deleted', _role_id);
END;
$function$;