
DO $$
DECLARE f record; v_sig text;
BEGIN
  FOR f IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('wb_require','wb_membership_capability','form_save_draft','publish_form_version',
         'retire_form_definition','branch_form_version','resolve_applicable_form_package',
         'application_pin_form_requirements','entity_change_set_create','entity_change_set_transition',
         'apply_entity_change_set','regulatory_request_start','regulatory_request_transition',
         'regulatory_request_available_types','fp_link_persons_deterministic',
         'person_upsert_for_appointment','wave_b_integrity_report',
         'form_version_immutable_guard','form_fields_immutable_guard')
  LOOP
    v_sig := format('public.%I(%s)', f.proname, f.args);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_sig);
    IF f.proname NOT LIKE '%_guard' THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_sig);
    END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_sig);
  END LOOP;
END $$;
