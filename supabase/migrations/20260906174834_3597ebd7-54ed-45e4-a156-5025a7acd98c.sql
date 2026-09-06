DO $mig$
DECLARE
  v text := pg_get_viewdef('public.supervisory_management_assurance_matter'::regclass, true);
  old_nd text := 'WHEN d.is_reviewed AND d.disposition IS NULL AND NOT d.action_is_open THEN ''REVIEWED_NO_DISPOSITION''::text';
  new_nd text := 'WHEN d.is_reviewed AND NOT d.action_is_open AND (d.disposition IS NULL OR NOT public.supervisory_assurance_disposition_is_traceable(d.signal_id, d.disposition, d.disposition_module, d.disposition_record_id, d.disposition_reference)) THEN ''REVIEWED_NO_DISPOSITION''::text';
  old_tr text := 'WHEN d.source_table IS NULL OR d.source_id IS NULL OR (d.disposition = ANY (ARRAY[''ACTION_OPENED''::text, ''REASSESSMENT_REQUIRED''::text, ''COVERED_BY_EXISTING_ACTION''::text])) AND d.disposition_record_id IS NULL OR d.policy_id IS NULL THEN ''MISSING_TRACEABILITY''::text';
  new_tr text := 'WHEN d.source_table IS NULL OR d.source_id IS NULL OR d.policy_id IS NULL OR (d.disposition IS NOT NULL AND NOT public.supervisory_assurance_disposition_is_traceable(d.signal_id, d.disposition, d.disposition_module, d.disposition_record_id, d.disposition_reference)) THEN ''MISSING_TRACEABILITY''::text';
BEGIN
  IF position(old_nd in v) = 0 THEN
    RAISE EXCEPTION 'OS-02F1: REVIEWED_NO_DISPOSITION expression not found in view definition';
  END IF;
  IF position(old_tr in v) = 0 THEN
    RAISE EXCEPTION 'OS-02F1: MISSING_TRACEABILITY expression not found in view definition';
  END IF;

  v := replace(v, old_nd, new_nd);
  v := replace(v, old_tr, new_tr);

  EXECUTE 'CREATE OR REPLACE VIEW public.supervisory_management_assurance_matter '
       || 'WITH (security_invoker = true) AS ' || rtrim(rtrim(v), ';');
END $mig$;