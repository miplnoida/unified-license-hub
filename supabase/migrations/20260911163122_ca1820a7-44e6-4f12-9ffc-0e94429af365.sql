-- PCOMP-R2D (4): correct policy profile provenance column names.
CREATE OR REPLACE FUNCTION public.supervisory_sla_policy_internal(
  _assessment_id uuid, _action text, _rating text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _a public.supervisory_assessment; _snap public.supervisory_assessment_policy_snapshot;
        _bound jsonb; _cid uuid; _comp public.supervisory_policy_component;
        _rules jsonb; _rule jsonb; _act text; _band text;
        _status text; _reason_code text; _reason text; _governed boolean := false;
        _hours numeric; _cal uuid; _calres text; _prof jsonb;
BEGIN
  _act  := NULLIF(upper(btrim(COALESCE(_action,''))),'');
  _band := NULLIF(upper(btrim(COALESCE(_rating,''))),'');

  IF _assessment_id IS NOT NULL THEN
    SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  END IF;

  IF _a.id IS NULL THEN
    _status := 'NOT_GOVERNED'; _reason_code := 'NO_ASSESSMENT_SOURCE';
    _reason := 'This supervisory response has no authoritative assessment source, so no SLA policy governs when it is due. Existing platform SLA configuration and supervisory judgement continue to apply.';
  ELSE
    SELECT * INTO _snap FROM public.supervisory_assessment_policy_snapshot WHERE assessment_id = _a.id;
    IF _snap.id IS NULL THEN
      _status := 'NOT_GOVERNED'; _reason_code := 'NO_POLICY_BASIS';
      _reason := 'This assessment carries no policy basis, so no SLA policy governs the timing of responses drawn from it.';
    ELSE
      SELECT x INTO _bound FROM jsonb_array_elements(_snap.components) x
       WHERE x->>'component_type' = 'SLA_POLICY';
      IF _bound IS NULL THEN
        _status := 'NOT_GOVERNED'; _reason_code := 'SLA_POLICY_NOT_BOUND';
        _reason := 'The policy profile governing this assessment binds no SLA policy, so response timing remains advisory and subject to supervisory judgement.';
      ELSE
        _cid := NULLIF(_bound->>'component_id','')::uuid;
        SELECT * INTO _comp FROM public.supervisory_policy_component WHERE id = _cid;
        IF _comp.id IS NULL THEN
          _status := 'UNAVAILABLE'; _reason_code := 'PINNED_POLICY_MISSING';
          _reason := 'The exact SLA policy version recorded in this assessment''s policy basis can no longer be read, so no governed deadline can be established from it.';
        ELSE
          _rules := public.supervisory_sla_policy_rules(_comp.content);

          SELECT r INTO _rule FROM jsonb_array_elements(_rules) r
           WHERE (r->>'applies_to_action' IS NULL OR r->>'applies_to_action' = _act)
             AND (r->>'risk_band' IS NULL OR r->>'risk_band' = _band)
           ORDER BY (CASE WHEN r->>'applies_to_action' = _act THEN 0 ELSE 1 END)
                  + (CASE WHEN r->>'risk_band' = _band THEN 0 ELSE 1 END)
           LIMIT 1;

          IF _rule IS NULL THEN
            _status := 'NOT_GOVERNED'; _reason_code := 'NO_MATCHING_SLA_RULE';
            _reason := 'The bound SLA policy states no deadline for this supervisory response at this risk rating, so its timing remains a matter of supervisory judgement.';
          ELSE
            _status := 'EVALUATED'; _governed := true;
            _hours := (_rule->>'duration_days')::numeric * 24.0;
            IF _rule->>'calendar_mode' = 'BUSINESS_DAYS' THEN
              SELECT id INTO _cal FROM public.business_calendar_profiles
               ORDER BY COALESCE(is_default,false) DESC, created_at ASC LIMIT 1;
              _calres := CASE WHEN _cal IS NULL
                THEN 'NO_BUSINESS_CALENDAR_CONFIGURED' ELSE 'BUSINESS_CALENDAR' END;
            ELSE
              _cal := NULL; _calres := 'CALENDAR_DAYS';
            END IF;
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;

  IF _snap.id IS NOT NULL THEN
    _prof := jsonb_build_object(
      'profile_id', _snap.policy_profile_id,
      'code', _snap.policy_profile_code,
      'version', _snap.policy_profile_version,
      'origin', _snap.policy_profile_origin);
  END IF;

  RETURN jsonb_build_object(
    'assessment_id', _assessment_id,
    'action', _act,
    'source_rating', _band,
    'status', _status,
    'governed', _governed,
    'reason_code', _reason_code,
    'reason', _reason,
    'evaluated_at', now(),
    'policy', CASE WHEN _comp.id IS NULL THEN NULL::jsonb ELSE jsonb_build_object(
      'component_id', _comp.id, 'code', _comp.code, 'component_version', _comp.component_version,
      'name', _comp.name, 'origin', _comp.origin, 'status', _comp.status,
      'content_hash', _comp.content_hash) END,
    'policy_profile', _prof,
    'rule', _rule,
    'resolved', CASE WHEN NOT _governed THEN NULL::jsonb ELSE jsonb_build_object(
      'sla_hours', _hours,
      'calendar_profile_id', _cal,
      'calendar_resolution', _calres) END,
    'timing_authority','SLA_POLICY',
    'engine','PLATFORM_SLA_STAGE_ENGINE',
    'automation','SLA policy establishes when a recorded supervisory response is due, overdue and escalated. It never creates, approves or closes a supervisory action, finding or enforcement case.');
END $function$;

REVOKE ALL ON FUNCTION public.supervisory_sla_policy_internal(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_sla_policy_internal(uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.supervisory_sla_policy_internal(uuid, text, text) IS
'PCOMP-R2D. Resolves the SLA policy governing one supervisory response exclusively through the assessment''s immutable policy basis. EVALUATED, NOT_GOVERNED (no assessment source / no policy basis / SLA policy not bound / no matching rule) or UNAVAILABLE (pinned policy missing). Service-role only; supervisors read supervisory_response_sla_view.';