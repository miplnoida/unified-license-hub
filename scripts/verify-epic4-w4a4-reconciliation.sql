-- Epic 4 / W4-A4 (post-fix) — reconciliation, negative tests and A5 integration
--
-- The examination workspace finding panel was corrected to read and write the
-- canonical supervisory finding register instead of the legacy examination
-- finding table. This script proves the corrected path reconciles to database
-- truth: one finding, one work object, one history, seen through every view
-- (examination, AML register, Entity 360, work queue, timeline), and proves the
-- backend — not React — rejects false provenance, insufficient authority,
-- legacy promotion and direct table writes. It then drives the real A5
-- lifecycle on the A4-created finding.
--
-- No auth.users rows are seeded; everything runs inside a rolled-back
-- transaction with real certification personas.

\set ON_ERROR_STOP on
\set QUIET 1
\pset pager off
SET row_security = on;

-- certification personas (public.cert_certification_users)
\set EXAMINER   '{"sub":"d1016d5f-cde5-46dd-a552-0f2f87abc193","role":"authenticated"}'
\set REVIEWER   '{"sub":"b597c405-e0c4-421b-9092-820a444f2429","role":"authenticated"}'
\set PRUDENTIAL '{"sub":"ef43e80a-e17e-4f26-aa91-bcf0d99e3d89","role":"authenticated"}'
\set CONDUCT    '{"sub":"87a7ada9-9ef8-49ac-a810-4eb04fecf1ac","role":"authenticated"}'
\set OUTSIDER   '{"sub":"411dd06d-648b-4f32-82cc-897902c0c0b6","role":"authenticated"}'
\set SUPERVISOR '{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}'

BEGIN;

CREATE TEMP TABLE r4(k text PRIMARY KEY, v uuid) ON COMMIT DROP;
GRANT ALL ON r4 TO authenticated;
CREATE TEMP TABLE r4n(k text PRIMARY KEY, v numeric) ON COMMIT DROP;
GRANT ALL ON r4n TO authenticated;

-- ---------------------------------------------------------------------------
-- Fixture: one entity with TWO AML assessments (only one originates the
-- examination), an in-scope and an out-of-scope dimension, two examinations
-- on different entities, and one legacy examination_findings row.
-- ---------------------------------------------------------------------------
DO $$
DECLARE ent uuid := '5855bf85-9fde-4cf8-a082-7ea904d46184';
        ent2 uuid;
        a1 uuid; a2 uuid; d_in uuid; d_out uuid; d_other uuid;
        ex uuid; ex_other uuid; legacy uuid;
BEGIN
  SELECT id INTO ent2 FROM public.licensees WHERE id <> ent ORDER BY created_at LIMIT 1;

  INSERT INTO public.supervisory_assessment(reference, entity_id, domain_code, status, approved_at, approved_by)
  VALUES ('R4-ASMT-ORIGIN', ent, 'AML_CFT', 'approved', now(), 'b597c405-e0c4-421b-9092-820a444f2429')
  RETURNING id INTO a1;
  INSERT INTO public.supervisory_assessment(reference, entity_id, domain_code, status, approved_at, approved_by)
  VALUES ('R4-ASMT-UNRELATED', ent, 'AML_CFT', 'approved', now(), 'b597c405-e0c4-421b-9092-820a444f2429')
  RETURNING id INTO a2;

  INSERT INTO public.supervisory_assessment_dimension(assessment_id, dimension_code, dimension_group)
  VALUES (a1, 'TRANSACTION_MONITORING', 'CONTROL_EFFECTIVENESS') RETURNING id INTO d_in;
  INSERT INTO public.supervisory_assessment_dimension(assessment_id, dimension_code, dimension_group)
  VALUES (a1, 'GEOGRAPHIC_RISK', 'INHERENT_RISK') RETURNING id INTO d_out;
  INSERT INTO public.supervisory_assessment_dimension(assessment_id, dimension_code, dimension_group)
  VALUES (a2, 'CUSTOMER_DUE_DILIGENCE', 'CONTROL_EFFECTIVENESS') RETURNING id INTO d_other;

  INSERT INTO public.examinations(reference, entity_id, title, examination_type, stage,
      domain_code, origin_provenance, lead_examiner_id)
  VALUES ('R4-EXM-1', ent, 'Targeted AML/CFT examination', 'targeted_onsite', 'fieldwork',
      'AML_CFT', 'GOVERNED', 'd1016d5f-cde5-46dd-a552-0f2f87abc193')
  RETURNING id INTO ex;
  INSERT INTO public.examinations(reference, entity_id, title, examination_type, stage,
      domain_code, origin_provenance, lead_examiner_id)
  VALUES ('R4-EXM-OTHER-ENTITY', ent2, 'Other entity AML/CFT examination', 'targeted_onsite',
      'fieldwork', 'AML_CFT', 'GOVERNED', 'd1016d5f-cde5-46dd-a552-0f2f87abc193')
  RETURNING id INTO ex_other;

  INSERT INTO public.examination_origin(examination_id, assessment_id, assessment_dimension_id)
  VALUES (ex, a1, d_in);
  INSERT INTO public.examination_scope_dimension(examination_id, assessment_id, assessment_dimension_id, dimension_code)
  VALUES (ex, a1, d_in, 'TRANSACTION_MONITORING');

  INSERT INTO public.entity_supervision_assignments(entity_id, lead_supervisor_user_id,
      alternate_supervisor_user_id, status, assignment_reason)
  VALUES (ent, 'd1016d5f-cde5-46dd-a552-0f2f87abc193', 'b597c405-e0c4-421b-9092-820a444f2429',
      'active', 'W4-A4 reconciliation');
  -- the AML supervisory approver (checker) must also be in scope for this entity
  INSERT INTO public.entity_supervision_assignments(entity_id, lead_supervisor_user_id, status, assignment_reason)
  VALUES (ent, '0b522724-adcb-48bf-b21d-175339479616', 'active', 'W4-A4 reconciliation checker');

  -- one historical, pre-spine finding on the same examination
  INSERT INTO public.examination_findings(examination_id, title, severity, status, observation)
  VALUES (ex, 'Historical pre-spine finding', 'medium', 'open', 'Recorded before the finding register existed')
  RETURNING id INTO legacy;

  INSERT INTO r4(k,v) VALUES ('ent',ent),('ent2',ent2),('a1',a1),('a2',a2),('d_in',d_in),
    ('d_out',d_out),('d_other',d_other),('ex',ex),('ex_other',ex_other),('legacy',legacy);
END $$;

-- baseline Entity 360 counters before the A4 finding is raised
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = :'EXAMINER';
DO $$
DECLARE aml jsonb;
BEGIN
  aml := jsonb_path_query_first(
           public.entity_supervisory_360((SELECT v FROM r4 WHERE k='ent')),
           '$.domains[*] ? (@.domain_code == "AML_CFT")');
  INSERT INTO r4n(k,v) VALUES
    ('base_open_findings', COALESCE((aml->>'open_findings')::numeric, 0)),
    ('base_high', COALESCE((aml->>'high_findings')::numeric, 0)),
    ('base_validation_pending', COALESCE((aml->>'validation_pending')::numeric, 0));
END $$;

-- ---------------------------------------------------------------------------
-- R1 — the A4 browser path produces one canonical, governed finding
-- ---------------------------------------------------------------------------
DO $$
DECLARE wp uuid; fid uuid; f public.supervisory_finding;
BEGIN
  wp := public.examination_workpaper_save(jsonb_build_object(
        'examination_id', (SELECT v FROM r4 WHERE k='ex'),
        'area','Transaction monitoring',
        'objective','Assess whether monitoring alerts are investigated and decisions documented.',
        'population_description','All alerts raised in the review period',
        'population_size','240','sampling_method','RISK_BASED','sample_size','25',
        'exceptions_count','11','material_exceptions_count','5',
        'analysis','Eleven sampled alerts had no documented decision.',
        'conclusion','Transaction monitoring is not operating effectively.',
        'control_assessment','INEFFECTIVE',
        'assessment_dimension_id', (SELECT v FROM r4 WHERE k='d_in')));
  INSERT INTO r4(k,v) VALUES ('wp', wp);
  PERFORM public.examination_workpaper_submit_review(wp);

  fid := public.supervisory_finding_create(jsonb_build_object(
    'entity_id', (SELECT v FROM r4 WHERE k='ent'), 'domain_code','AML_CFT', 'severity','HIGH',
    'finding_category','TRANSACTION_MONITORING',
    'title','Alert decisions are not documented',
    'observation','Eleven of twenty-five sampled alerts had no documented decision.',
    'required_action','Document every alert decision and clear the review backlog.',
    'examination_id', (SELECT v FROM r4 WHERE k='ex'), 'workpaper_id', wp,
    'assessment_id', (SELECT v FROM r4 WHERE k='a1'),
    'assessment_dimension_id', (SELECT v FROM r4 WHERE k='d_in')));
  INSERT INTO r4(k,v) VALUES ('finding', fid);

  SELECT * INTO f FROM public.supervisory_finding WHERE id = fid;
  IF f.origin_provenance <> 'GOVERNED' THEN
    RAISE EXCEPTION 'FAIL R1: a browser-raised finding is not governed provenance (%)', f.origin_provenance; END IF;
  IF f.legacy_source_table IS NOT NULL OR f.legacy_source_id IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL R1: a new finding was recorded as a legacy migration'; END IF;
  IF f.source_kind <> 'EXAMINATION' OR f.reference IS NULL THEN
    RAISE EXCEPTION 'FAIL R1: examination source or reference missing'; END IF;
  IF f.assessment_id <> (SELECT v FROM r4 WHERE k='a1') THEN
    RAISE EXCEPTION 'FAIL R1: the finding is not tied to the originating assessment'; END IF;
  RAISE NOTICE 'PASS R1: the A4 path records one canonical, governed finding % with full provenance', f.reference;
END $$;

-- ---------------------------------------------------------------------------
-- R2 — count reconciliation: DB = examination workspace = AML register
--      (legacy identified separately, never added to canonical exposure)
-- ---------------------------------------------------------------------------
DO $$
DECLARE ex uuid := (SELECT v FROM r4 WHERE k='ex');
        db_total int; db_open int; register int; legacy_n int;
BEGIN
  -- workspace canonical list (src/hooks/useExaminations.ts:useExaminationCanonicalFindings)
  SELECT count(*), count(*) FILTER (WHERE status NOT IN ('CLOSED','SUPERSEDED'))
    INTO db_total, db_open
    FROM public.supervisory_finding WHERE examination_id = ex;
  -- AML register (src/hooks/useAmlSupervision.ts:useAmlFindings)
  SELECT count(*) INTO register FROM public.supervisory_finding
   WHERE domain_code = 'AML_CFT' AND examination_id = ex;
  -- legacy compatibility list
  SELECT count(*) INTO legacy_n FROM public.examination_findings WHERE examination_id = ex;

  IF db_total <> 1 THEN RAISE EXCEPTION 'FAIL R2: expected 1 canonical finding, found %', db_total; END IF;
  IF register <> db_total THEN
    RAISE EXCEPTION 'FAIL R2: AML register (%) disagrees with the canonical count (%)', register, db_total; END IF;
  IF db_open <> 1 THEN RAISE EXCEPTION 'FAIL R2: open canonical count is % not 1', db_open; END IF;
  IF legacy_n <> 1 THEN RAISE EXCEPTION 'FAIL R2: legacy fixture row missing (%)', legacy_n; END IF;
  -- the legacy row must never be projected into the canonical register
  IF EXISTS (SELECT 1 FROM public.supervisory_finding
              WHERE legacy_source_id = (SELECT v FROM r4 WHERE k='legacy')) THEN
    RAISE EXCEPTION 'FAIL R2: the historical row was promoted into the canonical register'; END IF;
  RAISE NOTICE 'PASS R2: 1 canonical finding across DB, workspace and register; 1 legacy row counted separately';
END $$;

-- ---------------------------------------------------------------------------
-- R3 — Entity 360 reflects the canonical finding through the existing read model
-- ---------------------------------------------------------------------------
DO $$
DECLARE aml jsonb; open_now numeric; high_now numeric; missing text := ''; kk text;
BEGIN
  aml := jsonb_path_query_first(
           public.entity_supervisory_360((SELECT v FROM r4 WHERE k='ent')),
           '$.domains[*] ? (@.domain_code == "AML_CFT")');
  IF aml IS NULL THEN
    RAISE EXCEPTION 'FAIL R3: entity_supervisory_360 has no AML/CFT domain section'; END IF;

  open_now := COALESCE((aml->>'open_findings')::numeric, 0);
  high_now := COALESCE((aml->>'high_findings')::numeric, 0);
  IF open_now <> (SELECT v FROM r4n WHERE k='base_open_findings') + 1 THEN
    RAISE EXCEPTION 'FAIL R3: Entity 360 open findings did not move by exactly one (% -> %)',
      (SELECT v FROM r4n WHERE k='base_open_findings'), open_now; END IF;
  IF high_now <> (SELECT v FROM r4n WHERE k='base_high') + 1 THEN
    RAISE EXCEPTION 'FAIL R3: Entity 360 high/critical findings did not move by exactly one'; END IF;

  -- the new finding is visible through the canonical section, not a side query
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(aml->'findings','[]'::jsonb)) f
                  WHERE f->>'id' = (SELECT v::text FROM r4 WHERE k='finding')) THEN
    RAISE EXCEPTION 'FAIL R3: the A4 finding is absent from the canonical Entity 360 finding list'; END IF;

  -- the historical row must not inflate canonical supervisory exposure
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(aml->'findings','[]'::jsonb)) f
              WHERE f->>'id' = (SELECT v::text FROM r4 WHERE k='legacy')) THEN
    RAISE EXCEPTION 'FAIL R3: a legacy examination finding is double-counted in Entity 360'; END IF;

  FOREACH kk IN ARRAY ARRAY['active_examination','open_findings','high_findings','critical_findings',
      'overdue_remediation','ineffective_remediation','validation_pending','reassessment_required',
      'open_attention','active_intervention'] LOOP
    IF NOT (aml ? kk) THEN missing := missing || kk || '; '; END IF;
  END LOOP;
  IF missing <> '' THEN
    RAISE EXCEPTION 'FAIL R3: the canonical Entity 360 AML section is missing %', missing; END IF;
  RAISE NOTICE 'PASS R3: Entity 360 counts the new finding exactly once, through the canonical read model only';
END $$;

-- ---------------------------------------------------------------------------
-- R4 — assessment reconciliation: exact provenance, no entity+domain inference
-- ---------------------------------------------------------------------------
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.supervisory_finding
   WHERE assessment_id = (SELECT v FROM r4 WHERE k='a2');
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL R4: the finding is shown against an unrelated assessment of the same entity'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.supervisory_finding f
      JOIN public.examination_origin o ON o.examination_id = f.examination_id
     WHERE f.id = (SELECT v FROM r4 WHERE k='finding')
       AND o.assessment_id = f.assessment_id
       AND o.assessment_dimension_id = f.assessment_dimension_id) THEN
    RAISE EXCEPTION 'FAIL R4: the finding chain does not reconcile to the examination origin'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.supervisory_finding f
      JOIN public.examination_scope_dimension s
        ON s.examination_id = f.examination_id
       AND s.assessment_dimension_id = f.assessment_dimension_id
     WHERE f.id = (SELECT v FROM r4 WHERE k='finding')) THEN
    RAISE EXCEPTION 'FAIL R4: the finding dimension is not part of the examination scope'; END IF;
  RAISE NOTICE 'PASS R4: assessment -> dimension -> origin -> scope -> workpaper -> finding is exact';
END $$;

-- ---------------------------------------------------------------------------
-- R5/R6 — canonical work queue: correct route, no duplicate work objects
-- ---------------------------------------------------------------------------
DO $$
DECLARE q jsonb; items jsonb; fid uuid := (SELECT v FROM r4 WHERE k='finding');
        n int; dup int; leak int;
BEGIN
  q := public.supervisory_work_queue('ALL', 'AML_CFT', (SELECT v FROM r4 WHERE k='ent'), NULL, 500);
  items := COALESCE(q->'items', '[]'::jsonb);

  SELECT count(*) INTO n FROM jsonb_array_elements(items) i
   WHERE (i->>'source_id') = fid::text;
  IF n = 0 THEN RAISE EXCEPTION 'FAIL R5: the new finding produced no canonical work item'; END IF;

  IF EXISTS (SELECT 1 FROM jsonb_array_elements(items) i
              WHERE (i->>'source_id') = fid::text
                AND (i->>'route') <> '/supervision/findings/' || fid::text) THEN
    RAISE EXCEPTION 'FAIL R5: finding work does not deep-link to the canonical finding route'; END IF;

  -- finding and examination work must never route into the prudential or conduct
  -- module UIs (attention/plan routes are a separate, pre-existing convention
  -- owned by W6 route convergence).
  SELECT count(*) INTO leak FROM jsonb_array_elements(items) i
   WHERE i->>'source_object' IN ('supervisory_finding','supervisory_remediation_action','examination')
     AND (i->>'route' LIKE '/prudential/%' OR i->>'route' LIKE '/conduct/%');
  IF leak > 0 THEN RAISE EXCEPTION 'FAIL R5: % AML work item(s) leak to another domain route', leak; END IF;

  IF EXISTS (SELECT 1 FROM jsonb_array_elements(items) i
              WHERE i->>'source_object' = 'examination'
                AND i->>'route' <> '/supervision/examinations/' || (i->>'source_id')) THEN
    RAISE EXCEPTION 'FAIL R5: examination work does not deep-link to the canonical examination route'; END IF;

  SELECT count(*) INTO dup FROM (
    SELECT i->>'work_key' k, count(*) c FROM jsonb_array_elements(items) i GROUP BY 1 HAVING count(*) > 1
  ) t;
  IF dup > 0 THEN RAISE EXCEPTION 'FAIL R6: % duplicated work key(s) in the canonical queue', dup; END IF;

  SELECT count(*) INTO dup FROM (
    SELECT i->>'work_type' w, count(*) c FROM jsonb_array_elements(items) i
     WHERE i->>'source_id' = fid::text GROUP BY 1 HAVING count(*) > 1
  ) t;
  IF dup > 0 THEN
    RAISE EXCEPTION 'FAIL R6: one finding produced % duplicated work object(s) of the same type', dup; END IF;
  RAISE NOTICE 'PASS R5/R6: one finding = one canonical work object per decision point, correctly routed';
END $$;

-- ---------------------------------------------------------------------------
-- R7 — backend rejects false provenance (client-tampered parameters)
-- ---------------------------------------------------------------------------
DO $$
DECLARE base jsonb; ok boolean; failed text := '';
  PROCEDURE_LABEL text;
BEGIN
  base := jsonb_build_object(
    'entity_id', (SELECT v FROM r4 WHERE k='ent'), 'domain_code','AML_CFT', 'severity','HIGH',
    'title','Tampered provenance', 'observation','x',
    'examination_id', (SELECT v FROM r4 WHERE k='ex'),
    'workpaper_id', (SELECT v FROM r4 WHERE k='wp'));

  -- a) workpaper of examination A claimed under examination B (other entity)
  ok := false;
  BEGIN PERFORM public.supervisory_finding_create(
    base || jsonb_build_object('examination_id', (SELECT v FROM r4 WHERE k='ex_other')));
  EXCEPTION WHEN OTHERS THEN ok := true; END;
  IF NOT ok THEN failed := failed || 'workpaper/examination mismatch; '; END IF;

  -- b) entity claimed differs from the examination's entity
  ok := false;
  BEGIN PERFORM public.supervisory_finding_create(
    base || jsonb_build_object('entity_id', (SELECT v FROM r4 WHERE k='ent2')));
  EXCEPTION WHEN OTHERS THEN ok := true; END;
  IF NOT ok THEN failed := failed || 'entity mismatch; '; END IF;

  -- c) dimension belonging to another assessment
  ok := false;
  BEGIN PERFORM public.supervisory_finding_create(
    base || jsonb_build_object('assessment_id', (SELECT v FROM r4 WHERE k='a1'),
                               'assessment_dimension_id', (SELECT v FROM r4 WHERE k='d_other')));
  EXCEPTION WHEN OTHERS THEN ok := true; END;
  IF NOT ok THEN failed := failed || 'dimension/assessment mismatch; '; END IF;

  -- d) dimension of the right assessment but outside governed examination scope
  ok := false;
  BEGIN PERFORM public.supervisory_finding_create(
    base || jsonb_build_object('assessment_dimension_id', (SELECT v FROM r4 WHERE k='d_out')));
  EXCEPTION WHEN OTHERS THEN ok := true; END;
  IF NOT ok THEN failed := failed || 'out-of-scope dimension; '; END IF;

  -- e) assessment of another entity
  ok := false;
  BEGIN PERFORM public.supervisory_finding_create(
    base || jsonb_build_object('entity_id', (SELECT v FROM r4 WHERE k='ent2'),
                               'examination_id', (SELECT v FROM r4 WHERE k='ex_other'),
                               'workpaper_id', NULL,
                               'assessment_id', (SELECT v FROM r4 WHERE k='a1')));
  EXCEPTION WHEN OTHERS THEN ok := true; END;
  IF NOT ok THEN failed := failed || 'assessment entity mismatch; '; END IF;

  -- f) a legacy examination_findings id smuggled in as a workpaper
  ok := false;
  BEGIN PERFORM public.supervisory_finding_create(
    base || jsonb_build_object('workpaper_id', (SELECT v FROM r4 WHERE k='legacy')));
  EXCEPTION WHEN OTHERS THEN ok := true; END;
  IF NOT ok THEN failed := failed || 'legacy row accepted as fieldwork; '; END IF;

  IF failed <> '' THEN RAISE EXCEPTION 'FAIL R7: backend accepted false provenance: %', failed; END IF;
  RAISE NOTICE 'PASS R7: six tampered-provenance payloads were all rejected server-side';
END $$;

-- ---------------------------------------------------------------------------
-- R8 — authority: other-domain and out-of-scope officers cannot raise AML findings
-- ---------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = :'PRUDENTIAL';
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN PERFORM public.supervisory_finding_create(jsonb_build_object(
    'entity_id', (SELECT v FROM r4 WHERE k='ent'), 'domain_code','AML_CFT','severity','HIGH',
    'title','Prudential officer raising an AML finding','observation','x',
    'examination_id', (SELECT v FROM r4 WHERE k='ex'),
    'workpaper_id', (SELECT v FROM r4 WHERE k='wp')));
  EXCEPTION WHEN OTHERS THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL R8: prudential examination authority raised an AML/CFT finding'; END IF;
  RAISE NOTICE 'PASS R8a: prudential-only authority cannot raise an AML/CFT finding';
END $$;

SET LOCAL "request.jwt.claims" = :'CONDUCT';
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN PERFORM public.supervisory_finding_create(jsonb_build_object(
    'entity_id', (SELECT v FROM r4 WHERE k='ent'), 'domain_code','AML_CFT','severity','HIGH',
    'title','Conduct officer raising an AML finding','observation','x',
    'examination_id', (SELECT v FROM r4 WHERE k='ex'),
    'workpaper_id', (SELECT v FROM r4 WHERE k='wp')));
  EXCEPTION WHEN OTHERS THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL R8: a conduct officer mutated an AML/CFT finding'; END IF;
  RAISE NOTICE 'PASS R8b: conduct-only authority is denied AML/CFT finding mutation';
END $$;

SET LOCAL "request.jwt.claims" = :'OUTSIDER';
DO $$
DECLARE ok boolean := false; n int;
BEGIN
  BEGIN PERFORM public.supervisory_finding_create(jsonb_build_object(
    'entity_id', (SELECT v FROM r4 WHERE k='ent'), 'domain_code','AML_CFT','severity','HIGH',
    'title','Unauthorised','observation','x',
    'examination_id', (SELECT v FROM r4 WHERE k='ex'),
    'workpaper_id', (SELECT v FROM r4 WHERE k='wp')));
  EXCEPTION WHEN OTHERS THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL R8: an unauthorised officer raised a supervisory finding'; END IF;

  -- direct navigation to /supervision/findings/:id is data-denied, not just UI-hidden
  SELECT count(*) INTO n FROM public.supervisory_finding WHERE id = (SELECT v FROM r4 WHERE k='finding');
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL R8: an unauthorised persona can read the finding by direct navigation'; END IF;
  RAISE NOTICE 'PASS R8c: unauthorised personas can neither raise nor read the finding by direct URL';
END $$;

-- ---------------------------------------------------------------------------
-- R9/R10 — legacy safety and direct-write lockdown
-- ---------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = :'EXAMINER';
DO $$
DECLARE ok boolean := false;
BEGIN
  -- canonical findings may not be inserted directly by an application persona
  BEGIN
    INSERT INTO public.supervisory_finding(entity_id, domain_code, title, severity, status,
        source_kind, origin_provenance, examination_id)
    VALUES ((SELECT v FROM r4 WHERE k='ent'), 'AML_CFT', 'Direct insert', 'HIGH', 'DRAFT',
        'EXAMINATION', 'GOVERNED', (SELECT v FROM r4 WHERE k='ex'));
  EXCEPTION WHEN OTHERS THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL R10: a persona inserted a canonical finding directly'; END IF;

  ok := false;
  BEGIN
    UPDATE public.supervisory_finding
       SET examination_id = (SELECT v FROM r4 WHERE k='ex_other'),
           origin_provenance = 'GOVERNED'
     WHERE id = (SELECT v FROM r4 WHERE k='finding');
    IF FOUND THEN ok := false; ELSE ok := true; END IF;
  EXCEPTION WHEN OTHERS THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL R10: provenance fields were rewritten by a direct update'; END IF;
  RAISE NOTICE 'PASS R10: canonical findings and their provenance accept governed operations only';
END $$;

DO $$
DECLARE n int;
BEGIN
  -- the legacy row is untouched and never gains canonical provenance
  SELECT count(*) INTO n FROM public.examination_findings
   WHERE id = (SELECT v FROM r4 WHERE k='legacy') AND status = 'open';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL R9: the historical finding was mutated or removed'; END IF;
  IF EXISTS (SELECT 1 FROM public.supervisory_finding
              WHERE origin_provenance = 'GOVERNED' AND legacy_source_table IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL R9: a legacy record was given fabricated governed provenance'; END IF;
  RAISE NOTICE 'PASS R9: historical findings stay historical — no invented provenance, no destructive migration';
END $$;

-- ---------------------------------------------------------------------------
-- R11 — real A4 -> A5 integration on the finding just raised
-- ---------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = :'REVIEWER';
DO $$
DECLARE fid uuid := (SELECT v FROM r4 WHERE k='finding'); st text;
BEGIN
  PERFORM public.supervisory_finding_lifecycle(fid, 'REVIEW', 'Independent review of examination finding');
END $$;

-- issuance is a checker act: a supervisory approver, not the examiner or reviewer
SET LOCAL "request.jwt.claims" = :'SUPERVISOR';
DO $$
DECLARE fid uuid := (SELECT v FROM r4 WHERE k='finding'); st text;
BEGIN
  PERFORM public.supervisory_finding_lifecycle(fid, 'ISSUED', 'Issued to the licensee for response');
  SELECT status INTO st FROM public.supervisory_finding WHERE id = fid;
  IF st <> 'ISSUED' THEN RAISE EXCEPTION 'FAIL R11: finding was not issued (%)', st; END IF;
  RAISE NOTICE 'PASS R11a: the A4-created finding is reviewed and issued through governed lifecycle';
END $$;

SET LOCAL "request.jwt.claims" = :'EXAMINER';
DO $$
DECLARE fid uuid := (SELECT v FROM r4 WHERE k='finding');
        a1 uuid; a2 uuid; a3 uuid; n int;
BEGIN
  PERFORM public.supervisory_finding_response(fid, 'PARTIALLY_ACCEPTED',
    'The licensee accepts the monitoring weakness and disputes the backlog volume.',
    'Remediate documentation standards and retrain analysts.', 'MLRO',
    (current_date + 60), NULL);

  a1 := public.supervisory_remediation_open(fid, 'RA-001 Document all outstanding alert decisions',
        'Every alert decision is documented and reviewable', NULL, 'MLRO', current_date + 30);
  a2 := public.supervisory_remediation_open(fid, 'RA-002 Retrain monitoring analysts',
        'All analysts trained on the revised standard', NULL, 'Head of Compliance', current_date + 45);
  a3 := public.supervisory_remediation_open(fid, 'RA-003 Independent post-implementation review',
        'Independent assurance over monitoring effectiveness', NULL, 'Internal Audit', current_date - 30);
  INSERT INTO r4(k,v) VALUES ('ra1',a1),('ra2',a2),('ra3',a3);

  SELECT count(*) INTO n FROM public.supervisory_remediation_action WHERE finding_id = fid;
  IF n <> 3 THEN RAISE EXCEPTION 'FAIL R11: expected 3 independent corrective actions, found %', n; END IF;

  -- RA-001 implemented and validated effective; RA-002 implementing; RA-003 open
  PERFORM public.supervisory_remediation_transition(a1, 'UNDER_REVIEW', 'Plan under supervisory review', NULL, NULL);
  PERFORM public.supervisory_remediation_transition(a1, 'ACCEPTED', 'Plan accepted', NULL, NULL);
  PERFORM public.supervisory_remediation_transition(a1, 'IMPLEMENTING', 'Work underway', NULL, NULL);
  PERFORM public.supervisory_remediation_transition(a1, 'EVIDENCE_SUBMITTED', 'Evidence received', NULL, NULL);
  PERFORM public.supervisory_remediation_transition(a1, 'VALIDATION', 'Evidence accepted for validation', NULL, NULL);
  PERFORM public.supervisory_remediation_transition(a2, 'UNDER_REVIEW', 'Plan under supervisory review', NULL, NULL);
  PERFORM public.supervisory_remediation_transition(a2, 'ACCEPTED', 'Plan accepted', NULL, NULL);
  PERFORM public.supervisory_remediation_transition(a2, 'IMPLEMENTING', 'Training in progress', NULL, NULL);
END $$;

SET LOCAL "request.jwt.claims" = :'REVIEWER';
DO $$
DECLARE fid uuid := (SELECT v FROM r4 WHERE k='finding');
        ra1 uuid := (SELECT v FROM r4 WHERE k='ra1');
        ra2 uuid := (SELECT v FROM r4 WHERE k='ra2');
        ra3 uuid := (SELECT v FROM r4 WHERE k='ra3');
        vres jsonb; vid uuid; ok boolean := false; st text; s1 text; s2 text; s3 text;
BEGIN
  -- validation targets RA-001 exactly
  vres := public.supervisory_remediation_validate(ra1, 'EFFECTIVE',
    'Sampled 30 alert decisions, all documented', 'Re-performance', 'Documentation standard met',
    'Close this action', NULL, NULL);
  vid := (vres->>'validation_id')::uuid;
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_remediation_validation
                  WHERE id = vid AND action_id = ra1) THEN
    RAISE EXCEPTION 'FAIL R12: validation was not recorded against RA-001'; END IF;
  IF EXISTS (SELECT 1 FROM public.supervisory_remediation_validation
              WHERE action_id IN (ra2, ra3)) THEN
    RAISE EXCEPTION 'FAIL R12: validation leaked onto another corrective action'; END IF;

  INSERT INTO r4(k,v) VALUES ('validation', vid);
END $$;

-- escalation and reassessment are supervisory acts (attention creation authority)
SET LOCAL "request.jwt.claims" = :'SUPERVISOR';
DO $$
DECLARE fid uuid := (SELECT v FROM r4 WHERE k='finding');
        ra1 uuid := (SELECT v FROM r4 WHERE k='ra1');
        ra2 uuid := (SELECT v FROM r4 WHERE k='ra2');
        ra3 uuid := (SELECT v FROM r4 WHERE k='ra3');
        vid uuid := (SELECT v FROM r4 WHERE k='validation');
        ok boolean := false; st text; s1 text; s2 text; s3 text;
BEGIN
  -- escalation targets RA-003 exactly
  PERFORM public.supervisory_remediation_escalate(ra3,
    'No plan submitted for the independent review', 'HIGH', 'HIGH');
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_remediation_action
                  WHERE id = ra3 AND escalated_attention_id IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL R12: escalation did not attach to RA-003'; END IF;
  IF EXISTS (SELECT 1 FROM public.supervisory_remediation_action
              WHERE id IN (ra1, ra2) AND escalated_attention_id IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL R12: escalation leaked onto another corrective action'; END IF;

  -- reassessment requirement carries RA-001 provenance
  PERFORM public.supervisory_reassessment_require((SELECT v FROM r4 WHERE k='ent'), 'AML_CFT',
    'REMEDIATION_COMPLETED', 'Monitoring controls remediated — refresh the control rating',
    'TARGETED', current_date + 90, (SELECT v FROM r4 WHERE k='a1'), fid, ra1, vid, NULL, NULL, NULL, NULL);
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_reassessment_requirement
                  WHERE finding_id = fid AND remediation_action_id = ra1) THEN
    RAISE EXCEPTION 'FAIL R12: reassessment provenance does not store RA-001'; END IF;

  -- closure readiness must block while RA-002/RA-003 are unresolved
  BEGIN PERFORM public.supervisory_finding_lifecycle(fid, 'CLOSED', 'Attempted premature closure');
  EXCEPTION WHEN OTHERS THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL R11: the finding closed with unresolved corrective actions'; END IF;

  SELECT status INTO st FROM public.supervisory_finding WHERE id = fid;
  IF st IN ('CLOSED','WITHDRAWN') THEN
    RAISE EXCEPTION 'FAIL R11: the finding is no longer open (%)', st; END IF;

  SELECT status INTO s1 FROM public.supervisory_remediation_action WHERE id = ra1;
  SELECT status INTO s2 FROM public.supervisory_remediation_action WHERE id = ra2;
  SELECT status INTO s3 FROM public.supervisory_remediation_action WHERE id = ra3;
  IF s1 <> 'EFFECTIVE' OR s2 <> 'IMPLEMENTING' OR s3 NOT IN ('OPEN','REOPENED') THEN
    RAISE EXCEPTION 'FAIL R11: corrective actions are not independent (RA-001=%, RA-002=%, RA-003=%)', s1, s2, s3; END IF;
  RAISE NOTICE 'PASS R11/R12: three actions move independently (EFFECTIVE/IMPLEMENTING/OPEN), each operation targets its exact action, closure is blocked';
END $$;

-- ---------------------------------------------------------------------------
-- R13 — history reconciliation without duplicating business events
-- ---------------------------------------------------------------------------
DO $$
DECLARE ex uuid := (SELECT v FROM r4 WHERE k='ex'); fid uuid := (SELECT v FROM r4 WHERE k='finding');
        missing text := ''; e text; dup int; tl jsonb; n int;
BEGIN
  FOREACH e IN ARRAY ARRAY['workpaper_submitted_for_review','supervisory_finding_created'] LOOP
    IF NOT EXISTS (SELECT 1 FROM public.examination_events
                    WHERE examination_id = ex AND event_type = e) THEN
      missing := missing || e || '; '; END IF;
  END LOOP;
  IF missing <> '' THEN RAISE EXCEPTION 'FAIL R13: examination history missing %', missing; END IF;

  SELECT count(*) INTO n FROM public.supervisory_finding_event WHERE finding_id = fid;
  IF n < 4 THEN RAISE EXCEPTION 'FAIL R13: finding history has only % event(s)', n; END IF;

  -- a business event is (type, from -> to, instant); distinct transitions may share an instant
  SELECT count(*) INTO dup FROM (
    SELECT event_type, from_status, to_status, created_at, count(*) c
      FROM public.supervisory_finding_event
     WHERE finding_id = fid GROUP BY 1,2,3,4 HAVING count(*) > 1) t;
  IF dup > 0 THEN
    RAISE EXCEPTION 'FAIL R13: duplicated finding event(s): %',
      (SELECT string_agg(event_type || ':' || COALESCE(from_status,'-') || '->' || COALESCE(to_status,'-') || ' x' || c, ', ') FROM (
         SELECT event_type, from_status, to_status, created_at, count(*) c FROM public.supervisory_finding_event
          WHERE finding_id = fid GROUP BY 1,2,3,4 HAVING count(*) > 1) z);
  END IF;

  tl := public.supervisory_timeline((SELECT v FROM r4 WHERE k='ent'), 'AML_CFT', NULL, NULL, NULL, 500);
  IF tl IS NULL THEN RAISE EXCEPTION 'FAIL R13: the enterprise supervisory timeline returned nothing'; END IF;
  SELECT count(*) INTO dup FROM (
    SELECT i->>'event_key' k, count(*) c
      FROM jsonb_array_elements(COALESCE(tl->'events', tl)) i
     WHERE i ? 'event_key' GROUP BY 1 HAVING count(*) > 1) t;
  IF dup > 0 THEN RAISE EXCEPTION 'FAIL R13: % business event(s) duplicated on the enterprise timeline', dup; END IF;
  RAISE NOTICE 'PASS R13: examination, finding and enterprise timeline reconcile with no duplicated events';
END $$;

RESET ROLE;
ROLLBACK;
