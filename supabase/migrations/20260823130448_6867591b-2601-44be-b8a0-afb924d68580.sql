-- GAP-3D-001: after a screening run completes, fp_assessments.status becomes
-- 'screening'. Neither fp_determination_record nor the transition trigger
-- allowed a determination from that state, so a clean case dead-ended after
-- screening and could never be determined. 'screening' is a legitimate
-- pre-determination state and must be decidable.

CREATE OR REPLACE FUNCTION public.fp_check_assessment_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_has_screening BOOLEAN;
  v_has_determination BOOLEAN;
  v_override BOOLEAN;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    IF OLD.status IN ('determined','closed') THEN
      SELECT EXISTS (
        SELECT 1 FROM public.rule_overrides
        WHERE rule_key = 'fit_and_proper.assessment.edit_finalized'
          AND (entity_id = OLD.id::text OR entity_id IS NULL)
          AND created_at > (now() - interval '1 hour')
      ) INTO v_override;
      IF NOT v_override AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
        RAISE EXCEPTION 'F&P assessment % is % and cannot be edited without an admin override', OLD.id, OLD.status
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'submitted' AND OLD.status = 'draft' THEN
    IF NEW.form_response_id IS NULL AND (NEW.declaration_data IS NULL OR NEW.declaration_data = '{}'::jsonb) THEN
      RAISE EXCEPTION 'Cannot submit assessment: PQ/declaration is empty' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.status = 'awaiting_committee' AND OLD.status IN ('submitted','screening') THEN
    SELECT EXISTS (SELECT 1 FROM public.fp_screening_runs WHERE assessment_id = NEW.id AND status = 'completed')
      INTO v_has_screening;
    IF NOT v_has_screening THEN
      SELECT EXISTS (
        SELECT 1 FROM public.rule_overrides
        WHERE rule_key = 'fit_and_proper.skip_screening'
          AND entity_id = NEW.id::text
          AND created_at > (now() - interval '1 hour')
      ) INTO v_override;
      IF NOT v_override THEN
        RAISE EXCEPTION 'Cannot route to committee: no successful screening run and no override'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  ELSIF NEW.status = 'determined' AND OLD.status IN ('awaiting_committee','submitted','screening') THEN
    SELECT EXISTS (SELECT 1 FROM public.fp_determinations WHERE assessment_id = NEW.id AND is_current = true)
      INTO v_has_determination;
    IF NOT v_has_determination THEN
      RAISE EXCEPTION 'Cannot mark determined: no finalized determination exists' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.status = 'closed' AND OLD.status = 'determined' THEN
    NULL;
  ELSIF NEW.status = 'screening' AND OLD.status = 'submitted' THEN
    NULL;
  ELSE
    IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
      RAISE EXCEPTION 'Invalid F&P assessment transition: % -> %', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Widen the determination gate to include the post-screening state.
CREATE OR REPLACE FUNCTION public.fp_determination_record(_assessment_id uuid, _individual_id uuid, _outcome text, _rationale text, _regulator_id uuid DEFAULT NULL::uuid, _effective_from date DEFAULT NULL::date, _effective_to date DEFAULT NULL::date, _is_committee_override boolean DEFAULT false, _override_reason text DEFAULT NULL::text, _conditions jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _assess record; _prior record; _row record;
  _lens uuid; _cond jsonb; _created_conditions int := 0;
BEGIN
  PERFORM public.enforce_permission('fit_and_proper_determinations','approve');
  IF _is_committee_override THEN
    PERFORM public.enforce_permission('fit_and_proper','override_committee');
  END IF;

  IF _outcome NOT IN ('approved','conditional','rejected','deferred','withdrawn','fit','not_fit') THEN
    RAISE EXCEPTION 'invalid determination outcome %', _outcome USING ERRCODE='22023';
  END IF;
  IF _rationale IS NULL OR length(btrim(_rationale)) < 10 THEN
    RAISE EXCEPTION 'determination rationale must be at least 10 characters' USING ERRCODE='22023';
  END IF;
  IF _is_committee_override AND (_override_reason IS NULL OR length(btrim(_override_reason)) < 20) THEN
    RAISE EXCEPTION 'committee override reason must be at least 20 characters' USING ERRCODE='22023';
  END IF;

  SELECT * INTO _assess FROM public.fp_assessments WHERE id = _assessment_id FOR UPDATE;
  IF _assess IS NULL THEN RAISE EXCEPTION 'assessment not found' USING ERRCODE='22023'; END IF;
  IF _assess.individual_id <> _individual_id THEN
    RAISE EXCEPTION 'assessment does not belong to this individual' USING ERRCODE='22023';
  END IF;
  IF _assess.status NOT IN ('submitted','screening','awaiting_committee') THEN
    RAISE EXCEPTION 'This assessment is currently "%" — a determination can only be recorded once it reaches Submitted, Screening or Awaiting Committee.',
      _assess.status USING ERRCODE='22023';
  END IF;

  -- Maker-checker: the officer who prepared or submitted the assessment may
  -- never record its determination. Segregation of duties is not waivable by
  -- an ordinary F&P role; only a super admin may act on both sides.
  IF _uid IS NOT NULL
     AND (_uid = _assess.created_by OR _uid = _assess.submitted_by)
     AND NOT public.is_super_admin(_uid) THEN
    RAISE EXCEPTION 'Maker-checker violation: the officer who prepared or submitted this assessment cannot record its determination. A separate decision-maker must decide.'
      USING ERRCODE='42501';
  END IF;

  _lens := COALESCE(_assess.regulator_id, _regulator_id);

  SELECT * INTO _prior FROM public.fp_determinations
   WHERE individual_id = _individual_id AND is_current
     AND _lens IS NOT DISTINCT FROM regulator_id
   FOR UPDATE;

  IF _prior.id IS NOT NULL THEN
    UPDATE public.fp_determinations SET is_current = false WHERE id = _prior.id;
  END IF;

  INSERT INTO public.fp_determinations (
    assessment_id, individual_id, outcome, rationale, determined_by,
    supersedes_id, is_current, effective_from, effective_to, regulator_id,
    is_committee_override, override_reason)
  VALUES (
    _assessment_id, _individual_id, _outcome, btrim(_rationale), _uid,
    _prior.id, true, COALESCE(_effective_from, CURRENT_DATE), _effective_to, _lens,
    COALESCE(_is_committee_override,false),
    CASE WHEN _is_committee_override THEN btrim(_override_reason) ELSE NULL END)
  RETURNING * INTO _row;

  UPDATE public.fp_assessments
     SET status = 'determined', determined_at = now()
   WHERE id = _assessment_id;

  IF _conditions IS NOT NULL AND jsonb_typeof(_conditions) = 'array' THEN
    FOR _cond IN SELECT * FROM jsonb_array_elements(_conditions) LOOP
      IF COALESCE(btrim(_cond->>'description'),'') = '' THEN
        RAISE EXCEPTION 'each condition requires a description' USING ERRCODE='22023';
      END IF;
      INSERT INTO public.fp_conditions (
        determination_id, individual_id, category, description, due_date,
        monitoring_owner, evidence_type, status, created_by)
      VALUES (
        _row.id, _individual_id, COALESCE(NULLIF(btrim(COALESCE(_cond->>'category','')),''),'other'),
        btrim(_cond->>'description'), NULLIF(_cond->>'due_date','')::date,
        NULLIF(_cond->>'monitoring_owner','')::uuid, NULLIF(_cond->>'evidence_type',''),
        'open', _uid);
      _created_conditions := _created_conditions + 1;
    END LOOP;
  END IF;

  IF _prior.id IS NOT NULL THEN
    PERFORM public.fp_audit_event(
      'fp.determination.superseded','fp_determination',_prior.id,
      jsonb_build_object('is_current',true,'outcome',_prior.outcome),
      jsonb_build_object('is_current',false,'superseded_by',_row.id),
      jsonb_build_object('individual_id',_individual_id,'assessment_id',_assessment_id,
                         'regulator_id',_lens));
  END IF;

  PERFORM public.fp_audit_event(
    'fp.determination.' || _outcome,'fp_determination',_row.id, NULL,
    jsonb_build_object('outcome',_outcome,'regulator_id',_lens,'supersedes_id',_prior.id,
                       'is_committee_override',COALESCE(_is_committee_override,false),
                       'conditions_created',_created_conditions),
    jsonb_build_object('individual_id',_individual_id,'assessment_id',_assessment_id,
                       'determination_id',_row.id,'regulator_id',_lens),
    CASE WHEN _is_committee_override THEN btrim(_override_reason) ELSE btrim(_rationale) END,
    CASE WHEN _is_committee_override THEN 'OVERRIDE' ELSE 'APPROVE' END::compliance_audit_action);

  RETURN to_jsonb(_row) || jsonb_build_object('conditions_created',_created_conditions);
END; $function$;