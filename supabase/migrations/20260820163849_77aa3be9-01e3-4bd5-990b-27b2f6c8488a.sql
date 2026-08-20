
CREATE OR REPLACE FUNCTION public.compliance_return_can_file(_user_id uuid, _license_id uuid, _on_behalf_of uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    _user_id IS NOT NULL
    AND (
      public.has_permission(_user_id, 'returns_management', 'edit')
      OR public.is_super_admin(_user_id)
      OR (
        _on_behalf_of IS NULL
        AND (
          EXISTS (SELECT 1 FROM public.entity_user_access a WHERE a.user_id = _user_id)
          OR EXISTS (SELECT 1 FROM public.entity_user_memberships m WHERE m.user_id = _user_id)
        )
      )
      OR (
        _on_behalf_of IS NOT NULL
        AND (
          EXISTS (
            SELECT 1 FROM public.entity_user_access a
            WHERE a.user_id = _user_id AND a.entity_id = _on_behalf_of
          )
          OR EXISTS (
            SELECT 1 FROM public.entity_user_memberships m
            WHERE m.user_id = _user_id AND m.entity_id = _on_behalf_of
          )
        )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.compliance_return_save_draft(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _id uuid; _before jsonb; _after jsonb; _on_behalf uuid;
        _suppress boolean := coalesce((_payload->>'_suppress_audit')::boolean, false);
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  _id := nullif(_payload->>'return_id','')::uuid;
  _on_behalf := nullif(_payload->>'on_behalf_of_licensee_id','')::uuid;

  IF _id IS NOT NULL THEN
    SELECT to_jsonb(r) INTO _before FROM public.compliance_returns r WHERE r.id=_id;
    IF _before IS NULL THEN RAISE EXCEPTION 'Return not found' USING ERRCODE='P0002'; END IF;
    IF _before->>'status' IN ('accepted','under_review') THEN
      RAISE EXCEPTION 'This return can no longer be edited (status %)', _before->>'status' USING ERRCODE='22023';
    END IF;
    IF NOT public.compliance_return_can_file(_uid, nullif(_before->>'license_id','')::uuid,
                                             nullif(_before->>'on_behalf_of_licensee_id','')::uuid) THEN
      RAISE EXCEPTION 'You are not entitled to file this return' USING ERRCODE='42501';
    END IF;
    UPDATE public.compliance_returns SET
      form_data = coalesce(_payload->'form_data', form_data),
      status = 'draft',
      updated_at = now()
    WHERE id=_id RETURNING to_jsonb(compliance_returns) INTO _after;
  ELSE
    IF NOT public.compliance_return_can_file(_uid, nullif(_payload->>'license_id','')::uuid, _on_behalf) THEN
      RAISE EXCEPTION 'You are not entitled to file returns for this entity' USING ERRCODE='42501';
    END IF;
    INSERT INTO public.compliance_returns (
      return_config_id, license_id, submitter_id, on_behalf_of_licensee_id,
      period_start, period_end, due_date, form_data, status
    ) VALUES (
      nullif(_payload->>'return_config_id','')::uuid,
      nullif(_payload->>'license_id','')::uuid,
      _uid, _on_behalf,
      (_payload->>'period_start')::date,
      (_payload->>'period_end')::date,
      (_payload->>'due_date')::date,
      coalesce(_payload->'form_data','{}'::jsonb),
      'draft'
    ) RETURNING id INTO _id;
    SELECT to_jsonb(r) INTO _after FROM public.compliance_returns r WHERE r.id=_id;
  END IF;

  IF NOT _suppress THEN
    PERFORM public.log_compliance_audit(
      (CASE WHEN _before IS NULL THEN 'CREATE' ELSE 'UPDATE' END)::compliance_audit_action,
      'compliance_return', _id::text, _before, _after, NULL::text);
  END IF;
  RETURN _after;
END; $$;

CREATE OR REPLACE FUNCTION public.compliance_return_submit(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _id uuid; _before jsonb; _after jsonb; _draft jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  IF coalesce(_payload->'form_data','{}'::jsonb) = '{}'::jsonb THEN
    RAISE EXCEPTION 'A return cannot be submitted with no data' USING ERRCODE='22023';
  END IF;

  SELECT to_jsonb(r) INTO _before FROM public.compliance_returns r
   WHERE r.id = nullif(_payload->>'return_id','')::uuid;

  _draft := public.compliance_return_save_draft(_payload || jsonb_build_object('_suppress_audit', true));
  _id := (_draft->>'id')::uuid;

  UPDATE public.compliance_returns SET
    status = 'submitted', submitted_at = now(), updated_at = now()
  WHERE id=_id RETURNING to_jsonb(compliance_returns) INTO _after;

  PERFORM public.log_compliance_audit(
    'WORKFLOW_TRANSITION'::compliance_audit_action,
    'compliance_return', _id::text, _before, _after, 'Return submitted by filer'::text);
  RETURN _after;
END; $$;
