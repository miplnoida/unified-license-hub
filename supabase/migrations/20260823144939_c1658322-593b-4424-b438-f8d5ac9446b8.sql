-- Canonicalise the enforcement obligation vocabulary inside enforcement_case_action:
-- RECORD_OBLIGATION must create obligations as 'outstanding', and the CLOSE gate must
-- accept the canonical discharged statuses ('complied','waived'). Patched in place so
-- the rest of the deployed function body is preserved byte-for-byte.
DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'enforcement_case_action';

  IF d IS NULL THEN
    RAISE EXCEPTION 'enforcement_case_action not found';
  END IF;

  d := replace(d,
    'nullif(_payload->>''deadline'','''')::date, ''pending'', v_uid)',
    'nullif(_payload->>''deadline'','''')::date, ''outstanding'', v_uid)');
  d := replace(d,
    'o.status NOT IN (''completed'',''waived'',''closed'')',
    'o.status NOT IN (''complied'',''waived'')');

  IF d LIKE '%''pending'', v_uid)%' OR d LIKE '%''completed'',''waived'',''closed''%' THEN
    RAISE EXCEPTION 'obligation status patch did not apply';
  END IF;

  EXECUTE d;
END $$;