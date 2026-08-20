DO $$
DECLARE
  fn text;
  fname text;
  keep boolean;
  policy_fns text;
BEGIN
  -- All function names referenced inside RLS policy expressions must stay callable
  SELECT string_agg(COALESCE(qual,'') || ' ' || COALESCE(with_check,''), ' ')
    INTO policy_fns FROM pg_policies WHERE schemaname = 'public';

  FOR fn, fname IN
    SELECT p.oid::regprocedure::text, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
    WHERE p.prosecdef
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    keep :=
      fname LIKE 'has\_%' OR fname LIKE 'is\_%' OR fname LIKE 'can\_%'
      OR fname LIKE 'user\_%' OR fname LIKE '%\_perm%'
      OR fname LIKE 'normalize\_%' OR fname LIKE 'classify\_%'
      OR fname LIKE 'get\_public\_%' OR fname LIKE '%\_public'
      OR fname IN (
        'get_active_captcha','get_complaint_tracking','get_public_complaint_tracking',
        'create_complaint','create_complaint_with_attachments','finalize_complaint_with_attachments',
        'check_applicant_name_exists','check_primary_user_email_exists',
        'get_declaration_invitation_public','get_fp_declaration_form_public',
        'verify_declaration_identity','submit_declaration_form','get_user_role'
      )
      OR (policy_fns IS NOT NULL AND position(fname in policy_fns) > 0);

    IF NOT keep THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    END IF;
  END LOOP;
END $$;