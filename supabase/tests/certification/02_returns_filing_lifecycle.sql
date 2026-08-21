-- EPR-01 — P06 Regulatory Returns canonical lifecycle certification.
--
-- Exercises ONE complete case through the governed RPCs only:
--   v1 draft → validate → submit → regulator review (correction requested)
--   → v2 draft → resubmit → accepted
-- and asserts that version provenance, immutability and the canonical
-- workflow read model stay consistent at every hop.
BEGIN;
SELECT plan(14);

-- ---------------------------------------------------------------- fixtures
CREATE TEMP TABLE ctx AS
SELECT
  (SELECT id FROM public.return_filings WHERE status = 'DRAFT' ORDER BY created_at LIMIT 1) AS filing_id,
  (SELECT user_id FROM public.user_roles WHERE role IN ('super_admin','admin') ORDER BY user_id LIMIT 1) AS regulator_id;

UPDATE ctx SET filing_id = filing_id; -- no-op, keeps plan stable when empty

SELECT isnt((SELECT filing_id FROM ctx), NULL, 'a DRAFT canonical filing exists to exercise');
SELECT isnt((SELECT regulator_id FROM ctx), NULL, 'an internal regulator user exists to review');

-- filer identity = an entity user attached to the filing's entity
CREATE TEMP TABLE actors AS
SELECT
  c.filing_id,
  c.regulator_id,
  f.entity_id,
  (SELECT eum.user_id FROM public.entity_user_memberships eum
    WHERE eum.entity_id = f.entity_id AND eum.status = 'active'
    ORDER BY eum.created_at LIMIT 1) AS filer_id
FROM ctx c JOIN public.return_filings f ON f.id = c.filing_id;

-- ------------------------------------------------- v1: validate and submit
CREATE TEMP TABLE v1 AS
SELECT (SELECT id FROM public.return_filing_versions v
         WHERE v.return_filing_id = (SELECT filing_id FROM actors)
         ORDER BY v.version_number DESC LIMIT 1) AS version_id;

SELECT is((SELECT status FROM public.return_filing_versions WHERE id = (SELECT version_id FROM v1)),
          'DRAFT', 'v1 starts in DRAFT');

SELECT is((SELECT is_immutable FROM public.return_filing_versions WHERE id = (SELECT version_id FROM v1)),
          false, 'v1 is mutable while in DRAFT');

-- act as the filer
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT filer_id FROM actors), 'role', 'authenticated')::text, true);

SELECT lives_ok(
  format('SELECT public.returns_validate_filing(%L::uuid)', (SELECT version_id FROM v1)),
  'filer can validate v1 through the governed RPC');

SELECT lives_ok(
  format('SELECT public.returns_submit_filing(%L::uuid, true)', (SELECT version_id FROM v1)),
  'filer can submit v1 through the governed RPC');

RESET ROLE;

SELECT is((SELECT status FROM public.return_filings WHERE id = (SELECT filing_id FROM actors)),
          'SUBMITTED', 'filing moves to SUBMITTED after v1 submit');

SELECT is((SELECT is_immutable FROM public.return_filing_versions WHERE id = (SELECT version_id FROM v1)),
          true, 'v1 becomes immutable on submission');

-- ------------------------------------ regulator review: request correction
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT regulator_id FROM actors), 'role', 'authenticated')::text, true);

SELECT lives_ok(
  format('SELECT public.returns_review_filing(%L::uuid, %L, %L)',
         (SELECT version_id FROM v1), 'REQUEST_CORRECTION', 'EPR-01 lifecycle certification'),
  'regulator can request a correction through the governed RPC');

RESET ROLE;

SELECT is((SELECT status FROM public.return_filings WHERE id = (SELECT filing_id FROM actors)),
          'CORRECTION_REQUESTED', 'filing moves to CORRECTION_REQUESTED');

CREATE TEMP TABLE v2 AS
SELECT (SELECT id FROM public.return_filing_versions v
         WHERE v.return_filing_id = (SELECT filing_id FROM actors)
         ORDER BY v.version_number DESC LIMIT 1) AS version_id;

SELECT isnt((SELECT version_id FROM v2), (SELECT version_id FROM v1),
            'a new editable version (v2) is created for the correction');

SELECT is((SELECT version_number FROM public.return_filing_versions WHERE id = (SELECT version_id FROM v2)),
          2, 'the correction version is numbered v2');

-- ---------------------------------------------------- v2: resubmit, accept
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT filer_id FROM actors), 'role', 'authenticated')::text, true);

SELECT lives_ok(
  format('SELECT public.returns_submit_filing(%L::uuid, true)', (SELECT version_id FROM v2)),
  'filer can resubmit the corrected version');

SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT regulator_id FROM actors), 'role', 'authenticated')::text, true);

SELECT lives_ok(
  format('SELECT public.returns_review_filing(%L::uuid, %L, %L)',
         (SELECT version_id FROM v2), 'ACCEPT', 'EPR-01 lifecycle certification'),
  'regulator can accept the corrected version');

RESET ROLE;

SELECT is((SELECT status FROM public.return_filings WHERE id = (SELECT filing_id FROM actors)),
          'ACCEPTED', 'filing closes as ACCEPTED after the v2 acceptance');

ROLLBACK;
