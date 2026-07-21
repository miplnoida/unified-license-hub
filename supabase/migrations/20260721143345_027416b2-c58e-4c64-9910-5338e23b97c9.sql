
DO $$
DECLARE
  sig text;
  sigs text[] := ARRAY[
    'public.admin_override_form_version_assignment(uuid, uuid, uuid, text)',
    'public.assign_complaint(uuid, uuid, timestamptz)',
    'public.assign_complaint(uuid, uuid, text, text)',
    'public.assign_primary_user(uuid, uuid)',
    'public.cancel_application(uuid, text)',
    'public.confirm_complaint_duplicate(uuid, uuid, text)',
    'public.decide_escalation_case(uuid, text, text)',
    'public.delete_ppoc_mapping(uuid)',
    'public.dismiss_complaint_duplicate(uuid, text)',
    'public.dismiss_complaint_escalation(uuid, text)',
    'public.escalate_complaint_to_enforcement(uuid, text)',
    'public.evaluate_complaint_escalations(uuid)',
    'public.evaluate_complaint_escalations_v2(uuid)',
    'public.execute_complaint_workflow_action(uuid, text, jsonb, timestamptz)',
    'public.manual_escalate_complaint(uuid, text, text, text, text)'
  ];
BEGIN
  FOREACH sig IN ARRAY sigs LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', sig);
  END LOOP;
END $$;
