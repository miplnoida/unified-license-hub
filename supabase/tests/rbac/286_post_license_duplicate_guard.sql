-- Post-licence duplicate-request protection: same licence + same service +
-- open request => blocked, server-side, on every write path.
BEGIN;
SELECT plan(19);

SELECT has_function('public', 'post_license_open_statuses', ARRAY[]::text[],
  'post_license_open_statuses() exists');

SELECT has_function('public', 'prevent_duplicate_post_license_request', ARRAY[]::text[],
  'prevent_duplicate_post_license_request() exists');

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger t
     WHERE t.tgrelid = 'public.applications'::regclass
       AND t.tgname = 'trg_prevent_duplicate_post_license_request'
       AND NOT t.tgisinternal
  ),
  'duplicate guard trigger is attached to public.applications'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname = 'applications_post_license_open_uniq'
  ),
  'partial unique index guards concurrent open duplicates'
);

-- Snapshot of pre-existing demo data must stay untouched.
CREATE TEMP TABLE _apps_before AS
  SELECT id, status, data FROM public.applications;

-- Direct backend insert of a post-licence row (bypasses all frontend logic).
CREATE OR REPLACE FUNCTION pg_temp.mk(
  _license text, _service text, _status text DEFAULT 'draft'
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.applications (applicant_id, license_type, status, data)
  VALUES (
    (SELECT applicant_id FROM public.applications
      WHERE applicant_id IS NOT NULL ORDER BY created_at LIMIT 1),
    'PLS Test',
    _status,
    jsonb_build_object('type','post_license','license_id',_license,'service_id',_service)
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Test 1 / 4 / 10: open draft blocks a second direct backend insert.
SELECT lives_ok(
  $$SELECT pg_temp.mk('0a000000-0000-0000-0000-000000000001','0c000000-0000-0000-0000-000000000001','draft')$$,
  'first open post-licence request is accepted'
);

SELECT throws_ok(
  $$SELECT pg_temp.mk('0a000000-0000-0000-0000-000000000001','0c000000-0000-0000-0000-000000000001','draft')$$,
  '23505', NULL,
  'same licence + same service + open draft is blocked (direct backend bypass)'
);

-- Test 2: same licence, different service is allowed.
SELECT lives_ok(
  $$SELECT pg_temp.mk('0a000000-0000-0000-0000-000000000001','0c000000-0000-0000-0000-000000000002','draft')$$,
  'same licence + different service is allowed'
);

-- Test 3 / 12: different licence, same service is allowed (PPOC multi-entity).
SELECT lives_ok(
  $$SELECT pg_temp.mk('0b000000-0000-0000-0000-000000000001','0c000000-0000-0000-0000-000000000001','draft')$$,
  'different licence + same service is allowed (PPOC across licences)'
);

-- Test 5: an existing submitted request blocks a new one.
SELECT lives_ok(
  $$SELECT pg_temp.mk('0a000000-0000-0000-0000-000000000001','0c000000-0000-0000-0000-000000000003','submitted')$$,
  'submitted post-licence request is accepted'
);
SELECT throws_ok(
  $$SELECT pg_temp.mk('0a000000-0000-0000-0000-000000000001','0c000000-0000-0000-0000-000000000003','draft')$$,
  '23505', NULL,
  'existing submitted request blocks a new request'
);

-- Test 6: an existing query/RFI request blocks a new one.
SELECT lives_ok(
  $$SELECT pg_temp.mk('0a000000-0000-0000-0000-000000000001','0c000000-0000-0000-0000-000000000004','query_raised')$$,
  'query/RFI post-licence request is accepted'
);
SELECT throws_ok(
  $$SELECT pg_temp.mk('0a000000-0000-0000-0000-000000000001','0c000000-0000-0000-0000-000000000004','draft')$$,
  '23505', NULL,
  'existing query/RFI request blocks a new request'
);

-- Test 7: approved history does not block.
SELECT lives_ok(
  $$SELECT pg_temp.mk('0a000000-0000-0000-0000-000000000001','0c000000-0000-0000-0000-000000000005','approved');
    SELECT pg_temp.mk('0a000000-0000-0000-0000-000000000001','0c000000-0000-0000-0000-000000000005','draft')$$,
  'approved history allows a new request'
);

-- Test 8: rejected history does not block.
SELECT lives_ok(
  $$SELECT pg_temp.mk('0a000000-0000-0000-0000-000000000001','0c000000-0000-0000-0000-000000000006','rejected');
    SELECT pg_temp.mk('0a000000-0000-0000-0000-000000000001','0c000000-0000-0000-0000-000000000006','draft')$$,
  'rejected history allows a new request'
);

-- Test 9: cancelled / withdrawn history does not block.
SELECT lives_ok(
  $$SELECT pg_temp.mk('0a000000-0000-0000-0000-000000000001','0c000000-0000-0000-0000-000000000007','cancelled');
    SELECT pg_temp.mk('0a000000-0000-0000-0000-000000000001','0c000000-0000-0000-0000-000000000007','draft')$$,
  'cancelled history allows a new request'
);
SELECT lives_ok(
  $$SELECT pg_temp.mk('0a000000-0000-0000-0000-000000000001','0c000000-0000-0000-0000-000000000008','withdrawn');
    SELECT pg_temp.mk('0a000000-0000-0000-0000-000000000001','0c000000-0000-0000-0000-000000000008','draft')$$,
  'withdrawn history allows a new request'
);

-- Legacy safety: rows without license_id/service_id are unaffected.
SELECT lives_ok(
  $$INSERT INTO public.applications (applicant_id, license_type, status, data)
    VALUES ((SELECT applicant_id FROM public.applications
              WHERE applicant_id IS NOT NULL ORDER BY created_at LIMIT 1),
            'Legacy','draft', jsonb_build_object('type','post_license'));
    INSERT INTO public.applications (applicant_id, license_type, status, data)
    VALUES ((SELECT applicant_id FROM public.applications
              WHERE applicant_id IS NOT NULL ORDER BY created_at LIMIT 1),
            'Legacy 2','draft', jsonb_build_object('type','post_license'))$$,
  'legacy post-licence rows without licence/service keys are unaffected'
);

-- Pre-licence rows remain unaffected by this guard.
SELECT lives_ok(
  $$INSERT INTO public.applications (applicant_id, license_type, status, data)
    VALUES ((SELECT applicant_id FROM public.applications
              WHERE applicant_id IS NOT NULL ORDER BY created_at LIMIT 1),
            'Pre-licence','draft', '{}'::jsonb)$$,
  'pre-licence duplicate behaviour is untouched'
);

-- Regression: pre-existing demo rows unchanged.
SELECT is_empty(
  $$SELECT b.id FROM _apps_before b
      JOIN public.applications a ON a.id = b.id
     WHERE a.status IS DISTINCT FROM b.status OR a.data IS DISTINCT FROM b.data$$,
  'pre-existing application rows are unchanged'
);

SELECT * FROM finish();
ROLLBACK;
