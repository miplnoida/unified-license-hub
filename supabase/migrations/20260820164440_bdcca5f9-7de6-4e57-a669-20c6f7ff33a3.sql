
CREATE OR REPLACE FUNCTION public.compliance_return_submit(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _id uuid; _before jsonb; _after jsonb; _draft jsonb;
        _existing jsonb; _p jsonb := _payload;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;

  SELECT to_jsonb(r) INTO _before FROM public.compliance_returns r
   WHERE r.id = nullif(_payload->>'return_id','')::uuid;

  -- Submitting an already-saved draft may omit form_data: reuse what is stored.
  IF coalesce(_p->'form_data','{}'::jsonb) = '{}'::jsonb AND _before IS NOT NULL THEN
    _existing := coalesce(_before->'form_data','{}'::jsonb);
    _p := _p || jsonb_build_object('form_data', _existing);
  END IF;

  IF coalesce(_p->'form_data','{}'::jsonb) = '{}'::jsonb THEN
    RAISE EXCEPTION 'A return cannot be submitted with no data' USING ERRCODE='22023';
  END IF;

  _draft := public.compliance_return_save_draft(_p || jsonb_build_object('_suppress_audit', true));
  _id := (_draft->>'id')::uuid;

  UPDATE public.compliance_returns SET
    status = 'submitted', submitted_at = now(), updated_at = now()
  WHERE id=_id RETURNING to_jsonb(compliance_returns) INTO _after;

  PERFORM public.log_compliance_audit(
    'WORKFLOW_TRANSITION'::compliance_audit_action,
    'compliance_return', _id::text, _before, _after, 'Return submitted by filer'::text);
  RETURN _after;
END; $function$;

CREATE OR REPLACE FUNCTION public.compliance_return_acknowledge(_return_id uuid, _ack_text text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _uid uuid := auth.uid(); _before jsonb; _after jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  SELECT to_jsonb(r) INTO _before FROM public.compliance_returns r WHERE r.id=_return_id;
  IF _before IS NULL THEN
    RAISE EXCEPTION 'Return not found' USING ERRCODE='P0002';
  END IF;
  IF NOT public.compliance_return_can_file(_uid, nullif(_before->>'license_id','')::uuid,
                                           nullif(_before->>'on_behalf_of_licensee_id','')::uuid) THEN
    RAISE EXCEPTION 'You are not entitled to file this return' USING ERRCODE='42501';
  END IF;
  IF coalesce(length(btrim(coalesce(_ack_text,''))),0) = 0 THEN
    RAISE EXCEPTION 'Acknowledgement text is required' USING ERRCODE='22023';
  END IF;

  UPDATE public.compliance_returns SET
    ack_by = _uid, ack_at = now(), ack_text = left(btrim(_ack_text), 4000), updated_at = now()
  WHERE id=_return_id RETURNING to_jsonb(compliance_returns) INTO _after;

  RETURN _after;
END; $$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE pronamespace='public'::regnamespace AND proname='compliance_return_acknowledge'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;
