DO $$
DECLARE
  canon uuid[] := ARRAY['7e9e0fc2-2961-42c2-a2fd-a0d6601707dc','2b5fdc86-bf8a-4c96-9620-54585f5332e7','24d71346-6214-49ed-8250-1cf09b9a7492','d2590edc-fa3a-421b-866d-905ebfee40d6']::uuid[];
  cand uuid[];
  n_cand int;
  n_steps int;
  n_block int;
  app_hash_before text; app_hash_after text; app_cnt_before int; app_cnt_after int;
  wi_hash_before text; wi_hash_after text; wi_cnt_before int; wi_cnt_after int;
  n_deleted int;
  n_canon_active int; n_generic_active int; n_svc_mapped int; n_svc_bad int;
BEGIN
  SELECT coalesce(array_agg(w.id), '{}'::uuid[]) INTO cand
  FROM public.approval_workflows w
  WHERE w.name LIKE 'PLS - %'
    AND w.is_active = false
    AND NOT (w.id = ANY(canon))
    AND w.name <> 'Post Application Workflow'
    AND NOT EXISTS (SELECT 1 FROM public.services s WHERE s.workflow_id = w.id)
    AND NOT EXISTS (SELECT 1 FROM public.applications a WHERE a.workflow_id = w.id)
    AND NOT EXISTS (SELECT 1 FROM public.workflow_instances i WHERE i.workflow_id = w.id)
    AND NOT EXISTS (SELECT 1 FROM public.returns_filed r WHERE r.workflow_id = w.id);

  n_cand := coalesce(array_length(cand, 1), 0);

  IF n_cand = 0 THEN
    RAISE NOTICE 'PLS cleanup: no candidates, migration is a no-op (already applied).';
    RETURN;
  END IF;

  IF n_cand <> 116 THEN
    RAISE EXCEPTION 'PLS cleanup aborted: expected 116 candidates, found %', n_cand;
  END IF;

  SELECT count(*) INTO n_steps FROM public.approval_steps WHERE workflow_id = ANY(cand);

  -- blocking (NO ACTION) references from other modules must all be zero
  SELECT
    (SELECT count(*) FROM public.approval_actions x WHERE x.step_id IN (SELECT id FROM public.approval_steps WHERE workflow_id = ANY(cand)))
  + (SELECT count(*) FROM public.returns_filed x WHERE x.current_step_id IN (SELECT id FROM public.approval_steps WHERE workflow_id = ANY(cand)))
  + (SELECT count(*) FROM public.workflow_instances x WHERE x.current_step_id IN (SELECT id FROM public.approval_steps WHERE workflow_id = ANY(cand)))
  + (SELECT count(*) FROM public.application_legal_notes x WHERE x.step_id IN (SELECT id FROM public.approval_steps WHERE workflow_id = ANY(cand)))
  + (SELECT count(*) FROM public.application_legal_referrals x WHERE x.step_id IN (SELECT id FROM public.approval_steps WHERE workflow_id = ANY(cand)))
  + (SELECT count(*) FROM public.application_ai_assessments x WHERE x.proposed_routing_step_id IN (SELECT id FROM public.approval_steps WHERE workflow_id = ANY(cand)))
  INTO n_block;

  IF n_block <> 0 THEN
    RAISE EXCEPTION 'PLS cleanup aborted: % external operational reference(s) to candidate steps', n_block;
  END IF;

  SELECT count(*), md5(coalesce(string_agg(id::text || coalesce(workflow_id::text,'-') || coalesce(current_step_id::text,'-') || coalesce(status,'-') || coalesce(updated_at::text,'-'), '|' ORDER BY id), ''))
    INTO app_cnt_before, app_hash_before FROM public.applications;
  SELECT count(*), md5(coalesce(string_agg(id::text || coalesce(workflow_id::text,'-') || coalesce(current_step_id::text,'-') || coalesce(status,'-'), '|' ORDER BY id), ''))
    INTO wi_cnt_before, wi_hash_before FROM public.workflow_instances;

  DELETE FROM public.approval_workflows WHERE id = ANY(cand);
  GET DIAGNOSTICS n_deleted = ROW_COUNT;

  IF n_deleted <> 116 THEN
    RAISE EXCEPTION 'PLS cleanup aborted: deleted % workflows, expected 116', n_deleted;
  END IF;

  SELECT count(*) INTO n_canon_active FROM public.approval_workflows WHERE id = ANY(canon) AND is_active;
  IF n_canon_active <> 4 THEN
    RAISE EXCEPTION 'PLS cleanup aborted: canonical active workflows = %, expected 4', n_canon_active;
  END IF;

  SELECT count(*) INTO n_generic_active FROM public.approval_workflows WHERE name = 'Post Application Workflow' AND is_active;
  IF n_generic_active < 1 THEN
    RAISE EXCEPTION 'PLS cleanup aborted: generic fallback workflow missing or inactive';
  END IF;

  SELECT count(*) INTO n_svc_mapped FROM public.services WHERE workflow_id = ANY(canon);
  IF n_svc_mapped <> 120 THEN
    RAISE EXCEPTION 'PLS cleanup aborted: services mapped to canonical workflows = %, expected 120', n_svc_mapped;
  END IF;

  SELECT count(*) INTO n_svc_bad FROM public.services s
   WHERE s.workflow_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.approval_workflows w WHERE w.id = s.workflow_id AND w.is_active);
  IF n_svc_bad <> 0 THEN
    RAISE EXCEPTION 'PLS cleanup aborted: % service(s) mapped to a missing or inactive workflow', n_svc_bad;
  END IF;

  SELECT count(*), md5(coalesce(string_agg(id::text || coalesce(workflow_id::text,'-') || coalesce(current_step_id::text,'-') || coalesce(status,'-') || coalesce(updated_at::text,'-'), '|' ORDER BY id), ''))
    INTO app_cnt_after, app_hash_after FROM public.applications;
  SELECT count(*), md5(coalesce(string_agg(id::text || coalesce(workflow_id::text,'-') || coalesce(current_step_id::text,'-') || coalesce(status,'-'), '|' ORDER BY id), ''))
    INTO wi_cnt_after, wi_hash_after FROM public.workflow_instances;

  IF app_cnt_before <> app_cnt_after OR app_hash_before IS DISTINCT FROM app_hash_after THEN
    RAISE EXCEPTION 'PLS cleanup aborted: applications changed (% -> %)', app_cnt_before, app_cnt_after;
  END IF;
  IF wi_cnt_before <> wi_cnt_after OR wi_hash_before IS DISTINCT FROM wi_hash_after THEN
    RAISE EXCEPTION 'PLS cleanup aborted: workflow_instances changed (% -> %)', wi_cnt_before, wi_cnt_after;
  END IF;

  RAISE NOTICE 'PLS cleanup: deleted % workflows and % child approval steps; canonical=4, generic active, services mapped=120', n_deleted, n_steps;
END $$;