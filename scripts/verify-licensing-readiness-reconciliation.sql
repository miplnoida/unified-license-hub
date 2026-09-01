-- Verification: licensing readiness reconciliation
--
-- Covers the three defects behind "Licensing prerequisites are not satisfied":
--   1. pinned form requirements never reconciled with submitted form responses
--   2. workflow gate re-resolving configuration and disagreeing with the live
--      workflow instance the engine is actually running
--   3. fit_and_proper gate left undeclared (no licensing_gate_configs row)
--
-- Rollback-scoped: every assertion runs inside a transaction that is rolled
-- back, so the script never mutates the environment.
BEGIN;

-- G1: reconciliation routine exists and is not publicly executable
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'application_reconcile_form_requirements'
  ) THEN RAISE EXCEPTION 'G1 FAIL: application_reconcile_form_requirements missing'; END IF;

  IF has_function_privilege('anon', 'public.application_reconcile_form_requirements(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'G1 FAIL: anon may execute the reconciliation routine';
  END IF;
  RAISE NOTICE 'G1 PASS: reconciliation routine present and anon-revoked';
END $$;

-- G2: a stale PENDING requirement with a submitted response is reconciled,
--     and the status value satisfies the table check constraint.
DO $$
DECLARE
  v_req uuid;
  v_app uuid;
  v_updated int;
  v_status text;
  v_response uuid;
BEGIN
  SELECT r.id, r.application_id INTO v_req, v_app
    FROM public.application_form_requirements r
    JOIN public.form_responses f
      ON f.entity_type = 'application' AND f.entity_id = r.application_id
     AND f.template_id = r.template_id
     AND lower(COALESCE(f.status,'')) IN ('submitted','complete','completed','approved')
   LIMIT 1;

  IF v_req IS NULL THEN
    RAISE NOTICE 'G2 SKIP: no requirement/response pair available in this environment';
    RETURN;
  END IF;

  UPDATE public.application_form_requirements
     SET status = 'PENDING', response_id = NULL
   WHERE id = v_req;

  v_updated := public.application_reconcile_form_requirements(v_app);
  IF v_updated < 1 THEN RAISE EXCEPTION 'G2 FAIL: reconciliation updated no rows'; END IF;

  SELECT status, response_id INTO v_status, v_response
    FROM public.application_form_requirements WHERE id = v_req;

  IF v_status <> 'SUBMITTED' OR v_response IS NULL THEN
    RAISE EXCEPTION 'G2 FAIL: requirement not reconciled (status=%, response=%)', v_status, v_response;
  END IF;
  RAISE NOTICE 'G2 PASS: stale requirement reconciled to SUBMITTED with linked response';
END $$;

-- G3: negative case — a requirement with no submitted response stays outstanding
DO $$
DECLARE
  v_app uuid;
  v_req uuid;
  v_status text;
  v_version uuid;
  v_template uuid;
BEGIN
  SELECT id INTO v_app FROM public.applications ORDER BY created_at DESC LIMIT 1;
  IF v_app IS NULL THEN RAISE NOTICE 'G3 SKIP: no applications'; RETURN; END IF;

  SELECT v.id, v.template_id INTO v_version, v_template
    FROM public.application_form_versions v
    JOIN public.form_templates t ON t.id = v.template_id
   ORDER BY v.created_at LIMIT 1;
  IF v_version IS NULL THEN RAISE NOTICE 'G3 SKIP: no form versions'; RETURN; END IF;

  DELETE FROM public.application_form_requirements
   WHERE application_id = v_app AND template_id = v_template;

  INSERT INTO public.application_form_requirements
    (application_id, template_id, form_version_id, is_required, status, sequence)
  SELECT v_app, v_template, v_version, true, 'PENDING', 9999
  RETURNING id INTO v_req;


  PERFORM public.application_reconcile_form_requirements(v_app);

  SELECT status INTO v_status FROM public.application_form_requirements WHERE id = v_req;
  IF v_status <> 'PENDING' THEN
    RAISE EXCEPTION 'G3 FAIL: requirement with no submitted response was marked % ', v_status;
  END IF;
  RAISE NOTICE 'G3 PASS: unfiled requirement remains outstanding (gate stays fail-closed)';
END $$;

-- G4: workflow gate honours a live workflow instance
DO $$
DECLARE
  v_src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'application_licensing_readiness';

  IF v_src NOT LIKE '%workflow_instances%' OR v_src NOT LIKE '%LIVE_INSTANCE%' THEN
    RAISE EXCEPTION 'G4 FAIL: readiness workflow gate does not consult the live instance';
  END IF;
  IF v_src NOT LIKE '%application_workflow_resolve%' THEN
    RAISE EXCEPTION 'G4 FAIL: configuration fallback removed';
  END IF;
  RAISE NOTICE 'G4 PASS: workflow gate trusts live instance, config resolution retained as fallback';
END $$;

-- G5: fit_and_proper applicability is declared (no silent "undeclared" state)
DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.licensing_gate_configs
   WHERE gate_key = 'fit_and_proper' AND is_active AND retired_at IS NULL;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'G5 FAIL: no active fit_and_proper gate declaration exists';
  END IF;
  RAISE NOTICE 'G5 PASS: % active fit_and_proper declaration(s)', v_n;
END $$;

ROLLBACK;
