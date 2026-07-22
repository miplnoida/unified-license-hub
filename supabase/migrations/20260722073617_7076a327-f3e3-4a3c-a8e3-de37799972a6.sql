
-- Batch 3 Phase D: generic export gate + application escalate RPC

CREATE OR REPLACE FUNCTION public.record_export_intent(
  _module text,
  _action text,
  _meta jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _action IS NULL OR _action NOT IN ('export','download') THEN
    RAISE EXCEPTION 'record_export_intent only accepts export/download actions'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  PERFORM public.enforce_permission(_module, _action);

  INSERT INTO public.audit_logs (
    user_id, action, entity_type, entity_id, metadata, created_at
  ) VALUES (
    auth.uid(),
    _module || '.' || _action,
    _module,
    NULL,
    coalesce(_meta, '{}'::jsonb),
    now()
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.record_export_intent(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_export_intent(text, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.escalate_application(
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
  PERFORM public.enforce_permission('application_management', 'escalate');

  UPDATE public.applications
     SET status = 'escalated',
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
    'application.escalate',
    'application',
    _application_id,
    jsonb_build_object('reason', _reason),
    now()
  );

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.escalate_application(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.escalate_application(uuid, text) TO authenticated;
