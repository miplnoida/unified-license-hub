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

-- production state BEFORE anything is touched (compared again after ROLLBACK)
SELECT count(*) AS ex_before,
       count(*) FILTER (WHERE engagement_type = 'OFFSITE_REVIEW') AS offsite_before
  FROM public.examinations \gset
SELECT count(*) AS esa_before FROM public.entity_supervision_assignments \gset
SELECT count(*) AS find_before FROM public.supervisory_finding \gset
SELECT count(*) AS ra_before FROM public.supervisory_remediation_action \gset

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
DECLARE alias text; ok boolean; eng text;
BEGIN
  FOREACH alias IN ARRAY ARRAY['targeted','full_scope','follow_up','thematic',
                               'Offsite Review','OFFSITE','offsite-review','onsite'] LOOP
    ok := false;
    BEGIN
      PERFORM public.supervisory_examination_open((SELECT v FROM os WHERE k='iv'),
        'Alias probe', alias, 'AML_CFT', (SELECT v FROM os WHERE k='entity'));
    EXCEPTION WHEN OTHERS THEN ok := (SQLERRM LIKE '%engagement_type%');
    END;
    IF NOT ok THEN RAISE EXCEPTION 'FAIL OSACT-14: alias % was accepted as an engagement type', alias; END IF;
  END LOOP;

  RAISE NOTICE 'PASS OSACT-14: presentation wording can never be persisted as engagement vocabulary';
END $$;

-- casing is normalised to the canonical value, never stored as typed
DO $$
DECLARE ex uuid;
BEGIN
  ex := (public.supervisory_examination_open((SELECT v FROM os WHERE k='iv'),
           'Case normalisation probe', ' offsite_review ', 'AML_CFT',
           (SELECT v FROM os WHERE k='entity'))->>'id')::uuid;
  INSERT INTO os(k,v) VALUES ('probe', ex);
  IF (SELECT engagement_type FROM public.examinations WHERE id = ex) <> 'OFFSITE_REVIEW' THEN
    RAISE EXCEPTION 'FAIL OSACT-14: typed casing was persisted instead of the canonical value'; END IF;
  RAISE NOTICE 'PASS OSACT-14b: casing is normalised server-side to the canonical engagement value';
END $$;

RESET ROLE;
UPDATE public.supervisory_intervention SET examination_id = (SELECT v FROM os WHERE k='ex')
 WHERE examination_id = (SELECT v FROM os WHERE k='probe');
DELETE FROM public.examination_events WHERE examination_id = (SELECT v FROM os WHERE k='probe');
DELETE FROM public.examination_origin WHERE examination_id = (SELECT v FROM os WHERE k='probe');
DELETE FROM public.examinations WHERE id = (SELECT v FROM os WHERE k='probe');
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = :'SUPERVISOR';

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
-- OSACT-21 — authorised offsite examiner fixture (transactional only)
-- =====================================================================
-- The certification examiner already holds the AML/CFT examine permission but
-- is not assigned to the demo entity, so the server refuses offsite work on it.
-- Rather than weaken the guard or borrow Super Admin, we grant the examiner a
-- REAL canonical supervision assignment for the AML/CFT regulatory function on
-- the transactional test entity. It is created inside this transaction and
-- rolled back with everything else; no production role or assignment changes.
RESET ROLE;
DO $$
DECLARE uid uuid := 'd1016d5f-cde5-46dd-a552-0f2f87abc193';
        ent uuid := (SELECT v FROM os WHERE k='entity');
        fn  uuid := (SELECT id FROM public.regulatory_functions WHERE key = 'aml_cft');
        aid uuid; ex record;
BEGIN
  IF public.is_super_admin(uid) THEN
    RAISE EXCEPTION 'FAIL OSACT-21: the examiner fixture must not be a Super Administrator'; END IF;
  IF NOT public.has_permission(uid, 'aml_supervision', 'examine') THEN
    RAISE EXCEPTION 'FAIL OSACT-21: the examiner fixture does not hold the real examination permission'; END IF;
  IF public.user_has_entity_assignment(uid, ent) THEN
    RAISE EXCEPTION 'FAIL OSACT-21: the examiner was already in scope — the fixture proves nothing'; END IF;
  IF fn IS NULL THEN RAISE EXCEPTION 'FAIL OSACT-21: no AML/CFT regulatory function is configured'; END IF;

  -- AML/CFT supervision authority, and the examination function through which
  -- the examination team itself is administered. Both are function-specific.
  FOR ex IN
    SELECT id, key FROM public.regulatory_functions WHERE key IN ('aml_cft','inspection')
  LOOP
    INSERT INTO public.entity_supervision_assignments(
        entity_id, regulator_id, regulatory_function_id, lead_supervisor_user_id,
        status, is_primary, assignment_reason, effective_from)
    VALUES (ent,
        NULLIF(public.entity_regulatory_scope(ent)->>'regulator_id','')::uuid,
        ex.id, uid, 'active', false,
        'OS-01B transactional test authority for offsite shared-engine certification', now())
    RETURNING id INTO aid;
    IF ex.key = 'aml_cft' THEN INSERT INTO os(k,v) VALUES ('assignment', aid); END IF;
  END LOOP;

  IF NOT public.user_has_entity_assignment(uid, ent, fn) THEN
    RAISE EXCEPTION 'FAIL OSACT-21: the assignment fixture did not put the entity in scope'; END IF;
  IF public.user_has_entity_assignment(
       uid, ent, (SELECT id FROM public.regulatory_functions WHERE key='market_conduct')) THEN
    RAISE EXCEPTION 'FAIL OSACT-21: the AML/CFT assignment leaked authority into another function'; END IF;
  RAISE NOTICE 'PASS OSACT-21: an authorised, regulator/entity-scoped examiner exists for the test entity only';
END $$;

-- =====================================================================
-- OSACT-16/17/22..26 — the offsite engagement is positively executed
--                      through the shared examination engine
-- =====================================================================
-- Every step below is the SAME governed operation an onsite examination uses.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = :'EXAMINER';

-- OSACT-22 scope from the originating assessment
DO $$
DECLARE ex uuid := (SELECT v FROM os WHERE k='ex');
BEGIN
  PERFORM public.examination_scope_from_assessment(ex,
    ARRAY[(SELECT v FROM os WHERE k='dimension')],
    'Scope derived from the approved AML/CFT assessment dimension.');
END $$;

-- OSACT-23 team, through the canonical team mechanism
DO $$
DECLARE ex uuid := (SELECT v FROM os WHERE k='ex'); m uuid;
BEGIN
  PERFORM public.examination_transition_stage(ex, 'scoping', 'Scoping the offsite review.');
  m := (public.examination_team_member_add(ex, auth.uid(), 'lead_examiner', 5,
          'AML/CFT offsite review', false)->>'id')::uuid;
  INSERT INTO os(k,v) VALUES ('team_member', m);
END $$;

-- the scoping memo is the shared prerequisite for review work, offsite included
DO $$
DECLARE ex uuid := (SELECT v FROM os WHERE k='ex');
BEGIN
  INSERT INTO public.examination_scoping(examination_id, objectives, risk_focus_areas, legal_basis,
      methodology, budget_days, prepared_by, prepared_at, assessment_dimension_id,
      approved_by, approved_at)
  VALUES (ex, 'Review the documented AML/CFT control environment offsite.',
      ARRAY['AML_CFT_CONTROLS'], 'AML/CFT Regulations — supervisory review powers',
      'Documentary review of policies, MI and monitoring output.', 5,
      auth.uid(), now(), (SELECT v FROM os WHERE k='dimension'), auth.uid(), now());
END $$;

-- OSACT-24 information request, through the canonical request RPC
DO $$
DECLARE dr uuid;
BEGIN
  dr := public.examination_data_request_save(jsonb_build_object(
    'examination_id', (SELECT v FROM os WHERE k='ex'),
    'title','AML/CFT policy set and monitoring MI',
    'description','Provide the current AML/CFT policy set and the last four quarters of monitoring MI.',
    'data_format','PDF and spreadsheet',
    'requested_from','Compliance Officer',
    'priority','HIGH',
    'assessment_dimension_id', (SELECT v FROM os WHERE k='dimension'),
    'due_date', (current_date + 10)::text));
  INSERT INTO os(k,v) VALUES ('dr', dr);
  PERFORM public.examination_data_request_issue(dr);
END $$;

-- OSACT-25 workpaper, through the canonical workpaper RPC and review state
DO $$
DECLARE wp uuid;
BEGIN
  wp := public.examination_workpaper_save(jsonb_build_object(
    'examination_id', (SELECT v FROM os WHERE k='ex'),
    'area','AML_CFT_CONTROLS',
    'objective','Determine whether the documented AML/CFT control environment remains effective.',
    'procedure_performed','Reviewed the policy set and four quarters of monitoring MI against the approved assessment.',
    'evidence_reference','RFI-001 policy pack; MI packs Q1-Q4',
    'conclusion','Policy has not been refreshed since the last assessment and MI omits alert ageing.',
    'control_assessment','NEEDS_IMPROVEMENT',
    'assessment_dimension_id', (SELECT v FROM os WHERE k='dimension')));
  INSERT INTO os(k,v) VALUES ('wp', wp);
  PERFORM public.examination_workpaper_submit_review(wp);
END $$;

-- OSACT-26 the shared stage machine, prerequisites satisfied not bypassed
DO $$
DECLARE ex uuid := (SELECT v FROM os WHERE k='ex');
BEGIN
  PERFORM public.examination_transition_stage(ex, 'pre_exam_request', 'Information request issued.');
  PERFORM public.examination_transition_stage(ex, 'fieldwork', 'Offsite review work commenced.');
END $$;

RESET ROLE;
DO $$
DECLARE ex uuid := (SELECT v FROM os WHERE k='ex'); sd record; r record; w record; n int;
BEGIN
  -- OSACT-22: exact assessment, exact dimension, stored on this examination
  SELECT * INTO sd FROM public.examination_scope_dimension WHERE examination_id = ex;
  IF sd.id IS NULL
     OR sd.assessment_id IS DISTINCT FROM (SELECT v FROM os WHERE k='assessment')
     OR sd.assessment_dimension_id IS DISTINCT FROM (SELECT v FROM os WHERE k='dimension') THEN
    RAISE EXCEPTION 'FAIL OSACT-22: offsite scope does not carry exact assessment provenance'; END IF;
  IF coalesce(btrim(sd.rationale),'') = '' THEN
    RAISE EXCEPTION 'FAIL OSACT-22: offsite scope was recorded without a rationale'; END IF;
  RAISE NOTICE 'PASS OSACT-22: scope-from-assessment succeeds offsite with exact provenance and no questionnaire copy';

  -- OSACT-23: same team storage, lead examiner rule satisfied
  IF NOT EXISTS (SELECT 1 FROM public.examination_team_members
                  WHERE examination_id = ex AND team_role = 'lead_examiner'
                    AND id = (SELECT v FROM os WHERE k='team_member')) THEN
    RAISE EXCEPTION 'FAIL OSACT-23: the offsite team was not recorded in examination_team_members'; END IF;
  RAISE NOTICE 'PASS OSACT-23: team assignment uses the canonical examination team, lead examiner rules apply';

  -- OSACT-24: same request storage and lifecycle
  SELECT * INTO r FROM public.examination_data_requests WHERE id = (SELECT v FROM os WHERE k='dr');
  IF r.examination_id IS DISTINCT FROM ex THEN
    RAISE EXCEPTION 'FAIL OSACT-24: the offsite information request is not attached to this examination'; END IF;
  IF upper(r.status) NOT IN ('ISSUED','SENT') THEN
    RAISE EXCEPTION 'FAIL OSACT-24: the request did not follow the normal lifecycle (status %)', r.status; END IF;
  IF r.reference IS NULL THEN
    RAISE EXCEPTION 'FAIL OSACT-24: the request did not receive a canonical reference'; END IF;
  RAISE NOTICE 'PASS OSACT-24: information requests use the canonical examination request engine (%)', r.reference;

  -- OSACT-25: same workpaper table, same review state machine
  SELECT * INTO w FROM public.examination_workpapers WHERE id = (SELECT v FROM os WHERE k='wp');
  IF w.examination_id IS DISTINCT FROM ex OR w.status <> 'in_review' OR w.submitted_at IS NULL THEN
    RAISE EXCEPTION 'FAIL OSACT-25: the offsite workpaper did not enter the shared review state'; END IF;
  IF w.assessment_dimension_id IS NULL OR w.assessment_id IS NULL THEN
    RAISE EXCEPTION 'FAIL OSACT-25: the offsite workpaper lost its assessment linkage'; END IF;
  RAISE NOTICE 'PASS OSACT-25: workpapers use the canonical workpaper engine and review state (%)', w.reference;

  -- OSACT-26 / OSACT-17: one stage machine, fully audited
  IF (SELECT stage FROM public.examinations WHERE id = ex) <> 'fieldwork' THEN
    RAISE EXCEPTION 'FAIL OSACT-26: the offsite engagement did not progress through the shared stage machine'; END IF;
  SELECT count(*) INTO n FROM public.examination_events
   WHERE examination_id = ex AND event_type = 'stage_change';
  IF n < 3 THEN
    RAISE EXCEPTION 'FAIL OSACT-26: offsite stage changes were not audited (% events)', n; END IF;
  RAISE NOTICE 'PASS OSACT-26: OFFSITE_REVIEW uses the same stage machine and prerequisites as onsite work';

  -- OSACT-16/17 conclusion, now positively exercised rather than boundary-only
  IF NOT (EXISTS (SELECT 1 FROM public.examination_scoping WHERE examination_id = ex)
      AND EXISTS (SELECT 1 FROM public.examination_scope_dimension WHERE examination_id = ex)
      AND EXISTS (SELECT 1 FROM public.examination_team_members WHERE examination_id = ex)
      AND EXISTS (SELECT 1 FROM public.examination_data_requests WHERE examination_id = ex)
      AND EXISTS (SELECT 1 FROM public.examination_workpapers WHERE examination_id = ex)) THEN
    RAISE EXCEPTION 'FAIL OSACT-16: the shared workspace objects were not all exercised offsite'; END IF;
  RAISE NOTICE 'PASS OSACT-16/17: scope, team, requests and workpapers are shared; one stage machine, one audit trail';
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
     OR f.assessment_id IS NULL OR f.intervention_id IS NULL OR f.plan_id IS NULL THEN
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

-- =====================================================================
-- OSACT-27 — the offsite finding is a canonical finding, issued canonically
-- =====================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = :'SUPERVISOR';
DO $$
BEGIN
  PERFORM public.supervisory_finding_lifecycle((SELECT v FROM os WHERE k='f1'), 'REVIEW',
    'Offsite review workpaper conclusion reviewed for issue.');
  PERFORM public.supervisory_finding_lifecycle((SELECT v FROM os WHERE k='f1'), 'ISSUED',
    'Issued to the entity following the offsite review of AML/CFT controls.');
END $$;

RESET ROLE;
DO $$
DECLARE f public.supervisory_finding;
BEGIN
  SELECT * INTO f FROM public.supervisory_finding WHERE id = (SELECT v FROM os WHERE k='f1');
  IF f.status <> 'ISSUED' OR f.issued_by IS NULL THEN
    RAISE EXCEPTION 'FAIL OSACT-27: the offsite finding did not pass through the canonical issue path'; END IF;
  IF f.examination_id IS DISTINCT FROM (SELECT v FROM os WHERE k='ex')
     OR f.intervention_id IS DISTINCT FROM (SELECT v FROM os WHERE k='iv')
     OR f.assessment_id IS DISTINCT FROM (SELECT v FROM os WHERE k='assessment')
     OR f.plan_id IS DISTINCT FROM (SELECT v FROM os WHERE k='plan') THEN
    RAISE EXCEPTION 'FAIL OSACT-27: offsite finding provenance is incomplete'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_finding_event
                  WHERE finding_id = f.id AND event_type = 'ISSUE') THEN
    RAISE EXCEPTION 'FAIL OSACT-27: the finding issue was not recorded in the canonical event history'; END IF;
  RAISE NOTICE 'PASS OSACT-27: finding creation and issue offsite use the canonical finding engine (%)', f.reference;
END $$;

-- =====================================================================
-- OSACT-28 — remediation is the canonical remediation model, no offsite variant
-- =====================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = :'OFFICER';
DO $$
DECLARE aid uuid;
BEGIN
  aid := public.supervisory_remediation_open((SELECT v FROM os WHERE k='f1'),
    'Refresh the AML/CFT policy set and extend monitoring MI to include alert ageing.',
    'A board-approved policy set and MI that evidences alert ageing.',
    NULL, 'Compliance Officer', current_date + 60);
  INSERT INTO os(k,v) VALUES ('ra', aid);
END $$;

RESET ROLE;
DO $$
DECLARE a public.supervisory_remediation_action; f public.supervisory_finding;
BEGIN
  SELECT * INTO a FROM public.supervisory_remediation_action WHERE id = (SELECT v FROM os WHERE k='ra');
  SELECT * INTO f FROM public.supervisory_finding WHERE id = (SELECT v FROM os WHERE k='f1');
  IF a.id IS NULL OR a.finding_id IS DISTINCT FROM f.id OR a.status <> 'OPEN' THEN
    RAISE EXCEPTION 'FAIL OSACT-28: the offsite corrective action is not on the canonical remediation model'; END IF;
  IF a.entity_id IS DISTINCT FROM f.entity_id OR a.domain_code IS DISTINCT FROM f.domain_code THEN
    RAISE EXCEPTION 'FAIL OSACT-28: the corrective action lost its entity or domain context'; END IF;
  IF f.status <> 'REMEDIATION_REQUIRED' THEN
    RAISE EXCEPTION 'FAIL OSACT-28: the canonical finding lifecycle did not react to the corrective action'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_remediation_event WHERE action_id = a.id) THEN
    RAISE EXCEPTION 'FAIL OSACT-28: the corrective action has no canonical event history'; END IF;
  RAISE NOTICE 'PASS OSACT-28: remediation reuses the canonical model and lifecycle (%)', a.reference;
END $$;

-- =====================================================================
-- OSACT-29 — no offsite-specific persistence exists anywhere
-- =====================================================================
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO bad
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r','v','m','p','f')
     AND (c.relname ~* 'offsite' OR c.relname ~* 'off_site' OR c.relname ~* 'desk_review');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL OSACT-29: offsite-specific persistence exists: %', bad; END IF;

  SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND (p.proname ~* 'offsite_(review|examination|finding|remediation|workpaper|request|scope|assessment)'
          OR p.proname ~* 'off_site');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL OSACT-29: a parallel offsite engine exists: %', bad; END IF;

  -- every artefact produced above lives on the canonical examination row
  IF (SELECT count(*) FROM public.examinations WHERE id = (SELECT v FROM os WHERE k='ex')) <> 1 THEN
    RAISE EXCEPTION 'FAIL OSACT-29: the offsite review is not exactly one canonical examination row'; END IF;
  RAISE NOTICE 'PASS OSACT-29: zero offsite tables, views, read models or engines — one canonical examination';
END $$;

ROLLBACK;

-- =====================================================================
-- OSACT-30 — every fixture and every business row is gone
-- =====================================================================
SELECT count(*) AS ex_after,
       count(*) FILTER (WHERE engagement_type = 'OFFSITE_REVIEW') AS offsite_after
  FROM public.examinations \gset
SELECT count(*) AS esa_after FROM public.entity_supervision_assignments \gset
SELECT count(*) AS find_after FROM public.supervisory_finding \gset
SELECT count(*) AS ra_after FROM public.supervisory_remediation_action \gset
SELECT CASE
         WHEN :ex_after <> :ex_before OR :offsite_after <> :offsite_before
           THEN 'FAIL OSACT-30: examinations changed'
         WHEN :esa_after <> :esa_before
           THEN 'FAIL OSACT-30: a test supervision assignment survived'
         WHEN :find_after <> :find_before OR :ra_after <> :ra_before
           THEN 'FAIL OSACT-30: test findings or corrective actions survived'
         ELSE 'PASS OSACT-30: all authority fixtures and all business rows rolled back — production state unchanged'
       END AS "OSACT-30";

SELECT :ex_after AS examinations, :offsite_after AS offsite_reviews,
       :esa_after AS supervision_assignments, :find_after AS findings,
       :ra_after AS corrective_actions;
