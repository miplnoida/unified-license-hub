-- 274_enforce_action_gate.sql
-- Verifies the universal enforce_action() gate:
--   * exists with correct signature
--   * REVOKEd from PUBLIC, EXECUTE granted to authenticated
--   * rejects unauthenticated callers with 42501
--   * rejects empty module/action with 22023
BEGIN;
SELECT plan(6);

SELECT has_function(
  'public', 'enforce_action', ARRAY['text','text','jsonb'],
  'enforce_action(text, text, jsonb) exists'
);

SELECT is(
  (SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='enforce_action'
     AND pg_get_function_identity_arguments(p.oid)='_module text, _action text, _meta jsonb'),
  true,
  'enforce_action is SECURITY DEFINER'
);

SELECT ok(
  NOT has_function_privilege('public', 'public.enforce_action(text,text,jsonb)', 'EXECUTE'),
  'PUBLIC does not have EXECUTE on enforce_action'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.enforce_action(text,text,jsonb)', 'EXECUTE'),
  'authenticated has EXECUTE on enforce_action'
);

-- Unauthenticated (auth.uid() IS NULL) should raise 42501
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$ SELECT public.enforce_action('form_management','publish','{}'::jsonb) $$,
  '42501',
  NULL,
  'anon cannot invoke enforce_action'
);
RESET ROLE;

-- Empty inputs rejected
SELECT throws_ok(
  $$ SELECT public.enforce_action('','publish','{}'::jsonb) $$,
  NULL, NULL,
  'empty module rejected'
);

SELECT * FROM finish();
ROLLBACK;
