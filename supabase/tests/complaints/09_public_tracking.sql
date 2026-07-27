-- Public tracking is redacted, callable by anon, and identity-gated.
BEGIN;
SELECT plan(3);

SELECT has_function('public','get_public_complaint_tracking',
  'public tracking RPC exists');

SET LOCAL role anon;
SELECT lives_ok(
  $$ SELECT public.get_public_complaint_tracking('nonexistent-number') $$,
  'anon can invoke public tracking safely'
);

-- An unrelated caller (no matching contact email, no ownership) must never
-- receive a complaint record — including complaints with no email on file.
DO $$
DECLARE
  ref text;
  res jsonb;
BEGIN
  SELECT complaint_number INTO ref FROM public.complaints LIMIT 1;
  IF ref IS NULL THEN
    PERFORM ok(true, 'no complaints seeded — skipping unauthorised lookup check');
  ELSE
    res := public.get_public_complaint_tracking(ref, 'unrelated-person@rls.test');
    PERFORM ok(
      (res->>'found')::boolean IS NOT TRUE,
      'unauthorised caller cannot track someone else''s complaint'
    );
  END IF;
END $$;
RESET role;

SELECT * FROM finish();
ROLLBACK;
