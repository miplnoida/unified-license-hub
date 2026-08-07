-- Phase 2 / PRU-ASS-001 — CAMELS assessment lifecycle, finalisation gate,
-- immutability and override evidence.

BEGIN;
SELECT plan(27);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000d2001', 'p2-camels-super@test')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role)
  VALUES ('00000000-0000-0000-0000-0000000d2001', 'super_admin') ON CONFLICT DO NOTHING;

DO $$
DECLARE v_sec uuid := '00000000-0000-0000-0000-0000000d2010';
BEGIN
  INSERT INTO public.sectors (id, name) VALUES (v_sec, 'P2 CAMELS Sector') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.licensees (id, name, sector_id)
    VALUES ('00000000-0000-0000-0000-0000000d2011', 'P2 CAMELS Bank', v_sec)
    ON CONFLICT (id) DO UPDATE SET sector_id = EXCLUDED.sector_id;
END$$;

SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000d2001","role":"authenticated"}';

-- ---------------------------------------------------------------------------
-- Component catalogue: the six CAMELS components must be available
-- ---------------------------------------------------------------------------
SELECT is((SELECT COUNT(*)::int FROM public.prudential_assessment_components
            WHERE is_active AND sector_id IS NULL
              AND code IN ('C','A','M','E','L','S')), 6,
          'all six CAMELS components are available as active defaults');

-- ---------------------------------------------------------------------------
-- Draft creation and component ratings
-- ---------------------------------------------------------------------------
INSERT INTO public.prudential_assessments
  (id, entity_id, period_start, period_end, status, created_by)
VALUES ('00000000-0000-0000-0000-0000000d2100', '00000000-0000-0000-0000-0000000d2011',
        DATE '2025-01-01', DATE '2025-03-31', 'draft', '00000000-0000-0000-0000-0000000d2001');

SELECT is((SELECT status FROM public.prudential_assessments
            WHERE id = '00000000-0000-0000-0000-0000000d2100'), 'draft',
          'a new assessment starts in draft');

INSERT INTO public.prudential_assessment_component_ratings
  (assessment_id, component_id, component_code, rating, narrative, evidence, created_by)
SELECT '00000000-0000-0000-0000-0000000d2100', c.id, c.code, '2',
       'Narrative for ' || c.code,
       jsonb_build_object('return_ids', jsonb_build_array('ref-' || c.code)),
       '00000000-0000-0000-0000-0000000d2001'
  FROM public.prudential_assessment_components c
 WHERE c.is_active AND c.sector_id IS NULL AND c.code IN ('C','A','M','E','L');

SELECT is((SELECT COUNT(*)::int FROM public.prudential_assessment_component_ratings
            WHERE assessment_id = '00000000-0000-0000-0000-0000000d2100'), 5,
          'five component ratings persist');
SELECT is((SELECT narrative FROM public.prudential_assessment_component_ratings
            WHERE assessment_id = '00000000-0000-0000-0000-0000000d2100' AND component_code = 'C'),
          'Narrative for C', 'component narrative persists');
SELECT is((SELECT evidence->'return_ids'->>0 FROM public.prudential_assessment_component_ratings
            WHERE assessment_id = '00000000-0000-0000-0000-0000000d2100' AND component_code = 'C'),
          'ref-C', 'component evidence references persist');

-- ---------------------------------------------------------------------------
-- Finalisation gate: 'S' is unrated, so approval must be refused server-side
-- ---------------------------------------------------------------------------
SELECT is(public.prudential_assessment_finalisation_gaps('00000000-0000-0000-0000-0000000d2100'),
          ARRAY['S'], 'the gap function reports the single unrated component S');

SELECT throws_ok(
  $$UPDATE public.prudential_assessments SET status = 'approved'
     WHERE id = '00000000-0000-0000-0000-0000000d2100'$$,
  '23514', NULL, 'finalising with an unrated component is refused server-side');
SELECT is((SELECT status FROM public.prudential_assessments
            WHERE id = '00000000-0000-0000-0000-0000000d2100'), 'draft',
          'no final state is persisted after the refused finalisation');

-- ---------------------------------------------------------------------------
-- Review lifecycle: draft -> submitted -> returned_for_revision -> submitted
--                   -> reviewed -> approved
-- ---------------------------------------------------------------------------
SELECT lives_ok($$UPDATE public.prudential_assessments SET status = 'submitted', submitted_at = now()
                   WHERE id = '00000000-0000-0000-0000-0000000d2100'$$,
                'draft can be submitted for review');
SELECT lives_ok($$UPDATE public.prudential_assessments
                    SET status = 'returned_for_revision', review_notes = 'add liquidity detail'
                   WHERE id = '00000000-0000-0000-0000-0000000d2100'$$,
                'a submitted assessment can be returned for revision');
SELECT is((SELECT review_notes FROM public.prudential_assessments
            WHERE id = '00000000-0000-0000-0000-0000000d2100'), 'add liquidity detail',
          'revision instructions are retained');
SELECT lives_ok($$UPDATE public.prudential_assessment_component_ratings
                    SET narrative = 'Revised liquidity narrative'
                   WHERE assessment_id = '00000000-0000-0000-0000-0000000d2100'
                     AND component_code = 'L'$$,
                'component ratings remain editable while under revision');
SELECT lives_ok($$UPDATE public.prudential_assessments SET status = 'submitted'
                   WHERE id = '00000000-0000-0000-0000-0000000d2100'$$,
                'a revised assessment can be resubmitted');
SELECT lives_ok($$UPDATE public.prudential_assessments SET status = 'reviewed', reviewed_at = now(),
                      reviewed_by = '00000000-0000-0000-0000-0000000d2001'
                   WHERE id = '00000000-0000-0000-0000-0000000d2100'$$,
                'a resubmitted assessment can be reviewed');

-- Close the gap, then finalise.
INSERT INTO public.prudential_assessment_component_ratings
  (assessment_id, component_id, component_code, rating, narrative, created_by)
SELECT '00000000-0000-0000-0000-0000000d2100', c.id, c.code, '3', 'Sensitivity narrative',
       '00000000-0000-0000-0000-0000000d2001'
  FROM public.prudential_assessment_components c
 WHERE c.is_active AND c.sector_id IS NULL AND c.code = 'S';

SELECT is(public.prudential_assessment_finalisation_gaps('00000000-0000-0000-0000-0000000d2100'),
          ARRAY[]::text[], 'no finalisation gaps remain once every component is rated');
SELECT lives_ok($$UPDATE public.prudential_assessments
                    SET status = 'approved', overall_rating = '2', approved_at = now(),
                        approved_by = '00000000-0000-0000-0000-0000000d2001'
                   WHERE id = '00000000-0000-0000-0000-0000000d2100'$$,
                'finalisation succeeds once the requirements are met');
SELECT is((SELECT status FROM public.prudential_assessments
            WHERE id = '00000000-0000-0000-0000-0000000d2100'), 'approved',
          'the approved state is persisted');

-- ---------------------------------------------------------------------------
-- Immutability after finalisation
-- ---------------------------------------------------------------------------
SELECT throws_ok(
  $$UPDATE public.prudential_assessments SET overall_rating = '5'
     WHERE id = '00000000-0000-0000-0000-0000000d2100'$$,
  NULL, NULL, 'a finalised assessment cannot be edited');
SELECT throws_ok(
  $$DELETE FROM public.prudential_assessments WHERE id = '00000000-0000-0000-0000-0000000d2100'$$,
  NULL, NULL, 'a finalised assessment cannot be deleted');
SELECT is((SELECT COUNT(*)::int FROM public.prudential_assessment_component_ratings
            WHERE assessment_id = '00000000-0000-0000-0000-0000000d2100'), 6,
          'the completed assessment history remains reconstructable (6 component ratings)');
SELECT is((SELECT rating FROM public.prudential_assessment_component_ratings
            WHERE assessment_id = '00000000-0000-0000-0000-0000000d2100' AND component_code = 'S'),
          '3', 'finalised component evidence is still readable');

-- ---------------------------------------------------------------------------
-- Override of a system suggestion
-- ---------------------------------------------------------------------------
INSERT INTO public.prudential_assessments
  (id, entity_id, period_start, period_end, status, created_by)
VALUES ('00000000-0000-0000-0000-0000000d2200', '00000000-0000-0000-0000-0000000d2011',
        DATE '2025-04-01', DATE '2025-06-30', 'draft', '00000000-0000-0000-0000-0000000d2001');

SELECT throws_ok(
  $$INSERT INTO public.prudential_assessment_component_ratings
      (assessment_id, component_code, rating, auto_suggested_rating,
       suggestion_source, created_by)
    VALUES ('00000000-0000-0000-0000-0000000d2200', 'C', '2', '4',
            '{"source":"signal_engine"}'::jsonb,
            '00000000-0000-0000-0000-0000000d2001')$$,
  '23514', NULL, 'overriding a system suggestion without justification is refused');

INSERT INTO public.prudential_assessment_component_ratings
  (assessment_id, component_code, rating, auto_suggested_rating, override_justification,
   suggestion_source, created_by)
VALUES ('00000000-0000-0000-0000-0000000d2200', 'C', '2', '4',
        'Capital raise completed after period end',
        '{"source":"signal_engine"}'::jsonb, '00000000-0000-0000-0000-0000000d2001');

SELECT is((SELECT auto_suggested_rating FROM public.prudential_assessment_component_ratings
            WHERE assessment_id = '00000000-0000-0000-0000-0000000d2200' AND component_code = 'C'),
          '4', 'the original system suggestion is retained alongside the override');
SELECT is((SELECT override_justification FROM public.prudential_assessment_component_ratings
            WHERE assessment_id = '00000000-0000-0000-0000-0000000d2200' AND component_code = 'C'),
          'Capital raise completed after period end', 'the justification is retained');
SELECT is((SELECT updated_by FROM public.prudential_assessment_component_ratings
            WHERE assessment_id = '00000000-0000-0000-0000-0000000d2200' AND component_code = 'C'),
          '00000000-0000-0000-0000-0000000d2001'::uuid,
          'the overriding actor is recorded from the session, not the client payload');
SELECT throws_ok(
  $$UPDATE public.prudential_assessment_component_ratings SET auto_suggested_rating = '2'
     WHERE assessment_id = '00000000-0000-0000-0000-0000000d2200' AND component_code = 'C'$$,
  '23514', NULL, 'the original system suggestion cannot be rewritten afterwards');
SELECT lives_ok(
  $$UPDATE public.prudential_assessment_component_ratings
      SET rating = '3', override_justification = 'Revised after supervisory challenge'
     WHERE assessment_id = '00000000-0000-0000-0000-0000000d2200' AND component_code = 'C'$$,
  'a justified override can be revised while the assessment is open');

SELECT * FROM finish();
ROLLBACK;
