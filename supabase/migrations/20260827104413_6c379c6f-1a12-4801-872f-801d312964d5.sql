DO $$
DECLARE
  canonical uuid[] := ARRAY[
    '7e9e0fc2-2961-42c2-a2fd-a0d6601707dc',
    '2b5fdc86-bf8a-4c96-9620-54585f5332e7',
    '24d71346-6214-49ed-8250-1cf09b9a7492',
    'd2590edc-fa3a-421b-866d-905ebfee40d6'
  ]::uuid[];
  cnt integer;
  updated integer;
BEGIN
  CREATE TEMP TABLE _pls_retire_candidates ON COMMIT DROP AS
  SELECT w.id
  FROM public.approval_workflows w
  WHERE w.name LIKE 'PLS - %'
    AND w.is_active
    AND NOT (w.id = ANY(canonical))
    AND NOT EXISTS (SELECT 1 FROM public.services s WHERE s.workflow_id = w.id)
    AND NOT EXISTS (SELECT 1 FROM public.applications a WHERE a.workflow_id = w.id)
    AND NOT EXISTS (SELECT 1 FROM public.workflow_instances wi WHERE wi.workflow_id = w.id);

  SELECT count(*) INTO cnt FROM _pls_retire_candidates;

  IF cnt = 0 THEN
    RAISE NOTICE 'Phase 3 retirement: no candidates found (already retired) - no-op.';
    RETURN;
  END IF;

  IF cnt <> 116 THEN
    RAISE EXCEPTION 'Phase 3 retirement aborted: expected 116 redundant PLS workflows, found %', cnt;
  END IF;

  UPDATE public.approval_workflows w
  SET is_active = false,
      updated_at = now()
  WHERE w.id IN (SELECT id FROM _pls_retire_candidates);

  GET DIAGNOSTICS updated = ROW_COUNT;
  RAISE NOTICE 'Phase 3 retirement: % redundant PLS workflows set inactive.', updated;
END $$;