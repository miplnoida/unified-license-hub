CREATE OR REPLACE FUNCTION public.supervisory_finding_lifecycle(_finding_id uuid, _to_status text, _rationale text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE _uid uuid; _row public.supervisory_finding; _to text; _allowed boolean; _material boolean;
        _open text;
BEGIN
  _to := upper(COALESCE(_to_status,''));
  IF _to IN ('ISSUED','CLOSED','WITHDRAWN','SUPERSEDED') THEN
    _uid := public.supervisory_spine_require(ARRAY['aml_supervision.approve','supervisory_spine.approve',
              'prudential_supervision.initiate_supervisory_action','market_conduct.approve']);
  ELSE
    _uid := public.supervisory_spine_require(ARRAY['aml_supervision.finding_manage','aml_supervision.review',
              'supervisory_spine.edit','prudential_supervision.manage_remediation',
              'market_conduct.approve','inspection_management.edit']);
  END IF;

  SELECT * INTO _row FROM public.supervisory_finding WHERE id = _finding_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'not_found: finding' USING ERRCODE='22023'; END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _row.entity_id);
  _material := _row.severity IN ('HIGH','CRITICAL');

  _allowed := CASE _row.status
    WHEN 'DRAFT'                 THEN _to IN ('REVIEW','WITHDRAWN')
    WHEN 'REVIEW'                THEN _to IN ('ISSUED','DRAFT','WITHDRAWN')
    WHEN 'ISSUED'                THEN _to IN ('MANAGEMENT_RESPONSE','REMEDIATION_REQUIRED','WITHDRAWN','SUPERSEDED')
    WHEN 'MANAGEMENT_RESPONSE'   THEN _to IN ('REMEDIATION_REQUIRED','CLOSED','WITHDRAWN')
    WHEN 'REMEDIATION_REQUIRED'  THEN _to IN ('VALIDATION','CLOSED')
    WHEN 'VALIDATION'            THEN _to IN ('CLOSED','REMEDIATION_REQUIRED')
    WHEN 'CLOSED'                THEN _to = 'REOPENED'
    WHEN 'REOPENED'              THEN _to IN ('REMEDIATION_REQUIRED','VALIDATION')
    ELSE false END;
  IF NOT _allowed THEN
    RAISE EXCEPTION 'transition_not_permitted: % -> %', _row.status, _to USING ERRCODE='22023'; END IF;

  IF _to IN ('ISSUED','CLOSED','WITHDRAWN','SUPERSEDED','REOPENED')
     AND length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a decision rationale of at least 10 characters is required' USING ERRCODE='22023'; END IF;

  -- maker/checker on material findings
  IF _to = 'ISSUED' AND _material AND NOT public.is_super_admin(_uid) AND _row.created_by = _uid THEN
    RAISE EXCEPTION 'not_authorized: a high or critical finding cannot be issued by the officer who raised it'
      USING ERRCODE='42501'; END IF;
  IF _to = 'CLOSED' AND _material AND NOT public.is_super_admin(_uid)
     AND EXISTS (SELECT 1 FROM public.supervisory_remediation_validation v
                  WHERE v.finding_id = _finding_id AND v.validated_by = _uid) THEN
    RAISE EXCEPTION 'not_authorized: the validator of a high or critical finding cannot also close it'
      USING ERRCODE='42501'; END IF;
  IF _to = 'CLOSED' AND _row.status IN ('REMEDIATION_REQUIRED','VALIDATION','REOPENED')
     AND NOT EXISTS (SELECT 1 FROM public.supervisory_remediation_validation v WHERE v.finding_id = _finding_id) THEN
    RAISE EXCEPTION 'closure_blocked: a governed remediation validation is required before closure'
      USING ERRCODE='22023'; END IF;

  -- closure readiness: every corrective action must have reached an outcome
  IF _to = 'CLOSED' THEN
    SELECT string_agg(a.reference || ' (' || a.status || ')', ', ' ORDER BY a.reference)
      INTO _open
      FROM public.supervisory_remediation_action a
     WHERE a.finding_id = _finding_id
       AND a.status NOT IN ('EFFECTIVE','PARTIALLY_EFFECTIVE','CLOSED');
    IF _open IS NOT NULL THEN
      RAISE EXCEPTION 'closure_blocked: unresolved corrective action(s): %', _open USING ERRCODE='22023';
    END IF;
  END IF;

  UPDATE public.supervisory_finding SET
    status = _to,
    reviewed_by = CASE WHEN _to='REVIEW' THEN _uid ELSE reviewed_by END,
    reviewed_at = CASE WHEN _to='REVIEW' THEN now() ELSE reviewed_at END,
    issued_by = CASE WHEN _to='ISSUED' THEN _uid ELSE issued_by END,
    issued_at = CASE WHEN _to='ISSUED' THEN now() ELSE issued_at END,
    closed_by = CASE WHEN _to='CLOSED' THEN _uid ELSE closed_by END,
    closed_at = CASE WHEN _to='CLOSED' THEN now() ELSE closed_at END,
    closure_rationale = CASE WHEN _to='CLOSED' THEN btrim(_rationale) ELSE closure_rationale END,
    updated_at = now()
  WHERE id = _finding_id;

  INSERT INTO public.supervisory_finding_event(finding_id, event_type, from_status, to_status, rationale, actor_id)
  VALUES (_finding_id,
          CASE _to WHEN 'ISSUED' THEN 'ISSUE' WHEN 'CLOSED' THEN 'CLOSURE' ELSE 'STATUS_CHANGE' END,
          _row.status, _to, btrim(COALESCE(_rationale,'')), _uid);

  PERFORM public.log_compliance_audit(
    CASE WHEN _to IN ('ISSUED','CLOSED') THEN 'APPROVE' ELSE 'WORKFLOW_TRANSITION' END,
    'supervisory_finding', _finding_id,
    jsonb_build_object('status',_row.status), jsonb_build_object('status',_to),
    'Supervisory finding ' || _row.reference || ': ' || _row.status || ' -> ' || _to);

  RETURN jsonb_build_object('id',_finding_id,'reference',_row.reference,
    'from_status',_row.status,'to_status',_to);
END
$fn$;

REVOKE ALL ON FUNCTION public.supervisory_finding_lifecycle(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_finding_lifecycle(uuid, text, text) TO authenticated, service_role;