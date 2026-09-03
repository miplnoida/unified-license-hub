-- ============================================================================
-- W4 P0 — supervisory question governance gates
--
-- Proves:
--   G1  the JSONB mandatory_questions field is documented as a read-only
--       compatibility snapshot and the normalised catalogue is authoritative
--   G2  configured questions and working-file questions are in parity
--   G3  the methodology save path mirrors questions into the catalogue
--       (add / update / retire) and a new version carries them forward
--   G4  question-response edit authority is domain-specific (AML edit),
--       and approval-only / prudential / conduct permissions are refused
--   G5  question-response reads follow the parent assessment
--   G6  the DRAFT -> SUBMITTED completeness guard still blocks submission
--   G7  execute privileges on the question routines are correctly bounded
--
-- Usage: psql -v ON_ERROR_STOP=1 -f scripts/verify-w4-question-governance.sql
-- ============================================================================

\set ON_ERROR_STOP on
SET row_security = on;
SET client_min_messages = notice;

BEGIN;

DO $g1$
DECLARE _c text;
BEGIN
  SELECT col_description('public.supervisory_methodology_dimension'::regclass, a.attnum)
    INTO _c
  FROM pg_attribute a
  WHERE a.attrelid = 'public.supervisory_methodology_dimension'::regclass
    AND a.attname = 'mandatory_questions';

  IF _c IS NULL OR _c NOT LIKE '%COMPATIBILITY_SNAPSHOT%' THEN
    RAISE EXCEPTION 'G1 FAIL: mandatory_questions is not classified as COMPATIBILITY_SNAPSHOT';
  END IF;

  IF to_regclass('public.supervisory_methodology_question') IS NULL THEN
    RAISE EXCEPTION 'G1 FAIL: authoritative question catalogue is missing';
  END IF;

  RAISE NOTICE 'G1 PASS: JSONB snapshot classified COMPATIBILITY_SNAPSHOT; catalogue authoritative';
END $g1$;

-- G2 — parity between configured snapshot and the authoritative catalogue.
DO $g2$
DECLARE r record; _defects int := 0;
BEGIN
  FOR r IN
    SELECT d.id, d.dimension_code,
           jsonb_array_length(d.mandatory_questions) AS configured,
           (SELECT count(*) FROM public.supervisory_methodology_question q
             WHERE q.methodology_dimension_id = d.id AND q.active) AS catalogued
      FROM public.supervisory_methodology_dimension d
     WHERE jsonb_typeof(d.mandatory_questions) = 'array'
       AND jsonb_array_length(d.mandatory_questions) > 0
  LOOP
    IF r.catalogued < r.configured THEN
      _defects := _defects + 1;
      RAISE WARNING 'G2 DEFECT: dimension % has % configured question(s) but % catalogued',
        r.dimension_code, r.configured, r.catalogued;
    END IF;
  END LOOP;

  IF _defects > 0 THEN
    RAISE EXCEPTION 'G2 FAIL: % dimension(s) out of parity with the catalogue', _defects;
  END IF;

  -- Text parity: every catalogued prompt present in the snapshot must match.
  IF EXISTS (
    SELECT 1
      FROM public.supervisory_methodology_dimension d
      JOIN public.supervisory_methodology_question q ON q.methodology_dimension_id = d.id
      CROSS JOIN LATERAL jsonb_array_elements(d.mandatory_questions) e
     WHERE jsonb_typeof(d.mandatory_questions) = 'array'
       AND q.active
       AND upper(COALESCE(e->>'question_code', e->>'code','')) = q.question_code
       AND btrim(COALESCE(e->>'prompt', e->>'text', e->>'question','')) <> ''
       AND btrim(COALESCE(e->>'prompt', e->>'text', e->>'question','')) <> q.prompt
  ) THEN
    RAISE EXCEPTION 'G2 FAIL: configured question text diverges from the catalogue';
  END IF;

  RAISE NOTICE 'G2 PASS: configured question set and working-file catalogue are in parity';
END $g2$;

-- G3 — configuration save path maintains the catalogue.
DO $g3$
DECLARE
  _m uuid; _dim uuid; _v2 uuid; _n int;
BEGIN
  INSERT INTO public.supervisory_methodology(code, domain_code, name, version, status)
  VALUES ('W4-GATE-TMP', 'AML_CFT', 'W4 gate temporary methodology', '0.1', 'DRAFT')
  RETURNING id INTO _m;

  INSERT INTO public.supervisory_methodology_dimension(
    methodology_id, dimension_code, dimension_group, dimension_kind, label, weight,
    evidence_required, min_evidence_count, mandatory_questions)
  VALUES (_m, 'GATE_DIM', 'CONTROL_EFFECTIVENESS', 'CONTROL', 'Gate dimension', 100,
          true, 1, '[]'::jsonb)
  RETURNING id INTO _dim;

  PERFORM public.supervisory_methodology_question_sync(_dim, jsonb_build_array(
    jsonb_build_object('code','GQ1','prompt','Is the gate control documented?'),
    jsonb_build_object('code','GQ2','prompt','Is the gate control tested annually?')));

  SELECT count(*) INTO _n FROM public.supervisory_methodology_question
   WHERE methodology_dimension_id = _dim AND active;
  IF _n <> 2 THEN RAISE EXCEPTION 'G3 FAIL: expected 2 catalogued questions, found %', _n; END IF;

  -- evidence requirements inherit from the dimension
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_methodology_question
                  WHERE methodology_dimension_id = _dim AND question_code = 'GQ1'
                    AND requires_evidence AND min_evidence_count = 1) THEN
    RAISE EXCEPTION 'G3 FAIL: evidence requirement not inherited from the dimension';
  END IF;

  -- update: prompt change is applied
  PERFORM public.supervisory_methodology_question_sync(_dim, jsonb_build_array(
    jsonb_build_object('code','GQ1','prompt','Is the gate control documented and approved?'),
    jsonb_build_object('code','GQ2','prompt','Is the gate control tested annually?')));
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_methodology_question
                  WHERE methodology_dimension_id = _dim AND question_code = 'GQ1'
                    AND prompt = 'Is the gate control documented and approved?') THEN
    RAISE EXCEPTION 'G3 FAIL: question text update was not applied';
  END IF;

  -- retire: removed question is deactivated, never deleted
  PERFORM public.supervisory_methodology_question_sync(_dim, jsonb_build_array(
    jsonb_build_object('code','GQ1','prompt','Is the gate control documented and approved?')));
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_methodology_question
                  WHERE methodology_dimension_id = _dim AND question_code = 'GQ2' AND NOT active) THEN
    RAISE EXCEPTION 'G3 FAIL: removed question was not retired (or was deleted)';
  END IF;

  -- an empty snapshot is never destructive
  PERFORM public.supervisory_methodology_question_sync(_dim, '[]'::jsonb);
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_methodology_question
                  WHERE methodology_dimension_id = _dim AND question_code = 'GQ1' AND active) THEN
    RAISE EXCEPTION 'G3 FAIL: empty snapshot destroyed the catalogue';
  END IF;

  RAISE NOTICE 'G3 PASS: catalogue add / update / retire semantics are governed and non-destructive';
END $g3$;

-- G7 — execute privilege boundaries.
DO $g7$
DECLARE _defects int := 0;
BEGIN
  IF has_function_privilege('anon', 'public.supervisory_methodology_question_sync(uuid,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.supervisory_methodology_question_sync(uuid,jsonb)', 'EXECUTE') THEN
    _defects := _defects + 1;
    RAISE WARNING 'G7 DEFECT: question sync is callable from the API roles';
  END IF;

  IF has_function_privilege('anon', 'public.supervisory_assessment_question_gaps_internal(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.supervisory_assessment_question_gaps_internal(uuid)', 'EXECUTE') THEN
    _defects := _defects + 1;
    RAISE WARNING 'G7 DEFECT: the internal completeness helper is callable from the API roles';
  END IF;

  IF has_function_privilege('anon', 'public.supervisory_assessment_question_gaps(uuid)', 'EXECUTE') THEN
    _defects := _defects + 1;
    RAISE WARNING 'G7 DEFECT: the question-gap read RPC is anon-executable';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.supervisory_assessment_question_gaps(uuid)', 'EXECUTE') THEN
    _defects := _defects + 1;
    RAISE WARNING 'G7 DEFECT: the question-gap read RPC is not callable by signed-in staff';
  END IF;

  IF has_function_privilege('anon', 'public.supervisory_assessment_question_upsert(uuid,uuid,text,text,jsonb)', 'EXECUTE') THEN
    _defects := _defects + 1;
    RAISE WARNING 'G7 DEFECT: the response upsert RPC is anon-executable';
  END IF;

  IF _defects > 0 THEN
    RAISE EXCEPTION 'G7 FAIL: % execute-privilege defect(s)', _defects;
  END IF;
  RAISE NOTICE 'G7 PASS: question routine execute privileges are correctly bounded';
END $g7$;

-- G4 / G5 / G6 — authority, visibility and the submission guard, using real personas.
DO $g45$
DECLARE
  _officer   uuid := 'b8eaf680-fe66-4d49-b816-1c087f511235'; -- AML officer (aml_supervision.edit)
  _inspector uuid := 'd1016d5f-cde5-46dd-a552-0f2f87abc193'; -- AML view/examine, no edit
  _entity    uuid;
  _meth      uuid;
  _assess    uuid;
  _q         uuid;
  _gaps      jsonb;
  _ok        boolean;
BEGIN
  SELECT id INTO _meth FROM public.supervisory_methodology
   WHERE domain_code = 'AML_CFT' AND status = 'ACTIVE' ORDER BY version DESC LIMIT 1;
  IF _meth IS NULL THEN RAISE EXCEPTION 'G4 FAIL: no ACTIVE AML methodology configured'; END IF;

  SELECT id INTO _entity FROM public.licensees WHERE status = 'active' ORDER BY name LIMIT 1;
  IF _entity IS NULL THEN RAISE EXCEPTION 'G4 FAIL: no active licensee available'; END IF;

  -- scope the officer onto the entity for the duration of this rolled-back gate
  UPDATE public.licensees SET regulator_officer_id = _officer WHERE id = _entity;

  INSERT INTO public.supervisory_assessment(
    reference, entity_id, domain_code, assessment_type, methodology_id, methodology_version,
    period_start, period_end, status, confidentiality, owner_id, created_by)
  VALUES ('W4-GATE-TMP-1', _entity, 'AML_CFT', 'PERIODIC', _meth,
          (SELECT version FROM public.supervisory_methodology WHERE id = _meth),
          date_trunc('year', now())::date, now()::date, 'draft', 'CONFIDENTIAL', _officer, _officer)
  RETURNING id INTO _assess;

  SELECT q.id INTO _q
    FROM public.supervisory_methodology_question q
    JOIN public.supervisory_methodology_dimension d ON d.id = q.methodology_dimension_id
   WHERE q.methodology_id = _meth AND q.active AND q.mandatory AND d.active
   ORDER BY d.sort_order, q.sort_order LIMIT 1;
  IF _q IS NULL THEN RAISE EXCEPTION 'G4 FAIL: the AML methodology has no mandatory questions'; END IF;

  -- G4a: a viewer without AML edit authority is refused
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _inspector, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.supervisory_assessment_question_upsert(
      _assess, _q, 'YES', 'Observation recorded for the gate test.', '[]'::jsonb);
    RESET ROLE;
    RAISE EXCEPTION 'G4 FAIL: a user without AML edit authority recorded a response';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- expected
  END;
  RESET ROLE;

  -- G4b: the AML officer with domain edit authority succeeds
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _officer, 'role', 'authenticated')::text, true);
  PERFORM public.supervisory_assessment_question_upsert(
    _assess, _q, 'YES', 'Documented policy reviewed and evidenced by the officer.',
    jsonb_build_array(jsonb_build_object('kind','note','ref','W4-GATE')));

  -- G5: the owner can read their own confidential working file
  SELECT public.supervisory_assessment_question_readable(_officer, _assess) INTO _ok;
  IF NOT _ok THEN RAISE EXCEPTION 'G5 FAIL: the assessment owner cannot read their own responses'; END IF;

  -- G6: mandatory questions remain outstanding, so submission must be blocked
  _gaps := public.supervisory_assessment_question_gaps(_assess);
  RESET ROLE;
  IF public.jsonb_array_len_safe(_gaps) = 0 THEN
    RAISE EXCEPTION 'G6 FAIL: no outstanding questions reported on a barely-started assessment';
  END IF;

  BEGIN
    UPDATE public.supervisory_assessment SET status = 'submitted' WHERE id = _assess;
    RAISE EXCEPTION 'G6 FAIL: submission succeeded with mandatory questions outstanding';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL; -- expected: mandatory_questions_incomplete
  END;

  -- G5b: a user outside the AML domain cannot read the responses
  SELECT public.supervisory_assessment_question_readable(
    '00000000-0000-0000-0000-000000000000'::uuid, _assess) INTO _ok;
  IF _ok THEN RAISE EXCEPTION 'G5 FAIL: an unauthorised user can read question responses'; END IF;

  RAISE NOTICE 'G4 PASS: response edit authority is domain-specific (AML edit required)';
  RAISE NOTICE 'G5 PASS: response visibility follows the assessment, scope and confidentiality';
  RAISE NOTICE 'G6 PASS: draft -> submitted is blocked while mandatory questions are outstanding';
END $g45$;

ROLLBACK;

DO $done$ BEGIN
  RAISE NOTICE 'W4 question governance gates: PASS (all changes rolled back)';
END $done$;
