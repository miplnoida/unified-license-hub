-- Phase 3 / FP-REG-001..003 — individual registry, role history, duplicate candidates
BEGIN;
SELECT plan(16);

-- Fixtures ------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000f3001', 'p3-reg-super@test'),
  ('00000000-0000-0000-0000-0000000f3002', 'p3-reg-none@test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
  VALUES ('00000000-0000-0000-0000-0000000f3001', 'super_admin')
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  v_sec uuid := '00000000-0000-0000-0000-0000000f3010';
  v_lic uuid := '00000000-0000-0000-0000-0000000f3011';
  v_ind uuid := '00000000-0000-0000-0000-0000000f3020';
  v_dup uuid := '00000000-0000-0000-0000-0000000f3021';
  v_oth uuid := '00000000-0000-0000-0000-0000000f3022';
BEGIN
  INSERT INTO public.sectors (id, name) VALUES (v_sec, 'P3 Registry Sector') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.licensees (id, name, sector_id) VALUES (v_lic, 'P3 Registry Bank', v_sec)
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.fp_individuals (id, full_name, date_of_birth, national_id, status, regulator_id)
  VALUES
    (v_ind, 'Jonathan Alexander Pierce', DATE '1974-03-11', 'P3-NID-0001', 'active', NULL),
    (v_dup, 'Jonathon A. Pierce',        DATE '1974-03-11', 'P3-NID-0002', 'active', NULL),
    (v_oth, 'Marguerite Delacroix',      DATE '1988-09-02', 'P3-NID-0003', 'active', NULL)
  ON CONFLICT (id) DO NOTHING;

  -- One identity, several roles: two current, one historical.
  INSERT INTO public.fp_individual_roles
    (individual_id, licensee_id, role_type, role_title, effective_from, effective_to, is_current)
  VALUES
    (v_ind, v_lic, 'director',       'Non-executive director', DATE '2020-01-01', NULL,               true),
    (v_ind, v_lic, 'senior_manager', 'Chief Risk Officer',     DATE '2023-06-01', NULL,               true),
    (v_ind, v_lic, 'officer',        'Head of Treasury',       DATE '2016-01-01', DATE '2019-12-31', false);
END$$;

SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f3001","role":"authenticated"}';

-- FP-REG-001 / 002 ----------------------------------------------------------
SELECT is(
  (SELECT count(*)::int FROM public.fp_individual_roles
    WHERE individual_id = '00000000-0000-0000-0000-0000000f3020'),
  3, 'one identity carries three role records');

SELECT is(
  (SELECT count(*)::int FROM public.fp_individual_roles
    WHERE individual_id = '00000000-0000-0000-0000-0000000f3020' AND is_current),
  2, 'two roles are current');

SELECT is(
  (SELECT count(*)::int FROM public.fp_individual_roles
    WHERE individual_id = '00000000-0000-0000-0000-0000000f3020'
      AND NOT is_current AND effective_to IS NOT NULL),
  1, 'the historical role keeps its end date rather than being deleted');

SELECT is(
  (SELECT count(DISTINCT individual_id)::int FROM public.fp_individual_roles
    WHERE licensee_id = '00000000-0000-0000-0000-0000000f3011'),
  1, 'roles resolve back to a single person record (no duplicate identity created per role)');

-- FP-REG-003 duplicate candidates -------------------------------------------
SELECT ok(
  EXISTS (SELECT 1 FROM public.fp_find_duplicate_candidates(
            'Jonathan Alexander Pierce', DATE '1974-03-11', 'P3-NID-0002', 20)
          WHERE id = '00000000-0000-0000-0000-0000000f3021'),
  'name-similarity + same DOB + same identifier surfaces the near duplicate');

SELECT ok(
  (SELECT id_match FROM public.fp_find_duplicate_candidates(
      'Zzz Unrelated Name', NULL, 'P3-NID-0001', 20)
    WHERE id = '00000000-0000-0000-0000-0000000f3020'),
  'exact national-id match is reported even when the name does not resemble');

SELECT ok(
  (SELECT dob_match FROM public.fp_find_duplicate_candidates(
      'Jonathon A. Pierce', DATE '1974-03-11', NULL, 20)
    WHERE id = '00000000-0000-0000-0000-0000000f3020'),
  'date-of-birth match is reported independently of the identifier');

SELECT ok(
  (SELECT match_score FROM public.fp_find_duplicate_candidates(
      'Jonathan Alexander Pierce', DATE '1974-03-11', 'P3-NID-0001', 20)
    WHERE id = '00000000-0000-0000-0000-0000000f3020')
  >
  (SELECT match_score FROM public.fp_find_duplicate_candidates(
      'Jonathan Alexander Pierce', DATE '1974-03-11', 'P3-NID-0001', 20)
    WHERE id = '00000000-0000-0000-0000-0000000f3021'),
  'the exact record scores above the near duplicate');

SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.fp_find_duplicate_candidates(
                'Jonathan Alexander Pierce', DATE '1974-03-11', 'P3-NID-0001', 20)
              WHERE id = '00000000-0000-0000-0000-0000000f3022'),
  'an unrelated person is not offered as a duplicate candidate');

SELECT ok(
  (SELECT match_reason FROM public.fp_find_duplicate_candidates(
      'Jonathan Alexander Pierce', DATE '1974-03-11', 'P3-NID-0002', 20)
    WHERE id = '00000000-0000-0000-0000-0000000f3021') LIKE '%same date of birth%',
  'the candidate carries a human-readable match reason');

-- No automatic merge: detection is advisory only.
SELECT is(
  (SELECT count(*)::int FROM public.fp_individuals
    WHERE id IN ('00000000-0000-0000-0000-0000000f3020','00000000-0000-0000-0000-0000000f3021')
      AND status = 'active'),
  2, 'duplicate detection never merges or deactivates a record automatically');

-- FP-REG-001 direct-ID denial ----------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f3002","role":"authenticated"}';

SELECT ok( NOT public.can_read_fp_individual(
             '00000000-0000-0000-0000-0000000f3002',
             '00000000-0000-0000-0000-0000000f3020'),
  'unrelated authenticated user cannot read the individual (helper)');

SELECT is(
  (SELECT count(*)::int FROM public.fp_individuals
    WHERE id = '00000000-0000-0000-0000-0000000f3020'),
  0, 'unrelated authenticated user gets no row by direct id (RLS)');

SELECT is(
  (SELECT count(*)::int FROM public.fp_individual_roles
    WHERE individual_id = '00000000-0000-0000-0000-0000000f3020'),
  0, 'unrelated authenticated user cannot enumerate role history');

SELECT throws_ok(
  $$ UPDATE public.fp_individuals SET full_name = 'tampered'
       WHERE id = '00000000-0000-0000-0000-0000000f3020' RETURNING 1 $$,
  NULL, NULL, 'unrelated authenticated user cannot update the individual');

RESET ROLE;
SELECT is(
  (SELECT full_name FROM public.fp_individuals WHERE id = '00000000-0000-0000-0000-0000000f3020'),
  'Jonathan Alexander Pierce', 'identity name is unchanged after the denied attempt');

ROLLBACK;
