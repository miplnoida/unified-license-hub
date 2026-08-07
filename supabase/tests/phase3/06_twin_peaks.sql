-- Phase 3 / FP-COM-002 — Twin Peaks independent regulator positions
BEGIN;
SELECT plan(14);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000f3501', 'p3-tp-super@test'),
  ('00000000-0000-0000-0000-0000000f3502', 'p3-tp-prudential@test'),
  ('00000000-0000-0000-0000-0000000f3503', 'p3-tp-conduct@test')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role)
  VALUES ('00000000-0000-0000-0000-0000000f3501', 'super_admin')
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  v_r1 uuid := '00000000-0000-0000-0000-0000000f3510';  -- prudential
  v_r2 uuid := '00000000-0000-0000-0000-0000000f3511';  -- conduct
  v_dis uuid := '00000000-0000-0000-0000-0000000f3520';  -- disagreement subject
  v_ali uuid := '00000000-0000-0000-0000-0000000f3521';  -- aligned subject
  v_one uuid := '00000000-0000-0000-0000-0000000f3522';  -- single regulator subject
BEGIN
  INSERT INTO public.regulators (id, name, code, status) VALUES
    (v_r1, 'P3 Prudential Authority', 'P3PRU', 'active'),
    (v_r2, 'P3 Conduct Authority',    'P3CON', 'active')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.fp_individuals (id, full_name, status) VALUES
    (v_dis, 'P3 Twin Peaks Disagreement', 'active'),
    (v_ali, 'P3 Twin Peaks Aligned', 'active'),
    (v_one, 'P3 Twin Peaks Single', 'active')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.fp_assessments (id, individual_id, assessment_type, status, declaration_data, regulator_id)
  VALUES
    ('00000000-0000-0000-0000-0000000f3540', v_dis, 'initial', 'draft', '{}'::jsonb, v_r1),
    ('00000000-0000-0000-0000-0000000f3541', v_dis, 'initial', 'draft', '{}'::jsonb, v_r2),
    ('00000000-0000-0000-0000-0000000f3542', v_ali, 'initial', 'draft', '{}'::jsonb, v_r1),
    ('00000000-0000-0000-0000-0000000f3543', v_ali, 'initial', 'draft', '{}'::jsonb, v_r2),
    ('00000000-0000-0000-0000-0000000f3544', v_one, 'initial', 'draft', '{}'::jsonb, v_r1)
  ON CONFLICT (id) DO NOTHING;

  -- Disagreement: prudential says suitable, conduct says unsuitable.
  INSERT INTO public.fp_determinations
    (assessment_id, individual_id, outcome, rationale, determined_by, regulator_id, is_current, effective_from)
  VALUES
    ('00000000-0000-0000-0000-0000000f3540', v_dis, 'suitable',
     'Capital and governance record acceptable to the prudential authority.',
     '00000000-0000-0000-0000-0000000f3502', v_r1, true, CURRENT_DATE),
    ('00000000-0000-0000-0000-0000000f3541', v_dis, 'unsuitable',
     'Unresolved mis-selling findings make the individual unsuitable for a conduct role.',
     '00000000-0000-0000-0000-0000000f3503', v_r2, true, CURRENT_DATE),
    -- Aligned
    ('00000000-0000-0000-0000-0000000f3542', v_ali, 'suitable', 'No prudential concerns.',
     '00000000-0000-0000-0000-0000000f3502', v_r1, true, CURRENT_DATE),
    ('00000000-0000-0000-0000-0000000f3543', v_ali, 'suitable', 'No conduct concerns.',
     '00000000-0000-0000-0000-0000000f3503', v_r2, true, CURRENT_DATE),
    -- Single regulator
    ('00000000-0000-0000-0000-0000000f3544', v_one, 'suitable', 'Sole regulator determination.',
     '00000000-0000-0000-0000-0000000f3502', v_r1, true, CURRENT_DATE);
END$$;

SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f3501","role":"authenticated"}';

CREATE TEMP TABLE dis AS
  SELECT * FROM public.fp_regulator_positions('00000000-0000-0000-0000-0000000f3520');
CREATE TEMP TABLE ali AS
  SELECT * FROM public.fp_regulator_positions('00000000-0000-0000-0000-0000000f3521');
CREATE TEMP TABLE one AS
  SELECT * FROM public.fp_regulator_positions('00000000-0000-0000-0000-0000000f3522');

-- Independence ---------------------------------------------------------------
SELECT is((SELECT count(*)::int FROM dis), 2, 'each regulator keeps its own position row');
SELECT is((SELECT count(DISTINCT regulator_id)::int FROM dis), 2,
  'the two positions belong to two different regulators');
SELECT is((SELECT outcome FROM dis WHERE regulator_id='00000000-0000-0000-0000-0000000f3510'),
  'suitable', 'the prudential position is preserved verbatim');
SELECT is((SELECT outcome FROM dis WHERE regulator_id='00000000-0000-0000-0000-0000000f3511'),
  'unsuitable', 'the conduct position is preserved verbatim');
SELECT ok((SELECT rationale LIKE '%prudential authority%' FROM dis
            WHERE regulator_id='00000000-0000-0000-0000-0000000f3510'),
  'each position carries its own rationale');
SELECT is((SELECT determined_by FROM dis WHERE regulator_id='00000000-0000-0000-0000-0000000f3511'),
  '00000000-0000-0000-0000-0000000f3503'::uuid, 'each position carries its own actor');
SELECT ok((SELECT bool_and(determined_at IS NOT NULL) FROM dis),
  'each position carries its own decision timestamp');
SELECT ok((SELECT bool_and(effective_from IS NOT NULL) FROM dis),
  'each position carries its own effective date');
SELECT ok((SELECT bool_and(condition_count IS NOT NULL) FROM dis),
  'each position reports its own condition count');

-- Coordination states --------------------------------------------------------
SELECT is((SELECT DISTINCT coordination_state FROM dis), 'DISAGREEMENT',
  'divergent outcomes are reported as DISAGREEMENT');
SELECT is((SELECT DISTINCT coordination_state FROM ali), 'ALIGNED',
  'identical outcomes are reported as ALIGNED');
SELECT is((SELECT DISTINCT coordination_state FROM one), 'SINGLE_REGULATOR',
  'a lone determination is reported as SINGLE_REGULATOR');

-- No merged verdict ----------------------------------------------------------
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='fp_determinations'
       AND column_name IN ('merged_outcome','combined_outcome','final_outcome')),
  'no collapsed cross-regulator verdict column exists on determinations');

SELECT is(
  (SELECT count(*)::int FROM public.fp_determinations
    WHERE individual_id='00000000-0000-0000-0000-0000000f3520' AND is_current),
  2, 'the disagreement leaves both current determinations standing');

ROLLBACK;
