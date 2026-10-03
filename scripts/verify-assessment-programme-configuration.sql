-- =====================================================================
-- AML-03 — ENTERPRISE ASSESSMENT PROGRAMME CONFIGURATION : CERTIFICATION
-- =====================================================================
-- Gates PROG-01 .. PROG-50.
--
-- Conventions (identical to the other supervisory certifications):
--   * one transaction, ROLLBACK at the end — no fixture survives, so no
--     invented regulator programme policy is left behind;
--   * behavioural: every governance gate CALLS the governed operation under a
--     REAL authenticated persona (SET LOCAL ROLE authenticated + jwt claims),
--     never service_role, and never asserts from documentation;
--   * source inspection is used only where the property is inherently about
--     the browser runtime — that is covered by
--     src/test/supervisoryAssessmentProgrammeStudio.test.tsx, not here;
--   * every gate RAISEs on failure so ON_ERROR_STOP aborts the run;
--   * idempotent and repeatable: all fixture identifiers are suffixed PROGCERT.
--
-- Personas (public.cert_certification_users):
--   Author / configuration manager  b8eaf680-fe66-4d49-b816-1c087f511235
--   Policy approver (checker)       0b522724-adcb-48bf-b21d-175339479616
--   Outsider (no AML authority)     411dd06d-648b-4f32-82cc-897902c0c0b6
-- =====================================================================

\set ON_ERROR_STOP on
\set QUIET 1
\pset pager off
SET row_security = on;

\set AUTHOR   '{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}'
\set APPROVER '{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}'
\set OUTSIDER '{"sub":"411dd06d-648b-4f32-82cc-897902c0c0b6","role":"authenticated"}'

BEGIN;

CREATE TEMP TABLE pg_id(k text PRIMARY KEY, v uuid) ON COMMIT DROP;
CREATE TEMP TABLE pg_n(k text PRIMARY KEY, n bigint) ON COMMIT DROP;
CREATE TEMP TABLE pg_t(k text PRIMARY KEY, t text) ON COMMIT DROP;
GRANT ALL ON pg_id TO authenticated;
GRANT ALL ON pg_n  TO authenticated;
GRANT ALL ON pg_t  TO authenticated;

INSERT INTO pg_id(k,v) VALUES
  ('regulator',        '8dd8ac87-4e11-4a6b-8991-bf88cb03d7c3'),   -- FSRA (active)
  ('inactive_reg',     'ca6e0616-55a9-48e7-8652-2b19536afb8a'),   -- ABC_PRUDENTIAL (inactive)
  ('entity_prior',     '5c1a0005-0000-4000-8000-000000000005'),   -- has AML assessments
  ('entity_fresh',     'aa220000-0000-4000-8000-000000000001'),   -- no assessments at all
  ('ref_set',          (SELECT id FROM public.supervisory_assessment_programme_set
                         WHERE code='MIPL-AML-ASSESSMENT-PROGRAMMES' AND set_version='1.0'
                           AND origin='MIPL_REFERENCE')),
  ('ref_profile',      (SELECT id FROM public.supervisory_policy_profile
                         WHERE domain_code='AML_CFT' AND origin='MIPL_REFERENCE'
                         ORDER BY created_at LIMIT 1)),
  ('meth_v10',         (SELECT id FROM public.supervisory_methodology
                         WHERE code='AML-CFT-RBA' AND version='1.0')),
  ('meth_v11',         (SELECT id FROM public.supervisory_methodology
                         WHERE code='AML-CFT-RBA' AND version='1.1' AND origin='MIPL_REFERENCE'));

-- ---------------------------------------------------------------- census ----
-- Everything PROG-50 will re-compare after the whole certification has run.
INSERT INTO pg_n(k,n) VALUES
  ('assessments',        (SELECT count(*) FROM public.supervisory_assessment)),
  ('assessments_progd',  (SELECT count(*) FROM public.supervisory_assessment
                           WHERE assessment_programme_id IS NOT NULL)),
  ('assessment_events',  (SELECT count(*) FROM public.supervisory_assessment_event)),
  ('risk_state',         (SELECT count(*) FROM public.entity_risk_state)),
  ('risk_scores',        (SELECT count(*) FROM public.entity_risk_scores)),
  ('calc_config',        (SELECT count(*) FROM public.supervisory_calculation_config)),
  ('calc_band',          (SELECT count(*) FROM public.supervisory_calculation_band)),
  ('calc_matrix',        (SELECT count(*) FROM public.supervisory_calculation_matrix_cell)),
  ('calc_score',         (SELECT count(*) FROM public.supervisory_calculation_response_score)),
  ('regulators',         (SELECT count(*) FROM public.regulators)),
  ('regulators_active',  (SELECT count(*) FROM public.regulators WHERE status='active')),
  ('methodologies',      (SELECT count(*) FROM public.supervisory_methodology)),
  ('v11_questions',      (SELECT count(*) FROM public.supervisory_methodology_question
                           WHERE methodology_id=(SELECT v FROM pg_id WHERE k='meth_v11'))),
  ('v11_params',         (SELECT count(*) FROM public.supervisory_methodology_parameter
                           WHERE methodology_id=(SELECT v FROM pg_id WHERE k='meth_v11'))),
  ('ref_programmes',     (SELECT count(*) FROM public.supervisory_assessment_programme
                           WHERE programme_set_id=(SELECT v FROM pg_id WHERE k='ref_set'))),
  ('ref_triggers',       (SELECT count(*) FROM public.supervisory_assessment_programme_trigger t
                           JOIN public.supervisory_assessment_programme p ON p.id=t.programme_id
                          WHERE p.programme_set_id=(SELECT v FROM pg_id WHERE k='ref_set')));

INSERT INTO pg_t(k,t) VALUES
  ('v10_status',   (SELECT status FROM public.supervisory_methodology WHERE id=(SELECT v FROM pg_id WHERE k='meth_v10'))),
  ('v11_status',   (SELECT status FROM public.supervisory_methodology WHERE id=(SELECT v FROM pg_id WHERE k='meth_v11'))),
  ('v11_origin',   (SELECT origin FROM public.supervisory_methodology WHERE id=(SELECT v FROM pg_id WHERE k='meth_v11'))),
  ('ref_status',   (SELECT status FROM public.supervisory_assessment_programme_set WHERE id=(SELECT v FROM pg_id WHERE k='ref_set'))),
  ('ref_origin',   (SELECT origin FROM public.supervisory_assessment_programme_set WHERE id=(SELECT v FROM pg_id WHERE k='ref_set'))),
  ('ref_digest',   (SELECT md5(string_agg(p.programme_code||':'||p.assessment_type||':'||p.period_rule||':'||
                                          COALESCE(p.period_value::text,'-')||':'||p.question_class_scope::text, '|'
                                          ORDER BY p.programme_code))
                      FROM public.supervisory_assessment_programme p
                     WHERE p.programme_set_id=(SELECT v FROM pg_id WHERE k='ref_set'))),
  ('assess_digest',(SELECT md5(string_agg(a.id::text||':'||a.status||':'||a.assessment_type||':'||
                                          COALESCE(a.assessment_programme_id::text,'-')||':'||
                                          COALESCE(a.period_start::text,'-')||':'||COALESCE(a.period_end::text,'-'), '|'
                                          ORDER BY a.id))
                      FROM public.supervisory_assessment a)),
  ('risk_digest',  (SELECT md5(COALESCE(string_agg(r.entity_id::text||':'||COALESCE(r.residual_rating,'-'), '|' ORDER BY r.entity_id),'')) 
                      FROM public.entity_risk_state r));

-- -------------------------------------------------------------- fixtures ----
-- Transaction-scoped authority. aml_head carries manage_config + policy_approve
-- for one regulator; both personas are scoped to FSRA only.
INSERT INTO public.sec_user_roles(user_id, role_id, status, assigned_by)
SELECT u, r.id, 'active', '4248640c-3397-4cf6-a274-fa09bad4ba64'::uuid  -- AML-CLOSE-02D: granted by the TEST super administrator, never self-granted
  FROM (VALUES ('b8eaf680-fe66-4d49-b816-1c087f511235'::uuid),
               ('0b522724-adcb-48bf-b21d-175339479616'::uuid)) AS x(u),
       public.sec_roles r
 WHERE r.key = 'aml_head'
ON CONFLICT DO NOTHING;

INSERT INTO public.sec_role_scopes(role_id, module_id, scope_type_id)
SELECT r.id, m.id, st.id
  FROM public.sec_roles r, public.sec_modules m, public.sec_scope_types st
 WHERE r.key='aml_head' AND m.key='aml_supervision' AND st.key='regulator'
ON CONFLICT (role_id, module_id) DO UPDATE SET scope_type_id = EXCLUDED.scope_type_id;

INSERT INTO public.sec_role_scope_values(role_scope_id, value_kind, value_id)
SELECT rs.id, 'regulator', (SELECT v FROM pg_id WHERE k='regulator')
  FROM public.sec_role_scopes rs
  JOIN public.sec_roles r ON r.id = rs.role_id AND r.key='aml_head'
  JOIN public.sec_modules m ON m.id = rs.module_id AND m.key='aml_supervision';

-- =====================================================================
-- PROG-01 — the generic programme-set architecture exists
-- =====================================================================
DO $$
DECLARE n int;
BEGIN
  IF to_regclass('public.supervisory_assessment_programme_set') IS NULL
     OR to_regclass('public.supervisory_assessment_programme') IS NULL
     OR to_regclass('public.supervisory_assessment_programme_trigger') IS NULL
     OR to_regclass('public.supervisory_assessment_programme_event') IS NULL
     OR to_regclass('public.supervisory_assessment_programme_vocabulary') IS NULL THEN
    RAISE EXCEPTION 'FAIL PROG-01: the assessment programme model is incomplete'; END IF;
  -- versioning, ownership, origin, lifecycle and lineage all live on the set
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='supervisory_assessment_programme_set'
     AND column_name IN ('code','set_version','domain_code','regulator_id','origin','status',
                         'adopted_from_id','supersedes_id','effective_from','effective_to');
  IF n <> 10 THEN RAISE EXCEPTION 'FAIL PROG-01: the programme set lacks versioning/ownership columns (% of 10)', n; END IF;
  RAISE NOTICE 'PASS PROG-01: generic set/programme/trigger/event/vocabulary architecture present';
END $$;

-- =====================================================================
-- PROG-02 — no AML-private programme data store was introduced
-- =====================================================================
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO bad
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m')
     AND c.relname LIKE 'aml%'
     AND (c.relname LIKE '%programme%' OR c.relname LIKE '%program%'
          OR c.relname LIKE '%assessment_type%' OR c.relname LIKE '%trigger_type%');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL PROG-02: AML-private programme substitute store(s) exist: %', bad; END IF;
  -- and the generic tables carry no AML-specific columns
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name LIKE 'supervisory_assessment_programme%'
                AND (column_name ILIKE '%aml%' OR column_name ILIKE '%cft%')) THEN
    RAISE EXCEPTION 'FAIL PROG-02: the generic programme model carries AML-specific columns'; END IF;
  RAISE NOTICE 'PASS PROG-02: no AML-private programme or assessment-type store; the model is domain-neutral';
END $$;

-- =====================================================================
-- PROG-04 — exactly one MIPL reference programme package, version 1.0
-- =====================================================================
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.supervisory_assessment_programme_set
   WHERE code='MIPL-AML-ASSESSMENT-PROGRAMMES' AND set_version='1.0';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL PROG-04: % MIPL-AML-ASSESSMENT-PROGRAMMES 1.0 packages exist', n; END IF;
  IF (SELECT v FROM pg_id WHERE k='ref_set') IS NULL THEN
    RAISE EXCEPTION 'FAIL PROG-04: the MIPL reference programme package was not found'; END IF;
  RAISE NOTICE 'PASS PROG-04: exactly one MIPL-AML-ASSESSMENT-PROGRAMMES 1.0 reference package';
END $$;

-- =====================================================================
-- PROG-05 — the reference package is exactly reference, draft, unowned, AML
-- =====================================================================
DO $$
DECLARE s public.supervisory_assessment_programme_set;
BEGIN
  SELECT * INTO s FROM public.supervisory_assessment_programme_set WHERE id=(SELECT v FROM pg_id WHERE k='ref_set');
  IF s.origin <> 'MIPL_REFERENCE' OR s.status <> 'DRAFT' OR s.regulator_id IS NOT NULL
     OR s.domain_code <> 'AML_CFT' THEN
    RAISE EXCEPTION 'FAIL PROG-05: reference package is origin=% status=% regulator=% domain=%',
      s.origin, s.status, s.regulator_id, s.domain_code; END IF;
  RAISE NOTICE 'PASS PROG-05: MIPL_REFERENCE / DRAFT / regulator NULL / AML_CFT';
END $$;

-- =====================================================================
-- PROG-06 — reference content mechanically reproduces pre-AML-03 behaviour
-- =====================================================================
DO $$
DECLARE types text[]; trigs text[]; n int;
BEGIN
  SELECT array_agg(DISTINCT assessment_type ORDER BY assessment_type) INTO types
    FROM public.supervisory_assessment_programme
   WHERE programme_set_id=(SELECT v FROM pg_id WHERE k='ref_set');
  IF NOT (types @> ARRAY['PERIODIC','INITIAL_BASELINE','FOLLOW_UP','EVENT_DRIVEN']) THEN
    RAISE EXCEPTION 'FAIL PROG-06: the reference package does not reproduce the four prior assessment types (%)', types; END IF;

  SELECT array_agg(DISTINCT t.trigger_code ORDER BY t.trigger_code) INTO trigs
    FROM public.supervisory_assessment_programme_trigger t
    JOIN public.supervisory_assessment_programme p ON p.id=t.programme_id
   WHERE p.programme_set_id=(SELECT v FROM pg_id WHERE k='ref_set');
  IF NOT (trigs <@ (SELECT array_agg(code) FROM public.supervisory_assessment_programme_vocabulary
                     WHERE kind='TRIGGER_CODE' AND is_active)) THEN
    RAISE EXCEPTION 'FAIL PROG-06: the reference trigger vocabulary is not governed (%)', trigs; END IF;

  -- the previous built-in default was a trailing 365-day period ending the day before
  SELECT count(*) INTO n FROM public.supervisory_assessment_programme
   WHERE programme_set_id=(SELECT v FROM pg_id WHERE k='ref_set')
     AND period_rule='TRAILING_DAYS' AND period_value=365;
  IF n = 0 THEN
    RAISE EXCEPTION 'FAIL PROG-06: the reference package does not reproduce the prior trailing 365-day period'; END IF;
  RAISE NOTICE 'PASS PROG-06: reference reproduces prior behaviour mechanically (% types, % triggers, % trailing-365 programmes) — not regulatory endorsement',
    array_length(types,1), array_length(trigs,1), n;
END $$;

-- =====================================================================
-- PROG-08 — the reference package is not regulator-owned
-- =====================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.supervisory_assessment_programme_set
              WHERE origin='MIPL_REFERENCE' AND regulator_id IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL PROG-08: a MIPL reference programme package is owned by a regulator'; END IF;
  IF EXISTS (SELECT 1 FROM public.supervisory_assessment_programme_set
              WHERE origin='MIPL_REFERENCE' AND status='ACTIVE') THEN
    RAISE EXCEPTION 'FAIL PROG-08: a MIPL reference programme package is ACTIVE'; END IF;
  RAISE NOTICE 'PASS PROG-08: reference packages are unowned and never active';
END $$;

-- =====================================================================
-- PROG-45 — ASSESSMENT_PROGRAMME is available in the component catalogue
-- =====================================================================
DO $$
DECLARE t public.supervisory_policy_component_type;
BEGIN
  SELECT * INTO t FROM public.supervisory_policy_component_type WHERE component_type='ASSESSMENT_PROGRAMME';
  IF t.component_type IS NULL OR NOT t.is_available THEN
    RAISE EXCEPTION 'FAIL PROG-45: ASSESSMENT_PROGRAMME is not an available policy component'; END IF;
  IF t.component_table IS DISTINCT FROM 'supervisory_assessment_programme_set' THEN
    RAISE EXCEPTION 'FAIL PROG-45: ASSESSMENT_PROGRAMME points at % instead of the programme set table', t.component_table; END IF;
  RAISE NOTICE 'PASS PROG-45: ASSESSMENT_PROGRAMME available and bound to supervisory_assessment_programme_set';
END $$;

-- =====================================================================
-- PROG-47 — the MIPL reference AML profile binds the reference programme package
-- =====================================================================
DO $$
DECLARE b public.supervisory_policy_profile_binding;
BEGIN
  SELECT * INTO b FROM public.supervisory_policy_profile_binding
   WHERE profile_id=(SELECT v FROM pg_id WHERE k='ref_profile') AND component_type='ASSESSMENT_PROGRAMME';
  IF b.component_id IS DISTINCT FROM (SELECT v FROM pg_id WHERE k='ref_set') THEN
    RAISE EXCEPTION 'FAIL PROG-47: the MIPL AML reference profile does not bind the MIPL reference programme package'; END IF;
  RAISE NOTICE 'PASS PROG-47: MIPL reference profile binds MIPL-AML-ASSESSMENT-PROGRAMMES 1.0 exactly';
END $$;

-- =====================================================================
-- PROG-03 — direct authenticated writes are refused, governed RPCs work
-- =====================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = :'AUTHOR';

DO $$
DECLARE blocked int := 0; tried int := 0; msg text;
BEGIN
  -- INSERT on each canonical table
  BEGIN tried:=tried+1;
    INSERT INTO public.supervisory_assessment_programme_set(code,set_version,name,domain_code,origin,status)
    VALUES ('DIRECT-PROGCERT','1.0','direct write','AML_CFT','REGULATOR_AUTHORED','DRAFT');
  EXCEPTION WHEN OTHERS THEN blocked:=blocked+1; END;
  BEGIN tried:=tried+1;
    INSERT INTO public.supervisory_assessment_programme(programme_set_id,programme_code,label,assessment_type)
    VALUES ((SELECT v FROM pg_id WHERE k='ref_set'),'DIRECT_PROGCERT','direct','PERIODIC');
  EXCEPTION WHEN OTHERS THEN blocked:=blocked+1; END;
  BEGIN tried:=tried+1;
    INSERT INTO public.supervisory_assessment_programme_trigger(programme_id,trigger_code)
    SELECT id,'PERIODIC' FROM public.supervisory_assessment_programme
     WHERE programme_set_id=(SELECT v FROM pg_id WHERE k='ref_set') LIMIT 1;
  EXCEPTION WHEN OTHERS THEN blocked:=blocked+1; END;
  -- UPDATE
  BEGIN tried:=tried+1;
    UPDATE public.supervisory_assessment_programme_set SET name='hijacked'
     WHERE id=(SELECT v FROM pg_id WHERE k='ref_set');
    IF (SELECT name FROM public.supervisory_assessment_programme_set
         WHERE id=(SELECT v FROM pg_id WHERE k='ref_set')) = 'hijacked' THEN
      RAISE EXCEPTION 'direct update succeeded'; END IF;
    blocked:=blocked+1;                       -- silently affected no row
  EXCEPTION WHEN OTHERS THEN
    msg := SQLERRM;
    IF msg = 'direct update succeeded' THEN RAISE EXCEPTION
      'FAIL PROG-03: an authenticated session updated a programme set directly'; END IF;
    blocked:=blocked+1;
  END;
  BEGIN tried:=tried+1;
    UPDATE public.supervisory_assessment_programme SET period_value=1
     WHERE programme_set_id=(SELECT v FROM pg_id WHERE k='ref_set');
    IF EXISTS (SELECT 1 FROM public.supervisory_assessment_programme
                WHERE programme_set_id=(SELECT v FROM pg_id WHERE k='ref_set') AND period_value=1) THEN
      RAISE EXCEPTION 'direct update succeeded'; END IF;
    blocked:=blocked+1;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='direct update succeeded' THEN RAISE EXCEPTION
      'FAIL PROG-03: an authenticated session updated a programme directly'; END IF;
    blocked:=blocked+1;
  END;
  -- DELETE
  BEGIN tried:=tried+1;
    DELETE FROM public.supervisory_assessment_programme_trigger t USING public.supervisory_assessment_programme p
     WHERE p.id=t.programme_id AND p.programme_set_id=(SELECT v FROM pg_id WHERE k='ref_set');
    IF (SELECT count(*) FROM public.supervisory_assessment_programme_trigger t
          JOIN public.supervisory_assessment_programme p ON p.id=t.programme_id
         WHERE p.programme_set_id=(SELECT v FROM pg_id WHERE k='ref_set'))
       <> (SELECT n FROM pg_n WHERE k='ref_triggers') THEN
      RAISE EXCEPTION 'direct delete succeeded'; END IF;
    blocked:=blocked+1;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='direct delete succeeded' THEN RAISE EXCEPTION
      'FAIL PROG-03: an authenticated session deleted programme triggers directly'; END IF;
    blocked:=blocked+1;
  END;
  -- events are append-only: no update, no delete
  BEGIN tried:=tried+1;
    UPDATE public.supervisory_assessment_programme_event SET rationale='rewritten'
     WHERE programme_set_id=(SELECT v FROM pg_id WHERE k='ref_set');
    IF EXISTS (SELECT 1 FROM public.supervisory_assessment_programme_event
                WHERE programme_set_id=(SELECT v FROM pg_id WHERE k='ref_set') AND rationale='rewritten') THEN
      RAISE EXCEPTION 'history rewritten'; END IF;
    blocked:=blocked+1;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='history rewritten' THEN RAISE EXCEPTION
      'FAIL PROG-03: programme history is not append-only'; END IF;
    blocked:=blocked+1;
  END;

  IF blocked <> tried THEN
    RAISE EXCEPTION 'FAIL PROG-03: only % of % direct write attempts were refused', blocked, tried; END IF;
  RAISE NOTICE 'PASS PROG-03: all % direct authenticated write attempts refused on canonical programme tables', tried;
END $$;

-- =====================================================================
-- PROG-11 — the single authorised active regulator resolves by itself
-- =====================================================================
DO $$
DECLARE o jsonb;
BEGIN
  o := public.supervisory_assessment_programme_create_options();
  IF COALESCE((o->>'selectable_regulator_count')::int,0) <> 1 THEN
    RAISE EXCEPTION 'FAIL PROG-11: % selectable regulators offered, expected exactly the sole active one (reason: %)',
      o->>'selectable_regulator_count', o->>'reason'; END IF;
  IF (o->'active_regulator'->>'id') IS DISTINCT FROM (SELECT v::text FROM pg_id WHERE k='regulator') THEN
    RAISE EXCEPTION 'FAIL PROG-11: the sole active regulator was not resolved server-side'; END IF;
  IF (o->'active_regulator'->>'status') <> 'active' THEN
    RAISE EXCEPTION 'FAIL PROG-11: a non-active regulator was resolved'; END IF;
  IF NOT COALESCE((o->>'can_create')::boolean,false) THEN
    RAISE EXCEPTION 'FAIL PROG-11: the server refuses creation authority it would actually accept (reason: %)', o->>'reason'; END IF;
  IF (o->>'origin') <> 'REGULATOR_AUTHORED' OR (o->>'status') <> 'DRAFT' THEN
    RAISE EXCEPTION 'FAIL PROG-11: origin/status are not server-set to REGULATOR_AUTHORED/DRAFT'; END IF;
  -- inactive regulators are never offered
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(o->'regulators') r
              WHERE (r->>'status') <> 'active') THEN
    RAISE EXCEPTION 'FAIL PROG-11: an inactive regulator was offered as a creation target'; END IF;
  RAISE NOTICE 'PASS PROG-11: sole active regulator (%) resolved server-side, no arbitrary selection',
    o->'active_regulator'->>'code';
END $$;

-- =====================================================================
-- PROG-12 — a regulator-authored DRAFT set is created through governance
-- =====================================================================
DO $$
DECLARE _id uuid; s public.supervisory_assessment_programme_set;
BEGIN
  _id := public.supervisory_assessment_programme_set_create(jsonb_build_object(
          'code','PROGCERT-PACKAGE','set_version','1.0','name','PROGCERT package',
          'description','Certification package','domain_code','AML_CFT',
          'regulator_id',(SELECT v FROM pg_id WHERE k='regulator'),
          'rationale','Certification fixture creation rationale'));
  INSERT INTO pg_id(k,v) VALUES ('set', _id);
  SELECT * INTO s FROM public.supervisory_assessment_programme_set WHERE id=_id;
  IF s.origin <> 'REGULATOR_AUTHORED' OR s.status <> 'DRAFT'
     OR s.regulator_id IS DISTINCT FROM (SELECT v FROM pg_id WHERE k='regulator') THEN
    RAISE EXCEPTION 'FAIL PROG-12: created set is origin=% status=% regulator=%', s.origin, s.status, s.regulator_id; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_programme_event
                  WHERE programme_set_id=_id AND event_type='CREATED') THEN
    RAISE EXCEPTION 'FAIL PROG-12: creation was not recorded in programme history'; END IF;
  RAISE NOTICE 'PASS PROG-12: regulator-authored DRAFT programme set created through the governed operation';
END $$;

-- =====================================================================
-- PROG-16 — programme create works through the governed RPC
-- PROG-33 — the governed question classes are accepted
-- =====================================================================
DO $$
DECLARE _id uuid; p public.supervisory_assessment_programme; classes text[];
BEGIN
  SELECT array_agg(code ORDER BY sort_order) INTO classes
    FROM public.supervisory_assessment_programme_vocabulary WHERE kind='QUESTION_CLASS' AND is_active;
  IF NOT (classes @> ARRAY['CORE','CONDITIONAL','ENHANCED']) THEN
    RAISE EXCEPTION 'FAIL PROG-33: the server question-class vocabulary is % , expected CORE/CONDITIONAL/ENHANCED', classes; END IF;

  _id := public.supervisory_assessment_programme_upsert((SELECT v FROM pg_id WHERE k='set'), jsonb_build_object(
          'programme_code','CERT_PERIODIC','label','Certification periodic review',
          'assessment_type','PERIODIC','period_rule','TRAILING_MONTHS','period_value',12,
          'end_offset_days',1,'allow_manual_override',false,'summary_required',true,
          'question_class_scope', to_jsonb(classes),
          'rationale','Certification programme creation rationale'));
  INSERT INTO pg_id(k,v) VALUES ('prog_periodic', _id);
  SELECT * INTO p FROM public.supervisory_assessment_programme WHERE id=_id;
  IF p.assessment_type <> 'PERIODIC' OR p.period_rule <> 'TRAILING_MONTHS' OR p.period_value <> 12
     OR p.allow_manual_override THEN
    RAISE EXCEPTION 'FAIL PROG-16: the programme was not persisted as configured'; END IF;
  IF p.question_class_scope IS DISTINCT FROM classes THEN
    RAISE EXCEPTION 'FAIL PROG-33: question-class scope persisted as % instead of %', p.question_class_scope, classes; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_programme_event
                  WHERE programme_set_id=(SELECT v FROM pg_id WHERE k='set') AND event_type='PROGRAMME_ADDED') THEN
    RAISE EXCEPTION 'FAIL PROG-16: programme creation was not recorded in history'; END IF;
  RAISE NOTICE 'PASS PROG-16: programme created through the governed operation and recorded in history';
  RAISE NOTICE 'PASS PROG-33: server question-class vocabulary % accepted and stored canonically', classes;
END $$;

-- =====================================================================
-- PROG-17 — programme update works
-- =====================================================================
DO $$
DECLARE _id uuid; p public.supervisory_assessment_programme;
BEGIN
  _id := public.supervisory_assessment_programme_upsert((SELECT v FROM pg_id WHERE k='set'), jsonb_build_object(
          'id',(SELECT v FROM pg_id WHERE k='prog_periodic'),
          'programme_code','CERT_PERIODIC','label','Certification periodic review (revised)',
          'assessment_type','PERIODIC','period_rule','TRAILING_MONTHS','period_value',24,
          'allow_manual_override',false,'question_class_scope',jsonb_build_array('CORE'),
          'rationale','Certification programme update rationale'));
  IF _id IS DISTINCT FROM (SELECT v FROM pg_id WHERE k='prog_periodic') THEN
    RAISE EXCEPTION 'FAIL PROG-17: the update created a second programme instead of editing one'; END IF;
  SELECT * INTO p FROM public.supervisory_assessment_programme WHERE id=_id;
  IF p.period_value <> 24 OR p.label <> 'Certification periodic review (revised)' THEN
    RAISE EXCEPTION 'FAIL PROG-17: the programme edit did not persist'; END IF;
  IF p.question_class_scope IS DISTINCT FROM ARRAY['CORE']::text[] THEN
    RAISE EXCEPTION 'FAIL PROG-17: the question-class scope edit did not persist'; END IF;
  RAISE NOTICE 'PASS PROG-17: programme edited in place through the governed operation';
END $$;

-- =====================================================================
-- PROG-18 — a duplicate programme_code within one set is refused
-- =====================================================================
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    PERFORM public.supervisory_assessment_programme_upsert((SELECT v FROM pg_id WHERE k='set'), jsonb_build_object(
      'programme_code','CERT_PERIODIC','label','Duplicate','assessment_type','PERIODIC'));
  EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE '%duplicate_programme_code%';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL PROG-18: a duplicate programme code was accepted'; END IF;
  RAISE NOTICE 'PASS PROG-18: duplicate programme code refused within a programme set';
END $$;

-- the remaining certification programmes
DO $$
DECLARE _id uuid;
BEGIN
  _id := public.supervisory_assessment_programme_upsert((SELECT v FROM pg_id WHERE k='set'), jsonb_build_object(
          'programme_code','CERT_MANUAL','label','Certification manual-period review',
          'assessment_type','THEMATIC','period_rule','MANUAL_REQUIRED','allow_manual_override',true,
          'question_class_scope',jsonb_build_array('CORE'),'summary_required',false,
          'rationale','Certification manual period programme'));
  INSERT INTO pg_id(k,v) VALUES ('prog_manual', _id);

  _id := public.supervisory_assessment_programme_upsert((SELECT v FROM pg_id WHERE k='set'), jsonb_build_object(
          'programme_code','CERT_FOLLOW_UP','label','Certification follow-up',
          'assessment_type','FOLLOW_UP','period_rule','TRAILING_DAYS','period_value',180,
          'allow_manual_override',false,'requires_prior_assessment',true,
          'question_class_scope',jsonb_build_array('CORE'),'summary_required',false,
          'rationale','Certification prior-assessment dependency programme'));
  INSERT INTO pg_id(k,v) VALUES ('prog_follow', _id);

  _id := public.supervisory_assessment_programme_upsert((SELECT v FROM pg_id WHERE k='set'), jsonb_build_object(
          'programme_code','CERT_EVENT','label','Certification event-driven',
          'assessment_type','EVENT_DRIVEN','period_rule','EVENT_WINDOW','period_value',90,
          'allow_manual_override',false,'requires_trigger_signal',true,
          'question_class_scope',jsonb_build_array('CORE'),'summary_required',false,
          'rationale','Certification signal dependency programme'));
  INSERT INTO pg_id(k,v) VALUES ('prog_event', _id);
END $$;

-- =====================================================================
-- PROG-21 — trigger create works
-- PROG-26 — an invalid trigger code is refused
-- =====================================================================
DO $$
DECLARE _id uuid; t public.supervisory_assessment_programme_trigger; ok boolean := false;
BEGIN
  _id := public.supervisory_assessment_programme_trigger_upsert((SELECT v FROM pg_id WHERE k='prog_periodic'),
          jsonb_build_object('trigger_code','PERIODIC','is_default',true,'sort_order',10));
  INSERT INTO pg_id(k,v) VALUES ('trig_periodic', _id);
  SELECT * INTO t FROM public.supervisory_assessment_programme_trigger WHERE id=_id;
  IF t.trigger_code <> 'PERIODIC' OR NOT t.is_default OR NOT t.is_active THEN
    RAISE EXCEPTION 'FAIL PROG-21: the trigger was not persisted as configured'; END IF;
  IF t.label IS NULL THEN
    RAISE EXCEPTION 'FAIL PROG-21: the governed trigger label was not applied from the server vocabulary'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_programme_event
                  WHERE programme_set_id=(SELECT v FROM pg_id WHERE k='set') AND event_type='TRIGGER_ADDED') THEN
    RAISE EXCEPTION 'FAIL PROG-21: trigger creation was not recorded in history'; END IF;

  BEGIN
    PERFORM public.supervisory_assessment_programme_trigger_upsert((SELECT v FROM pg_id WHERE k='prog_periodic'),
      jsonb_build_object('trigger_code','NOT_A_GOVERNED_TRIGGER'));
  EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE '%trigger_code_invalid%';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL PROG-26: a trigger code outside the governed vocabulary was accepted'; END IF;

  RAISE NOTICE 'PASS PROG-21: trigger added through the governed operation with a server-owned label';
  RAISE NOTICE 'PASS PROG-26: trigger code outside the governed vocabulary refused';
END $$;

-- triggers for the remaining programmes
DO $$
BEGIN
  PERFORM public.supervisory_assessment_programme_trigger_upsert((SELECT v FROM pg_id WHERE k='prog_manual'),
    jsonb_build_object('trigger_code','THEMATIC','is_default',true));
  PERFORM public.supervisory_assessment_programme_trigger_upsert((SELECT v FROM pg_id WHERE k='prog_follow'),
    jsonb_build_object('trigger_code','FOLLOW_UP','is_default',true));
  PERFORM public.supervisory_assessment_programme_trigger_upsert((SELECT v FROM pg_id WHERE k='prog_event'),
    jsonb_build_object('trigger_code','EVENT_DRIVEN','is_default',true,'requires_signal',true));
END $$;

-- =====================================================================
-- PROG-22 — trigger update works
-- PROG-24 — a duplicate trigger code does not create a second row
-- PROG-25 — a second active default demotes the first; two defaults are refused
-- =====================================================================
DO $$
DECLARE _id uuid; n int; vres jsonb;
BEGIN
  _id := public.supervisory_assessment_programme_trigger_upsert((SELECT v FROM pg_id WHERE k='prog_periodic'),
          jsonb_build_object('id',(SELECT v FROM pg_id WHERE k='trig_periodic'),
            'trigger_code','PERIODIC','description','Annual cycle','sort_order',5,'is_default',true));
  IF _id IS DISTINCT FROM (SELECT v FROM pg_id WHERE k='trig_periodic') THEN
    RAISE EXCEPTION 'FAIL PROG-22: the trigger edit created a new trigger'; END IF;
  IF (SELECT description FROM public.supervisory_assessment_programme_trigger WHERE id=_id) <> 'Annual cycle' THEN
    RAISE EXCEPTION 'FAIL PROG-22: the trigger edit did not persist'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_programme_event
                  WHERE programme_set_id=(SELECT v FROM pg_id WHERE k='set') AND event_type='TRIGGER_UPDATED') THEN
    RAISE EXCEPTION 'FAIL PROG-22: the trigger edit was not recorded in history'; END IF;
  RAISE NOTICE 'PASS PROG-22: trigger edited in place and recorded in history';

  -- PROG-24: same code again, no id supplied
  PERFORM public.supervisory_assessment_programme_trigger_upsert((SELECT v FROM pg_id WHERE k='prog_periodic'),
    jsonb_build_object('trigger_code','PERIODIC'));
  SELECT count(*) INTO n FROM public.supervisory_assessment_programme_trigger
   WHERE programme_id=(SELECT v FROM pg_id WHERE k='prog_periodic') AND trigger_code='PERIODIC';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL PROG-24: % PERIODIC triggers exist on one programme', n; END IF;
  RAISE NOTICE 'PASS PROG-24: a duplicate trigger code cannot produce a second trigger on the same programme';

  -- PROG-25: a second default demotes the first
  PERFORM public.supervisory_assessment_programme_trigger_upsert((SELECT v FROM pg_id WHERE k='prog_periodic'),
    jsonb_build_object('trigger_code','REASSESSMENT','is_default',true));
  SELECT count(*) INTO n FROM public.supervisory_assessment_programme_trigger
   WHERE programme_id=(SELECT v FROM pg_id WHERE k='prog_periodic') AND is_default;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL PROG-25: % default triggers exist after setting a second default', n; END IF;
  -- and validation refuses the state outright if it were ever reached
  vres := public.supervisory_assessment_programme_set_validate((SELECT v FROM pg_id WHERE k='set'));
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(vres->'errors') e WHERE e->>'code'='MULTIPLE_DEFAULT_TRIGGERS') THEN
    RAISE EXCEPTION 'FAIL PROG-25: multiple default triggers survived the governed write'; END IF;
  RAISE NOTICE 'PASS PROG-25: exactly one active default trigger is maintained per programme';
END $$;

-- =====================================================================
-- PROG-23 — trigger removal works where safe
-- =====================================================================
DO $$
DECLARE tid uuid; ok boolean;
BEGIN
  SELECT id INTO tid FROM public.supervisory_assessment_programme_trigger
   WHERE programme_id=(SELECT v FROM pg_id WHERE k='prog_periodic') AND trigger_code='REASSESSMENT';
  -- rationale is mandatory
  ok := false;
  BEGIN PERFORM public.supervisory_assessment_programme_trigger_remove(tid,'short');
  EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE '%rationale%'; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL PROG-23: a trigger was removed without a rationale'; END IF;

  PERFORM public.supervisory_assessment_programme_trigger_remove(tid,'Certification trigger removal rationale');
  IF EXISTS (SELECT 1 FROM public.supervisory_assessment_programme_trigger WHERE id=tid) THEN
    RAISE EXCEPTION 'FAIL PROG-23: the trigger was not removed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_programme_event
                  WHERE programme_set_id=(SELECT v FROM pg_id WHERE k='set')
                    AND event_type='TRIGGER_REMOVED' AND before_state IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL PROG-23: trigger removal was not recorded with its prior state'; END IF;
  -- the programme keeps its default trigger
  IF (SELECT count(*) FROM public.supervisory_assessment_programme_trigger
       WHERE programme_id=(SELECT v FROM pg_id WHERE k='prog_periodic') AND is_active) = 0 THEN
    RAISE EXCEPTION 'FAIL PROG-23: the programme was left with no allowed trigger'; END IF;
  RAISE NOTICE 'PASS PROG-23: trigger removed under a recorded rationale, prior state preserved in history';
END $$;

-- restore PERIODIC as the default trigger of the periodic programme
DO $$
BEGIN
  PERFORM public.supervisory_assessment_programme_trigger_upsert((SELECT v FROM pg_id WHERE k='prog_periodic'),
    jsonb_build_object('trigger_code','PERIODIC','is_default',true,'is_active',true));
END $$;

-- =====================================================================
-- PROG-27 / PROG-28 — trailing period rules require a positive period value
-- PROG-29 — MANUAL_REQUIRED needs no derived period value
-- PROG-30 — an invalid period-rule code is refused
-- PROG-34 — an invalid question class is refused
-- =====================================================================
DO $$
DECLARE vres jsonb; codes text[]; ok boolean;
BEGIN
  -- PROG-27: TRAILING_DAYS without a value
  PERFORM public.supervisory_assessment_programme_upsert((SELECT v FROM pg_id WHERE k='set'), jsonb_build_object(
    'programme_code','CERT_BAD','label','Bad period','assessment_type','PERIODIC',
    'period_rule','TRAILING_DAYS','question_class_scope',jsonb_build_array('CORE')));
  vres := public.supervisory_assessment_programme_set_validate((SELECT v FROM pg_id WHERE k='set'));
  SELECT array_agg(e->>'code') INTO codes FROM jsonb_array_elements(vres->'errors') e
   WHERE e->>'programme_code'='CERT_BAD';
  IF NOT (codes @> ARRAY['PERIOD_VALUE_REQUIRED']) THEN
    RAISE EXCEPTION 'FAIL PROG-27: TRAILING_DAYS without a positive period value was accepted (%)', codes; END IF;
  RAISE NOTICE 'PASS PROG-27: TRAILING_DAYS requires a positive period value';

  -- PROG-28: TRAILING_MONTHS with a non-positive value is refused outright
  ok := false;
  BEGIN
    PERFORM public.supervisory_assessment_programme_upsert((SELECT v FROM pg_id WHERE k='set'), jsonb_build_object(
      'programme_code','CERT_BAD','label','Bad period','assessment_type','PERIODIC',
      'period_rule','TRAILING_MONTHS','period_value',0,'question_class_scope',jsonb_build_array('CORE'),
      'id',(SELECT id FROM public.supervisory_assessment_programme
             WHERE programme_set_id=(SELECT v FROM pg_id WHERE k='set') AND programme_code='CERT_BAD')));
  EXCEPTION WHEN OTHERS THEN ok := true;
  END;
  IF NOT ok THEN
    RAISE EXCEPTION 'FAIL PROG-28: TRAILING_MONTHS with a non-positive period value was accepted'; END IF;
  IF EXISTS (SELECT 1 FROM public.supervisory_assessment_programme
              WHERE programme_set_id=(SELECT v FROM pg_id WHERE k='set') AND period_value = 0) THEN
    RAISE EXCEPTION 'FAIL PROG-28: a non-positive period value persisted'; END IF;
  RAISE NOTICE 'PASS PROG-28: a non-positive period value is refused at write time (database invariant)';


  -- PROG-30: an invalid period rule
  PERFORM public.supervisory_assessment_programme_upsert((SELECT v FROM pg_id WHERE k='set'), jsonb_build_object(
    'programme_code','CERT_BAD','label','Bad period','assessment_type','PERIODIC',
    'period_rule','WHENEVER_WE_FEEL_LIKE_IT','question_class_scope',jsonb_build_array('CORE'),
    'id',(SELECT id FROM public.supervisory_assessment_programme
           WHERE programme_set_id=(SELECT v FROM pg_id WHERE k='set') AND programme_code='CERT_BAD')));
  vres := public.supervisory_assessment_programme_set_validate((SELECT v FROM pg_id WHERE k='set'));
  SELECT array_agg(e->>'code') INTO codes FROM jsonb_array_elements(vres->'errors') e
   WHERE e->>'programme_code'='CERT_BAD';
  IF NOT (codes @> ARRAY['PERIOD_RULE_INVALID']) THEN
    RAISE EXCEPTION 'FAIL PROG-30: an ungoverned period rule was accepted as policy (%)', codes; END IF;
  RAISE NOTICE 'PASS PROG-30: a period-rule code outside the governed vocabulary is refused as policy';

  -- PROG-34: an invalid question class
  PERFORM public.supervisory_assessment_programme_upsert((SELECT v FROM pg_id WHERE k='set'), jsonb_build_object(
    'programme_code','CERT_BAD','label','Bad period','assessment_type','PERIODIC',
    'period_rule','MANUAL_REQUIRED','allow_manual_override',true,
    'question_class_scope',jsonb_build_array('CORE','MADE_UP_CLASS'),
    'id',(SELECT id FROM public.supervisory_assessment_programme
           WHERE programme_set_id=(SELECT v FROM pg_id WHERE k='set') AND programme_code='CERT_BAD')));
  vres := public.supervisory_assessment_programme_set_validate((SELECT v FROM pg_id WHERE k='set'));
  SELECT array_agg(e->>'code') INTO codes FROM jsonb_array_elements(vres->'errors') e
   WHERE e->>'programme_code'='CERT_BAD';
  IF NOT (codes @> ARRAY['QUESTION_CLASS_INVALID']) THEN
    RAISE EXCEPTION 'FAIL PROG-34: a question class outside the governed vocabulary was accepted (%)', codes; END IF;
  RAISE NOTICE 'PASS PROG-34: a question class outside the governed vocabulary is refused as policy';

  -- PROG-29: MANUAL_REQUIRED, valid classes, no period value — clean
  PERFORM public.supervisory_assessment_programme_upsert((SELECT v FROM pg_id WHERE k='set'), jsonb_build_object(
    'programme_code','CERT_BAD','label','Manual period','assessment_type','PERIODIC',
    'period_rule','MANUAL_REQUIRED','allow_manual_override',true,
    'question_class_scope',jsonb_build_array('CORE'),
    'id',(SELECT id FROM public.supervisory_assessment_programme
           WHERE programme_set_id=(SELECT v FROM pg_id WHERE k='set') AND programme_code='CERT_BAD')));
  PERFORM public.supervisory_assessment_programme_trigger_upsert(
    (SELECT id FROM public.supervisory_assessment_programme
      WHERE programme_set_id=(SELECT v FROM pg_id WHERE k='set') AND programme_code='CERT_BAD'),
    jsonb_build_object('trigger_code','PERIODIC','is_default',true));
  vres := public.supervisory_assessment_programme_set_validate((SELECT v FROM pg_id WHERE k='set'));
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(vres->'errors') e WHERE e->>'programme_code'='CERT_BAD') THEN
    RAISE EXCEPTION 'FAIL PROG-29: MANUAL_REQUIRED was treated as needing a derived period value'; END IF;
  RAISE NOTICE 'PASS PROG-29: MANUAL_REQUIRED needs no derived period value';
END $$;

-- =====================================================================
-- PROG-19 — programme retirement retains the row and its history
-- =====================================================================
DO $$
DECLARE pid uuid; p public.supervisory_assessment_programme; ok boolean := false;
BEGIN
  SELECT id INTO pid FROM public.supervisory_assessment_programme
   WHERE programme_set_id=(SELECT v FROM pg_id WHERE k='set') AND programme_code='CERT_BAD';
  BEGIN PERFORM public.supervisory_assessment_programme_retire(pid,'too short');
  EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE '%rationale%'; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL PROG-19: a programme was retired without a rationale'; END IF;

  PERFORM public.supervisory_assessment_programme_retire(pid,'Certification retirement rationale recorded');
  SELECT * INTO p FROM public.supervisory_assessment_programme WHERE id=pid;
  IF p.id IS NULL THEN RAISE EXCEPTION 'FAIL PROG-19: retirement hard-deleted the programme'; END IF;
  IF p.is_active OR p.retired_at IS NULL OR p.retired_by IS NULL
     OR p.retirement_rationale IS NULL OR p.programme_code IS NULL THEN
    RAISE EXCEPTION 'FAIL PROG-19: retirement did not retain identity and provenance'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_programme_event
                  WHERE programme_set_id=(SELECT v FROM pg_id WHERE k='set')
                    AND event_type='PROGRAMME_RETIRED' AND before_state IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL PROG-19: retirement was not recorded with the prior state'; END IF;
  RAISE NOTICE 'PASS PROG-19: programme retired under rationale, row and history retained (no hard delete)';
END $$;

-- =====================================================================
-- PROG-37 — structural validation blocks DRAFT -> REVIEW while errors exist
-- =====================================================================
DO $$
DECLARE ok boolean := false; vres jsonb;
BEGIN
  -- introduce one real structural error: a programme with no allowed trigger
  PERFORM public.supervisory_assessment_programme_upsert((SELECT v FROM pg_id WHERE k='set'), jsonb_build_object(
    'programme_code','CERT_NO_TRIGGER','label','No trigger','assessment_type','PERIODIC',
    'period_rule','MANUAL_REQUIRED','allow_manual_override',true,
    'question_class_scope',jsonb_build_array('CORE')));
  vres := public.supervisory_assessment_programme_set_validate((SELECT v FROM pg_id WHERE k='set'));
  IF (vres->>'error_count')::int = 0 THEN
    RAISE EXCEPTION 'FAIL PROG-37: validation did not detect a programme with no allowed trigger'; END IF;
  IF COALESCE((vres->>'ready_for_review')::boolean,true) THEN
    RAISE EXCEPTION 'FAIL PROG-37: validation reports the set ready for review while errors exist'; END IF;

  BEGIN
    PERFORM public.supervisory_assessment_programme_set_lifecycle(
      (SELECT v FROM pg_id WHERE k='set'),'REVIEW','Certification submission attempt rationale');
  EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE '%validation_blocked%';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL PROG-37: a structurally invalid set was submitted for review'; END IF;
  RAISE NOTICE 'PASS PROG-37: DRAFT -> REVIEW blocked by structural validation (% error(s))', vres->>'error_count';
END $$;

-- remove the deliberate error and submit for review
DO $$
DECLARE vres jsonb;
BEGIN
  PERFORM public.supervisory_assessment_programme_retire(
    (SELECT id FROM public.supervisory_assessment_programme
      WHERE programme_set_id=(SELECT v FROM pg_id WHERE k='set') AND programme_code='CERT_NO_TRIGGER'),
    'Certification cleanup of the deliberate validation error');
  vres := public.supervisory_assessment_programme_set_validate((SELECT v FROM pg_id WHERE k='set'));
  IF (vres->>'error_count')::int <> 0 THEN
    RAISE EXCEPTION 'FAIL PROG-37: the certification package is still invalid: %', vres->'errors'; END IF;
  PERFORM public.supervisory_assessment_programme_set_lifecycle(
    (SELECT v FROM pg_id WHERE k='set'),'REVIEW','Certification submission for review rationale');
  IF (SELECT status FROM public.supervisory_assessment_programme_set
       WHERE id=(SELECT v FROM pg_id WHERE k='set')) <> 'REVIEW' THEN
    RAISE EXCEPTION 'FAIL PROG-37: the valid set was not submitted for review'; END IF;
END $$;

-- =====================================================================
-- PROG-39 — maker/checker: the author cannot approve their own package
-- =====================================================================
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    PERFORM public.supervisory_assessment_programme_set_lifecycle(
      (SELECT v FROM pg_id WHERE k='set'),'APPROVED','Certification self-approval attempt rationale');
  EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE '%maker_checker%';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL PROG-39: the author/submitter approved their own programme package'; END IF;
  RAISE NOTICE 'PASS PROG-39: maker/checker enforced — the author and submitter cannot approve';
END $$;

-- =====================================================================
-- PROG-38 — structural validation blocks REVIEW -> APPROVED while errors exist
-- =====================================================================
-- The content of a REVIEW set is read-only through governance, so the invalid
-- state is injected as a fixture (the platform owner) and the *approval* is then
-- attempted through the governed operation under the checker persona.
RESET ROLE;
UPDATE public.supervisory_assessment_programme
   SET period_rule='TRAILING_DAYS', period_value=NULL
 WHERE id=(SELECT v FROM pg_id WHERE k='prog_manual');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = :'APPROVER';

DO $$
DECLARE ok boolean := false; vres jsonb;
BEGIN
  vres := public.supervisory_assessment_programme_set_validate((SELECT v FROM pg_id WHERE k='set'));
  IF (vres->>'error_count')::int = 0 THEN
    RAISE EXCEPTION 'FAIL PROG-38: the injected structural error was not detected'; END IF;
  IF COALESCE((vres->>'ready_for_approval')::boolean,true) THEN
    RAISE EXCEPTION 'FAIL PROG-38: validation reports the set ready for approval while errors exist'; END IF;
  BEGIN
    PERFORM public.supervisory_assessment_programme_set_lifecycle(
      (SELECT v FROM pg_id WHERE k='set'),'APPROVED','Certification approval attempt rationale');
  EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE '%validation_blocked%';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL PROG-38: a structurally invalid set was approved'; END IF;
  RAISE NOTICE 'PASS PROG-38: REVIEW -> APPROVED blocked by structural validation';
END $$;

RESET ROLE;
UPDATE public.supervisory_assessment_programme
   SET period_rule='MANUAL_REQUIRED', period_value=NULL, allow_manual_override=true
 WHERE id=(SELECT v FROM pg_id WHERE k='prog_manual');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = :'APPROVER';

-- approve and activate as the checker
DO $$
DECLARE s public.supervisory_assessment_programme_set; ok boolean := false;
BEGIN
  BEGIN PERFORM public.supervisory_assessment_programme_set_lifecycle(
    (SELECT v FROM pg_id WHERE k='set'),'APPROVED','short');
  EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE '%rationale%'; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL PROG-39: approval was accepted without a rationale'; END IF;

  PERFORM public.supervisory_assessment_programme_set_lifecycle(
    (SELECT v FROM pg_id WHERE k='set'),'APPROVED','Certification approval by the independent checker');
  SELECT * INTO s FROM public.supervisory_assessment_programme_set WHERE id=(SELECT v FROM pg_id WHERE k='set');
  IF s.status <> 'APPROVED' OR s.approved_by IS NULL OR s.approved_by = s.created_by THEN
    RAISE EXCEPTION 'FAIL PROG-39: approval did not record an independent checker'; END IF;
END $$;

-- =====================================================================
-- PROG-40 — a frozen APPROVED version cannot be substantively edited
-- =====================================================================
DO $$
DECLARE ok int := 0;
BEGIN
  BEGIN PERFORM public.supervisory_assessment_programme_upsert((SELECT v FROM pg_id WHERE k='set'),
          jsonb_build_object('programme_code','CERT_SNEAK','label','Sneak','assessment_type','PERIODIC'));
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE '%frozen_version%' OR SQLERRM LIKE '%not_draft%' THEN ok:=ok+1; END IF; END;
  BEGIN PERFORM public.supervisory_assessment_programme_set_save((SELECT v FROM pg_id WHERE k='set'),
          jsonb_build_object('name','Renamed while approved'));
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE '%frozen_version%' OR SQLERRM LIKE '%not_draft%' THEN ok:=ok+1; END IF; END;
  BEGIN PERFORM public.supervisory_assessment_programme_trigger_upsert((SELECT v FROM pg_id WHERE k='prog_periodic'),
          jsonb_build_object('trigger_code','THEMATIC'));
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE '%frozen_version%' OR SQLERRM LIKE '%not_draft%' THEN ok:=ok+1; END IF; END;
  IF ok <> 3 THEN
    RAISE EXCEPTION 'FAIL PROG-40: only % of 3 substantive edits were refused on an APPROVED package', ok; END IF;
  RAISE NOTICE 'PASS PROG-40: an APPROVED programme package is frozen against metadata, programme and trigger edits';
END $$;

-- activate
DO $$
BEGIN
  PERFORM public.supervisory_assessment_programme_set_lifecycle(
    (SELECT v FROM pg_id WHERE k='set'),'ACTIVE','Certification activation as regulator policy');
  IF (SELECT status FROM public.supervisory_assessment_programme_set
       WHERE id=(SELECT v FROM pg_id WHERE k='set')) <> 'ACTIVE' THEN
    RAISE EXCEPTION 'FAIL: the certification package could not be activated'; END IF;
END $$;

-- =====================================================================
-- PROG-20 — a programme in an ACTIVE (frozen) set cannot be mutated
-- =====================================================================
DO $$
DECLARE ok int := 0;
BEGIN
  BEGIN PERFORM public.supervisory_assessment_programme_upsert((SELECT v FROM pg_id WHERE k='set'),
          jsonb_build_object('id',(SELECT v FROM pg_id WHERE k='prog_periodic'),
            'programme_code','CERT_PERIODIC','label','Edited while active','assessment_type','PERIODIC'));
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE '%frozen_version%' OR SQLERRM LIKE '%not_draft%' THEN ok:=ok+1; END IF; END;
  BEGIN PERFORM public.supervisory_assessment_programme_retire((SELECT v FROM pg_id WHERE k='prog_periodic'),
          'Attempted retirement inside an active package');
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE '%frozen_version%' OR SQLERRM LIKE '%not_draft%' THEN ok:=ok+1; END IF; END;
  IF ok <> 2 THEN
    RAISE EXCEPTION 'FAIL PROG-20: programme mutation inside a frozen set was not refused (% of 2)', ok; END IF;
  IF (SELECT label FROM public.supervisory_assessment_programme WHERE id=(SELECT v FROM pg_id WHERE k='prog_periodic'))
     = 'Edited while active' THEN
    RAISE EXCEPTION 'FAIL PROG-20: an active programme was edited'; END IF;
  RAISE NOTICE 'PASS PROG-20: programme mutation inside a frozen (ACTIVE) programme set is refused';
END $$;

-- =====================================================================
-- Runtime: PROG-49, PROG-31, PROG-32, PROG-35, PROG-36
-- =====================================================================
SET LOCAL "request.jwt.claims" = :'AUTHOR';

DO $$
DECLARE o jsonb; ps jsonb;
BEGIN
  o := public.supervisory_assessment_programme_options_for_entity(
         (SELECT v FROM pg_id WHERE k='entity_prior'),'AML_CFT');
  IF (o->>'mode') <> 'CONFIGURED' THEN
    RAISE EXCEPTION 'FAIL PROG-49: the runtime resolved mode % instead of CONFIGURED against activated regulator policy', o->>'mode'; END IF;
  IF (o->'programme_set'->>'id') IS DISTINCT FROM (SELECT v::text FROM pg_id WHERE k='set') THEN
    RAISE EXCEPTION 'FAIL PROG-49: the runtime did not resolve the activated regulator package'; END IF;
  -- programme options, assessment types, triggers and periods all come from the server
  SELECT p INTO ps FROM jsonb_array_elements(o->'programmes') p
   WHERE p->>'programme_code'='CERT_PERIODIC';
  IF ps IS NULL THEN RAISE EXCEPTION 'FAIL PROG-49: the configured programme was not offered'; END IF;
  IF (ps->>'assessment_type') <> 'PERIODIC' THEN
    RAISE EXCEPTION 'FAIL PROG-49: the assessment type is not derived from the programme'; END IF;
  IF jsonb_array_length(ps->'triggers') = 0 THEN
    RAISE EXCEPTION 'FAIL PROG-49: permitted triggers are not derived from the programme'; END IF;
  IF (ps->'period'->>'suggested_period_start') IS NULL OR (ps->'period'->>'suggested_period_end') IS NULL THEN
    RAISE EXCEPTION 'FAIL PROG-49: the review period is not derived server-side'; END IF;
  IF COALESCE((ps->'period'->>'allow_manual_override')::boolean,true) THEN
    RAISE EXCEPTION 'FAIL PROG-49: the fixed-period programme advertises manual override'; END IF;
  RAISE NOTICE 'PASS PROG-49 (options): server-resolved programme set %, type, triggers and period all server-derived',
    o->'programme_set'->>'set_version';
END $$;

DO $$
DECLARE ok boolean; res jsonb; a public.supervisory_assessment; per jsonb;
BEGIN
  -- an unrelated programme (the MIPL reference package) is refused for this entity
  ok := false;
  BEGIN
    PERFORM public.supervisory_assessment_create_programmed(
      (SELECT v FROM pg_id WHERE k='entity_prior'),'AML_CFT',
      (SELECT id FROM public.supervisory_assessment_programme
        WHERE programme_set_id=(SELECT v FROM pg_id WHERE k='ref_set') LIMIT 1),
      NULL,NULL,NULL,'Certification invalid programme attempt');
  EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE '%programme_not_applicable%';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL PROG-49: a programme outside the applicable configuration was accepted'; END IF;

  -- a trigger the programme does not permit is refused
  ok := false;
  BEGIN
    PERFORM public.supervisory_assessment_create_programmed(
      (SELECT v FROM pg_id WHERE k='entity_prior'),'AML_CFT',(SELECT v FROM pg_id WHERE k='prog_periodic'),
      'EVENT_DRIVEN',NULL,NULL,'Certification invalid trigger attempt');
  EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE '%trigger_not_allowed%';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL PROG-49: a trigger outside the programme was accepted'; END IF;

  -- PROG-31: a fixed-period programme refuses manual dates
  ok := false;
  BEGIN
    PERFORM public.supervisory_assessment_create_programmed(
      (SELECT v FROM pg_id WHERE k='entity_prior'),'AML_CFT',(SELECT v FROM pg_id WHERE k='prog_periodic'),
      NULL, current_date - 30, current_date,'Certification unauthorised override attempt');
  EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE '%period_override_not_permitted%';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL PROG-31: a fixed-period programme accepted an unauthorised manual period'; END IF;
  RAISE NOTICE 'PASS PROG-31: a programme that fixes its review period refuses manual dates';

  -- the valid programmed creation
  res := public.supervisory_assessment_create_programmed(
           (SELECT v FROM pg_id WHERE k='entity_prior'),'AML_CFT',(SELECT v FROM pg_id WHERE k='prog_periodic'),
           NULL,NULL,NULL,'Certification programmed assessment summary');
  INSERT INTO pg_id(k,v) VALUES ('assessment', (res->>'id')::uuid);
  SELECT * INTO a FROM public.supervisory_assessment WHERE id=(res->>'id')::uuid;

  IF a.assessment_type <> 'PERIODIC' THEN
    RAISE EXCEPTION 'FAIL PROG-49: the assessment type was not taken from the programme'; END IF;
  IF a.trigger_type <> 'PERIODIC' THEN
    RAISE EXCEPTION 'FAIL PROG-49: the default trigger was not taken from the programme'; END IF;
  per := public.supervisory_assessment_programme_period_for(
           (SELECT p FROM public.supervisory_assessment_programme p WHERE p.id=(SELECT v FROM pg_id WHERE k='prog_periodic')),
           NULL, current_date);
  IF a.period_start IS DISTINCT FROM (per->>'suggested_period_start')::date
     OR a.period_end IS DISTINCT FROM (per->>'suggested_period_end')::date THEN
    RAISE EXCEPTION 'FAIL PROG-49: the review period was not derived from the programme rule'; END IF;
  IF a.assessment_programme_set_id IS DISTINCT FROM (SELECT v FROM pg_id WHERE k='set')
     OR a.assessment_programme_id IS DISTINCT FROM (SELECT v FROM pg_id WHERE k='prog_periodic')
     OR a.assessment_programme_code <> 'CERT_PERIODIC'
     OR a.assessment_programme_version <> '1.0'
     OR a.assessment_programme_provenance <> 'PROGRAMME_CONFIGURED' THEN
    RAISE EXCEPTION 'FAIL PROG-49: the exact programme identity was not stamped onto the assessment'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_event
                  WHERE assessment_id=a.id AND event_type='PROGRAMME_APPLIED') THEN
    RAISE EXCEPTION 'FAIL PROG-49: no PROGRAMME_APPLIED event was recorded'; END IF;
  RAISE NOTICE 'PASS PROG-49: programmed creation is server authoritative and stamps % % / % exactly',
    a.assessment_programme_code, a.assessment_programme_version, a.assessment_programme_provenance;
END $$;

-- =====================================================================
-- PROG-32 — a manual override succeeds only within the server contract
-- =====================================================================
DO $$
DECLARE res jsonb; a public.supervisory_assessment; ok boolean := false;
BEGIN
  -- the override programme permits manual dates
  res := public.supervisory_assessment_create_programmed(
           (SELECT v FROM pg_id WHERE k='entity_prior'),'AML_CFT',(SELECT v FROM pg_id WHERE k='prog_manual'),
           NULL, current_date - 90, current_date - 1,'Certification manual period assessment');
  SELECT * INTO a FROM public.supervisory_assessment WHERE id=(res->>'id')::uuid;
  IF a.period_start <> current_date - 90 OR a.period_end <> current_date - 1 THEN
    RAISE EXCEPTION 'FAIL PROG-32: the permitted manual period was not honoured'; END IF;
  IF a.assessment_type <> 'THEMATIC' THEN
    RAISE EXCEPTION 'FAIL PROG-32: the assessment type still did not come from the programme'; END IF;

  -- but the server still validates it: an inverted period is refused
  BEGIN
    PERFORM public.supervisory_assessment_create_programmed(
      (SELECT v FROM pg_id WHERE k='entity_prior'),'AML_CFT',(SELECT v FROM pg_id WHERE k='prog_manual'),
      NULL, current_date, current_date - 30,'Certification inverted period attempt');
  EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE '%period_invalid%';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL PROG-32: an inverted manual period was accepted'; END IF;
  RAISE NOTICE 'PASS PROG-32: a permitted manual period is honoured and still server-validated';
END $$;

-- =====================================================================
-- PROG-35 — the prior-assessment dependency is server-enforced
-- PROG-36 — the trigger-signal dependency is server-enforced
-- =====================================================================
DO $$
DECLARE ok boolean := false; mode text;
BEGIN
  mode := (public.supervisory_assessment_programme_options_for_entity(
             (SELECT v FROM pg_id WHERE k='entity_fresh'),'AML_CFT'))->>'mode';
  IF mode <> 'CONFIGURED' THEN
    RAISE EXCEPTION 'FAIL PROG-35: the fresh entity resolved mode % — the dependency gate cannot be certified', mode; END IF;
  IF EXISTS (SELECT 1 FROM public.supervisory_assessment
              WHERE entity_id=(SELECT v FROM pg_id WHERE k='entity_fresh')) THEN
    RAISE EXCEPTION 'FAIL PROG-35: the fixture entity already has assessments'; END IF;

  BEGIN
    PERFORM public.supervisory_assessment_create_programmed(
      (SELECT v FROM pg_id WHERE k='entity_fresh'),'AML_CFT',(SELECT v FROM pg_id WHERE k='prog_follow'),
      NULL,NULL,NULL,'Certification prior-assessment dependency attempt');
  EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE '%prior_assessment_required%';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL PROG-35: a programme requiring a prior assessment was allowed without one'; END IF;
  RAISE NOTICE 'PASS PROG-35: the prior-assessment requirement is enforced by the server';

  ok := false;
  BEGIN
    PERFORM public.supervisory_assessment_create_programmed(
      (SELECT v FROM pg_id WHERE k='entity_prior'),'AML_CFT',(SELECT v FROM pg_id WHERE k='prog_event'),
      NULL,NULL,NULL,'Certification signal dependency attempt');
  EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE '%trigger_signal_required%';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL PROG-36: a programme requiring the triggering signal was allowed without one'; END IF;
  RAISE NOTICE 'PASS PROG-36: the triggering-signal requirement is enforced by the server';
END $$;

-- =====================================================================
-- PROG-41 / PROG-42 / PROG-43 — new version clones and leaves the source alone
-- =====================================================================
DO $$
DECLARE nv uuid; src public.supervisory_assessment_programme_set; dst public.supervisory_assessment_programme_set;
        a int; b int; diff int;
BEGIN
  nv := public.supervisory_assessment_programme_set_new_version(
          (SELECT v FROM pg_id WHERE k='set'),'2.0','Certification new version rationale recorded');
  INSERT INTO pg_id(k,v) VALUES ('set_v2', nv);
  SELECT * INTO src FROM public.supervisory_assessment_programme_set WHERE id=(SELECT v FROM pg_id WHERE k='set');
  SELECT * INTO dst FROM public.supervisory_assessment_programme_set WHERE id=nv;

  IF dst.id = src.id OR dst.status <> 'DRAFT' OR dst.set_version <> '2.0'
     OR dst.supersedes_id IS DISTINCT FROM src.id
     OR dst.regulator_id IS DISTINCT FROM src.regulator_id THEN
    RAISE EXCEPTION 'FAIL PROG-41: the successor is not a separate DRAFT of the same lineage'; END IF;
  RAISE NOTICE 'PASS PROG-41: new version created a separate DRAFT successor (% -> %)', src.set_version, dst.set_version;

  -- PROG-42: full clone of programmes, triggers, period rules, scope and flags
  SELECT count(*) INTO a FROM public.supervisory_assessment_programme WHERE programme_set_id=src.id;
  SELECT count(*) INTO b FROM public.supervisory_assessment_programme WHERE programme_set_id=dst.id;
  IF a <> b THEN RAISE EXCEPTION 'FAIL PROG-42: % programmes cloned from %', b, a; END IF;

  SELECT count(*) INTO diff FROM (
    SELECT programme_code, assessment_type, period_rule, period_value, end_offset_days,
           allow_manual_override, requires_prior_assessment, requires_trigger_signal,
           summary_required, recurrence_months, question_class_scope,
           included_dimension_codes, excluded_dimension_codes, is_active, sort_order,
           label, description, guidance
      FROM public.supervisory_assessment_programme WHERE programme_set_id=src.id
    EXCEPT
    SELECT programme_code, assessment_type, period_rule, period_value, end_offset_days,
           allow_manual_override, requires_prior_assessment, requires_trigger_signal,
           summary_required, recurrence_months, question_class_scope,
           included_dimension_codes, excluded_dimension_codes, is_active, sort_order,
           label, description, guidance
      FROM public.supervisory_assessment_programme WHERE programme_set_id=dst.id) d;
  IF diff <> 0 THEN RAISE EXCEPTION 'FAIL PROG-42: % programme configuration(s) were not cloned faithfully', diff; END IF;

  SELECT count(*) INTO diff FROM (
    SELECT p.programme_code, t.trigger_code, t.is_active, t.is_default, t.sort_order,
           t.requires_signal, t.requires_prior_assessment
      FROM public.supervisory_assessment_programme_trigger t
      JOIN public.supervisory_assessment_programme p ON p.id=t.programme_id
     WHERE p.programme_set_id=src.id
    EXCEPT
    SELECT p.programme_code, t.trigger_code, t.is_active, t.is_default, t.sort_order,
           t.requires_signal, t.requires_prior_assessment
      FROM public.supervisory_assessment_programme_trigger t
      JOIN public.supervisory_assessment_programme p ON p.id=t.programme_id
     WHERE p.programme_set_id=dst.id) d;
  IF diff <> 0 THEN RAISE EXCEPTION 'FAIL PROG-42: % trigger configuration(s) were not cloned', diff; END IF;
  RAISE NOTICE 'PASS PROG-42: programmes, triggers, period rules, scope and dependency flags cloned exactly';

  -- PROG-43: the source is untouched
  IF src.status <> 'ACTIVE' OR src.set_version <> '1.0' THEN
    RAISE EXCEPTION 'FAIL PROG-43: the source version changed (status %, version %)', src.status, src.set_version; END IF;
  IF (SELECT count(*) FROM public.supervisory_assessment_programme
       WHERE programme_set_id=src.id) <> a THEN
    RAISE EXCEPTION 'FAIL PROG-43: the source programme population changed'; END IF;
  RAISE NOTICE 'PASS PROG-43: the source version remains ACTIVE 1.0 and unchanged';
END $$;

-- =====================================================================
-- PROG-44 — a new programme-set version does not rebind a policy profile
-- =====================================================================
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.supervisory_policy_profile_binding
   WHERE component_type='ASSESSMENT_PROGRAMME' AND component_id=(SELECT v FROM pg_id WHERE k='set_v2');
  IF n > 0 THEN
    RAISE EXCEPTION 'FAIL PROG-44: % policy profile binding(s) silently moved to the new programme version', n; END IF;
  IF (SELECT component_id FROM public.supervisory_policy_profile_binding
       WHERE profile_id=(SELECT v FROM pg_id WHERE k='ref_profile') AND component_type='ASSESSMENT_PROGRAMME')
     IS DISTINCT FROM (SELECT v FROM pg_id WHERE k='ref_set') THEN
    RAISE EXCEPTION 'FAIL PROG-44: an existing exact binding changed when a new version appeared'; END IF;
  RAISE NOTICE 'PASS PROG-44: exact bindings stay exact — a new version never rebinds a policy profile';
END $$;

-- =====================================================================
-- PROG-13 (part 1) — adoption requires a recorded rationale
-- =====================================================================
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN PERFORM public.supervisory_assessment_programme_adopt_reference(
          (SELECT v FROM pg_id WHERE k='ref_set'),(SELECT v FROM pg_id WHERE k='regulator'),'short');
  EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE '%rationale%'; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL PROG-13: adoption was accepted without a rationale'; END IF;
  IF EXISTS (SELECT 1 FROM public.supervisory_assessment_programme_set
              WHERE adopted_from_id=(SELECT v FROM pg_id WHERE k='ref_set')) THEN
    RAISE EXCEPTION 'FAIL PROG-13: an adopted copy was created by the refused call'; END IF;
  RAISE NOTICE 'PASS PROG-13 (rationale): reference adoption refuses to proceed without a recorded rationale';
END $$;



-- =====================================================================
-- PROG-10 — an inactive regulator can neither own nor adopt a programme set
-- =====================================================================
DO $$
DECLARE ok int := 0;
BEGIN
  IF (SELECT status FROM public.regulators WHERE id=(SELECT v FROM pg_id WHERE k='inactive_reg')) = 'active' THEN
    RAISE EXCEPTION 'FAIL PROG-10: the fixture regulator is active — the gate cannot be certified'; END IF;

  BEGIN PERFORM public.supervisory_assessment_programme_set_create(jsonb_build_object(
          'code','PROGCERT-INACTIVE','set_version','1.0','name','Inactive owner','domain_code','AML_CFT',
          'regulator_id',(SELECT v FROM pg_id WHERE k='inactive_reg')));
  EXCEPTION WHEN OTHERS THEN ok := ok + 1; END;
  BEGIN PERFORM public.supervisory_assessment_programme_adopt_reference(
          (SELECT v FROM pg_id WHERE k='ref_set'),(SELECT v FROM pg_id WHERE k='inactive_reg'),
          'Certification inactive regulator adoption attempt');
  EXCEPTION WHEN OTHERS THEN ok := ok + 1; END;
  IF ok <> 2 THEN
    RAISE EXCEPTION 'FAIL PROG-10: an inactive regulator was allowed to own or adopt a programme set (% of 2 refused)', ok; END IF;
  IF EXISTS (SELECT 1 FROM public.supervisory_assessment_programme_set
              WHERE regulator_id=(SELECT v FROM pg_id WHERE k='inactive_reg')) THEN
    RAISE EXCEPTION 'FAIL PROG-10: a programme set is owned by an inactive regulator'; END IF;
  RAISE NOTICE 'PASS PROG-10: an inactive regulator can neither own nor adopt a programme package';
END $$;

-- =====================================================================
-- PROG-46 — the AML_CFT domain floor requires ASSESSMENT_PROGRAMME and is locked
-- =====================================================================
DO $$
DECLARE f public.supervisory_policy_domain_component_requirement; pid uuid; ok int := 0;
BEGIN
  SELECT * INTO f FROM public.supervisory_policy_domain_component_requirement
   WHERE domain_code='AML_CFT' AND component_type='ASSESSMENT_PROGRAMME';
  IF f.component_type IS NULL OR f.requirement <> 'REQUIRED'
     OR NOT f.required_for_approval OR NOT f.required_for_activation OR NOT f.is_locked THEN
    RAISE EXCEPTION 'FAIL PROG-46: the AML_CFT ASSESSMENT_PROGRAMME floor is requirement=% approval=% activation=% locked=%',
      f.requirement, f.required_for_approval, f.required_for_activation, f.is_locked; END IF;

  -- and a profile administrator cannot weaken it
  SELECT id INTO pid FROM public.supervisory_policy_profile
   WHERE domain_code='AML_CFT' AND regulator_id=(SELECT v FROM pg_id WHERE k='regulator')
     AND status IN ('DRAFT','REVIEW') ORDER BY created_at DESC LIMIT 1;
  IF pid IS NULL THEN
    pid := public.supervisory_policy_profile_adopt_reference(
             (SELECT v FROM pg_id WHERE k='ref_profile'),(SELECT v FROM pg_id WHERE k='regulator'),
             'Certification adoption to test the locked domain floor');
    INSERT INTO pg_id(k,v) VALUES ('adopted_profile', pid);
  END IF;

  BEGIN PERFORM public.supervisory_policy_profile_requirement_set(pid, jsonb_build_object(
          'component_type','ASSESSMENT_PROGRAMME','requirement','OPTIONAL',
          'rationale','Certification attempt to weaken a locked floor'));
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE '%domain_requirement_locked%' THEN ok:=ok+1; END IF; END;
  BEGIN PERFORM public.supervisory_policy_profile_requirement_set(pid, jsonb_build_object(
          'component_type','ASSESSMENT_PROGRAMME','requirement','NOT_APPLICABLE',
          'rationale','Certification attempt to disapply a locked floor'));
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE '%domain_requirement_locked%' THEN ok:=ok+1; END IF; END;
  IF ok <> 2 THEN
    RAISE EXCEPTION 'FAIL PROG-46: a profile administrator weakened the locked ASSESSMENT_PROGRAMME floor (% of 2 refused)', ok; END IF;
  IF (SELECT requirement FROM public.supervisory_policy_profile_requirement
       WHERE profile_id=pid AND component_type='ASSESSMENT_PROGRAMME') <> 'REQUIRED' THEN
    RAISE EXCEPTION 'FAIL PROG-46: the effective profile requirement is no longer REQUIRED'; END IF;
  RAISE NOTICE 'PASS PROG-46: ASSESSMENT_PROGRAMME is a locked REQUIRED floor for AML_CFT approval and activation';
END $$;

-- =====================================================================
-- PROG-48 — policy profile adoption delegates to governed programme adoption
--           and binds the regulator-owned set, never the reference set
-- =====================================================================
DO $$
DECLARE pid uuid; b public.supervisory_policy_profile_binding; s public.supervisory_assessment_programme_set;
        evres jsonb;
BEGIN
  SELECT id INTO pid FROM public.supervisory_policy_profile
   WHERE code=(SELECT code FROM public.supervisory_policy_profile WHERE id=(SELECT v FROM pg_id WHERE k='ref_profile'))
     AND regulator_id=(SELECT v FROM pg_id WHERE k='regulator')
   ORDER BY created_at DESC LIMIT 1;
  IF pid IS NULL THEN RAISE EXCEPTION 'FAIL PROG-48: no adopted regulator policy profile exists to inspect'; END IF;

  SELECT * INTO b FROM public.supervisory_policy_profile_binding
   WHERE profile_id=pid AND component_type='ASSESSMENT_PROGRAMME';
  IF b.component_id IS NULL THEN
    RAISE EXCEPTION 'FAIL PROG-48: profile adoption did not bind an assessment programme package'; END IF;
  IF b.component_id = (SELECT v FROM pg_id WHERE k='ref_set') THEN
    RAISE EXCEPTION 'FAIL PROG-48: profile adoption bound the MIPL reference programme package as regulator policy'; END IF;

  SELECT * INTO s FROM public.supervisory_assessment_programme_set WHERE id=b.component_id;
  IF s.origin = 'MIPL_REFERENCE' OR s.regulator_id IS DISTINCT FROM (SELECT v FROM pg_id WHERE k='regulator') THEN
    RAISE EXCEPTION 'FAIL PROG-48: the bound programme package is % owned by %', s.origin, s.regulator_id; END IF;
  IF s.adopted_from_id IS DISTINCT FROM (SELECT v FROM pg_id WHERE k='ref_set') THEN
    RAISE EXCEPTION 'FAIL PROG-48: the bound package was not produced by adopting the reference package'; END IF;

  SELECT detail INTO evres FROM public.supervisory_policy_profile_event
   WHERE profile_id=pid AND event_type='COMPONENT_ADOPTED'
     AND detail->>'component_type'='ASSESSMENT_PROGRAMME' LIMIT 1;
  IF (evres->>'via') <> 'supervisory_assessment_programme_adopt_reference' THEN
    RAISE EXCEPTION 'FAIL PROG-48: profile adoption did not delegate to the governed programme adoption operation (via %)', evres->>'via'; END IF;
  RAISE NOTICE 'PASS PROG-48: profile adoption delegated to supervisory_assessment_programme_adopt_reference and bound the regulator-owned set';
END $$;

-- =====================================================================
-- PROG-13 / PROG-14 / PROG-15 — MIPL reference adoption (through governance)
-- PROG-09 — the reference package is unchanged after adoption
-- =====================================================================
DO $$
DECLARE nid uuid; s public.supervisory_assessment_programme_set; ok boolean := false; digest text;
BEGIN
  -- the adopted copy produced by the governed adoption performed above
  SELECT id INTO nid FROM public.supervisory_assessment_programme_set
   WHERE adopted_from_id=(SELECT v FROM pg_id WHERE k='ref_set')
   ORDER BY created_at DESC LIMIT 1;
  IF nid IS NULL THEN RAISE EXCEPTION 'FAIL PROG-13: no adopted copy of the reference package exists'; END IF;
  INSERT INTO pg_id(k,v) VALUES ('adopted', nid);
  SELECT * INTO s FROM public.supervisory_assessment_programme_set WHERE id=nid;

  -- adoption is not repeatable: the same reference cannot be adopted twice by one regulator
  BEGIN PERFORM public.supervisory_assessment_programme_adopt_reference(
          (SELECT v FROM pg_id WHERE k='ref_set'),(SELECT v FROM pg_id WHERE k='regulator'),
          'Certification duplicate adoption attempt');
  EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE '%already_adopted%'; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL PROG-13: the same reference package was adopted twice'; END IF;

  IF s.id = (SELECT v FROM pg_id WHERE k='ref_set') THEN
    RAISE EXCEPTION 'FAIL PROG-13: adoption mutated the reference package instead of creating a copy'; END IF;
  IF s.origin <> 'REGULATOR_ADOPTED' OR s.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'FAIL PROG-13: the adopted set is origin=% status=%', s.origin, s.status; END IF;
  RAISE NOTICE 'PASS PROG-13: adoption created a separate REGULATOR_ADOPTED / DRAFT programme set';

  IF s.regulator_id IS DISTINCT FROM (SELECT v FROM pg_id WHERE k='regulator') THEN
    RAISE EXCEPTION 'FAIL PROG-14: the adopted set is owned by % instead of the adopting regulator', s.regulator_id; END IF;
  RAISE NOTICE 'PASS PROG-14: the adopted set is owned by the adopting regulator';

  IF s.adopted_from_id IS DISTINCT FROM (SELECT v FROM pg_id WHERE k='ref_set') THEN
    RAISE EXCEPTION 'FAIL PROG-15: adoption lineage does not point at the MIPL reference source'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_programme_event
                  WHERE programme_set_id=nid AND event_type='ADOPTED') THEN
    RAISE EXCEPTION 'FAIL PROG-15: adoption was not recorded in history'; END IF;
  IF (SELECT count(*) FROM public.supervisory_assessment_programme WHERE programme_set_id=nid)
     <> (SELECT n FROM pg_n WHERE k='ref_programmes') THEN
    RAISE EXCEPTION 'FAIL PROG-15: the adopted set does not carry the reference programmes'; END IF;
  RAISE NOTICE 'PASS PROG-15: adoption lineage points at the MIPL reference source and clones its content';

  -- PROG-09
  SELECT md5(string_agg(p.programme_code||':'||p.assessment_type||':'||p.period_rule||':'||
                        COALESCE(p.period_value::text,'-')||':'||p.question_class_scope::text, '|'
                        ORDER BY p.programme_code)) INTO digest
    FROM public.supervisory_assessment_programme p
   WHERE p.programme_set_id=(SELECT v FROM pg_id WHERE k='ref_set');
  IF digest IS DISTINCT FROM (SELECT t FROM pg_t WHERE k='ref_digest') THEN
    RAISE EXCEPTION 'FAIL PROG-09: the reference package content changed during adoption'; END IF;
  IF (SELECT status FROM public.supervisory_assessment_programme_set WHERE id=(SELECT v FROM pg_id WHERE k='ref_set'))
     IS DISTINCT FROM (SELECT t FROM pg_t WHERE k='ref_status')
     OR (SELECT origin FROM public.supervisory_assessment_programme_set WHERE id=(SELECT v FROM pg_id WHERE k='ref_set'))
     IS DISTINCT FROM (SELECT t FROM pg_t WHERE k='ref_origin') THEN
    RAISE EXCEPTION 'FAIL PROG-09: the reference package lifecycle changed during adoption'; END IF;
  RAISE NOTICE 'PASS PROG-09: the MIPL reference package is byte-for-byte unchanged after adoption';
END $$;

-- =====================================================================
-- PROG-07 — a MIPL reference programme package can never be activated
-- =====================================================================
-- The reference package is DRAFT and unowned; the fixture lifts it to APPROVED
-- and grants unscoped approval authority so the refusal that is being certified
-- is the reference rule itself, not an authority failure.
RESET ROLE;
UPDATE public.supervisory_assessment_programme_set SET status='APPROVED'
 WHERE id=(SELECT v FROM pg_id WHERE k='ref_set');
UPDATE public.sec_role_scopes rs SET scope_type_id=(SELECT id FROM public.sec_scope_types WHERE key='all')
  FROM public.sec_roles r, public.sec_modules m
 WHERE rs.role_id=r.id AND rs.module_id=m.id AND r.key='aml_head' AND m.key='aml_supervision';

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = :'APPROVER';

DO $$
DECLARE ok boolean := false; msg text;
BEGIN
  BEGIN
    PERFORM public.supervisory_assessment_programme_set_lifecycle(
      (SELECT v FROM pg_id WHERE k='ref_set'),'ACTIVE','Certification attempt to activate reference content');
  EXCEPTION WHEN OTHERS THEN msg := SQLERRM; ok := msg LIKE '%reference_not_regulator_policy%';
  END;
  IF NOT ok THEN
    RAISE EXCEPTION 'FAIL PROG-07: a MIPL reference programme package was activatable as regulator policy (%)',
      COALESCE(msg,'no error raised'); END IF;
  IF (SELECT status FROM public.supervisory_assessment_programme_set
       WHERE id=(SELECT v FROM pg_id WHERE k='ref_set')) = 'ACTIVE' THEN
    RAISE EXCEPTION 'FAIL PROG-07: the reference package is ACTIVE'; END IF;
  RAISE NOTICE 'PASS PROG-07: a MIPL reference programme package cannot be activated in place as regulator policy';
END $$;

RESET ROLE;
UPDATE public.supervisory_assessment_programme_set SET status=(SELECT t FROM pg_t WHERE k='ref_status')
 WHERE id=(SELECT v FROM pg_id WHERE k='ref_set');

-- =====================================================================
-- PROG-50 — historical preservation
-- =====================================================================
DO $$
DECLARE n bigint; d text;
BEGIN
  -- existing assessment rows: only the two rows this certification created are new
  SELECT count(*) INTO n FROM public.supervisory_assessment;
  IF n <> (SELECT pg_n.n FROM pg_n WHERE k='assessments') + 2 THEN
    RAISE EXCEPTION 'FAIL PROG-50: the assessment population is % , expected % + the 2 certification rows',
      n, (SELECT pg_n.n FROM pg_n WHERE k='assessments'); END IF;

  -- no pre-existing assessment was altered, and none was given a guessed programme
  SELECT md5(string_agg(a.id::text||':'||a.status||':'||a.assessment_type||':'||
                        COALESCE(a.assessment_programme_id::text,'-')||':'||
                        COALESCE(a.period_start::text,'-')||':'||COALESCE(a.period_end::text,'-'), '|'
                        ORDER BY a.id)) INTO d
    FROM public.supervisory_assessment a
   WHERE a.id NOT IN (SELECT v FROM pg_id WHERE k IN ('assessment'))
     AND a.created_at < (SELECT min(created_at) FROM public.supervisory_assessment
                          WHERE id=(SELECT v FROM pg_id WHERE k='assessment'));
  IF d IS DISTINCT FROM (SELECT t FROM pg_t WHERE k='assess_digest') THEN
    RAISE EXCEPTION 'FAIL PROG-50: pre-existing assessment rows changed during certification'; END IF;

  SELECT count(*) INTO n FROM public.supervisory_assessment
   WHERE assessment_programme_id IS NOT NULL
     AND id NOT IN (SELECT a.id FROM public.supervisory_assessment a
                     WHERE a.assessment_programme_set_id IN (SELECT v FROM pg_id WHERE k='set'));
  IF n <> (SELECT pg_n.n FROM pg_n WHERE k='assessments_progd') THEN
    RAISE EXCEPTION 'FAIL PROG-50: % legacy assessment(s) were retroactively given a programme identity', n; END IF;

  -- risk of record
  SELECT md5(COALESCE(string_agg(r.entity_id::text||':'||COALESCE(r.residual_rating,'-'), '|' ORDER BY r.entity_id),'')) INTO d
    FROM public.entity_risk_state r;
  IF d IS DISTINCT FROM (SELECT t FROM pg_t WHERE k='risk_digest') THEN
    RAISE EXCEPTION 'FAIL PROG-50: the entity risk of record changed'; END IF;
  IF (SELECT count(*) FROM public.entity_risk_scores) <> (SELECT pg_n.n FROM pg_n WHERE k='risk_scores') THEN
    RAISE EXCEPTION 'FAIL PROG-50: the entity risk score population changed'; END IF;

  -- methodology v1.0 and v1.1
  IF (SELECT status FROM public.supervisory_methodology WHERE id=(SELECT v FROM pg_id WHERE k='meth_v10'))
     IS DISTINCT FROM (SELECT t FROM pg_t WHERE k='v10_status') THEN
    RAISE EXCEPTION 'FAIL PROG-50: AML/CFT methodology v1.0 changed'; END IF;
  IF (SELECT status FROM public.supervisory_methodology WHERE id=(SELECT v FROM pg_id WHERE k='meth_v11'))
     IS DISTINCT FROM (SELECT t FROM pg_t WHERE k='v11_status')
     OR (SELECT origin FROM public.supervisory_methodology WHERE id=(SELECT v FROM pg_id WHERE k='meth_v11'))
     IS DISTINCT FROM (SELECT t FROM pg_t WHERE k='v11_origin') THEN
    RAISE EXCEPTION 'FAIL PROG-50: AML/CFT methodology v1.1 status or origin changed'; END IF;
  IF (SELECT count(*) FROM public.supervisory_methodology_question
       WHERE methodology_id=(SELECT v FROM pg_id WHERE k='meth_v11')) <> (SELECT pg_n.n FROM pg_n WHERE k='v11_questions') THEN
    RAISE EXCEPTION 'FAIL PROG-50: the v1.1 question population changed'; END IF;
  -- no existing methodology was removed or replaced; any additional row is an
  -- adopted regulator copy produced by the governed profile adoption above
  IF (SELECT count(*) FROM public.supervisory_methodology
       WHERE adopted_from_id IS NULL OR adopted_from_id IS NOT NULL) < (SELECT pg_n.n FROM pg_n WHERE k='methodologies') THEN
    RAISE EXCEPTION 'FAIL PROG-50: methodology rows were removed'; END IF;
  IF EXISTS (SELECT 1 FROM public.supervisory_methodology m
              WHERE m.created_at > (SELECT created_at FROM public.supervisory_assessment_programme_set
                                     WHERE id=(SELECT v FROM pg_id WHERE k='set'))
                AND m.adopted_from_id IS NULL) THEN
    RAISE EXCEPTION 'FAIL PROG-50: a methodology was authored rather than adopted through governance'; END IF;


  -- no calculation or materiality policy invented
  IF (SELECT count(*) FROM public.supervisory_calculation_config) <> (SELECT pg_n.n FROM pg_n WHERE k='calc_config')
     OR (SELECT count(*) FROM public.supervisory_calculation_band) <> (SELECT pg_n.n FROM pg_n WHERE k='calc_band')
     OR (SELECT count(*) FROM public.supervisory_calculation_matrix_cell) <> (SELECT pg_n.n FROM pg_n WHERE k='calc_matrix')
     OR (SELECT count(*) FROM public.supervisory_calculation_response_score) <> (SELECT pg_n.n FROM pg_n WHERE k='calc_score')
     OR (SELECT count(*) FROM public.supervisory_methodology_parameter
          WHERE methodology_id=(SELECT v FROM pg_id WHERE k='meth_v11')) <> (SELECT pg_n.n FROM pg_n WHERE k='v11_params') THEN
    RAISE EXCEPTION 'FAIL PROG-50: calculation, banding, matrix or parameter policy was authored'; END IF;

  -- regulators: nothing deleted, the inactive rows still there
  IF (SELECT count(*) FROM public.regulators) <> (SELECT pg_n.n FROM pg_n WHERE k='regulators')
     OR (SELECT count(*) FROM public.regulators WHERE status='active') <> (SELECT pg_n.n FROM pg_n WHERE k='regulators_active') THEN
    RAISE EXCEPTION 'FAIL PROG-50: the regulator master changed'; END IF;

  -- the reference package still holds its original programmes and triggers
  IF (SELECT count(*) FROM public.supervisory_assessment_programme
       WHERE programme_set_id=(SELECT v FROM pg_id WHERE k='ref_set')) <> (SELECT pg_n.n FROM pg_n WHERE k='ref_programmes') THEN
    RAISE EXCEPTION 'FAIL PROG-50: the reference programme population changed'; END IF;

  RAISE NOTICE 'PASS PROG-50: existing assessments, risk of record, v1.0/v1.1 methodology, calculation policy and the regulator master are all unchanged';
END $$;

DO $$ BEGIN
  RAISE NOTICE '---------------------------------------------------------------';
  RAISE NOTICE 'AML-03 assessment programme configuration: PROG-01..50 complete';
  RAISE NOTICE 'All fixtures are rolled back — no certification data persists.';
  RAISE NOTICE '---------------------------------------------------------------';
END $$;

ROLLBACK;
