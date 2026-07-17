-- Regulator-scoped RPCs must reject cross-regulator parent selection.
BEGIN;
SELECT plan(1);
SELECT ok(
  pg_get_functiondef(oid) LIKE '%regulator_mismatch%'
  FROM pg_proc WHERE proname = 'confirm_complaint_duplicate',
  'confirm_complaint_duplicate enforces regulator match'
);
SELECT * FROM finish();
ROLLBACK;
