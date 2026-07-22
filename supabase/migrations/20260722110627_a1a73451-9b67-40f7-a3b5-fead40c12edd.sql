CREATE OR REPLACE FUNCTION public.enforce_action(_module text, _action text, _meta jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF _module IS NULL OR btrim(_module) = '' OR _action IS NULL OR btrim(_action) = '' THEN
    RAISE EXCEPTION 'module and action are required' USING ERRCODE = '22023';
  END IF;
  PERFORM public.enforce_permission(_module, _action);
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (_uid, 'rbac_action.' || _module || '.' || _action, _module, NULL, COALESCE(_meta, '{}'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_action(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_action(text, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_workflow_transition(
  _module text,
  _action text,
  _record_id uuid,
  _submitter_id uuid DEFAULT NULL,
  _from_state text DEFAULT NULL,
  _to_state text DEFAULT NULL,
  _meta jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _override boolean := false;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF _module IS NULL OR btrim(_module) = '' OR _action IS NULL OR btrim(_action) = '' THEN
    RAISE EXCEPTION 'module and action are required' USING ERRCODE = '22023';
  END IF;

  PERFORM public.enforce_permission(_module, _action);

  IF _submitter_id IS NOT NULL
     AND _submitter_id = _uid
     AND _action IN ('approve', 'reject', 'close', 'issue', 'revoke', 'suspend') THEN
    SELECT public.has_permission(_uid, _module, 'override_workflow')
      INTO _override;
    IF COALESCE(_override, false) IS NOT TRUE THEN
      RAISE EXCEPTION
        'segregation of duties: actor cannot % their own submission on %', _action, _module
        USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    _uid,
    'workflow.' || _module || '.' || _action,
    _module,
    _record_id::text,
    COALESCE(_meta, '{}'::jsonb)
      || jsonb_build_object(
        'from_state', _from_state,
        'to_state',   _to_state,
        'submitter',  _submitter_id
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_workflow_transition(text, text, uuid, uuid, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_workflow_transition(text, text, uuid, uuid, text, text, jsonb) TO authenticated;