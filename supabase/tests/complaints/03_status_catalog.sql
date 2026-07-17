-- Verifies status catalogue integrity: FK constraint and invalid-status rejection.
BEGIN;
SELECT plan(4);

SELECT has_table('public', 'complaint_status_catalogue', 'catalogue exists');

SELECT ok(
  EXISTS(
    SELECT 1 FROM pg_constraint
    WHERE conname = 'complaints_status_fkey'
      AND conrelid = 'public.complaints'::regclass
  ),
  'complaints.status has FK to catalogue'
);

SELECT bag_eq(
  $$ SELECT code FROM public.complaint_status_catalogue $$,
  $$ VALUES ('submitted'),('under_investigation'),('resolved'),('closed'),('rejected'),('duplicate') $$,
  'catalogue contains the six canonical statuses'
);

SELECT throws_ok(
  $$ UPDATE public.complaints SET status = 'not_a_real_status' WHERE id = (SELECT id FROM public.complaints LIMIT 1) $$,
  '23503',
  NULL,
  'invalid status is rejected by FK'
);

SELECT * FROM finish();
ROLLBACK;
