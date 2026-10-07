-- AML-CLOSE-08A: SLA policy hold reasons become authorable through the governed screen.
CREATE OR REPLACE FUNCTION public.supervisory_policy_vocabulary(_kind text, _profile_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _k text; _out jsonb; _calc uuid; _meth uuid;
BEGIN
  _k := upper(btrim(COALESCE(_kind,'')));

  IF _profile_id IS NOT NULL THEN
    SELECT component_id INTO _calc FROM public.supervisory_policy_profile_binding
     WHERE profile_id = _profile_id AND component_type = 'CALCULATION_CONFIG';
    SELECT component_id INTO _meth FROM public.supervisory_policy_profile_binding
     WHERE profile_id = _profile_id AND component_type = 'METHODOLOGY';
  END IF;

  IF _k = 'RISK_BAND' THEN
    IF _calc IS NOT NULL THEN
      SELECT COALESCE(jsonb_agg(DISTINCT b.band_code), '[]'::jsonb) INTO _out
        FROM public.supervisory_calculation_band b WHERE b.config_id = _calc;
    END IF;
    IF _out IS NULL OR jsonb_array_length(_out) = 0 THEN
      SELECT COALESCE(jsonb_agg(DISTINCT s.code), '[]'::jsonb) INTO _out
        FROM public.supervisory_rating_scale s WHERE s.is_active;
    END IF;

  ELSIF _k = 'RISK_BAND_ORDERED' THEN
    SELECT COALESCE(jsonb_agg(s.code ORDER BY s.ordinal), '[]'::jsonb) INTO _out
      FROM public.supervisory_rating_scale s WHERE s.is_active;

  ELSIF _k = 'CONSEQUENCE_ACTION' THEN
    _out := jsonb_build_array('SUPERVISORY_PLAN','REASSESSMENT_REQUIREMENT','SUPERVISORY_INTERVENTION',
                              'EXAMINATION','SUPERVISORY_FINDING','ENFORCEMENT_ACTION');

  ELSIF _k = 'WORKFLOW_STAGE' THEN
    SELECT COALESCE(jsonb_agg(DISTINCT x), '[]'::jsonb) INTO _out FROM (
      SELECT upper(k.key) AS x FROM public.lifecycle_stages k WHERE k.is_active
      UNION SELECT upper(v) FROM unnest(ARRAY['DRAFT','SUBMITTED','REVIEWED','RETURNED_FOR_REVISION',
                                              'APPROVED','CLOSED']) v) s;

  ELSIF _k = 'SLA_PAUSE_REASON' THEN
    -- AML-CLOSE-08A: hold reasons already stated in governed (non-draft) SLA policy; never invented here.
    SELECT COALESCE(jsonb_agg(DISTINCT upper(r) ORDER BY upper(r)), '[]'::jsonb) INTO _out
      FROM public.supervisory_policy_component c,
           jsonb_array_elements(COALESCE(c.content->'stages','[]'::jsonb)) st,
           jsonb_array_elements_text(COALESCE(st->'pause_reasons','[]'::jsonb)) r
     WHERE c.component_type = 'SLA_POLICY'
       AND c.origin = 'REGULATOR_AUTHORED'
       AND c.status IN ('APPROVED','ACTIVE','SUPERSEDED','RETIRED');

  ELSIF _k = 'EVIDENCE_SCOPE' THEN
    _out := jsonb_build_array('ASSESSMENT','DIMENSION','QUESTION');

  ELSIF _k = 'EVIDENCE_KIND' THEN
    SELECT COALESCE(jsonb_agg(t.code ORDER BY t.code), '[]'::jsonb) INTO _out
      FROM public.supervisory_evidence_basis_type t;

  ELSIF _k = 'SECTOR' THEN
    SELECT COALESCE(jsonb_agg(DISTINCT upper(s.code)), '[]'::jsonb) INTO _out
      FROM public.sectors s WHERE s.code IS NOT NULL;

  ELSIF _k = 'FACT' THEN
    IF _meth IS NOT NULL THEN
      SELECT COALESCE(jsonb_agg(DISTINCT upper(f.fact_code)), '[]'::jsonb) INTO _out
        FROM public.supervisory_methodology_fact_requirement f WHERE f.methodology_id = _meth;
    ELSE
      SELECT COALESCE(jsonb_agg(DISTINCT upper(f.fact_code)), '[]'::jsonb) INTO _out
        FROM public.supervisory_methodology_fact_requirement f;
    END IF;

  ELSIF _k = 'SOURCE_KIND' THEN
    _out := jsonb_build_array('RETURN','FORM','MANUAL','EXTERNAL','DERIVED');

  ELSIF _k = 'METRIC' THEN
    SELECT COALESCE(jsonb_agg(DISTINCT upper(m.code)), '[]'::jsonb) INTO _out
      FROM public.regulatory_metrics m WHERE COALESCE(m.is_active,true);

  ELSIF _k = 'NOTIFICATION_EVENT' THEN
    SELECT COALESCE(jsonb_agg(DISTINCT upper(c.event_key)), '[]'::jsonb) INTO _out
      FROM public.notification_event_configs c WHERE COALESCE(c.is_active,true);

  ELSIF _k = 'NOTIFICATION_CHANNEL' THEN
    _out := jsonb_build_array('EMAIL','IN_APP','SMS');

  ELSIF _k = 'RECIPIENT_ROLE' THEN
    SELECT COALESCE(jsonb_agg(DISTINCT upper(e.enumlabel)), '[]'::jsonb) INTO _out
      FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'workflow_notification_recipient';

  ELSIF _k = 'MATERIALITY_MEASURE' THEN
    SELECT COALESCE(jsonb_agg(DISTINCT upper(x)), '[]'::jsonb) INTO _out FROM (
      SELECT r.parameter_code AS x FROM public.supervisory_calculation_materiality_rule r
       WHERE _calc IS NULL OR r.config_id = _calc
      UNION SELECT r.fact_code FROM public.supervisory_calculation_materiality_rule r
       WHERE (_calc IS NULL OR r.config_id = _calc) AND r.fact_code IS NOT NULL
      UNION SELECT f.fact_code FROM public.supervisory_methodology_fact_requirement f
       WHERE _meth IS NULL OR f.methodology_id = _meth) s;

  ELSE
    RAISE EXCEPTION 'unknown_vocabulary: %', _k USING ERRCODE = '22023';
  END IF;

  RETURN COALESCE(_out, '[]'::jsonb);
END $function$;

CREATE OR REPLACE FUNCTION public.supervisory_policy_component_content_contract(_component_type text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE upper(btrim(COALESCE(_component_type,'')))
    WHEN 'SECTOR_OVERLAY' THEN jsonb_build_object(
      'collection','sectors','item_label','sector rule',
      'required_fields', jsonb_build_array('sector_code','applicability'),
      'enums', jsonb_build_object('applicability', jsonb_build_array('APPLICABLE','NOT_APPLICABLE','MODIFIED')))
    WHEN 'FACT_CONFIG' THEN jsonb_build_object(
      'collection','facts','item_label','fact',
      'required_fields', jsonb_build_array('fact_code','data_type'),
      'enums', jsonb_build_object('data_type', jsonb_build_array('NUMBER','TEXT','BOOLEAN','DATE','PERCENT')))
    WHEN 'SOURCE_BINDING' THEN jsonb_build_object(
      'collection','bindings','item_label','source binding',
      'required_fields', jsonb_build_array('fact_code','source_kind','source_reference'),
      'enums', jsonb_build_object('source_kind', jsonb_build_array('RETURN','FORM','MANUAL','EXTERNAL','DERIVED')))
    WHEN 'EVIDENCE_POLICY' THEN jsonb_build_object(
      'collection','rules','item_label','evidence rule',
      'runtime','EVIDENCE_POLICY_RUNTIME',
      'canonical_owner','AML-05 assessment evidence basis (supervisory_assessment_evidence_basis)',
      'required_fields', jsonb_build_array('rule_code','scope_type','evidence_requirement'),
      'field_aliases', jsonb_build_object(
        'scope_type','scope','evidence_requirement','sufficiency','permitted_source_kinds','evidence_kind'),
      'enums', jsonb_build_object(
        'scope_type', jsonb_build_array('ASSESSMENT','DIMENSION','QUESTION'),
        'evidence_requirement', jsonb_build_array('REQUIRED','OPTIONAL','NOT_REQUIRED')),
      'enum_arrays', jsonb_build_object(
        'permitted_source_kinds', public.supervisory_policy_vocabulary('EVIDENCE_KIND'),
        'required_source_kinds', public.supervisory_policy_vocabulary('EVIDENCE_KIND')),
      'booleans', jsonb_build_array('rationale_required','exception_allowed','exception_approval_required'),
      'positive_numbers', jsonb_build_array('minimum_items','maximum_age_days','independent_sources_required'))
    WHEN 'MATERIALITY_POLICY' THEN jsonb_build_object(
      'collection','thresholds','item_label','materiality threshold',
      'required_fields', jsonb_build_array('measure','operator','value'),
      'enums', jsonb_build_object('operator', jsonb_build_array('GT','GTE','LT','LTE','EQ')))
    WHEN 'JUDGEMENT_POLICY' THEN jsonb_build_object(
      'collection','rules','item_label','override rule',
      'runtime','JUDGEMENT_POLICY_RUNTIME',
      'canonical_owner','AML calculation override engine (supervisory_assessment_calculation_override)',
      'required_fields', jsonb_build_array('rule_code','direction','max_band_steps'),
      'field_aliases', jsonb_build_object(
        'direction','permitted_direction','max_band_steps','maximum_band_steps',
        'applies_to_ratings','applies_to_calculated_ratings',
        'rationale_min_length','minimum_rationale_length'),
      'enums', jsonb_build_object('direction', jsonb_build_array('UPWARD','DOWNWARD','BOTH')),
      'booleans', jsonb_build_array('override_permitted','rationale_required'),
      'enum_arrays', jsonb_build_object(
        'applies_to_ratings', public.supervisory_policy_vocabulary('RISK_BAND_ORDERED'),
        'prohibited_target_ratings', public.supervisory_policy_vocabulary('RISK_BAND_ORDERED')),
      'positive_numbers', jsonb_build_array('max_band_steps','rationale_min_length'),
      'platform_minimums', jsonb_build_object(
        'independent_approval_required', true,
        'rationale_min_length', 10))
    WHEN 'RESPONSE_POLICY' THEN jsonb_build_object(
      'collection','responses','item_label','supervisory response',
      'runtime','RESPONSE_POLICY_RUNTIME',
      'canonical_owner','AML-08 supervisory consequence engine (supervisory_consequence_decision / supervisory_consequence_record)',
      'required_fields', jsonb_build_array('rule_code','risk_band','action','response_level'),
      'field_aliases', jsonb_build_object(
        'action','supervisory_action','response_level','policy_expectation',
        'risk_band','rating','policy_note','note'),
      'enums', jsonb_build_object(
        'response_level', jsonb_build_array('REQUIRED','RECOMMENDED','PERMITTED','PROHIBITED'),
        'risk_band', public.supervisory_policy_vocabulary('RISK_BAND_ORDERED'),
        'action', (SELECT COALESCE(jsonb_agg(m->>'policy_action'), '[]'::jsonb)
                     FROM jsonb_array_elements(public.supervisory_response_policy_action_map()) m)),
      'booleans', jsonb_build_array('rationale_required','deferral_allowed'),
      'positive_numbers', jsonb_build_array('advisory_timeframe_days'),
      'action_map', public.supervisory_response_policy_action_map(),
      'legacy_shape', jsonb_build_object(
        'field','actions','interpretation','PERMITTED',
        'note','Historical response content that lists several actions under one risk band remains readable and is interpreted as PERMITTED. It is never interpreted as a supervisory requirement.'),
      'timing_ownership', jsonb_build_object(
        'field','timeframe_days','authority','ADVISORY_UNTIL_SLA_POLICY',
        'note','Response policy states what supervisory response is expected. When an action becomes due, overdue or escalated is owned by SLA policy; response timing is advisory only.'))
    WHEN 'SLA_POLICY' THEN jsonb_build_object(
      'collection','stages','item_label','SLA stage',
      'runtime','SLA_POLICY_RUNTIME',
      'canonical_owner','Platform SLA stage engine (sla_stage_instances / sla_stage_events / sla_escalation_tiers)',
      'required_fields', jsonb_build_array('rule_code','stage','duration_days'),
      'field_aliases', jsonb_build_object(
        'duration_days','days','applies_to_action','action','risk_band','rating',
        'calendar_mode','calendar','escalation_tier_profile','escalation_profile',
        'breach_severity','severity','policy_note','note'),
      'enums', jsonb_build_object(
        'calendar_mode', jsonb_build_array('CALENDAR_DAYS','BUSINESS_DAYS'),
        'breach_severity', jsonb_build_array('LOW','MEDIUM','HIGH','CRITICAL'),
        'risk_band', public.supervisory_policy_vocabulary('RISK_BAND_ORDERED'),
        'applies_to_action', (SELECT COALESCE(jsonb_agg(m->>'policy_action'), '[]'::jsonb)
                                 FROM jsonb_array_elements(public.supervisory_response_policy_action_map()) m)),
      'booleans', jsonb_build_array('pause_permitted'),
      'positive_numbers', jsonb_build_array('duration_days','warning_percentage'),
      'enum_arrays', jsonb_build_object('pause_reasons', public.supervisory_policy_vocabulary('SLA_PAUSE_REASON')),
      'action_map', public.supervisory_response_policy_action_map(),
      'timing_ownership', jsonb_build_object(
        'authority','SLA_POLICY',
        'note','SLA policy owns when supervisory work is due, overdue and escalated. Deadlines, pauses, breaches and escalation are calculated and recorded by the platform SLA stage engine; the policy states the duration, day basis and escalation profile only.'))
    WHEN 'DASHBOARD_POLICY' THEN jsonb_build_object(
      'collection','tiles','item_label','dashboard tile',
      'required_fields', jsonb_build_array('tile_key','metric','audience'))
    WHEN 'NOTIFICATION_POLICY' THEN jsonb_build_object(
      'collection','triggers','item_label','notification trigger',
      'required_fields', jsonb_build_array('event','channels','recipients'),
      'non_empty_arrays', jsonb_build_array('channels','recipients'),
      'enum_arrays', jsonb_build_object('channels', jsonb_build_array('EMAIL','IN_APP','SMS')))
    ELSE NULL::jsonb END
$function$;