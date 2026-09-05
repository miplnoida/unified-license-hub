-- =====================================================================
-- OS-01 — CANONICAL SUPERVISORY ACTIVITY CONTRACT + OFFSITE ACTIVATION
-- Gates OSACT-01 .. OSACT-20
-- =====================================================================
-- Proves that offsite supervision is executed through the ONE canonical
-- examination object (engagement_type = OFFSITE_REVIEW), that the
-- intervention -> execution contract is server-owned, that display aliases
-- are impossible, and that no offsite-specific object was created.
--
-- Conventions:
--   * one transaction, ROLLBACK at the end — no data persists;
--   * business authorisation exercised with REAL personas
--     (SET LOCAL ROLE authenticated + request.jwt.claims), never service_role;
--   * every gate RAISEs on failure so ON_ERROR_STOP aborts the run.
--
-- Personas (public.cert_certification_users):
--   AML officer (maker)        b8eaf680-fe66-4d49-b816-1c087f511235
--   AML supervisor (checker)   0b522724-adcb-48bf-b21d-175339479616
--   Examiner                   d1016d5f-cde5-46dd-a552-0f2f87abc193
--   Unauthorised (non-AML)     411dd06d-648b-4f32-82cc-897902c0c0b6
-- =====================================================================

\set ON_ERROR_STOP on
\set QUIET 1
\pset pager off
SET row_security = on;

\set OFFICER    '{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}'
\set SUPERVISOR '{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}'
\set EXAMINER   '{"sub":"d1016d5f-cde5-46dd-a552-0f2f87abc193","role":"authenticated"}'
\set OUTSIDER   '{"sub":"411dd06d-648b-4f32-82cc-897902c0c0b6","role":"authenticated"}'

BEGIN;

CREATE TEMP TABLE os(k text PRIMARY KEY, v uuid) ON COMMIT DROP;
CREATE TEMP TABLE osn(k text PRIMARY KEY, n bigint) ON COMMIT DROP;
GRANT ALL ON os TO authenticated;
GRANT ALL ON osn TO authenticated;

INSERT INTO osn(k,n) VALUES
  ('examinations',   (SELECT count(*) FROM public.examinations)),
  ('offsite_before', (SELECT count(*) FROM public.examinations WHERE engagement_type = 'OFFSITE_REVIEW')),
  ('interventions',  (SELECT count(*) FROM public.supervisory_intervention)),
  ('findings',       (SELECT count(*) FROM public.supervisory_finding));

-- origin: an already-approved AML/CFT assessment (real supervisory truth)
INSERT INTO os(k,v)
SELECT 'assessment', a.id FROM public.supervisory_assessment a
 WHERE a.domain_code = 'AML_CFT' AND a.status = 'approved'
   AND EXISTS (SELECT 1 FROM public.supervisory_assessment_dimension d WHERE d.assessment_id = a.id)
 ORDER BY a.created_at DESC LIMIT 1;

INSERT INTO os(k,v)
SELECT 'entity', a.entity_id FROM public.supervisory_assessment a
 WHERE a.id = (SELECT v FROM os WHERE k='assessment');

INSERT INTO os(k,v)
SELECT 'dimension', d.id FROM public.supervisory_assessment_dimension d
 WHERE d.assessment_id = (SELECT v FROM os WHERE k='assessment')
 ORDER BY d.weight DESC NULLS LAST, d.dimension_code LIMIT 1;

DO $$
BEGIN
  IF (SELECT v FROM os WHERE k='assessment') IS NULL THEN
    RAISE EXCEPTION 'SETUP: no approved AML/CFT assessment available as a governed origin'; END IF;
END $$;

-- =====================================================================
-- OSACT-01 — canonical engagement vocabulary is database-owned
-- =====================================================================
DO $$
DECLARE def text; missing text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
   WHERE conname = 'examinations_engagement_type_chk';
  IF def IS NULL THEN RAISE EXCEPTION 'FAIL OSACT-01: engagement vocabulary is not enforced by the database'; END IF;
  FOREACH missing IN ARRAY ARRAY['FULL_SCOPE_ONSITE','TARGETED_ONSITE','OFFSITE_REVIEW',
                                 'FOLLOW_UP_REVIEW','JOINT_EXAMINATION','THEMATIC_EXAMINATION'] LOOP
    IF def NOT LIKE '%'||missing||'%' THEN
      RAISE EXCEPTION 'FAIL OSACT-01: canonical engagement % is not permitted', missing; END IF;
  END LOOP;
  RAISE NOTICE 'PASS OSACT-01: six canonical engagement types are enforced on examinations';
END $$;

-- =====================================================================
-- OSACT-02 — engagement vocabulary is served to clients by the server
-- =====================================================================
DO $$
DECLARE v jsonb;
BEGIN
  v := public.supervisory_engagement_types();
  IF jsonb_array_length(v) <> 6 THEN
    RAISE EXCEPTION 'FAIL OSACT-02: server offers % engagement types, expected 6', jsonb_array_length(v); END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v) e WHERE e->>'value' = 'OFFSITE_REVIEW'
                   AND e->>'mode' = 'OFFSITE') THEN
    RAISE EXCEPTION 'FAIL OSACT-02: OFFSITE_REVIEW is not offered as an offsite engagement'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v) e WHERE e->>'value' <> upper(e->>'value')) THEN
    RAISE EXCEPTION 'FAIL OSACT-02: server emitted a non-canonical (aliased) engagement value'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v) e
              WHERE NOT EXISTS (SELECT 1 FROM pg_constraint c
                                 WHERE c.conname = 'examinations_engagement_type_chk'
                                   AND pg_get_constraintdef(c.oid) LIKE '%'||(e->>'value')||'%')) THEN
    RAISE EXCEPTION 'FAIL OSACT-02: the offered vocabulary is not the vocabulary the table enforces'; END IF;
  RAISE NOTICE 'PASS OSACT-02: engagement vocabulary is resolved from the server, canonical only';
END $$;

-- =====================================================================
-- OSACT-03 — legacy display aliases are impossible
-- =====================================================================
DO $$
DECLARE alias text; bad bigint;
BEGIN
  FOREACH alias IN ARRAY ARRAY['targeted','full_scope','follow_up','thematic','offsite_review'] LOOP
    SELECT count(*) INTO bad FROM public.examinations WHERE engagement_type = alias;
    IF bad > 0 THEN RAISE EXCEPTION 'FAIL OSACT-03: % examinations still carry the alias %', bad, alias; END IF;
  END LOOP;
  RAISE NOTICE 'PASS OSACT-03: no display aliases exist in examination engagement data';
END $$;

-- =====================================================================
-- OSACT-04 — intervention taxonomy includes offsite and desk review
-- =====================================================================
DO $$
DECLARE def text; t text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
   WHERE conname = 'supervisory_intervention_type_chk';
  IF def IS NULL THEN RAISE EXCEPTION 'FAIL OSACT-04: intervention taxonomy is not enforced'; END IF;
  FOREACH t IN ARRAY ARRAY['DESK_REVIEW','OFFSITE_REVIEW','ONSITE_EXAMINATION','THEMATIC_REVIEW'] LOOP
    IF def NOT LIKE '%'||t||'%' THEN
      RAISE EXCEPTION 'FAIL OSACT-04: intervention type % is not permitted', t; END IF;
  END LOOP;
  RAISE NOTICE 'PASS OSACT-04: intervention taxonomy carries the supervisory activity types';
END $$;

-- =====================================================================
-- OSACT-05 — server owns the intervention -> execution mapping
-- =====================================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('ONSITE_EXAMINATION','EXAMINATION'),
      ('OFFSITE_REVIEW','EXAMINATION'),
      ('FOLLOW_UP_REVIEW','EXAMINATION'),
      ('THEMATIC_REVIEW','EXAMINATION'),
      ('DESK_REVIEW','LIGHTWEIGHT'),
      ('INFORMATION_REQUEST','LIGHTWEIGHT'),
      ('SUPERVISORY_MEETING','LIGHTWEIGHT'),
      ('ENFORCEMENT_REFERRAL','REFERRAL'),
      ('FORMAL_INVESTIGATION','INVESTIGATION')) AS x(t, kind)
  LOOP
    IF public.supervisory_intervention_execution_contract(r.t)->>'execution_kind' IS DISTINCT FROM r.kind THEN
      RAISE EXCEPTION 'FAIL OSACT-05: % is not classified as %', r.t, r.kind; END IF;
  END LOOP;
  IF public.supervisory_intervention_execution_contract('OFFSITE_REVIEW')->>'default_engagement_type'
     IS DISTINCT FROM 'OFFSITE_REVIEW' THEN
    RAISE EXCEPTION 'FAIL OSACT-05: offsite intervention does not resolve to the OFFSITE_REVIEW engagement'; END IF;
  IF public.supervisory_intervention_execution_contract('DESK_REVIEW')->>'default_engagement_type' IS NOT NULL
     OR jsonb_array_length(public.supervisory_intervention_execution_contract('DESK_REVIEW')->'allowed_engagement_types') <> 0 THEN
    RAISE EXCEPTION 'FAIL OSACT-05: a lightweight intervention was given an examination engagement'; END IF;
  -- ambiguous onsite work must be chosen by a human, never guessed
  IF (public.supervisory_intervention_execution_contract('ONSITE_EXAMINATION')->>'requires_explicit_engagement')::boolean IS NOT TRUE
     OR public.supervisory_intervention_execution_contract('ONSITE_EXAMINATION')->>'default_engagement_type' IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL OSACT-05: the server guessed an engagement for ambiguous onsite work'; END IF;
  RAISE NOTICE 'PASS OSACT-05: execution kind and engagement are resolved by the server, not the browser';
END $$;

-- =====================================================================
-- OSACT-06 — every permitted intervention type is classified
-- =====================================================================
DO $$
DECLARE def text; t text; n int := 0; c jsonb;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
   WHERE conname = 'supervisory_intervention_type_chk';
  FOR t IN SELECT DISTINCT m[1] FROM regexp_matches(def, '''([A-Z_]+)''', 'g') AS m LOOP
    c := public.supervisory_intervention_execution_contract(t);
    IF c->>'execution_kind' = 'UNKNOWN' THEN
      RAISE EXCEPTION 'FAIL OSACT-06: permitted intervention type % has no execution classification', t; END IF;
    IF c->>'execution_kind' = 'EXAMINATION'
       AND jsonb_array_length(c->'allowed_engagement_types') = 0 THEN
      RAISE EXCEPTION 'FAIL OSACT-06: % executes as an examination but permits no engagement type', t; END IF;
    n := n + 1;
  END LOOP;
  IF n < 10 THEN
    RAISE EXCEPTION 'FAIL OSACT-06: the capability contract does not cover the intervention taxonomy (% types)', n; END IF;
  RAISE NOTICE 'PASS OSACT-06: all % permitted intervention types have a server-declared execution contract', n;
END $$;

-- =====================================================================
-- OSACT-07 — ZERO DUPLICATION: no offsite-specific objects
-- =====================================================================
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO bad FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r','v','m')
     AND (c.relname LIKE '%offsite%' OR c.relname LIKE '%off_site%' OR c.relname LIKE '%desk_review%');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL OSACT-07: offsite-specific objects were created: %', bad; END IF;
  RAISE NOTICE 'PASS OSACT-07: offsite supervision introduced no parallel table, view or read model';
END $$;

-- =====================================================================
-- OSACT-08 — engagement and lifecycle stage remain distinct vocabularies
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'examinations_stage_not_engagement_chk') THEN
    RAISE EXCEPTION 'FAIL OSACT-08: nothing prevents an engagement value being stored as a lifecycle stage'; END IF;
  IF EXISTS (SELECT 1 FROM public.examinations e
              WHERE upper(e.stage) IN (SELECT x->>'value'
                                         FROM jsonb_array_elements(public.supervisory_engagement_types()) x)) THEN
    RAISE EXCEPTION 'FAIL OSACT-08: an examination stores an engagement value in its lifecycle stage'; END IF;
  RAISE NOTICE 'PASS OSACT-08: "what kind of engagement" and "where it is in its lifecycle" stay separate';
END $$;

-- =====================================================================
-- OSACT-09 — contract functions are governed, not public data leaks
-- =====================================================================
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['supervisory_engagement_types',
                           'supervisory_intervention_execution_contract',
                           'supervisory_intervention_execution_capabilities'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.proname = f AND p.pronamespace = 'public'::regnamespace) THEN
      RAISE EXCEPTION 'FAIL OSACT-09: % does not exist', f; END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p
                WHERE p.proname = f AND p.pronamespace = 'public'::regnamespace
                  AND has_function_privilege('anon', p.oid, 'EXECUTE')) THEN
      RAISE EXCEPTION 'FAIL OSACT-09: % is executable anonymously', f; END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.proname = 'supervisory_intervention_execution_capabilities'
                  AND p.pronamespace = 'public'::regnamespace AND p.prosecdef
                  AND p.proconfig::text LIKE '%search_path%') THEN
    RAISE EXCEPTION 'FAIL OSACT-09: the capability contract is not a guarded security-definer operation'; END IF;
  RAISE NOTICE 'PASS OSACT-09: the activity contract functions exist, are guarded and closed to anonymous callers';
END $$;

-- =====================================================================
-- OSACT-10 — no production offsite engagement was seeded
-- =====================================================================
DO $$
BEGIN
  IF (SELECT n FROM osn WHERE k='offsite_before') <> 0 THEN
    RAISE EXCEPTION 'FAIL OSACT-10: % offsite examinations were seeded into production data',
      (SELECT n FROM osn WHERE k='offsite_before'); END IF;
  RAISE NOTICE 'PASS OSACT-10: activation shipped capability only — no invented offsite business data';
END $$;

-- =====================================================================
-- OSACT-11/12 — governed offsite intervention on an approved-assessment plan
-- =====================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = :'OFFICER';
DO $$
DECLARE r jsonb; att uuid; pl uuid;
BEGIN
  r := public.supervisory_attention_open(
        'AML/CFT offsite review required', 'AML_CFT',
        'Approved AML/CFT assessment supports an offsite review of the documented control environment.',
        'AML_RISK', ARRAY[(SELECT v FROM os WHERE k='entity')],
        (SELECT v FROM os WHERE k='assessment'), (SELECT v FROM os WHERE k='dimension'));
  att := (r->>'id')::uuid;
  INSERT INTO os(k,v) VALUES ('att', att);
END $$;

SET LOCAL "request.jwt.claims" = :'SUPERVISOR';
DO $$
BEGIN
  PERFORM public.supervisory_attention_confirm_priority((SELECT v FROM os WHERE k='att'), 'HIGH',
    'Confirmed: an offsite review is proportionate to the assessed weakness.');
END $$;

SET LOCAL "request.jwt.claims" = :'OFFICER';
DO $$
DECLARE r jsonb; pl uuid; iv uuid;
BEGIN
  r := public.supervisory_plan_open('AML/CFT supervisory plan — offsite review', 'AML_CFT',
        'Confirmed AML/CFT attention arising from the approved assessment.',
        'Review the documented AML/CFT control environment offsite.',
        (SELECT v FROM os WHERE k='att'), ARRAY[(SELECT v FROM os WHERE k='assessment')]);
  pl := (r->>'id')::uuid;
  INSERT INTO os(k,v) VALUES ('plan', pl);
  PERFORM public.supervisory_plan_lifecycle(pl, 'SUBMITTED', 'Submitted for AML supervisory approval.');
END $$;

SET LOCAL "request.jwt.claims" = :'SUPERVISOR';
DO $$
DECLARE pl uuid := (SELECT v FROM os WHERE k='plan');
BEGIN
  PERFORM public.supervisory_plan_lifecycle(pl, 'APPROVED', 'Approved by the AML/CFT supervisor.');
  PERFORM public.supervisory_plan_lifecycle(pl, 'ACTIVE', 'Activated for the current AML cycle.');
END $$;

SET LOCAL "request.jwt.claims" = :'OFFICER';
DO $$
DECLARE r jsonb; iv uuid;
BEGIN
  r := public.supervisory_intervention_open((SELECT v FROM os WHERE k='plan'),
        'OFFSITE_REVIEW', 'Offsite review of AML/CFT controls',
        'Plan-authorised offsite review of policies, MI and monitoring documentation.',
        'AML_CFT', (SELECT v FROM os WHERE k='entity'), (SELECT v FROM os WHERE k='att'));
  iv := (r->>'id')::uuid;
  INSERT INTO os(k,v) VALUES ('iv', iv);
END $$;

RESET ROLE;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_intervention
                  WHERE id = (SELECT v FROM os WHERE k='iv')
                    AND intervention_type = 'OFFSITE_REVIEW'
                    AND plan_id = (SELECT v FROM os WHERE k='plan')) THEN
    RAISE EXCEPTION 'FAIL OSACT-11: the offsite intervention is not plan-authorised on the canonical relation'; END IF;
  RAISE NOTICE 'PASS OSACT-11: offsite review is a governed intervention on an approved-assessment plan';
END $$;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = :'SUPERVISOR';
DO $$
DECLARE iv uuid := (SELECT v FROM os WHERE k='iv');
BEGIN
  PERFORM public.supervisory_intervention_decide(iv, 'ENDORSED', 'Endorsed: proceed with the offsite review.');
  PERFORM public.supervisory_intervention_decide(iv, 'ACTIVE', 'Intervention activated for execution.');
END $$;

RESET ROLE;
DO $$
BEGIN
  IF (SELECT status FROM public.supervisory_intervention WHERE id = (SELECT v FROM os WHERE k='iv')) <> 'ACTIVE' THEN
    RAISE EXCEPTION 'FAIL OSACT-12: the offsite intervention was not endorsed and activated by a checker'; END IF;
  RAISE NOTICE 'PASS OSACT-12: maker/checker endorsement applies to offsite exactly as to onsite';
END $$;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = :'SUPERVISOR';
DO $$
DECLARE c jsonb;
BEGIN
  c := public.supervisory_intervention_execution_capabilities((SELECT v FROM os WHERE k='iv'));
  IF (c->>'can_open_examination')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL OSACT-12: the server does not permit execution of the endorsed offsite intervention (%)',
      c->>'block_reason'; END IF;
  IF c->>'default_engagement_type' <> 'OFFSITE_REVIEW' THEN
    RAISE EXCEPTION 'FAIL OSACT-12: the capability contract does not default this intervention to an offsite engagement'; END IF;
  RAISE NOTICE 'PASS OSACT-12b: the server tells the screen what may be opened, and with which engagement';
END $$;

-- =====================================================================
-- OSACT-13 — execution creates ONE canonical examination, engagement OFFSITE_REVIEW
-- =====================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = :'SUPERVISOR';
DO $$
DECLARE r jsonb; ex uuid;
BEGIN
  r := public.supervisory_examination_open((SELECT v FROM os WHERE k='iv'),
        'Offsite review of AML/CFT controls', 'OFFSITE_REVIEW',
        'AML_CFT', (SELECT v FROM os WHERE k='entity'),
        ARRAY[(SELECT v FROM os WHERE k='assessment')],
        ARRAY[(SELECT v FROM os WHERE k='dimension')],
        NULL, NULL, 'd1016d5f-cde5-46dd-a552-0f2f87abc193');
  ex := (r->>'id')::uuid;
  INSERT INTO os(k,v) VALUES ('ex', ex);
END $$;

RESET ROLE;
DO $$
DECLARE ex uuid := (SELECT v FROM os WHERE k='ex'); n bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.examinations
                  WHERE id = ex AND engagement_type = 'OFFSITE_REVIEW'
                    AND domain_code = 'AML_CFT'
                    AND intervention_id = (SELECT v FROM os WHERE k='iv')
                    AND plan_id = (SELECT v FROM os WHERE k='plan')) THEN
    RAISE EXCEPTION 'FAIL OSACT-13: offsite execution did not produce a canonical examination with provenance'; END IF;
  SELECT count(*) INTO n FROM public.examinations;
  IF n <> (SELECT b.n FROM osn b WHERE b.k='examinations') + 1 THEN
    RAISE EXCEPTION 'FAIL OSACT-13: expected exactly one new examination row, found % new',
      n - (SELECT b.n FROM osn b WHERE b.k='examinations'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.examination_origin
                  WHERE examination_id = ex AND assessment_id = (SELECT v FROM os WHERE k='assessment')) THEN
    RAISE EXCEPTION 'FAIL OSACT-13: the offsite examination does not trace to its originating assessment'; END IF;
  RAISE NOTICE 'PASS OSACT-13: offsite review executes as ONE canonical examination object';
END $$;

-- =====================================================================
-- OSACT-14 — display aliases are rejected at the server boundary
-- =====================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = :'SUPERVISOR';
DO $$
DECLARE alias text; ok boolean;
BEGIN
  FOREACH alias IN ARRAY ARRAY['offsite_review','targeted','Offsite Review','OFFSITE'] LOOP
    ok := false;
    BEGIN
      PERFORM public.supervisory_examination_open((SELECT v FROM os WHERE k='iv'),
        'Alias probe', alias, 'AML_CFT', (SELECT v FROM os WHERE k='entity'));
    EXCEPTION WHEN OTHERS THEN ok := true;
    END;
    IF NOT ok THEN RAISE EXCEPTION 'FAIL OSACT-14: alias % was accepted as an engagement type', alias; END IF;
  END LOOP;
  RAISE NOTICE 'PASS OSACT-14: presentation wording can never be persisted as engagement vocabulary';
END $$;

-- =====================================================================
-- OSACT-15 — a lightweight activity cannot be dressed up as an engagement
-- =====================================================================
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    PERFORM public.supervisory_examination_open((SELECT v FROM os WHERE k='iv'),
      'Desk review probe', 'DESK_REVIEW', 'AML_CFT', (SELECT v FROM os WHERE k='entity'));
  EXCEPTION WHEN OTHERS THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL OSACT-15: DESK_REVIEW was accepted as an examination engagement'; END IF;
  RAISE NOTICE 'PASS OSACT-15: desk review stays outside the examination lifecycle';
END $$;

-- =====================================================================
-- OSACT-16 — the offsite engagement reuses the shared workspace objects
-- =====================================================================
SET LOCAL "request.jwt.claims" = :'EXAMINER';
DO $$
DECLARE ex uuid := (SELECT v FROM os WHERE k='ex'); dr uuid; wp uuid;
BEGIN
  PERFORM public.examination_scope_from_assessment(ex,
    ARRAY[(SELECT v FROM os WHERE k='dimension')],
    'Scope derived from the approved AML/CFT assessment dimension.');
  PERFORM public.examination_transition_stage(ex, 'scoping', 'Scoping the offsite review.');
  PERFORM public.examination_team_member_add(ex, auth.uid(), 'lead_examiner', 5,
    'AML/CFT offsite review', false);
  INSERT INTO public.examination_scoping(examination_id, objectives, risk_focus_areas, legal_basis,
      methodology, budget_days, prepared_by, prepared_at, assessment_dimension_id)
  VALUES (ex, 'Review the documented AML/CFT control environment offsite.',
      ARRAY['AML_CFT_CONTROLS'], 'AML/CFT Regulations — supervisory review powers',
      'Documentary review of policies, MI and monitoring output.', 5,
      auth.uid(), now(), (SELECT v FROM os WHERE k='dimension'));

  INSERT INTO public.examination_data_requests(examination_id, item_no, title, description,
      due_date, status, requested_by)
  VALUES (ex, 1, 'AML/CFT policy and monitoring MI',
      'Provide the current AML/CFT policy set and the last four quarters of monitoring MI.',
      current_date + 10, 'ISSUED', auth.uid())
  RETURNING id INTO dr;
  INSERT INTO os(k,v) VALUES ('dr', dr);

  INSERT INTO public.examination_workpapers(examination_id, reference, area, procedure_performed,
      evidence_reference, conclusion, status, prepared_by, prepared_at)
  VALUES (ex, 'WP-OSR-01', 'AML_CFT_CONTROLS',
      'Reviewed the policy set and four quarters of monitoring MI against the approved assessment.',
      'DR-1 policy pack; MI packs Q1-Q4',
      'Policy has not been refreshed since the last assessment and MI omits alert ageing.',
      'SUBMITTED', auth.uid(), now())
  RETURNING id INTO wp;
  INSERT INTO os(k,v) VALUES ('wp', wp);
END $$;

RESET ROLE;
DO $$
DECLARE ex uuid := (SELECT v FROM os WHERE k='ex');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.examination_scope_dimension
                  WHERE examination_id = ex
                    AND assessment_dimension_id = (SELECT v FROM os WHERE k='dimension')) THEN
    RAISE EXCEPTION 'FAIL OSACT-16: assessment scope is not physically linked to the offsite engagement'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.examination_scoping WHERE examination_id = ex) THEN
    RAISE EXCEPTION 'FAIL OSACT-16: the shared scoping object is not usable offsite'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.examination_team_members WHERE examination_id = ex
                  AND role = 'lead_examiner') THEN
    RAISE EXCEPTION 'FAIL OSACT-16: the shared team object is not usable offsite'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.examination_data_requests WHERE id = (SELECT v FROM os WHERE k='dr')) THEN
    RAISE EXCEPTION 'FAIL OSACT-16: the shared information-request object is not usable offsite'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.examination_workpapers WHERE id = (SELECT v FROM os WHERE k='wp')) THEN
    RAISE EXCEPTION 'FAIL OSACT-16: the shared workpaper object is not usable offsite'; END IF;
  RAISE NOTICE 'PASS OSACT-16: scope, team, information requests and workpapers are shared, not forked';
END $$;

-- =====================================================================
-- OSACT-17 — the canonical stage machine and audit trail apply offsite
-- =====================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = :'EXAMINER';
DO $$
DECLARE ex uuid := (SELECT v FROM os WHERE k='ex'); ok boolean := false;
BEGIN
  PERFORM public.examination_transition_stage(ex, 'pre_exam_request', 'Information request issued to the entity.');
  PERFORM public.examination_transition_stage(ex, 'fieldwork', 'Offsite review work commenced.');
  BEGIN
    PERFORM public.examination_transition_stage(ex, 'closed', 'Attempting to skip the lifecycle.');
  EXCEPTION WHEN OTHERS THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL OSACT-17: the stage machine allowed an offsite engagement to skip stages'; END IF;
END $$;

RESET ROLE;
DO $$
DECLARE ex uuid := (SELECT v FROM os WHERE k='ex'); n int;
BEGIN
  IF (SELECT stage FROM public.examinations WHERE id = ex) <> 'fieldwork' THEN
    RAISE EXCEPTION 'FAIL OSACT-17: the offsite engagement is not at the expected lifecycle stage'; END IF;
  SELECT count(*) INTO n FROM public.examination_events WHERE examination_id = ex;
  IF n < 3 THEN RAISE EXCEPTION 'FAIL OSACT-17: offsite lifecycle changes were not audited (% events)', n; END IF;
  RAISE NOTICE 'PASS OSACT-17: one stage machine, one audit trail, for onsite and offsite alike';
END $$;

-- =====================================================================
-- OSACT-18 — offsite findings enter the canonical finding chain
-- =====================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = :'OFFICER';
DO $$
DECLARE fid uuid;
BEGIN
  fid := public.supervisory_finding_create(jsonb_build_object(
    'entity_id', (SELECT v FROM os WHERE k='entity'),
    'domain_code','AML_CFT','severity','MEDIUM',
    'finding_category','AML_CFT_CONTROLS',
    'title','AML/CFT policy set not refreshed and monitoring MI incomplete',
    'observation','Policy unchanged since the last assessment; MI omits alert ageing.',
    'root_cause','No periodic policy review cycle and incomplete MI specification.',
    'risk_impact','Supervisory blind spot over monitoring effectiveness.',
    'regulatory_criterion','AML/CFT Regulations — policies, controls and management information',
    'required_action','Refresh the policy set and extend MI to include alert ageing.',
    'assessment_id', (SELECT v FROM os WHERE k='assessment'),
    'assessment_dimension_id', (SELECT v FROM os WHERE k='dimension'),
    'attention_id', (SELECT v FROM os WHERE k='att'),
    'plan_id', (SELECT v FROM os WHERE k='plan'),
    'intervention_id', (SELECT v FROM os WHERE k='iv'),
    'examination_id', (SELECT v FROM os WHERE k='ex'),
    'workpaper_id', (SELECT v FROM os WHERE k='wp'),
    'confidentiality','CONFIDENTIAL',
    'due_date', (current_date + 30)::text));
  INSERT INTO os(k,v) VALUES ('f1', fid);
END $$;

RESET ROLE;
DO $$
DECLARE f public.supervisory_finding;
BEGIN
  SELECT * INTO f FROM public.supervisory_finding WHERE id = (SELECT v FROM os WHERE k='f1');
  IF f.examination_id IS DISTINCT FROM (SELECT v FROM os WHERE k='ex')
     OR f.assessment_id IS NULL OR f.intervention_id IS NULL OR f.workpaper_id IS NULL THEN
    RAISE EXCEPTION 'FAIL OSACT-18: an offsite finding lost its provenance chain'; END IF;
  RAISE NOTICE 'PASS OSACT-18: offsite findings are canonical findings with full provenance';
END $$;

-- =====================================================================
-- OSACT-19 — authorisation is unchanged by the engagement type
-- =====================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = :'OUTSIDER';
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    PERFORM public.supervisory_examination_open((SELECT v FROM os WHERE k='iv'),
      'Unauthorised offsite review', 'OFFSITE_REVIEW', 'AML_CFT', (SELECT v FROM os WHERE k='entity'));
  EXCEPTION WHEN OTHERS THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL OSACT-19: an unauthorised user opened an offsite engagement'; END IF;
  RAISE NOTICE 'PASS OSACT-19: offsite execution enforces the same permission and scope rules as onsite';
END $$;

-- =====================================================================
-- OSACT-20 — closing census: additive only, nothing else moved
-- =====================================================================
RESET ROLE;
DO $$
DECLARE d bigint;
BEGIN
  SELECT count(*) - (SELECT b.n FROM osn b WHERE b.k='examinations') INTO d FROM public.examinations;
  IF d <> 1 THEN RAISE EXCEPTION 'FAIL OSACT-20: % examinations created, expected exactly 1', d; END IF;
  SELECT count(*) - (SELECT b.n FROM osn b WHERE b.k='findings') INTO d FROM public.supervisory_finding;
  IF d <> 1 THEN RAISE EXCEPTION 'FAIL OSACT-20: % findings created, expected exactly 1', d; END IF;
  IF EXISTS (SELECT 1 FROM public.examinations
              WHERE engagement_type IS NULL OR engagement_type <> upper(engagement_type)) THEN
    RAISE EXCEPTION 'FAIL OSACT-20: an examination carries a missing or non-canonical engagement type'; END IF;
  RAISE NOTICE 'PASS OSACT-20: the wave is additive — one offsite engagement, one finding, no other movement';
END $$;

ROLLBACK;
