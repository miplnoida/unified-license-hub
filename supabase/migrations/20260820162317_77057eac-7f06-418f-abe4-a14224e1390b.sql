
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN (
        'conduct_require','conduct_alert_acknowledge','conduct_alert_close',
        'conduct_investigation_open','conduct_investigation_update',
        'conduct_action_issue','conduct_action_close',
        'conduct_evidence_upload','conduct_evidence_set_restriction',
        'complaint_task_create','complaint_task_set_status',
        'enforcement_action_create','enforcement_action_update','enforcement_action_delete',
        'enforcement_obligation_add','enforcement_obligation_set_status'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;

  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN (
        'conduct_alert_acknowledge','conduct_alert_close',
        'conduct_investigation_open','conduct_investigation_update',
        'conduct_action_issue','conduct_action_close',
        'conduct_evidence_upload','conduct_evidence_set_restriction',
        'complaint_task_create','complaint_task_set_status',
        'enforcement_action_create','enforcement_action_update','enforcement_action_delete',
        'enforcement_obligation_add','enforcement_obligation_set_status'
      )
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $$;
