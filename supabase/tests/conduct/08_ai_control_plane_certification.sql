-- MC-08 CERTIFICATION — AI Governance & Supervisory Assurance control plane.
-- Nine certification areas:
--   A lifecycle governance and separation of duties
--   B stop control (kill switch) is fail-closed and scoped
--   C execution gateway refuses unapproved use cases, models and instructions
--   D every AI attempt is recorded in the activity register
--   E AI evidence and its provenance are immutable
--   F assurance reviews require criteria, conclusion and written basis
--   G assurance can never alter the AI record or the supervisory decision
--   H surfaces can be suspended and reinstated, fail-closed while suspended
--   I access rights: read-only auditor, no anonymous access, no browser writes
BEGIN;
SELECT plan(30);

-- ---------------------------------------------------------------------------
-- static controls
-- ---------------------------------------------------------------------------

-- 1 the control-plane registries exist
SELECT ok(
  (SELECT count(*) FROM pg_class
    WHERE relnamespace = 'public'::regnamespace
      AND relname IN ('ai_governance_models','ai_governance_instructions','ai_governance_kill_switches',
                      'ai_governance_surfaces','ai_governance_events','ai_governance_activity_attempts',
                      'ai_assurance_reviews','ai_assurance_criteria_assessments','ai_governance_thresholds',
                      'conduct_ai_use_cases','conduct_ai_insights','conduct_ai_review_events')) = 12,
  'the complete AI control-plane register set is present');

-- 2 lifecycle rule is centralised and terminal state is terminal
SELECT ok(
  public.ai_gov_transition_allowed('DRAFT','ACTIVE')
  AND public.ai_gov_transition_allowed('ACTIVE','SUSPENDED')
  AND public.ai_gov_transition_allowed('SUSPENDED','ACTIVE')
  AND NOT public.ai_gov_transition_allowed('RETIRED','ACTIVE')
  AND NOT public.ai_gov_transition_allowed('SUSPENDED','DRAFT'),
  'lifecycle transitions are governed and retirement is permanent');

-- 3 no browser writes to any control-plane register
SELECT ok(
  NOT has_table_privilege('authenticated','public.ai_governance_models','INSERT')
  AND NOT has_table_privilege('authenticated','public.ai_governance_models','UPDATE')
  AND NOT has_table_privilege('authenticated','public.ai_governance_instructions','UPDATE')
  AND NOT has_table_privilege('authenticated','public.ai_governance_kill_switches','UPDATE')
  AND NOT has_table_privilege('authenticated','public.ai_governance_surfaces','UPDATE')
  AND NOT has_table_privilege('authenticated','public.ai_governance_events','INSERT')
  AND NOT has_table_privilege('authenticated','public.ai_governance_activity_attempts','INSERT')
  AND NOT has_table_privilege('authenticated','public.ai_assurance_reviews','UPDATE'),
  'no register can be written from a browser session; all changes go through governed operations');

-- 4 no anonymous access anywhere in the control plane
SELECT ok(
  NOT has_table_privilege('anon','public.ai_governance_models','SELECT')
  AND NOT has_table_privilege('anon','public.ai_governance_activity_attempts','SELECT')
  AND NOT has_table_privilege('anon','public.ai_assurance_reviews','SELECT')
  AND NOT has_function_privilege('anon','public.ai_governance_transition(text,text,text,text)','EXECUTE')
  AND NOT has_function_privilege('anon','public.ai_governance_kill_switch_set(text,boolean,text)','EXECUTE'),
  'anonymous users have no read and no control over AI governance');

-- 5 the advisory boundary is structurally enforced, not a convention
SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint
           WHERE conrelid = 'public.conduct_ai_use_cases'::regclass
             AND conname = 'conduct_ai_use_cases_no_mutation_chk'),
  'no AI use case can ever be configured to change a supervisory record');

-- 6 the register of prohibited AI actions is populated and read-only to browsers
SELECT ok(
  (SELECT count(*) FROM public.ai_prohibited_actions) > 0
  AND NOT has_table_privilege('authenticated','public.ai_prohibited_actions','UPDATE'),
  'prohibited AI actions are published and cannot be edited from the interface');

-- ---------------------------------------------------------------------------
-- runtime behaviour
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE mc08 (name text primary key, pass boolean, detail text);

DO $$
DECLARE
  _super uuid; _approver uuid; _analyst uuid; _auditor uuid;
  _entity uuid; _fp text; _refs jsonb; _ctx jsonb;
  _model uuid; _instr uuid; _uc text := 'SUPERVISORY_SUMMARY';
  _res jsonb; _gate jsonb; _insight uuid; _review uuid;
  _n int; _before int; _row public.conduct_ai_insights;
  _surface text; _prev text;
BEGIN
  SELECT id INTO _super    FROM public.profiles WHERE email = 'super_admin@mishainfotech.com';
  SELECT id INTO _auditor  FROM public.profiles WHERE email = 'auditor@mishainfotech.com';
  SELECT id INTO _approver FROM public.profiles WHERE email = 'conduct_supervisor@mishainfotech.com';
  SELECT id INTO _analyst  FROM public.profiles WHERE email = 'conduct_analyst@mishainfotech.com';

  SELECT c.licensee_id INTO _entity FROM public.complaints c WHERE c.licensee_id IS NOT NULL
   GROUP BY c.licensee_id ORDER BY count(*) DESC, c.licensee_id LIMIT 1;

  -- A. access rights are actually granted to the governance roles ------------
  INSERT INTO mc08 VALUES ('access_matrix',
    public.has_permission(_approver,'ai_management','approve')
    AND public.has_permission(_analyst,'ai_management','view')
    AND public.has_permission(_auditor,'ai_management','view')
    AND NOT public.has_permission(_auditor,'ai_management','approve')
    AND NOT public.has_permission(_analyst,'ai_management','approve'), NULL);

  PERFORM set_config('request.jwt.claims', json_build_object('sub',_super,'role','authenticated')::text, true);

  -- A. lifecycle governance -------------------------------------------------
  SELECT id INTO _model FROM public.ai_governance_models WHERE lifecycle_state = 'ACTIVE' ORDER BY approved_at NULLS LAST LIMIT 1;
  SELECT id INTO _instr FROM public.ai_governance_instructions WHERE lifecycle_state = 'ACTIVE' LIMIT 1;

  BEGIN
    PERFORM public.ai_governance_transition('MODEL', _model::text, 'SUSPENDED', NULL);
    INSERT INTO mc08 VALUES ('suspension_reason_required', false, 'suspension accepted without a reason');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc08 VALUES ('suspension_reason_required', SQLERRM LIKE 'rationale_required%', SQLERRM);
  END;

  BEGIN
    PERFORM public.ai_governance_transition('MODEL', _model::text, 'DRAFT', 'attempt an ungoverned step');
    INSERT INTO mc08 VALUES ('illegal_transition_blocked', false, 'ACTIVE -> DRAFT accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc08 VALUES ('illegal_transition_blocked', SQLERRM LIKE 'transition_not_permitted%', SQLERRM);
  END;

  -- C. gateway approves a fully governed capability -------------------------
  _res := public.ai_governance_resolve_execution(_uc, _super, NULL);
  INSERT INTO mc08 VALUES ('gateway_allows_governed',
    (_res->>'allowed') = 'true' AND (_res->>'reason_code') = 'APPROVED'
    AND coalesce(_res->>'model','') <> '' AND coalesce(_res->>'instruction_version','') <> ''
    AND (_res->>'human_review_required') = 'true', _res::text);

  -- C. gateway refuses an unregistered capability ---------------------------
  _res := public.ai_governance_resolve_execution('NOT_A_REGISTERED_USE_CASE', _super, NULL);
  INSERT INTO mc08 VALUES ('gateway_refuses_unregistered',
    (_res->>'allowed') = 'false' AND (_res->>'reason_code') = 'USE_CASE_NOT_REGISTERED', _res::text);

  -- C. gateway refuses a model other than the approved one ------------------
  _res := public.ai_governance_resolve_execution(_uc, _super, 'some/unapproved-model');
  INSERT INTO mc08 VALUES ('gateway_refuses_other_model',
    (_res->>'allowed') = 'false' AND (_res->>'reason_code') = 'MODEL_NOT_PERMITTED', _res::text);

  -- C. gateway refuses a suspended instruction ------------------------------
  PERFORM public.ai_governance_transition('INSTRUCTION', _instr::text, 'SUSPENDED', 'certification: withdraw instruction');
  _res := public.ai_governance_resolve_execution(
            (SELECT code FROM public.conduct_ai_use_cases WHERE approved_instruction_id = _instr LIMIT 1), _super, NULL);
  INSERT INTO mc08 VALUES ('gateway_refuses_suspended_instruction',
    (_res->>'allowed') = 'false' AND (_res->>'reason_code') IN ('INSTRUCTION_SUSPENDED','INSTRUCTION_NOT_RELEASED'), _res::text);
  PERFORM public.ai_governance_transition('INSTRUCTION', _instr::text, 'ACTIVE', 'certification: reinstate instruction');

  -- B. stop control is fail-closed and overrides everything ------------------
  _res := public.ai_governance_kill_switch_set('GLOBAL', true, 'certification: verify institutional stop control');
  _res := public.ai_governance_resolve_execution(_uc, _super, NULL);
  _gate := public.ai_governance_surface_gate(
             (SELECT code FROM public.ai_governance_surfaces ORDER BY code LIMIT 1), _super);
  INSERT INTO mc08 VALUES ('stop_control_fail_closed',
    (_res->>'allowed') = 'false' AND (_res->>'reason_code') = 'AI_STOPPED'
    AND (_gate->>'allowed') = 'false' AND (_gate->>'reason_code') = 'AI_STOPPED', _res::text);

  -- deterministic facts remain fully available while AI is stopped
  BEGIN
    _ctx := public.conduct_360_snapshot(_entity, NULL, NULL);
    INSERT INTO mc08 VALUES ('facts_unaffected_by_stop', jsonb_typeof(_ctx) = 'object', NULL);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc08 VALUES ('facts_unaffected_by_stop', false, SQLERRM);
  END;

  BEGIN
    PERFORM public.ai_governance_kill_switch_set('GLOBAL', false, NULL);
    INSERT INTO mc08 VALUES ('stop_release_reason_required', false, 'release accepted without a reason');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc08 VALUES ('stop_release_reason_required', SQLERRM LIKE 'reason_required%', SQLERRM);
  END;

  PERFORM public.ai_governance_kill_switch_set('GLOBAL', false, 'certification: release the stop control');
  _res := public.ai_governance_resolve_execution(_uc, _super, NULL);
  INSERT INTO mc08 VALUES ('stop_release_restores_service', (_res->>'allowed') = 'true', _res::text);

  -- D. every attempt is recorded in the activity register -------------------
  SELECT count(*) INTO _before FROM public.ai_governance_activity_attempts;
  PERFORM public.ai_governance_record_attempt(_uc, _entity, _super, 'REFUSED', 'AI_STOPPED',
    'certification: refusal is recorded', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 12, NULL, now(), '{}'::jsonb);
  SELECT count(*) INTO _n FROM public.ai_governance_activity_attempts;
  INSERT INTO mc08 VALUES ('attempts_recorded', _n = _before + 1, format('%s -> %s', _before, _n));

  -- refusals and stop events are written to the governance event log
  SELECT count(*) INTO _n FROM public.ai_governance_events
   WHERE event_type IN ('KILL_SWITCH_ENGAGED','KILL_SWITCH_RELEASED');
  INSERT INTO mc08 VALUES ('stop_events_logged', _n >= 2, _n::text);

  BEGIN
    UPDATE public.ai_governance_events SET rationale = 'rewritten' WHERE event_type = 'KILL_SWITCH_ENGAGED';
    INSERT INTO mc08 VALUES ('event_log_append_only', false, 'event log update succeeded');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc08 VALUES ('event_log_append_only', true, SQLERRM);
  END;

  -- E / F / G. assurance over an immutable AI record ------------------------
  _ctx  := public.conduct_360_ai_context(_entity, _uc, '2000-01-01', '2100-01-01');
  _fp   := _ctx ->> 'input_fingerprint';
  _refs := _ctx -> 'permitted_source_references';
  _insight := public.conduct_ai_insight_record(
        _entity, _uc, '2000-01-01', '2100-01-01', _fp,
        jsonb_build_object('summary','MC-08 certification advisory output','output_class','narrative'),
        _refs, 'lovable_ai_gateway', 'google/gemini-2.5-flash', '2026-08',
        NULL, 0.55, 'Limited to the snapshot window',
        ARRAY['Advisory only','Requires verification against source records'], _super);

  _review := public.ai_assurance_review_create(_insight, 'certification: seven-criteria review');

  BEGIN
    PERFORM public.ai_assurance_review_conclude(_review, 'SATISFACTORY', NULL);
    INSERT INTO mc08 VALUES ('assurance_basis_required', false, 'conclusion accepted with no written basis');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc08 VALUES ('assurance_basis_required', SQLERRM LIKE 'closure_note_required%', SQLERRM);
  END;

  BEGIN
    PERFORM public.ai_assurance_review_conclude(_review, 'MOSTLY_FINE', 'unsupported conclusion');
    INSERT INTO mc08 VALUES ('assurance_conclusion_controlled', false, 'free-text conclusion accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc08 VALUES ('assurance_conclusion_controlled', SQLERRM LIKE 'unsupported_conclusion%', SQLERRM);
  END;

  PERFORM public.ai_assurance_assess(_review, 'GROUNDED_IN_RECORD', 'SATISFACTORY', 'every statement traces to a supplied record');
  PERFORM public.ai_assurance_assess(_review, 'NO_DECISION_LANGUAGE', 'SATISFACTORY', 'advisory wording only');
  SELECT count(*) INTO _n FROM public.ai_assurance_criteria_assessments WHERE review_id = _review;
  INSERT INTO mc08 VALUES ('assurance_criteria_recorded', _n = 2, _n::text);

  PERFORM public.ai_assurance_remediation_set(_review, 'Tighten the instruction wording', _approver,
    (current_date + 14), 'OPEN', 'certification: remediation is tracked');

  SELECT * INTO _row FROM public.conduct_ai_insights WHERE id = _insight;
  _res := public.ai_assurance_review_conclude(_review, 'OBSERVATION', 'Advisory item was grounded; wording to be tightened.');
  INSERT INTO mc08 VALUES ('assurance_cannot_change_ai_record',
    (_res->>'ai_evidence_unchanged') = 'true'
    AND (SELECT ai_output FROM public.conduct_ai_insights WHERE id = _insight) = _row.ai_output
    AND (SELECT review_state FROM public.conduct_ai_insights WHERE id = _insight) = _row.review_state
    AND (SELECT status FROM public.ai_assurance_reviews WHERE id = _review) = 'CLOSED', _res::text);

  BEGIN
    PERFORM public.ai_assurance_review_conclude(_review, 'SATISFACTORY', 'attempt to re-open a closed review');
    INSERT INTO mc08 VALUES ('closed_review_final', false, 'closed review was concluded again');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc08 VALUES ('closed_review_final', SQLERRM LIKE 'assurance_review_closed%', SQLERRM);
  END;

  BEGIN
    UPDATE public.conduct_ai_insights SET model = 'tampered/model' WHERE id = _insight;
    INSERT INTO mc08 VALUES ('provenance_immutable', false, 'provenance update succeeded');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc08 VALUES ('provenance_immutable',
      SQLERRM LIKE 'immutable_ai_evidence%' OR SQLERRM LIKE 'permission denied%', SQLERRM);
  END;

  -- H. surface suspension is fail-closed, and reinstatement restores service -
  SELECT code, lifecycle_state INTO _surface, _prev FROM public.ai_governance_surfaces
   WHERE lifecycle_state = 'ACTIVE' ORDER BY code LIMIT 1;
  IF _surface IS NULL THEN
    INSERT INTO mc08 VALUES ('surface_suspend_reinstate', false, 'no active AI surface registered');
  ELSE
    PERFORM public.ai_governance_surface_set_state(_surface, 'SUSPENDED', 'certification: suspend a single capability');
    _gate := public.ai_governance_surface_gate(_surface, _super);
    PERFORM public.ai_governance_surface_set_state(_surface, 'ACTIVE', 'certification: reinstate the capability');
    _res := public.ai_governance_surface_gate(_surface, _super);
    INSERT INTO mc08 VALUES ('surface_suspend_reinstate',
      (_gate->>'allowed') = 'false' AND (_gate->>'reason_code') = 'CAPABILITY_NOT_APPROVED'
      AND (_res->>'allowed') = 'true', _gate::text);
  END IF;

  -- I. auditor is read-only across the whole control plane ------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_auditor,'role','authenticated')::text, true);
  BEGIN
    PERFORM public.ai_governance_kill_switch_set('GLOBAL', true, 'auditor attempt');
    INSERT INTO mc08 VALUES ('auditor_read_only', false, 'auditor engaged the stop control');
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      PERFORM public.ai_governance_transition('MODEL', _model::text, 'SUSPENDED', 'auditor attempt');
      INSERT INTO mc08 VALUES ('auditor_read_only', false, 'auditor suspended a model');
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO mc08 VALUES ('auditor_read_only', public.ai_gov_can_read(_auditor), SQLERRM);
    END;
  END;

  -- an officer without approval rights cannot approve configuration ---------
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_analyst,'role','authenticated')::text, true);
  BEGIN
    PERFORM public.ai_governance_transition('MODEL', _model::text, 'SUSPENDED', 'analyst attempt');
    INSERT INTO mc08 VALUES ('approval_rights_enforced', false, 'analyst suspended a model');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc08 VALUES ('approval_rights_enforced', SQLERRM LIKE 'not_authorized%', SQLERRM);
  END;

  -- anonymous control is denied ---------------------------------------------
  PERFORM set_config('request.jwt.claims', NULL, true);
  BEGIN
    PERFORM public.ai_governance_kill_switch_set('GLOBAL', true, 'anonymous attempt');
    INSERT INTO mc08 VALUES ('anonymous_denied', false, 'anonymous engaged the stop control');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc08 VALUES ('anonymous_denied', true, SQLERRM);
  END;
END $$;

SELECT ok(COALESCE(pass,false), 'AI governance rights are granted to the governance roles and withheld from others'
  || COALESCE(' :: ' || detail,'')) FROM mc08 WHERE name = 'access_matrix';
SELECT ok(COALESCE(pass,false), 'suspending an AI configuration requires a written reason'
  || COALESCE(' :: ' || detail,'')) FROM mc08 WHERE name = 'suspension_reason_required';
SELECT ok(COALESCE(pass,false), 'an ungoverned lifecycle step is refused'
  || COALESCE(' :: ' || detail,'')) FROM mc08 WHERE name = 'illegal_transition_blocked';
SELECT ok(COALESCE(pass,false), 'the gateway permits a fully approved capability and returns its provenance'
  || COALESCE(' :: ' || detail,'')) FROM mc08 WHERE name = 'gateway_allows_governed';
SELECT ok(COALESCE(pass,false), 'an unregistered AI capability is refused'
  || COALESCE(' :: ' || detail,'')) FROM mc08 WHERE name = 'gateway_refuses_unregistered';
SELECT ok(COALESCE(pass,false), 'a model other than the approved model is refused'
  || COALESCE(' :: ' || detail,'')) FROM mc08 WHERE name = 'gateway_refuses_other_model';
SELECT ok(COALESCE(pass,false), 'a withdrawn instruction version stops AI use of that capability'
  || COALESCE(' :: ' || detail,'')) FROM mc08 WHERE name = 'gateway_refuses_suspended_instruction';
SELECT ok(COALESCE(pass,false), 'the institutional stop control refuses all AI use immediately'
  || COALESCE(' :: ' || detail,'')) FROM mc08 WHERE name = 'stop_control_fail_closed';
SELECT ok(COALESCE(pass,false), 'the regulatory fact layer remains available while AI is stopped'
  || COALESCE(' :: ' || detail,'')) FROM mc08 WHERE name = 'facts_unaffected_by_stop';
SELECT ok(COALESCE(pass,false), 'releasing the stop control requires a written reason'
  || COALESCE(' :: ' || detail,'')) FROM mc08 WHERE name = 'stop_release_reason_required';
SELECT ok(COALESCE(pass,false), 'releasing the stop control restores AI assistance'
  || COALESCE(' :: ' || detail,'')) FROM mc08 WHERE name = 'stop_release_restores_service';
SELECT ok(COALESCE(pass,false), 'every AI attempt, including a refusal, is recorded in the activity register'
  || COALESCE(' :: ' || detail,'')) FROM mc08 WHERE name = 'attempts_recorded';
SELECT ok(COALESCE(pass,false), 'stop control decisions are logged as governance events'
  || COALESCE(' :: ' || detail,'')) FROM mc08 WHERE name = 'stop_events_logged';
SELECT ok(COALESCE(pass,false), 'the governance event log is append-only'
  || COALESCE(' :: ' || detail,'')) FROM mc08 WHERE name = 'event_log_append_only';
SELECT ok(COALESCE(pass,false), 'an assurance conclusion requires a written basis'
  || COALESCE(' :: ' || detail,'')) FROM mc08 WHERE name = 'assurance_basis_required';
SELECT ok(COALESCE(pass,false), 'assurance conclusions are limited to the approved set'
  || COALESCE(' :: ' || detail,'')) FROM mc08 WHERE name = 'assurance_conclusion_controlled';
SELECT ok(COALESCE(pass,false), 'criteria assessments are recorded against the review'
  || COALESCE(' :: ' || detail,'')) FROM mc08 WHERE name = 'assurance_criteria_recorded';
SELECT ok(COALESCE(pass,false), 'concluding a review changes neither the AI record nor the supervisory decision'
  || COALESCE(' :: ' || detail,'')) FROM mc08 WHERE name = 'assurance_cannot_change_ai_record';
SELECT ok(COALESCE(pass,false), 'a concluded assurance review cannot be concluded again'
  || COALESCE(' :: ' || detail,'')) FROM mc08 WHERE name = 'closed_review_final';
SELECT ok(COALESCE(pass,false), 'AI provenance cannot be altered after the event'
  || COALESCE(' :: ' || detail,'')) FROM mc08 WHERE name = 'provenance_immutable';
SELECT ok(COALESCE(pass,false), 'a single AI capability can be suspended and reinstated, fail-closed while suspended'
  || COALESCE(' :: ' || detail,'')) FROM mc08 WHERE name = 'surface_suspend_reinstate';
SELECT ok(COALESCE(pass,false), 'an auditor can read the control plane but can change nothing'
  || COALESCE(' :: ' || detail,'')) FROM mc08 WHERE name = 'auditor_read_only';
SELECT ok(COALESCE(pass,false), 'an officer without approval rights cannot approve or suspend AI configuration'
  || COALESCE(' :: ' || detail,'')) FROM mc08 WHERE name = 'approval_rights_enforced';
SELECT ok(COALESCE(pass,false), 'anonymous users cannot operate any AI control'
  || COALESCE(' :: ' || detail,'')) FROM mc08 WHERE name = 'anonymous_denied';

SELECT * FROM finish();
ROLLBACK;
