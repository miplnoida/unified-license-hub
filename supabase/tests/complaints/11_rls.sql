-- Baseline RLS smoke: anon cannot read complaints; policies enabled on core tables.
BEGIN;
SELECT plan(5);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.complaints'::regclass),
  'RLS enabled on complaints'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.complaint_evidence'::regclass),
  'RLS enabled on complaint_evidence'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.complaint_duplicate_pairs'::regclass),
  'RLS enabled on complaint_duplicate_pairs'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.complaint_escalation_cases'::regclass),
  'RLS enabled on complaint_escalation_cases'
);

SET LOCAL role anon;
SELECT is(
  (SELECT count(*)::int FROM public.complaints),
  0,
  'anon cannot read complaints rows'
);
RESET role;

SELECT * FROM finish();
ROLLBACK;
