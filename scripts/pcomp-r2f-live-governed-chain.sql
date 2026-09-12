-- =====================================================================
-- PCOMP-R2F — ONE LIVE GOVERNED AML/CFT ASSESSMENT, WHOLE CHAIN (PERSISTENT)
-- =====================================================================
-- Proves the certified policy chain on the REAL operational path, against the
-- live FSRA policy package created by scripts/pcomp-r2f-live-governed-adoption.sql:
--
--   programmed creation (policy basis stamped)
--     -> evidence policy deficiency -> readiness refusal
--     -> governed answers, canonical finding, evidence link
--     -> approved evidence exception
--     -> server calculation and registered run
--     -> judgement policy: prohibited departure refused, permitted departure
--        proposed and INDEPENDENTLY approved
--     -> submission, independent approval and publication of the risk of record
--     -> response policy: prohibited response refused, required response recorded
--     -> AML-08 consequence with policy provenance
--     -> governed SLA deadline, hold, resume and completion
--
-- Real personas, row security on, no service_role, no fabricated decision, no
-- historical record altered. Idempotent: skipped once the case exists.
--
-- Run: psql -X -q -f scripts/pcomp-r2f-live-governed-chain.sql
-- =====================================================================

\set ON_ERROR_STOP on
\pset pager off
SET row_security = on;

BEGIN;

CREATE TEMP TABLE r2f(gate text PRIMARY KEY, ok boolean, detail text) ON COMMIT DROP;
CREATE TEMP TABLE r2f_id(k text PRIMARY KEY, v uuid) ON COMMIT DROP;
CREATE TEMP TABLE r2f_t(k text PRIMARY KEY, t text) ON COMMIT DROP;
GRANT ALL ON r2f TO authenticated;
GRANT ALL ON r2f_id TO authenticated;
GRANT ALL ON r2f_t TO authenticated;

DO $$
BEGIN
  IF public.is_production_environment() THEN
    RAISE EXCEPTION 'PCOMP-R2F live chain refused: production environment';
  END IF;
END $$;

DO $$
DECLARE
  maker   text := '{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}';
  checker text := '{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}';
  ent uuid; prog uuid; a uuid; jv jsonb; jw jsonb; q record;
  fid uuid; exc uuid; run uuid; ovr uuid; dec uuid; ob record;
  calcr text; target text; scale text[] := ARRAY['LOW','MODERATE','MEDIUM_HIGH','HIGH','SEVERE'];
  n int := 0; st text; sdim uuid; qany uuid;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', maker, true);

  SELECT id INTO ent FROM public.licensees WHERE name LIKE 'DEMO AML 22%' LIMIT 1;
  IF ent IS NULL THEN RAISE EXCEPTION 'demonstration entity DEMO AML 22 not found'; END IF;
  INSERT INTO r2f_id(k,v) VALUES ('entity', ent);

  PERFORM 1 FROM public.supervisory_assessment
   WHERE entity_id = ent AND summary LIKE '%PCOMP-R2F LIVE CASE%';
  IF FOUND THEN
    RAISE NOTICE 'PCOMP-R2F live case already present — nothing to do';
    RETURN;
  END IF;

  -- ------------------------------------------------- the operational path ---
  jv := public.supervisory_assessment_programme_options_for_entity(ent,'AML_CFT');
  INSERT INTO r2f VALUES ('R2F-01-PROGRAMME-CONFIGURED',
    (jv->>'mode') = 'CONFIGURED',
    format('programme applicability mode %s', jv->>'mode'));
  SELECT (p->>'programme_id')::uuid INTO prog
    FROM jsonb_array_elements(jv->'programmes') p
   WHERE p->>'assessment_type' = 'PERIODIC' LIMIT 1;
  IF prog IS NULL THEN RAISE EXCEPTION 'no periodic programme offered for the entity'; END IF;

  jv := public.supervisory_assessment_create_programmed(
    ent,'AML_CFT', prog,'PERIODIC', NULL, NULL,
    'PCOMP-R2F LIVE CASE — periodic AML/CFT risk assessment carried through the whole governed policy chain on live regulator-owned policy.');
  a := (jv->>'id')::uuid;
  INSERT INTO r2f_id(k,v) VALUES ('assessment', a);

  jw := public.supervisory_assessment_policy_basis(a);
  INSERT INTO r2f VALUES ('R2F-02-POLICY-BASIS-STAMPED',
    (jw->>'policy_profile_version') = '1.0' AND (jw->>'policy_profile_code') = 'FSRA-AML-CFT-POLICY',
    format('governed by %s version %s', jw->>'policy_profile_code', jw->>'policy_profile_version'));

  jw := public.supervisory_assessment_evidence_policy_view(a);
  INSERT INTO r2f VALUES ('R2F-03-EVIDENCE-DEFICIENCY',
    ((jw->'evaluation')->>'blocking_count')::int >= 1,
    format('%s outstanding evidence requirement(s)', (jw->'evaluation')->>'blocking_count'));

  jw := public.supervisory_assessment_readiness(a);
  INSERT INTO r2f VALUES ('R2F-04-READINESS-REFUSES',
    NOT (jw->>'can_submit')::boolean,
    format('can_submit=%s, %s blocking check(s)', jw->>'can_submit', jw->>'blocking_check_count'));

  -- --------------------------------------------------------- the work file ---
  FOR q IN
    SELECT p.question_id, mq.requires_evidence, mq.response_options, d.dimension_group
      FROM public.supervisory_assessment_question_plan p
      JOIN public.supervisory_methodology_question mq ON mq.id = p.question_id
      JOIN public.supervisory_methodology_dimension d ON d.id = mq.methodology_dimension_id
     WHERE p.assessment_id = a AND p.plan_state LIKE 'INCLUDED%'
     ORDER BY d.dimension_code, mq.question_code
  LOOP
    PERFORM public.supervisory_assessment_question_upsert(
      a, q.question_id,
      CASE WHEN q.dimension_group = 'INHERENT_RISK' THEN 'NO'
           WHEN n % 3 = 2 AND 'PARTIALLY' = ANY (q.response_options) THEN 'PARTIALLY'
           ELSE 'YES' END,
      'Supervisory conclusion recorded from the file review, control walkthrough and sample testing performed for the assessed period.',
      CASE WHEN q.requires_evidence THEN
        jsonb_build_array(jsonb_build_object('kind','WORKPAPER','label','Assessment workpaper and sample testing record'))
      END);
    n := n + 1;
  END LOOP;
  INSERT INTO r2f_t(k,t) VALUES ('answers', n::text);

  fid := public.supervisory_finding_create(jsonb_build_object(
    'entity_id', ent,'domain_code','AML_CFT','assessment_id', a,
    'severity','HIGH','title','Customer due diligence refresh backlog',
    'observation','A backlog of periodic customer due diligence refreshes was identified during the assessed period.',
    'required_action','Clear the customer due diligence refresh backlog and report completion to the supervisor.'));
  INSERT INTO r2f_id(k,v) VALUES ('finding', fid);

  SELECT p.question_id INTO qany
    FROM public.supervisory_assessment_question_plan p
    JOIN public.supervisory_methodology_question mq ON mq.id = p.question_id
    JOIN public.supervisory_methodology_dimension d ON d.id = mq.methodology_dimension_id
   WHERE p.assessment_id = a AND p.plan_state LIKE 'INCLUDED%' AND d.dimension_code = 'CDD_KYC'
   ORDER BY mq.question_code LIMIT 1;

  PERFORM public.supervisory_assessment_evidence_link(a, jsonb_build_object(
    'evidence_type','FINDING','source_object_id', fid,
    'methodology_question_id', qany,
    'relevance_note','The recorded finding evidences the assessment-level requirement of the governing evidence policy.'));

  jw := public.supervisory_assessment_evidence_policy_view(a);
  INSERT INTO r2f VALUES ('R2F-05-EVIDENCE-SATISFIED-BY-REAL-RECORD',
    EXISTS (SELECT 1 FROM jsonb_array_elements((jw->'evaluation')->'decisions') d
             WHERE d->>'rule_code'='FSRA-AML-EV-ASSESSMENT' AND d->>'decision'='SATISFIED'),
    format('assessment-level rule %s',
      (SELECT d->>'decision' FROM jsonb_array_elements((jw->'evaluation')->'decisions') d
        WHERE d->>'rule_code'='FSRA-AML-EV-ASSESSMENT')));

  SELECT DISTINCT d.id INTO sdim
    FROM public.supervisory_assessment_question_plan p
    JOIN public.supervisory_methodology_question mq ON mq.id = p.question_id
    JOIN public.supervisory_methodology_dimension d ON d.id = mq.methodology_dimension_id
   WHERE p.assessment_id = a AND d.dimension_code = 'SANCTIONS_CONTROLS';

  jw := public.supervisory_assessment_evidence_exception_request(jsonb_build_object(
    'assessment_id', a,'rule_code','FSRA-AML-EV-SANCTIONS','scope_type','DIMENSION',
    'dimension_id', sdim,
    'rationale','The sanctions screening control testing evidence is held in the prior examination file and cannot be relinked to this assessment.'));
  exc := (jw->>'exception_id')::uuid;
  INSERT INTO r2f_id(k,v) VALUES ('exception', exc);

  BEGIN
    PERFORM public.supervisory_assessment_evidence_exception_decide(exc,'APPROVED',
      'Self-approval attempt, which the server must refuse.');
    INSERT INTO r2f VALUES ('R2F-06-EXCEPTION-INDEPENDENT', false, 'the requester approved their own exception');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO r2f VALUES ('R2F-06-EXCEPTION-INDEPENDENT', true, left(SQLERRM,140));
  END;

  PERFORM set_config('request.jwt.claims', checker, true);
  PERFORM public.supervisory_assessment_evidence_exception_decide(exc,'APPROVED',
    'The deficiency is accepted: the sanctions control testing was performed and evidenced in the prior examination file.');
  PERFORM set_config('request.jwt.claims', maker, true);

  jw := public.supervisory_assessment_evidence_policy_view(a);
  INSERT INTO r2f VALUES ('R2F-07-EXCEPTION-CLEARS-BLOCK',
    ((jw->'evaluation')->>'blocking_count')::int = 0,
    format('%s blocking requirement(s) after the approved exception', (jw->'evaluation')->>'blocking_count'));

  -- ------------------------------------------------------------ calculation --
  PERFORM public.supervisory_assessment_calculate(a);
  jw := public.supervisory_assessment_calculation_run_record(a,'MANUAL_RUN');
  run := (jw->>'run_id')::uuid;
  INSERT INTO r2f_id(k,v) VALUES ('run', run);
  SELECT status, residual_rating INTO st, calcr
    FROM public.supervisory_assessment_calculation_run WHERE id = run;
  INSERT INTO r2f_t(k,t) VALUES ('calculated', COALESCE(calcr,'-'));
  INSERT INTO r2f VALUES ('R2F-08-CALCULATED-ON-LIVE-POLICY',
    st='CALCULATED' AND calcr IS NOT NULL,
    format('run %s, calculated residual rating %s', st, calcr));

  RAISE NOTICE 'R2F calculated=% status=% target-scale=%', calcr, st, scale;
  -- ------------------------------------------------------------- judgement --
  jw := public.supervisory_assessment_judgement_policy_view(a);
  INSERT INTO r2f VALUES ('R2F-09-JUDGEMENT-GOVERNED',
    ((jw->'evaluation')->>'status')='EVALUATED'
      AND (((jw->'evaluation')->'policy')->>'component_version') IS NOT NULL,
    format('%s, pinned policy version %s', (jw->'evaluation')->>'status',
      ((jw->'evaluation')->'policy')->>'component_version'));

  BEGIN
    PERFORM public.supervisory_calculation_override_propose(a,'LOW',
      'A departure to Low is attempted with a full rationale, which the governing judgement policy prohibits outright.');
    INSERT INTO r2f VALUES ('R2F-10-PROHIBITED-DEPARTURE-REFUSED', false, 'the prohibited departure was ACCEPTED');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO r2f VALUES ('R2F-10-PROHIBITED-DEPARTURE-REFUSED', true, left(SQLERRM,140));
  END;

  SELECT s INTO target FROM unnest(scale) WITH ORDINALITY t(s,i)
   WHERE i = LEAST(array_position(scale, calcr) + 1, array_length(scale,1));
  IF target = calcr THEN
    SELECT s INTO target FROM unnest(scale) WITH ORDINALITY t(s,i)
     WHERE i = GREATEST(array_position(scale, calcr) - 1, 2);
  END IF;
  INSERT INTO r2f_t(k,t) VALUES ('target', COALESCE(target,'-'));
  RAISE NOTICE 'R2F target=%', target;

  ovr := public.supervisory_calculation_override_propose(a, target,
    'One band of supervisory judgement is applied because the sanctions control testing evidence is accepted under an approved exception and the finding backlog is not yet cleared.');
  INSERT INTO r2f_id(k,v) VALUES ('override', ovr);
  INSERT INTO r2f VALUES ('R2F-11-PERMITTED-DEPARTURE-WITH-PROVENANCE',
    EXISTS (SELECT 1 FROM public.supervisory_assessment_calculation_override o
             WHERE o.id = ovr AND o.judgement_policy_version IS NOT NULL
               AND o.judgement_rule_code IS NOT NULL),
    (SELECT format('%s -> %s under rule %s, policy version %s', calcr, target,
                   o.judgement_rule_code, o.judgement_policy_version)
       FROM public.supervisory_assessment_calculation_override o WHERE o.id = ovr));

  PERFORM set_config('request.jwt.claims', checker, true);
  PERFORM public.supervisory_calculation_override_decide(ovr,'APPROVED',
    'The departure is approved independently on the recorded supervisory rationale.');
  PERFORM set_config('request.jwt.claims', maker, true);

  -- ------------------------------------------ submission and publication ----
  PERFORM public.supervisory_assessment_submit_for_review(
    a,'Submitted for independent supervisory review with a complete question plan, a registered calculation run, an approved evidence exception and supporting workpapers.',
    run, jw->>'result_hash', NULL);

  PERFORM set_config('request.jwt.claims', checker, true);
  PERFORM public.supervisory_assessment_approve(
    a,'Approved after independent review: the calculated recommendation and the approved supervisory departure are supported by the file, and the result is adopted and published as the entity AML/CFT risk of record.',
    current_date, NULL, true);
  PERFORM set_config('request.jwt.claims', maker, true);

  INSERT INTO r2f_t(k,t) SELECT 'operative', COALESCE(residual_rating,'-')
    FROM public.entity_risk_state WHERE entity_id = ent AND domain_code='AML_CFT';
  INSERT INTO r2f VALUES ('R2F-12-PUBLISHED-RISK-OF-RECORD',
    (SELECT t FROM r2f_t WHERE k='operative') = target,
    format('calculated %s, approved judgement %s, operative rating %s',
      calcr, target, (SELECT t FROM r2f_t WHERE k='operative')));

  -- ---------------------------------------------------------- response ------
  jw := public.supervisory_consequence_response_policy_view(ent,'AML_CFT', a);
  INSERT INTO r2f VALUES ('R2F-13-RESPONSE-GOVERNED',
    ((jw->'evaluation')->>'status')='EVALUATED'
      AND (((jw->'evaluation')->'policy')->>'component_version') IS NOT NULL,
    format('%s on the operative rating %s', (jw->'evaluation')->>'status',
      (jw->'evaluation')->>'source_rating'));

  BEGIN
    PERFORM public.supervisory_consequence_record(jsonb_build_object(
      'entity_id', ent,'domain_code','AML_CFT','assessment_id', a,
      'action_type','RECORD_DEFERRED','linkage_mode','RECORD_ONLY',
      'rationale','A deferral is attempted, which the governing response policy prohibits at this rating.'));
    INSERT INTO r2f VALUES ('R2F-14-PROHIBITED-RESPONSE-REFUSED', false, 'the prohibited response was ACCEPTED');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO r2f VALUES ('R2F-14-PROHIBITED-RESPONSE-REFUSED', true, left(SQLERRM,140));
  END;

  jw := public.supervisory_consequence_record(jsonb_build_object(
    'entity_id', ent,'domain_code','AML_CFT','assessment_id', a,
    'action_type','OPEN_SUPERVISORY_PLAN','linkage_mode','CREATE',
    'title','PCOMP-R2F supervisory plan',
    'rationale','The published AML/CFT risk of record requires a governed supervisory plan under the operative response policy.'));
  dec := (jw->>'decision_id')::uuid;
  INSERT INTO r2f_id(k,v) VALUES ('decision', dec);
  INSERT INTO r2f VALUES ('R2F-15-CONSEQUENCE-CARRIES-PROVENANCE',
    EXISTS (SELECT 1 FROM public.supervisory_consequence_decision d
             WHERE d.id = dec AND d.response_policy_version IS NOT NULL
               AND d.response_policy_rule_code IS NOT NULL AND d.response_policy_level IS NOT NULL),
    (SELECT format('rule %s, level %s, policy version %s', d.response_policy_rule_code,
                   d.response_policy_level, d.response_policy_version)
       FROM public.supervisory_consequence_decision d WHERE d.id = dec));

  -- --------------------------------------------------------------- SLA ------
  SELECT * INTO ob FROM public.supervisory_response_sla_obligation WHERE decision_id = dec;
  INSERT INTO r2f VALUES ('R2F-16-SLA-OPENED',
    ob.id IS NOT NULL AND ob.sla_policy_rule_code IS NOT NULL,
    format('deadline %s under rule %s, %s day(s), policy version %s',
      ob.due_at, ob.sla_policy_rule_code, ob.sla_duration_days, ob.sla_policy_version));

  PERFORM public.supervisory_response_sla_pause(ob.id,'AWAITING_ENTITY_INFORMATION', false);
  INSERT INTO r2f VALUES ('R2F-17-SLA-HOLD',
    (SELECT s.state FROM public.sla_stage_instances s WHERE s.id = ob.stage_instance_id) = 'paused',
    (SELECT format('deadline state %s', s.state) FROM public.sla_stage_instances s WHERE s.id = ob.stage_instance_id));

  PERFORM public.supervisory_response_sla_pause(ob.id,'AWAITING_ENTITY_INFORMATION', true);
  PERFORM public.supervisory_response_sla_complete(ob.id,
    'The supervisory plan was opened within the governed timeframe.');
  INSERT INTO r2f VALUES ('R2F-18-SLA-COMPLETED-SERVER-OWNED',
    (SELECT outcome FROM public.supervisory_response_sla_obligation WHERE id = ob.id) IN ('ON_TIME','LATE')
      AND (SELECT s.state FROM public.sla_stage_instances s WHERE s.id = ob.stage_instance_id) = 'completed',
    (SELECT format('stage %s, outcome %s',
      (SELECT s.state FROM public.sla_stage_instances s WHERE s.id = ob.stage_instance_id), o.outcome)
      FROM public.supervisory_response_sla_obligation o WHERE o.id = ob.id));

  -- -------------------------------------------------------- policy trace ----
  jw := public.supervisory_assessment_policy_trace(a);
  INSERT INTO r2f VALUES ('R2F-19-POLICY-TRACE-COMPLETE',
    (SELECT count(*) FROM jsonb_array_elements(jw->'links') l WHERE l->>'status'='EVALUATED') = 4
      AND (jw->'rating'->>'operative_rating') IS NOT NULL,
    format('%s of %s stages governed, operative rating %s',
      (SELECT count(*) FROM jsonb_array_elements(jw->'links') l WHERE l->>'status'='EVALUATED'),
      jsonb_array_length(jw->'links'), jw->'rating'->>'operative_rating'));

  RESET ROLE;
END $$;

SELECT gate, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, detail FROM r2f ORDER BY gate;
SELECT count(*) FILTER (WHERE ok) AS passed, count(*) AS total FROM r2f;

DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad FROM r2f WHERE NOT ok;
  IF bad > 0 THEN RAISE EXCEPTION 'PCOMP-R2F live chain: % gate(s) failed — nothing is retained', bad; END IF;
END $$;

COMMIT;
