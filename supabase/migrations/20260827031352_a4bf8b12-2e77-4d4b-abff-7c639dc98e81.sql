-- MC-12: shrink the anonymous execution surface.
-- Anonymous callers keep EXECUTE only on (a) the deliberate public surface and
-- (b) helpers that are referenced by an RLS policy expression (policies are
-- evaluated as the querying role, so those grants are load-bearing).
DO $mc12$
DECLARE
  r record;
  v_public text[] := ARRAY[
    'get_active_captcha','verify_captcha_token','get_declaration_invitation_public',
    'get_fp_declaration_form_public','submit_declaration_form','verify_declaration_identity',
    'public_registry_search','complaint_track_lookup','complaint_public_intake_config_get'
  ];
  v_policy_refs text[];
  v_count int := 0;
BEGIN
  SELECT array_agg(DISTINCT p.proname) INTO v_policy_refs
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND EXISTS (
      SELECT 1 FROM pg_policies pol
      WHERE (COALESCE(pol.qual,'') || ' ' || COALESCE(pol.with_check,'')) ~ ('\m' || p.proname || '\M')
    );

  FOR r IN
    SELECT DISTINCT p.oid,
           format('public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid)) AS sig,
           p.proname
    FROM pg_proc p, aclexplode(p.proacl) a
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prosecdef
      AND a.privilege_type = 'EXECUTE'
      AND a.grantee::regrole::text IN ('anon','PUBLIC','public')
      AND NOT (p.proname = ANY(v_public))
      AND NOT (p.proname = ANY(COALESCE(v_policy_refs, ARRAY[]::text[])))
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, PUBLIC', r.sig);
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'MC-12: revoked anonymous EXECUTE on % SECURITY DEFINER functions', v_count;
END
$mc12$;