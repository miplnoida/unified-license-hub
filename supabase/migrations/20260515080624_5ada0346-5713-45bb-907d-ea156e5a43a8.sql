CREATE OR REPLACE FUNCTION public.toggle_ppoc_mapping_status(_mapping_id uuid, _is_active boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_old record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','Not authenticated','code','UNAUTHORIZED','http',401);
  END IF;
  IF NOT (public.has_role(v_uid,'super_admin'::app_role) OR public.has_role(v_uid,'admin'::app_role)) THEN
    RETURN jsonb_build_object('error','Admin only','code','FORBIDDEN','http',403);
  END IF;
  IF _mapping_id IS NULL THEN
    RETURN jsonb_build_object('error','Mapping id required','code','INVALID','http',422);
  END IF;

  SELECT * INTO v_old FROM public.ppoc_entity_mappings WHERE id = _mapping_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Mapping not found','code','NOT_FOUND','http',404);
  END IF;

  UPDATE public.ppoc_entity_mappings
     SET is_active = _is_active, updated_at = now()
   WHERE id = _mapping_id;

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, old_value, new_value, metadata)
  VALUES (
    v_uid,
    CASE WHEN _is_active THEN 'ppoc_mapping_activated' ELSE 'ppoc_mapping_deactivated' END,
    'ppoc_entity_mapping',
    _mapping_id::text,
    jsonb_build_object('is_active', v_old.is_active),
    jsonb_build_object('is_active', _is_active),
    jsonb_build_object('ppoc_user_id', v_old.ppoc_user_id, 'licensee_id', v_old.licensee_id)
  );

  RETURN jsonb_build_object('ok', true, 'mapping_id', _mapping_id, 'is_active', _is_active);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_ppoc_mapping(_mapping_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_old record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','Not authenticated','code','UNAUTHORIZED','http',401);
  END IF;
  IF NOT (public.has_role(v_uid,'super_admin'::app_role) OR public.has_role(v_uid,'admin'::app_role)) THEN
    RETURN jsonb_build_object('error','Admin only','code','FORBIDDEN','http',403);
  END IF;
  IF _mapping_id IS NULL THEN
    RETURN jsonb_build_object('error','Mapping id required','code','INVALID','http',422);
  END IF;

  SELECT * INTO v_old FROM public.ppoc_entity_mappings WHERE id = _mapping_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Mapping not found','code','NOT_FOUND','http',404);
  END IF;

  DELETE FROM public.ppoc_mapping_sectors WHERE mapping_id = _mapping_id;
  DELETE FROM public.ppoc_entity_mappings WHERE id = _mapping_id;

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, old_value, new_value, metadata)
  VALUES (
    v_uid,
    'ppoc_mapping_deleted',
    'ppoc_entity_mapping',
    _mapping_id::text,
    jsonb_build_object(
      'ppoc_user_id', v_old.ppoc_user_id,
      'licensee_id', v_old.licensee_id,
      'is_active', v_old.is_active
    ),
    NULL,
    '{}'::jsonb
  );

  RETURN jsonb_build_object('ok', true, 'mapping_id', _mapping_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_ppoc_mapping_status(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_ppoc_mapping(uuid) TO authenticated;