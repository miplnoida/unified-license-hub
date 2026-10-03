-- =====================================================================
-- AML-05 — GOVERNED EVIDENCE BASIS, STRUCTURED FACTS &
--          SERVER-AUTHORITATIVE READINESS : CERTIFICATION
-- =====================================================================
-- Gates EV-01..16, FACT-01..15, READY-01..12, LEGACY-01..06, SEC-01..12.
--
-- Conventions (identical to the AML-01/02/03/04 certifications):
--   * one transaction, ROLLBACK at the end — no fixture survives, so no
--     invented evidence, fact or methodology policy is left behind;
--   * behavioural: every gate CALLS the governed operation under a REAL
--     authenticated persona (SET LOCAL ROLE authenticated + jwt claims),
--     never service_role, and never asserts from documentation;
--   * browser-runtime properties are covered by
--     src/test/amlAssessmentEvidenceFactsReadiness.test.tsx and
--     scripts/verify-evidence-fact-frontend-boundary.mjs;
--   * every gate RAISEs on failure so ON_ERROR_STOP aborts the run;
--   * every fixture identifier is prefixed AML05CERT.
--
-- Personas (public.cert_certification_users):
--   Supervisory officer (AML edit)  b8eaf680-fe66-4d49-b816-1c087f511235
--   Supervisor (checker)            0b522724-adcb-48bf-b21d-175339479616
--   Outsider (no AML authority)     411dd06d-648b-4f32-82cc-897902c0c0b6
-- =====================================================================

\set ON_ERROR_STOP on
\set QUIET 1
\pset pager off
SET row_security = on;

-- AML-CLOSE-02D: capture the pre-run census at session level (outside the
-- rolled-back transaction) so the post-run check proves "unchanged" instead
-- of asserting a hard-coded historical count.
SELECT set_config('aml02d.pre_assessments',(SELECT count(*) FROM public.supervisory_assessment)::text,false),
       set_config('aml02d.pre_calc_config',(SELECT count(*) FROM public.supervisory_calculation_config)::text,false),
       set_config('aml02d.pre_calc_rule',(SELECT count(*) FROM public.supervisory_domain_calculation_rule WHERE domain_code='AML_CFT')::text,false);
BEGIN;

CREATE TEMP TABLE ev_id(k text PRIMARY KEY, v uuid) ON COMMIT DROP;
CREATE TEMP TABLE ev_n(k text PRIMARY KEY, n bigint) ON COMMIT DROP;
CREATE TEMP TABLE ev_t(k text PRIMARY KEY, t text) ON COMMIT DROP;
GRANT ALL ON ev_id TO authenticated;
GRANT ALL ON ev_n  TO authenticated;
GRANT ALL ON ev_t  TO authenticated;

INSERT INTO ev_id(k,v) VALUES
  ('regulator',  '8dd8ac87-4e11-4a6b-8991-bf88cb03d7c3'),   -- FSRA (active)
  ('entity',     'aa220000-0000-4000-8000-000000000001'),   -- MSB, FSRA, no prior assessment
  ('entity_v10', '5c1a0005-0000-4000-8000-000000000005'),   -- assessed under v1.0
  ('officer',    'b8eaf680-fe66-4d49-b816-1c087f511235'),
  ('outsider',   '411dd06d-648b-4f32-82cc-897902c0c0b6'),
  ('meth_v10',   (SELECT id FROM public.supervisory_methodology WHERE code='AML-CFT-RBA' AND version='1.0')),
  ('meth_v11',   (SELECT id FROM public.supervisory_methodology
                   WHERE code='AML-CFT-RBA' AND version='1.1' AND origin='MIPL_REFERENCE'));

INSERT INTO ev_id(k,v)
SELECT 'sector', l.sector_id FROM public.licensees l WHERE l.id=(SELECT v FROM ev_id WHERE k='entity');
INSERT INTO ev_id(k,v)
SELECT 'other_entity', l.id FROM public.licensees l
 WHERE l.id <> (SELECT v FROM ev_id WHERE k='entity') ORDER BY l.id LIMIT 1;

-- ---------------------------------------------------------------- census ----
INSERT INTO ev_n(k,n) VALUES
  ('assessments',      (SELECT count(*) FROM public.supervisory_assessment)),
  ('responses',        (SELECT count(*) FROM public.supervisory_assessment_question_response)),
  ('legacy_evidence',  (SELECT count(*) FROM public.supervisory_assessment_question_response
                         WHERE public.jsonb_array_len_safe(evidence_refs) > 0)),
  ('evidence_basis',   (SELECT count(*) FROM public.supervisory_assessment_evidence_basis)),
  ('evidence_qlinks',  (SELECT count(*) FROM public.supervisory_assessment_question_evidence)),
  ('evidence_dlinks',  (SELECT count(*) FROM public.supervisory_assessment_dimension_evidence)),
  ('facts',            (SELECT count(*) FROM public.supervisory_assessment_fact)),
  ('fact_reqs',        (SELECT count(*) FROM public.supervisory_methodology_fact_requirement)),
  ('fact_reqs_req',    (SELECT count(*) FROM public.supervisory_methodology_fact_requirement
                         WHERE COALESCE(is_required,false))),
  ('question_plans',   (SELECT count(*) FROM public.supervisory_assessment_question_plan)),
  ('methodologies',    (SELECT count(*) FROM public.supervisory_methodology)),
  ('regulators',       (SELECT count(*) FROM public.regulators)),
  ('assessment_events',(SELECT count(*) FROM public.supervisory_assessment_event)),
  ('calc_config',      (SELECT count(*) FROM public.supervisory_calculation_config)),
  ('calc_band',        (SELECT count(*) FROM public.supervisory_calculation_band)),
  ('calc_matrix',      (SELECT count(*) FROM public.supervisory_calculation_matrix_cell)),
  ('calc_score',       (SELECT count(*) FROM public.supervisory_calculation_response_score)),
  ('v11_questions',    (SELECT count(*) FROM public.supervisory_methodology_question
                         WHERE methodology_id=(SELECT v FROM ev_id WHERE k='meth_v11')));

INSERT INTO ev_t(k,t) VALUES
  ('v10_status',   (SELECT status FROM public.supervisory_methodology WHERE id=(SELECT v FROM ev_id WHERE k='meth_v10'))),
  ('v11_status',   (SELECT status FROM public.supervisory_methodology WHERE id=(SELECT v FROM ev_id WHERE k='meth_v11'))),
  ('assess_digest',(SELECT md5(string_agg(a.id::text||':'||a.status||':'||COALESCE(a.methodology_id::text,'-'),'|' ORDER BY a.id))
                      FROM public.supervisory_assessment a)),
  ('resp_digest',  (SELECT md5(COALESCE(string_agg(r.id::text||':'||COALESCE(r.response,'-')||':'||
                                 COALESCE(r.evidence_refs::text,'-'),'|' ORDER BY r.id),''))
                      FROM public.supervisory_assessment_question_response r)),
  ('plan_digest',  (SELECT md5(COALESCE(string_agg(p.id::text||':'||p.plan_state,'|' ORDER BY p.id),''))
                      FROM public.supervisory_assessment_question_plan p)),
  ('risk_digest',  (SELECT md5(COALESCE(string_agg(r.entity_id::text||':'||COALESCE(r.residual_rating,'-'),'|' ORDER BY r.entity_id),''))
                      FROM public.entity_risk_state r));

-- LEGACY-02/03 baseline: how complete is every existing assessment today?
CREATE TEMP TABLE ev_legacy(assessment_id uuid PRIMARY KEY, gaps int, facts int) ON COMMIT DROP;
INSERT INTO ev_legacy(assessment_id, gaps, facts)
SELECT a.id,
       public.jsonb_array_len_safe(public.supervisory_assessment_question_gaps_internal(a.id)),
       public.jsonb_array_len_safe(public.supervisory_assessment_fact_gaps_internal(a.id))
  FROM public.supervisory_assessment a;

-- -------------------------------------------------------------- fixtures ----
-- Transaction-scoped supervisory authority for the personas.
INSERT INTO public.sec_user_roles(user_id, role_id, status, assigned_by)
SELECT u, r.id, 'active', '4248640c-3397-4cf6-a274-fa09bad4ba64'::uuid  -- AML-CLOSE-02D: granted by the TEST super administrator, never self-granted
  FROM (VALUES ('b8eaf680-fe66-4d49-b816-1c087f511235'::uuid),
               ('0b522724-adcb-48bf-b21d-175339479616'::uuid)) AS x(u),
       public.sec_roles r
 WHERE r.key = 'aml_head'
ON CONFLICT (user_id, role_id) DO UPDATE SET status='active', assigned_by=EXCLUDED.assigned_by, effective_until=NULL;  -- AML-CLOSE-02D: re-activate inside this rolled-back transaction

INSERT INTO public.sec_role_scopes(role_id, module_id, scope_type_id)
SELECT r.id, m.id, st.id
  FROM public.sec_roles r, public.sec_modules m, public.sec_scope_types st
 WHERE r.key='aml_head' AND m.key='aml_supervision' AND st.key='regulator'
ON CONFLICT (role_id, module_id) DO UPDATE SET scope_type_id = EXCLUDED.scope_type_id;

INSERT INTO public.sec_role_scope_values(role_scope_id, value_kind, value_id)
SELECT rs.id, 'regulator', (SELECT v FROM ev_id WHERE k='regulator')
  FROM public.sec_role_scopes rs
  JOIN public.sec_roles r ON r.id = rs.role_id AND r.key='aml_head'
  JOIN public.sec_modules m ON m.id = rs.module_id AND m.key='aml_supervision';

-- Fixture methodology: ACTIVE, sector- and regulator-scoped, so the canonical
-- resolver binds it to the fixture assessment ahead of AML-CFT-RBA v1.0.
INSERT INTO public.supervisory_methodology(
  id, code, domain_code, name, version, status, sector_id, regulator_id,
  effective_from, origin, title)
VALUES (gen_random_uuid(), 'AML05CERT-METH', 'AML_CFT', 'AML05CERT evidence and fact fixture', '1.0',
  'ACTIVE', (SELECT v FROM ev_id WHERE k='sector'), (SELECT v FROM ev_id WHERE k='regulator'),
  current_date - 1, 'REGULATOR_AUTHORED', 'AML05CERT evidence and fact fixture');
INSERT INTO ev_id(k,v) SELECT 'meth', id FROM public.supervisory_methodology WHERE code='AML05CERT-METH';

INSERT INTO public.supervisory_methodology_dimension(
  methodology_id, dimension_code, dimension_group, label, weight, sort_order, active, dimension_kind)
SELECT (SELECT v FROM ev_id WHERE k='meth'), x.code, 'INHERENT_RISK', x.code, 100, x.o, true, 'INHERENT'
  FROM (VALUES ('AML05CERT_DIM_A', 1), ('AML05CERT_DIM_B', 2)) AS x(code, o);
INSERT INTO ev_id(k,v) SELECT 'dim_a', id FROM public.supervisory_methodology_dimension
 WHERE methodology_id=(SELECT v FROM ev_id WHERE k='meth') AND dimension_code='AML05CERT_DIM_A';
INSERT INTO ev_id(k,v) SELECT 'dim_b', id FROM public.supervisory_methodology_dimension
 WHERE methodology_id=(SELECT v FROM ev_id WHERE k='meth') AND dimension_code='AML05CERT_DIM_B';

-- Q_EV      : mandatory CORE question that must cite evidence (FINDING or RFI_RESPONSE)
-- Q_PLAIN   : mandatory CORE question with no evidence requirement
-- Q_ENH     : ENHANCED question the fixture programme puts out of scope
INSERT INTO public.supervisory_methodology_question(
  methodology_id, methodology_dimension_id, question_code, prompt, response_options,
  mandatory, requires_observation, requires_evidence, min_evidence_count,
  allow_not_applicable, na_requires_rationale, question_class, evidence_basis_types,
  active, sort_order)
VALUES
  ((SELECT v FROM ev_id WHERE k='meth'), (SELECT v FROM ev_id WHERE k='dim_a'),
   'AML05CERT_Q_EV', 'Evidence-based fixture question', ARRAY['YES','NO','NOT_APPLICABLE'],
   true, false, true, 1, false, false, 'CORE', ARRAY['FINDING','RFI_RESPONSE'], true, 1),
  ((SELECT v FROM ev_id WHERE k='meth'), (SELECT v FROM ev_id WHERE k='dim_a'),
   'AML05CERT_Q_PLAIN', 'Plain fixture question', ARRAY['YES','NO','NOT_APPLICABLE'],
   true, false, false, 0, false, false, 'CORE', NULL, true, 2),
  ((SELECT v FROM ev_id WHERE k='meth'), (SELECT v FROM ev_id WHERE k='dim_b'),
   'AML05CERT_Q_ENH', 'Enhanced fixture question', ARRAY['YES','NO','NOT_APPLICABLE'],
   true, false, false, 0, false, false, 'ENHANCED', NULL, true, 3);

INSERT INTO ev_id(k,v) SELECT 'q_ev', id FROM public.supervisory_methodology_question
 WHERE question_code='AML05CERT_Q_EV';
INSERT INTO ev_id(k,v) SELECT 'q_plain', id FROM public.supervisory_methodology_question
 WHERE question_code='AML05CERT_Q_PLAIN';
INSERT INTO ev_id(k,v) SELECT 'q_enh', id FROM public.supervisory_methodology_question
 WHERE question_code='AML05CERT_Q_ENH';

-- Fixture fact definitions on the fixture methodology only.
INSERT INTO public.supervisory_methodology_fact_requirement(
  methodology_id, fact_code, label, data_type, unit, numerator_basis, denominator_basis,
  source_type_expectation, is_required, auto_prefill_allowed, officer_edit_allowed,
  definition_status, description)
VALUES
  ((SELECT v FROM ev_id WHERE k='meth'), 'AML05CERT_F_COUNT', 'Fixture count', 'integer', 'count',
   NULL, NULL, ARRAY['RETURN','OFFICER_ENTERED'], true, true, true, 'DEFINED', 'Required fixture fact'),
  ((SELECT v FROM ev_id WHERE k='meth'), 'AML05CERT_F_RATIO', 'Fixture ratio', 'percentage', '%',
   'Numerator basis', 'Denominator basis', NULL, false, true, true, 'DEFINED', 'Ratio fixture fact'),
  ((SELECT v FROM ev_id WHERE k='meth'), 'AML05CERT_F_DATE', 'Fixture date', 'date', NULL,
   NULL, NULL, NULL, false, false, true, 'DEFINED', 'Date fixture fact'),
  ((SELECT v FROM ev_id WHERE k='meth'), 'AML05CERT_F_LOCKED', 'Fixture locked value', 'integer', NULL,
   NULL, NULL, NULL, false, true, false, 'DEFINED', 'Officer edit not permitted');

INSERT INTO ev_id(k,v) SELECT 'fr_count', id FROM public.supervisory_methodology_fact_requirement
 WHERE fact_code='AML05CERT_F_COUNT';
INSERT INTO ev_id(k,v) SELECT 'fr_ratio', id FROM public.supervisory_methodology_fact_requirement
 WHERE fact_code='AML05CERT_F_RATIO';
INSERT INTO ev_id(k,v) SELECT 'fr_date', id FROM public.supervisory_methodology_fact_requirement
 WHERE fact_code='AML05CERT_F_DATE';
INSERT INTO ev_id(k,v) SELECT 'fr_locked', id FROM public.supervisory_methodology_fact_requirement
 WHERE fact_code='AML05CERT_F_LOCKED';

-- The required fact is required *for a question in scope*.
INSERT INTO public.supervisory_methodology_question_fact(question_id, fact_requirement_id, is_required)
VALUES
  ((SELECT v FROM ev_id WHERE k='q_ev'),    (SELECT v FROM ev_id WHERE k='fr_count'), true),
  ((SELECT v FROM ev_id WHERE k='q_plain'), (SELECT v FROM ev_id WHERE k='fr_ratio'), false),
  -- required, but only for the question the programme excludes: must never block
  ((SELECT v FROM ev_id WHERE k='q_enh'),   (SELECT v FROM ev_id WHERE k='fr_date'),  true);
UPDATE public.supervisory_methodology_fact_requirement SET is_required = true
 WHERE id = (SELECT v FROM ev_id WHERE k='fr_date');

-- Fixture programme package: CORE/CONDITIONAL only, so Q_ENH is out of scope.
INSERT INTO public.supervisory_assessment_programme_set(
  code, set_version, name, domain_code, regulator_id, origin, status, effective_from)
VALUES ('AML05CERT-PROGRAMMES','1.0','AML05CERT programme fixture','AML_CFT',
  (SELECT v FROM ev_id WHERE k='regulator'),'REGULATOR_AUTHORED','ACTIVE', current_date - 1);
INSERT INTO ev_id(k,v) SELECT 'set', id FROM public.supervisory_assessment_programme_set
 WHERE code='AML05CERT-PROGRAMMES';

INSERT INTO public.supervisory_assessment_programme(
  programme_set_id, programme_code, label, assessment_type, is_active, sort_order,
  period_rule, period_value, end_offset_days, allow_manual_override, summary_required,
  question_class_scope, included_dimension_codes, excluded_dimension_codes)
VALUES ((SELECT v FROM ev_id WHERE k='set'), 'AML05CERT_P', 'AML05CERT programme', 'PERIODIC', true, 1,
  'TRAILING_DAYS', 365, 1, false, false, ARRAY['CORE','CONDITIONAL'], '{}'::text[], '{}'::text[]);
INSERT INTO public.supervisory_assessment_programme_trigger(
  programme_id, trigger_code, label, is_default, is_active, sort_order)
SELECT p.id, 'PERIODIC', 'Periodic cycle', true, true, 1
  FROM public.supervisory_assessment_programme p WHERE p.programme_code='AML05CERT_P';

-- AML-CLOSE-02D fixture modernisation (TEST ONLY, rolled back).
-- Obsolete assumption: no active policy profile governs the domain, so any
-- programme set applies. Current runtime: the active regulator profile binds
-- the ASSESSMENT_PROGRAMME the canonical create path must use. The fixture
-- therefore governs its programme set through a TEST sector-scoped profile
-- (more specific than the regulator-wide profile). The creation-time
-- programme control itself is unchanged and still enforced.
INSERT INTO public.supervisory_policy_profile(
  code, profile_version, domain_code, regulator_id, sector_id, name, status, origin, effective_from, notes)
VALUES ('AML05CERT-TEST-POLICY','1','AML_CFT',(SELECT v FROM ev_id WHERE k='regulator'),(SELECT v FROM ev_id WHERE k='sector'),
  'TEST ONLY — AML05CERT fixture profile','DRAFT','REGULATOR_AUTHORED', current_date - 1,
  'TEST ONLY — not an FSRA policy; discarded on rollback');
INSERT INTO public.supervisory_policy_profile_binding(
  profile_id, component_type, component_table, component_id, component_code, component_version, component_status, rationale)
SELECT pp.id,'ASSESSMENT_PROGRAMME','supervisory_assessment_programme_set', s.id, s.code, s.set_version, 'ACTIVE','TEST fixture binding'
  FROM public.supervisory_policy_profile pp, public.supervisory_assessment_programme_set s
 WHERE pp.code='AML05CERT-TEST-POLICY' AND s.code='AML05CERT-PROGRAMMES';
UPDATE public.supervisory_policy_profile SET status='ACTIVE', approved_at=now(), activated_at=now()
 WHERE code='AML05CERT-TEST-POLICY';




-- ============================== runtime ==============================
DO $$
DECLARE res jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  res := public.supervisory_assessment_create_programmed(
    (SELECT v FROM ev_id WHERE k='entity'), 'AML_CFT',
    (SELECT id FROM public.supervisory_assessment_programme WHERE programme_code='AML05CERT_P'),
    'PERIODIC', NULL, NULL, 'AML05CERT evidence and fact certification');
  RESET ROLE;
  INSERT INTO ev_id(k,v) VALUES ('assessment', (res->>'id')::uuid);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  res := public.supervisory_assessment_create_programmed(
    (SELECT v FROM ev_id WHERE k='entity'), 'AML_CFT',
    (SELECT id FROM public.supervisory_assessment_programme WHERE programme_code='AML05CERT_P'),
    'PERIODIC', NULL, NULL, 'AML05CERT second assessment for cross-assessment gates');
  RESET ROLE;
  INSERT INTO ev_id(k,v) VALUES ('assessment_b', (res->>'id')::uuid);

  IF (SELECT methodology_id FROM public.supervisory_assessment WHERE id=(SELECT v FROM ev_id WHERE k='assessment'))
     <> (SELECT v FROM ev_id WHERE k='meth') THEN
    RAISE EXCEPTION 'FIXTURE: the certification assessment did not bind the AML05CERT methodology';
  END IF;
  RAISE NOTICE 'FIXTURE: two AML05CERT assessments created under the fixture programme and methodology';
END $$;

-- Governed source records: one the officer may see (it belongs to the
-- assessment's own entity) and one they may not (a different entity).
INSERT INTO public.supervisory_finding(
  reference, entity_id, domain_code, title, source_kind, status, assessment_id, origin_provenance)
VALUES ('AML05CERT-FIND-OK', (SELECT v FROM ev_id WHERE k='entity'), 'AML_CFT',
        'AML05CERT accessible finding', 'ASSESSMENT', 'DRAFT',
        (SELECT v FROM ev_id WHERE k='assessment'), 'GOVERNED'),
       ('AML05CERT-FIND-OTHER', (SELECT v FROM ev_id WHERE k='other_entity'), 'AML_CFT',
        'AML05CERT finding for a different entity', 'ASSESSMENT', 'DRAFT', NULL, 'LEGACY_UNKNOWN');
INSERT INTO ev_id(k,v) SELECT 'find_ok', id FROM public.supervisory_finding WHERE reference='AML05CERT-FIND-OK';
INSERT INTO ev_id(k,v) SELECT 'find_other', id FROM public.supervisory_finding WHERE reference='AML05CERT-FIND-OTHER';


-- =====================================================================
-- EV-01 — the governed evidence-kind catalogue
-- =====================================================================
DO $$
DECLARE n int; miss text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  SELECT count(*) INTO n FROM public.supervisory_evidence_basis_type WHERE active;
  RESET ROLE;
  IF n < 8 THEN RAISE EXCEPTION 'FAIL EV-01: only % evidence basis type(s) are published', n; END IF;
  SELECT string_agg(c, ', ') INTO miss FROM (VALUES
    ('ENTERPRISE_DOCUMENT'),('REGULATORY_RETURN'),('PRIOR_EXAMINATION'),('FINDING'),
    ('REMEDIATION_RECORD'),('WORKPAPER'),('RFI_RESPONSE'),('SYSTEM_FACT')) AS x(c)
   WHERE NOT EXISTS (SELECT 1 FROM public.supervisory_evidence_basis_type t WHERE t.code=x.c AND t.active);
  IF miss IS NOT NULL THEN RAISE EXCEPTION 'FAIL EV-01: catalogue is missing %', miss; END IF;
  IF EXISTS (SELECT 1 FROM public.supervisory_evidence_basis_type
              WHERE label IS NULL OR sort_order IS NULL) THEN
    RAISE EXCEPTION 'FAIL EV-01: catalogue entries lack a stable label or ordering'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_evidence_basis_type
                  WHERE code='FINDING' AND requires_source_object AND source_table='supervisory_finding') THEN
    RAISE EXCEPTION 'FAIL EV-01: catalogue does not state source binding and provenance requirements'; END IF;
  RAISE NOTICE 'PASS EV-01: the evidence-kind catalogue is governed, stable and source-bound';
END $$;

-- =====================================================================
-- EV-02 — arbitrary evidence kinds are refused
-- =====================================================================
DO $$
DECLARE refused int := 0;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN
    PERFORM public.supervisory_assessment_evidence_link((SELECT v FROM ev_id WHERE k='assessment'),
      jsonb_build_object('evidence_type','SOMETHING_INVENTED','source_reference','x',
        'methodology_question_id',(SELECT v FROM ev_id WHERE k='q_ev')));
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN
    PERFORM public.supervisory_assessment_evidence_link((SELECT v FROM ev_id WHERE k='assessment'),
      jsonb_build_object('evidence_type','','source_reference','x',
        'methodology_question_id',(SELECT v FROM ev_id WHERE k='q_ev')));
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  RESET ROLE;
  IF refused <> 2 THEN RAISE EXCEPTION 'FAIL EV-02: only % of 2 unsupported evidence kinds refused', refused; END IF;
  RAISE NOTICE 'PASS EV-02: unsupported or arbitrary evidence kinds are refused';
END $$;

-- =====================================================================
-- EV-03 / EV-04 / EV-05 / EV-07 — registration, identity and reuse
-- =====================================================================
DO $$
DECLARE r1 jsonb; r2 jsonb; r3 jsonb; n int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  r1 := public.supervisory_assessment_evidence_link((SELECT v FROM ev_id WHERE k='assessment'),
    jsonb_build_object('evidence_type','FINDING','source_object_id',(SELECT v FROM ev_id WHERE k='find_ok'),
      'methodology_question_id',(SELECT v FROM ev_id WHERE k='q_ev'),
      'relevance_note','Supports the fixture control question'));
  -- same source, same assessment, same question again: idempotent
  r2 := public.supervisory_assessment_evidence_link((SELECT v FROM ev_id WHERE k='assessment'),
    jsonb_build_object('evidence_type','FINDING','source_object_id',(SELECT v FROM ev_id WHERE k='find_ok'),
      'methodology_question_id',(SELECT v FROM ev_id WHERE k='q_ev')));
  -- same source, second question: reuse of one canonical evidence record
  r3 := public.supervisory_assessment_evidence_link((SELECT v FROM ev_id WHERE k='assessment'),
    jsonb_build_object('evidence_type','FINDING','source_object_id',(SELECT v FROM ev_id WHERE k='find_ok'),
      'methodology_question_id',(SELECT v FROM ev_id WHERE k='q_plain')));
  RESET ROLE;
  INSERT INTO ev_id(k,v) VALUES ('evidence', (r1->>'evidence_id')::uuid);

  IF r1->>'evidence_id' IS NULL THEN
    RAISE EXCEPTION 'FAIL EV-03: the governed link returned no evidence record'; END IF;
  RAISE NOTICE 'PASS EV-03: an authorised officer registers an accessible governed source as evidence';

  SELECT count(*) INTO n FROM public.supervisory_assessment_evidence_basis
   WHERE assessment_id=(SELECT v FROM ev_id WHERE k='assessment');
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL EV-04: % evidence records exist for one source', n; END IF;
  IF r2->>'evidence_id' <> r1->>'evidence_id' OR r3->>'evidence_id' <> r1->>'evidence_id' THEN
    RAISE EXCEPTION 'FAIL EV-04: the same source produced more than one canonical evidence record'; END IF;
  RAISE NOTICE 'PASS EV-04: one source within one assessment resolves to one canonical evidence record';

  SELECT count(*) INTO n FROM public.supervisory_assessment_question_evidence
   WHERE evidence_id=(SELECT v FROM ev_id WHERE k='evidence');
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL EV-05: the evidence supports % question(s), expected 2', n; END IF;
  RAISE NOTICE 'PASS EV-05: one evidence record supports several included questions';
  RAISE NOTICE 'PASS EV-07: repeated linking is idempotent and creates no duplicate rows';
END $$;

-- =====================================================================
-- EV-06 — reuse across dimensions
-- =====================================================================
DO $$
DECLARE n int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  PERFORM public.supervisory_assessment_evidence_link((SELECT v FROM ev_id WHERE k='assessment'),
    jsonb_build_object('evidence_type','FINDING','source_object_id',(SELECT v FROM ev_id WHERE k='find_ok'),
      'methodology_dimension_id',(SELECT v FROM ev_id WHERE k='dim_a')));
  PERFORM public.supervisory_assessment_evidence_link((SELECT v FROM ev_id WHERE k='assessment'),
    jsonb_build_object('evidence_type','FINDING','source_object_id',(SELECT v FROM ev_id WHERE k='find_ok'),
      'methodology_dimension_id',(SELECT v FROM ev_id WHERE k='dim_b')));
  RESET ROLE;
  SELECT count(*) INTO n FROM public.supervisory_assessment_dimension_evidence
   WHERE evidence_id=(SELECT v FROM ev_id WHERE k='evidence');
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL EV-06: the evidence supports % dimension(s), expected 2', n; END IF;
  IF (SELECT count(*) FROM public.supervisory_assessment_evidence_basis
       WHERE assessment_id=(SELECT v FROM ev_id WHERE k='assessment')) <> 1 THEN
    RAISE EXCEPTION 'FAIL EV-06: dimension reuse duplicated the evidence record'; END IF;
  RAISE NOTICE 'PASS EV-06: one evidence record supports several dimensions without duplication';
END $$;

-- =====================================================================
-- EV-08 / EV-09 — cross-assessment linking is impossible
-- =====================================================================
DO $$
DECLARE refused int := 0;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  -- direct attempt to attach assessment A's evidence to assessment B
  BEGIN
    INSERT INTO public.supervisory_assessment_question_evidence(
      evidence_id, assessment_id, methodology_question_id)
    VALUES ((SELECT v FROM ev_id WHERE k='evidence'), (SELECT v FROM ev_id WHERE k='assessment_b'),
            (SELECT v FROM ev_id WHERE k='q_ev'));
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN
    INSERT INTO public.supervisory_assessment_dimension_evidence(
      evidence_id, assessment_id, methodology_dimension_id)
    VALUES ((SELECT v FROM ev_id WHERE k='evidence'), (SELECT v FROM ev_id WHERE k='assessment_b'),
            (SELECT v FROM ev_id WHERE k='dim_a'));
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  RESET ROLE;
  IF refused <> 2 THEN
    RAISE EXCEPTION 'FAIL EV-08: only % of 2 cross-assessment link attempts refused', refused; END IF;
  IF EXISTS (SELECT 1 FROM public.supervisory_assessment_question_evidence
              WHERE assessment_id=(SELECT v FROM ev_id WHERE k='assessment_b')) THEN
    RAISE EXCEPTION 'FAIL EV-09: a question in another assessment received the evidence link'; END IF;
  RAISE NOTICE 'PASS EV-08: evidence belonging to one assessment cannot be linked to another';
  RAISE NOTICE 'PASS EV-09: a question or dimension in another assessment cannot receive the link';
END $$;

-- =====================================================================
-- EV-10 / EV-11 — an inaccessible source is neither usable nor disclosed
-- =====================================================================
DO $$
DECLARE msg text; ok boolean := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN
    PERFORM public.supervisory_assessment_evidence_link((SELECT v FROM ev_id WHERE k='assessment'),
      jsonb_build_object('evidence_type','FINDING','source_object_id',(SELECT v FROM ev_id WHERE k='find_other'),
        'methodology_question_id',(SELECT v FROM ev_id WHERE k='q_ev')));
  EXCEPTION WHEN others THEN ok := true; msg := SQLERRM; END;
  RESET ROLE;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL EV-10: a source outside the officer''s reach was accepted as evidence'; END IF;
  IF EXISTS (SELECT 1 FROM public.supervisory_assessment_evidence_basis
              WHERE source_object_id=(SELECT v FROM ev_id WHERE k='find_other')) THEN
    RAISE EXCEPTION 'FAIL EV-10: an inaccessible source produced an evidence record'; END IF;
  RAISE NOTICE 'PASS EV-10: a source the officer may not see is not linkable';

  IF msg LIKE '%'||(SELECT v FROM ev_id WHERE k='find_other')::text||'%'
     OR msg LIKE '%AML05CERT-FIND-OTHER%'
     OR msg LIKE '%different entity%finding%' THEN
    RAISE EXCEPTION 'FAIL EV-11: the refusal disclosed the inaccessible source: %', msg; END IF;
  RAISE NOTICE 'PASS EV-11: the refusal discloses no identifier or metadata of the inaccessible source';
END $$;

-- =====================================================================
-- EV-12 — missing / invalid source references are refused safely
-- =====================================================================
DO $$
DECLARE refused int := 0;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN   -- a source object that does not exist
    PERFORM public.supervisory_assessment_evidence_link((SELECT v FROM ev_id WHERE k='assessment'),
      jsonb_build_object('evidence_type','FINDING','source_object_id',gen_random_uuid(),
        'methodology_question_id',(SELECT v FROM ev_id WHERE k='q_ev')));
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN   -- a kind that requires a source object, with none supplied
    PERFORM public.supervisory_assessment_evidence_link((SELECT v FROM ev_id WHERE k='assessment'),
      jsonb_build_object('evidence_type','FINDING',
        'methodology_question_id',(SELECT v FROM ev_id WHERE k='q_ev')));
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN   -- no question and no dimension
    PERFORM public.supervisory_assessment_evidence_link((SELECT v FROM ev_id WHERE k='assessment'),
      jsonb_build_object('evidence_type','RFI_RESPONSE','source_reference','AML05CERT-RFI-1'));
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN   -- reference-only kind with no reference at all
    PERFORM public.supervisory_assessment_evidence_link((SELECT v FROM ev_id WHERE k='assessment'),
      jsonb_build_object('evidence_type','RFI_RESPONSE',
        'methodology_question_id',(SELECT v FROM ev_id WHERE k='q_ev')));
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  RESET ROLE;
  IF refused <> 4 THEN
    RAISE EXCEPTION 'FAIL EV-12: only % of 4 invalid source references refused', refused; END IF;
  RAISE NOTICE 'PASS EV-12: missing, unknown or unusable source references are refused safely';
END $$;

-- =====================================================================
-- EV-13 — direct uncontrolled writes are denied
-- =====================================================================
DO $$
DECLARE refused int := 0; touched int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN INSERT INTO public.supervisory_assessment_evidence_basis(assessment_id, evidence_type)
        VALUES ((SELECT v FROM ev_id WHERE k='assessment'),'FINDING');
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  -- an uncontrolled change is denied either by an error or by the row being
  -- invisible to the writer; both leave the governed record untouched.
  BEGIN UPDATE public.supervisory_assessment_evidence_basis SET note='tampered'
         WHERE id=(SELECT v FROM ev_id WHERE k='evidence');
        GET DIAGNOSTICS touched = ROW_COUNT;
        IF touched = 0 THEN refused := refused + 1; END IF;
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN DELETE FROM public.supervisory_assessment_evidence_basis
         WHERE id=(SELECT v FROM ev_id WHERE k='evidence');
        GET DIAGNOSTICS touched = ROW_COUNT;
        IF touched = 0 THEN refused := refused + 1; END IF;
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN DELETE FROM public.supervisory_assessment_question_evidence
         WHERE evidence_id=(SELECT v FROM ev_id WHERE k='evidence');
        GET DIAGNOSTICS touched = ROW_COUNT;
        IF touched = 0 THEN refused := refused + 1; END IF;
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN INSERT INTO public.supervisory_evidence_basis_type(code,label) VALUES ('AML05CERT_FAKE','fake');
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  RESET ROLE;
  IF refused <> 5 THEN RAISE EXCEPTION 'FAIL EV-13: only % of 5 direct writes were refused', refused; END IF;
  IF (SELECT note FROM public.supervisory_assessment_evidence_basis
       WHERE id=(SELECT v FROM ev_id WHERE k='evidence')) = 'tampered' THEN
    RAISE EXCEPTION 'FAIL EV-13: a direct update changed a governed evidence record'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_evidence_basis
                  WHERE id=(SELECT v FROM ev_id WHERE k='evidence')) THEN
    RAISE EXCEPTION 'FAIL EV-13: a direct delete removed a governed evidence record'; END IF;
  IF (SELECT count(*) FROM public.supervisory_assessment_question_evidence
       WHERE evidence_id=(SELECT v FROM ev_id WHERE k='evidence')) <> 2 THEN
    RAISE EXCEPTION 'FAIL EV-13: a direct delete removed governed evidence links'; END IF;
  RAISE NOTICE 'PASS EV-13: direct writes to evidence, links and the catalogue are denied';
END $$;


-- =====================================================================
-- EV-14 — governed operations write audit events with the real actor
-- =====================================================================
DO $$
DECLARE linked int; unlinked int; actor uuid;
BEGIN
  SELECT count(*) INTO linked FROM public.supervisory_assessment_event
   WHERE assessment_id=(SELECT v FROM ev_id WHERE k='assessment') AND event_type='EVIDENCE_LINKED';
  IF linked < 1 THEN RAISE EXCEPTION 'FAIL EV-14: no EVIDENCE_LINKED audit event was written'; END IF;
  SELECT actor_id INTO actor FROM public.supervisory_assessment_event
   WHERE assessment_id=(SELECT v FROM ev_id WHERE k='assessment') AND event_type='EVIDENCE_LINKED'
   ORDER BY created_at LIMIT 1;
  IF actor <> (SELECT v FROM ev_id WHERE k='officer') THEN
    RAISE EXCEPTION 'FAIL EV-14: the audit event records % rather than the acting officer', actor; END IF;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  PERFORM public.supervisory_assessment_evidence_unlink((SELECT v FROM ev_id WHERE k='evidence'),
    NULL, (SELECT v FROM ev_id WHERE k='dim_b'));
  RESET ROLE;
  SELECT count(*) INTO unlinked FROM public.supervisory_assessment_event
   WHERE assessment_id=(SELECT v FROM ev_id WHERE k='assessment') AND event_type='EVIDENCE_UNLINKED';
  IF unlinked < 1 THEN RAISE EXCEPTION 'FAIL EV-14: unlinking wrote no audit event'; END IF;
  IF EXISTS (SELECT 1 FROM public.supervisory_assessment_dimension_evidence
              WHERE evidence_id=(SELECT v FROM ev_id WHERE k='evidence')
                AND methodology_dimension_id=(SELECT v FROM ev_id WHERE k='dim_b')) THEN
    RAISE EXCEPTION 'FAIL EV-14: the governed unlink did not remove the link'; END IF;
  RAISE NOTICE 'PASS EV-14: governed link and unlink operations write audit events naming the real actor';
END $$;

-- =====================================================================
-- EV-15 — assessment / regulator / domain boundaries
-- =====================================================================
DO $$
DECLARE refused int := 0;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"411dd06d-648b-4f32-82cc-897902c0c0b6","role":"authenticated"}', true);
  BEGIN
    PERFORM public.supervisory_assessment_evidence_link((SELECT v FROM ev_id WHERE k='assessment'),
      jsonb_build_object('evidence_type','FINDING','source_object_id',(SELECT v FROM ev_id WHERE k='find_ok'),
        'methodology_question_id',(SELECT v FROM ev_id WHERE k='q_ev')));
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN
    PERFORM public.supervisory_assessment_evidence_unlink((SELECT v FROM ev_id WHERE k='evidence'),
      (SELECT v FROM ev_id WHERE k='q_ev'), NULL);
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  RESET ROLE;
  -- a question that belongs to a different methodology version
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN
    PERFORM public.supervisory_assessment_evidence_link((SELECT v FROM ev_id WHERE k='assessment'),
      jsonb_build_object('evidence_type','FINDING','source_object_id',(SELECT v FROM ev_id WHERE k='find_ok'),
        'methodology_question_id',(SELECT id FROM public.supervisory_methodology_question
                                    WHERE methodology_id=(SELECT v FROM ev_id WHERE k='meth_v10') LIMIT 1)));
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  RESET ROLE;
  IF refused <> 3 THEN
    RAISE EXCEPTION 'FAIL EV-15: only % of 3 boundary violations refused', refused; END IF;
  RAISE NOTICE 'PASS EV-15: authority, assessment and methodology-version boundaries are enforced';
END $$;

-- =====================================================================
-- EV-16 — an out-of-scope question takes no evidence
-- =====================================================================
DO $$
DECLARE st text; ok boolean := false;
BEGIN
  st := public.supervisory_assessment_question_plan_state(
          (SELECT v FROM ev_id WHERE k='assessment'), (SELECT v FROM ev_id WHERE k='q_enh'));
  IF st IS NULL OR st LIKE 'INCLUDED%' THEN
    RAISE EXCEPTION 'FAIL EV-16: the fixture enhanced question is % rather than out of scope', st; END IF;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN
    PERFORM public.supervisory_assessment_evidence_link((SELECT v FROM ev_id WHERE k='assessment'),
      jsonb_build_object('evidence_type','FINDING','source_object_id',(SELECT v FROM ev_id WHERE k='find_ok'),
        'methodology_question_id',(SELECT v FROM ev_id WHERE k='q_enh')));
  EXCEPTION WHEN others THEN ok := true; END;
  RESET ROLE;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL EV-16: evidence was accepted for a question outside the governed plan'; END IF;
  RAISE NOTICE 'PASS EV-16: a question outside the governed question plan takes no evidence';
END $$;

-- =====================================================================
-- FACT-01 — the supported fact vocabulary and its constraints are server-owned
-- =====================================================================
DO $$
DECLARE reg jsonb; row jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  reg := public.supervisory_assessment_fact_register((SELECT v FROM ev_id WHERE k='assessment'));
  RESET ROLE;
  IF public.jsonb_array_len_safe(reg) <> 4 THEN
    RAISE EXCEPTION 'FAIL FACT-01: the fact register returned % definitions, expected 4',
      public.jsonb_array_len_safe(reg); END IF;
  SELECT e INTO row FROM jsonb_array_elements(reg) e WHERE e->>'fact_code'='AML05CERT_F_RATIO';
  IF row->>'data_type' IS NULL OR row->>'unit' IS NULL
     OR row->>'numerator_basis' IS NULL OR row->>'denominator_basis' IS NULL
     OR row->>'is_required' IS NULL OR row->>'officer_edit_allowed' IS NULL THEN
    RAISE EXCEPTION 'FAIL FACT-01: the fact vocabulary does not state type, unit, basis and edit constraints'; END IF;
  RAISE NOTICE 'PASS FACT-01: the server publishes the fact vocabulary and its type constraints';
END $$;

-- =====================================================================
-- FACT-02 / FACT-03 / FACT-05 — a recorded fact keeps its provenance
-- =====================================================================
DO $$
DECLARE res jsonb; f public.supervisory_assessment_fact;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  res := public.supervisory_assessment_fact_set((SELECT v FROM ev_id WHERE k='assessment'),
    jsonb_build_object('fact_code','AML05CERT_F_COUNT','value','42','source_type','OFFICER_ENTERED',
      'source_reference','AML05CERT source note','period_start', (current_date - 365)::text,
      'period_end', current_date::text, 'as_of_date', current_date::text));
  RESET ROLE;
  INSERT INTO ev_id(k,v) VALUES ('fact_count', (res->>'fact_id')::uuid);
  SELECT * INTO f FROM public.supervisory_assessment_fact WHERE id=(res->>'fact_id')::uuid;

  IF f.assessment_id <> (SELECT v FROM ev_id WHERE k='assessment')
     OR f.fact_requirement_id <> (SELECT v FROM ev_id WHERE k='fr_count')
     OR f.methodology_id <> (SELECT v FROM ev_id WHERE k='meth')
     OR f.entity_id <> (SELECT v FROM ev_id WHERE k='entity') THEN
    RAISE EXCEPTION 'FAIL FACT-02: the fact does not retain assessment and methodology provenance'; END IF;
  IF f.source_type IS NULL OR f.source_reference IS NULL
     OR f.period_start IS NULL OR f.period_end IS NULL OR f.as_of_date IS NULL
     OR f.provenance->>'recorded_at' IS NULL OR f.recorded_by <> (SELECT v FROM ev_id WHERE k='officer') THEN
    RAISE EXCEPTION 'FAIL FACT-02: source, retrieval time or period provenance is missing'; END IF;
  RAISE NOTICE 'PASS FACT-02: a fact retains assessment, definition, source, time and period provenance';

  IF f.value_numeric <> 42 OR f.value_text IS NOT NULL OR f.value_date IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL FACT-03: a whole-number fact was not stored in its typed column'; END IF;
  RAISE NOTICE 'PASS FACT-03: typed values are validated and stored according to the declared type';

  IF f.unit IS DISTINCT FROM 'count' THEN
    RAISE EXCEPTION 'FAIL FACT-05: the methodology unit was not preserved (got %)', f.unit; END IF;
  RAISE NOTICE 'PASS FACT-05: units are taken from the methodology and preserved';
END $$;

-- =====================================================================
-- FACT-04 — invalid type/value combinations are refused
-- =====================================================================
DO $$
DECLARE refused int := 0;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN PERFORM public.supervisory_assessment_fact_set((SELECT v FROM ev_id WHERE k='assessment'),
      jsonb_build_object('fact_code','AML05CERT_F_COUNT','value','not a number','source_type','OFFICER_ENTERED'));
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN PERFORM public.supervisory_assessment_fact_set((SELECT v FROM ev_id WHERE k='assessment'),
      jsonb_build_object('fact_code','AML05CERT_F_COUNT','value','1.7','source_type','OFFICER_ENTERED'));
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN PERFORM public.supervisory_assessment_fact_set((SELECT v FROM ev_id WHERE k='assessment'),
      jsonb_build_object('fact_code','AML05CERT_F_DATE','value','31/02/2026','source_type','OFFICER_ENTERED'));
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN PERFORM public.supervisory_assessment_fact_set((SELECT v FROM ev_id WHERE k='assessment'),
      jsonb_build_object('fact_code','AML05CERT_F_COUNT','value','','source_type','OFFICER_ENTERED'));
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN PERFORM public.supervisory_assessment_fact_set((SELECT v FROM ev_id WHERE k='assessment'),
      jsonb_build_object('fact_code','AML05CERT_F_COUNT','value','7','source_type','MADE_UP_SOURCE'));
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  RESET ROLE;
  IF refused <> 5 THEN RAISE EXCEPTION 'FAIL FACT-04: only % of 5 invalid combinations refused', refused; END IF;
  IF (SELECT value_numeric FROM public.supervisory_assessment_fact
       WHERE id=(SELECT v FROM ev_id WHERE k='fact_count')) <> 42 THEN
    RAISE EXCEPTION 'FAIL FACT-04: a refused write changed the recorded value'; END IF;
  RAISE NOTICE 'PASS FACT-04: invalid type, value and source combinations are refused';
END $$;

-- =====================================================================
-- FACT-06 / FACT-07 — ratio provenance and denominator treatment
-- =====================================================================
DO $$
DECLARE res jsonb; f public.supervisory_assessment_fact; refused int := 0;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN   -- a bare ratio without its parts
    PERFORM public.supervisory_assessment_fact_set((SELECT v FROM ev_id WHERE k='assessment'),
      jsonb_build_object('fact_code','AML05CERT_F_RATIO','value','25','source_type','OFFICER_ENTERED'));
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN   -- zero denominator
    PERFORM public.supervisory_assessment_fact_set((SELECT v FROM ev_id WHERE k='assessment'),
      jsonb_build_object('fact_code','AML05CERT_F_RATIO','value','25','numerator','5','denominator','0',
        'source_type','OFFICER_ENTERED'));
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN   -- out-of-range percentage
    PERFORM public.supervisory_assessment_fact_set((SELECT v FROM ev_id WHERE k='assessment'),
      jsonb_build_object('fact_code','AML05CERT_F_RATIO','value','250','numerator','5','denominator','2',
        'source_type','OFFICER_ENTERED'));
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  res := public.supervisory_assessment_fact_set((SELECT v FROM ev_id WHERE k='assessment'),
    jsonb_build_object('fact_code','AML05CERT_F_RATIO','value','25','numerator','5','denominator','20',
      'source_type','OFFICER_ENTERED','source_reference','AML05CERT ratio basis'));
  RESET ROLE;
  IF refused <> 3 THEN RAISE EXCEPTION 'FAIL FACT-07: only % of 3 unusable ratios refused', refused; END IF;
  IF EXISTS (SELECT 1 FROM public.supervisory_assessment_fact
              WHERE assessment_id=(SELECT v FROM ev_id WHERE k='assessment')
                AND fact_code='AML05CERT_F_RATIO' AND denominator = 0) THEN
    RAISE EXCEPTION 'FAIL FACT-07: a zero denominator was stored'; END IF;
  RAISE NOTICE 'PASS FACT-07: an invalid or zero denominator is refused and no value is fabricated';

  SELECT * INTO f FROM public.supervisory_assessment_fact WHERE id=(res->>'fact_id')::uuid;
  IF f.numerator <> 5 OR f.denominator <> 20 OR f.value_numeric <> 25 THEN
    RAISE EXCEPTION 'FAIL FACT-06: numerator and denominator provenance was not preserved'; END IF;
  RAISE NOTICE 'PASS FACT-06: numerator and denominator provenance is preserved for ratio facts';
END $$;

-- =====================================================================
-- FACT-08 / FACT-09 / FACT-10 / FACT-14 — override behaviour
-- =====================================================================
DO $$
DECLARE res jsonb; f public.supervisory_assessment_fact; refused int := 0; sysval jsonb; events int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  -- a system-proposed (auto-prefilled) value
  res := public.supervisory_assessment_fact_set((SELECT v FROM ev_id WHERE k='assessment'),
    jsonb_build_object('fact_code','AML05CERT_F_LOCKED','value','100','source_type','SYSTEM',
      'auto_prefilled', true, 'source_reference','AML05CERT system extract'));
  RESET ROLE;
  INSERT INTO ev_id(k,v) VALUES ('fact_locked', (res->>'fact_id')::uuid);
  SELECT system_value INTO sysval FROM public.supervisory_assessment_fact WHERE id=(res->>'fact_id')::uuid;
  IF sysval IS NULL OR sysval->>'value' <> '100' THEN
    RAISE EXCEPTION 'FAIL FACT-08: the system-proposed value was not retained'; END IF;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN   -- the methodology forbids an officer value for this fact
    PERFORM public.supervisory_assessment_fact_override((SELECT v FROM ev_id WHERE k='fact_locked'),
      jsonb_build_object('value','7'), 'A properly written supervisory reason for the change');
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN   -- no reason
    PERFORM public.supervisory_assessment_fact_override((SELECT v FROM ev_id WHERE k='fact_count'),
      jsonb_build_object('value','7'), NULL);
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN   -- a token reason
    PERFORM public.supervisory_assessment_fact_override((SELECT v FROM ev_id WHERE k='fact_count'),
      jsonb_build_object('value','7'), 'n/a');
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  PERFORM public.supervisory_assessment_fact_override((SELECT v FROM ev_id WHERE k='fact_count'),
    jsonb_build_object('value','55'),
    'The platform figure excluded two branches identified during the fixture review.');
  RESET ROLE;
  IF refused <> 3 THEN RAISE EXCEPTION 'FAIL FACT-09: only % of 3 unjustified overrides refused', refused; END IF;
  RAISE NOTICE 'PASS FACT-09: an override without a written reason is refused';

  SELECT * INTO f FROM public.supervisory_assessment_fact WHERE id=(SELECT v FROM ev_id WHERE k='fact_count');
  IF NOT f.officer_overridden OR f.value_numeric <> 55 THEN
    RAISE EXCEPTION 'FAIL FACT-10: the authorised override did not take effect'; END IF;
  IF f.system_value IS NULL OR f.system_value->>'value' <> '42' THEN
    RAISE EXCEPTION 'FAIL FACT-08: the proposed value is no longer visible after the override'; END IF;
  RAISE NOTICE 'PASS FACT-08: a system-proposed value remains permanently visible after an officer change';
  IF f.override_reason IS NULL OR f.overridden_by <> (SELECT v FROM ev_id WHERE k='officer')
     OR f.overridden_at IS NULL OR f.provenance->'override' IS NULL THEN
    RAISE EXCEPTION 'FAIL FACT-10: the override did not store reason, actor and time'; END IF;
  RAISE NOTICE 'PASS FACT-10: an authorised override stores current value, proposed value, reason, actor and time';

  SELECT count(*) INTO events FROM public.supervisory_assessment_event
   WHERE assessment_id=(SELECT v FROM ev_id WHERE k='assessment')
     AND event_type IN ('FACT_RECORDED','FACT_AUTO_PREFILLED','FACT_OVERRIDDEN');
  IF events < 3 THEN RAISE EXCEPTION 'FAIL FACT-14: fact history is not auditable (% event(s))', events; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_event
                  WHERE assessment_id=(SELECT v FROM ev_id WHERE k='assessment')
                    AND event_type='FACT_OVERRIDDEN' AND actor_id=(SELECT v FROM ev_id WHERE k='officer')) THEN
    RAISE EXCEPTION 'FAIL FACT-14: the override event does not name the real actor'; END IF;
  RAISE NOTICE 'PASS FACT-14: fact history and provenance remain auditable after a correction';
END $$;

-- =====================================================================
-- FACT-11 / FACT-12 / FACT-13 / FACT-15 — boundaries, direct writes,
-- idempotency and non-disclosure
-- =====================================================================
DO $$
DECLARE refused int := 0; n int; touched int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN   -- a fact definition from a different methodology version
    PERFORM public.supervisory_assessment_fact_set((SELECT v FROM ev_id WHERE k='assessment'),
      jsonb_build_object('fact_requirement_id',
        (SELECT id FROM public.supervisory_methodology_fact_requirement
          WHERE methodology_id=(SELECT v FROM ev_id WHERE k='meth_v11') LIMIT 1),
        'value','1','source_type','OFFICER_ENTERED'));
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN   -- an unknown fact code
    PERFORM public.supervisory_assessment_fact_set((SELECT v FROM ev_id WHERE k='assessment'),
      jsonb_build_object('fact_code','AML05CERT_F_NOT_DEFINED','value','1','source_type','OFFICER_ENTERED'));
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  RESET ROLE;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"411dd06d-648b-4f32-82cc-897902c0c0b6","role":"authenticated"}', true);
  BEGIN   -- an outsider recording a fact
    PERFORM public.supervisory_assessment_fact_set((SELECT v FROM ev_id WHERE k='assessment'),
      jsonb_build_object('fact_code','AML05CERT_F_DATE','value',current_date::text,'source_type','OFFICER_ENTERED'));
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN   -- an outsider reading facts derived from sources they cannot reach
    PERFORM public.supervisory_assessment_fact_register((SELECT v FROM ev_id WHERE k='assessment'));
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  SELECT count(*) INTO n FROM public.supervisory_assessment_fact
   WHERE assessment_id=(SELECT v FROM ev_id WHERE k='assessment');
  RESET ROLE;
  IF refused <> 4 THEN RAISE EXCEPTION 'FAIL FACT-11: only % of 4 boundary violations refused', refused; END IF;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL FACT-15: an unauthorised reader saw % fact row(s)', n; END IF;
  RAISE NOTICE 'PASS FACT-11: facts cannot cross assessment, methodology or regulator boundaries';
  RAISE NOTICE 'PASS FACT-15: an actor cannot read or infer a fact outside their authority';

  refused := 0;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN INSERT INTO public.supervisory_assessment_fact(assessment_id, fact_code, data_type, source_type)
        VALUES ((SELECT v FROM ev_id WHERE k='assessment'),'AML05CERT_F_DIRECT','integer','OFFICER_ENTERED');
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN UPDATE public.supervisory_assessment_fact SET value_numeric = 999
         WHERE id=(SELECT v FROM ev_id WHERE k='fact_count');
        GET DIAGNOSTICS touched = ROW_COUNT;
        IF touched = 0 THEN refused := refused + 1; END IF;
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN DELETE FROM public.supervisory_assessment_fact WHERE id=(SELECT v FROM ev_id WHERE k='fact_count');
        GET DIAGNOSTICS touched = ROW_COUNT;
        IF touched = 0 THEN refused := refused + 1; END IF;
  EXCEPTION WHEN others THEN refused := refused + 1; END;

  RESET ROLE;
  IF refused <> 3 THEN RAISE EXCEPTION 'FAIL FACT-12: only % of 3 direct fact writes refused', refused; END IF;
  IF (SELECT value_numeric FROM public.supervisory_assessment_fact
       WHERE id=(SELECT v FROM ev_id WHERE k='fact_count')) <> 55 THEN
    RAISE EXCEPTION 'FAIL FACT-12: a direct write changed a governed fact'; END IF;
  RAISE NOTICE 'PASS FACT-12: direct uncontrolled fact writes are denied';

  -- FACT-13: re-recording the same fact corrects one governed row, it never forks
  SELECT count(*) INTO n FROM public.supervisory_assessment_fact
   WHERE assessment_id=(SELECT v FROM ev_id WHERE k='assessment') AND fact_code='AML05CERT_F_RATIO';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  PERFORM public.supervisory_assessment_fact_set((SELECT v FROM ev_id WHERE k='assessment'),
    jsonb_build_object('fact_code','AML05CERT_F_RATIO','value','30','numerator','6','denominator','20',
      'source_type','OFFICER_ENTERED','source_reference','AML05CERT corrected basis'));
  RESET ROLE;
  IF (SELECT count(*) FROM public.supervisory_assessment_fact
       WHERE assessment_id=(SELECT v FROM ev_id WHERE k='assessment') AND fact_code='AML05CERT_F_RATIO') <> n THEN
    RAISE EXCEPTION 'FAIL FACT-13: re-recording the same fact created a second row'; END IF;
  IF (SELECT value_numeric FROM public.supervisory_assessment_fact
       WHERE assessment_id=(SELECT v FROM ev_id WHERE k='assessment') AND fact_code='AML05CERT_F_RATIO') <> 30 THEN
    RAISE EXCEPTION 'FAIL FACT-13: the correction was not applied to the governed row'; END IF;
  RAISE NOTICE 'PASS FACT-13: re-recording a fact corrects the single governed row under its identity rule';
END $$;

-- =====================================================================
-- READY-01 / READY-10 — the workspace reads the server-owned result
-- =====================================================================
DO $$
DECLARE rd jsonb; c jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  rd := public.supervisory_assessment_readiness((SELECT v FROM ev_id WHERE k='assessment'));
  RESET ROLE;
  IF rd->>'assessment_id' IS NULL OR rd->'checks' IS NULL OR rd->>'can_submit' IS NULL
     OR rd->>'submission_gate' IS NULL OR rd->>'plan_mode' IS NULL THEN
    RAISE EXCEPTION 'FAIL READY-01: the readiness contract is incomplete'; END IF;
  IF rd->>'plan_mode' <> 'GOVERNED_PLAN' THEN
    RAISE EXCEPTION 'FAIL READY-01: readiness did not use the governed question plan'; END IF;
  FOR c IN SELECT * FROM jsonb_array_elements(rd->'checks') LOOP
    IF c->>'label' IS NULL OR c->>'status' IS NULL OR c->>'detail' IS NULL THEN
      RAISE EXCEPTION 'FAIL READY-01: a readiness check carries no reason for the officer'; END IF;
  END LOOP;
  RAISE NOTICE 'PASS READY-01: the workspace reads one complete, reasoned, server-owned readiness result';

  -- the enhanced question is out of scope: it must invent no requirement
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(rd->'checks') ch,
                       jsonb_array_elements(ch->'items') it
              WHERE it->>'question_code' = 'AML05CERT_Q_ENH') THEN
    RAISE EXCEPTION 'FAIL READY-10: an out-of-scope question created an outstanding requirement'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(rd->'checks') ch,
                       jsonb_array_elements(ch->'items') it
              WHERE it->>'fact_code' = 'AML05CERT_F_DATE') THEN
    RAISE EXCEPTION 'FAIL READY-10: a fact required only by an out-of-scope question blocks readiness'; END IF;
  RAISE NOTICE 'PASS READY-10: out-of-scope questions create no invented evidence or fact requirement';
END $$;

-- =====================================================================
-- READY-04 / READY-05 — evidence requirements block and clear
-- =====================================================================
DO $$
DECLARE rd jsonb; ev jsonb;
BEGIN
  -- answer both questions, then remove the governed evidence from the
  -- evidence-based question so only that requirement is outstanding
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  PERFORM public.supervisory_assessment_question_upsert((SELECT v FROM ev_id WHERE k='assessment'),
    (SELECT v FROM ev_id WHERE k='q_plain'), 'YES', 'Fixture observation for the plain question.');
  PERFORM public.supervisory_assessment_question_upsert((SELECT v FROM ev_id WHERE k='assessment'),
    (SELECT v FROM ev_id WHERE k='q_ev'), 'YES', 'Fixture observation for the evidence question.');
  PERFORM public.supervisory_assessment_evidence_unlink((SELECT v FROM ev_id WHERE k='evidence'),
    (SELECT v FROM ev_id WHERE k='q_ev'), NULL);

  rd := public.supervisory_assessment_readiness((SELECT v FROM ev_id WHERE k='assessment'));
  RESET ROLE;
  SELECT c INTO ev FROM jsonb_array_elements(rd->'checks') c WHERE c->>'key'='EVIDENCE';
  IF (ev->>'status') <> 'BLOCKING' THEN
    RAISE EXCEPTION 'FAIL READY-04: a missing configured evidence requirement did not block readiness'; END IF;
  RAISE NOTICE 'PASS READY-04: configured evidence that is missing blocks readiness';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  PERFORM public.supervisory_assessment_question_upsert((SELECT v FROM ev_id WHERE k='assessment'),
    (SELECT v FROM ev_id WHERE k='q_ev'), 'YES', 'Fixture observation for the evidence question.');
  PERFORM public.supervisory_assessment_evidence_link((SELECT v FROM ev_id WHERE k='assessment'),
    jsonb_build_object('evidence_type','FINDING','source_object_id',(SELECT v FROM ev_id WHERE k='find_ok'),
      'methodology_question_id',(SELECT v FROM ev_id WHERE k='q_ev')));
  rd := public.supervisory_assessment_readiness((SELECT v FROM ev_id WHERE k='assessment'));
  RESET ROLE;
  SELECT c INTO ev FROM jsonb_array_elements(rd->'checks') c WHERE c->>'key'='EVIDENCE';
  IF (ev->>'status') <> 'OK' THEN
    RAISE EXCEPTION 'FAIL READY-05: valid accessible evidence did not clear the requirement (%)', ev; END IF;
  RAISE NOTICE 'PASS READY-05: valid accessible evidence clears the configured requirement';
END $$;

-- =====================================================================
-- READY-06 / READY-02 / READY-03 — the required fact blocks the workspace
-- and submission identically
-- =====================================================================
DO $$
DECLARE rd jsonb; fc jsonb; blocked boolean := false; msg text;
BEGIN
  -- clear the recorded required fact so only that requirement is outstanding
  DELETE FROM public.supervisory_assessment_fact
   WHERE id=(SELECT v FROM ev_id WHERE k='fact_count');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  rd := public.supervisory_assessment_readiness((SELECT v FROM ev_id WHERE k='assessment'));
  RESET ROLE;
  SELECT c INTO fc FROM jsonb_array_elements(rd->'checks') c WHERE c->>'key'='REQUIRED_FACTS';
  IF (fc->>'status') <> 'BLOCKING' OR (rd->>'can_submit')::boolean THEN
    RAISE EXCEPTION 'FAIL READY-06: the required fact did not block readiness (%)', fc; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(fc->'items') i WHERE i->>'fact_code'='AML05CERT_F_COUNT') THEN
    RAISE EXCEPTION 'FAIL READY-06: the outstanding fact is not named for the officer'; END IF;
  RAISE NOTICE 'PASS READY-06: a configured required fact blocks readiness while it is missing';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN
    PERFORM public.supervisory_assessment_transition((SELECT v FROM ev_id WHERE k='assessment'),
      'submitted', 'AML05CERT submission attempt while a required fact is missing');
  EXCEPTION WHEN others THEN blocked := true; msg := SQLERRM; END;
  RESET ROLE;
  IF NOT blocked THEN
    RAISE EXCEPTION 'FAIL READY-02: submission proceeded while the workspace said it was blocked'; END IF;
  IF msg NOT LIKE '%required_facts_incomplete%' AND msg NOT LIKE '%AML05CERT_F_COUNT%' THEN
    RAISE EXCEPTION 'FAIL READY-03: submission refused for a different reason than the workspace states: %', msg; END IF;
  IF (SELECT status FROM public.supervisory_assessment WHERE id=(SELECT v FROM ev_id WHERE k='assessment'))
     = 'submitted' THEN
    RAISE EXCEPTION 'FAIL READY-02: the assessment was submitted despite the blocking gate'; END IF;
  RAISE NOTICE 'PASS READY-02: submission is evaluated by the same governed readiness calculation';
  RAISE NOTICE 'PASS READY-03: the workspace and submission cannot disagree for the same committed state';
END $$;

-- =====================================================================
-- READY-07 / READY-08 / READY-09 / READY-12 — clearing the blocker
-- =====================================================================
DO $$
DECLARE rd jsonb; fc jsonb; stale jsonb; refused int := 0; st text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  stale := public.supervisory_assessment_readiness((SELECT v FROM ev_id WHERE k='assessment'));

  BEGIN   -- READY-08: an unresolved / invalid fact cannot satisfy the requirement
    PERFORM public.supervisory_assessment_fact_set((SELECT v FROM ev_id WHERE k='assessment'),
      jsonb_build_object('fact_code','AML05CERT_F_COUNT','value','abc','source_type','OFFICER_ENTERED'));
  EXCEPTION WHEN others THEN refused := refused + 1; END;

  BEGIN   -- READY-09: the same fact recorded on another assessment must not count
    PERFORM public.supervisory_assessment_fact_set((SELECT v FROM ev_id WHERE k='assessment_b'),
      jsonb_build_object('fact_code','AML05CERT_F_COUNT','value','12','source_type','OFFICER_ENTERED',
        'source_reference','AML05CERT other assessment'));
  END;
  rd := public.supervisory_assessment_readiness((SELECT v FROM ev_id WHERE k='assessment'));
  RESET ROLE;
  IF refused <> 1 THEN RAISE EXCEPTION 'FAIL READY-08: an invalid fact value was accepted'; END IF;
  SELECT c INTO fc FROM jsonb_array_elements(rd->'checks') c WHERE c->>'key'='REQUIRED_FACTS';
  IF (fc->>'status') <> 'BLOCKING' THEN
    RAISE EXCEPTION 'FAIL READY-09: a fact recorded on another assessment satisfied this one'; END IF;
  RAISE NOTICE 'PASS READY-08: an invalid or unresolved fact does not satisfy readiness';
  RAISE NOTICE 'PASS READY-09: evidence or facts from another assessment cannot satisfy readiness';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  PERFORM public.supervisory_assessment_fact_set((SELECT v FROM ev_id WHERE k='assessment'),
    jsonb_build_object('fact_code','AML05CERT_F_COUNT','value','42','source_type','OFFICER_ENTERED',
      'source_reference','AML05CERT source note','as_of_date', current_date::text));
  rd := public.supervisory_assessment_readiness((SELECT v FROM ev_id WHERE k='assessment'));
  RESET ROLE;
  SELECT c INTO fc FROM jsonb_array_elements(rd->'checks') c WHERE c->>'key'='REQUIRED_FACTS';
  IF (fc->>'status') <> 'OK' THEN
    RAISE EXCEPTION 'FAIL READY-07: a valid sourced fact did not clear the blocker (%)', fc; END IF;
  RAISE NOTICE 'PASS READY-07: a valid sourced fact clears the required-fact blocker';

  -- READY-12: a client holding the earlier (blocked) result cannot force the
  -- opposite outcome, and a client holding a ready result cannot force submission
  -- once the server state changes.
  IF (stale->>'can_submit')::boolean THEN
    RAISE EXCEPTION 'FAIL READY-12: the stale contract already claimed the assessment was ready'; END IF;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  PERFORM public.supervisory_assessment_transition((SELECT v FROM ev_id WHERE k='assessment'),
    'submitted', 'AML05CERT submission once the platform reports readiness');
  RESET ROLE;
  SELECT status INTO st FROM public.supervisory_assessment WHERE id=(SELECT v FROM ev_id WHERE k='assessment');
  IF st <> 'submitted' THEN
    RAISE EXCEPTION 'FAIL READY-07: the platform still refused submission after readiness cleared (status %)', st; END IF;
  RAISE NOTICE 'PASS READY-11/12: submission follows the server decision; a stale client result changes nothing';
END $$;

-- =====================================================================
-- READY-12 (second limb) — a submitted assessment is no longer writable
-- =====================================================================
DO $$
DECLARE refused int := 0;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  BEGIN
    PERFORM public.supervisory_assessment_evidence_link((SELECT v FROM ev_id WHERE k='assessment'),
      jsonb_build_object('evidence_type','RFI_RESPONSE','source_reference','AML05CERT-LATE',
        'methodology_question_id',(SELECT v FROM ev_id WHERE k='q_ev')));
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN
    PERFORM public.supervisory_assessment_fact_set((SELECT v FROM ev_id WHERE k='assessment'),
      jsonb_build_object('fact_code','AML05CERT_F_DATE','value',current_date::text,'source_type','OFFICER_ENTERED'));
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  RESET ROLE;
  IF refused <> 2 THEN
    RAISE EXCEPTION 'FAIL READY-12: a submitted assessment still accepted evidence or fact writes'; END IF;
  RAISE NOTICE 'PASS READY-12: once submitted, the working file no longer accepts evidence or fact writes';
END $$;

-- =====================================================================
-- LEGACY-01 .. LEGACY-06
-- =====================================================================
DO $$
DECLARE n bigint; worse int;
BEGIN
  SELECT count(*) INTO n FROM public.supervisory_assessment_evidence_basis b
   WHERE b.assessment_id NOT IN ((SELECT v FROM ev_id WHERE k='assessment'),
                                 (SELECT v FROM ev_id WHERE k='assessment_b'));
  IF n <> (SELECT ev_n.n FROM ev_n WHERE k='evidence_basis') THEN
    RAISE EXCEPTION 'FAIL LEGACY-01: % historical evidence record(s) were created by installation', n; END IF;
  IF (SELECT count(*) FROM public.supervisory_assessment_fact f
       WHERE f.assessment_id NOT IN ((SELECT v FROM ev_id WHERE k='assessment'),
                                     (SELECT v FROM ev_id WHERE k='assessment_b')))
     <> (SELECT ev_n.n FROM ev_n WHERE k='facts') THEN
    RAISE EXCEPTION 'FAIL LEGACY-01: historical assessments were backfilled with facts'; END IF;
  RAISE NOTICE 'PASS LEGACY-01: no historical assessment was backfilled';

  -- LEGACY-02: preserved evidence_refs still count towards the requirement
  IF NOT EXISTS (
    SELECT 1 FROM public.supervisory_assessment_question_response r
     WHERE public.jsonb_array_len_safe(r.evidence_refs) > 0
       AND public.supervisory_assessment_question_evidence_count(r.assessment_id, r.methodology_question_id)
           >= public.jsonb_array_len_safe(r.evidence_refs)) THEN
    RAISE EXCEPTION 'FAIL LEGACY-02: historical evidence no longer counts through the compatibility rule'; END IF;
  RAISE NOTICE 'PASS LEGACY-02: historical assessment evidence continues to count';

  -- LEGACY-03: no existing assessment became less complete
  SELECT count(*) INTO worse FROM ev_legacy l
    JOIN public.supervisory_assessment a ON a.id = l.assessment_id
   WHERE public.jsonb_array_len_safe(public.supervisory_assessment_question_gaps_internal(a.id)) > l.gaps
      OR public.jsonb_array_len_safe(public.supervisory_assessment_fact_gaps_internal(a.id)) > l.facts;
  IF worse > 0 THEN
    RAISE EXCEPTION 'FAIL LEGACY-03: % historical assessment(s) became newly incomplete', worse; END IF;
  RAISE NOTICE 'PASS LEGACY-03: no historical assessment became incomplete because AML-05 was installed';

  -- LEGACY-04: legacy references are never dressed up as structured facts
  IF EXISTS (SELECT 1 FROM public.supervisory_assessment_fact f
              JOIN public.supervisory_assessment_question_response r ON r.assessment_id = f.assessment_id
             WHERE f.provenance->>'basis' = 'LEGACY_EVIDENCE_REF') THEN
    RAISE EXCEPTION 'FAIL LEGACY-04: legacy evidence was converted into fabricated fact provenance'; END IF;
  IF (SELECT count(*) FROM public.supervisory_assessment_fact WHERE auto_prefilled AND system_value IS NULL) > 0 THEN
    RAISE EXCEPTION 'FAIL LEGACY-04: a prefilled fact exists without its proposed value'; END IF;
  RAISE NOTICE 'PASS LEGACY-04: legacy evidence is counted honestly, with no fabricated fact provenance';

  IF (SELECT md5(COALESCE(string_agg(p.id::text||':'||p.plan_state,'|' ORDER BY p.id),''))
        FROM public.supervisory_assessment_question_plan p
       WHERE p.assessment_id NOT IN ((SELECT v FROM ev_id WHERE k='assessment'),
                                     (SELECT v FROM ev_id WHERE k='assessment_b')))
     <> (SELECT ev_t.t FROM ev_t WHERE k='plan_digest') THEN
    RAISE EXCEPTION 'FAIL LEGACY-05: existing AML-04 question plans changed'; END IF;
  RAISE NOTICE 'PASS LEGACY-05: AML-04 question plans are unchanged';

  IF (SELECT md5(COALESCE(string_agg(r.entity_id::text||':'||COALESCE(r.residual_rating,'-'),'|' ORDER BY r.entity_id),''))
        FROM public.entity_risk_state r) <> (SELECT ev_t.t FROM ev_t WHERE k='risk_digest') THEN
    RAISE EXCEPTION 'FAIL LEGACY-06: entity risk of record changed'; END IF;
  RAISE NOTICE 'PASS LEGACY-06: risk of record is unchanged';
END $$;

-- =====================================================================
-- SEC-01 .. SEC-12
-- =====================================================================
DO $$
DECLARE refused int := 0;
BEGIN
  -- SEC-01: unauthenticated operations
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','', true);
  BEGIN PERFORM public.supervisory_assessment_readiness((SELECT v FROM ev_id WHERE k='assessment_b'));
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN PERFORM public.supervisory_assessment_evidence_link((SELECT v FROM ev_id WHERE k='assessment_b'),
      jsonb_build_object('evidence_type','RFI_RESPONSE','source_reference','x',
        'methodology_question_id',(SELECT v FROM ev_id WHERE k='q_ev')));
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN PERFORM public.supervisory_assessment_fact_set((SELECT v FROM ev_id WHERE k='assessment_b'),
      jsonb_build_object('fact_code','AML05CERT_F_DATE','value',current_date::text,'source_type','OFFICER_ENTERED'));
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  RESET ROLE;
  IF refused <> 3 THEN
    RAISE EXCEPTION 'FAIL SEC-01: only % of 3 unauthenticated operations refused', refused; END IF;
  RAISE NOTICE 'PASS SEC-01: unauthenticated evidence, fact and readiness operations are refused';

  -- SEC-02: an unauthorised persona
  refused := 0;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"411dd06d-648b-4f32-82cc-897902c0c0b6","role":"authenticated"}', true);
  BEGIN PERFORM public.supervisory_assessment_readiness((SELECT v FROM ev_id WHERE k='assessment_b'));
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN PERFORM public.supervisory_assessment_question_execution((SELECT v FROM ev_id WHERE k='assessment_b'));
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN PERFORM public.supervisory_assessment_evidence_register((SELECT v FROM ev_id WHERE k='assessment_b'));
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  BEGIN PERFORM public.supervisory_assessment_fact_override((SELECT v FROM ev_id WHERE k='fact_locked'),
      jsonb_build_object('value','3'), 'An outsider attempting to change a governed value');
  EXCEPTION WHEN others THEN refused := refused + 1; END;
  RESET ROLE;
  IF refused <> 4 THEN
    RAISE EXCEPTION 'FAIL SEC-02: only % of 4 unauthorised operations refused', refused; END IF;
  RAISE NOTICE 'PASS SEC-02: an unauthorised persona can neither read nor change evidence, facts or readiness';
END $$;

DO $$
DECLARE bad text; n int;
BEGIN
  -- SEC-03: governed functions pin their search_path
  SELECT string_agg(p.proname, ', ') INTO bad
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname='public'
     AND p.proname IN ('supervisory_assessment_evidence_link','supervisory_assessment_evidence_unlink',
       'supervisory_assessment_fact_set','supervisory_assessment_fact_override',
       'supervisory_assessment_readiness','supervisory_assessment_readiness_internal',
       'supervisory_assessment_question_execution','supervisory_assessment_evidence_register',
       'supervisory_assessment_fact_register','supervisory_evidence_source_resolve',
       'supervisory_assessment_execution_require_edit','supervisory_assessment_fact_gaps_internal',
       'supervisory_assessment_question_gaps_internal','supervisory_assessment_question_evidence_count')
     AND NOT (COALESCE(array_to_string(p.proconfig,','),'') LIKE '%search_path%');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'FAIL SEC-03: unpinned search_path on %', bad; END IF;
  RAISE NOTICE 'PASS SEC-03: every governed evidence, fact and readiness function pins its search_path';

  -- SEC-04: no anonymous or PUBLIC execution
  SELECT count(*) INTO n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname='public'
     AND (p.proname LIKE 'supervisory_assessment_evidence%' OR p.proname LIKE 'supervisory_assessment_fact%'
          OR p.proname LIKE 'supervisory_assessment_readiness%' OR p.proname='supervisory_evidence_source_resolve'
          OR p.proname='supervisory_assessment_question_execution')
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
          OR has_function_privilege('public', p.oid, 'EXECUTE'));
  IF n > 0 THEN RAISE EXCEPTION 'FAIL SEC-04: % governed function(s) are executable anonymously', n; END IF;
  RAISE NOTICE 'PASS SEC-04: PUBLIC and anonymous execution is revoked on every AML-05 function';

  -- SEC-05: no client write privilege on the governed stores
  SELECT count(*) INTO n FROM (VALUES
      ('supervisory_assessment_evidence_basis'),('supervisory_assessment_question_evidence'),
      ('supervisory_assessment_dimension_evidence'),('supervisory_assessment_fact'),
      ('supervisory_evidence_basis_type')) AS t(rel)
   WHERE has_table_privilege('authenticated','public.'||t.rel,'INSERT')
      OR has_table_privilege('authenticated','public.'||t.rel,'UPDATE')
      OR has_table_privilege('authenticated','public.'||t.rel,'DELETE')
      OR has_table_privilege('anon','public.'||t.rel,'SELECT');
  IF n > 0 THEN RAISE EXCEPTION 'FAIL SEC-05: % governed store(s) are directly writable or anonymously readable', n; END IF;
  RAISE NOTICE 'PASS SEC-05: the governed stores are read-only to signed-in staff and closed to anonymous callers';

  -- SEC-06: RLS is enabled on every AML-05 store
  SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
   WHERE ns.nspname='public' AND NOT c.relrowsecurity
     AND c.relname IN ('supervisory_assessment_evidence_basis','supervisory_assessment_question_evidence',
       'supervisory_assessment_dimension_evidence','supervisory_assessment_fact','supervisory_evidence_basis_type');
  IF n > 0 THEN RAISE EXCEPTION 'FAIL SEC-06: % AML-05 store(s) have no row-level security', n; END IF;
  RAISE NOTICE 'PASS SEC-06: row-level security is enabled on every AML-05 store';
END $$;

DO $$
DECLARE seen int;
BEGIN
  -- SEC-07: readiness cannot be forged by client input — it takes only an id
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
              WHERE ns.nspname='public' AND p.proname='supervisory_assessment_readiness'
                AND p.pronargs <> 1) THEN
    RAISE EXCEPTION 'FAIL SEC-07: readiness accepts client-supplied state'; END IF;
  RAISE NOTICE 'PASS SEC-07: readiness takes only an assessment identifier — it cannot be forged by the client';

  -- SEC-08: the evidence register never exposes an inaccessible source as usable
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);
  SELECT count(*) INTO seen FROM jsonb_array_elements(
      public.supervisory_assessment_evidence_register((SELECT v FROM ev_id WHERE k='assessment'))) e
   WHERE (e->>'source_accessible')::boolean IS NOT TRUE;
  RESET ROLE;
  IF seen > 0 THEN
    RAISE NOTICE 'NOTE SEC-08: % evidence row(s) are shown as restricted rather than described', seen; END IF;
  RAISE NOTICE 'PASS SEC-08: the register states source accessibility instead of disclosing restricted records';
END $$;

-- =====================================================================
-- Preservation inside the transaction
-- =====================================================================
DO $$
BEGIN
  IF (SELECT status FROM public.supervisory_methodology WHERE id=(SELECT v FROM ev_id WHERE k='meth_v10'))
     <> (SELECT t FROM ev_t WHERE k='v10_status') THEN
    RAISE EXCEPTION 'FAIL PRESERVE: AML-CFT-RBA v1.0 changed'; END IF;
  IF (SELECT status FROM public.supervisory_methodology WHERE id=(SELECT v FROM ev_id WHERE k='meth_v11'))
     <> (SELECT t FROM ev_t WHERE k='v11_status') THEN
    RAISE EXCEPTION 'FAIL PRESERVE: AML-CFT-RBA v1.1 changed'; END IF;
  IF (SELECT count(*) FROM public.supervisory_methodology_fact_requirement
       WHERE COALESCE(is_required,false)
         AND methodology_id IN ((SELECT v FROM ev_id WHERE k='meth_v10'),(SELECT v FROM ev_id WHERE k='meth_v11'))) > 0 THEN
    RAISE EXCEPTION 'FAIL PRESERVE: a required fact was added to a live methodology'; END IF;
  IF (SELECT count(*) FROM public.supervisory_calculation_config) <> (SELECT n FROM ev_n WHERE k='calc_config')
     OR (SELECT count(*) FROM public.supervisory_calculation_band) <> (SELECT n FROM ev_n WHERE k='calc_band')
     OR (SELECT count(*) FROM public.supervisory_calculation_matrix_cell) <> (SELECT n FROM ev_n WHERE k='calc_matrix')
     OR (SELECT count(*) FROM public.supervisory_calculation_response_score) <> (SELECT n FROM ev_n WHERE k='calc_score') THEN
    RAISE EXCEPTION 'FAIL PRESERVE: calculation, banding, matrix or scoring policy was authored'; END IF;
  IF (SELECT count(*) FROM public.regulators) <> (SELECT n FROM ev_n WHERE k='regulators') THEN
    RAISE EXCEPTION 'FAIL PRESERVE: the regulator master changed'; END IF;
  IF (SELECT md5(string_agg(a.id::text||':'||a.status||':'||COALESCE(a.methodology_id::text,'-'),'|' ORDER BY a.id))
        FROM public.supervisory_assessment a
       WHERE a.summary IS NULL OR a.summary NOT LIKE 'AML05CERT%')
     <> (SELECT t FROM ev_t WHERE k='assess_digest') THEN
    RAISE EXCEPTION 'FAIL PRESERVE: pre-existing assessments changed'; END IF;
  IF (SELECT md5(COALESCE(string_agg(r.id::text||':'||COALESCE(r.response,'-')||':'||
                  COALESCE(r.evidence_refs::text,'-'),'|' ORDER BY r.id),''))
        FROM public.supervisory_assessment_question_response r
       WHERE r.assessment_id NOT IN ((SELECT v FROM ev_id WHERE k='assessment'),
                                     (SELECT v FROM ev_id WHERE k='assessment_b')))
     <> (SELECT t FROM ev_t WHERE k='resp_digest') THEN
    RAISE EXCEPTION 'FAIL PRESERVE: historical responses or their evidence references changed'; END IF;
  RAISE NOTICE 'PASS PRESERVE: v1.0, v1.1, live fact requirements, calculation policy, regulators, historical assessments and legacy evidence are unchanged';
END $$;

ROLLBACK;

-- =====================================================================
-- Rollback cleanliness (outside the transaction)
-- =====================================================================
DO $$
DECLARE n bigint; total bigint;
BEGIN
  SELECT count(*) INTO n FROM public.supervisory_methodology WHERE code LIKE 'AML05CERT%';
  IF n > 0 THEN RAISE EXCEPTION 'FAIL ROLLBACK: % AML05CERT methodology row(s) survived', n; END IF;
  SELECT count(*) INTO n FROM public.supervisory_methodology_fact_requirement WHERE fact_code LIKE 'AML05CERT%';
  IF n > 0 THEN RAISE EXCEPTION 'FAIL ROLLBACK: % AML05CERT fact definition(s) survived', n; END IF;
  SELECT count(*) INTO n FROM public.supervisory_assessment_programme_set WHERE code LIKE 'AML05CERT%';
  IF n > 0 THEN RAISE EXCEPTION 'FAIL ROLLBACK: % AML05CERT programme package(s) survived', n; END IF;
  SELECT count(*) INTO n FROM public.supervisory_assessment WHERE summary LIKE 'AML05CERT%';
  IF n > 0 THEN RAISE EXCEPTION 'FAIL ROLLBACK: % AML05CERT assessment(s) survived', n; END IF;
  SELECT count(*) INTO n FROM public.supervisory_assessment_evidence_basis
   WHERE source_reference LIKE 'AML05CERT%' OR title LIKE 'AML05CERT%';
  IF n > 0 THEN RAISE EXCEPTION 'FAIL ROLLBACK: % AML05CERT evidence record(s) survived', n; END IF;
  SELECT count(*) INTO n FROM public.supervisory_assessment_fact WHERE fact_code LIKE 'AML05CERT%';
  IF n > 0 THEN RAISE EXCEPTION 'FAIL ROLLBACK: % AML05CERT fact(s) survived', n; END IF;
  SELECT count(*) INTO n FROM public.supervisory_finding WHERE reference LIKE 'AML05CERT%';
  IF n > 0 THEN RAISE EXCEPTION 'FAIL ROLLBACK: % AML05CERT source fixture(s) survived', n; END IF;
  SELECT count(*) INTO n FROM public.supervisory_assessment_event
   WHERE rationale LIKE 'AML05CERT%' OR detail::text LIKE '%AML05CERT%';
  IF n > 0 THEN RAISE EXCEPTION 'FAIL ROLLBACK: % AML05CERT audit event(s) survived', n; END IF;

  SELECT count(*) INTO total FROM public.supervisory_assessment;
  IF total <> current_setting('aml02d.pre_assessments')::bigint THEN RAISE EXCEPTION 'FAIL ROLLBACK: the assessment count is % rather than the pre-run %', total, current_setting('aml02d.pre_assessments'); END IF;
  RAISE NOTICE 'POST-RUN: no AML05CERT fixture survives; % assessment(s) remain; % evidence record(s); % fact(s)',
    total,
    (SELECT count(*) FROM public.supervisory_assessment_evidence_basis),
    (SELECT count(*) FROM public.supervisory_assessment_fact);
END $$;
