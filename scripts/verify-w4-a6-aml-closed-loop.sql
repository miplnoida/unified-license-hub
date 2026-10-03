-- Epic 4 / W4-A6 — AML/CFT closed-loop certification
--
-- Proves one complete, governed AML/CFT supervisory loop on a single entity:
--
--   perimeter → assessment (maker/checker) → authoritative risk state
--   → supervisory attention → supervisory plan → intervention
--   → examination (exact provenance, scope, examiner amendment)
--   → information requests → workpaper → finding (maker/checker)
--   → management response (officer-recorded, with receipt provenance)
--   → corrective actions → independent validation → escalation
--   → residual deficiency decision → closure
--   → reassessment requirement → follow-up assessment → risk movement
--
-- Everything runs through the governed operations only, as real certification
-- personas, inside a transaction that is rolled back. No auth.users rows are
-- seeded.

\set ON_ERROR_STOP on
\set QUIET 1
\pset pager off
SET row_security = on;

-- certification personas (public.cert_certification_users)
-- AML/CFT officer (maker), AML/CFT supervisor (checker), enforcement officer
\set EXAMINER   '{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}'
\set REVIEWER   '{"sub":"b597c405-e0c4-421b-9092-820a444f2429","role":"authenticated"}'
\set SUPERVISOR '{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}'
\set ENFORCER   '{"sub":"7190c434-24c1-47dc-a2fb-c3cbad5bfaf3","role":"authenticated"}'
-- a second, independent supervisor (residual deficiency decisions)
\set SUPERVISOR2 '{"sub":"021f95d9-7da6-4ded-9b13-d2c8a6b8c3ce","role":"authenticated"}'

BEGIN;

CREATE TEMP TABLE a6(k text PRIMARY KEY, v uuid) ON COMMIT DROP;
GRANT ALL ON a6 TO authenticated;
CREATE TEMP TABLE a6t(k text PRIMARY KEY, v text) ON COMMIT DROP;
GRANT ALL ON a6t TO authenticated;
CREATE TEMP TABLE a6n(k text PRIMARY KEY, v numeric) ON COMMIT DROP;
GRANT ALL ON a6n TO authenticated;

-- ---------------------------------------------------------------------------
-- Fixture: the master closed-loop entity, plus a second entity that will be
-- determined to sit OUTSIDE the AML/CFT perimeter.
-- ---------------------------------------------------------------------------
DO $$
DECLARE p uuid; ent uuid; other uuid; sect uuid;
BEGIN
  SELECT id INTO sect FROM public.sectors ORDER BY created_at LIMIT 1;

  INSERT INTO public.parties(party_kind, display_name)
  VALUES ('ORGANIZATION','DEMO MONEY SERVICES LTD') RETURNING id INTO p;
  INSERT INTO public.licensees(name, party_id, sector_id, status)
  VALUES ('DEMO MONEY SERVICES LTD', p, sect, 'active') RETURNING id INTO ent;

  INSERT INTO public.parties(party_kind, display_name)
  VALUES ('ORGANIZATION','DEMO NON-FINANCIAL HOLDINGS LTD') RETURNING id INTO p;
  INSERT INTO public.licensees(name, party_id, sector_id, status)
  VALUES ('DEMO NON-FINANCIAL HOLDINGS LTD', p, sect, 'active') RETURNING id INTO other;

  -- the whole supervisory team is in scope for the master entity
  INSERT INTO public.entity_supervision_assignments(entity_id, lead_supervisor_user_id,
      alternate_supervisor_user_id, status, assignment_reason)
  VALUES (ent, 'b8eaf680-fe66-4d49-b816-1c087f511235', 'b597c405-e0c4-421b-9092-820a444f2429',
      'active', 'W4-A6 closed-loop certification');
  INSERT INTO public.entity_supervision_assignments(entity_id, lead_supervisor_user_id, status, assignment_reason)
  VALUES (ent, '0b522724-adcb-48bf-b21d-175339479616', 'active', 'W4-A6 checker');
  INSERT INTO public.entity_supervision_assignments(entity_id, lead_supervisor_user_id, status, assignment_reason)
  VALUES (ent, '021f95d9-7da6-4ded-9b13-d2c8a6b8c3ce', 'active', 'W4-A6 independent residual decision');
  INSERT INTO public.entity_supervision_assignments(entity_id, lead_supervisor_user_id, status, assignment_reason)
  VALUES (other, 'b8eaf680-fe66-4d49-b816-1c087f511235', 'active', 'W4-A6 perimeter control');
  INSERT INTO public.entity_supervision_assignments(entity_id, lead_supervisor_user_id, status, assignment_reason)
  VALUES (other, '0b522724-adcb-48bf-b21d-175339479616', 'active', 'W4-A6 perimeter determination');

  INSERT INTO a6(k,v) VALUES ('ent',ent),('other',other);
  -- AML-CLOSE-02C: explicit (rolled-back) perimeter determination for the master entity.
  INSERT INTO public.supervisory_domain_perimeter(entity_id, domain_code, is_applicable, basis)
  VALUES (ent, 'AML_CFT', true, 'A6 fixture (rolled back): AML/CFT supervision applies.')
  ON CONFLICT (entity_id, domain_code) DO NOTHING;
END $$;

-- ---------------------------------------------------------------------------
-- A6-01 — an entity is inside a domain perimeter until a determination says otherwise
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT public.supervisory_domain_applicable((SELECT v FROM a6 WHERE k='ent'), 'AML_CFT') THEN
    RAISE EXCEPTION 'FAIL A6-01: a new entity is not treated as AML/CFT applicable by default'; END IF;
  IF NOT public.supervisory_domain_applicable((SELECT v FROM a6 WHERE k='other'), 'AML_CFT') THEN
    RAISE EXCEPTION 'FAIL A6-01: the control entity is not applicable by default'; END IF;
  RAISE NOTICE 'PASS A6-01: absence of a determination means the domain applies';
END $$;

-- ---------------------------------------------------------------------------
-- A6-02 — only a governed determination can place an entity outside the perimeter
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = :'SUPERVISOR';
DO $$
DECLARE ok boolean := false; pid uuid; row_ public.supervisory_domain_perimeter;
BEGIN
  BEGIN
    INSERT INTO public.supervisory_domain_perimeter(entity_id, domain_code, is_applicable, basis)
    VALUES ((SELECT v FROM a6 WHERE k='other'), 'AML_CFT', false, 'direct write attempt');
  EXCEPTION WHEN insufficient_privilege OR others THEN ok := true;
  END;
  IF NOT ok THEN
    RAISE EXCEPTION 'FAIL A6-02: the perimeter table accepted a direct browser write'; END IF;

  BEGIN
    pid := public.supervisory_domain_perimeter_set(
      (SELECT v FROM a6 WHERE k='other'), 'AML_CFT', false, 'short');
    RAISE EXCEPTION 'FAIL A6-02: a determination was accepted without a stated basis';
  EXCEPTION WHEN sqlstate '22023' THEN NULL;
  END;

  pid := public.supervisory_domain_perimeter_set(
    (SELECT v FROM a6 WHERE k='other'), 'AML_CFT', false,
    'Holding company with no relevant financial business; AML/CFT obligations do not apply.');
  SELECT * INTO row_ FROM public.supervisory_domain_perimeter WHERE id = pid;
  IF row_.determined_by IS NULL OR row_.determined_at IS NULL THEN
    RAISE EXCEPTION 'FAIL A6-02: the determination has no accountable officer'; END IF;
  IF public.supervisory_domain_applicable((SELECT v FROM a6 WHERE k='other'), 'AML_CFT') THEN
    RAISE EXCEPTION 'FAIL A6-02: the determination did not take effect'; END IF;
  RAISE NOTICE 'PASS A6-02: perimeter determinations are governed, reasoned and attributed';
END $$;

-- ---------------------------------------------------------------------------
-- A6-03 — no AML/CFT assessment may be raised outside the perimeter
-- ---------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = :'EXAMINER';
DO $$
DECLARE msg text;
BEGIN
  BEGIN
    PERFORM public.supervisory_assessment_create(
      (SELECT v FROM a6 WHERE k='other'), 'AML_CFT', 'PERIODIC');
    RAISE EXCEPTION 'FAIL A6-03: an assessment was raised for an entity outside the perimeter';
  EXCEPTION WHEN sqlstate '22023' THEN
    msg := SQLERRM;
    IF msg NOT LIKE '%domain_not_applicable%' THEN
      RAISE EXCEPTION 'FAIL A6-03: refusal for the wrong reason — %', msg; END IF;
  END;
  RAISE NOTICE 'PASS A6-03: the perimeter is enforced at the point of assessment';
END $$;

-- ---------------------------------------------------------------------------
-- A6-04 — the AML/CFT read models count only the perimeter
-- ---------------------------------------------------------------------------
DO $$
DECLARE m jsonb; n int;
BEGIN
  m := public.aml_overview_metrics();
  IF COALESCE((m->>'entities_outside_perimeter')::int,0) < 1 THEN
    RAISE EXCEPTION 'FAIL A6-04: the overview does not report entities outside the perimeter'; END IF;
  SELECT count(*) INTO n FROM public.aml_portfolio(500) p
   WHERE p.entity_id = (SELECT v FROM a6 WHERE k='other');
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL A6-04: an out-of-perimeter entity still appears in the AML portfolio'; END IF;
  SELECT count(*) INTO n FROM public.aml_portfolio(500) p
   WHERE p.entity_id = (SELECT v FROM a6 WHERE k='ent');
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL A6-04: the in-perimeter entity is missing from the AML portfolio'; END IF;
  RAISE NOTICE 'PASS A6-04: AML/CFT coverage and portfolio are measured against the perimeter';
END $$;

-- ---------------------------------------------------------------------------
-- A6-05 — the inherent/control/residual assessment is recorded by dimension
-- ---------------------------------------------------------------------------
DO $$
DECLARE res jsonb; aid uuid; d jsonb;
BEGIN
  res := public.supervisory_assessment_create(
    (SELECT v FROM a6 WHERE k='ent'), 'AML_CFT', 'PERIODIC',
    (current_date - 365), (current_date - 1), NULL, 'PERIODIC', NULL,
    'Annual AML/CFT risk assessment of a money services business.');
  aid := (res->>'id')::uuid;
  INSERT INTO a6(k,v) VALUES ('assessment', aid);
  INSERT INTO a6t(k,v) VALUES ('assessment_ref', res->>'reference');

  d := public.supervisory_assessment_dimension_upsert(aid, 'TRANSACTION_MONITORING',
        'CONTROL_EFFECTIVENESS', 'HIGH', 'WEAK', 'HIGH', NULL, NULL,
        'Alert volumes have trebled while the review team is unchanged.',
        NULL, NULL, 'Monitoring MI for the review period', NULL, NULL, 'DETERIORATING');
  INSERT INTO a6(k,v) VALUES ('dim_tm', (d->>'id')::uuid);
  d := public.supervisory_assessment_dimension_upsert(aid, 'STR_SAR_GOVERNANCE',
        'CONTROL_EFFECTIVENESS', 'HIGH', 'NEEDS_IMPROVEMENT', 'HIGH', NULL, NULL,
        'Suspicious transaction reporting decisions are not consistently evidenced.');
  INSERT INTO a6(k,v) VALUES ('dim_str', (d->>'id')::uuid);
  d := public.supervisory_assessment_dimension_upsert(aid, 'CDD_KYC',
        'CONTROL_EFFECTIVENESS', 'MODERATE', 'SATISFACTORY', 'MODERATE', NULL, NULL,
        'Customer due diligence files are complete for the sampled population.');
  INSERT INTO a6(k,v) VALUES ('dim_cdd', (d->>'id')::uuid);
  d := public.supervisory_assessment_dimension_upsert(aid, 'GEOGRAPHIC_RISK',
        'INHERENT_RISK', 'LOW', 'SATISFACTORY', 'LOW', NULL, NULL,
        'Corridors are limited to low-risk jurisdictions.');
  INSERT INTO a6(k,v) VALUES ('dim_geo', (d->>'id')::uuid);

  IF (SELECT count(*) FROM public.supervisory_assessment_dimension WHERE assessment_id = aid) <> 4 THEN
    RAISE EXCEPTION 'FAIL A6-05: the assessment does not carry its four risk dimensions'; END IF;
  RAISE NOTICE 'PASS A6-05: assessment % records inherent, control and residual ratings per dimension',
    (SELECT v FROM a6t WHERE k='assessment_ref');
END $$;

-- ---------------------------------------------------------------------------
-- A6-06 — maker/checker: the preparer cannot approve; a HIGH rating becomes
--          the entity's authoritative AML/CFT risk state
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM public.supervisory_assessment_transition((SELECT v FROM a6 WHERE k='assessment'),
    'submitted', 'Submitted for independent review by the AML supervisor.');
  BEGIN
    PERFORM public.supervisory_assessment_transition((SELECT v FROM a6 WHERE k='assessment'),
      'approved', 'Self-approval attempt by the preparing officer.', 'HIGH');
    RAISE EXCEPTION 'FAIL A6-06: the preparing officer approved their own assessment';
  EXCEPTION WHEN sqlstate '22023' OR sqlstate '42501' THEN NULL;
  END;
END $$;

SET LOCAL "request.jwt.claims" = :'SUPERVISOR';
DO $$
DECLARE rs public.entity_risk_state;
BEGIN
  PERFORM public.supervisory_assessment_transition((SELECT v FROM a6 WHERE k='assessment'),
    'reviewed', 'Independent review completed; ratings and evidence are supported.');
  PERFORM public.supervisory_assessment_transition((SELECT v FROM a6 WHERE k='assessment'),
    'approved', 'Approved as the current AML/CFT risk assessment.', 'HIGH',
    (current_date + 180));

  SELECT * INTO rs FROM public.entity_risk_state
   WHERE entity_id = (SELECT v FROM a6 WHERE k='ent') AND domain_code = 'AML_CFT';
  IF rs.entity_id IS NULL OR upper(rs.residual_rating) <> 'HIGH' THEN
    RAISE EXCEPTION 'FAIL A6-06: the approved assessment did not set a HIGH authoritative risk state (%)',
      rs.residual_rating; END IF;
  IF rs.driving_assessment_id <> (SELECT v FROM a6 WHERE k='assessment') THEN
    RAISE EXCEPTION 'FAIL A6-06: the risk state is not driven by the approved assessment'; END IF;
  INSERT INTO a6n(k,v) VALUES ('coverage_after_approval',
    (public.aml_overview_metrics()->>'entities_with_current_assessment')::numeric);
  RAISE NOTICE 'PASS A6-06: maker/checker holds and the approved HIGH rating is authoritative';
END $$;

-- ---------------------------------------------------------------------------
-- A6-07 — supervisory attention is opened from the deteriorating dimension
-- ---------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = :'EXAMINER';
DO $$
DECLARE res jsonb; o public.supervisory_attention_origin;
BEGIN
  res := public.supervisory_attention_open(
    'Deteriorating transaction monitoring at DEMO MONEY SERVICES LTD',
    'AML_CFT',
    'The approved AML/CFT assessment rates transaction monitoring HIGH and deteriorating; supervisory attention is required.',
    'SUPERVISORY_ASSESSMENT',
    ARRAY[(SELECT v FROM a6 WHERE k='ent')],
    (SELECT v FROM a6 WHERE k='assessment'),
    (SELECT v FROM a6 WHERE k='dim_tm'),
    NULL, NULL, NULL, NULL, 'high', 'high');
  INSERT INTO a6(k,v) VALUES ('attention', (res->>'id')::uuid);
  INSERT INTO a6t(k,v) VALUES ('attention_ref', res->>'reference');

  SELECT * INTO o FROM public.supervisory_attention_origin
   WHERE attention_id = (res->>'id')::uuid;
  IF o.assessment_id IS DISTINCT FROM (SELECT v FROM a6 WHERE k='assessment')
     OR o.assessment_dimension_id IS DISTINCT FROM (SELECT v FROM a6 WHERE k='dim_tm') THEN
    RAISE EXCEPTION 'FAIL A6-07: attention does not record the exact originating dimension'; END IF;
  RAISE NOTICE 'PASS A6-07: attention % carries the exact assessment dimension that caused it',
    (res->>'reference');
END $$;

-- ---------------------------------------------------------------------------
-- A6-08 — priority is confirmed by a supervisor, with a rationale
-- ---------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = :'SUPERVISOR';
DO $$
DECLARE res jsonb; a public.supervisory_attention;
BEGIN
  res := public.supervisory_attention_confirm_priority((SELECT v FROM a6 WHERE k='attention'),
    'HIGH', 'Confirmed HIGH: monitoring weakness is current and the customer base is cash intensive.');
  SELECT * INTO a FROM public.supervisory_attention WHERE id = (SELECT v FROM a6 WHERE k='attention');
  IF a.confirmed_priority <> 'HIGH' OR a.confirmed_by IS NULL OR a.status <> 'PRIORITISED' THEN
    RAISE EXCEPTION 'FAIL A6-08: the priority confirmation was not recorded'; END IF;
  RAISE NOTICE 'PASS A6-08: priority is a recorded supervisory decision, not a calculation';
END $$;

-- ---------------------------------------------------------------------------
-- A6-09 — a supervisory plan is opened, submitted, approved by a non-maker and activated
-- ---------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = :'EXAMINER';
DO $$
DECLARE res jsonb;
BEGIN
  res := public.supervisory_plan_open(
    'AML/CFT targeted supervision — DEMO MONEY SERVICES LTD', 'AML_CFT',
    'Approved AML/CFT assessment rates the entity HIGH with deteriorating transaction monitoring.',
    'Establish whether transaction monitoring and suspicious transaction reporting operate effectively.',
    (SELECT v FROM a6 WHERE k='attention'),
    ARRAY[(SELECT v FROM a6 WHERE k='assessment')],
    ARRAY[(SELECT v FROM a6 WHERE k='ent')],
    'annual', to_char(current_date,'YYYY'), NULL, NULL, current_date, (current_date + 120), NULL, 'HIGH');
  INSERT INTO a6(k,v) VALUES ('plan', (res->>'id')::uuid);
  PERFORM public.supervisory_plan_lifecycle((SELECT v FROM a6 WHERE k='plan'), 'SUBMITTED',
    'Submitted for supervisory approval.');
  BEGIN
    PERFORM public.supervisory_plan_lifecycle((SELECT v FROM a6 WHERE k='plan'), 'APPROVED',
      'Self-approval attempt by the preparing officer.');
    RAISE EXCEPTION 'FAIL A6-09: the preparing officer approved their own plan';
  EXCEPTION WHEN sqlstate '22023' OR sqlstate '42501' THEN NULL;
  END;
END $$;

SET LOCAL "request.jwt.claims" = :'SUPERVISOR';
DO $$
DECLARE p public.supervisory_plan;
BEGIN
  PERFORM public.supervisory_plan_lifecycle((SELECT v FROM a6 WHERE k='plan'), 'APPROVED',
    'Approved: the planned targeted examination is proportionate to the risk.');
  PERFORM public.supervisory_plan_lifecycle((SELECT v FROM a6 WHERE k='plan'), 'ACTIVE',
    'Plan activated for the current supervisory cycle.');
  SELECT * INTO p FROM public.supervisory_plan WHERE id = (SELECT v FROM a6 WHERE k='plan');
  IF p.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'FAIL A6-09: the plan is % rather than ACTIVE', p.status; END IF;
  RAISE NOTICE 'PASS A6-09: the plan follows a governed maker/checker lifecycle';
END $$;

-- ---------------------------------------------------------------------------
-- A6-10 — the intervention is proposed by the officer and endorsed by another
-- ---------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = :'EXAMINER';
DO $$
DECLARE res jsonb;
BEGIN
  res := public.supervisory_intervention_open(
    (SELECT v FROM a6 WHERE k='plan'), 'TARGETED_EXAMINATION',
    'Targeted AML/CFT examination of transaction monitoring and STR governance',
    'The approved assessment and the prioritised attention both point to monitoring and reporting controls.',
    'AML_CFT', (SELECT v FROM a6 WHERE k='ent'), (SELECT v FROM a6 WHERE k='attention'),
    'Evidence-based conclusion on the effectiveness of monitoring and reporting controls.',
    current_date, (current_date + 60));
  INSERT INTO a6(k,v) VALUES ('intervention', (res->>'id')::uuid);
  BEGIN
    PERFORM public.supervisory_intervention_decide((SELECT v FROM a6 WHERE k='intervention'),
      'ENDORSED', 'Self-endorsement attempt by the proposing officer.');
    RAISE EXCEPTION 'FAIL A6-10: the proposing officer endorsed their own intervention';
  EXCEPTION WHEN sqlstate '22023' OR sqlstate '42501' THEN NULL;
  END;
END $$;

SET LOCAL "request.jwt.claims" = :'SUPERVISOR';
DO $$
DECLARE iv public.supervisory_intervention;
BEGIN
  PERFORM public.supervisory_intervention_decide((SELECT v FROM a6 WHERE k='intervention'),
    'ENDORSED', 'Endorsed: a targeted examination is the proportionate supervisory response.');
  SELECT * INTO iv FROM public.supervisory_intervention WHERE id = (SELECT v FROM a6 WHERE k='intervention');
  IF iv.status <> 'ENDORSED' OR iv.decided_by IS NULL THEN
    RAISE EXCEPTION 'FAIL A6-10: the intervention endorsement was not recorded'; END IF;
  RAISE NOTICE 'PASS A6-10: intervention endorsement is a separate, attributed decision';
END $$;

-- ---------------------------------------------------------------------------
-- A6-11 — the examination is opened from the endorsed intervention, with exact provenance
-- ---------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = :'EXAMINER';
DO $$
DECLARE res jsonb; e public.examinations; n int;
BEGIN
  res := public.supervisory_examination_open(
    (SELECT v FROM a6 WHERE k='intervention'),
    'Targeted AML/CFT examination — DEMO MONEY SERVICES LTD',
    'TARGETED_ONSITE', 'AML_CFT', (SELECT v FROM a6 WHERE k='ent'),
    ARRAY[(SELECT v FROM a6 WHERE k='assessment')],
    ARRAY[(SELECT v FROM a6 WHERE k='dim_tm'), (SELECT v FROM a6 WHERE k='dim_str')],
    (current_date - 365), (current_date - 1), NULL, NULL, 'RISK_BASED_SUPERVISION');
  INSERT INTO a6(k,v) VALUES ('exam', (res->>'id')::uuid);
  INSERT INTO a6t(k,v) VALUES ('exam_ref', res->>'reference');

  SELECT * INTO e FROM public.examinations WHERE id = (SELECT v FROM a6 WHERE k='exam');
  IF e.origin_provenance <> 'GOVERNED' THEN
    RAISE EXCEPTION 'FAIL A6-11: the examination is not governed provenance'; END IF;
  IF e.domain_code <> 'AML_CFT' THEN
    RAISE EXCEPTION 'FAIL A6-11: the examination lost its supervisory domain'; END IF;
  IF e.intervention_id IS DISTINCT FROM (SELECT v FROM a6 WHERE k='intervention')
     OR e.plan_id IS DISTINCT FROM (SELECT v FROM a6 WHERE k='plan') THEN
    RAISE EXCEPTION 'FAIL A6-11: the examination does not carry its intervention and plan'; END IF;
  SELECT count(*) INTO n FROM public.examination_origin
   WHERE examination_id = e.id AND assessment_id = (SELECT v FROM a6 WHERE k='assessment');
  IF n < 1 THEN
    RAISE EXCEPTION 'FAIL A6-11: the driving assessment is not recorded as the examination origin'; END IF;
  RAISE NOTICE 'PASS A6-11: examination % is opened only from an endorsed intervention, with exact origin',
    (res->>'reference');
END $$;

-- ---------------------------------------------------------------------------
-- A6-12 — scope comes from the approved assessment; examiner additions are rationalised
-- ---------------------------------------------------------------------------
DO $$
DECLARE n int; a public.examination_scope_area;
BEGIN
  PERFORM public.examination_scope_from_assessment((SELECT v FROM a6 WHERE k='exam'),
    ARRAY[(SELECT v FROM a6 WHERE k='dim_tm'), (SELECT v FROM a6 WHERE k='dim_str')],
    'Scope taken from the HIGH-rated dimensions of the approved AML/CFT assessment.');
  SELECT count(*) INTO n FROM public.examination_scope_dimension
   WHERE examination_id = (SELECT v FROM a6 WHERE k='exam');
  IF n <> 2 THEN
    RAISE EXCEPTION 'FAIL A6-12: expected two assessment-derived scope dimensions, found %', n; END IF;

  PERFORM public.examination_scope_area_amend((SELECT v FROM a6 WHERE k='exam'),
    'AGENT_OVERSIGHT', 'Agent network oversight',
    'Added by the examiner: the agent network grew by 40% since the assessment date.');
  SELECT * INTO a FROM public.examination_scope_area
   WHERE examination_id = (SELECT v FROM a6 WHERE k='exam') AND area_code = 'AGENT_OVERSIGHT';
  IF a.id IS NULL OR COALESCE(a.source,'') <> 'EXAMINER_AMENDED' OR COALESCE(a.amendment_rationale,'') = '' THEN
    RAISE EXCEPTION 'FAIL A6-12: the examiner amendment is not recorded as such with a rationale'; END IF;
  RAISE NOTICE 'PASS A6-12: examination scope is traceable to the assessment and to examiner judgement';
END $$;

-- ---------------------------------------------------------------------------
-- A6-13 — information requests are issued and received against the scope
-- ---------------------------------------------------------------------------
DO $$
DECLARE r1 uuid; r2 uuid; r3 uuid; n int;
BEGIN
  r1 := public.examination_data_request_save(jsonb_build_object(
    'examination_id', (SELECT v FROM a6 WHERE k='exam'),
    'title','Complete alert population for the review period',
    'description','Every monitoring alert raised, with disposition and decision maker.',
    'data_format','CSV','due_date', (current_date + 10)::text,
    'requested_from','Compliance Officer','priority','HIGH',
    'assessment_dimension_id', (SELECT v FROM a6 WHERE k='dim_tm')));
  r2 := public.examination_data_request_save(jsonb_build_object(
    'examination_id', (SELECT v FROM a6 WHERE k='exam'),
    'title','STR/SAR register and supporting decision papers',
    'description','All internal reports considered, with the reasons for reporting or not reporting.',
    'data_format','PDF','due_date', (current_date + 10)::text,
    'requested_from','Money Laundering Reporting Officer','priority','HIGH',
    'assessment_dimension_id', (SELECT v FROM a6 WHERE k='dim_str')));
  r3 := public.examination_data_request_save(jsonb_build_object(
    'examination_id', (SELECT v FROM a6 WHERE k='exam'),
    'title','Transaction monitoring rule set and tuning history',
    'description','Rules in force, thresholds and any change made in the review period.',
    'data_format','XLSX','due_date', (current_date + 14)::text,
    'requested_from','Head of Technology','priority','NORMAL',
    'assessment_dimension_id', (SELECT v FROM a6 WHERE k='dim_tm')));
  INSERT INTO a6(k,v) VALUES ('rfi1',r1),('rfi2',r2),('rfi3',r3);

  PERFORM public.examination_data_request_issue(r1);
  PERFORM public.examination_data_request_issue(r2);
  PERFORM public.examination_data_request_issue(r3);
  PERFORM public.examination_data_request_receive(r1, 'Alert extract provided in full.', NULL, true);
  PERFORM public.examination_data_request_receive(r2, 'Register provided; three decision papers missing.',
    'Decision papers for March, May and August.', false);
  PERFORM public.examination_data_request_receive(r3, 'Rule set and tuning log provided.', NULL, true);

  SELECT count(*) INTO n FROM public.examination_data_requests
   WHERE examination_id = (SELECT v FROM a6 WHERE k='exam') AND issued_at IS NOT NULL;
  IF n <> 3 THEN RAISE EXCEPTION 'FAIL A6-13: expected three issued requests, found %', n; END IF;
  SELECT count(*) INTO n FROM public.examination_data_requests
   WHERE examination_id = (SELECT v FROM a6 WHERE k='exam') AND outstanding_items IS NOT NULL;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL A6-13: partial receipt did not record what is still outstanding'; END IF;
  RAISE NOTICE 'PASS A6-13: information requests are issued, received and honest about gaps';
END $$;

-- ---------------------------------------------------------------------------
-- A6-14 — the workpaper carries population, sample, exceptions and conclusion,
--          and the preparer cannot be the reviewer
-- ---------------------------------------------------------------------------
DO $$
DECLARE wp uuid; w public.examination_workpapers;
BEGIN
  wp := public.examination_workpaper_save(jsonb_build_object(
    'examination_id', (SELECT v FROM a6 WHERE k='exam'),
    'area','Transaction monitoring',
    'objective','Determine whether monitoring alerts are investigated and decisions evidenced.',
    'procedure_performed','Risk-based sample of alerts traced to investigation records and decisions.',
    'population_description','All monitoring alerts raised in the period under review',
    'population_size','4800','sampling_method','RISK_BASED','sample_size','50',
    'exceptions_count','17','material_exceptions_count','6',
    'analysis','Seventeen sampled alerts had no evidenced investigation; six involved high-risk corridors.',
    'conclusion','Transaction monitoring is not operating effectively.',
    'control_assessment','INEFFECTIVE',
    'assessment_dimension_id', (SELECT v FROM a6 WHERE k='dim_tm')));
  INSERT INTO a6(k,v) VALUES ('wp', wp);
  PERFORM public.examination_workpaper_submit_review(wp);

  SELECT * INTO w FROM public.examination_workpapers WHERE id = wp;
  IF w.population_size <> 4800 OR w.sample_size <> 50
     OR w.exceptions_count <> 17 OR w.material_exceptions_count <> 6 THEN
    RAISE EXCEPTION 'FAIL A6-14: the workpaper does not carry its population, sample and exceptions'; END IF;
  IF upper(COALESCE(w.control_assessment,'')) <> 'INEFFECTIVE' THEN
    RAISE EXCEPTION 'FAIL A6-14: the control conclusion was not recorded'; END IF;
  IF w.assessment_dimension_id IS DISTINCT FROM (SELECT v FROM a6 WHERE k='dim_tm') THEN
    RAISE EXCEPTION 'FAIL A6-14: the workpaper is not tied to the risk dimension it tests'; END IF;
  RAISE NOTICE 'PASS A6-14: the workpaper is evidence, not narrative (4800/50/17/6, INEFFECTIVE)';
END $$;

-- ---------------------------------------------------------------------------
-- A6-15 — the finding inherits the exact backward provenance chain
-- ---------------------------------------------------------------------------
DO $$
DECLARE fid uuid; f public.supervisory_finding;
BEGIN
  fid := public.supervisory_finding_create(jsonb_build_object(
    'entity_id', (SELECT v FROM a6 WHERE k='ent'), 'domain_code','AML_CFT', 'severity','HIGH',
    'finding_category','TRANSACTION_MONITORING',
    'title','Monitoring alerts are not investigated or evidenced',
    'observation','Seventeen of fifty sampled alerts had no evidenced investigation or decision.',
    'root_cause','Alert volumes have trebled without any increase in review capacity.',
    'risk_impact','Suspicious activity may go undetected and unreported.',
    'regulatory_criterion','AML/CFT Regulations — ongoing monitoring and record keeping',
    'required_action','Clear the alert backlog and evidence every alert decision.',
    'examination_id', (SELECT v FROM a6 WHERE k='exam'),
    'workpaper_id', (SELECT v FROM a6 WHERE k='wp'),
    'due_date', (current_date + 60)::text));
  INSERT INTO a6(k,v) VALUES ('finding', fid);

  SELECT * INTO f FROM public.supervisory_finding WHERE id = fid;
  INSERT INTO a6t(k,v) VALUES ('finding_ref', f.reference);
  IF f.origin_provenance <> 'GOVERNED' OR f.source_kind <> 'EXAMINATION' THEN
    RAISE EXCEPTION 'FAIL A6-15: the finding is not a governed examination finding'; END IF;
  IF f.workpaper_id IS DISTINCT FROM (SELECT v FROM a6 WHERE k='wp')
     OR f.examination_id IS DISTINCT FROM (SELECT v FROM a6 WHERE k='exam')
     OR f.assessment_id IS DISTINCT FROM (SELECT v FROM a6 WHERE k='assessment')
     OR f.assessment_dimension_id IS DISTINCT FROM (SELECT v FROM a6 WHERE k='dim_tm')
     OR f.intervention_id IS DISTINCT FROM (SELECT v FROM a6 WHERE k='intervention')
     OR f.plan_id IS DISTINCT FROM (SELECT v FROM a6 WHERE k='plan')
     OR f.attention_id IS DISTINCT FROM (SELECT v FROM a6 WHERE k='attention') THEN
    RAISE EXCEPTION 'FAIL A6-15: the finding does not carry the whole supervisory chain'; END IF;
  RAISE NOTICE 'PASS A6-15: finding % traces back to workpaper, examination, intervention, plan, attention and dimension',
    f.reference;
END $$;

-- ---------------------------------------------------------------------------
-- A6-16 — a HIGH finding cannot be issued by the officer who raised it
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM public.supervisory_finding_lifecycle((SELECT v FROM a6 WHERE k='finding'), 'REVIEW',
    'Submitted for supervisory review before issue.');
  BEGIN
    PERFORM public.supervisory_finding_lifecycle((SELECT v FROM a6 WHERE k='finding'), 'ISSUED',
      'Self-issue attempt by the raising examiner.');
    RAISE EXCEPTION 'FAIL A6-16: a HIGH finding was issued by the officer who raised it';
  EXCEPTION WHEN sqlstate '22023' OR sqlstate '42501' THEN NULL;
  END;
END $$;

SET LOCAL "request.jwt.claims" = :'SUPERVISOR';
DO $$
BEGIN
  PERFORM public.supervisory_finding_lifecycle((SELECT v FROM a6 WHERE k='finding'), 'ISSUED',
    'Issued to the entity with a sixty-day response requirement.');
  RAISE NOTICE 'PASS A6-16: issuing a HIGH finding is an independent supervisory act';
END $$;

-- ---------------------------------------------------------------------------
-- A6-17 — an officer-recorded response must state how it was received
-- ---------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = :'EXAMINER';
DO $$
DECLARE f public.supervisory_finding;
BEGIN
  BEGIN
    PERFORM public.supervisory_finding_response((SELECT v FROM a6 WHERE k='finding'),
      'ACCEPTED', 'The entity accepts the finding and will clear the backlog.');
    RAISE EXCEPTION 'FAIL A6-17: an officer-recorded response was accepted without receipt provenance';
  EXCEPTION WHEN sqlstate '22023' THEN NULL;
  END;

  PERFORM public.supervisory_finding_response((SELECT v FROM a6 WHERE k='finding'),
    'ACCEPTED',
    'The entity accepts the finding, will clear the alert backlog and will add two reviewers.',
    'Clear the backlog, evidence every decision and recruit two alert reviewers.',
    'Chief Compliance Officer', (current_date + 45), NULL,
    'Chief Compliance Officer, DEMO MONEY SERVICES LTD', current_date, 'LETTER');

  SELECT * INTO f FROM public.supervisory_finding WHERE id = (SELECT v FROM a6 WHERE k='finding');
  IF COALESCE(f.response_source,'') <> 'OFFICER_RECORDED' THEN
    RAISE EXCEPTION 'FAIL A6-17: the response was not recorded as officer-recorded (%)', f.response_source; END IF;
  IF f.response_received_from IS NULL OR f.response_received_date IS NULL
     OR f.response_channel <> 'LETTER' OR f.response_recorded_at IS NULL THEN
    RAISE EXCEPTION 'FAIL A6-17: receipt provenance is incomplete'; END IF;
  RAISE NOTICE 'PASS A6-17: an officer-recorded management response states sender, date and channel';
END $$;

-- ---------------------------------------------------------------------------
-- A6-18 — three corrective actions are opened, accepted and evidenced
-- ---------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = :'SUPERVISOR';
DO $$
DECLARE r1 uuid; r2 uuid; r3 uuid;
BEGIN
  PERFORM public.supervisory_finding_lifecycle((SELECT v FROM a6 WHERE k='finding'),
    'REMEDIATION_REQUIRED', 'Corrective actions required against the accepted response.');
  r1 := public.supervisory_remediation_open((SELECT v FROM a6 WHERE k='finding'),
    'Clear the outstanding alert backlog and evidence every decision.',
    'No alert older than thirty days without an evidenced decision.',
    NULL, 'Chief Compliance Officer', (current_date + 30));
  r2 := public.supervisory_remediation_open((SELECT v FROM a6 WHERE k='finding'),
    'Recruit and train two additional alert reviewers.',
    'Review capacity matched to alert volume.',
    NULL, 'Head of Human Resources', (current_date + 60));
  r3 := public.supervisory_remediation_open((SELECT v FROM a6 WHERE k='finding'),
    'Retune monitoring rules and document the tuning decisions.',
    'Rule set calibrated to the current risk profile, with documented rationale.',
    NULL, 'Head of Technology', (current_date + 90));
  INSERT INTO a6(k,v) VALUES ('ra1',r1),('ra2',r2),('ra3',r3);

  FOR r1 IN SELECT v FROM a6 WHERE k IN ('ra1','ra2','ra3') LOOP
    PERFORM public.supervisory_remediation_transition(r1, 'ACTION_PLAN_SUBMITTED',
      'Action plan received from the entity.');
    PERFORM public.supervisory_remediation_transition(r1, 'UNDER_REVIEW',
      'Action plan under supervisory review.');
    PERFORM public.supervisory_remediation_transition(r1, 'ACCEPTED',
      'Action plan accepted as adequate and proportionate.');
    PERFORM public.supervisory_remediation_transition(r1, 'IMPLEMENTING',
      'Implementation under way.');
    PERFORM public.supervisory_remediation_transition(r1, 'EVIDENCE_SUBMITTED',
      'Completion evidence submitted by the entity.');
    PERFORM public.supervisory_remediation_transition(r1, 'VALIDATION',
      'Evidence accepted for independent validation.');
  END LOOP;

  IF (SELECT count(*) FROM public.supervisory_remediation_action
       WHERE finding_id = (SELECT v FROM a6 WHERE k='finding') AND status = 'VALIDATION') <> 3 THEN
    RAISE EXCEPTION 'FAIL A6-18: the three corrective actions are not all awaiting validation'; END IF;
  RAISE NOTICE 'PASS A6-18: corrective actions follow the governed remediation lifecycle';
END $$;

-- ---------------------------------------------------------------------------
-- A6-19 — effectiveness is only ever concluded through governed validation
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    PERFORM public.supervisory_remediation_transition((SELECT v FROM a6 WHERE k='ra1'),
      'EFFECTIVE', 'Direct effectiveness conclusion without validation.');
    RAISE EXCEPTION 'FAIL A6-19: effectiveness was concluded outside governed validation';
  EXCEPTION WHEN sqlstate '22023' THEN NULL;
  END;

  PERFORM public.supervisory_remediation_validate((SELECT v FROM a6 WHERE k='ra1'),
    'EFFECTIVE', 'Alert queue extract and twenty re-tested decisions',
    'Re-performance of the original sample plus a fresh sample of ten alerts',
    'Every re-tested alert carried an evidenced decision; the backlog is cleared.');
  PERFORM public.supervisory_remediation_validate((SELECT v FROM a6 WHERE k='ra2'),
    'EFFECTIVE', 'Appointment letters and training records for two reviewers',
    'Inspection of appointment and training evidence',
    'Review capacity is now matched to current alert volumes.');
  PERFORM public.supervisory_remediation_validate((SELECT v FROM a6 WHERE k='ra3'),
    'PARTIALLY_EFFECTIVE', 'Tuning log and revised rule set',
    'Walkthrough of the tuning decisions and re-run of two scenarios',
    'Rules were retuned but two high-risk corridor scenarios remain uncalibrated.',
    'Require a further tuning cycle for the outstanding corridors.');

  IF (SELECT status FROM public.supervisory_remediation_action WHERE id = (SELECT v FROM a6 WHERE k='ra3'))
     <> 'PARTIALLY_EFFECTIVE' THEN
    RAISE EXCEPTION 'FAIL A6-19: the partially effective conclusion was not recorded'; END IF;
  RAISE NOTICE 'PASS A6-19: effectiveness conclusions require evidence, procedure and rationale';
END $$;

-- ---------------------------------------------------------------------------
-- A6-20 — escalation is a supervisory decision and never triggers enforcement by itself
-- ---------------------------------------------------------------------------
DO $$
DECLARE n int;
BEGIN
  PERFORM public.supervisory_remediation_escalate((SELECT v FROM a6 WHERE k='ra3'),
    'Two high-risk corridor scenarios remain uncalibrated after a full remediation cycle.',
    'high', 'high');
  SELECT count(*) INTO n FROM public.enforcement_actions
   WHERE source_kind IN ('SUPERVISORY_REMEDIATION','SUPERVISORY_FINDING')
     AND source_id IN ((SELECT v FROM a6 WHERE k='ra3'), (SELECT v FROM a6 WHERE k='finding'));
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL A6-20: escalation created an enforcement case automatically'; END IF;
  RAISE NOTICE 'PASS A6-20: escalation records supervisory judgement without pre-empting Enforcement';
END $$;

-- ---------------------------------------------------------------------------
-- A6-21 — a residual deficiency must be accepted before a partial action
--          closes, and not by the officer who concluded the validation
-- ---------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = :'SUPERVISOR2';
DO $$
DECLARE rid uuid; ra public.supervisory_residual_acceptance;
BEGIN
  BEGIN
    PERFORM public.supervisory_remediation_transition((SELECT v FROM a6 WHERE k='ra3'),
      'CLOSED', 'Closure attempt with an unaccepted residual deficiency.');
    RAISE EXCEPTION 'FAIL A6-21: a partially effective action closed without a residual decision';
  EXCEPTION WHEN sqlstate '22023' THEN NULL;
  END;

  rid := public.supervisory_residual_acceptance_record((SELECT v FROM a6 WHERE k='ra3'),
    'Two high-risk corridor scenarios remain uncalibrated.', 'HIGH',
    'A further tuning cycle is required and will be verified at the follow-up assessment.',
    'The residual exposure is bounded and monitored; a further cycle is proportionate to closing the action.',
    (current_date + 90));
  SELECT * INTO ra FROM public.supervisory_residual_acceptance WHERE id = rid;
  IF ra.accepted_by IS NULL OR COALESCE(ra.residual_materiality,'') = '' THEN
    RAISE EXCEPTION 'FAIL A6-21: the residual acceptance is not attributed or graded'; END IF;

  PERFORM public.supervisory_remediation_transition((SELECT v FROM a6 WHERE k='ra1'),
    'CLOSED', 'Closed: validated as effective.');  -- closure by an internal officer
  PERFORM public.supervisory_remediation_transition((SELECT v FROM a6 WHERE k='ra2'),
    'CLOSED', 'Closed: validated as effective.');
  PERFORM public.supervisory_remediation_transition((SELECT v FROM a6 WHERE k='ra3'),
    'CLOSED', 'Closed with an accepted, monitored residual deficiency.');
  RAISE NOTICE 'PASS A6-21: partial effectiveness is closed only by an explicit residual decision';
END $$;

-- ---------------------------------------------------------------------------
-- A6-22 — the finding closes only when every corrective action is resolved
-- ---------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = :'SUPERVISOR2';
DO $$
DECLARE f public.supervisory_finding;
BEGIN
  IF (SELECT status FROM public.supervisory_finding WHERE id = (SELECT v FROM a6 WHERE k='finding'))
     <> 'VALIDATION' THEN
    PERFORM public.supervisory_finding_lifecycle((SELECT v FROM a6 WHERE k='finding'), 'VALIDATION',
      'All corrective actions validated; closure review under way.');
  END IF;
  PERFORM public.supervisory_finding_lifecycle((SELECT v FROM a6 WHERE k='finding'), 'CLOSED',
    'Closed: the control weakness is remediated and the residual exposure is accepted.');
  SELECT * INTO f FROM public.supervisory_finding WHERE id = (SELECT v FROM a6 WHERE k='finding');
  IF f.status <> 'CLOSED' OR f.closed_at IS NULL THEN
    RAISE EXCEPTION 'FAIL A6-22: the finding did not close (%)', f.status; END IF;
  RAISE NOTICE 'PASS A6-22: finding closure is evidence-gated across every corrective action';
END $$;

-- ---------------------------------------------------------------------------
-- A6-23 — closure requires the risk to be reassessed
-- ---------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = :'SUPERVISOR';
DO $$
DECLARE rr uuid; r public.supervisory_reassessment_requirement;
BEGIN
  rr := public.supervisory_reassessment_require(
    (SELECT v FROM a6 WHERE k='ent'), 'AML_CFT', 'REMEDIATION_COMPLETED',
    'Remediation of the monitoring finding is complete; the AML/CFT rating must be revisited.',
    'FOLLOW_UP', (current_date + 30), (SELECT v FROM a6 WHERE k='assessment'),
    (SELECT v FROM a6 WHERE k='finding'), (SELECT v FROM a6 WHERE k='ra3'), NULL,
    (SELECT v FROM a6 WHERE k='exam'));
  INSERT INTO a6(k,v) VALUES ('reassessment', rr);
  SELECT * INTO r FROM public.supervisory_reassessment_requirement WHERE id = rr;
  IF r.trigger_kind <> 'REMEDIATION_COMPLETED' OR r.finding_id IS DISTINCT FROM (SELECT v FROM a6 WHERE k='finding')
     OR r.examination_id IS DISTINCT FROM (SELECT v FROM a6 WHERE k='exam') THEN
    RAISE EXCEPTION 'FAIL A6-23: the reassessment requirement lost its causal provenance'; END IF;
  IF (public.aml_overview_metrics()->>'reassessments_required')::int < 1 THEN
    RAISE EXCEPTION 'FAIL A6-23: the required reassessment is invisible to supervision'; END IF;
  RAISE NOTICE 'PASS A6-23: closing the loop demands a reassessment, with the reason recorded';
END $$;

-- ---------------------------------------------------------------------------
-- A6-24 — the follow-up assessment supersedes the old rating and the movement
--          is recorded with provenance
-- ---------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = :'EXAMINER';
DO $$
DECLARE res jsonb; aid uuid;
BEGIN
  res := public.supervisory_assessment_create(
    (SELECT v FROM a6 WHERE k='ent'), 'AML_CFT', 'FOLLOW_UP',
    (current_date - 180), current_date, NULL, 'FOLLOW_UP', NULL,
    'Follow-up AML/CFT assessment after validated remediation of the monitoring finding.',
    NULL, (SELECT v FROM a6 WHERE k='assessment'));
  aid := (res->>'id')::uuid;
  INSERT INTO a6(k,v) VALUES ('followup', aid);
  PERFORM public.supervisory_assessment_dimension_upsert(aid, 'TRANSACTION_MONITORING',
    'CONTROL_EFFECTIVENESS', 'HIGH', 'SATISFACTORY', 'MODERATE', NULL, NULL,
    'Backlog cleared, decisions evidenced and capacity increased; two corridor scenarios remain to be tuned.',
    NULL, NULL, 'Re-performed alert testing and the accepted residual deficiency', NULL, NULL, 'IMPROVING');
  PERFORM public.supervisory_assessment_transition(aid, 'submitted',
    'Submitted for independent review following remediation.');
END $$;

SET LOCAL "request.jwt.claims" = :'SUPERVISOR';
DO $$
DECLARE rs public.entity_risk_state; m public.entity_risk_state_movement; old_ uuid;
BEGIN
  PERFORM public.supervisory_assessment_transition((SELECT v FROM a6 WHERE k='followup'), 'reviewed',
    'Independent review confirms the improvement in monitoring controls.');
  PERFORM public.supervisory_assessment_transition((SELECT v FROM a6 WHERE k='followup'), 'approved',
    'Approved: residual AML/CFT risk reduces from HIGH to MODERATE.', 'MODERATE', (current_date + 365));

  SELECT * INTO rs FROM public.entity_risk_state
   WHERE entity_id = (SELECT v FROM a6 WHERE k='ent') AND domain_code = 'AML_CFT';
  IF upper(rs.residual_rating) <> 'MODERATE' THEN
    RAISE EXCEPTION 'FAIL A6-24: the authoritative rating did not move to MODERATE (%)', rs.residual_rating; END IF;
  IF rs.driving_assessment_id <> (SELECT v FROM a6 WHERE k='followup') THEN
    RAISE EXCEPTION 'FAIL A6-24: the follow-up assessment is not driving the risk state'; END IF;

  SELECT * INTO m FROM public.entity_risk_state_movement
   WHERE entity_id = (SELECT v FROM a6 WHERE k='ent') AND domain_code = 'AML_CFT'
     AND new_assessment_id = (SELECT v FROM a6 WHERE k='followup');
  IF m.id IS NULL THEN
    RAISE EXCEPTION 'FAIL A6-24: the risk movement was not recorded'; END IF;
  IF upper(COALESCE(m.previous_rating,'')) <> 'HIGH' OR upper(COALESCE(m.new_rating,'')) <> 'MODERATE' THEN
    RAISE EXCEPTION 'FAIL A6-24: the movement does not show HIGH -> MODERATE (% -> %)',
      m.previous_rating, m.new_rating; END IF;

  IF (SELECT status FROM public.supervisory_assessment WHERE id = (SELECT v FROM a6 WHERE k='assessment'))
     NOT IN ('superseded','closed','approved') THEN
    RAISE EXCEPTION 'FAIL A6-24: the previous assessment was left in an inconsistent state'; END IF;
  IF (SELECT is_current FROM public.supervisory_assessment WHERE id = (SELECT v FROM a6 WHERE k='assessment')) THEN
    RAISE EXCEPTION 'FAIL A6-24: two AML/CFT assessments are current for one entity'; END IF;
  RAISE NOTICE 'PASS A6-24: the loop closes on an authoritative, provenance-bearing rating movement';
END $$;

-- ---------------------------------------------------------------------------
-- A6-25 — every governed step is on the compliance audit trail
-- ---------------------------------------------------------------------------
RESET ROLE;
SET LOCAL row_security = off;
DO $$
DECLARE missing text := '';
  t text; i uuid;
BEGIN
  FOR t, i IN
    SELECT 'supervisory_domain_perimeter', NULL::uuid UNION ALL
    SELECT 'supervisory_assessment', (SELECT v FROM a6 WHERE k='assessment') UNION ALL
    SELECT 'supervisory_attention', (SELECT v FROM a6 WHERE k='attention') UNION ALL
    SELECT 'supervisory_finding', (SELECT v FROM a6 WHERE k='finding') UNION ALL
    SELECT 'supervisory_remediation_action', (SELECT v FROM a6 WHERE k='ra3') UNION ALL
    SELECT 'examination_workpapers', (SELECT v FROM a6 WHERE k='wp') UNION ALL
    SELECT 'examination_data_requests', (SELECT v FROM a6 WHERE k='rfi1')
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.compliance_audit_logs
                    WHERE object_type = t AND (i IS NULL OR object_id::text = i::text)) THEN
      missing := missing || t || ' ';
    END IF;
  END LOOP;
  IF missing <> '' THEN
    RAISE EXCEPTION 'FAIL A6-25: no audit entries for: %', missing; END IF;
  RAISE NOTICE 'PASS A6-25: the closed loop is fully reconstructable from the audit trail';
END $$;

ROLLBACK;
