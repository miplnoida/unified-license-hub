-- ============================================================================
-- AML-04 — capture REAL question-plan read-model payloads for the UI gates.
--
-- Builds a minimal transaction-scoped fixture (an ACTIVE methodology and an
-- ACTIVE programme set for the live FSRA regulator), creates one programmed
-- assessment through the governed RPC so the server materialises a real plan,
-- asks every governed read model for its payload, prints one JSON object and
-- ROLLS BACK. No business record survives, and nothing here is hand-written:
-- the fixtures record what the server actually returns.
--
-- Usage:
--   psql -Aqt -v ON_ERROR_STOP=1 -f scripts/capture-question-plan-fixtures.sql \
--     > src/test/fixtures/questionPlanReadModels.json
-- ============================================================================
\set ON_ERROR_STOP on
SET row_security = on;
SET client_min_messages = warning;

BEGIN;

CREATE TEMP TABLE cap(k text primary key, v uuid) ON COMMIT DROP;
GRANT ALL ON cap TO authenticated;

INSERT INTO cap(k, v) VALUES
  ('regulator', '8dd8ac87-4e11-4a6b-8991-bf88cb03d7c3'),
  ('entity',    'aa220000-0000-4000-8000-000000000001');
INSERT INTO cap(k, v)
SELECT 'sector', l.sector_id FROM public.licensees l WHERE l.id = (SELECT v FROM cap WHERE k = 'entity');
INSERT INTO cap(k, v)
SELECT 'other_sector', s.id FROM public.sectors s
 WHERE s.id <> (SELECT v FROM cap WHERE k = 'sector') ORDER BY s.id LIMIT 1;

-- transaction-scoped supervisory authority for the capture persona
INSERT INTO public.sec_user_roles(user_id, role_id, status, assigned_by)
SELECT 'b8eaf680-fe66-4d49-b816-1c087f511235'::uuid, r.id, 'active',
       'b8eaf680-fe66-4d49-b816-1c087f511235'::uuid
  FROM public.sec_roles r WHERE r.key = 'aml_head'
ON CONFLICT DO NOTHING;
INSERT INTO public.sec_role_scopes(role_id, module_id, scope_type_id)
SELECT r.id, m.id, st.id FROM public.sec_roles r, public.sec_modules m, public.sec_scope_types st
 WHERE r.key='aml_head' AND m.key='aml_supervision' AND st.key='regulator'
ON CONFLICT (role_id, module_id) DO UPDATE SET scope_type_id = EXCLUDED.scope_type_id;
INSERT INTO public.sec_role_scope_values(role_scope_id, value_kind, value_id)
SELECT rs.id, 'regulator', (SELECT v FROM cap WHERE k='regulator')
  FROM public.sec_role_scopes rs
  JOIN public.sec_roles r ON r.id = rs.role_id AND r.key='aml_head'
  JOIN public.sec_modules m ON m.id = rs.module_id AND m.key='aml_supervision';

-- fixture methodology: sector- and regulator-scoped so the canonical resolver picks it
INSERT INTO public.supervisory_methodology(
  id, code, domain_code, name, version, status, sector_id, regulator_id,
  effective_from, origin, title)
VALUES (gen_random_uuid(), 'PLANCAP-METH', 'AML_CFT', 'PLANCAP capture fixture', '1.0', 'ACTIVE',
  (SELECT v FROM cap WHERE k='sector'), (SELECT v FROM cap WHERE k='regulator'),
  current_date - 1, 'REGULATOR_AUTHORED', 'PLANCAP capture fixture');
INSERT INTO cap(k, v) SELECT 'meth', id FROM public.supervisory_methodology WHERE code='PLANCAP-METH';

INSERT INTO public.supervisory_methodology_dimension(
  methodology_id, dimension_code, dimension_group, label, weight, sort_order, active, dimension_kind)
SELECT (SELECT v FROM cap WHERE k='meth'), x.code, 'INHERENT_RISK', x.code, 50, x.o, true, 'INHERENT'
  FROM (VALUES ('PLANCAP_DIM_A', 1), ('PLANCAP_DIM_B', 2)) AS x(code, o);

INSERT INTO public.supervisory_methodology_question(
  methodology_id, methodology_dimension_id, question_code, prompt, response_options,
  mandatory, question_class, allow_not_applicable, na_requires_rationale, requires_evidence,
  active, sort_order)
SELECT (SELECT v FROM cap WHERE k='meth'), d.id, x.code, x.prompt,
       ARRAY['YES','NO','NOT_APPLICABLE'], true, x.cls, x.na, x.na, x.ev, true, x.o
  FROM (VALUES
    ('PLANCAP_Q_CORE',   'PLANCAP_DIM_A', 'Are customer risk ratings reviewed on a documented cycle?', 'CORE',        false, true,  1),
    ('PLANCAP_Q_COND_T', 'PLANCAP_DIM_A', 'Are correspondent banking relationships risk assessed?',    'CONDITIONAL', false, false, 2),
    ('PLANCAP_Q_COND_F', 'PLANCAP_DIM_A', 'Are trust structures subject to enhanced due diligence?',   'CONDITIONAL', false, false, 3),
    ('PLANCAP_Q_ENH',    'PLANCAP_DIM_A', 'Is transaction monitoring independently tested?',           'ENHANCED',    false, false, 4),
    ('PLANCAP_Q_NA',     'PLANCAP_DIM_B', 'Are group-wide AML policies applied to subsidiaries?',      'CORE',        true,  false, 5)
  ) AS x(code, dim, prompt, cls, na, ev, o)
  JOIN public.supervisory_methodology_dimension d
    ON d.methodology_id = (SELECT v FROM cap WHERE k='meth') AND d.dimension_code = x.dim;

INSERT INTO public.supervisory_methodology_question_rule(
  methodology_id, question_id, rule_kind, rule_definition, rule_summary)
SELECT q.methodology_id, q.id, x.kind, x.def, public.supervisory_question_rule_describe(x.def)
  FROM (VALUES
    ('PLANCAP_Q_COND_T', 'TRIGGER',
      jsonb_build_object('op','EQ','source','ENTITY.SECTOR_ID','value',(SELECT v FROM cap WHERE k='sector'))),
    ('PLANCAP_Q_COND_F', 'TRIGGER',
      jsonb_build_object('op','EQ','source','ENTITY.SECTOR_ID','value',(SELECT v FROM cap WHERE k='other_sector')))
  ) AS x(qcode, kind, def)
  JOIN public.supervisory_methodology_question q
    ON q.methodology_id = (SELECT v FROM cap WHERE k='meth') AND q.question_code = x.qcode;

UPDATE public.licensees SET systemic_importance = NULL WHERE id = (SELECT v FROM cap WHERE k='entity');

INSERT INTO public.supervisory_assessment_programme_set(
  code, set_version, name, domain_code, regulator_id, origin, status, effective_from)
VALUES ('PLANCAP-PROGRAMMES','1.0','PLANCAP programme fixture','AML_CFT',
  (SELECT v FROM cap WHERE k='regulator'),'REGULATOR_AUTHORED','ACTIVE', current_date - 1);
INSERT INTO cap(k, v) SELECT 'set', id FROM public.supervisory_assessment_programme_set
 WHERE code='PLANCAP-PROGRAMMES';

INSERT INTO public.supervisory_assessment_programme(
  programme_set_id, programme_code, label, assessment_type, is_active, sort_order,
  period_rule, period_value, end_offset_days, allow_manual_override, summary_required,
  question_class_scope, included_dimension_codes, excluded_dimension_codes)
VALUES ((SELECT v FROM cap WHERE k='set'), 'PLANCAP_PERIODIC', 'Periodic AML/CFT assessment',
  'PERIODIC', true, 1, 'TRAILING_DAYS', 365, 1, false, false,
  ARRAY['CORE','CONDITIONAL','ENHANCED'], '{}'::text[], '{}'::text[]);

INSERT INTO public.supervisory_assessment_programme_trigger(
  programme_id, trigger_code, label, is_default, is_active, sort_order)
SELECT p.id, 'PERIODIC', 'Periodic cycle', true, true, 1
  FROM public.supervisory_assessment_programme p
 WHERE p.programme_set_id = (SELECT v FROM cap WHERE k='set');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', true);

INSERT INTO cap(k, v)
SELECT 'assessment', (public.supervisory_assessment_create_programmed(
  (SELECT v FROM cap WHERE k='entity'), 'AML_CFT',
  (SELECT id FROM public.supervisory_assessment_programme WHERE programme_code='PLANCAP_PERIODIC'),
  'PERIODIC', NULL, NULL, 'PLANCAP fixture capture')->>'id')::uuid;

SELECT jsonb_pretty(jsonb_build_object(
  'assessment_id',   (SELECT v FROM cap WHERE k='assessment'),
  'methodology_id',  (SELECT v FROM cap WHERE k='meth'),
  'question_id',     (SELECT q.id FROM public.supervisory_methodology_question q
                       WHERE q.question_code = 'PLANCAP_Q_COND_T'),
  'plan',            public.supervisory_assessment_question_plan((SELECT v FROM cap WHERE k='assessment')),
  'plan_context',    public.supervisory_assessment_question_plan_context((SELECT v FROM cap WHERE k='assessment')),
  'plan_summary',    public.supervisory_assessment_question_plan_summary((SELECT v FROM cap WHERE k='assessment')),
  'rule_vocabulary', public.supervisory_question_rule_vocabulary(),
  'question_rules',  public.supervisory_methodology_question_rules(
                       (SELECT q.id FROM public.supervisory_methodology_question q
                         WHERE q.question_code = 'PLANCAP_Q_COND_T'))
));

RESET ROLE;
ROLLBACK;
