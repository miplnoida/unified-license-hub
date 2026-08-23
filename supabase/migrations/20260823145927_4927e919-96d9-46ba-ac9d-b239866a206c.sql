DO $mig$
DECLARE d text; nd text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'resolve_application_form_version';
  IF d IS NULL THEN RAISE EXCEPTION 'function not found'; END IF;

  nd := replace(d, 'v_assignment.fv_status = ''published''', 'v_assignment.fv_status IN (''published'',''archived'')');
  nd := replace(nd, 'v_chosen.status = ''published''', 'v_chosen.status IN (''published'',''archived'')');
  IF nd = d THEN RAISE EXCEPTION 'version-pinning patch anchors not found'; END IF;
  EXECUTE nd;
END $mig$;

ALTER TABLE public.application_form_versions
  DROP CONSTRAINT IF EXISTS application_form_versions_assigned_reason_check;
ALTER TABLE public.application_form_versions
  ADD CONSTRAINT application_form_versions_assigned_reason_check
  CHECK (assigned_reason = ANY (ARRAY['latest_at_start','resumed_existing','migrated_from_json','admin_override','legacy_backfill','repinned_after_archive']));