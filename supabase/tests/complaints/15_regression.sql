-- Regression guard: existing complaint statuses are all catalogue-valid.
BEGIN;
SELECT plan(1);
SELECT is(
  (SELECT count(*)::int FROM public.complaints c
    WHERE NOT EXISTS (SELECT 1 FROM public.complaint_status_catalogue s WHERE s.code = c.status)),
  0,
  'every complaint row has a catalogue-valid status'
);
SELECT * FROM finish();
ROLLBACK;
