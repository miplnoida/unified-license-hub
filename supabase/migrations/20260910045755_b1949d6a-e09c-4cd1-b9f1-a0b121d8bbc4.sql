-- AML-08 defect correction (found by scripts/verify-aml-supervisory-consequence-linkage.sql):
-- supervisory_consequence_record resolved the supervised entity's regulator via
-- public.licensees.regulator_id, which does not exist; the canonical column is
-- lead_regulator_id. Every consequence record attempt therefore aborted with
-- 'column l.regulator_id does not exist'.
--
-- The correction rewrites only that column reference, leaving the rest of the
-- governed operation (permission checks, prerequisites, idempotency, lineage,
-- delegation to canonical downstream operations) byte-identical.
DO $$
DECLARE _def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'supervisory_consequence_record';

  IF _def IS NULL THEN
    RAISE EXCEPTION 'supervisory_consequence_record is missing';
  END IF;

  IF position('l.regulator_id' IN _def) = 0 THEN
    RAISE NOTICE 'AML-08: the regulator column reference is already correct';
    RETURN;
  END IF;

  EXECUTE replace(_def, 'l.regulator_id', 'l.lead_regulator_id');
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname LIKE 'supervisory_consequence%'
       AND pg_get_functiondef(p.oid) LIKE '%l.regulator_id%'
  ) THEN
    RAISE EXCEPTION 'AML-08: a consequence function still references licensees.regulator_id';
  END IF;
END $$;