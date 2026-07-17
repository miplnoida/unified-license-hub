-- Duplicate management RPCs must exist and require permissions.
BEGIN;
SELECT plan(4);

SELECT has_function('public','confirm_complaint_duplicate', ARRAY['uuid','uuid','text'],
  'confirm_complaint_duplicate exists');
SELECT has_function('public','dismiss_complaint_duplicate', ARRAY['uuid','text'],
  'dismiss_complaint_duplicate exists');

SELECT has_column('public','complaints','parent_complaint_id','parent_complaint_id link exists');

-- Anonymous role must not be allowed to call confirm.
SET LOCAL role anon;
SELECT throws_ok(
  $$ SELECT public.confirm_complaint_duplicate(gen_random_uuid(), gen_random_uuid(), NULL) $$,
  NULL, NULL,
  'anon cannot call confirm_complaint_duplicate'
);
RESET role;

SELECT * FROM finish();
ROLLBACK;
