CREATE OR REPLACE FUNCTION public.rule_module_test(_family text, _rule_id uuid, _inputs jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_start timestamptz := clock_timestamp();
  v_corr uuid := gen_random_uuid();
  v_code text;
  v_name text;
  v_conditions jsonb := '[]'::jsonb;
  v_actions jsonb := '[]'::jsonb;
  v_matched boolean := false;
  v_notes text;
  v_out jsonb;
  v_in jsonb := coalesce(_inputs, '{}'::jsonb);
  r record;
  r2 public.prudential_thresholds;
  v_decision jsonb;
  v_route jsonb;
  v_effective uuid;
  v_risk text;
  v_from timestamptz;
  v_asof timestamptz;
BEGIN
  IF NOT public.can_manage_rule_engine(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _family IS NULL OR _rule_id IS NULL THEN
    RAISE EXCEPTION 'family and rule id are required' USING ERRCODE = '22023';
  END IF;

  -- ---------------- Return validation ----------------
  IF _family = 'return_validation' THEN
    SELECT * INTO r FROM public.return_validation_rules WHERE id = _rule_id;
    IF r.id IS NULL THEN RAISE EXCEPTION 'rule not found' USING ERRCODE='P0002'; END IF;
    v_code := 'RVR-' || left(replace(r.id::text,'-',''),8);
    v_name := r.name;
    SELECT jsonb_agg(jsonb_build_object(
             'label', 'field ' || f.ref,
             'metric', f.ref,
             'actual', coalesce(v_in->'values'->f.ref, 'null'::jsonb),
             'operator', coalesce(v_in->>'operator', 'is_present'),
             'expected', coalesce(v_in->'expected', 'null'::jsonb),
             'passed', public.rule_test_compare(v_in->'values'->f.ref,
                        coalesce(v_in->>'operator','is_present'), v_in->'expected'),
             'reason', CASE WHEN (v_in->'values'->f.ref) IS NULL
                            THEN 'no sample value supplied for this field'
                            ELSE 'evaluated against sample value' END))
      INTO v_conditions
      FROM jsonb_array_elements_text(coalesce(r.field_refs,'[]'::jsonb)) AS f(ref);
    v_conditions := coalesce(v_conditions, '[]'::jsonb);
    v_matched := EXISTS (SELECT 1 FROM jsonb_array_elements(v_conditions) c WHERE (c->>'passed')::boolean IS FALSE);
    v_actions := jsonb_build_array(jsonb_build_object(
      'index', 0, 'type', 'validation_finding', 'severity', r.severity,
      'message', r.error_message,
      'blocks_submission', (lower(coalesce(r.severity,'')) IN ('error','critical'))));
    v_notes := 'Expression: ' || coalesce(r.expression,'(none)') ||
               '. Expression arithmetic is evaluated by evaluate_return_validations() at submission time; '
               'this tester reports field-level presence/comparison results and the user-facing message.';

  -- ---------------- Prudential threshold ----------------
  ELSIF _family = 'prudential' THEN
    SELECT * INTO r FROM public.prudential_thresholds WHERE id = _rule_id;
    IF r.id IS NULL THEN RAISE EXCEPTION 'rule not found' USING ERRCODE='P0002'; END IF;
    v_code := 'PTH-' || upper(r.metric_key);
    v_name := coalesce(r.label, r.metric_key);
    v_conditions := jsonb_build_array(
      jsonb_build_object('label','warning threshold','metric',r.metric_key,
        'actual', coalesce(v_in->'actual','null'::jsonb), 'operator', r.comparator,
        'expected', to_jsonb(r.warn_value),
        'passed', NOT public.rule_test_compare(coalesce(v_in->'actual','null'::jsonb), r.comparator, to_jsonb(r.warn_value)),
        'reason','breach when the metric fails "'||r.comparator||' '||coalesce(r.warn_value::text,'-')||'"'),
      jsonb_build_object('label','breach threshold','metric',r.metric_key,
        'actual', coalesce(v_in->'actual','null'::jsonb), 'operator', r.comparator,
        'expected', to_jsonb(r.breach_value),
        'passed', NOT public.rule_test_compare(coalesce(v_in->'actual','null'::jsonb), r.comparator, to_jsonb(r.breach_value)),
        'reason','breach when the metric fails "'||r.comparator||' '||coalesce(r.breach_value::text,'-')||'"'));
    v_matched := EXISTS (SELECT 1 FROM jsonb_array_elements(v_conditions) c WHERE (c->>'passed')::boolean IS TRUE);
    v_actions := CASE WHEN v_matched THEN jsonb_build_array(
        jsonb_build_object('index',0,'type','threshold_breach_record','target','return_threshold_breaches'),
        jsonb_build_object('index',1,'type','prudential_assessment_flag'),
        jsonb_build_object('index',2,'type','notification','event','prudential.threshold_breached'))
      ELSE '[]'::jsonb END;
    v_notes := 'Unit ' || coalesce(r.unit,'ratio') || ', taxonomy ' || coalesce(r.taxonomy_code,'(any)') ||
               ', effective ' || coalesce(r.effective_from::text,'-') || ' → ' || coalesce(r.effective_to::text,'open') ||
               '. Runtime owner: prudential-monitoring-sweep.';

    -- Production parity: scope resolution and risk banding use the runtime helpers
    SELECT * INTO r2 FROM public.resolve_effective_threshold(
      COALESCE(NULLIF(v_in->>'return_config_id','')::uuid, r.return_config_id),
      r.metric_key,
      COALESCE(NULLIF(v_in->>'as_of','')::date, CURRENT_DATE),
      NULLIF(v_in->>'sector_id','')::uuid,
      NULLIF(v_in->>'return_type_id','')::uuid);
    v_effective := COALESCE(r2.id, r.id);
    v_risk := public.classify_ratio_risk(
      NULLIF(v_in->>'actual','')::numeric,
      COALESCE(r2.warn_value, r.warn_value),
      COALESCE(r2.breach_value, r.breach_value),
      COALESCE(r2.comparator, r.comparator));
    v_conditions := v_conditions || jsonb_build_array(jsonb_build_object(
      'label','effective threshold resolution','metric','effective_threshold_id',
      'actual', to_jsonb(v_effective), 'operator','=', 'expected', to_jsonb(r.id),
      'passed', (v_effective = r.id),
      'reason', CASE WHEN v_effective = r.id
                     THEN 'resolve_effective_threshold() selects this row for the supplied scope and date'
                     ELSE 'another threshold row outranks this one for the supplied scope and date' END));
    v_notes := v_notes || ' Scope resolved by resolve_effective_threshold(); risk band from classify_ratio_risk(): '
               || COALESCE(v_risk, '(no actual value supplied)') || '.';

  -- ---------------- Conduct monitoring ----------------
  ELSIF _family = 'conduct' THEN
    SELECT * INTO r FROM public.conduct_monitoring_rules WHERE id = _rule_id;
    IF r.id IS NULL THEN RAISE EXCEPTION 'rule not found' USING ERRCODE='P0002'; END IF;
    v_code := 'CMR-' || left(replace(r.id::text,'-',''),8);
    v_name := r.name;
    v_conditions := jsonb_build_array(jsonb_build_object(
      'label', coalesce(r.definition->>'metric','metric'),
      'metric', r.definition->>'metric',
      'actual', coalesce(v_in->'metrics'->(r.definition->>'metric'), v_in->'actual', 'null'::jsonb),
      'operator', coalesce(r.definition->>'op','>='),
      'expected', coalesce(r.definition->'threshold','null'::jsonb),
      'passed', public.rule_test_compare(
                  coalesce(v_in->'metrics'->(r.definition->>'metric'), v_in->'actual','null'::jsonb),
                  coalesce(r.definition->>'op','>='), r.definition->'threshold'),
      'reason','window ' || coalesce(r.definition->>'window_days','-') || ' days'));
    v_matched := (v_conditions->0->>'passed')::boolean;
    v_actions := CASE WHEN v_matched THEN jsonb_build_array(
        jsonb_build_object('index',0,'type','conduct_alert','scope',r.scope),
        jsonb_build_object('index',1,'type','risk_score_delta','value',r.risk_delta),
        jsonb_build_object('index',2,'type','notification','event','conduct.alert_created'))
      ELSE '[]'::jsonb END;
    v_notes := 'Frequency ' || coalesce(r.frequency,'-') || '. Runtime owner: evaluate-conduct-monitoring.';

  -- ---------------- Complaint triage ----------------
  ELSIF _family = 'complaint_triage' THEN
    SELECT * INTO r FROM public.complaint_intake_rules WHERE id = _rule_id;
    IF r.id IS NULL THEN RAISE EXCEPTION 'rule not found' USING ERRCODE='P0002'; END IF;
    v_code := 'CIR-' || left(replace(r.id::text,'-',''),8);
    v_name := coalesce(r.variant,'intake') || ' intake rules';
    SELECT jsonb_agg(jsonb_build_object(
             'label','required field ' || f.ref, 'metric', f.ref,
             'actual', coalesce(v_in->'facts'->f.ref,'null'::jsonb),
             'operator','is_present','expected', to_jsonb('required'::text),
             'passed', public.rule_test_compare(v_in->'facts'->f.ref,'is_present',NULL),
             'reason', CASE WHEN public.rule_test_compare(v_in->'facts'->f.ref,'is_present',NULL)
                            THEN 'supplied' ELSE 'missing — intake would be rejected' END))
      INTO v_conditions
      FROM unnest(coalesce(r.required_fields, ARRAY[]::text[])) AS f(ref);
    v_conditions := coalesce(v_conditions,'[]'::jsonb)
      || jsonb_build_array(jsonb_build_object(
           'label','anonymous submission','metric','anonymous',
           'actual', coalesce(v_in->'facts'->'anonymous','false'::jsonb),
           'operator','=','expected', to_jsonb(r.allow_anonymous),
           'passed', (coalesce((v_in->'facts'->>'anonymous')::boolean,false) IS NOT TRUE) OR r.allow_anonymous,
           'reason', CASE WHEN r.allow_anonymous THEN 'anonymous permitted' ELSE 'anonymous not permitted for this variant' END),
         jsonb_build_object(
           'label','attachment count','metric','attachments',
           'actual', coalesce(v_in->'facts'->'attachments','0'::jsonb),
           'operator','<=','expected', to_jsonb(r.max_attachments),
           'passed', public.rule_test_compare(coalesce(v_in->'facts'->'attachments','0'::jsonb),'<=',to_jsonb(r.max_attachments)),
           'reason','maximum ' || coalesce(r.max_attachments::text,'-') || ' attachments'));
    v_matched := NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_conditions) c WHERE (c->>'passed')::boolean IS FALSE);
    v_actions := jsonb_build_array(
      jsonb_build_object('index',0,'type','classify_complaint','result',
        CASE WHEN v_matched THEN 'accepted for triage' ELSE 'rejected at intake' END),
      jsonb_build_object('index',1,'type','apply_complaint_type_sla'),
      jsonb_build_object('index',2,'type','start_complaint_workflow'),
      jsonb_build_object('index',3,'type','notification','event','complaint.created'));

    -- Production parity: acceptance decided by the same function create_complaint() calls
    v_decision := public.complaint_intake_decide(r.variant, r.regulator_id, COALESCE(v_in->'facts','{}'::jsonb));
    v_conditions := v_conditions || jsonb_build_array(jsonb_build_object(
      'label','production intake decision','metric','complaint_intake_decide',
      'actual', COALESCE(v_decision->'errors','[]'::jsonb), 'operator','is_empty', 'expected','[]'::jsonb,
      'passed', jsonb_array_length(COALESCE(v_decision->'errors','[]'::jsonb)) = 0,
      'reason', CASE WHEN jsonb_array_length(COALESCE(v_decision->'errors','[]'::jsonb)) = 0
                     THEN 'create_complaint() would accept this submission'
                     ELSE 'create_complaint() would reject this submission' END));
    v_matched := v_matched AND jsonb_array_length(COALESCE(v_decision->'errors','[]'::jsonb)) = 0;
    v_actions := jsonb_set(v_actions, '{0,result}',
      to_jsonb(CASE WHEN v_matched THEN 'accepted for triage' ELSE 'rejected at intake' END));
    v_actions := jsonb_set(v_actions, '{1,derived_severity}', COALESCE(v_decision->'severity','null'::jsonb));
    v_actions := jsonb_set(v_actions, '{1,derived_priority}', COALESCE(v_decision->'priority','null'::jsonb));
    v_actions := jsonb_set(v_actions, '{1,derived_intake_source}', COALESCE(v_decision->'intake_source','null'::jsonb));
    v_notes := 'Runtime owner: create_complaint() -> public.complaint_intake_decide(), the same function this tester calls. '
               'Priority, SLA and assignment are then derived by the complaint type and workflow, previewed above in action order.';

  -- ---------------- Sufficiency ----------------
  ELSIF _family = 'sufficiency' THEN
    SELECT * INTO r FROM public.sufficiency_rules WHERE id = _rule_id;
    IF r.id IS NULL THEN RAISE EXCEPTION 'rule not found' USING ERRCODE='P0002'; END IF;
    v_code := coalesce(r.code, 'SFR-' || left(replace(r.id::text,'-',''),8));
    v_name := r.name;
    v_conditions := jsonb_build_array(jsonb_build_object(
      'label', coalesce(r.config->>'label', r.rule_type),
      'metric', coalesce(r.config->>'metric', r.config->>'field', r.rule_type),
      'actual', coalesce(v_in->'facts'->coalesce(r.config->>'metric', r.config->>'field',''), v_in->'actual','null'::jsonb),
      'operator', coalesce(r.config->>'op','is_present'),
      'expected', coalesce(r.config->'value', r.config->'threshold','null'::jsonb),
      'passed', public.rule_test_compare(
                  coalesce(v_in->'facts'->coalesce(r.config->>'metric', r.config->>'field',''), v_in->'actual','null'::jsonb),
                  coalesce(r.config->>'op','is_present'),
                  coalesce(r.config->'value', r.config->'threshold')),
      'reason','sufficiency rule type ' || coalesce(r.rule_type,'-')));
    v_matched := (v_conditions->0->>'passed')::boolean IS FALSE;
    v_actions := CASE WHEN v_matched THEN
        jsonb_build_array(
          jsonb_build_object('index',0,'type','sufficiency_finding','severity',r.severity),
          jsonb_build_object('index',1,'type','suggest_rfi','auto',r.auto_rfi,
            'prompt', r.rfi_prompt_template, 'question_type', r.rfi_question_type,
            'note','suggestion only — no RFI is created by a test run'))
      ELSE '[]'::jsonb END;
    v_notes := 'Runtime owner: evaluate-application-sufficiency. A failing condition means information is missing.';

  -- ---------------- RFI auto rules ----------------
  ELSIF _family = 'rfi_auto' THEN
    SELECT * INTO r FROM public.application_rfi_auto_rules WHERE id = _rule_id;
    IF r.id IS NULL THEN RAISE EXCEPTION 'rule not found' USING ERRCODE='P0002'; END IF;
    v_code := 'RFA-' || left(replace(r.id::text,'-',''),8);
    v_name := r.name;
    v_conditions := jsonb_build_array(jsonb_build_object(
      'label', coalesce(r.condition->>'label','condition'),
      'metric', coalesce(r.condition->>'field', r.condition->>'metric','field'),
      'actual', coalesce(v_in->'facts'->coalesce(r.condition->>'field', r.condition->>'metric',''), v_in->'actual','null'::jsonb),
      'operator', coalesce(r.condition->>'op','is_empty'),
      'expected', coalesce(r.condition->'value','null'::jsonb),
      'passed', public.rule_test_compare(
                  coalesce(v_in->'facts'->coalesce(r.condition->>'field', r.condition->>'metric',''), v_in->'actual','null'::jsonb),
                  coalesce(r.condition->>'op','is_empty'), r.condition->'value'),
      'reason','workflow ' || coalesce(r.workflow_type_key,'(any)')));
    v_matched := (v_conditions->0->>'passed')::boolean;
    v_actions := CASE WHEN v_matched THEN jsonb_build_array(jsonb_build_object(
        'index',0,'type','suggest_rfi_item','question_type', r.question_type,
        'required', r.required, 'due_days', r.default_due_days,
        'prompt', r.prompt_template,
        'duplicate_check', CASE WHEN coalesce((v_in->'facts'->>'open_item_exists')::boolean,false)
                                THEN 'suppressed — an open RFI item already covers this requirement'
                                ELSE 'no open RFI item found for this requirement' END,
        'note','suggestion only — officer confirmation creates the real RFI'))
      ELSE '[]'::jsonb END;
    v_notes := 'Runtime owner: application RFI suggestion path (officer-confirmed).';

  -- ---------------- Correspondence routing ----------------
  ELSIF _family = 'correspondence' THEN
    SELECT * INTO r FROM public.correspondence_routing_rules WHERE id = _rule_id;
    IF r.id IS NULL THEN RAISE EXCEPTION 'rule not found' USING ERRCODE='P0002'; END IF;
    v_code := 'CRR-' || left(replace(r.id::text,'-',''),8);
    v_name := r.name;
    v_conditions := jsonb_build_array(jsonb_build_object(
      'label','match ' || r.match_type, 'metric', r.match_type,
      'actual', coalesce(v_in->'message'->r.match_type, v_in->'actual','null'::jsonb),
      'operator','contains','expected', to_jsonb(r.match_value),
      'passed', public.rule_test_compare(coalesce(v_in->'message'->r.match_type, v_in->'actual','null'::jsonb),
                                         'contains', to_jsonb(r.match_value)),
      'reason','sort order ' || coalesce(r.sort_order::text,'-') ||
               ' — the first matching active rule wins'));

    -- Production parity: precedence resolved by the same function create_correspondence_thread() calls
    v_route := public.correspondence_route_decide(
      COALESCE(v_in->'message'->>'category', v_in->>'category'),
      COALESCE(v_in->'message'->>'channel',  v_in->>'channel'),
      COALESCE(v_in->'message'->>'subject',  v_in->>'subject'),
      COALESCE(v_in->'message'->>'priority', v_in->>'priority'));
    v_conditions := v_conditions || jsonb_build_array(jsonb_build_object(
      'label','winning rule (production precedence)','metric','routing_rule_id',
      'actual', COALESCE(v_route->'rule_id','null'::jsonb), 'operator','=', 'expected', to_jsonb(r.id),
      'passed', COALESCE(v_route->>'rule_id','') = r.id::text,
      'reason','the first matching active rule by sort order wins'));
    v_matched := COALESCE(v_route->>'rule_id','') = r.id::text;
    IF v_matched THEN
      v_actions := jsonb_build_array(
        jsonb_build_object('index',0,'type','route_to_unit','value', v_route->'assign_unit'),
        jsonb_build_object('index',1,'type','assign_officer','value', v_route->'assign_officer'),
        jsonb_build_object('index',2,'type','set_priority','value', v_route->'priority'),
        jsonb_build_object('index',3,'type','set_sla','days', v_route->'sla_days'),
        jsonb_build_object('index',4,'type','thread_status','value', v_route->'status'),
        jsonb_build_object('index',5,'type','notification','event','correspondence.message_received'));
    ELSE
      v_actions := '[]'::jsonb;
    END IF;
    v_notes := 'Runtime owner: create_correspondence_thread() -> public.correspondence_route_decide(), the same function this tester calls. Manual override '
               || CASE WHEN r.allow_manual_override THEN 'permitted' ELSE 'not permitted' END || '.';

  -- ---------------- Escalation rules ----------------
  ELSIF _family = 'escalation' THEN
    SELECT * INTO r FROM public.escalation_rules WHERE id = _rule_id;
    IF r.id IS NULL THEN RAISE EXCEPTION 'rule not found' USING ERRCODE='P0002'; END IF;
    v_code := 'ESR-' || left(replace(r.id::text,'-',''),8);
    v_name := r.name;
    v_conditions := jsonb_build_array(
      jsonb_build_object('label','tier 1 acknowledgement threshold','metric','elapsed_minutes',
        'actual', coalesce(v_in->'elapsed_minutes','null'::jsonb),'operator','>=',
        'expected', to_jsonb(r.tier1_ack_threshold_minutes),
        'passed', public.rule_test_compare(v_in->'elapsed_minutes','>=',to_jsonb(r.tier1_ack_threshold_minutes)),
        'reason', CASE WHEN r.business_hours_only THEN 'business hours only — elapsed time must be business minutes' ELSE 'calendar minutes' END),
      jsonb_build_object('label','tier 2 acknowledgement threshold','metric','elapsed_minutes',
        'actual', coalesce(v_in->'elapsed_minutes','null'::jsonb),'operator','>=',
        'expected', to_jsonb(r.tier2_ack_threshold_minutes),
        'passed', public.rule_test_compare(v_in->'elapsed_minutes','>=',to_jsonb(r.tier2_ack_threshold_minutes)),
        'reason','tier 2 fires only when tier 1 is unacknowledged'),
      jsonb_build_object('label','tier 3 acknowledgement threshold','metric','elapsed_minutes',
        'actual', coalesce(v_in->'elapsed_minutes','null'::jsonb),'operator','>=',
        'expected', to_jsonb(r.tier3_ack_threshold_minutes),
        'passed', public.rule_test_compare(v_in->'elapsed_minutes','>=',to_jsonb(r.tier3_ack_threshold_minutes)),
        'reason','tier 3 is the final tier'),
      jsonb_build_object('label','acknowledged pauses escalation','metric','acknowledged',
        'actual', coalesce(v_in->'acknowledged','false'::jsonb),'operator','=','expected','false'::jsonb,
        'passed', NOT (r.pause_on_acknowledgement AND coalesce((v_in->>'acknowledged')::boolean,false)),
        'reason', CASE WHEN r.pause_on_acknowledgement THEN 'rule pauses on acknowledgement' ELSE 'rule ignores acknowledgement' END));
    v_matched := (v_conditions->0->>'passed')::boolean AND (v_conditions->3->>'passed')::boolean;
    v_actions := CASE WHEN v_matched THEN jsonb_build_array(
        jsonb_build_object('index',0,'type','escalate','next_tier',
          CASE WHEN (v_conditions->2->>'passed')::boolean THEN 3
               WHEN (v_conditions->1->>'passed')::boolean THEN 2 ELSE 1 END,
          'recipient_role',
          CASE WHEN (v_conditions->2->>'passed')::boolean THEN r.tier3_recipient_role
               WHEN (v_conditions->1->>'passed')::boolean THEN r.tier2_recipient_role
               ELSE r.tier1_recipient_role END,
          'channels',
          CASE WHEN (v_conditions->2->>'passed')::boolean THEN to_jsonb(r.tier3_channels)
               WHEN (v_conditions->1->>'passed')::boolean THEN to_jsonb(r.tier2_channels)
               ELSE to_jsonb(r.tier1_channels) END),
        jsonb_build_object('index',1,'type','create_task','enabled',r.create_task),
        jsonb_build_object('index',2,'type','create_case','enabled',r.create_case),
        jsonb_build_object('index',3,'type','notification','event','escalation.tier_reached'))
      ELSE '[]'::jsonb END;
    v_notes := 'Source module ' || coalesce(r.source_module,'-') || ', severity ' || coalesce(r.default_severity::text,'-') ||
               ', calendar profile ' || coalesce(r.business_calendar_profile_id::text,'(none)') ||
               '. Runtime owner: escalation_sweep().';

    -- Production parity: due times computed by the runtime business-calendar helper
    v_from := COALESCE(NULLIF(v_in->>'from','')::timestamptz, now());
    v_asof := COALESCE(NULLIF(v_in->>'as_of','')::timestamptz, now());
    v_conditions := v_conditions || jsonb_build_array(
      jsonb_build_object('label','tier 1 due (escalation_deadline)','metric','tier1_due_at',
        'actual', to_jsonb(public.escalation_deadline(r.id, v_from, r.tier1_ack_threshold_minutes)),
        'operator','<=','expected', to_jsonb(v_asof),
        'passed', public.escalation_deadline(r.id, v_from, r.tier1_ack_threshold_minutes) <= v_asof,
        'reason','escalation_deadline() applies this rule''s business calendar profile'),
      jsonb_build_object('label','tier 2 due (escalation_deadline)','metric','tier2_due_at',
        'actual', to_jsonb(public.escalation_deadline(r.id, v_from, r.tier2_ack_threshold_minutes)),
        'operator','<=','expected', to_jsonb(v_asof),
        'passed', public.escalation_deadline(r.id, v_from, r.tier2_ack_threshold_minutes) <= v_asof,
        'reason','tier 2 due time in business minutes from the source event'),
      jsonb_build_object('label','tier 3 due (escalation_deadline)','metric','tier3_due_at',
        'actual', to_jsonb(public.escalation_deadline(r.id, v_from, r.tier3_ack_threshold_minutes)),
        'operator','<=','expected', to_jsonb(v_asof),
        'passed', public.escalation_deadline(r.id, v_from, r.tier3_ack_threshold_minutes) <= v_asof,
        'reason','tier 3 is the final tier'));
    v_notes := v_notes || ' Due times computed by public.escalation_deadline() / escalation_business_deadline().';

  ELSE
    RAISE EXCEPTION 'unknown rule family: %', _family USING ERRCODE = '22023';
  END IF;

  v_out := jsonb_build_object(
    'family', _family,
    'rule_id', _rule_id,
    'rule_code', v_code,
    'rule_name', v_name,
    'mode', 'dry_run',
    'inputs', v_in,
    'conditions', v_conditions,
    'matched', v_matched,
    'expected_actions', v_actions,
    'notes', v_notes,
    'correlation_id', v_corr,
    'duration_ms', (extract(epoch FROM (clock_timestamp() - v_start)) * 1000)::int,
    'side_effects', 'none — this is a dry run; no production record was created or modified'
  );

  INSERT INTO public.module_rule_tests
    (family, rule_id, rule_code, inputs, output, passed, matched, duration_ms, correlation_id, tested_by)
  VALUES (_family, _rule_id, v_code, v_in, v_out,
          NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_conditions) c WHERE c->>'passed' IS NULL),
          v_matched, (v_out->>'duration_ms')::int, v_corr, auth.uid());

  RETURN v_out;
END; $function$;
