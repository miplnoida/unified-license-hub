-- AML-08 defect correction (found by scripts/verify-aml-supervisory-consequence-linkage.sql):
-- supervisory_consequence_record and supervisory_consequence_withdraw invoked
-- public.log_compliance_audit(...) passing NULL::inet for the _ip_address
-- argument, whose canonical type is text. No overload matched, so recording and
-- withdrawing a consequence aborted with 'function ... does not exist'.
--
-- Only the argument cast changes; the audited action, object, before/after
-- values, justification and lineage metadata are unchanged.
DO $$
DECLARE _fn text; _def text;
BEGIN
  FOREACH _fn IN ARRAY ARRAY['supervisory_consequence_record','supervisory_consequence_withdraw'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO _def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = _fn;

    IF _def IS NULL THEN
      RAISE EXCEPTION 'AML-08: %(...) is missing', _fn;
    END IF;

    IF position('NULL::inet' IN _def) > 0 THEN
      EXECUTE replace(_def, 'NULL::inet', 'NULL::text');
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname LIKE 'supervisory_consequence%'
       AND pg_get_functiondef(p.oid) LIKE '%NULL::inet%'
  ) THEN
    RAISE EXCEPTION 'AML-08: a consequence function still passes an inet to the audit logger';
  END IF;
END $$;