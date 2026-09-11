CREATE OR REPLACE FUNCTION public.supervisory_domain_approval_actions(_domain_code text)
RETURNS text[]
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN public.supervisory_domain_module(_domain_code) IS NULL
              THEN ARRAY['supervisory_spine.approve']
              ELSE ARRAY[public.supervisory_domain_module(_domain_code) || '.approve'] END;
$function$;

REVOKE ALL ON FUNCTION public.supervisory_domain_approval_actions(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_domain_approval_actions(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.supervisory_calculation_override_decide(_override_id uuid, _decision text, _note text DEFAULT NULL::text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _o public.supervisory_assessment_calculation_override; _dec text; _domain text;
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

  SELECT domain_code INTO _domain FROM public.supervisory_assessment WHERE id = _o.assessment_id;
  IF NOT (public.is_super_admin(_uid)
          OR public.has_any_permission(_uid, public.supervisory_domain_approval_actions(_domain))
          OR public.has_any_permission(_uid,
               ARRAY[public.supervisory_domain_module(_domain) || '.manage_config'])) THEN
    RAISE EXCEPTION 'not_authorized: deciding a rating override requires approval or configuration authority in this supervisory domain'
      USING ERRCODE = '42501';
  END IF;

  IF _dec = 'REJECTED' AND length(btrim(COALESCE(_note,''))) < 10 THEN
    RAISE EXCEPTION 'note_required: rejecting an override needs a written reason of at least 10 characters'
      USING ERRCODE = '22023';
  END IF;

  IF _dec = 'APPROVED' AND _o.judgement_policy_component_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.supervisory_policy_component c
                      WHERE c.id = _o.judgement_policy_component_id) THEN
    RAISE EXCEPTION 'judgement_policy_unavailable: the judgement policy version this override was proposed under can no longer be read, so it cannot be approved'
      USING ERRCODE = '55000';
  END IF;

  PERFORM set_config('app.supervisory_override_ctx', 'governed', true);
  UPDATE public.supervisory_assessment_calculation_override
     SET status = _dec, decided_by = _uid, decided_at = now(),
         decision_note = NULLIF(btrim(COALESCE(_note,'')),'')
   WHERE id = _override_id;
  PERFORM set_config('app.supervisory_override_ctx', '', true);

  RETURN _dec;
END $function$;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_judgement_policy_view(_assessment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _a public.supervisory_assessment; _eval jsonb; _ovr jsonb;
        _can_propose boolean := false; _can_decide boolean := false;
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

  _can_decide := public.is_super_admin(_uid)
    OR public.has_any_permission(_uid, public.supervisory_domain_approval_actions(_a.domain_code))
    OR public.has_any_permission(_uid,
         ARRAY[public.supervisory_domain_module(_a.domain_code) || '.manage_config']);

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