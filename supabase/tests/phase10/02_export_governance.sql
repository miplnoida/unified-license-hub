-- ============================================================
-- PHASE 10 / TEST 02 — EXPORT GOVERNANCE
-- Proves justification enforcement, retention stamping, the
-- download register, and access boundaries.
-- ============================================================
BEGIN;
SELECT plan(18);

-- ---------- structure ----------
SELECT has_table('public', 'audit_export_downloads', 'download register table exists');
SELECT has_column('public', 'audit_export_jobs', 'justification', 'exports record a justification');
SELECT has_column('public', 'audit_export_jobs', 'retention_expires_at', 'exports carry a retention expiry');
SELECT has_column('public', 'audit_export_jobs', 'download_count', 'exports track download counts');
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.audit_export_downloads'::regclass),
  'RLS is enabled on the download register');
SELECT has_function('public', 'request_export_job',
  ARRAY['text','text','timestamptz','timestamptz','text','text','jsonb','integer','text','text','integer'],
  'governed export creation RPC exists');
SELECT has_function('public', 'log_export_download', ARRAY['uuid'], 'download logging RPC exists');
SELECT has_function('public', 'purge_expired_audit_exports', ARRAY[]::text[], 'retention purge routine exists');

-- ---------- fixtures ----------
CREATE TEMP TABLE _p10e AS
SELECT gen_random_uuid() AS officer_id,
       gen_random_uuid() AS stranger_id;

INSERT INTO auth.users (id, email)
SELECT officer_id, 'p10-officer@test.local' FROM _p10e
UNION ALL SELECT stranger_id, 'p10-outsider@test.local' FROM _p10e;

-- ---------- justification enforcement ----------
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT officer_id::text FROM _p10e), 'role', 'authenticated')::text, true);

SELECT throws_ok(
  $$SELECT public.request_export_job('audit_logs', 'too short')$$,
  NULL, NULL, 'export is refused when the justification is shorter than 10 characters');

SELECT throws_ok(
  $$SELECT public.request_export_job('audit_logs', NULL)$$,
  NULL, NULL, 'export is refused when no justification is supplied');

SELECT throws_ok(
  $$SELECT public.request_export_job('', 'Regulatory request OLRAS-2026-01')$$,
  NULL, NULL, 'export is refused when the source is blank');

CREATE TEMP TABLE _job AS
SELECT public.request_export_job(
  'audit_logs', 'Regulatory examination request OLRAS-2026-01',
  NULL, NULL, 'applications', 'csv', '{"status":"approved"}'::jsonb, 42, NULL, NULL, 30
) AS id;

SELECT isnt((SELECT id FROM _job), NULL, 'a valid export request is accepted');

RESET role;
SELECT is(
  (SELECT status FROM public.audit_export_jobs WHERE id = (SELECT id FROM _job)),
  'completed', 'a request supplying a row count is recorded as completed');
SELECT is(
  (SELECT justification FROM public.audit_export_jobs WHERE id = (SELECT id FROM _job)),
  'Regulatory examination request OLRAS-2026-01', 'justification is persisted verbatim');
SELECT ok(
  (SELECT retention_expires_at::date FROM public.audit_export_jobs WHERE id = (SELECT id FROM _job))
    = (now() + interval '30 days')::date,
  'retention expiry is stamped from the requested retention window');

-- ---------- download register ----------
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT officer_id::text FROM _p10e), 'role', 'authenticated')::text, true);
SELECT isnt((SELECT public.log_export_download((SELECT id FROM _job))), NULL,
  'the requester can log a download of their own export');
RESET role;

SELECT is(
  (SELECT download_count FROM public.audit_export_jobs WHERE id = (SELECT id FROM _job)),
  1, 'download count is incremented on access');
SELECT is(
  (SELECT count(*)::int FROM public.audit_export_downloads WHERE job_id = (SELECT id FROM _job)),
  1, 'the download register has one row for the access');

SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT stranger_id::text FROM _p10e), 'role', 'authenticated')::text, true);
SELECT throws_ok(
  format('SELECT public.log_export_download(%L)', (SELECT id FROM _job)),
  NULL, NULL, 'an unrelated user cannot register a download against someone else''s export');
SELECT is(
  (SELECT count(*)::int FROM public.audit_export_downloads WHERE job_id = (SELECT id FROM _job)),
  0, 'the unrelated user cannot even see the download register rows of another export');
RESET role;

-- ---------- retention purge ----------
UPDATE public.audit_export_jobs
   SET retention_expires_at = now() - interval '1 day'
 WHERE id = (SELECT id FROM _job);
SELECT ok(public.purge_expired_audit_exports() >= 1, 'purge removes expired export records');
SELECT is(
  (SELECT count(*)::int FROM public.audit_export_jobs WHERE id = (SELECT id FROM _job)),
  0, 'the expired export record is gone after purge');

SELECT * FROM finish();
ROLLBACK;
