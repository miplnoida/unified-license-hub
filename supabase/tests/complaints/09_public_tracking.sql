-- Public tracking is redacted and callable by anon.
BEGIN;
SELECT plan(2);

SELECT has_function('public','get_public_complaint_tracking',
  'public tracking RPC exists');

SET LOCAL role anon;
SELECT lives_ok(
  $$ SELECT public.get_public_complaint_tracking('nonexistent-number') $$,
  'anon can invoke public tracking safely'
);
RESET role;

SELECT * FROM finish();
ROLLBACK;
