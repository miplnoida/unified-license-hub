
CREATE OR REPLACE FUNCTION public.assign_primary_user(_entity_id uuid, _user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_existing record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','Not authenticated','code','UNAUTHORIZED','http',401);
  END IF;
  IF NOT (public.has_role(v_uid,'super_admin'::app_role) OR public.has_role(v_uid,'admin'::app_role)) THEN
    RETURN jsonb_build_object('error','Admin only','code','FORBIDDEN','http',403);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.licensees WHERE id = _entity_id) THEN
    RETURN jsonb_build_object('error','Entity not found','code','ENTITY_NOT_FOUND','http',404);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id) THEN
    RETURN jsonb_build_object('error','User not found','code','USER_NOT_FOUND','http',404);
  END IF;

  SELECT * INTO v_existing FROM public.entity_user_access
   WHERE entity_id = _entity_id AND access_type='primary_user' AND is_active=true
   FOR UPDATE;

  IF FOUND AND v_existing.user_id = _user_id THEN
    RETURN jsonb_build_object('error','This user is already the active Primary User for this entity.',
      'code','ALREADY_PRIMARY','http',409);
  END IF;

  IF FOUND THEN
    UPDATE public.entity_user_access
       SET is_active = false, end_date = v_now
     WHERE id = v_existing.id;

    UPDATE public.profiles
       SET role = 'applicant',
           user_type = 'applicant',
           updated_at = v_now
     WHERE id = v_existing.user_id
       AND licensee_id = _entity_id
       AND role = 'licensee_primary';
  END IF;

  INSERT INTO public.entity_user_access (user_id, entity_id, access_type, is_active, start_date, created_by)
  VALUES (_user_id, _entity_id, 'primary_user', true, v_now, v_uid);

  UPDATE public.profiles
     SET role = 'licensee_primary',
         user_type = 'primary',
         licensee_id = _entity_id,
         updated_at = v_now
   WHERE id = _user_id;

  PERFORM public.create_audit_log(
    v_uid, 'entity_primary_user_assigned', 'licensee', _entity_id::text, NULL,
    jsonb_build_object('new_primary_user_id', _user_id,
                       'previous_primary_user_id', v_existing.user_id),
    NULL
  );

  RETURN jsonb_build_object('success', true, 'http', 200,
    'entity_id', _entity_id, 'user_id', _user_id,
    'previous_user_id', v_existing.user_id);
END;
$function$;

UPDATE public.profiles p
   SET role = 'licensee_primary',
       user_type = 'primary',
       licensee_id = eua.entity_id,
       updated_at = now()
  FROM public.entity_user_access eua
 WHERE eua.user_id = p.id
   AND eua.access_type = 'primary_user'
   AND eua.is_active = true
   AND (p.role IS DISTINCT FROM 'licensee_primary'
        OR p.licensee_id IS DISTINCT FROM eua.entity_id);
