-- =====================================================================
-- AML-12A — POLICY ACTIVATION REHEARSAL (ROLLBACK ONLY)
-- =====================================================================
-- Purpose: prove that the governed calculation-policy activation sequence
--          WORKS END TO END, using synthetic AML12DRYRUN fixtures only.
--
-- This rehearsal proves CAPABILITY. It does NOT define live regulator
-- policy: every fixture (methodology, calculation policy, assessment,
-- responses, facts, effective-date rule) is created inside one
-- transaction and discarded by the final ROLLBACK.
--
-- Conventions (identical to the AML-01..AML-11 certifications):
--   * \set ON_ERROR_STOP on, one transaction, ROLLBACK at the end;
--   * behavioural: every gate CALLS governed operations under real
--     authenticated personas (SET LOCAL ROLE authenticated + jwt claims);
--   * every gate RAISEs on failure so the run aborts;
--   * every fixture identifier is prefixed AML12DRYRUN.
--
-- Personas (public.cert_certification_users):
--   Author / maker      b8eaf680-fe66-4d49-b816-1c087f511235
--   Reviewer / checker  0b522724-adcb-48bf-b21d-175339479616
--   Outsider            411dd06d-648b-4f32-82cc-897902c0c0b6
-- =====================================================================

\set ON_ERROR_STOP on
\set QUIET 1
\pset pager off
SET row_security = on;

BEGIN;

CREATE TEMP TABLE d_id(k text PRIMARY KEY, v uuid) ON COMMIT DROP;
CREATE TEMP TABLE d_n(k text PRIMARY KEY, n bigint) ON COMMIT DROP;
CREATE TEMP TABLE d_t(k text PRIMARY KEY, t text) ON COMMIT DROP;
GRANT ALL ON d_id TO authenticated;
GRANT ALL ON d_n  TO authenticated;
GRANT ALL ON d_t  TO authenticated;

INSERT INTO d_id(k,v) VALUES
  ('regulator', '8dd8ac87-4e11-4a6b-8991-bf88cb03d7c3'),
  ('entity',    'aa220000-0000-4000-8000-000000000001'),
  ('author',    'b8eaf680-fe66-4d49-b816-1c087f511235'),
  ('checker',   '0b522724-adcb-48bf-b21d-175339479616'),
  ('outsider',  '411dd06d-648b-4f32-82cc-897902c0c0b6');

INSERT INTO d_id(k,v)
SELECT 'sector', l.sector_id FROM public.licensees l WHERE l.id=(SELECT v FROM d_id WHERE k='entity');

-- ---------------------------------------------------------------- census ----
INSERT INTO d_n(k,n) VALUES
  ('live_cfg',        (SELECT count(*) FROM public.supervisory_calculation_config)),
  ('live_cfg_active', (SELECT count(*) FROM public.supervisory_calculation_config WHERE status='ACTIVE')),
  ('live_rule',       (SELECT count(*) FROM public.supervisory_domain_calculation_rule WHERE domain_code='AML_CFT')),
  ('live_band',       (SELECT count(*) FROM public.supervisory_calculation_band)),
  ('live_matrix',     (SELECT count(*) FROM public.supervisory_calculation_matrix_cell)),
  ('live_risk',       (SELECT count(*) FROM public.entity_risk_state)),
  ('live_hist',       (SELECT count(*) FROM public.entity_risk_state_movement)),
  ('live_assess',     (SELECT count(*) FROM public.supervisory_assessment)),
  ('live_meth',       (SELECT count(*) FROM public.supervisory_methodology));

INSERT INTO d_t(k,t) VALUES
  ('risk_digest', (SELECT md5(string_agg(row_repr, E'\n' ORDER BY row_repr)) FROM (
      SELECT concat_ws(E'\t', s.id::text, s.entity_id::text, s.domain_code, s.residual_rating,
                       s.inherent_rating, s.control_rating, s.driving_assessment_id::text,
                       s.effective_from::text) AS row_repr
        FROM public.entity_risk_state s WHERE s.domain_code='AML_CFT') d)),
  ('v10_state', (SELECT status||'/'||COALESCE(origin,'-') FROM public.supervisory_methodology
                  WHERE domain_code='AML_CFT' AND code='AML-CFT-RBA' AND version='1.0')),
  ('v11_state', (SELECT status||'/'||COALESCE(origin,'-') FROM public.supervisory_methodology
                  WHERE domain_code='AML_CFT' AND code='AML-CFT-RBA' AND version='1.1'));

DO $$
BEGIN
  RAISE NOTICE 'CENSUS: live calculation policies=%, ACTIVE=%, AML_CFT effective-date rules=%',
    (SELECT n FROM d_n WHERE k='live_cfg'), (SELECT n FROM d_n WHERE k='live_cfg_active'),
    (SELECT n FROM d_n WHERE k='live_rule');
  RAISE NOTICE 'CENSUS: risk digest=%, v1.0=%, v1.1=%',
    (SELECT t FROM d_t WHERE k='risk_digest'), (SELECT t FROM d_t WHERE k='v10_state'),
    (SELECT t FROM d_t WHERE k='v11_state');
END $$;

-- -------------------------------------------------------------- fixtures ----
INSERT INTO public.sec_user_roles(user_id, role_id, status, assigned_by)
SELECT u, r.id, 'active', u
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
SELECT rs.id, 'regulator', (SELECT v FROM d_id WHERE k='regulator')
  FROM public.sec_role_scopes rs
  JOIN public.sec_roles r ON r.id = rs.role_id AND r.key='aml_head'
  JOIN public.sec_modules m ON m.id = rs.module_id AND m.key='aml_supervision';

-- Synthetic methodology. Its scales are REHEARSAL content, not regulator policy.
INSERT INTO public.supervisory_methodology(
  id, code, domain_code, name, version, status, sector_id, regulator_id,
  effective_from, origin, title, scoring_scale, definition)
VALUES (gen_random_uuid(), 'AML12DRYRUN-METH', 'AML_CFT', 'AML12DRYRUN rehearsal methodology', '1.0',
  'ACTIVE', (SELECT v FROM d_id WHERE k='sector'), (SELECT v FROM d_id WHERE k='regulator'),
  current_date - 1, 'REGULATOR_AUTHORED', 'AML12DRYRUN rehearsal methodology',
  '[{"code":"LOW","label":"Low","ordinal":1},{"code":"MODERATE","label":"Moderate","ordinal":2},
    {"code":"MEDIUM_HIGH","label":"Medium-High","ordinal":3},{"code":"HIGH","label":"High","ordinal":4},
    {"code":"SEVERE","label":"Severe","ordinal":5}]'::jsonb,
  '{"control_scale":["WEAK","STRONG"]}'::jsonb);
INSERT INTO d_id(k,v) SELECT 'meth', id FROM public.supervisory_methodology WHERE code='AML12DRYRUN-METH';

INSERT INTO public.supervisory_methodology_dimension(
  methodology_id, dimension_code, dimension_group, label, weight, sort_order, active, dimension_kind)
VALUES
  ((SELECT v FROM d_id WHERE k='meth'),'AML12DRYRUN_DIM_I','INHERENT_RISK','Rehearsal inherent',100,1,true,'INHERENT'),
  ((SELECT v FROM d_id WHERE k='meth'),'AML12DRYRUN_DIM_C','CONTROL_EFFECTIVENESS','Rehearsal control',100,2,true,'CONTROL');

INSERT INTO d_id(k,v) SELECT 'dim_i', id FROM public.supervisory_methodology_dimension WHERE dimension_code='AML12DRYRUN_DIM_I';
INSERT INTO d_id(k,v) SELECT 'dim_c', id FROM public.supervisory_methodology_dimension WHERE dimension_code='AML12DRYRUN_DIM_C';

INSERT INTO public.supervisory_methodology_question(
  methodology_id, methodology_dimension_id, question_code, prompt, response_options,
  mandatory, requires_observation, requires_evidence, min_evidence_count,
  allow_not_applicable, na_requires_rationale, question_class, active, sort_order)
VALUES
  ((SELECT v FROM d_id WHERE k='meth'),(SELECT v FROM d_id WHERE k='dim_i'),'AML12DRYRUN_Q_I1','Rehearsal I1',
   ARRAY['YES','PARTIALLY','NO','NOT_APPLICABLE'],true,false,false,0,true,false,'CORE',true,1),
  ((SELECT v FROM d_id WHERE k='meth'),(SELECT v FROM d_id WHERE k='dim_c'),'AML12DRYRUN_Q_C1','Rehearsal C1',
   ARRAY['YES','PARTIALLY','NO','NOT_APPLICABLE'],true,false,false,0,true,false,'CORE',true,2);

INSERT INTO public.supervisory_methodology_fact_requirement(
  methodology_id, fact_code, label, data_type, unit, numerator_basis, denominator_basis,
  is_required, auto_prefill_allowed, officer_edit_allowed, definition_status, description)
VALUES
  ((SELECT v FROM d_id WHERE k='meth'),'AML12DRYRUN_F_RATIO','Rehearsal ratio','percentage','%',
   'Numerator basis','Denominator basis',false,true,true,'DEFINED','Ratio fact used by the rehearsal policy');

INSERT INTO public.supervisory_assessment_programme_set(
  code, set_version, name, domain_code, regulator_id, origin, status, effective_from)
VALUES ('AML12DRYRUN-PROGRAMMES','1.0','AML12DRYRUN programme fixture','AML_CFT',
  (SELECT v FROM d_id WHERE k='regulator'),'REGULATOR_AUTHORED','ACTIVE', current_date - 1);

INSERT INTO public.supervisory_assessment_programme(
  programme_set_id, programme_code, label, assessment_type, is_active, sort_order,
  period_rule, period_value, end_offset_days, allow_manual_override, summary_required,
  question_class_scope, included_dimension_codes, excluded_dimension_codes)
SELECT s.id,'AML12DRYRUN_P','AML12DRYRUN programme','PERIODIC',true,1,'TRAILING_DAYS',365,1,false,false,
  ARRAY['CORE','CONDITIONAL'],'{}'::text[],'{}'::text[]
  FROM public.supervisory_assessment_programme_set s WHERE s.code='AML12DRYRUN-PROGRAMMES';

INSERT INTO public.supervisory_assessment_programme_trigger(
  programme_id, trigger_code, label, is_default, is_active, sort_order)
SELECT p.id,'PERIODIC','Periodic cycle',true,true,1
  FROM public.supervisory_assessment_programme p WHERE p.programme_code='AML12DRYRUN_P';

-- AML-CLOSE-02D fixture modernisation (TEST ONLY, rolled back).
-- Obsolete assumption: no active policy profile governs the domain, so any
-- programme set applies. Current runtime: the active regulator profile binds
-- the ASSESSMENT_PROGRAMME the canonical create path must use. The fixture
-- therefore governs its programme set through a TEST sector-scoped profile
-- (more specific than the regulator-wide profile). The creation-time
-- programme control itself is unchanged and still enforced.
INSERT INTO public.supervisory_policy_profile(
  code, profile_version, domain_code, regulator_id, sector_id, name, status, origin, effective_from, notes)
VALUES ('AML12DRYRUN-TEST-POLICY','1','AML_CFT',(SELECT v FROM d_id WHERE k='regulator'),(SELECT v FROM d_id WHERE k='sector'),
  'TEST ONLY — AML12DRYRUN fixture profile','DRAFT','REGULATOR_AUTHORED', current_date - 1,
  'TEST ONLY — not an FSRA policy; discarded on rollback');
INSERT INTO public.supervisory_policy_profile_binding(
  profile_id, component_type, component_table, component_id, component_code, component_version, component_status, rationale)
SELECT pp.id,'ASSESSMENT_PROGRAMME','supervisory_assessment_programme_set', s.id, s.code, s.set_version, 'ACTIVE','TEST fixture binding'
  FROM public.supervisory_policy_profile pp, public.supervisory_assessment_programme_set s
 WHERE pp.code='AML12DRYRUN-TEST-POLICY' AND s.code='AML12DRYRUN-PROGRAMMES';
UPDATE public.supervisory_policy_profile SET status='ACTIVE', approved_at=now(), activated_at=now()
 WHERE code='AML12DRYRUN-TEST-POLICY';

-- The domain effective-date rule is a REHEARSAL value, discarded on rollback.
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  PERFORM public.supervisory_domain_calculation_rule_set('AML_CFT','EXECUTION_DATE',
    'AML12DRYRUN rehearsal rule, discarded on rollback; DEC-01 remains unanswered');
  RESET ROLE;
  RAISE NOTICE 'FIXTURE: AML_CFT effective-date rule set for the rehearsal transaction only';
END $$;

DO $$
DECLARE res jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  res := public.supervisory_assessment_create_programmed(
    (SELECT v FROM d_id WHERE k='entity'), 'AML_CFT',
    (SELECT id FROM public.supervisory_assessment_programme WHERE programme_code='AML12DRYRUN_P'),
    'PERIODIC', NULL, NULL, 'AML12DRYRUN activation rehearsal');
  RESET ROLE;
  INSERT INTO d_id(k,v) VALUES ('assessment', (res->>'id')::uuid);
  IF (SELECT methodology_id FROM public.supervisory_assessment WHERE id=(SELECT v FROM d_id WHERE k='assessment'))
     <> (SELECT v FROM d_id WHERE k='meth') THEN
    RAISE EXCEPTION 'FIXTURE: the rehearsal assessment did not bind the AML12DRYRUN methodology';
  END IF;
  RAISE NOTICE 'FIXTURE: AML12DRYRUN assessment created through the canonical programmed path';
END $$;

CREATE OR REPLACE FUNCTION pg_temp.d_answer(_qcode text, _response text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE _aid uuid := (SELECT v FROM d_id WHERE k='assessment'); _q public.supervisory_methodology_question;
BEGIN
  SELECT * INTO _q FROM public.supervisory_methodology_question
   WHERE methodology_id=(SELECT v FROM d_id WHERE k='meth') AND question_code=_qcode;
  IF EXISTS (SELECT 1 FROM public.supervisory_assessment_question_response
              WHERE assessment_id=_aid AND question_code=_qcode) THEN
    UPDATE public.supervisory_assessment_question_response
       SET response=_response, methodology_dimension_id=_q.methodology_dimension_id,
           methodology_question_id=_q.id
     WHERE assessment_id=_aid AND question_code=_qcode;
  ELSE
    INSERT INTO public.supervisory_assessment_question_response(
      assessment_id, methodology_id, methodology_dimension_id, methodology_question_id,
      assessment_dimension_id, dimension_code, question_code, question_text, response)
    SELECT _aid, (SELECT v FROM d_id WHERE k='meth'), _q.methodology_dimension_id, _q.id,
           sad.id, md.dimension_code, _qcode, COALESCE(_q.prompt, _qcode), _response
      FROM public.supervisory_methodology_dimension md
      JOIN public.supervisory_assessment_dimension sad
        ON sad.assessment_id = _aid AND sad.methodology_dimension_id = md.id
     WHERE md.id = _q.methodology_dimension_id;
  END IF;
END $$;

SELECT pg_temp.d_answer('AML12DRYRUN_Q_I1','NO');
SELECT pg_temp.d_answer('AML12DRYRUN_Q_C1','YES');

INSERT INTO public.supervisory_assessment_fact(
  assessment_id, entity_id, methodology_id, fact_requirement_id, fact_code, data_type, unit,
  value_numeric, numerator, denominator, period_start, period_end, source_type, provenance, recorded_by)
SELECT (SELECT v FROM d_id WHERE k='assessment'), (SELECT v FROM d_id WHERE k='entity'),
       (SELECT v FROM d_id WHERE k='meth'), fr.id, 'AML12DRYRUN_F_RATIO', 'percentage', '%',
       60, 60, 100, current_date - 90, current_date - 1, 'OFFICER_ENTERED',
       jsonb_build_object('origin','GOVERNED'), (SELECT v FROM d_id WHERE k='author')
  FROM public.supervisory_methodology_fact_requirement fr
 WHERE fr.methodology_id=(SELECT v FROM d_id WHERE k='meth') AND fr.fact_code='AML12DRYRUN_F_RATIO';

-- =====================================================================
-- DRY-01 — a draft policy is created only through the governed operation
-- =====================================================================
DO $$
DECLARE cfg uuid;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  cfg := public.supervisory_calculation_config_upsert((SELECT v FROM d_id WHERE k='meth'), jsonb_build_object(
    'effective_from', (current_date - 1)::text,
    'aggregation_method','UNWEIGHTED_MEAN',
    'completeness_mode','MIN_ANSWERED','min_answered_questions',1,
    'na_denominator_handling','EXCLUDE',
    'evidence_insufficiency_handling','FLAG_ONLY',
    'critical_question_handling','NONE',
    'rounding_mode','HALF_UP','rounding_decimals',2,
    'inherent_direction','DIRECT',
    'recommendation_policy','WEIGHTED_SCORE'));
  RESET ROLE;
  INSERT INTO d_id(k,v) VALUES ('cfg', cfg);
  IF (SELECT status FROM public.supervisory_calculation_config WHERE id=cfg) <> 'DRAFT' THEN
    RAISE EXCEPTION 'FAIL DRY-01: a new calculation policy is not a draft';
  END IF;
  RAISE NOTICE 'PASS DRY-01: a draft rehearsal policy is created through supervisory_calculation_config_upsert';
END $$;

-- =====================================================================
-- DRY-02 — an incomplete policy is reported and refused for submission
-- =====================================================================
DO $$
DECLARE vres jsonb; refused boolean := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  vres := public.supervisory_calculation_config_validate((SELECT v FROM d_id WHERE k='cfg'));
  IF (vres->>'ok')::boolean THEN
    RAISE EXCEPTION 'FAIL DRY-02: validation accepted a policy with no scores, bands or matrix';
  END IF;
  BEGIN
    PERFORM public.supervisory_calculation_config_lifecycle((SELECT v FROM d_id WHERE k='cfg'),'REVIEW',
      'AML12DRYRUN submission attempt on an incomplete policy');
  EXCEPTION WHEN others THEN refused := true; END;
  RESET ROLE;
  IF NOT refused THEN RAISE EXCEPTION 'FAIL DRY-02: an incomplete policy was allowed into review'; END IF;
  RAISE NOTICE 'PASS DRY-02: an incomplete policy is reported (% problems) and refused for submission',
    jsonb_array_length(vres->'problems');
END $$;

-- =====================================================================
-- DRY-03 — invalid weights are refused
-- =====================================================================
DO $$
DECLARE refused int := 0;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN PERFORM public.supervisory_calculation_question_weights_set((SELECT v FROM d_id WHERE k='cfg'),
          jsonb_build_array(jsonb_build_object('question_code','AML12DRYRUN_Q_I1','participation','SCORED','weight',0)));
        EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN PERFORM public.supervisory_calculation_question_weights_set((SELECT v FROM d_id WHERE k='cfg'),
          jsonb_build_array(jsonb_build_object('question_code','AML12DRYRUN_Q_I1','participation','SCORED','weight',-5)));
        EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN PERFORM public.supervisory_calculation_dimension_weights_set((SELECT v FROM d_id WHERE k='cfg'),
          jsonb_build_array(jsonb_build_object('dimension_code','AML12DRYRUN_DIM_I','contributes_to','INHERENT','weight',0)));
        EXCEPTION WHEN others THEN refused := refused + 1; END;
  RESET ROLE;
  IF refused < 3 THEN RAISE EXCEPTION 'FAIL DRY-03: only % of 3 invalid weight submissions were refused', refused; END IF;
  RAISE NOTICE 'PASS DRY-03: zero and negative weights are refused (3/3)';
END $$;

-- =====================================================================
-- DRY-04 — invalid band codes are refused
-- =====================================================================
DO $$
DECLARE vres jsonb; refused boolean := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  PERFORM public.supervisory_calculation_bands_set((SELECT v FROM d_id WHERE k='cfg'),'INHERENT', jsonb_build_array(
    jsonb_build_object('band_code','NOT_A_PUBLISHED_RATING','min_score',0,'max_score',100,'sort_order',1)));
  vres := public.supervisory_calculation_config_validate((SELECT v FROM d_id WHERE k='cfg'));
  IF (vres->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL DRY-04: an unpublished band code validated'; END IF;
  IF NOT (vres->'problems')::text ILIKE '%outside the published vocabulary%' THEN
    RAISE EXCEPTION 'FAIL DRY-04: validation does not name the vocabulary violation: %', vres->'problems';
  END IF;
  BEGIN
    PERFORM public.supervisory_calculation_config_lifecycle((SELECT v FROM d_id WHERE k='cfg'),'REVIEW',
      'AML12DRYRUN submission attempt with an invalid band code');
  EXCEPTION WHEN others THEN refused := true; END;
  RESET ROLE;
  IF NOT refused THEN RAISE EXCEPTION 'FAIL DRY-04: a policy with an invalid band code entered review'; END IF;
  RAISE NOTICE 'PASS DRY-04: a band code outside the published rating vocabulary is refused';
END $$;

-- =====================================================================
-- DRY-05 — band gaps and overlaps are refused
-- =====================================================================
DO $$
DECLARE gap jsonb; ovl jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  -- gap: MODERATE starts at 30 while LOW ends at 20
  PERFORM public.supervisory_calculation_bands_set((SELECT v FROM d_id WHERE k='cfg'),'INHERENT', jsonb_build_array(
    jsonb_build_object('band_code','LOW','min_score',0,'max_score',20,'sort_order',1),
    jsonb_build_object('band_code','MODERATE','min_score',30,'max_score',40,'sort_order',2),
    jsonb_build_object('band_code','MEDIUM_HIGH','min_score',40,'max_score',60,'sort_order',3),
    jsonb_build_object('band_code','HIGH','min_score',60,'max_score',80,'sort_order',4),
    jsonb_build_object('band_code','SEVERE','min_score',80,'max_score',100,'sort_order',5)));
  gap := public.supervisory_calculation_config_validate((SELECT v FROM d_id WHERE k='cfg'));
  -- overlap: MODERATE starts at 10 while LOW ends at 20
  PERFORM public.supervisory_calculation_bands_set((SELECT v FROM d_id WHERE k='cfg'),'INHERENT', jsonb_build_array(
    jsonb_build_object('band_code','LOW','min_score',0,'max_score',20,'sort_order',1),
    jsonb_build_object('band_code','MODERATE','min_score',10,'max_score',40,'sort_order',2),
    jsonb_build_object('band_code','MEDIUM_HIGH','min_score',40,'max_score',60,'sort_order',3),
    jsonb_build_object('band_code','HIGH','min_score',60,'max_score',80,'sort_order',4),
    jsonb_build_object('band_code','SEVERE','min_score',80,'max_score',100,'sort_order',5)));
  ovl := public.supervisory_calculation_config_validate((SELECT v FROM d_id WHERE k='cfg'));
  RESET ROLE;
  IF (gap->>'ok')::boolean OR NOT (gap->'problems')::text ILIKE '%gap or overlap%' THEN
    RAISE EXCEPTION 'FAIL DRY-05: a band gap was not refused: %', gap->'problems';
  END IF;
  IF (ovl->>'ok')::boolean OR NOT (ovl->'problems')::text ILIKE '%gap or overlap%' THEN
    RAISE EXCEPTION 'FAIL DRY-05: a band overlap was not refused: %', ovl->'problems';
  END IF;
  RAISE NOTICE 'PASS DRY-05: contiguity is enforced — both a gap and an overlap are refused';
END $$;

-- =====================================================================
-- DRY-06 — the complete rehearsal policy is authored through the setters
-- =====================================================================
DO $$
DECLARE n int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);

  PERFORM public.supervisory_calculation_response_scores_set((SELECT v FROM d_id WHERE k='cfg'), jsonb_build_array(
    jsonb_build_object('response_code','YES','score',0,'sort_order',1),
    jsonb_build_object('response_code','PARTIALLY','score',50,'sort_order',2),
    jsonb_build_object('response_code','NO','score',100,'sort_order',3),
    jsonb_build_object('response_code','NOT_APPLICABLE','excluded_from_denominator',true,'sort_order',4)));

  PERFORM public.supervisory_calculation_bands_set((SELECT v FROM d_id WHERE k='cfg'),'INHERENT', jsonb_build_array(
    jsonb_build_object('band_code','LOW','min_score',0,'max_score',20,'sort_order',1),
    jsonb_build_object('band_code','MODERATE','min_score',20,'max_score',40,'sort_order',2),
    jsonb_build_object('band_code','MEDIUM_HIGH','min_score',40,'max_score',60,'sort_order',3),
    jsonb_build_object('band_code','HIGH','min_score',60,'max_score',80,'sort_order',4),
    jsonb_build_object('band_code','SEVERE','min_score',80,'max_score',100,'sort_order',5)));
  PERFORM public.supervisory_calculation_bands_set((SELECT v FROM d_id WHERE k='cfg'),'CONTROL', jsonb_build_array(
    jsonb_build_object('band_code','WEAK','min_score',0,'max_score',50,'sort_order',1),
    jsonb_build_object('band_code','STRONG','min_score',50,'max_score',100,'sort_order',2)));

  n := public.supervisory_calculation_question_weights_set((SELECT v FROM d_id WHERE k='cfg'), jsonb_build_array(
    jsonb_build_object('question_code','AML12DRYRUN_Q_I1','participation','SCORED','weight',1),
    jsonb_build_object('question_code','AML12DRYRUN_Q_C1','participation','SCORED','weight',1)));
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL DRY-06: % question participation rows saved', n; END IF;

  n := public.supervisory_calculation_dimension_weights_set((SELECT v FROM d_id WHERE k='cfg'), jsonb_build_array(
    jsonb_build_object('dimension_code','AML12DRYRUN_DIM_I','contributes_to','INHERENT','weight',1),
    jsonb_build_object('dimension_code','AML12DRYRUN_DIM_C','contributes_to','CONTROL','weight',1)));
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL DRY-06: % dimension contribution rows saved', n; END IF;

  n := public.supervisory_calculation_fact_rules_set((SELECT v FROM d_id WHERE k='cfg'), jsonb_build_array(
    jsonb_build_object('fact_code','AML12DRYRUN_F_RATIO','data_type','PERCENTAGE','unit','%',
      'direction','HIGHER_IS_HIGHER_RISK','missing_handling','NOT_CALCULABLE',
      'requires_period',true,'requires_ratio_provenance',true,
      'target_dimension_code','AML12DRYRUN_DIM_I','weight',1,
      'thresholds', jsonb_build_array(
        jsonb_build_object('band_code','LOWRISK','min_value',0,'max_value',50,'score',0,'sort_order',1),
        jsonb_build_object('band_code','HIGHRISK','min_value',50,'score',100,'sort_order',2)))));
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL DRY-06: % fact transformation rows saved', n; END IF;

  n := public.supervisory_calculation_materiality_set((SELECT v FROM d_id WHERE k='cfg'), jsonb_build_array(
    jsonb_build_object('parameter_code','AML12DRYRUN_MATERIAL','fact_code','AML12DRYRUN_F_RATIO',
      'comparator','GTE','threshold_value',95,'unit','%','adjustment_kind','FLOOR_AT_BAND',
      'adjustment_band','SEVERE','rationale','AML12DRYRUN rehearsal materiality rule')));
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL DRY-06: % materiality rows saved', n; END IF;
  RESET ROLE;
  RAISE NOTICE 'PASS DRY-06: scores, bands, participation, dimension sides, fact rules and materiality authored through governed setters';
END $$;

-- =====================================================================
-- DRY-07 — a missing residual matrix is refused
-- =====================================================================
DO $$
DECLARE vres jsonb; refused boolean := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  vres := public.supervisory_calculation_config_validate((SELECT v FROM d_id WHERE k='cfg'));
  IF (vres->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL DRY-07: a policy without a residual matrix validated'; END IF;
  IF NOT (vres->'problems')::text ILIKE '%residual matrix%' THEN
    RAISE EXCEPTION 'FAIL DRY-07: validation does not name the missing residual matrix: %', vres->'problems';
  END IF;
  BEGIN
    PERFORM public.supervisory_calculation_config_lifecycle((SELECT v FROM d_id WHERE k='cfg'),'REVIEW',
      'AML12DRYRUN submission attempt without a residual matrix');
  EXCEPTION WHEN others THEN refused := true; END;
  RESET ROLE;
  IF NOT refused THEN RAISE EXCEPTION 'FAIL DRY-07: a policy without a residual matrix entered review'; END IF;
  RAISE NOTICE 'PASS DRY-07: a policy with no residual matrix cannot be submitted';
END $$;

-- =====================================================================
-- DRY-08 — a fact unit that disagrees with the methodology is refused
-- =====================================================================
DO $$
DECLARE vres jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  PERFORM public.supervisory_calculation_matrix_set((SELECT v FROM d_id WHERE k='cfg'), jsonb_build_array(
    jsonb_build_object('inherent_band','LOW','control_band','WEAK','residual_rating','MODERATE'),
    jsonb_build_object('inherent_band','LOW','control_band','STRONG','residual_rating','LOW'),
    jsonb_build_object('inherent_band','MODERATE','control_band','WEAK','residual_rating','MEDIUM_HIGH'),
    jsonb_build_object('inherent_band','MODERATE','control_band','STRONG','residual_rating','LOW'),
    jsonb_build_object('inherent_band','MEDIUM_HIGH','control_band','WEAK','residual_rating','HIGH'),
    jsonb_build_object('inherent_band','MEDIUM_HIGH','control_band','STRONG','residual_rating','MODERATE'),
    jsonb_build_object('inherent_band','HIGH','control_band','WEAK','residual_rating','HIGH'),
    jsonb_build_object('inherent_band','HIGH','control_band','STRONG','residual_rating','MEDIUM_HIGH'),
    jsonb_build_object('inherent_band','SEVERE','control_band','WEAK','residual_rating','HIGH'),
    jsonb_build_object('inherent_band','SEVERE','control_band','STRONG','residual_rating','HIGH')));

  -- wrong unit: the methodology defines the fact in '%'
  PERFORM public.supervisory_calculation_fact_rules_set((SELECT v FROM d_id WHERE k='cfg'), jsonb_build_array(
    jsonb_build_object('fact_code','AML12DRYRUN_F_RATIO','data_type','PERCENTAGE','unit','COUNT',
      'direction','HIGHER_IS_HIGHER_RISK','missing_handling','NOT_CALCULABLE',
      'requires_period',true,'requires_ratio_provenance',true,
      'target_dimension_code','AML12DRYRUN_DIM_I','weight',1,
      'thresholds', jsonb_build_array(
        jsonb_build_object('band_code','LOWRISK','min_value',0,'max_value',50,'score',0,'sort_order',1),
        jsonb_build_object('band_code','HIGHRISK','min_value',50,'score',100,'sort_order',2)))));
  vres := public.supervisory_calculation_config_validate((SELECT v FROM d_id WHERE k='cfg'));
  IF (vres->>'ok')::boolean OR NOT (vres->'problems')::text ILIKE '%unit disagrees%' THEN
    RAISE EXCEPTION 'FAIL DRY-08: a mismatched fact unit was accepted: %', vres->'problems';
  END IF;

  -- restore the agreed unit
  PERFORM public.supervisory_calculation_fact_rules_set((SELECT v FROM d_id WHERE k='cfg'), jsonb_build_array(
    jsonb_build_object('fact_code','AML12DRYRUN_F_RATIO','data_type','PERCENTAGE','unit','%',
      'direction','HIGHER_IS_HIGHER_RISK','missing_handling','NOT_CALCULABLE',
      'requires_period',true,'requires_ratio_provenance',true,
      'target_dimension_code','AML12DRYRUN_DIM_I','weight',1,
      'thresholds', jsonb_build_array(
        jsonb_build_object('band_code','LOWRISK','min_value',0,'max_value',50,'score',0,'sort_order',1),
        jsonb_build_object('band_code','HIGHRISK','min_value',50,'score',100,'sort_order',2)))));
  RESET ROLE;
  RAISE NOTICE 'PASS DRY-08: a fact-rule unit that disagrees with the methodology definition is refused';
END $$;

-- =====================================================================
-- DRY-09 — fact threshold gaps and overlaps are refused
-- =====================================================================
DO $$
DECLARE gap jsonb; ovl jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  PERFORM public.supervisory_calculation_fact_rules_set((SELECT v FROM d_id WHERE k='cfg'), jsonb_build_array(
    jsonb_build_object('fact_code','AML12DRYRUN_F_RATIO','data_type','PERCENTAGE','unit','%',
      'direction','HIGHER_IS_HIGHER_RISK','missing_handling','NOT_CALCULABLE',
      'requires_period',true,'requires_ratio_provenance',true,
      'target_dimension_code','AML12DRYRUN_DIM_I','weight',1,
      'thresholds', jsonb_build_array(
        jsonb_build_object('band_code','LOWRISK','min_value',0,'max_value',40,'score',0,'sort_order',1),
        jsonb_build_object('band_code','HIGHRISK','min_value',60,'score',100,'sort_order',2)))));
  gap := public.supervisory_calculation_config_validate((SELECT v FROM d_id WHERE k='cfg'));
  PERFORM public.supervisory_calculation_fact_rules_set((SELECT v FROM d_id WHERE k='cfg'), jsonb_build_array(
    jsonb_build_object('fact_code','AML12DRYRUN_F_RATIO','data_type','PERCENTAGE','unit','%',
      'direction','HIGHER_IS_HIGHER_RISK','missing_handling','NOT_CALCULABLE',
      'requires_period',true,'requires_ratio_provenance',true,
      'target_dimension_code','AML12DRYRUN_DIM_I','weight',1,
      'thresholds', jsonb_build_array(
        jsonb_build_object('band_code','LOWRISK','min_value',0,'max_value',60,'score',0,'sort_order',1),
        jsonb_build_object('band_code','HIGHRISK','min_value',40,'score',100,'sort_order',2)))));
  ovl := public.supervisory_calculation_config_validate((SELECT v FROM d_id WHERE k='cfg'));
  -- restore the contiguous thresholds
  PERFORM public.supervisory_calculation_fact_rules_set((SELECT v FROM d_id WHERE k='cfg'), jsonb_build_array(
    jsonb_build_object('fact_code','AML12DRYRUN_F_RATIO','data_type','PERCENTAGE','unit','%',
      'direction','HIGHER_IS_HIGHER_RISK','missing_handling','NOT_CALCULABLE',
      'requires_period',true,'requires_ratio_provenance',true,
      'target_dimension_code','AML12DRYRUN_DIM_I','weight',1,
      'thresholds', jsonb_build_array(
        jsonb_build_object('band_code','LOWRISK','min_value',0,'max_value',50,'score',0,'sort_order',1),
        jsonb_build_object('band_code','HIGHRISK','min_value',50,'score',100,'sort_order',2)))));
  RESET ROLE;
  IF (gap->>'ok')::boolean OR NOT (gap->'problems')::text ILIKE '%leave a gap%' THEN
    RAISE EXCEPTION 'FAIL DRY-09: a fact threshold gap was accepted: %', gap->'problems';
  END IF;
  IF (ovl->>'ok')::boolean OR NOT (ovl->'problems')::text ILIKE '%overlap%' THEN
    RAISE EXCEPTION 'FAIL DRY-09: a fact threshold overlap was accepted: %', ovl->'problems';
  END IF;
  RAISE NOTICE 'PASS DRY-09: fact threshold gaps and overlaps are both refused';
END $$;

-- =====================================================================
-- DRY-10 — the complete policy validates; maker-checker is enforced
-- =====================================================================
DO $$
DECLARE vres jsonb; refused boolean := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  vres := public.supervisory_calculation_config_validate((SELECT v FROM d_id WHERE k='cfg'));
  IF NOT (vres->>'ok')::boolean THEN
    RAISE EXCEPTION 'FAIL DRY-10: the complete rehearsal policy still reports problems: %', vres->'problems';
  END IF;
  PERFORM public.supervisory_calculation_config_lifecycle((SELECT v FROM d_id WHERE k='cfg'),'REVIEW',
    'AML12DRYRUN complete rehearsal policy submitted for review');
  BEGIN
    PERFORM public.supervisory_calculation_config_lifecycle((SELECT v FROM d_id WHERE k='cfg'),'APPROVED',
      'AML12DRYRUN self-approval attempt by the author');
  EXCEPTION WHEN others THEN refused := true; END;
  RESET ROLE;
  IF NOT refused THEN RAISE EXCEPTION 'FAIL DRY-10: the author was allowed to approve their own policy'; END IF;
  IF (SELECT status FROM public.supervisory_calculation_config WHERE id=(SELECT v FROM d_id WHERE k='cfg')) <> 'REVIEW' THEN
    RAISE EXCEPTION 'FAIL DRY-10: the submitted policy is not under review';
  END IF;
  RAISE NOTICE 'PASS DRY-10: a complete policy validates, reaches REVIEW, and self-approval is refused';
END $$;

-- =====================================================================
-- DRY-11 — an outsider can neither approve nor activate
-- =====================================================================
DO $$
DECLARE refused int := 0;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"411dd06d-648b-4f32-82cc-897902c0c0b6","role":"authenticated"}', true);
  BEGIN PERFORM public.supervisory_calculation_config_lifecycle((SELECT v FROM d_id WHERE k='cfg'),'APPROVED',
          'AML12DRYRUN unauthorised approval attempt'); EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN PERFORM public.supervisory_calculation_config_lifecycle((SELECT v FROM d_id WHERE k='cfg'),'ACTIVE',
          'AML12DRYRUN unauthorised activation attempt'); EXCEPTION WHEN others THEN refused := refused + 1; END;
  RESET ROLE;
  IF refused < 2 THEN RAISE EXCEPTION 'FAIL DRY-11: only % of 2 unauthorised lifecycle calls were refused', refused; END IF;
  RAISE NOTICE 'PASS DRY-11: approval and activation are refused without configuration authority (2/2)';
END $$;

-- =====================================================================
-- DRY-12 — the checker approves and activates the rehearsal policy
-- =====================================================================
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  PERFORM public.supervisory_calculation_config_lifecycle((SELECT v FROM d_id WHERE k='cfg'),'APPROVED',
    'AML12DRYRUN rehearsal policy approved by the checker');
  PERFORM public.supervisory_calculation_config_lifecycle((SELECT v FROM d_id WHERE k='cfg'),'ACTIVE',
    'AML12DRYRUN rehearsal policy activated by the checker');
  RESET ROLE;
  IF (SELECT status FROM public.supervisory_calculation_config WHERE id=(SELECT v FROM d_id WHERE k='cfg')) <> 'ACTIVE' THEN
    RAISE EXCEPTION 'FAIL DRY-12: the approved rehearsal policy is not in force';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_calculation_event
                  WHERE config_id=(SELECT v FROM d_id WHERE k='cfg') AND event_type='LIFECYCLE' AND to_status='ACTIVE') THEN
    RAISE EXCEPTION 'FAIL DRY-12: the activation was not recorded as a lifecycle event';
  END IF;
  RAISE NOTICE 'PASS DRY-12: a valid synthetic policy is approved and activated by a second person, with a recorded rationale';
END $$;

-- =====================================================================
-- DRY-13 — an in-force policy can no longer be edited
-- =====================================================================
DO $$
DECLARE refused int := 0;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN PERFORM public.supervisory_calculation_question_weights_set((SELECT v FROM d_id WHERE k='cfg'),'[]'::jsonb);
        EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN PERFORM public.supervisory_calculation_bands_set((SELECT v FROM d_id WHERE k='cfg'),'INHERENT','[]'::jsonb);
        EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN PERFORM public.supervisory_calculation_matrix_set((SELECT v FROM d_id WHERE k='cfg'),'[]'::jsonb);
        EXCEPTION WHEN others THEN refused := refused + 1; END;
  RESET ROLE;
  IF refused < 3 THEN RAISE EXCEPTION 'FAIL DRY-13: an in-force policy was still editable (% of 3 refused)', refused; END IF;
  RAISE NOTICE 'PASS DRY-13: an activated policy is immutable — a successor version is required (3/3)';
END $$;

-- =====================================================================
-- DRY-14 — the synthetic assessment calculates reproducibly
-- =====================================================================
DO $$
DECLARE a jsonb; b jsonb;
BEGIN
  a := public.supervisory_calc_compute((SELECT v FROM d_id WHERE k='assessment'));
  b := public.supervisory_calc_compute((SELECT v FROM d_id WHERE k='assessment'));
  INSERT INTO d_t(k,t) VALUES ('calc', a::text);
  IF a->>'status' <> 'CALCULATED' THEN
    RAISE EXCEPTION 'FAIL DRY-14: the rehearsal assessment is not calculable: % / %', a->>'reason_code', a->>'reason';
  END IF;
  IF md5(a::text) <> md5(b::text) THEN
    RAISE EXCEPTION 'FAIL DRY-14: two runs on identical inputs disagree';
  END IF;
  IF a->>'residual_rating' IS NULL OR a->>'inherent_band' IS NULL OR a->>'control_band' IS NULL THEN
    RAISE EXCEPTION 'FAIL DRY-14: the result carries no bands or residual rating: %', a;
  END IF;
  RAISE NOTICE 'PASS DRY-14: the rehearsal assessment calculates reproducibly (inherent % / control % -> residual %)',
    a->>'inherent_band', a->>'control_band', a->>'residual_rating';
END $$;

-- =====================================================================
-- DRY-15 — the recorded trace identifies every policy input
-- =====================================================================
DO $$
DECLARE run public.supervisory_assessment_calculation_run; t jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  PERFORM public.supervisory_assessment_calculation_run_record((SELECT v FROM d_id WHERE k='assessment'),
    'AML12DRYRUN rehearsal run');
  RESET ROLE;
  SELECT * INTO run FROM public.supervisory_assessment_calculation_run
   WHERE assessment_id=(SELECT v FROM d_id WHERE k='assessment') ORDER BY run_seq DESC LIMIT 1;
  IF run.id IS NULL THEN RAISE EXCEPTION 'FAIL DRY-15: no calculation run was recorded'; END IF;
  IF run.config_id <> (SELECT v FROM d_id WHERE k='cfg') THEN
    RAISE EXCEPTION 'FAIL DRY-15: the run does not name the policy in force'; END IF;
  IF run.inputs_hash IS NULL OR run.result_hash IS NULL OR run.engine_version IS NULL OR run.as_of IS NULL THEN
    RAISE EXCEPTION 'FAIL DRY-15: the run omits hashes, engine version or the resolved as-of date'; END IF;
  IF jsonb_array_length(run.inputs->'responses') = 0 OR jsonb_array_length(run.inputs->'facts') = 0 THEN
    RAISE EXCEPTION 'FAIL DRY-15: the run does not snapshot the inputs it read'; END IF;
  IF run.policy_snapshot->>'source' IS NULL THEN
    RAISE EXCEPTION 'FAIL DRY-15: the run does not snapshot the policy it applied'; END IF;
  t := run.trace;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(t->'dimensions') d,
                      jsonb_array_elements(d->'questions') q WHERE q ? 'score') THEN
    RAISE EXCEPTION 'FAIL DRY-15: the trace carries no per-question scoring'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(t->'dimensions') d,
                      jsonb_array_elements(d->'facts') f WHERE f ? 'band') THEN
    RAISE EXCEPTION 'FAIL DRY-15: the trace carries no per-fact band decision'; END IF;
  IF t->'parameters' IS NULL OR t->'materiality' IS NULL THEN
    RAISE EXCEPTION 'FAIL DRY-15: the trace omits the parameters or the materiality decisions'; END IF;
  RAISE NOTICE 'PASS DRY-15: the recorded trace names the policy, inputs, per-question scores, per-fact bands, parameters and materiality';
END $$;

-- =====================================================================
-- DRY-16 — calculation does NOT publish: publication stays an AML-07 act
-- =====================================================================
DO $$
DECLARE risk_before bigint; risk_after bigint; hist_after bigint; refused boolean := false;
BEGIN
  risk_before := (SELECT n FROM d_n WHERE k='live_risk');
  risk_after  := (SELECT count(*) FROM public.entity_risk_state);
  hist_after  := (SELECT count(*) FROM public.entity_risk_state_movement);
  IF risk_after <> risk_before THEN
    RAISE EXCEPTION 'FAIL DRY-16: calculating changed the risk of record (% -> %)', risk_before, risk_after;
  END IF;
  IF hist_after <> (SELECT n FROM d_n WHERE k='live_hist') THEN
    RAISE EXCEPTION 'FAIL DRY-16: calculating wrote risk history';
  END IF;
  -- publication of a draft assessment is refused: it is a separate AML-07 decision
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}', true);
  BEGIN
    PERFORM public.supervisory_assessment_publish_risk_of_record((SELECT v FROM d_id WHERE k='assessment'),
      'AML12DRYRUN publication attempt straight from calculation');
  EXCEPTION WHEN others THEN refused := true; END;
  RESET ROLE;
  IF NOT refused THEN
    RAISE EXCEPTION 'FAIL DRY-16: a calculated but unapproved assessment was published';
  END IF;
  RAISE NOTICE 'PASS DRY-16: calculation publishes nothing — the risk of record still requires the AML-07 review, approval and publication decision';
END $$;

-- =====================================================================
-- DRY-17 — no live policy or live record was touched by the rehearsal
-- =====================================================================
DO $$
DECLARE cur_digest text;
BEGIN
  IF (SELECT count(*) FROM public.supervisory_calculation_config
       WHERE methodology_id <> (SELECT v FROM d_id WHERE k='meth')) <> (SELECT n FROM d_n WHERE k='live_cfg') THEN
    RAISE EXCEPTION 'FAIL DRY-17: the rehearsal changed the number of non-fixture calculation policies';
  END IF;
  cur_digest := (SELECT md5(string_agg(row_repr, E'\n' ORDER BY row_repr)) FROM (
      SELECT concat_ws(E'\t', s.id::text, s.entity_id::text, s.domain_code, s.residual_rating,
                       s.inherent_rating, s.control_rating, s.driving_assessment_id::text,
                       s.effective_from::text) AS row_repr
        FROM public.entity_risk_state s WHERE s.domain_code='AML_CFT') d);
  IF cur_digest <> (SELECT t FROM d_t WHERE k='risk_digest') THEN
    RAISE EXCEPTION 'FAIL DRY-17: the canonical AML risk digest moved during the rehearsal';
  END IF;
  IF (SELECT status||'/'||COALESCE(origin,'-') FROM public.supervisory_methodology
       WHERE domain_code='AML_CFT' AND code='AML-CFT-RBA' AND version='1.0') <> (SELECT t FROM d_t WHERE k='v10_state')
  OR (SELECT status||'/'||COALESCE(origin,'-') FROM public.supervisory_methodology
       WHERE domain_code='AML_CFT' AND code='AML-CFT-RBA' AND version='1.1') <> (SELECT t FROM d_t WHERE k='v11_state') THEN
    RAISE EXCEPTION 'FAIL DRY-17: the rehearsal changed the state of v1.0 or v1.1';
  END IF;
  IF (SELECT count(*) FROM public.supervisory_assessment_dimension
       WHERE dimension_code='STR_SAR_GOVERNANCE') <> 22 THEN
    RAISE EXCEPTION 'FAIL DRY-17: the rehearsal changed the 22 LINK-11 legacy rows';
  END IF;
  RAISE NOTICE 'PASS DRY-17: the canonical risk digest, v1.0/v1.1 state, live policy count and LINK-11 rows are untouched';
END $$;

-- =====================================================================
-- ROLLBACK — every AML12DRYRUN fixture is discarded
-- =====================================================================
ROLLBACK;

-- Post-rollback survivor proof (new implicit transaction).
DO $$
DECLARE survivors bigint := 0;
BEGIN
  survivors := survivors + (SELECT count(*) FROM public.supervisory_methodology WHERE code LIKE 'AML12DRYRUN%');
  survivors := survivors + (SELECT count(*) FROM public.supervisory_methodology_dimension WHERE dimension_code LIKE 'AML12DRYRUN%');
  survivors := survivors + (SELECT count(*) FROM public.supervisory_methodology_question WHERE question_code LIKE 'AML12DRYRUN%');
  survivors := survivors + (SELECT count(*) FROM public.supervisory_methodology_fact_requirement WHERE fact_code LIKE 'AML12DRYRUN%');
  survivors := survivors + (SELECT count(*) FROM public.supervisory_assessment_programme_set WHERE code LIKE 'AML12DRYRUN%');
  survivors := survivors + (SELECT count(*) FROM public.supervisory_assessment WHERE reference LIKE 'AML12DRYRUN%');
  survivors := survivors + (SELECT count(*) FROM public.supervisory_calculation_materiality_rule WHERE parameter_code LIKE 'AML12DRYRUN%');
  IF survivors <> 0 THEN
    RAISE EXCEPTION 'FAIL DRY-18: % AML12DRYRUN row(s) survived the rollback', survivors;
  END IF;
  IF (SELECT count(*) FROM public.supervisory_calculation_config) <> 0 THEN
    RAISE EXCEPTION 'FAIL DRY-18: a calculation policy exists after rollback — live policy must remain absent';
  END IF;
  IF (SELECT count(*) FROM public.supervisory_domain_calculation_rule WHERE domain_code='AML_CFT') <> 0 THEN
    RAISE EXCEPTION 'FAIL DRY-18: an AML_CFT effective-date rule survived the rollback';
  END IF;
  RAISE NOTICE 'PASS DRY-18: zero AML12DRYRUN records survive; live calculation policies remain 0 and DEC-01 remains unanswered';
END $$;
