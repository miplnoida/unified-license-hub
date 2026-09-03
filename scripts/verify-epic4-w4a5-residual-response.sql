-- Epic 4 / W4-A5 — response provenance, residual deficiency acceptance and closure integrity
--
-- W4-A5 added two governed guarantees to the canonical finding lifecycle:
--
--   1. A management response carries its own provenance. An officer who
--      transcribes a letter is never recorded as the entity having answered in
--      the platform: the source, who it was received from, when, and through
--      which channel are all recorded, and the database — not the browser —
--      refuses an officer-recorded response without them.
--   2. A partially effective corrective action cannot be closed, and cannot
--      let its finding be closed, until a residual deficiency acceptance has
--      been recorded by an officer other than the validator, with the remaining
--      deficiency, its materiality and the continuing supervisory requirement
--      all stated.
--
-- Everything below runs inside a rolled-back transaction, with real
-- certification personas, through governed operations only. No auth.users rows
-- are seeded and no supervisory table is written directly except to build
-- fixtures that the browser itself never writes.

\set ON_ERROR_STOP on
\set QUIET 1
\pset pager off
SET row_security = on;

-- certification personas (public.cert_certification_users)
\set EXAMINER   '{"sub":"d1016d5f-cde5-46dd-a552-0f2f87abc193","role":"authenticated"}'
\set REVIEWER   '{"sub":"b597c405-e0c4-421b-9092-820a444f2429","role":"authenticated"}'
\set SUPERVISOR '{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}'

BEGIN;

CREATE TEMP TABLE a5(k text PRIMARY KEY, v uuid) ON COMMIT DROP;
GRANT ALL ON a5 TO authenticated;

-- ---------------------------------------------------------------------------
-- Fixture: one entity, one approved AML/CFT assessment with an in-scope
-- dimension, one governed examination, and supervision assignments for the
-- examiner, the reviewer (validator) and the supervisory approver.
-- ---------------------------------------------------------------------------
DO $$
DECLARE ent uuid := '5855bf85-9fde-4cf8-a082-7ea904d46184';
        a uuid; d uuid; ex uuid;
BEGIN
  INSERT INTO public.supervisory_assessment(reference, entity_id, domain_code, status, approved_at, approved_by)
  VALUES ('A5-ASMT-ORIGIN', ent, 'AML_CFT', 'approved', now(), 'b597c405-e0c4-421b-9092-820a444f2429')
  RETURNING id INTO a;

  INSERT INTO public.supervisory_assessment_dimension(assessment_id, dimension_code, dimension_group)
  VALUES (a, 'TRANSACTION_MONITORING', 'CONTROL_EFFECTIVENESS') RETURNING id INTO d;

  INSERT INTO public.examinations(reference, entity_id, title, examination_type, stage,
      domain_code, origin_provenance, lead_examiner_id)
  VALUES ('A5-EXM-1', ent, 'Targeted AML/CFT examination', 'targeted_onsite', 'fieldwork',
      'AML_CFT', 'GOVERNED', 'd1016d5f-cde5-46dd-a552-0f2f87abc193')
  RETURNING id INTO ex;

  INSERT INTO public.examination_origin(examination_id, assessment_id, assessment_dimension_id)
  VALUES (ex, a, d);
  INSERT INTO public.examination_scope_dimension(examination_id, assessment_id, assessment_dimension_id, dimension_code)
  VALUES (ex, a, d, 'TRANSACTION_MONITORING');

  INSERT INTO public.entity_supervision_assignments(entity_id, lead_supervisor_user_id,
      alternate_supervisor_user_id, status, assignment_reason)
  VALUES (ent, 'd1016d5f-cde5-46dd-a552-0f2f87abc193', 'b597c405-e0c4-421b-9092-820a444f2429',
      'active', 'W4-A5 certification');
  INSERT INTO public.entity_supervision_assignments(entity_id, lead_supervisor_user_id, status, assignment_reason)
  VALUES (ent, '0b522724-adcb-48bf-b21d-175339479616', 'active', 'W4-A5 certification checker');

  INSERT INTO a5(k,v) VALUES ('ent',ent),('asmt',a),('dim',d),('ex',ex);
END $$;

-- ---------------------------------------------------------------------------
-- A1 — the response provenance columns exist on the canonical finding
-- ---------------------------------------------------------------------------
DO $$
DECLARE missing text := ''; c text;
BEGIN
  FOREACH c IN ARRAY ARRAY['response_source','response_received_from','response_received_date',
      'response_channel','response_recorded_at','response_by'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='supervisory_finding'
                      AND column_name=c) THEN missing := missing || c || '; '; END IF;
  END LOOP;
  IF missing <> '' THEN
    RAISE EXCEPTION 'FAIL A1: the canonical finding cannot carry response provenance: %', missing; END IF;
  RAISE NOTICE 'PASS A1: response provenance is modelled on the canonical finding, not inferred in the browser';
END $$;

-- ---------------------------------------------------------------------------
-- A2 — the finding is raised from examination fieldwork and issued (governed)
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = :'EXAMINER';
DO $$
DECLARE wp uuid; fid uuid;
BEGIN
  wp := public.examination_workpaper_save(jsonb_build_object(
        'examination_id', (SELECT v FROM a5 WHERE k='ex'),
        'area','Transaction monitoring',
        'objective','Assess whether monitoring alerts are investigated and decisions documented.',
        'population_description','All alerts raised in the review period',
        'population_size','240','sampling_method','RISK_BASED','sample_size','25',
        'exceptions_count','9','material_exceptions_count','4',
        'analysis','Nine sampled alerts had no documented decision.',
        'conclusion','Transaction monitoring is not operating effectively.',
        'control_assessment','INEFFECTIVE',
        'assessment_dimension_id', (SELECT v FROM a5 WHERE k='dim')));
  PERFORM public.examination_workpaper_submit_review(wp);

  fid := public.supervisory_finding_create(jsonb_build_object(
    'entity_id', (SELECT v FROM a5 WHERE k='ent'), 'domain_code','AML_CFT', 'severity','HIGH',
    'finding_category','TRANSACTION_MONITORING',
    'title','Alert decisions are not documented',
    'observation','Nine of twenty-five sampled alerts had no documented decision.',
    'required_action','Document every alert decision and clear the review backlog.',
    'examination_id', (SELECT v FROM a5 WHERE k='ex'), 'workpaper_id', wp,
    'assessment_id', (SELECT v FROM a5 WHERE k='asmt'),
    'assessment_dimension_id', (SELECT v FROM a5 WHERE k='dim')));
  INSERT INTO a5(k,v) VALUES ('wp', wp), ('finding', fid);
END $$;

SET LOCAL "request.jwt.claims" = :'REVIEWER';
DO $$ BEGIN
  PERFORM public.supervisory_finding_lifecycle((SELECT v FROM a5 WHERE k='finding'),
    'REVIEW', 'Independent supervisory review of the examination finding');
END $$;

SET LOCAL "request.jwt.claims" = :'SUPERVISOR';
DO $$
DECLARE st text;
BEGIN
  PERFORM public.supervisory_finding_lifecycle((SELECT v FROM a5 WHERE k='finding'),
    'ISSUED', 'Issued to the licensee for a management response');
  SELECT status INTO st FROM public.supervisory_finding WHERE id = (SELECT v FROM a5 WHERE k='finding');
  IF st <> 'ISSUED' THEN RAISE EXCEPTION 'FAIL A2: the finding is % and cannot be responded to', st; END IF;
  RAISE NOTICE 'PASS A2: the finding is raised from fieldwork, reviewed and issued by a separate approver';
END $$;

-- ---------------------------------------------------------------------------
-- A3 — an officer-recorded response without provenance is refused by the
--      database, field by field
-- ---------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = :'EXAMINER';
DO $$
DECLARE fid uuid := (SELECT v FROM a5 WHERE k='finding'); ok boolean;
BEGIN
  ok := false;
  BEGIN PERFORM public.supervisory_finding_response(fid, 'PARTIALLY_ACCEPTED',
          'The licensee accepts the monitoring weakness.', NULL, NULL, NULL, NULL,
          NULL, current_date, 'LETTER');
  EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE '%response_provenance_required%'; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL A3: a response was accepted without recording who it came from'; END IF;

  ok := false;
  BEGIN PERFORM public.supervisory_finding_response(fid, 'PARTIALLY_ACCEPTED',
          'The licensee accepts the monitoring weakness.', NULL, NULL, NULL, NULL,
          'MLRO, by signed letter', NULL, 'LETTER');
  EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE '%response_provenance_required%'; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL A3: a response was accepted without a receipt date'; END IF;

  ok := false;
  BEGIN PERFORM public.supervisory_finding_response(fid, 'PARTIALLY_ACCEPTED',
          'The licensee accepts the monitoring weakness.', NULL, NULL, NULL, NULL,
          'MLRO, by signed letter', current_date, NULL);
  EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE '%response_provenance_required%'; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL A3: a response was accepted without a receipt channel'; END IF;

  ok := false;
  BEGIN PERFORM public.supervisory_finding_response(fid, 'PARTIALLY_ACCEPTED',
          'The licensee accepts the monitoring weakness.', NULL, NULL, NULL, NULL,
          'MLRO, by signed letter', current_date + 5, 'LETTER');
  EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE '%response_provenance_invalid%'; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL A3: a response was accepted with a future receipt date'; END IF;

  ok := false;
  BEGIN PERFORM public.supervisory_finding_response(fid, 'PARTIALLY_ACCEPTED',
          'The licensee accepts the monitoring weakness.', NULL, NULL, NULL, NULL,
          'MLRO, by signed letter', current_date - 400, 'LETTER');
  EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE '%response_provenance_invalid%'; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL A3: a response was accepted before the finding was issued'; END IF;

  ok := false;
  BEGIN PERFORM public.supervisory_finding_response(fid, 'PARTIALLY_ACCEPTED',
          'The licensee accepts the monitoring weakness.', NULL, NULL, NULL, NULL,
          'MLRO, by signed letter', current_date, 'CARRIER_PIGEON');
  EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE '%response_provenance_required%'; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL A3: an ungoverned receipt channel was accepted'; END IF;

  RAISE NOTICE 'PASS A3: officer-recorded responses are refused without complete, plausible provenance';
END $$;

-- ---------------------------------------------------------------------------
-- A4 — a complete officer-recorded response is stored with its provenance and
--      is never presented as an entity portal submission
-- ---------------------------------------------------------------------------
DO $$
DECLARE fid uuid := (SELECT v FROM a5 WHERE k='finding'); f public.supervisory_finding;
BEGIN
  PERFORM public.supervisory_finding_response(fid, 'PARTIALLY_ACCEPTED',
    'The licensee accepts the monitoring weakness and disputes the backlog volume.',
    'Remediate documentation standards and retrain analysts.', 'MLRO',
    current_date + 60, NULL, 'MLRO, by signed letter dated today', current_date, 'letter');

  SELECT * INTO f FROM public.supervisory_finding WHERE id = fid;
  IF f.response_source <> 'OFFICER_RECORDED' THEN
    RAISE EXCEPTION 'FAIL A4: an officer transcription was recorded as % ', f.response_source; END IF;
  IF f.response_channel <> 'LETTER' THEN
    RAISE EXCEPTION 'FAIL A4: the receipt channel was not normalised (%)', f.response_channel; END IF;
  IF f.response_received_from IS NULL OR f.response_received_date IS NULL
     OR f.response_recorded_at IS NULL THEN
    RAISE EXCEPTION 'FAIL A4: officer-recorded provenance was not persisted'; END IF;
  IF f.status <> 'MANAGEMENT_RESPONSE' THEN
    RAISE EXCEPTION 'FAIL A4: the finding did not move to management response (%)', f.status; END IF;
  RAISE NOTICE 'PASS A4: the response is stored as officer-recorded, with source, sender, date and channel';
END $$;

-- ---------------------------------------------------------------------------
-- A5 — two corrective actions are opened; one reaches validation
-- ---------------------------------------------------------------------------
DO $$
DECLARE fid uuid := (SELECT v FROM a5 WHERE k='finding'); a1 uuid; a2 uuid;
BEGIN
  a1 := public.supervisory_remediation_open(fid, 'RA-001 Document all outstanding alert decisions',
        'Every alert decision is documented and reviewable', NULL, 'MLRO', current_date + 30);
  a2 := public.supervisory_remediation_open(fid, 'RA-002 Retrain monitoring analysts',
        'All analysts trained on the revised standard', NULL, 'Head of Compliance', current_date + 45);
  INSERT INTO a5(k,v) VALUES ('ra1',a1),('ra2',a2);

  PERFORM public.supervisory_remediation_transition(a1, 'UNDER_REVIEW', 'Plan under supervisory review');
  PERFORM public.supervisory_remediation_transition(a1, 'ACCEPTED', 'Plan accepted');
  PERFORM public.supervisory_remediation_transition(a1, 'IMPLEMENTING', 'Work underway');
  PERFORM public.supervisory_remediation_transition(a1, 'EVIDENCE_SUBMITTED', 'Evidence received');
  PERFORM public.supervisory_remediation_transition(a1, 'VALIDATION', 'Evidence accepted for validation');
  RAISE NOTICE 'PASS A5: two independent corrective actions exist; RA-001 is ready for validation';
END $$;

-- ---------------------------------------------------------------------------
-- A6 — a partial validation conclusion leaves the action partially effective
-- ---------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = :'REVIEWER';
DO $$
DECLARE ra1 uuid := (SELECT v FROM a5 WHERE k='ra1'); vres jsonb; st text;
BEGIN
  vres := public.supervisory_remediation_validate(ra1, 'PARTIALLY_EFFECTIVE',
    'Sampled 30 alert decisions; 24 documented, 6 still undocumented',
    'Re-performance of the alert review', 'The documentation standard is met only in part',
    'Residual deficiency requires a supervisory decision', NULL, NULL);
  INSERT INTO a5(k,v) VALUES ('validation', (vres->>'validation_id')::uuid);

  SELECT status INTO st FROM public.supervisory_remediation_action WHERE id = ra1;
  IF st <> 'PARTIALLY_EFFECTIVE' THEN
    RAISE EXCEPTION 'FAIL A6: a partial conclusion left the action as %', st; END IF;
  IF EXISTS (SELECT 1 FROM public.supervisory_residual_acceptance WHERE action_id = ra1) THEN
    RAISE EXCEPTION 'FAIL A6: validation silently accepted the residual deficiency'; END IF;
  RAISE NOTICE 'PASS A6: a partially effective conclusion is recorded without accepting the residual risk';
END $$;

-- ---------------------------------------------------------------------------
-- A7 — the validator of the partial conclusion cannot accept the residual risk
-- ---------------------------------------------------------------------------
DO $$
DECLARE ra1 uuid := (SELECT v FROM a5 WHERE k='ra1'); ok boolean := false;
BEGIN
  BEGIN PERFORM public.supervisory_residual_acceptance_record(ra1,
      'Six alert decisions in the sampled population remain undocumented.',
      'MEDIUM',
      'The licensee must report monthly on the outstanding alert decision backlog.',
      'The residual exposure is tolerable pending the monthly reporting requirement.',
      current_date + 90);
  EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE '%not_authorized%'; END;
  IF NOT ok THEN
    RAISE EXCEPTION 'FAIL A7: the officer who validated the partial outcome also accepted the residual risk'; END IF;
  RAISE NOTICE 'PASS A7: residual acceptance is a separate decision from validation';
END $$;

-- ---------------------------------------------------------------------------
-- A8 — closure is blocked while the residual deficiency is unaccepted, and the
--      block names the outstanding action
-- ---------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = :'SUPERVISOR';
DO $$
DECLARE ra1 uuid := (SELECT v FROM a5 WHERE k='ra1');
        fid uuid := (SELECT v FROM a5 WHERE k='finding');
        ref text; ok boolean := false; msg text;
BEGIN
  SELECT reference INTO ref FROM public.supervisory_remediation_action WHERE id = ra1;

  BEGIN PERFORM public.supervisory_remediation_transition(ra1, 'CLOSED', 'Attempted closure of a partial outcome');
  EXCEPTION WHEN OTHERS THEN msg := SQLERRM; ok := msg LIKE '%residual acceptance%'; END;
  IF NOT ok THEN
    RAISE EXCEPTION 'FAIL A8: a partially effective action closed with no residual acceptance (%)', msg; END IF;
  IF ref IS NOT NULL AND msg NOT LIKE '%' || ref || '%' THEN
    RAISE EXCEPTION 'FAIL A8: the refusal does not name the outstanding action (%)', msg; END IF;

  ok := false;
  BEGIN PERFORM public.supervisory_finding_lifecycle(fid, 'CLOSED', 'Attempted premature closure of the finding');
  EXCEPTION WHEN OTHERS THEN msg := SQLERRM; ok := true; END;
  IF NOT ok THEN
    RAISE EXCEPTION 'FAIL A8: the finding closed while a residual deficiency was unaccepted'; END IF;
  IF (SELECT status FROM public.supervisory_finding WHERE id = fid) = 'CLOSED' THEN
    RAISE EXCEPTION 'FAIL A8: the finding was closed despite the refusal'; END IF;
  RAISE NOTICE 'PASS A8: neither the action nor the finding can be closed on an unaccepted residual deficiency';
END $$;

-- ---------------------------------------------------------------------------
-- A9 — residual acceptance demands a stated deficiency, materiality and a
--      continuing supervisory requirement
-- ---------------------------------------------------------------------------
DO $$
DECLARE ra1 uuid := (SELECT v FROM a5 WHERE k='ra1'); ra2 uuid := (SELECT v FROM a5 WHERE k='ra2');
        ok boolean;
BEGIN
  ok := false;
  BEGIN PERFORM public.supervisory_residual_acceptance_record(ra1, 'Still some gaps', 'MEDIUM',
      'The licensee must report monthly on the outstanding alert decision backlog.',
      'The residual exposure is tolerable pending monthly reporting.', NULL);
  EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE '%remaining deficiency%'; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL A9: a residual deficiency was accepted without describing it'; END IF;

  ok := false;
  BEGIN PERFORM public.supervisory_residual_acceptance_record(ra1,
      'Six alert decisions in the sampled population remain undocumented.', 'SEVERE',
      'The licensee must report monthly on the outstanding alert decision backlog.',
      'The residual exposure is tolerable pending monthly reporting.', NULL);
  EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE '%invalid_residual_materiality%'; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL A9: an ungoverned residual materiality was accepted'; END IF;

  ok := false;
  BEGIN PERFORM public.supervisory_residual_acceptance_record(ra1,
      'Six alert decisions in the sampled population remain undocumented.', 'MEDIUM',
      'Monitor it', 'The residual exposure is tolerable pending monthly reporting.', NULL);
  EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE '%follow-up supervisory requirement%'; END;
  IF NOT ok THEN
    RAISE EXCEPTION 'FAIL A9: a residual deficiency was accepted with no continuing supervisory requirement'; END IF;

  ok := false;
  BEGIN PERFORM public.supervisory_residual_acceptance_record(ra2,
      'Six alert decisions in the sampled population remain undocumented.', 'MEDIUM',
      'The licensee must report monthly on the outstanding alert decision backlog.',
      'The residual exposure is tolerable pending monthly reporting.', NULL);
  EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE '%residual_acceptance_not_applicable%'; END;
  IF NOT ok THEN
    RAISE EXCEPTION 'FAIL A9: a residual deficiency was accepted on an action that was never validated'; END IF;

  RAISE NOTICE 'PASS A9: residual acceptance requires a stated deficiency, governed materiality and follow-up';
END $$;

-- ---------------------------------------------------------------------------
-- A10 — a separate approver accepts the residual deficiency; the decision is
--       recorded against the validation that produced it and audited
-- ---------------------------------------------------------------------------
DO $$
DECLARE ra1 uuid := (SELECT v FROM a5 WHERE k='ra1'); rid uuid; r public.supervisory_residual_acceptance;
BEGIN
  rid := public.supervisory_residual_acceptance_record(ra1,
      'Six alert decisions in the sampled population remain undocumented.',
      'MEDIUM',
      'The licensee must report monthly on the outstanding alert decision backlog.',
      'The residual exposure is tolerable pending the monthly reporting requirement.',
      current_date + 90);
  INSERT INTO a5(k,v) VALUES ('residual', rid);

  SELECT * INTO r FROM public.supervisory_residual_acceptance WHERE id = rid;
  IF r.accepted_by <> '0b522724-adcb-48bf-b21d-175339479616' THEN
    RAISE EXCEPTION 'FAIL A10: the acceptance is not attributed to the deciding officer'; END IF;
  IF r.validation_id IS DISTINCT FROM (SELECT v FROM a5 WHERE k='validation') THEN
    RAISE EXCEPTION 'FAIL A10: the acceptance is not tied to the validation that produced the residual'; END IF;
  IF r.finding_id <> (SELECT v FROM a5 WHERE k='finding') OR r.domain_code <> 'AML_CFT' THEN
    RAISE EXCEPTION 'FAIL A10: the acceptance is not scoped to its finding and domain'; END IF;
  IF r.next_review_date IS NULL THEN
    RAISE EXCEPTION 'FAIL A10: the continuing review date was not retained'; END IF;
  RAISE NOTICE 'PASS A10: the residual decision is recorded by a separate approver and evidenced';
END $$;

-- ---------------------------------------------------------------------------
-- A11 — one residual acceptance per action; no second, contradictory decision
-- ---------------------------------------------------------------------------
DO $$
DECLARE ra1 uuid := (SELECT v FROM a5 WHERE k='ra1'); ok boolean := false;
BEGIN
  BEGIN PERFORM public.supervisory_residual_acceptance_record(ra1,
      'A second, different account of the remaining deficiency.', 'LOW',
      'A weaker follow-up requirement recorded after the first decision.',
      'An attempt to overwrite the recorded supervisory decision.', NULL);
  EXCEPTION WHEN OTHERS THEN ok := true; END;
  IF NOT ok THEN
    RAISE EXCEPTION 'FAIL A11: a second residual acceptance was recorded against the same action'; END IF;
  IF (SELECT count(*) FROM public.supervisory_residual_acceptance WHERE action_id = ra1) <> 1 THEN
    RAISE EXCEPTION 'FAIL A11: an action carries more than one residual acceptance'; END IF;
  RAISE NOTICE 'PASS A11: a corrective action carries exactly one residual acceptance decision';
END $$;

-- ---------------------------------------------------------------------------
-- A12 — the browser cannot write the acceptance directly
-- ---------------------------------------------------------------------------
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.supervisory_residual_acceptance(action_id, finding_id, entity_id, domain_code,
        remaining_deficiency, residual_materiality, follow_up_requirement, rationale, accepted_by)
    VALUES ((SELECT v FROM a5 WHERE k='ra2'), (SELECT v FROM a5 WHERE k='finding'),
        (SELECT v FROM a5 WHERE k='ent'), 'AML_CFT',
        'Directly inserted deficiency bypassing the governed operation.', 'LOW',
        'Directly inserted follow-up requirement bypassing governance.',
        'Direct table write attempted from a client session.',
        '0b522724-adcb-48bf-b21d-175339479616');
  EXCEPTION WHEN OTHERS THEN ok := true; END;
  IF NOT ok THEN
    RAISE EXCEPTION 'FAIL A12: a residual acceptance was written directly, bypassing the governed operation'; END IF;
  RAISE NOTICE 'PASS A12: residual acceptance is write-only through the governed operation';
END $$;

-- ---------------------------------------------------------------------------
-- A13 — with the residual accepted and every action concluded, closure proceeds
-- ---------------------------------------------------------------------------
DO $$
DECLARE ra2 uuid := (SELECT v FROM a5 WHERE k='ra2');
BEGIN
  PERFORM public.supervisory_remediation_transition(ra2, 'UNDER_REVIEW', 'Plan under supervisory review');
  PERFORM public.supervisory_remediation_transition(ra2, 'ACCEPTED', 'Plan accepted');
  PERFORM public.supervisory_remediation_transition(ra2, 'IMPLEMENTING', 'Training delivered');
  PERFORM public.supervisory_remediation_transition(ra2, 'EVIDENCE_SUBMITTED', 'Training records received');
  PERFORM public.supervisory_remediation_transition(ra2, 'VALIDATION', 'Records accepted for validation');
END $$;

SET LOCAL "request.jwt.claims" = :'REVIEWER';
DO $$ BEGIN
  PERFORM public.supervisory_remediation_validate((SELECT v FROM a5 WHERE k='ra2'), 'EFFECTIVE',
    'All twelve analysts hold current training records', 'Inspection of training records',
    'The training requirement is met in full', 'Close this action', NULL, NULL);
END $$;

SET LOCAL "request.jwt.claims" = :'SUPERVISOR';
DO $$
DECLARE ra1 uuid := (SELECT v FROM a5 WHERE k='ra1'); ra2 uuid := (SELECT v FROM a5 WHERE k='ra2');
        fid uuid := (SELECT v FROM a5 WHERE k='finding'); st text;
BEGIN
  PERFORM public.supervisory_remediation_transition(ra1, 'CLOSED',
    'Closed on the accepted residual deficiency with continuing monthly reporting');
  PERFORM public.supervisory_remediation_transition(ra2, 'CLOSED', 'Closed as fully effective');

  PERFORM public.supervisory_finding_lifecycle(fid, 'CLOSED',
    'Closed: one action fully effective, one closed on an accepted residual deficiency');
  SELECT status INTO st FROM public.supervisory_finding WHERE id = fid;
  IF st <> 'CLOSED' THEN
    RAISE EXCEPTION 'FAIL A13: closure was refused after the residual was accepted (%)', st; END IF;
  RAISE NOTICE 'PASS A13: closure proceeds once every action is concluded and the residual is accepted';
END $$;

-- ---------------------------------------------------------------------------
-- A14 — the closed finding still carries its response provenance and residual
--       decision: the regulatory record explains itself without a side query
-- ---------------------------------------------------------------------------
DO $$
DECLARE f public.supervisory_finding;
BEGIN
  SELECT * INTO f FROM public.supervisory_finding WHERE id = (SELECT v FROM a5 WHERE k='finding');
  IF f.response_source <> 'OFFICER_RECORDED' OR f.response_received_from IS NULL
     OR f.response_channel IS NULL THEN
    RAISE EXCEPTION 'FAIL A14: closure erased the response provenance'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_residual_acceptance
                  WHERE finding_id = f.id AND next_review_date IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL A14: the closed finding has no surviving residual decision'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_finding_event
                  WHERE finding_id = f.id AND to_status = 'CLOSED') THEN
    RAISE EXCEPTION 'FAIL A14: closure was not written to the finding history'; END IF;
  RAISE NOTICE 'PASS A14: the closed record retains response provenance, residual decision and history';
END $$;

-- ---------------------------------------------------------------------------
-- A15 — the residual decision is on the audit record (read outside the persona,
--       because an officer cannot read the audit trail they write)
-- ---------------------------------------------------------------------------
RESET ROLE;
SET LOCAL row_security = off;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.compliance_audit_logs
                  WHERE object_type = 'supervisory_residual_acceptance'
                    AND object_id = (SELECT v::text FROM a5 WHERE k='residual')) THEN
    RAISE EXCEPTION 'FAIL A15: the residual acceptance decision was not audited'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.compliance_audit_logs
                  WHERE object_type = 'supervisory_finding'
                    AND object_id = (SELECT v::text FROM a5 WHERE k='finding')) THEN
    RAISE EXCEPTION 'FAIL A15: the finding lifecycle was not audited'; END IF;
  RAISE NOTICE 'PASS A15: the residual acceptance and the finding lifecycle are both on the audit record';
END $$;

ROLLBACK;
