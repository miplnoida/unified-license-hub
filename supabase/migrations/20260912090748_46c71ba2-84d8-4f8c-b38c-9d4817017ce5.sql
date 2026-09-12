-- PCOMP-R2E-C : canonical policy-action <-> operational-action convergence.
-- The canonical map already exists (supervisory_response_policy_action_map).
-- Only the inverse resolution was missing, so the SLA evaluator was handed the
-- operational AML-08 action and could never match a regulator-facing rule.

CREATE OR REPLACE FUNCTION public.supervisory_response_policy_policy_action(_action text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT m->>'policy_action'
    FROM jsonb_array_elements(public.supervisory_response_policy_action_map()) m
   WHERE m->>'operational_action' = upper(btrim(COALESCE(_action,'')))
      OR m->>'policy_action'      = upper(btrim(COALESCE(_action,'')))
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.supervisory_response_policy_policy_action(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_response_policy_policy_action(text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------- evaluator --
CREATE OR REPLACE FUNCTION public.supervisory_sla_policy_internal(_assessment_id uuid, _action text, _rating text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _a public.supervisory_assessment; _snap public.supervisory_assessment_policy_snapshot;
        _bound jsonb; _cid uuid; _comp public.supervisory_policy_component;
        _rules jsonb; _rule jsonb; _act text; _pact text; _oact text; _band text;
        _status text; _reason_code text; _reason text; _governed boolean := false;
        _hours numeric; _cal uuid; _calres text; _prof jsonb;
BEGIN
  _act  := NULLIF(upper(btrim(COALESCE(_action,''))),'');
  _band := NULLIF(upper(btrim(COALESCE(_rating,''))),'');

  -- One canonical owner converts between the regulator-facing policy action and
  -- the operational AML-08 action. Resolution is exact: an unknown action stays
  -- itself and matches nothing by accident.
  _pact := COALESCE(public.supervisory_response_policy_policy_action(_act), _act);
  _oact := COALESCE(public.supervisory_response_policy_operational_action(_act), _act);

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
           WHERE (r->>'applies_to_action' IS NULL
                  OR r->>'applies_to_action' = _pact
                  OR r->>'applies_to_action' = _oact
                  OR r->>'operational_action' = _oact)
             AND (r->>'risk_band' IS NULL OR r->>'risk_band' = _band)
           ORDER BY (CASE WHEN r->>'applies_to_action' = _pact
                            OR r->>'applies_to_action' = _oact
                            OR r->>'operational_action' = _oact THEN 0 ELSE 1 END)
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
    'policy_action', _pact,
    'operational_action', _oact,
    'source_rating', _band,
    'status', _status,
    'governed', _governed,
    'reason_code', _reason_code,
    'reason', _reason,
    'evaluated_at', now(),
    'policy', CASE WHEN _comp.id IS NULL THEN NULL::jsonb ELSE jsonb_build_object(
      'component_id', _comp.id, 'code', _comp.code, 'component_version', _comp.component_version,
      'name', _comp.name, 'origin', _comp.origin, 'status', _comp.status,
      'content_hash', public.supervisory_policy_component_content_hash(_comp.component_type, _comp.id)) END,
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

-- ------------------------------------------------------ provenance columns --
ALTER TABLE public.supervisory_response_sla_obligation
  ADD COLUMN IF NOT EXISTS policy_action text,
  ADD COLUMN IF NOT EXISTS operational_action text;

-- ------------------------------------------------------------ obligation ----
CREATE OR REPLACE FUNCTION public.supervisory_response_sla_open(_decision_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _d public.supervisory_consequence_decision; _eval jsonb; _rule jsonb;
        _key uuid := gen_random_uuid(); _stage uuid; _proc text; _oid uuid;
BEGIN
  SELECT * INTO _d FROM public.supervisory_consequence_decision WHERE id = _decision_id;
  IF _d.id IS NULL THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.supervisory_response_sla_obligation WHERE decision_id = _decision_id) THEN
    RETURN NULL;
  END IF;

  _eval := public.supervisory_sla_policy_internal(_d.assessment_id, _d.action_type, _d.source_rating);
  _rule := _eval->'rule';
  _proc := COALESCE(NULLIF(_rule->>'escalation_tier_profile',''), 'aml_supervisory_response');

  IF COALESCE((_eval->>'governed')::boolean, false) THEN
    _stage := public.sla_stage_open(
      _proc, 'aml_supervisory_response', _key, _key, NULL,
      COALESCE(NULLIF(_rule->>'stage',''), _d.action_type), _d.decided_at,
      (_eval->'resolved'->>'sla_hours')::numeric,
      NULLIF(_eval->'resolved'->>'calendar_profile_id','')::uuid,
      'policy',
      jsonb_build_object(
        'sla_policy_code', _eval->'policy'->>'code',
        'sla_policy_version', _eval->'policy'->>'component_version',
        'sla_policy_rule_code', _rule->>'rule_code',
        'sla_calendar_mode', _rule->>'calendar_mode',
        'supervisory_decision_id', _d.id,
        'supervisory_entity_id', _d.entity_id,
        'sla_policy_action', _eval->>'policy_action',
        'supervisory_action', _d.action_type));
  END IF;

  PERFORM set_config('supervisory.sla_writer','on', true);
  INSERT INTO public.supervisory_response_sla_obligation(
    decision_id, entity_id, domain_code, assessment_id, source_rating, action_type,
    policy_action, operational_action,
    obligation_key, stage_instance_id, process_type, stage_name,
    sla_policy_basis_status, sla_policy_reason_code,
    sla_policy_component_id, sla_policy_code, sla_policy_version, sla_policy_content_hash,
    sla_policy_profile_code, sla_policy_profile_version, sla_policy_rule_code,
    sla_duration_days, sla_calendar_mode, sla_hours, calendar_profile_id, calendar_resolution,
    pause_permitted, pause_reasons, warning_percentage, escalation_tier_profile, breach_severity,
    response_policy_rule_code, response_policy_advisory_timeframe_days,
    due_at, outcome)
  VALUES (
    _d.id, _d.entity_id, _d.domain_code, _d.assessment_id, _d.source_rating, _d.action_type,
    _eval->>'policy_action', _eval->>'operational_action',
    _key, _stage, CASE WHEN _stage IS NULL THEN NULL ELSE _proc END,
    NULLIF(_rule->>'stage',''),
    _eval->>'status', _eval->>'reason_code',
    NULLIF(_eval->'policy'->>'component_id','')::uuid,
    _eval->'policy'->>'code', _eval->'policy'->>'component_version',
    _eval->'policy'->>'content_hash',
    _eval->'policy_profile'->>'code', _eval->'policy_profile'->>'version',
    _rule->>'rule_code',
    NULLIF(_rule->>'duration_days','')::numeric, _rule->>'calendar_mode',
    (_eval->'resolved'->>'sla_hours')::numeric,
    NULLIF(_eval->'resolved'->>'calendar_profile_id','')::uuid,
    _eval->'resolved'->>'calendar_resolution',
    COALESCE((_rule->>'pause_permitted')::boolean,false),
    COALESCE(_rule->'pause_reasons','[]'::jsonb),
    NULLIF(_rule->>'warning_percentage','')::numeric,
    NULLIF(_rule->>'escalation_tier_profile',''), _rule->>'breach_severity',
    _d.response_policy_rule_code, _d.response_policy_advisory_timeframe_days,
    (SELECT due_at FROM public.sla_stage_instances WHERE id = _stage),
    CASE WHEN _stage IS NULL THEN 'NOT_APPLICABLE' ELSE 'PENDING' END)
  RETURNING id INTO _oid;
  PERFORM set_config('supervisory.sla_writer','off', true);

  RETURN _oid;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('supervisory.sla_writer','off', true);
  RAISE WARNING 'PCOMP-R2D: governed SLA could not be opened for consequence % (%)', _decision_id, SQLERRM;
  RETURN NULL;
END $function$;

-- -------------------------------------------------------------- read model --
CREATE OR REPLACE FUNCTION public.supervisory_response_sla_view(_entity_id uuid, _domain_code text DEFAULT 'AML_CFT'::text, _assessment_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _d text := upper(COALESCE(NULLIF(_domain_code,''),'AML_CFT'));
        _view jsonb; _src jsonb; _aid uuid; _rating text; _exp jsonb := '[]'::jsonb;
        _m jsonb; _e jsonb; _obl jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501';
  END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _entity_id);

  _view   := public.supervisory_consequence_view(_entity_id, _d, _assessment_id);
  _src    := _view->'source';
  _aid    := COALESCE(_assessment_id, NULLIF(_src->'assessment'->>'id','')::uuid);
  _rating := _src->>'current_rating';

  FOR _m IN SELECT x FROM jsonb_array_elements(public.supervisory_response_policy_action_map()) x LOOP
    _e := public.supervisory_sla_policy_internal(_aid, _m->>'policy_action', _rating);
    _exp := _exp || jsonb_build_object(
      'action', _m->>'policy_action',
      'policy_action', _m->>'policy_action',
      'operational_action', _m->>'operational_action',
      'label', _m->>'label',
      'status', _e->>'status',
      'governed', (_e->>'governed')::boolean,
      'reason_code', _e->>'reason_code',
      'reason', _e->>'reason',
      'rule_code', _e->'rule'->>'rule_code',
      'stage', _e->'rule'->>'stage',
      'duration_days', NULLIF(_e->'rule'->>'duration_days','')::numeric,
      'calendar_mode', _e->'rule'->>'calendar_mode',
      'pause_permitted', COALESCE((_e->'rule'->>'pause_permitted')::boolean,false),
      'pause_reasons', COALESCE(_e->'rule'->'pause_reasons','[]'::jsonb),
      'warning_percentage', NULLIF(_e->'rule'->>'warning_percentage','')::numeric,
      'escalation_tier_profile', _e->'rule'->>'escalation_tier_profile',
      'breach_severity', _e->'rule'->>'breach_severity',
      'policy_note', _e->'rule'->>'policy_note',
      'policy', _e->'policy',
      'policy_profile', _e->'policy_profile');
  END LOOP;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'obligation_id', o.id, 'decision_id', o.decision_id,
           'action_type', o.action_type,
           'policy_action', o.policy_action,
           'operational_action', COALESCE(o.operational_action, o.action_type),
           'stage_name', o.stage_name,
           'sla_policy_basis_status', o.sla_policy_basis_status,
           'sla_policy_reason_code', o.sla_policy_reason_code,
           'sla_policy_code', o.sla_policy_code,
           'sla_policy_version', o.sla_policy_version,
           'sla_policy_rule_code', o.sla_policy_rule_code,
           'sla_duration_days', o.sla_duration_days,
           'sla_calendar_mode', o.sla_calendar_mode,
           'calendar_resolution', o.calendar_resolution,
           'pause_permitted', o.pause_permitted,
           'pause_reasons', o.pause_reasons,
           'breach_severity', o.breach_severity,
           'escalation_tier_profile', o.escalation_tier_profile,
           'due_at', o.due_at, 'outcome', o.outcome, 'closed_at', o.closed_at,
           'recorded_at', o.created_at,
           'stage', CASE WHEN s.id IS NULL THEN NULL::jsonb ELSE jsonb_build_object(
             'stage_instance_id', s.id, 'state', s.state, 'started_at', s.started_at,
             'due_at', s.due_at, 'paused_at', s.paused_at, 'pause_seconds', s.pause_seconds,
             'breached_at', s.breached_at, 'completed_at', s.completed_at,
             'sla_hours', s.sla_hours, 'sla_source', s.sla_source,
             'first_breach_notified_at', s.first_breach_notified_at) END,
           'escalations', COALESCE((
             SELECT jsonb_agg(jsonb_build_object('tier', x.tier, 'dispatched_at', x.dispatched_at,
                                                 'recipients', x.recipients) ORDER BY x.tier)
               FROM public.sla_escalation_dispatches x
              WHERE x.workflow_instance_id = o.obligation_key), '[]'::jsonb))
         ORDER BY o.created_at DESC), '[]'::jsonb)
    INTO _obl
    FROM public.supervisory_response_sla_obligation o
    LEFT JOIN public.sla_stage_instances s ON s.id = o.stage_instance_id
   WHERE o.entity_id = _entity_id AND o.domain_code = _d;

  RETURN jsonb_build_object(
    'entity_id', _entity_id, 'domain_code', _d,
    'assessment_id', _aid, 'source_rating', _rating,
    'expectations', _exp,
    'obligations', _obl,
    'timing_authority','SLA_POLICY',
    'engine','PLATFORM_SLA_STAGE_ENGINE',
    'automation','Deadlines, holds, breaches and escalation are recorded by the platform SLA engine. No supervisory action, finding or enforcement case is ever created or closed automatically.');
END $function$;