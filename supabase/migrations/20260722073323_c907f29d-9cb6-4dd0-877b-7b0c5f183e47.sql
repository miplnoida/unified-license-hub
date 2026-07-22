
-- Batch 3 Phase C: RPC gates for application_management close/configure/import

CREATE OR REPLACE FUNCTION public.close_application(
  _application_id uuid,
  _reason text DEFAULT NULL
)
RETURNS public.applications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.applications;
BEGIN
  PERFORM public.enforce_permission('application_management', 'close');

  UPDATE public.applications
     SET status = 'closed',
         updated_at = now()
   WHERE id = _application_id
   RETURNING * INTO _row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application % not found', _application_id
      USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO public.audit_logs (
    user_id, action, entity_type, entity_id, metadata, created_at
  ) VALUES (
    auth.uid(),
    'application.close',
    'application',
    _application_id,
    jsonb_build_object('reason', _reason),
    now()
  );

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.close_application(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_application(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.configure_application_form(
  _form_config_id uuid,
  _config jsonb
)
RETURNS public.registration_form_configs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.registration_form_configs;
BEGIN
  PERFORM public.enforce_permission('application_management', 'configure');

  UPDATE public.registration_form_configs
     SET updated_at = now()
   WHERE id = _form_config_id
   RETURNING * INTO _row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application form config % not found', _form_config_id
      USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO public.audit_logs (
    user_id, action, entity_type, entity_id, metadata, created_at
  ) VALUES (
    auth.uid(),
    'application.configure',
    'registration_form_config',
    _form_config_id,
    jsonb_build_object('config', _config),
    now()
  );

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.configure_application_form(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.configure_application_form(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.import_applications_bulk(
  _payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count int;
BEGIN
  PERFORM public.enforce_permission('application_management', 'import');

  _count := COALESCE(jsonb_array_length(_payload -> 'items'), 0);

  INSERT INTO public.audit_logs (
    user_id, action, entity_type, entity_id, metadata, created_at
  ) VALUES (
    auth.uid(),
    'application.import',
    'application',
    NULL,
    jsonb_build_object('items_count', _count),
    now()
  );

  RETURN jsonb_build_object('accepted', _count);
END;
$$;

REVOKE ALL ON FUNCTION public.import_applications_bulk(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_applications_bulk(jsonb) TO authenticated;
