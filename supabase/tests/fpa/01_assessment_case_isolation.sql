-- EPR-04 / P05 — Fit & Proper assessment case isolation.
--
-- Central acceptance test: ONE individual with TWO assessments.
--   A = historical/completed (determination + condition + appeal lineage)
--   B = active renewal
-- Opening B must never surface A's screening, findings, votes, determination,
-- conditions or appeals — and opening A must still show its own history intact.
BEGIN;
SELECT plan(16);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-00000004a001', 'epr04-super@test')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role)
  VALUES ('00000000-0000-0000-0000-00000004a001', 'super_admin')
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  v_ind  uuid := '00000000-0000-0000-0000-00000004a010';
  v_a    uuid := '00000000-0000-0000-0000-00000004a0aa';
  v_b    uuid := '00000000-0000-0000-0000-00000004a0bb';
  v_det  uuid := '00000000-0000-0000-0000-00000004a0cc';
  v_runA uuid := gen_random_uuid();
  v_runB uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.fp_individuals (id, full_name, status)
  VALUES (v_ind, 'EPR-04 Two Assessment Subject', 'active')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.fp_assessments (id, individual_id, assessment_type, status, declaration_data, created_at)
  VALUES
    (v_a, v_ind, 'initial',  'closed', '{"x":1}'::jsonb, now() - interval '3 years'),
    (v_b, v_ind, 'periodic', 'screening', '{"x":1}'::jsonb, now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.fp_screening_runs (id, individual_id, assessment_id, run_type, status, started_at)
  VALUES (v_runA, v_ind, v_a, 'full', 'completed', now() - interval '3 years'),
         (v_runB, v_ind, v_b, 'full', 'completed', now());

  INSERT INTO public.fp_findings (run_id, assessment_id, individual_id, check_type, severity, title)
  VALUES (v_runA, v_a, v_ind, 'litigation', 'low',  'Historical finding A'),
         (v_runB, v_b, v_ind, 'sanctions',  'high', 'Current finding B');

  INSERT INTO public.fp_determinations (id, assessment_id, individual_id, outcome, rationale, determined_at, is_current)
  VALUES (v_det, v_a, v_ind, 'fit', 'Historical determination on assessment A', now() - interval '3 years', false);

  INSERT INTO public.fp_conditions (determination_id, category, description, status)
  VALUES (v_det, 'training', 'Condition belonging to assessment A lineage', 'open');

  INSERT INTO public.fp_appeals (determination_id, status, grounds, filed_at)
  VALUES (v_det, 'submitted', 'Appeal belonging to assessment A lineage', now() - interval '3 years');
END$$;

SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-00000004a001","role":"authenticated"}';

CREATE TEMP TABLE case_a AS SELECT public.fp_assessment_case('00000000-0000-0000-0000-00000004a0aa') AS k;
CREATE TEMP TABLE case_b AS SELECT public.fp_assessment_case('00000000-0000-0000-0000-00000004a0bb') AS k;

-- Both cases resolve for a permitted reader ------------------------------------
SELECT ok((SELECT (k->>'allowed')::boolean FROM case_a), 'assessment A is readable');
SELECT ok((SELECT (k->>'allowed')::boolean FROM case_b), 'assessment B is readable');
SELECT is((SELECT k->>'assessment_id' FROM case_b), '00000000-0000-0000-0000-00000004a0bb',
  'the case is keyed by the explicit assessment id, not the latest one');

-- B shows only B evidence ------------------------------------------------------
SELECT is((SELECT jsonb_array_length(k->'findings') FROM case_b), 1, 'B exposes exactly one finding');
SELECT is((SELECT k->'findings'->0->>'title' FROM case_b), 'Current finding B',
  'B exposes only its own finding');
SELECT is((SELECT jsonb_array_length(k->'screening'->'runs') FROM case_b), 1,
  'B exposes only its own screening run');
SELECT is((SELECT k->'determination' FROM case_b), 'null'::jsonb,
  'B has no determination even though the person has one on A');
SELECT is((SELECT jsonb_array_length(k->'conditions') FROM case_b), 0,
  'A conditions do not leak into B');
SELECT is((SELECT jsonb_array_length(k->'appeals') FROM case_b), 0,
  'A appeals do not leak into B');
SELECT is((SELECT jsonb_array_length(k->'committee'->'votes') FROM case_b), 0,
  'no committee votes leak into B');

-- A keeps its historical evidence ---------------------------------------------
SELECT is((SELECT k->'findings'->0->>'title' FROM case_a), 'Historical finding A',
  'A retains its historical finding');
SELECT is((SELECT k->'determination'->>'rationale' FROM case_a),
  'Historical determination on assessment A', 'A retains its determination');
SELECT is((SELECT jsonb_array_length(k->'conditions') FROM case_a), 1,
  'A retains its condition lineage');
SELECT is((SELECT jsonb_array_length(k->'appeals') FROM case_a), 1,
  'A retains its appeal lineage');

-- Sibling awareness without process authority ---------------------------------
SELECT is((SELECT jsonb_array_length(k->'related_cases') FROM case_b), 1,
  'B lists A as a related case');
SELECT is((SELECT k->'related_cases'->0->>'href' FROM case_b),
  '/fpa/assessments/00000000-0000-0000-0000-00000004a0aa',
  'related cases link to the assessment workspace, not the person');

ROLLBACK;
