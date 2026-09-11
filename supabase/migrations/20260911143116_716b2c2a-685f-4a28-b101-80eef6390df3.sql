-- 1. Immutable policy provenance on overrides
ALTER TABLE public.supervisory_assessment_calculation_override
  ADD COLUMN IF NOT EXISTS policy_basis_status text,
  ADD COLUMN IF NOT EXISTS judgement_policy_component_id uuid,
  ADD COLUMN IF NOT EXISTS judgement_policy_code text,
  ADD COLUMN IF NOT EXISTS judgement_policy_version text,
  ADD COLUMN IF NOT EXISTS judgement_policy_content_hash text,
  ADD COLUMN IF NOT EXISTS judgement_rule_code text,
  ADD COLUMN IF NOT EXISTS judgement_direction text,
  ADD COLUMN IF NOT EXISTS judgement_max_band_steps integer,
  ADD COLUMN IF NOT EXISTS judgement_band_steps integer,
  ADD COLUMN IF NOT EXISTS judgement_rationale_min_length integer,
  ADD COLUMN IF NOT EXISTS judgement_policy_profile_code text,
  ADD COLUMN IF NOT EXISTS judgement_policy_profile_version text,
  ADD COLUMN IF NOT EXISTS judgement_evaluation jsonb;

-- 2. Governed-write guard: only the governed operations may write overrides
CREATE OR REPLACE FUNCTION public.supervisory_calculation_override_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(current_setting('app.supervisory_override_ctx', true), '') <> 'governed' THEN
    RAISE EXCEPTION 'governed_operation_required: rating overrides may only be created or decided through the governed override operations'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'immutable_record: a rating override proposal cannot be deleted' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status <> 'PENDING_APPROVAL' THEN
      RAISE EXCEPTION 'immutable_record: a decided rating override cannot be changed' USING ERRCODE = '42501';
    END IF;
    IF NEW.assessment_id <> OLD.assessment_id OR NEW.run_id IS DISTINCT FROM OLD.run_id
       OR NEW.proposed_rating IS DISTINCT FROM OLD.proposed_rating
       OR NEW.rationale IS DISTINCT FROM OLD.rationale
       OR NEW.proposed_by IS DISTINCT FROM OLD.proposed_by
       OR NEW.computed_result_hash IS DISTINCT FROM OLD.computed_result_hash
       OR NEW.judgement_policy_component_id IS DISTINCT FROM OLD.judgement_policy_component_id
       OR NEW.judgement_policy_version IS DISTINCT FROM OLD.judgement_policy_version
       OR NEW.judgement_policy_content_hash IS DISTINCT FROM OLD.judgement_policy_content_hash
       OR NEW.judgement_rule_code IS DISTINCT FROM OLD.judgement_rule_code
       OR NEW.judgement_band_steps IS DISTINCT FROM OLD.judgement_band_steps
       OR NEW.policy_basis_status IS DISTINCT FROM OLD.policy_basis_status THEN
      RAISE EXCEPTION 'immutable_record: the proposal and its policy provenance cannot be rewritten'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS supervisory_calculation_override_guard_trg ON public.supervisory_assessment_calculation_override;
CREATE TRIGGER supervisory_calculation_override_guard_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.supervisory_assessment_calculation_override
FOR EACH ROW EXECUTE FUNCTION public.supervisory_calculation_override_guard();

-- 3. Runtime evaluator, pinned to the assessment's policy basis
CREATE OR REPLACE FUNCTION public.supervisory_assessment_judgement_policy_internal(_assessment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _a public.supervisory_assessment; _snap public.supervisory_assessment_policy_snapshot;
        _bound jsonb; _cid uuid; _comp public.supervisory_policy_component;
        _run public.supervisory_assessment_calculation_run;
        _order jsonb; _rules jsonb; _rule jsonb; _calc text; _ord int;
        _targets jsonb := '[]'::jsonb; _x jsonb; _pending jsonb; _status text; _reason_code text;
        _reason text; _governed boolean := false; _steps int;
BEGIN
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;

  SELECT * INTO _run FROM public.supervisory_assessment_calculation_run
   WHERE assessment_id = _assessment_id ORDER BY run_seq DESC LIMIT 1;
  _calc := CASE WHEN _run.status = 'CALCULATED' THEN _run.recommended_rating ELSE NULL END;
  _order := public.supervisory_methodology_rating_order(_a.methodology_id);

  SELECT * INTO _snap FROM public.supervisory_assessment_policy_snapshot WHERE assessment_id = _assessment_id;
  IF _snap.id IS NULL THEN
    _status := 'NOT_GOVERNED'; _reason_code := 'NO_POLICY_BASIS';
    _reason := 'This assessment has no policy basis snapshot, so no judgement policy governs departure from the calculated rating. The platform''s own override controls, including independent approval and a written reason, continue to apply.';
  ELSE
    SELECT x INTO _bound FROM jsonb_array_elements(_snap.components) x
     WHERE x->>'component_type' = 'JUDGEMENT_POLICY';
    IF _bound IS NULL THEN
      _status := 'NOT_GOVERNED'; _reason_code := 'JUDGEMENT_POLICY_NOT_BOUND';
      _reason := 'The policy profile governing this assessment binds no judgement policy, so only the platform''s own override controls apply.';
    ELSE
      _cid := NULLIF(_bound->>'component_id','')::uuid;
      SELECT * INTO _comp FROM public.supervisory_policy_component WHERE id = _cid;
      IF _comp.id IS NULL THEN
        _status := 'UNAVAILABLE'; _reason_code := 'PINNED_POLICY_MISSING';
        _reason := 'The exact judgement policy version recorded in this assessment''s policy basis can no longer be read, so no override may be proposed until it is restored.';
      ELSE
        _status := 'EVALUATED'; _governed := true; _reason_code := NULL; _reason := NULL;
        _rules := public.supervisory_judgement_policy_rules(_comp.content);
        SELECT r INTO _rule FROM jsonb_array_elements(_rules) r
         WHERE _calc IS NOT NULL AND (r->'applies_to_ratings') @> to_jsonb(_calc)
         LIMIT 1;
        IF _rule IS NULL THEN
          SELECT r INTO _rule FROM jsonb_array_elements(_rules) r
           WHERE jsonb_array_length(r->'applies_to_ratings') = 0 LIMIT 1;
        END IF;
        IF _rule IS NULL THEN
          _reason_code := 'NO_APPLICABLE_RULE';
          _reason := 'The judgement policy governing this assessment states no rule for the calculated rating, so the calculated rating stands and no override may be proposed.';
        END IF;
      END IF;
    END IF;
  END IF;

  IF _calc IS NOT NULL AND jsonb_array_length(_order) > 0 THEN
    SELECT (x->>'ordinal')::int INTO _ord FROM jsonb_array_elements(_order) x WHERE x->>'code' = _calc;
    FOR _x IN SELECT x FROM jsonb_array_elements(_order) x
               WHERE (x->>'code') <> _calc ORDER BY (x->>'ordinal')::int LOOP
      _steps := abs((_x->>'ordinal')::int - COALESCE(_ord, (_x->>'ordinal')::int));
      _targets := _targets || jsonb_build_object(
        'code', _x->>'code', 'label', _x->>'label', 'steps', _steps,
        'movement', CASE WHEN (_x->>'ordinal')::int > COALESCE(_ord,0) THEN 'UPWARD' ELSE 'DOWNWARD' END,
        'permitted', CASE
          WHEN _status = 'UNAVAILABLE' THEN false
          WHEN NOT _governed THEN true
          WHEN _rule IS NULL THEN false
          WHEN NOT COALESCE((_rule->>'override_permitted')::boolean, true) THEN false
          WHEN (_rule->'prohibited_target_ratings') @> to_jsonb(_x->>'code') THEN false
          WHEN _steps > (_rule->>'max_band_steps')::int THEN false
          WHEN _rule->>'direction' = 'UPWARD' AND (_x->>'ordinal')::int < COALESCE(_ord,0) THEN false
          WHEN _rule->>'direction' = 'DOWNWARD' AND (_x->>'ordinal')::int > COALESCE(_ord,0) THEN false
          ELSE true END);
    END LOOP;
  END IF;

  SELECT jsonb_build_object('id', o.id, 'status', o.status, 'proposed_rating', o.proposed_rating,
           'rationale', o.rationale, 'proposed_by', o.proposed_by, 'proposed_at', o.proposed_at,
           'judgement_rule_code', o.judgement_rule_code,
           'judgement_policy_version', o.judgement_policy_version,
           'judgement_band_steps', o.judgement_band_steps)
    INTO _pending FROM public.supervisory_assessment_calculation_override o
   WHERE o.assessment_id = _assessment_id AND o.status = 'PENDING_APPROVAL'
   ORDER BY o.proposed_at DESC LIMIT 1;

  RETURN jsonb_build_object(
    'assessment_id', _assessment_id,
    'status', _status,
    'governed', _governed,
    'reason_code', _reason_code,
    'reason', _reason,
    'evaluated_at', now(),
    'policy', CASE WHEN _comp.id IS NULL THEN NULL::jsonb ELSE jsonb_build_object(
        'component_id', _comp.id, 'code', _comp.code, 'component_version', _comp.component_version,
        'name', _comp.name, 'origin', _comp.origin, 'status', _comp.status,
        'content_hash', _bound->>'content_hash') END,
    'policy_profile', CASE WHEN _snap.id IS NULL THEN NULL::jsonb ELSE jsonb_build_object(
        'profile_id', _snap.policy_profile_id, 'code', _snap.policy_profile_code,
        'version', _snap.policy_profile_version, 'origin', _snap.policy_profile_origin) END,
    'calculation', jsonb_build_object(
        'run_id', _run.id, 'run_seq', _run.run_seq, 'status', _run.status,
        'reason_code', _run.reason_code, 'calculated_rating', _calc,
        'residual_rating', _run.residual_rating, 'result_hash', _run.result_hash),
    'rating_order', _order,
    'rule', _rule,
    'override_permitted', CASE
        WHEN _status = 'UNAVAILABLE' THEN false
        WHEN _calc IS NULL THEN false
        WHEN NOT _governed THEN true
        WHEN _rule IS NULL THEN false
        ELSE COALESCE((_rule->>'override_permitted')::boolean, true) END,
    'direction', CASE WHEN _governed AND _rule IS NOT NULL THEN _rule->>'direction' ELSE 'BOTH' END,
    'max_band_steps', CASE WHEN _governed AND _rule IS NOT NULL
        THEN (_rule->>'max_band_steps')::int
        ELSE GREATEST(jsonb_array_length(_order) - 1, 1) END,
    'prohibited_target_ratings', CASE WHEN _governed AND _rule IS NOT NULL
        THEN _rule->'prohibited_target_ratings' ELSE '[]'::jsonb END,
    'rationale_min_length', CASE WHEN _governed AND _rule IS NOT NULL
        THEN GREATEST((_rule->>'rationale_min_length')::int, 10) ELSE 10 END,
    'rationale_required', true,
    'independent_approval_required', true,
    'target_ratings', _targets,
    'pending_override', _pending);
END $function$;

REVOKE ALL ON FUNCTION public.supervisory_assessment_judgement_policy_internal(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_judgement_policy_internal(uuid) TO service_role;

-- 4. Governed read model for the assessment screens
CREATE OR REPLACE FUNCTION public.supervisory_assessment_judgement_policy_view(_assessment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _a public.supervisory_assessment; _eval jsonb; _ovr jsonb;
        _can_propose boolean := false; _can_decide boolean := false; _actions text[];
BEGIN
  IF _uid IS NULL OR NOT public.supervisory_assessment_question_readable(_uid, _assessment_id) THEN
    RAISE EXCEPTION 'not_authorized: assessment outside your supervisory authority' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  _eval := public.supervisory_assessment_judgement_policy_internal(_assessment_id);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', o.id, 'status', o.status, 'proposed_rating', o.proposed_rating,
           'rationale', o.rationale,
           'computed_recommended_rating', o.computed_recommended_rating,
           'computed_residual_rating', o.computed_residual_rating,
           'proposed_by', o.proposed_by, 'proposed_by_name', pp.full_name, 'proposed_at', o.proposed_at,
           'decided_by', o.decided_by, 'decided_by_name', dp.full_name, 'decided_at', o.decided_at,
           'decision_note', o.decision_note,
           'policy_basis_status', o.policy_basis_status,
           'judgement_policy_code', o.judgement_policy_code,
           'judgement_policy_version', o.judgement_policy_version,
           'judgement_policy_profile_code', o.judgement_policy_profile_code,
           'judgement_policy_profile_version', o.judgement_policy_profile_version,
           'judgement_rule_code', o.judgement_rule_code,
           'judgement_direction', o.judgement_direction,
           'judgement_band_steps', o.judgement_band_steps,
           'judgement_max_band_steps', o.judgement_max_band_steps,
           'is_own_proposal', o.proposed_by = _uid) ORDER BY o.proposed_at DESC), '[]'::jsonb)
    INTO _ovr
    FROM public.supervisory_assessment_calculation_override o
    LEFT JOIN public.profiles pp ON pp.id = o.proposed_by
    LEFT JOIN public.profiles dp ON dp.id = o.decided_by
   WHERE o.assessment_id = _assessment_id;

  _actions := public.supervisory_domain_actions(_a.domain_code, 'approve');
  _can_decide := public.is_super_admin(_uid) OR public.has_any_permission(_uid, _actions);
  BEGIN
    PERFORM public.supervisory_calc_run_authority(_assessment_id);
    _can_propose := true;
  EXCEPTION WHEN OTHERS THEN
    _can_propose := false;
  END;

  RETURN jsonb_build_object(
    'assessment_id', _assessment_id,
    'evaluation', _eval,
    'overrides', _ovr,
    'capabilities', jsonb_build_object(
      'can_propose_override', _can_propose AND COALESCE((_eval->>'override_permitted')::boolean, false),
      'can_decide_override', _can_decide),
    'viewer_id', _uid);
END $function$;

REVOKE ALL ON FUNCTION public.supervisory_assessment_judgement_policy_view(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_judgement_policy_view(uuid) TO authenticated, service_role;

-- 5. Authoring options for judgement policy content
CREATE OR REPLACE FUNCTION public.supervisory_judgement_policy_authoring_options(_component_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _c public.supervisory_policy_component; _meth public.supervisory_methodology;
        _meth_id uuid; _source text; _warnings jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _c FROM public.supervisory_policy_component WHERE id = _component_id;
  IF _c.id IS NULL THEN RAISE EXCEPTION 'not_found: policy component' USING ERRCODE = '22023'; END IF;
  IF _c.component_type <> 'JUDGEMENT_POLICY' THEN
    RAISE EXCEPTION 'invalid_request: authoring options are published for judgement policy only'
      USING ERRCODE = '22023';
  END IF;

  SELECT b2.component_id INTO _meth_id
    FROM public.supervisory_policy_profile_binding b
    JOIN public.supervisory_policy_profile_binding b2
      ON b2.profile_id = b.profile_id AND b2.component_type = 'METHODOLOGY'
    JOIN public.supervisory_policy_profile p ON p.id = b.profile_id
   WHERE b.component_type = 'JUDGEMENT_POLICY' AND b.component_id = _component_id
   ORDER BY CASE p.status WHEN 'ACTIVE' THEN 0 WHEN 'APPROVED' THEN 1 ELSE 2 END, p.updated_at DESC
   LIMIT 1;
  IF _meth_id IS NOT NULL THEN _source := 'BOUND_POLICY_PROFILE'; END IF;

  IF _meth_id IS NULL THEN
    SELECT m.id INTO _meth_id FROM public.supervisory_methodology m
     WHERE m.domain_code = _c.domain_code AND m.status = 'ACTIVE'
       AND (_c.regulator_id IS NULL OR m.regulator_id IS NULL OR m.regulator_id = _c.regulator_id)
     ORDER BY m.activated_at DESC NULLS LAST, m.updated_at DESC LIMIT 1;
    IF _meth_id IS NOT NULL THEN
      _source := 'ACTIVE_DOMAIN_METHODOLOGY';
      _warnings := _warnings || jsonb_build_object('code','METHODOLOGY_NOT_BOUND_YET',
        'message','This judgement policy is not yet bound in a policy profile. The ratings offered come from the methodology currently active for this supervisory domain; check them again once the policy is bound.');
    END IF;
  END IF;

  IF _meth_id IS NULL THEN
    _warnings := _warnings || jsonb_build_object('code','NO_METHODOLOGY_AVAILABLE',
      'message','No methodology is available for this supervisory domain, so the rating vocabulary cannot be offered. Judgement policy may only qualify a bound methodology.');
  ELSE
    SELECT * INTO _meth FROM public.supervisory_methodology WHERE id = _meth_id;
  END IF;

  RETURN jsonb_build_object(
    'component_id', _component_id,
    'component_code', _c.code,
    'component_version', _c.component_version,
    'methodology_id', _meth_id,
    'methodology_code', _meth.code,
    'methodology_version', _meth.version,
    'methodology_source', _source,
    'rating_order', public.supervisory_methodology_rating_order(_meth_id),
    'directions', jsonb_build_array(
      jsonb_build_object('code','UPWARD','label','Upward only (more severe)'),
      jsonb_build_object('code','DOWNWARD','label','Downward only (less severe)'),
      jsonb_build_object('code','BOTH','label','Either direction')),
    'platform_minimums', jsonb_build_object(
      'rationale_min_length', 10, 'independent_approval_required', true),
    'warnings', _warnings);
END $function$;

REVOKE ALL ON FUNCTION public.supervisory_judgement_policy_authoring_options(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_judgement_policy_authoring_options(uuid) TO authenticated, service_role;

-- 6. Proposal converges on the pinned judgement policy
CREATE OR REPLACE FUNCTION public.supervisory_calculation_override_propose(_assessment_id uuid, _proposed_rating text, _rationale text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _a public.supervisory_assessment; _run public.supervisory_assessment_calculation_run;
        _ok boolean; _id uuid; _eval jsonb; _target text; _tgt jsonb; _rule jsonb;
        _min int; _steps int;
BEGIN
  _uid := public.supervisory_calc_run_authority(_assessment_id);
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  _target := upper(btrim(COALESCE(_proposed_rating,'')));

  SELECT * INTO _run FROM public.supervisory_assessment_calculation_run
   WHERE assessment_id = _assessment_id ORDER BY run_seq DESC LIMIT 1;
  IF _run.id IS NULL THEN
    RAISE EXCEPTION 'no_calculation: record a calculation run before proposing an override' USING ERRCODE = '55000';
  END IF;
  IF _run.status <> 'CALCULATED' THEN
    RAISE EXCEPTION 'not_calculated: there is no calculated result to override (%).', _run.reason_code
      USING ERRCODE = '55000';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.supervisory_methodology m,
                      jsonb_array_elements(m.scoring_scale) x
                  WHERE m.id = _a.methodology_id AND x->>'code' = _target)
    INTO _ok;
  IF NOT _ok THEN
    RAISE EXCEPTION 'invalid_rating: % is not on the scoring scale of the methodology bound to this assessment',
      COALESCE(_proposed_rating,'(null)') USING ERRCODE = '22023';
  END IF;

  IF _target = COALESCE(_run.recommended_rating,'') THEN
    RAISE EXCEPTION 'no_difference: the proposed rating equals the calculated recommendation, so there is nothing to override'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.supervisory_assessment_calculation_override o
              WHERE o.assessment_id = _assessment_id AND o.status = 'PENDING_APPROVAL') THEN
    RAISE EXCEPTION 'override_pending: an override proposal is already awaiting a decision' USING ERRCODE = '55000';
  END IF;

  _eval := public.supervisory_assessment_judgement_policy_internal(_assessment_id);
  _rule := _eval->'rule';

  IF _eval->>'status' = 'UNAVAILABLE' THEN
    RAISE EXCEPTION 'judgement_policy_unavailable: %', _eval->>'reason' USING ERRCODE = '55000';
  END IF;

  IF COALESCE((_eval->>'governed')::boolean, false) THEN
    IF _rule IS NULL OR _rule = 'null'::jsonb THEN
      RAISE EXCEPTION 'judgement_policy_no_rule: the judgement policy % version % states no override rule for a calculated rating of %, so the calculated rating stands',
        _eval->'policy'->>'code', _eval->'policy'->>'component_version', COALESCE(_run.recommended_rating,'(none)')
        USING ERRCODE = '55000';
    END IF;
    IF NOT COALESCE((_rule->>'override_permitted')::boolean, true) THEN
      RAISE EXCEPTION 'judgement_policy_forbids_override: rule % of judgement policy % version % does not permit departure from a calculated rating of %',
        _rule->>'rule_code', _eval->'policy'->>'code', _eval->'policy'->>'component_version',
        COALESCE(_run.recommended_rating,'(none)') USING ERRCODE = '42501';
    END IF;

    SELECT t INTO _tgt FROM jsonb_array_elements(_eval->'target_ratings') t WHERE t->>'code' = _target;
    IF _tgt IS NULL THEN
      RAISE EXCEPTION 'judgement_policy_rating_unknown: % is not in the rating vocabulary governed by judgement policy % version %',
        _target, _eval->'policy'->>'code', _eval->'policy'->>'component_version' USING ERRCODE = '22023';
    END IF;
    _steps := (_tgt->>'steps')::int;

    IF (_rule->'prohibited_target_ratings') @> to_jsonb(_target) THEN
      RAISE EXCEPTION 'judgement_policy_target_prohibited: rule % of judgement policy % version % prohibits % as an override target',
        _rule->>'rule_code', _eval->'policy'->>'code', _eval->'policy'->>'component_version', _target
        USING ERRCODE = '42501';
    END IF;
    IF (_rule->>'direction') = 'UPWARD' AND (_tgt->>'movement') = 'DOWNWARD' THEN
      RAISE EXCEPTION 'judgement_policy_direction_refused: rule % of judgement policy % version % permits upward movement only',
        _rule->>'rule_code', _eval->'policy'->>'code', _eval->'policy'->>'component_version' USING ERRCODE = '42501';
    END IF;
    IF (_rule->>'direction') = 'DOWNWARD' AND (_tgt->>'movement') = 'UPWARD' THEN
      RAISE EXCEPTION 'judgement_policy_direction_refused: rule % of judgement policy % version % permits downward movement only',
        _rule->>'rule_code', _eval->'policy'->>'code', _eval->'policy'->>'component_version' USING ERRCODE = '42501';
    END IF;
    IF _steps > (_rule->>'max_band_steps')::int THEN
      RAISE EXCEPTION 'judgement_policy_movement_refused: rule % of judgement policy % version % permits a movement of at most % rating step(s); this proposal moves % step(s)',
        _rule->>'rule_code', _eval->'policy'->>'code', _eval->'policy'->>'component_version',
        (_rule->>'max_band_steps')::int, _steps USING ERRCODE = '42501';
    END IF;
  ELSE
    SELECT t INTO _tgt FROM jsonb_array_elements(_eval->'target_ratings') t WHERE t->>'code' = _target;
    _steps := NULLIF(_tgt->>'steps','')::int;
  END IF;

  _min := GREATEST(COALESCE((_eval->>'rationale_min_length')::int, 10), 10);
  IF length(btrim(COALESCE(_rationale,''))) < _min THEN
    RAISE EXCEPTION 'rationale_required: an override needs a written supervisory reason of at least % characters', _min
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.supervisory_override_ctx', 'governed', true);
  INSERT INTO public.supervisory_assessment_calculation_override(
    assessment_id, run_id, computed_residual_rating, computed_recommended_rating,
    computed_inherent_band, computed_control_band, computed_result_hash,
    proposed_rating, rationale, status, proposed_by,
    policy_basis_status, judgement_policy_component_id, judgement_policy_code,
    judgement_policy_version, judgement_policy_content_hash, judgement_rule_code,
    judgement_direction, judgement_max_band_steps, judgement_band_steps,
    judgement_rationale_min_length, judgement_policy_profile_code, judgement_policy_profile_version,
    judgement_evaluation)
  VALUES (_assessment_id, _run.id, _run.residual_rating, _run.recommended_rating,
    _run.inherent_band, _run.control_band, _run.result_hash,
    _target, btrim(_rationale), 'PENDING_APPROVAL', _uid,
    _eval->>'status', NULLIF(_eval->'policy'->>'component_id','')::uuid, _eval->'policy'->>'code',
    _eval->'policy'->>'component_version', _eval->'policy'->>'content_hash', _rule->>'rule_code',
    COALESCE(_rule->>'direction', _eval->>'direction'),
    NULLIF(COALESCE(_rule->>'max_band_steps', _eval->>'max_band_steps'),'')::int, _steps,
    _min, _eval->'policy_profile'->>'code', _eval->'policy_profile'->>'version',
    _eval)
  RETURNING id INTO _id;
  PERFORM set_config('app.supervisory_override_ctx', '', true);

  RETURN _id;
END $function$;

-- 7. Decision records the pinned policy it was decided under
CREATE OR REPLACE FUNCTION public.supervisory_calculation_override_decide(_override_id uuid, _decision text, _note text DEFAULT NULL::text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _o public.supervisory_assessment_calculation_override; _dec text; _comp_hash text;
BEGIN
  SELECT * INTO _o FROM public.supervisory_assessment_calculation_override WHERE id = _override_id;
  IF _o.id IS NULL THEN RAISE EXCEPTION 'not_found: override' USING ERRCODE = '22023'; END IF;

  _uid := public.supervisory_calc_run_authority(_o.assessment_id);
  _dec := upper(btrim(COALESCE(_decision,'')));
  IF _dec NOT IN ('APPROVED','REJECTED') THEN
    RAISE EXCEPTION 'invalid_decision: an override is either approved or rejected' USING ERRCODE = '22023';
  END IF;
  IF _o.status <> 'PENDING_APPROVAL' THEN
    RAISE EXCEPTION 'already_decided: this override is %', _o.status USING ERRCODE = '55000';
  END IF;
  IF _o.proposed_by IS NOT NULL AND _o.proposed_by = _uid THEN
    RAISE EXCEPTION 'maker_checker: the person who proposed an override may not decide it' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.is_super_admin(_uid)
          OR public.has_any_permission(_uid,
               public.supervisory_domain_actions(
                 (SELECT domain_code FROM public.supervisory_assessment WHERE id = _o.assessment_id), 'approve'))) THEN
    RAISE EXCEPTION 'not_authorized: deciding a rating override requires approval authority in this supervisory domain'
      USING ERRCODE = '42501';
  END IF;
  IF _dec = 'REJECTED' AND length(btrim(COALESCE(_note,''))) < 10 THEN
    RAISE EXCEPTION 'note_required: rejecting an override needs a written reason of at least 10 characters'
      USING ERRCODE = '22023';
  END IF;

  IF _dec = 'APPROVED' AND _o.judgement_policy_component_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.supervisory_policy_component c
                    WHERE c.id = _o.judgement_policy_component_id) THEN
      RAISE EXCEPTION 'judgement_policy_unavailable: the judgement policy version this override was proposed under can no longer be read, so it cannot be approved'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  PERFORM set_config('app.supervisory_override_ctx', 'governed', true);
  UPDATE public.supervisory_assessment_calculation_override
     SET status = _dec, decided_by = _uid, decided_at = now(),
         decision_note = NULLIF(btrim(COALESCE(_note,'')),'')
   WHERE id = _override_id;
  PERFORM set_config('app.supervisory_override_ctx', '', true);

  RETURN _dec;
END $function$;

-- 8. Profile compatibility delegates judgement checks to the dedicated function
DO $mig$
DECLARE _def text; _new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'supervisory_policy_profile_compatibility';

  _new := regexp_replace(_def,
    E'ELSIF _row\\.component_type = ''JUDGEMENT_POLICY'' THEN.*?(\\n    ELSIF _row\\.component_type = ''SECTOR_OVERLAY'')',
    E'ELSIF _row.component_type = ''JUDGEMENT_POLICY'' THEN\n      _f := _f || public.supervisory_judgement_policy_compatibility(_profile_id, _row.id, _meth_id);\\1');

  IF _new = _def OR position('supervisory_judgement_policy_compatibility' in _new) = 0 THEN
    RAISE EXCEPTION 'judgement compatibility delegation could not be applied';
  END IF;
  EXECUTE _new;
END $mig$;