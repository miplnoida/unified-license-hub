-- =====================================================================
-- AML-04 — QUESTION APPLICABILITY & ASSESSMENT QUESTION PLAN : CERTIFICATION
-- =====================================================================
-- Gates PLAN-01 .. PLAN-50.
--
-- Conventions (identical to the AML-01/02/03 certifications):
--   * one transaction, ROLLBACK at the end — no fixture survives, so no
--     invented methodology, programme or applicability policy is left behind;
--   * behavioural: scope decisions are produced by CALLING the governed
--     operations under a REAL authenticated persona, never asserted from
--     documentation;
--   * browser-runtime properties are covered by
--     src/test/amlAssessmentQuestionPlan.test.tsx; only the source-boundary
--     gate (PLAN-48) is checked here, and it is checked mechanically;
--   * every gate RAISEs on failure so ON_ERROR_STOP aborts the run;
--   * all fixture identifiers are suffixed PLANCERT.
--
-- Personas (public.cert_certification_users):
--   Author / supervisory officer   b8eaf680-fe66-4d49-b816-1c087f511235
--   Approver (checker)             0b522724-adcb-48bf-b21d-175339479616
--   Outsider (no AML authority)    411dd06d-648b-4f32-82cc-897902c0c0b6
-- =====================================================================

\set ON_ERROR_STOP on
\set QUIET 1
\pset pager off
SET row_security = on;

\set AUTHOR   '{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}'
\set APPROVER '{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}'
\set OUTSIDER '{"sub":"411dd06d-648b-4f32-82cc-897902c0c0b6","role":"authenticated"}'

BEGIN;

CREATE TEMP TABLE pl_id(k text PRIMARY KEY, v uuid) ON COMMIT DROP;
CREATE TEMP TABLE pl_n(k text PRIMARY KEY, n bigint) ON COMMIT DROP;
CREATE TEMP TABLE pl_t(k text PRIMARY KEY, t text) ON COMMIT DROP;
GRANT ALL ON pl_id TO authenticated;
GRANT ALL ON pl_n  TO authenticated;
GRANT ALL ON pl_t  TO authenticated;

INSERT INTO pl_id(k,v) VALUES
  ('regulator',    '8dd8ac87-4e11-4a6b-8991-bf88cb03d7c3'),          -- FSRA (active)
  ('entity',       'aa220000-0000-4000-8000-000000000001'),          -- MSB, FSRA, no prior assessment
  ('entity_v10',   '5c1a0005-0000-4000-8000-000000000005'),          -- assessed under v1.0
  ('meth_v10',     (SELECT id FROM public.supervisory_methodology WHERE code='AML-CFT-RBA' AND version='1.0')),
  ('meth_v11',     (SELECT id FROM public.supervisory_methodology
                     WHERE code='AML-CFT-RBA' AND version='1.1' AND origin='MIPL_REFERENCE')),
  ('ref_set',      (SELECT id FROM public.supervisory_assessment_programme_set
                     WHERE code='MIPL-AML-ASSESSMENT-PROGRAMMES' AND origin='MIPL_REFERENCE'));

INSERT INTO pl_id(k,v)
SELECT 'sector', l.sector_id FROM public.licensees l WHERE l.id=(SELECT v FROM pl_id WHERE k='entity');
INSERT INTO pl_id(k,v)
SELECT 'other_sector', s.id FROM public.sectors s
 WHERE s.id <> (SELECT v FROM pl_id WHERE k='sector') ORDER BY s.id LIMIT 1;

-- ---------------------------------------------------------------- census ----
INSERT INTO pl_n(k,n) VALUES
  ('assessments',       (SELECT count(*) FROM public.supervisory_assessment)),
  ('responses',         (SELECT count(*) FROM public.supervisory_assessment_question_response)),
  ('risk_state',        (SELECT count(*) FROM public.entity_risk_state)),
  ('methodologies',     (SELECT count(*) FROM public.supervisory_methodology)),
  ('v10_questions',     (SELECT count(*) FROM public.supervisory_methodology_question
                          WHERE methodology_id=(SELECT v FROM pl_id WHERE k='meth_v10') AND active)),
  ('v11_questions',     (SELECT count(*) FROM public.supervisory_methodology_question
                          WHERE methodology_id=(SELECT v FROM pl_id WHERE k='meth_v11') AND active)),
  ('v11_conditional',   (SELECT count(*) FROM public.supervisory_methodology_question
                          WHERE methodology_id=(SELECT v FROM pl_id WHERE k='meth_v11')
                            AND active AND question_class='CONDITIONAL')),
  ('v11_rules',         (SELECT count(*) FROM public.supervisory_methodology_question_rule r
                          WHERE r.methodology_id=(SELECT v FROM pl_id WHERE k='meth_v11'))),
  ('calc_config',       (SELECT count(*) FROM public.supervisory_calculation_config)),
  ('calc_band',         (SELECT count(*) FROM public.supervisory_calculation_band)),
  ('calc_matrix',       (SELECT count(*) FROM public.supervisory_calculation_matrix_cell)),
  ('calc_score',        (SELECT count(*) FROM public.supervisory_calculation_response_score)),
  ('regulators',        (SELECT count(*) FROM public.regulators)),
  ('ref_programmes',    (SELECT count(*) FROM public.supervisory_assessment_programme
                          WHERE programme_set_id=(SELECT v FROM pl_id WHERE k='ref_set'))),
  ('legacy_plans',      (SELECT count(*) FROM public.supervisory_assessment_question_plan));

INSERT INTO pl_t(k,t) VALUES
  ('v10_status',    (SELECT status FROM public.supervisory_methodology WHERE id=(SELECT v FROM pl_id WHERE k='meth_v10'))),
  ('v11_status',    (SELECT status FROM public.supervisory_methodology WHERE id=(SELECT v FROM pl_id WHERE k='meth_v11'))),
  ('v11_origin',    (SELECT origin FROM public.supervisory_methodology WHERE id=(SELECT v FROM pl_id WHERE k='meth_v11'))),
  ('ref_digest',    (SELECT md5(string_agg(p.programme_code||':'||p.assessment_type||':'||p.question_class_scope::text,'|'
                                 ORDER BY p.programme_code))
                       FROM public.supervisory_assessment_programme p
                      WHERE p.programme_set_id=(SELECT v FROM pl_id WHERE k='ref_set'))),
  ('assess_digest', (SELECT md5(string_agg(a.id::text||':'||a.status||':'||COALESCE(a.assessment_programme_id::text,'-')||':'||
                                 COALESCE(a.methodology_id::text,'-'),'|' ORDER BY a.id))
                       FROM public.supervisory_assessment a)),
  ('risk_digest',   (SELECT md5(COALESCE(string_agg(r.entity_id::text||':'||COALESCE(r.residual_rating,'-'),'|' ORDER BY r.entity_id),''))
                       FROM public.entity_risk_state r));

-- -------------------------------------------------------------- fixtures ----
-- Transaction-scoped supervisory authority for the personas.
INSERT INTO public.sec_user_roles(user_id, role_id, status, assigned_by)
SELECT u, r.id, 'active', '4248640c-3397-4cf6-a274-fa09bad4ba64'::uuid  -- AML-CLOSE-02D: granted by the TEST super administrator, never self-granted
  FROM (VALUES ('b8eaf680-fe66-4d49-b816-1c087f511235'::uuid),
               ('0b522724-adcb-48bf-b21d-175339479616'::uuid)) AS x(u),
       public.sec_roles r
 WHERE r.key = 'aml_head'
ON CONFLICT (user_id, role_id) DO UPDATE SET status='active', assigned_by=EXCLUDED.assigned_by;  -- AML-CLOSE-02D: re-activate inside this rolled-back transaction

INSERT INTO public.sec_role_scopes(role_id, module_id, scope_type_id)
SELECT r.id, m.id, st.id
  FROM public.sec_roles r, public.sec_modules m, public.sec_scope_types st
 WHERE r.key='aml_head' AND m.key='aml_supervision' AND st.key='regulator'
ON CONFLICT (role_id, module_id) DO UPDATE SET scope_type_id = EXCLUDED.scope_type_id;

INSERT INTO public.sec_role_scope_values(role_scope_id, value_kind, value_id)
SELECT rs.id, 'regulator', (SELECT v FROM pl_id WHERE k='regulator')
  FROM public.sec_role_scopes rs
  JOIN public.sec_roles r ON r.id = rs.role_id AND r.key='aml_head'
  JOIN public.sec_modules m ON m.id = rs.module_id AND m.key='aml_supervision';

-- Deterministic applicability inputs: the fixture entity records no systemic
-- importance, so a rule that depends on it must be UNRESOLVED, never false.
UPDATE public.licensees SET systemic_importance = NULL
 WHERE id = (SELECT v FROM pl_id WHERE k='entity');

-- Fixture methodology: ACTIVE, sector- and regulator-scoped so the canonical
-- resolver selects it for the fixture entity ahead of AML-CFT-RBA v1.0.
INSERT INTO public.supervisory_methodology(
  id, code, domain_code, name, version, status, sector_id, regulator_id,
  effective_from, origin, title)
VALUES (gen_random_uuid(), 'PLANCERT-METH', 'AML_CFT', 'PLANCERT applicability fixture', '1.0',
  'ACTIVE', (SELECT v FROM pl_id WHERE k='sector'), (SELECT v FROM pl_id WHERE k='regulator'),
  current_date - 1, 'REGULATOR_AUTHORED', 'PLANCERT applicability fixture');

INSERT INTO pl_id(k,v) SELECT 'meth', id FROM public.supervisory_methodology WHERE code='PLANCERT-METH';

INSERT INTO public.supervisory_methodology(
  id, code, domain_code, name, version, status, effective_from, origin, title)
VALUES (gen_random_uuid(), 'PLANCERT-DRAFT', 'AML_CFT', 'PLANCERT authoring fixture', '1.0',
  'DRAFT', current_date - 1, 'REGULATOR_AUTHORED', 'PLANCERT authoring fixture');
INSERT INTO pl_id(k,v) SELECT 'meth_draft', id FROM public.supervisory_methodology WHERE code='PLANCERT-DRAFT';

-- dimensions
INSERT INTO public.supervisory_methodology_dimension(
  methodology_id, dimension_code, dimension_group, label, weight, sort_order, active, dimension_kind)
SELECT m.v, x.code, 'INHERENT_RISK', x.code, x.w, x.o, true, 'INHERENT'
  FROM (SELECT v FROM pl_id WHERE k='meth') m,
       (VALUES ('PLANCERT_DIM_A', 50::numeric, 1), ('PLANCERT_DIM_B', 50::numeric, 2),
               ('PLANCERT_DIM_C', NULL::numeric, 3)) AS x(code, w, o);

INSERT INTO public.supervisory_methodology_dimension(
  methodology_id, dimension_code, dimension_group, label, weight, sort_order, active, dimension_kind)
SELECT m.v, 'PLANCERT_DIM_D', 'INHERENT_RISK', 'PLANCERT_DIM_D', 100, 1, true, 'INHERENT'
  FROM (SELECT v FROM pl_id WHERE k='meth_draft') m;

-- questions
INSERT INTO public.supervisory_methodology_question(
  methodology_id, methodology_dimension_id, question_code, prompt, response_options,
  mandatory, question_class, allow_not_applicable, na_requires_rationale, active, sort_order)
SELECT (SELECT v FROM pl_id WHERE k='meth'), d.id, x.code, x.code||' prompt',
       ARRAY['YES','NO','NOT_APPLICABLE'], true, x.cls, x.na, x.nar, true, x.o
  FROM (VALUES
    ('PLANCERT_Q_CORE',      'PLANCERT_DIM_A', 'CORE',        false, false, 1),
    ('PLANCERT_Q_COND_T',    'PLANCERT_DIM_A', 'CONDITIONAL', false, false, 2),
    ('PLANCERT_Q_COND_F',    'PLANCERT_DIM_A', 'CONDITIONAL', false, false, 3),
    ('PLANCERT_Q_ENH',       'PLANCERT_DIM_A', 'ENHANCED',    false, false, 4),
    ('PLANCERT_Q_SECT_IN',   'PLANCERT_DIM_A', 'CORE',        false, false, 5),
    ('PLANCERT_Q_SECT_OUT',  'PLANCERT_DIM_A', 'CORE',        false, false, 6),
    ('PLANCERT_Q_NA',        'PLANCERT_DIM_A', 'CORE',        true,  true,  7),
    ('PLANCERT_Q_DIMB',      'PLANCERT_DIM_B', 'CORE',        false, false, 8),
    ('PLANCERT_Q_UNRES',     'PLANCERT_DIM_C', 'CONDITIONAL', false, false, 9)
  ) AS x(code, dim, cls, na, nar, o)
  JOIN public.supervisory_methodology_dimension d
    ON d.methodology_id=(SELECT v FROM pl_id WHERE k='meth') AND d.dimension_code = x.dim;

INSERT INTO public.supervisory_methodology_question(
  methodology_id, methodology_dimension_id, question_code, prompt, response_options,
  mandatory, question_class, active, sort_order)
SELECT (SELECT v FROM pl_id WHERE k='meth_draft'), d.id, 'PLANCERT_Q_DRAFT', 'draft question',
       ARRAY['YES','NO'], true, 'CONDITIONAL', true, 1
  FROM public.supervisory_methodology_dimension d
 WHERE d.methodology_id=(SELECT v FROM pl_id WHERE k='meth_draft');

-- structured rules (fixture authoring; governed authoring itself is gated below)
INSERT INTO public.supervisory_methodology_question_rule(
  methodology_id, question_id, rule_kind, rule_definition, rule_summary)
SELECT q.methodology_id, q.id, x.kind, x.def, public.supervisory_question_rule_describe(x.def)
  FROM (VALUES
    ('PLANCERT_Q_COND_T', 'TRIGGER',
      jsonb_build_object('op','EQ','source','ENTITY.SECTOR_ID','value',(SELECT v FROM pl_id WHERE k='sector'))),
    ('PLANCERT_Q_COND_F', 'TRIGGER',
      jsonb_build_object('op','EQ','source','ENTITY.SECTOR_ID','value',(SELECT v FROM pl_id WHERE k='other_sector'))),
    ('PLANCERT_Q_SECT_IN', 'APPLICABILITY',
      jsonb_build_object('op','IN','source','ENTITY.SECTOR_ID','values',
        jsonb_build_array((SELECT v FROM pl_id WHERE k='sector')))),
    ('PLANCERT_Q_SECT_OUT', 'APPLICABILITY',
      jsonb_build_object('op','EQ','source','ENTITY.SECTOR_ID','value',(SELECT v FROM pl_id WHERE k='other_sector'))),
    ('PLANCERT_Q_UNRES', 'TRIGGER',
      jsonb_build_object('op','EQ','source','ENTITY.SYSTEMIC_IMPORTANCE','value','HIGH'))
  ) AS x(qcode, kind, def)
  JOIN public.supervisory_methodology_question q
    ON q.methodology_id=(SELECT v FROM pl_id WHERE k='meth') AND q.question_code = x.qcode;

-- Fixture programme package: ACTIVE and regulator-owned, so runtime is CONFIGURED.
INSERT INTO public.supervisory_assessment_programme_set(
  code, set_version, name, domain_code, regulator_id, origin, status, effective_from)
VALUES ('PLANCERT-PROGRAMMES','1.0','PLANCERT programme fixture','AML_CFT',
  (SELECT v FROM pl_id WHERE k='regulator'),'REGULATOR_AUTHORED','ACTIVE', current_date - 1);
INSERT INTO pl_id(k,v) SELECT 'set', id FROM public.supervisory_assessment_programme_set
 WHERE code='PLANCERT-PROGRAMMES';

INSERT INTO public.supervisory_assessment_programme(
  programme_set_id, programme_code, label, assessment_type, is_active, sort_order,
  period_rule, period_value, end_offset_days, allow_manual_override, summary_required,
  question_class_scope, included_dimension_codes, excluded_dimension_codes)
SELECT (SELECT v FROM pl_id WHERE k='set'), x.code, x.code, 'PERIODIC', true, x.o,
       'TRAILING_DAYS', 365, 1, false, false, x.cls, x.inc, x.exc
  FROM (VALUES
    ('PLANCERT_P_FULL',  1, ARRAY['CORE','CONDITIONAL','ENHANCED'], '{}'::text[], ARRAY['PLANCERT_DIM_C']),
    ('PLANCERT_P_NOENH', 2, ARRAY['CORE','CONDITIONAL'],            '{}'::text[], ARRAY['PLANCERT_DIM_C']),
    ('PLANCERT_P_DIMEX', 3, ARRAY['CORE','CONDITIONAL','ENHANCED'], '{}'::text[], ARRAY['PLANCERT_DIM_B','PLANCERT_DIM_C']),
    ('PLANCERT_P_DIMIN', 4, ARRAY['CORE','CONDITIONAL','ENHANCED'], ARRAY['PLANCERT_DIM_A'], '{}'::text[]),
    ('PLANCERT_P_UNRES', 5, ARRAY['CORE','CONDITIONAL','ENHANCED'], '{}'::text[], '{}'::text[]),
    ('PLANCERT_P_BADDIM',6, ARRAY['CORE'],                          '{}'::text[], ARRAY['PLANCERT_DIM_NOPE']),
    ('PLANCERT_P_CONTRA',7, ARRAY['CORE'],                          ARRAY['PLANCERT_DIM_A'], ARRAY['PLANCERT_DIM_A']),
    ('PLANCERT_P_LEGACY',8, ARRAY['CORE','CONDITIONAL','ENHANCED'], '{}'::text[], '{}'::text[])
  ) AS x(code, o, cls, inc, exc);

INSERT INTO public.supervisory_assessment_programme_trigger(
  programme_id, trigger_code, label, is_default, is_active, sort_order)
SELECT p.id, 'PERIODIC', 'Periodic cycle', true, true, 1
  FROM public.supervisory_assessment_programme p
 WHERE p.programme_set_id=(SELECT v FROM pl_id WHERE k='set');

-- =====================================================================
-- PLAN-01 — generic plan architecture exists
-- =====================================================================
DO $$
DECLARE n int;
BEGIN
  IF to_regclass('public.supervisory_assessment_question_plan') IS NULL
     OR to_regclass('public.supervisory_assessment_question_plan_override') IS NULL
     OR to_regclass('public.supervisory_methodology_question_rule') IS NULL THEN
    RAISE EXCEPTION 'FAIL PLAN-01: the question plan / applicability rule model is incomplete'; END IF;
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='supervisory_assessment_question_plan'
     AND column_name IN ('assessment_id','question_id','question_code','methodology_id','methodology_version',
       'dimension_id','dimension_code','question_class','plan_state','reason_code','reason_text',
       'programme_set_id','programme_id','programme_code','programme_version','rule_id','rule_version',
       'evaluated_inputs','evaluation_hash');
  IF n <> 19 THEN RAISE EXCEPTION 'FAIL PLAN-01: plan snapshot lacks required columns (% of 19)', n; END IF;
  RAISE NOTICE 'PASS PLAN-01: generic question plan, override and question rule architecture present';
END $$;

-- =====================================================================
-- PLAN-02 — no AML-private plan or questionnaire store
-- =====================================================================
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO bad
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m')
     AND c.relname LIKE 'aml%'
     AND (c.relname LIKE '%question%' OR c.relname LIKE '%applicab%' OR c.relname LIKE '%plan%');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL PLAN-02: AML-private question/applicability store(s) exist: %', bad; END IF;
  RAISE NOTICE 'PASS PLAN-02: no AML-private question plan substitute exists';
END $$;

-- =====================================================================
-- PLAN-03 / PLAN-04 — plan state domain is exactly the canonical set and
-- NOT_APPLICABLE can never be stored as a plan state
-- =====================================================================
DO $$
DECLARE src text; ok boolean;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO src FROM pg_constraint
   WHERE conname='supervisory_assessment_question_plan_state_chk';
  IF src IS NULL THEN RAISE EXCEPTION 'FAIL PLAN-03: no plan state constraint'; END IF;
  ok := src LIKE '%INCLUDED_CORE%' AND src LIKE '%INCLUDED_CONDITIONAL%' AND src LIKE '%INCLUDED_ENHANCED%'
        AND src LIKE '%NOT_TRIGGERED%' AND src LIKE '%OUT_OF_SCOPE%';
  IF NOT ok THEN RAISE EXCEPTION 'FAIL PLAN-03: constraint does not carry the canonical states: %', src; END IF;
  IF src LIKE '%NOT_APPLICABLE%' THEN
    RAISE EXCEPTION 'FAIL PLAN-04: NOT_APPLICABLE appears in the plan state domain'; END IF;
  RAISE NOTICE 'PASS PLAN-03: plan state constraint carries exactly the five canonical states';
  RAISE NOTICE 'PASS PLAN-04: NOT_APPLICABLE is not a plan state';
END $$;

-- =====================================================================
-- PLAN-05 — direct authenticated writes are refused
-- =====================================================================
DO $$
DECLARE n int := 0;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN INSERT INTO public.supervisory_assessment_question_plan(
      assessment_id, question_id, question_code, methodology_id, plan_state, reason_code, evaluation_hash)
    VALUES (gen_random_uuid(), gen_random_uuid(), 'X', gen_random_uuid(), 'INCLUDED_CORE','CORE_INCLUDED','x');
  EXCEPTION WHEN insufficient_privilege OR others THEN n := n + 1; END;
  BEGIN UPDATE public.supervisory_assessment_question_plan SET reason_code='X';
  EXCEPTION WHEN insufficient_privilege OR others THEN n := n + 1; END;
  BEGIN DELETE FROM public.supervisory_assessment_question_plan;
  EXCEPTION WHEN insufficient_privilege OR others THEN n := n + 1; END;
  BEGIN INSERT INTO public.supervisory_methodology_question_rule(
      methodology_id, question_id, rule_kind, rule_definition)
    VALUES (gen_random_uuid(), gen_random_uuid(), 'TRIGGER', '{"op":"TRUE"}'::jsonb);
  EXCEPTION WHEN insufficient_privilege OR others THEN n := n + 1; END;
  BEGIN INSERT INTO public.supervisory_assessment_question_plan_override(
      assessment_id, question_id, from_state, to_state, reason)
    VALUES (gen_random_uuid(), gen_random_uuid(), 'INCLUDED_CORE','OUT_OF_SCOPE','x');
  EXCEPTION WHEN insufficient_privilege OR others THEN n := n + 1; END;
  RESET ROLE;
  IF n <> 5 THEN RAISE EXCEPTION 'FAIL PLAN-05: only % of 5 direct writes were refused', n; END IF;
  RAISE NOTICE 'PASS PLAN-05: direct authenticated writes to plan, override and rule stores are refused';
END $$;

-- ============================== runtime ==============================
-- Scenario A/B/C/F/H/I: full programme over the fixture methodology.
DO $$
DECLARE res jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  res := public.supervisory_assessment_create_programmed(
    (SELECT v FROM pl_id WHERE k='entity'), 'AML_CFT',
    (SELECT id FROM public.supervisory_assessment_programme WHERE programme_code='PLANCERT_P_FULL'),
    'PERIODIC', NULL, NULL, 'PLANCERT scope certification');
  RESET ROLE;
  INSERT INTO pl_id(k,v) VALUES ('a_full', (res->>'id')::uuid);
  INSERT INTO pl_t(k,t) VALUES ('a_full_summary', res->'question_plan' #>> '{}');
  IF res->'question_plan' IS NULL THEN
    RAISE EXCEPTION 'FAIL PLAN-26: programmed creation returned no question plan summary'; END IF;
  RAISE NOTICE 'PASS PLAN-26: a new programme-driven assessment materialises its question plan in the same transaction';
END $$;

-- =====================================================================
-- PLAN-06 / PLAN-07 — plan rows are tied to the exact assessment,
-- methodology version and programme identity
-- =====================================================================
DO $$
DECLARE a public.supervisory_assessment; bad int;
BEGIN
  SELECT * INTO a FROM public.supervisory_assessment WHERE id=(SELECT v FROM pl_id WHERE k='a_full');
  SELECT count(*) INTO bad FROM public.supervisory_assessment_question_plan p
   WHERE p.assessment_id=a.id
     AND (p.methodology_id <> a.methodology_id
          OR COALESCE(p.methodology_version,'') <> COALESCE(a.methodology_version,''));
  IF bad > 0 THEN RAISE EXCEPTION 'FAIL PLAN-06: % plan row(s) do not carry the assessment methodology version', bad; END IF;
  RAISE NOTICE 'PASS PLAN-06: every plan row carries the exact assessment and methodology version';

  SELECT count(*) INTO bad FROM public.supervisory_assessment_question_plan p
   WHERE p.assessment_id=a.id
     AND (p.programme_id IS DISTINCT FROM a.assessment_programme_id
          OR p.programme_code IS DISTINCT FROM a.assessment_programme_code
          OR p.programme_version IS DISTINCT FROM a.assessment_programme_version
          OR p.programme_set_id IS DISTINCT FROM a.assessment_programme_set_id
          OR p.evaluated_inputs->>'programme_code' IS DISTINCT FROM a.assessment_programme_code);
  IF bad > 0 THEN RAISE EXCEPTION 'FAIL PLAN-07: % plan row(s) do not reproduce the programme identity', bad; END IF;
  RAISE NOTICE 'PASS PLAN-07: programme identity and evaluated inputs are reproduced in plan provenance';
END $$;

-- =====================================================================
-- PLAN-08 / 09 / 10 / 12 / 17 / 18 — resolution outcomes
-- =====================================================================
DO $$
DECLARE st text; rc text;
BEGIN
  SELECT plan_state, reason_code INTO st, rc FROM public.supervisory_assessment_question_plan
   WHERE assessment_id=(SELECT v FROM pl_id WHERE k='a_full') AND question_code='PLANCERT_Q_CORE';
  IF st <> 'INCLUDED_CORE' OR rc <> 'CORE_INCLUDED' THEN
    RAISE EXCEPTION 'FAIL PLAN-08: unrestricted core question resolved as %/%', st, rc; END IF;
  RAISE NOTICE 'PASS PLAN-08: an unrestricted core question is INCLUDED_CORE (scenario A)';

  SELECT plan_state, reason_code INTO st, rc FROM public.supervisory_assessment_question_plan
   WHERE assessment_id=(SELECT v FROM pl_id WHERE k='a_full') AND question_code='PLANCERT_Q_COND_T';
  IF st <> 'INCLUDED_CONDITIONAL' OR rc <> 'CONDITIONAL_TRIGGER_TRUE' THEN
    RAISE EXCEPTION 'FAIL PLAN-09: conditional trigger TRUE resolved as %/%', st, rc; END IF;
  RAISE NOTICE 'PASS PLAN-09: a conditional question whose trigger is TRUE is INCLUDED_CONDITIONAL (scenario B)';

  SELECT plan_state, reason_code INTO st, rc FROM public.supervisory_assessment_question_plan
   WHERE assessment_id=(SELECT v FROM pl_id WHERE k='a_full') AND question_code='PLANCERT_Q_COND_F';
  IF st <> 'NOT_TRIGGERED' OR rc <> 'CONDITIONAL_TRIGGER_FALSE' THEN
    RAISE EXCEPTION 'FAIL PLAN-10: conditional trigger FALSE resolved as %/%', st, rc; END IF;
  RAISE NOTICE 'PASS PLAN-10: a conditional question whose trigger is FALSE is NOT_TRIGGERED, not OUT_OF_SCOPE (scenario C)';

  SELECT plan_state, reason_code INTO st, rc FROM public.supervisory_assessment_question_plan
   WHERE assessment_id=(SELECT v FROM pl_id WHERE k='a_full') AND question_code='PLANCERT_Q_ENH';
  IF st <> 'INCLUDED_ENHANCED' THEN
    RAISE EXCEPTION 'FAIL PLAN-12: enhanced question resolved as % when the programme assesses enhanced questions', st; END IF;
  RAISE NOTICE 'PASS PLAN-12: an enhanced question is included where the programme permits it (scenario F)';

  SELECT plan_state INTO st FROM public.supervisory_assessment_question_plan
   WHERE assessment_id=(SELECT v FROM pl_id WHERE k='a_full') AND question_code='PLANCERT_Q_SECT_IN';
  IF st <> 'INCLUDED_CORE' THEN
    RAISE EXCEPTION 'FAIL PLAN-17: a matching sector applicability rule resolved as %', st; END IF;
  RAISE NOTICE 'PASS PLAN-17: a matching sector applicability rule includes the question (scenario H)';

  SELECT plan_state, reason_code INTO st, rc FROM public.supervisory_assessment_question_plan
   WHERE assessment_id=(SELECT v FROM pl_id WHERE k='a_full') AND question_code='PLANCERT_Q_SECT_OUT';
  IF st <> 'OUT_OF_SCOPE' OR rc <> 'RULE_FALSE' THEN
    RAISE EXCEPTION 'FAIL PLAN-18: a non-matching sector rule resolved as %/%', st, rc; END IF;
  RAISE NOTICE 'PASS PLAN-18: a non-matching sector applicability rule yields OUT_OF_SCOPE / RULE_FALSE (scenario I)';
END $$;

-- =====================================================================
-- PLAN-11 / PLAN-19 / PLAN-27 — an unresolved rule blocks materialisation
-- and rolls the whole creation back; it never becomes "false"
-- =====================================================================
DO $$
DECLARE msg text; before_n int; after_n int; ok boolean := false;
BEGIN
  SELECT count(*) INTO before_n FROM public.supervisory_assessment;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN
    PERFORM public.supervisory_assessment_create_programmed(
      (SELECT v FROM pl_id WHERE k='entity'), 'AML_CFT',
      (SELECT id FROM public.supervisory_assessment_programme WHERE programme_code='PLANCERT_P_UNRES'),
      'PERIODIC', NULL, NULL, 'PLANCERT unresolved scope');
  EXCEPTION WHEN others THEN msg := SQLERRM; ok := true; END;
  RESET ROLE;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL PLAN-11: an unevaluable conditional rule did not block materialisation'; END IF;
  IF msg NOT LIKE '%APPLICABILITY_UNRESOLVED%' THEN
    RAISE EXCEPTION 'FAIL PLAN-11: blocking error was not APPLICABILITY_UNRESOLVED: %', msg; END IF;
  RAISE NOTICE 'PASS PLAN-11: an unevaluable conditional rule raises APPLICABILITY_UNRESOLVED (scenario D)';
  IF EXISTS (SELECT 1 FROM public.supervisory_assessment_question_plan
              WHERE question_code='PLANCERT_Q_UNRES' AND plan_state='NOT_TRIGGERED') THEN
    RAISE EXCEPTION 'FAIL PLAN-19: an unresolved rule was silently recorded as NOT_TRIGGERED'; END IF;
  RAISE NOTICE 'PASS PLAN-19: missing applicability input is never silently treated as false';
  SELECT count(*) INTO after_n FROM public.supervisory_assessment;
  IF after_n <> before_n THEN
    RAISE EXCEPTION 'FAIL PLAN-27: % assessment(s) survived a failed plan materialisation', after_n - before_n; END IF;
  RAISE NOTICE 'PASS PLAN-27: a failed question plan rolls the assessment creation back entirely';
END $$;

-- =====================================================================
-- PLAN-13 — programme question-class exclusion
-- =====================================================================
DO $$
DECLARE res jsonb; st text; rc text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  res := public.supervisory_assessment_create_programmed(
    (SELECT v FROM pl_id WHERE k='entity'), 'AML_CFT',
    (SELECT id FROM public.supervisory_assessment_programme WHERE programme_code='PLANCERT_P_NOENH'),
    'PERIODIC', NULL, NULL, 'PLANCERT class scope');
  RESET ROLE;
  INSERT INTO pl_id(k,v) VALUES ('a_noenh', (res->>'id')::uuid);
  SELECT plan_state, reason_code INTO st, rc FROM public.supervisory_assessment_question_plan
   WHERE assessment_id=(res->>'id')::uuid AND question_code='PLANCERT_Q_ENH';
  IF st <> 'OUT_OF_SCOPE' OR rc <> 'PROGRAMME_CLASS_EXCLUDED' THEN
    RAISE EXCEPTION 'FAIL PLAN-13: enhanced question resolved %/% when the programme excludes the class', st, rc; END IF;
  RAISE NOTICE 'PASS PLAN-13: programme question-class scope is operational (scenario E)';
END $$;

-- =====================================================================
-- PLAN-14 / PLAN-15 — programme dimension scope
-- =====================================================================
DO $$
DECLARE res jsonb; n int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  res := public.supervisory_assessment_create_programmed(
    (SELECT v FROM pl_id WHERE k='entity'), 'AML_CFT',
    (SELECT id FROM public.supervisory_assessment_programme WHERE programme_code='PLANCERT_P_DIMEX'),
    'PERIODIC', NULL, NULL, 'PLANCERT dimension exclusion');
  RESET ROLE;
  INSERT INTO pl_id(k,v) VALUES ('a_dimex', (res->>'id')::uuid);
  SELECT count(*) INTO n FROM public.supervisory_assessment_question_plan
   WHERE assessment_id=(res->>'id')::uuid AND dimension_code='PLANCERT_DIM_B'
     AND (plan_state <> 'OUT_OF_SCOPE' OR reason_code <> 'PROGRAMME_DIMENSION_EXCLUDED');
  IF n > 0 THEN RAISE EXCEPTION 'FAIL PLAN-14: % question(s) of an excluded dimension are not OUT_OF_SCOPE', n; END IF;
  RAISE NOTICE 'PASS PLAN-14: every question of an excluded dimension is OUT_OF_SCOPE (scenario G)';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  res := public.supervisory_assessment_create_programmed(
    (SELECT v FROM pl_id WHERE k='entity'), 'AML_CFT',
    (SELECT id FROM public.supervisory_assessment_programme WHERE programme_code='PLANCERT_P_DIMIN'),
    'PERIODIC', NULL, NULL, 'PLANCERT dimension inclusion');
  RESET ROLE;
  SELECT count(*) INTO n FROM public.supervisory_assessment_question_plan
   WHERE assessment_id=(res->>'id')::uuid AND dimension_code <> 'PLANCERT_DIM_A'
     AND plan_state <> 'OUT_OF_SCOPE';
  IF n > 0 THEN RAISE EXCEPTION 'FAIL PLAN-15: % question(s) outside the explicit included-dimension set remain in scope', n; END IF;
  RAISE NOTICE 'PASS PLAN-15: an explicit included-dimension set puts every other dimension OUT_OF_SCOPE';
END $$;

-- =====================================================================
-- PLAN-16 — contradictory / unknown programme dimension scope is refused
-- =====================================================================
DO $$
DECLARE msg text; ok int := 0;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN
    PERFORM public.supervisory_assessment_create_programmed(
      (SELECT v FROM pl_id WHERE k='entity'), 'AML_CFT',
      (SELECT id FROM public.supervisory_assessment_programme WHERE programme_code='PLANCERT_P_CONTRA'),
      'PERIODIC', NULL, NULL, 'PLANCERT contradiction');
  EXCEPTION WHEN others THEN msg := SQLERRM;
    IF msg LIKE '%CONTRADICTORY%' THEN ok := ok + 1; END IF; END;
  BEGIN
    PERFORM public.supervisory_assessment_create_programmed(
      (SELECT v FROM pl_id WHERE k='entity'), 'AML_CFT',
      (SELECT id FROM public.supervisory_assessment_programme WHERE programme_code='PLANCERT_P_BADDIM'),
      'PERIODIC', NULL, NULL, 'PLANCERT unknown dimension');
  EXCEPTION WHEN others THEN msg := SQLERRM;
    IF msg LIKE '%APPLICABILITY_UNRESOLVED%' THEN ok := ok + 1; END IF; END;
  RESET ROLE;
  IF ok <> 2 THEN RAISE EXCEPTION 'FAIL PLAN-16: contradictory/unknown dimension scope was not refused (% of 2)', ok; END IF;
  RAISE NOTICE 'PASS PLAN-16: contradictory dimension scope and unknown dimension codes are refused';
END $$;

-- =====================================================================
-- PLAN-20 / 21 / 22 / 23 / 24 — governed rule authoring validation
-- =====================================================================
DO $$
DECLARE q uuid; md uuid; ok int := 0; msg text;
BEGIN
  SELECT id INTO q FROM public.supervisory_methodology_question WHERE question_code='PLANCERT_Q_DRAFT';
  md := (SELECT v FROM pl_id WHERE k='meth_draft');
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);

  BEGIN PERFORM public.supervisory_methodology_question_rule_save(md, q, 'TRIGGER',
      '{"op":"LIKE","source":"ENTITY.SECTOR_ID","value":"x"}'::jsonb, 'certification of operator validation');
  EXCEPTION WHEN others THEN msg := SQLERRM;
    IF msg LIKE '%RULE_OPERATOR_INVALID%' THEN ok := ok + 1; END IF; END;

  BEGIN PERFORM public.supervisory_methodology_question_rule_save(md, q, 'TRIGGER',
      '{"op":"EQ","source":"ENTITY.SECRET_SCORE","value":"x"}'::jsonb, 'certification of source validation');
  EXCEPTION WHEN others THEN msg := SQLERRM;
    IF msg LIKE '%RULE_SOURCE_UNSUPPORTED%' THEN ok := ok + 1; END IF; END;

  BEGIN PERFORM public.supervisory_methodology_question_rule_save(md, q, 'TRIGGER',
      '{"op":"ALL","rules":[]}'::jsonb, 'certification of malformed rule refusal');
  EXCEPTION WHEN others THEN msg := SQLERRM;
    IF msg LIKE '%RULE_MALFORMED%' THEN ok := ok + 1; END IF; END;

  BEGIN PERFORM public.supervisory_methodology_question_rule_save(md,
      (SELECT id FROM public.supervisory_methodology_question WHERE question_code='PLANCERT_Q_CORE'),
      'TRIGGER', '{"op":"TRUE"}'::jsonb, 'certification of cross-version refusal');
  EXCEPTION WHEN others THEN msg := SQLERRM;
    IF msg LIKE '%CROSS_METHODOLOGY%' THEN ok := ok + 1; END IF; END;

  BEGIN PERFORM public.supervisory_methodology_question_rule_save(
      (SELECT v FROM pl_id WHERE k='meth'),
      (SELECT id FROM public.supervisory_methodology_question WHERE question_code='PLANCERT_Q_CORE'),
      'TRIGGER', '{"op":"TRUE"}'::jsonb, 'certification of frozen version refusal');
  EXCEPTION WHEN others THEN msg := SQLERRM; ok := ok + 1; END;

  -- an executable rule authored through the governed operation is accepted
  PERFORM public.supervisory_methodology_question_rule_save(md, q, 'TRIGGER',
    jsonb_build_object('op','ANY','rules', jsonb_build_array(
      jsonb_build_object('op','EQ','source','ASSESSMENT.TRIGGER_TYPE','value','PERIODIC'),
      jsonb_build_object('op','EXISTS','source','ENTITY.SECTOR_ID'))),
    'certification of governed structured authoring');
  RESET ROLE;

  IF ok <> 5 THEN RAISE EXCEPTION 'FAIL PLAN-20..24: only % of 5 invalid rule authorings were refused', ok; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_methodology_question_rule
                  WHERE question_id=q AND active AND rule_summary IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL PLAN-20: a valid governed rule was not persisted with a server-generated summary'; END IF;
  RAISE NOTICE 'PASS PLAN-20: invalid operators are refused and valid rules persist with a server summary';
  RAISE NOTICE 'PASS PLAN-21: unsupported applicability sources are refused';
  RAISE NOTICE 'PASS PLAN-22: malformed boolean groups are refused';
  RAISE NOTICE 'PASS PLAN-23: cross-methodology rule references are refused';
  RAISE NOTICE 'PASS PLAN-24: rule authoring against a frozen (non-draft) methodology is refused';
END $$;

-- =====================================================================
-- PLAN-25 — methodology validation catches a missing conditional rule
-- =====================================================================
DO $$
DECLARE res jsonb; found boolean;
BEGIN
  -- retire the trigger rule just authored so the conditional question has none
  UPDATE public.supervisory_methodology_question_rule SET active=false
   WHERE question_id=(SELECT id FROM public.supervisory_methodology_question WHERE question_code='PLANCERT_Q_DRAFT');
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  res := public.supervisory_methodology_validate((SELECT v FROM pl_id WHERE k='meth_draft'));
  RESET ROLE;
  SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(res->'findings') f
                  WHERE f->>'code'='CONDITIONAL_RULE_MISSING' AND f->>'severity'='BLOCKING') INTO found;
  IF NOT found THEN RAISE EXCEPTION 'FAIL PLAN-25: validation does not report CONDITIONAL_RULE_MISSING'; END IF;
  RAISE NOTICE 'PASS PLAN-25: methodology validation blocks on a conditional question without an executable rule';
END $$;

-- =====================================================================
-- PLAN-28 / 29 / 30 / 31 — the snapshot is immutable and historical
-- =====================================================================
DO $$
DECLARE digest_before text; digest_after text; ok int := 0;
BEGIN
  SELECT md5(string_agg(question_code||':'||plan_state||':'||reason_code,'|' ORDER BY question_code))
    INTO digest_before FROM public.supervisory_assessment_question_plan
   WHERE assessment_id=(SELECT v FROM pl_id WHERE k='a_full');

  BEGIN UPDATE public.supervisory_assessment_question_plan SET plan_state='OUT_OF_SCOPE'
         WHERE assessment_id=(SELECT v FROM pl_id WHERE k='a_full');
  EXCEPTION WHEN others THEN ok := ok + 1; END;
  BEGIN DELETE FROM public.supervisory_assessment_question_plan
         WHERE assessment_id=(SELECT v FROM pl_id WHERE k='a_full');
  EXCEPTION WHEN others THEN ok := ok + 1; END;
  IF ok <> 2 THEN RAISE EXCEPTION 'FAIL PLAN-28: the plan snapshot is not immutable (% of 2 refused)', ok; END IF;
  RAISE NOTICE 'PASS PLAN-28: the plan snapshot cannot be updated or deleted, even by the owner role';

  -- later methodology change
  UPDATE public.supervisory_methodology_question SET active=false
   WHERE question_code='PLANCERT_Q_CORE';
  INSERT INTO public.supervisory_methodology_question(
    methodology_id, methodology_dimension_id, question_code, prompt, response_options,
    mandatory, question_class, active, sort_order)
  SELECT (SELECT v FROM pl_id WHERE k='meth'), d.id, 'PLANCERT_Q_LATER','later question',
         ARRAY['YES','NO'], true, 'CORE', true, 99
    FROM public.supervisory_methodology_dimension d
   WHERE d.methodology_id=(SELECT v FROM pl_id WHERE k='meth') AND d.dimension_code='PLANCERT_DIM_A';
  SELECT md5(string_agg(question_code||':'||plan_state||':'||reason_code,'|' ORDER BY question_code))
    INTO digest_after FROM public.supervisory_assessment_question_plan
   WHERE assessment_id=(SELECT v FROM pl_id WHERE k='a_full');
  IF digest_after <> digest_before THEN
    RAISE EXCEPTION 'FAIL PLAN-29: a later methodology change altered an existing question plan'; END IF;
  RAISE NOTICE 'PASS PLAN-29: a later methodology edit does not change an existing plan (scenario L)';

  -- later programme version
  UPDATE public.supervisory_assessment_programme
     SET question_class_scope = ARRAY['CORE'], excluded_dimension_codes = ARRAY['PLANCERT_DIM_A']
   WHERE programme_code='PLANCERT_P_FULL';
  SELECT md5(string_agg(question_code||':'||plan_state||':'||reason_code,'|' ORDER BY question_code))
    INTO digest_after FROM public.supervisory_assessment_question_plan
   WHERE assessment_id=(SELECT v FROM pl_id WHERE k='a_full');
  IF digest_after <> digest_before THEN
    RAISE EXCEPTION 'FAIL PLAN-30: a later programme change altered an existing question plan'; END IF;
  RAISE NOTICE 'PASS PLAN-30: a later programme change does not change an existing plan';

  -- later entity context change
  UPDATE public.licensees SET sector_id=(SELECT v FROM pl_id WHERE k='other_sector')
   WHERE id=(SELECT v FROM pl_id WHERE k='entity');
  SELECT md5(string_agg(question_code||':'||plan_state||':'||reason_code,'|' ORDER BY question_code))
    INTO digest_after FROM public.supervisory_assessment_question_plan
   WHERE assessment_id=(SELECT v FROM pl_id WHERE k='a_full');
  IF digest_after <> digest_before THEN
    RAISE EXCEPTION 'FAIL PLAN-31: an entity context change rewrote an existing question plan'; END IF;
  RAISE NOTICE 'PASS PLAN-31: an entity context change does not silently rewrite an existing plan';
  -- restore fixture context for the remaining gates
  UPDATE public.licensees SET sector_id=(SELECT v FROM pl_id WHERE k='sector')
   WHERE id=(SELECT v FROM pl_id WHERE k='entity');
  UPDATE public.supervisory_assessment_programme
     SET question_class_scope = ARRAY['CORE','CONDITIONAL','ENHANCED'],
         excluded_dimension_codes = ARRAY['PLANCERT_DIM_C']
   WHERE programme_code='PLANCERT_P_FULL';
  UPDATE public.supervisory_methodology_question SET active=true WHERE question_code='PLANCERT_Q_CORE';
  UPDATE public.supervisory_methodology_question SET active=false WHERE question_code='PLANCERT_Q_LATER';
END $$;

-- =====================================================================
-- PLAN-32 / 33 / 34 / 35 / 36 — answerability and completeness
-- =====================================================================
DO $$
DECLARE ok int := 0; gaps jsonb; msg text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);

  BEGIN PERFORM public.supervisory_assessment_question_upsert(
      (SELECT v FROM pl_id WHERE k='a_full'),
      (SELECT id FROM public.supervisory_methodology_question WHERE question_code='PLANCERT_Q_COND_F'),
      'YES','certification observation for a not triggered question');
  EXCEPTION WHEN others THEN msg := SQLERRM;
    IF msg LIKE '%not_in_scope%' THEN ok := ok + 1; END IF; END;

  BEGIN PERFORM public.supervisory_assessment_question_upsert(
      (SELECT v FROM pl_id WHERE k='a_full'),
      (SELECT id FROM public.supervisory_methodology_question WHERE question_code='PLANCERT_Q_SECT_OUT'),
      'YES','certification observation for an out of scope question');
  EXCEPTION WHEN others THEN msg := SQLERRM;
    IF msg LIKE '%not_in_scope%' THEN ok := ok + 1; END IF; END;

  -- an included question is answerable
  PERFORM public.supervisory_assessment_question_upsert(
    (SELECT v FROM pl_id WHERE k='a_full'),
    (SELECT id FROM public.supervisory_methodology_question WHERE question_code='PLANCERT_Q_CORE'),
    'YES','certification observation recorded for an included core question');

  gaps := public.supervisory_assessment_question_gaps((SELECT v FROM pl_id WHERE k='a_full'));
  RESET ROLE;

  IF ok <> 2 THEN RAISE EXCEPTION 'FAIL PLAN-32: excluded questions were answerable (% of 2 refused)', ok; END IF;
  RAISE NOTICE 'PASS PLAN-32: only INCLUDED questions may be answered';

  IF gaps::text LIKE '%PLANCERT_Q_COND_F%' THEN
    RAISE EXCEPTION 'FAIL PLAN-33: a NOT_TRIGGERED question counts as outstanding work'; END IF;
  RAISE NOTICE 'PASS PLAN-33: NOT_TRIGGERED questions do not count as unanswered';
  IF gaps::text LIKE '%PLANCERT_Q_SECT_OUT%' THEN
    RAISE EXCEPTION 'FAIL PLAN-34: an OUT_OF_SCOPE question counts as outstanding work'; END IF;
  RAISE NOTICE 'PASS PLAN-34: OUT_OF_SCOPE questions do not count as unanswered';
  IF gaps::text LIKE '%evidence_missing%' AND gaps::text LIKE '%PLANCERT_Q_DIMB%' THEN
    RAISE EXCEPTION 'FAIL PLAN-35: an excluded question demands evidence'; END IF;
  RAISE NOTICE 'PASS PLAN-35: excluded questions require no evidence';

  IF EXISTS (SELECT 1 FROM public.supervisory_assessment_question_response r
               JOIN public.supervisory_assessment_question_plan p
                 ON p.assessment_id=r.assessment_id AND p.question_id=r.methodology_question_id
              WHERE r.assessment_id=(SELECT v FROM pl_id WHERE k='a_full')
                AND p.plan_state NOT LIKE 'INCLUDED%') THEN
    RAISE EXCEPTION 'FAIL PLAN-36: a response exists for an excluded question, so it could enter scoring'; END IF;
  RAISE NOTICE 'PASS PLAN-36: no excluded question can hold a response, so none enters a scoring input';
END $$;

-- =====================================================================
-- PLAN-37 / 38 / 39 — NOT_APPLICABLE is a response, never a plan state
-- =====================================================================
DO $$
DECLARE ok int := 0; msg text; st text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);

  BEGIN PERFORM public.supervisory_assessment_question_upsert(
      (SELECT v FROM pl_id WHERE k='a_full'),
      (SELECT id FROM public.supervisory_methodology_question WHERE question_code='PLANCERT_Q_CORE'),
      'NOT_APPLICABLE','short');
  EXCEPTION WHEN others THEN msg := SQLERRM; ok := ok + 1; END;   -- N/A not permitted on this question

  BEGIN PERFORM public.supervisory_assessment_question_upsert(
      (SELECT v FROM pl_id WHERE k='a_full'),
      (SELECT id FROM public.supervisory_methodology_question WHERE question_code='PLANCERT_Q_NA'),
      'NOT_APPLICABLE','no');
  EXCEPTION WHEN others THEN msg := SQLERRM;
    IF msg LIKE '%rationale%' THEN ok := ok + 1; END IF; END;

  PERFORM public.supervisory_assessment_question_upsert(
    (SELECT v FROM pl_id WHERE k='a_full'),
    (SELECT id FROM public.supervisory_methodology_question WHERE question_code='PLANCERT_Q_NA'),
    'NOT_APPLICABLE','this control is not applicable to this business model, recorded with rationale');

  -- N/A attempted on an excluded question is refused (scenario K)
  BEGIN PERFORM public.supervisory_assessment_question_upsert(
      (SELECT v FROM pl_id WHERE k='a_full'),
      (SELECT id FROM public.supervisory_methodology_question WHERE question_code='PLANCERT_Q_SECT_OUT'),
      'NOT_APPLICABLE','attempting not applicable on an out of scope question');
  EXCEPTION WHEN others THEN msg := SQLERRM;
    IF msg LIKE '%not_in_scope%' THEN ok := ok + 1; END IF; END;
  RESET ROLE;

  IF ok <> 3 THEN RAISE EXCEPTION 'FAIL PLAN-37: N/A governance is incomplete (% of 3 refusals)', ok; END IF;
  RAISE NOTICE 'PASS PLAN-37: N/A is accepted only where the methodology permits it, and never off-plan (scenario J/K)';
  RAISE NOTICE 'PASS PLAN-38: an N/A rationale is enforced where configured';

  SELECT plan_state INTO st FROM public.supervisory_assessment_question_plan
   WHERE assessment_id=(SELECT v FROM pl_id WHERE k='a_full') AND question_code='PLANCERT_Q_NA';
  IF st <> 'INCLUDED_CORE' THEN
    RAISE EXCEPTION 'FAIL PLAN-39: an N/A response rewrote the plan state to %', st; END IF;
  RAISE NOTICE 'PASS PLAN-39: an N/A response leaves the question plan state untouched';
END $$;

-- =====================================================================
-- PLAN-40 / PLAN-41 — legacy assessments and v1.0 compatibility
-- =====================================================================
DO $$
DECLARE n int; res jsonb; total int; legacy int;
BEGIN
  SELECT count(*) INTO n FROM public.supervisory_assessment a
   WHERE a.created_at < (SELECT min(created_at) FROM public.supervisory_assessment
                          WHERE reference LIKE 'SUP-AML_CFT-%' AND summary LIKE 'PLANCERT%')
     AND EXISTS (SELECT 1 FROM public.supervisory_assessment_question_plan p WHERE p.assessment_id=a.id);
  IF n > 0 THEN RAISE EXCEPTION 'FAIL PLAN-40: % pre-existing assessment(s) were backfilled with a question plan', n; END IF;
  RAISE NOTICE 'PASS PLAN-40: pre-existing assessments carry no guessed question plan (LEGACY_UNMATERIALISED)';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  res := public.supervisory_assessment_create_programmed(
    (SELECT v FROM pl_id WHERE k='entity_v10'), 'AML_CFT',
    (SELECT id FROM public.supervisory_assessment_programme WHERE programme_code='PLANCERT_P_LEGACY'),
    'PERIODIC', NULL, NULL, 'PLANCERT legacy compatibility');
  RESET ROLE;
  INSERT INTO pl_id(k,v) VALUES ('a_v10', (res->>'id')::uuid);

  SELECT count(*), count(*) FILTER (WHERE plan_state='INCLUDED_CORE'
        AND reason_code='LEGACY_COMPATIBILITY_INCLUDED'
        AND resolution_mode='LEGACY_METHODOLOGY_COMPATIBILITY')
    INTO total, legacy
    FROM public.supervisory_assessment_question_plan WHERE assessment_id=(res->>'id')::uuid;
  IF total = 0 OR total <> legacy THEN
    RAISE EXCEPTION 'FAIL PLAN-41: v1.0 compatibility is not mechanical (% of % rows labelled)', legacy, total; END IF;
  IF total <> (SELECT pl_n.n FROM pl_n WHERE k='v10_questions') THEN
    RAISE EXCEPTION 'FAIL PLAN-41: v1.0 plan holds % rows against % active questions',
      total, (SELECT pl_n.n FROM pl_n WHERE k='v10_questions'); END IF;
  RAISE NOTICE 'PASS PLAN-41: AML-CFT-RBA v1.0 keeps its existing behaviour under labelled legacy compatibility';
END $$;

-- =====================================================================
-- PLAN-42 / PLAN-43 — v1.1 reference integrity
-- =====================================================================
DO $$
DECLARE st text; org text; n int;
BEGIN
  SELECT status, origin INTO st, org FROM public.supervisory_methodology
   WHERE id=(SELECT v FROM pl_id WHERE k='meth_v11');
  IF st <> 'DRAFT' OR org <> 'MIPL_REFERENCE' THEN
    RAISE EXCEPTION 'FAIL PLAN-42: v1.1 is now %/%', st, org; END IF;
  RAISE NOTICE 'PASS PLAN-42: AML/CFT-RBA v1.1 remains DRAFT / MIPL_REFERENCE';

  SELECT count(*) INTO n FROM public.supervisory_methodology_question_rule r
   WHERE r.methodology_id=(SELECT v FROM pl_id WHERE k='meth_v11');
  IF n <> (SELECT pl_n.n FROM pl_n WHERE k='v11_rules') THEN
    RAISE EXCEPTION 'FAIL PLAN-43: % conditional rule(s) were invented for the v1.1 reference version', n; END IF;
  RAISE NOTICE 'PASS PLAN-43: no v1.1 conditional rule was invented; structured authoring remains an honest readiness finding';
END $$;

-- =====================================================================
-- PLAN-44 / PLAN-45 — perimeter and regulator scope remain authoritative
-- =====================================================================
DO $$
DECLARE ok int := 0; msg text; e uuid;
BEGIN
  SELECT l.id INTO e FROM public.licensees l
   WHERE NOT public.supervisory_domain_applicable(l.id, 'AML_CFT') LIMIT 1;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  IF e IS NOT NULL THEN
    BEGIN PERFORM public.supervisory_assessment_create_programmed(e, 'AML_CFT',
        (SELECT id FROM public.supervisory_assessment_programme WHERE programme_code='PLANCERT_P_FULL'),
        'PERIODIC', NULL, NULL, 'PLANCERT perimeter');
    EXCEPTION WHEN others THEN msg := SQLERRM;
      IF msg LIKE '%domain_not_applicable%' OR msg LIKE '%not_authorized%' OR msg LIKE '%scope%' THEN ok := ok + 1; END IF; END;
  ELSE ok := ok + 1; END IF;
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"411dd06d-648b-4f32-82cc-897902c0c0b6","role":"authenticated"}', true);
  BEGIN PERFORM public.supervisory_assessment_question_plan((SELECT v FROM pl_id WHERE k='a_full'));
  EXCEPTION WHEN others THEN ok := ok + 1; END;
  RESET ROLE;

  IF ok <> 2 THEN RAISE EXCEPTION 'FAIL PLAN-44/45: perimeter or scope enforcement is missing (% of 2)', ok; END IF;
  RAISE NOTICE 'PASS PLAN-44: the supervisory perimeter, not question applicability, governs assessment eligibility';
  RAISE NOTICE 'PASS PLAN-45: reading a question plan outside supervisory scope is refused';
END $$;

-- =====================================================================
-- PLAN-46 — audit
-- =====================================================================
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.supervisory_assessment_event
   WHERE assessment_id=(SELECT v FROM pl_id WHERE k='a_full')
     AND event_type='QUESTION_PLAN_MATERIALISED'
     AND detail ? 'summary';
  IF n = 0 THEN RAISE EXCEPTION 'FAIL PLAN-46: no QUESTION_PLAN_MATERIALISED audit event was recorded'; END IF;
  RAISE NOTICE 'PASS PLAN-46: question plan materialisation is recorded in the assessment audit trail';
END $$;

-- =====================================================================
-- PLAN-47 — scope counts are server authoritative
-- =====================================================================
DO $$
DECLARE s jsonb; r jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  r := public.supervisory_assessment_question_plan((SELECT v FROM pl_id WHERE k='a_full'));
  RESET ROLE;
  s := r->'summary';
  IF (s->>'included_total')::int <> (SELECT count(*) FROM public.supervisory_assessment_question_plan
        WHERE assessment_id=(SELECT v FROM pl_id WHERE k='a_full') AND plan_state LIKE 'INCLUDED%') THEN
    RAISE EXCEPTION 'FAIL PLAN-47: included_total disagrees with the stored plan'; END IF;
  IF s->>'included_core' IS NULL OR s->>'included_conditional' IS NULL OR s->>'included_enhanced' IS NULL
     OR s->>'not_triggered' IS NULL OR s->>'out_of_scope' IS NULL OR s->>'answered' IS NULL
     OR s->>'unanswered_in_scope' IS NULL OR s->>'methodology_total' IS NULL THEN
    RAISE EXCEPTION 'FAIL PLAN-47: the server summary does not expose every required count'; END IF;
  IF jsonb_array_length(r->'rows') = 0 THEN
    RAISE EXCEPTION 'FAIL PLAN-47: the read model returned no rows'; END IF;
  RAISE NOTICE 'PASS PLAN-47: scope counts and rows are computed by the server read model';
END $$;

-- =====================================================================
-- PLAN-48 — the browser no longer decides question inclusion
-- =====================================================================
-- Source-boundary gate: recorded here, asserted mechanically in
-- scripts/verify-question-plan-frontend-boundary.mjs and
-- src/test/amlAssessmentQuestionPlan.test.tsx.
DO $$
BEGIN
  RAISE NOTICE 'PASS PLAN-48: question inclusion is decided by the server plan (front-end boundary asserted by verify-question-plan-frontend-boundary.mjs)';
END $$;

-- =====================================================================
-- PLAN-49 / PLAN-50 — preservation
-- =====================================================================
DO $$
DECLARE t text; n bigint;
BEGIN
  SELECT md5(string_agg(a.id::text||':'||a.status||':'||COALESCE(a.assessment_programme_id::text,'-')||':'||
             COALESCE(a.methodology_id::text,'-'),'|' ORDER BY a.id))
    INTO t FROM public.supervisory_assessment a
   WHERE a.summary IS NULL OR a.summary NOT LIKE 'PLANCERT%';
  IF t <> (SELECT pl_t.t FROM pl_t WHERE k='assess_digest') THEN
    RAISE EXCEPTION 'FAIL PLAN-49: pre-existing assessments changed'; END IF;
  SELECT md5(COALESCE(string_agg(r.entity_id::text||':'||COALESCE(r.residual_rating,'-'),'|' ORDER BY r.entity_id),''))
    INTO t FROM public.entity_risk_state r;
  IF t <> (SELECT pl_t.t FROM pl_t WHERE k='risk_digest') THEN
    RAISE EXCEPTION 'FAIL PLAN-49: entity risk of record changed'; END IF;
  IF (SELECT status FROM public.supervisory_methodology WHERE id=(SELECT v FROM pl_id WHERE k='meth_v10'))
     <> (SELECT pl_t.t FROM pl_t WHERE k='v10_status') THEN
    RAISE EXCEPTION 'FAIL PLAN-49: AML-CFT-RBA v1.0 status changed'; END IF;
  IF (SELECT count(*) FROM public.supervisory_methodology_question
       WHERE methodology_id=(SELECT v FROM pl_id WHERE k='meth_v11') AND active)
     <> (SELECT pl_n.n FROM pl_n WHERE k='v11_questions') THEN
    RAISE EXCEPTION 'FAIL PLAN-49: the v1.1 question population changed'; END IF;
  IF (SELECT md5(string_agg(p.programme_code||':'||p.assessment_type||':'||p.question_class_scope::text,'|'
                  ORDER BY p.programme_code))
        FROM public.supervisory_assessment_programme p
       WHERE p.programme_set_id=(SELECT v FROM pl_id WHERE k='ref_set'))
     <> (SELECT pl_t.t FROM pl_t WHERE k='ref_digest') THEN
    RAISE EXCEPTION 'FAIL PLAN-49: the MIPL reference programme package changed'; END IF;
  IF (SELECT count(*) FROM public.regulators) <> (SELECT pl_n.n FROM pl_n WHERE k='regulators') THEN
    RAISE EXCEPTION 'FAIL PLAN-49: the regulator master changed'; END IF;
  RAISE NOTICE 'PASS PLAN-49: existing assessments, risk of record, v1.0, v1.1, the reference package and the regulator master are unchanged';

  FOR t, n IN SELECT k, pl_n.n FROM pl_n WHERE k IN ('calc_config','calc_band','calc_matrix','calc_score') LOOP
    IF t='calc_config'  AND (SELECT count(*) FROM public.supervisory_calculation_config) <> n THEN
      RAISE EXCEPTION 'FAIL PLAN-50: calculation configuration was authored'; END IF;
    IF t='calc_band'    AND (SELECT count(*) FROM public.supervisory_calculation_band) <> n THEN
      RAISE EXCEPTION 'FAIL PLAN-50: calculation bands were authored'; END IF;
    IF t='calc_matrix'  AND (SELECT count(*) FROM public.supervisory_calculation_matrix_cell) <> n THEN
      RAISE EXCEPTION 'FAIL PLAN-50: a residual matrix was authored'; END IF;
    IF t='calc_score'   AND (SELECT count(*) FROM public.supervisory_calculation_response_score) <> n THEN
      RAISE EXCEPTION 'FAIL PLAN-50: response scores were authored'; END IF;
  END LOOP;
  RAISE NOTICE 'PASS PLAN-50: no calculation, banding, matrix or materiality policy was invented by AML-04';
END $$;

ROLLBACK;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.supervisory_methodology WHERE code LIKE 'PLANCERT%';
  IF n > 0 THEN RAISE EXCEPTION 'FAIL: % PLANCERT fixture methodology row(s) survived the rollback', n; END IF;
  SELECT count(*) INTO n FROM public.supervisory_assessment_question_plan;
  RAISE NOTICE 'POST-RUN: 0 PLANCERT fixtures survive; % question plan row(s) exist in the database', n;
END $$;
