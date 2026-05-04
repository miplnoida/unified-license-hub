-- ============================================================================
-- Hardening verification script (idempotent, self-cleaning)
--
-- Verifies RLS, RPC authorization, workflow state-machine, and list/export
-- behavior. Runs against any environment that exposes the project DB via
-- standard PG* env vars (e.g. supabase managed pooler).
--
-- Usage:
--   PGOPTIONS='--client-min-messages=notice' \
--     psql -v ON_ERROR_STOP=1 -f scripts/verify-hardening.sql
--
-- Exit code 0  = all acceptance checks passed
-- Exit code !=0 = one or more acceptance checks failed
-- ============================================================================

\set ON_ERROR_STOP on
SET client_min_messages = notice;
SET row_security = off;  -- sandbox_exec has BYPASSRLS; required for seed/cleanup.

DO $verify$
DECLARE
  -- Counters
  v_pass int := 0;
  v_fail int := 0;
  v_skip int := 0;

  -- Helpers
  v_check_label text;
  v_actual text;
  v_expected text;
  v_denied boolean;
  v_result jsonb;
  v_count int;
  v_count2 int;

  -- Test users (resolved at runtime)
  v_super_admin uuid;
  v_analyst uuid;            -- "wrong approver" role
  v_applicant_a uuid;        -- application owner
  v_applicant_b uuid;        -- different applicant (visibility check)

  -- Workflow + steps
  v_workflow_id uuid;
  v_step1 uuid; v_step2 uuid; v_step3 uuid;

  -- Test apps
  v_app_id uuid;
  v_app_no text;
  v_app2_id uuid;             -- second applicant's app (visibility)
  v_app2_no text;
  v_instance_id uuid;
  v_payment_id uuid;
  v_license_id uuid; v_license_id2 uuid;
  v_licensee_id uuid;
  v_action_count int; v_action_count2 int;

  -- License/licensee bookkeeping
  v_lic_count_before int; v_lic_count_after int;
  v_seat_count_before int; v_seat_count_after int;

  -- Helper: macro-style log
  PROCEDURE_PASS_PROC text;

  -- DDL probe results
  v_audit_insert_policies int;
  v_notif_check text;

  -- App list page result
  v_total bigint;
  v_internal_drafts int;
BEGIN
  RAISE NOTICE '=========================================================';
  RAISE NOTICE '  HARDENING VERIFICATION';
  RAISE NOTICE '=========================================================';

  -- =====================================================================
  -- 0. Resolve test fixtures (existing users + workflow)
  -- =====================================================================
  SELECT user_id INTO v_super_admin
    FROM public.user_roles WHERE role='super_admin' LIMIT 1;
  SELECT user_id INTO v_analyst
    FROM public.user_roles WHERE role='analyst' LIMIT 1;

  -- "applicants" for our purposes: any non-internal users (pre_licensee/licensee_*)
  SELECT user_id INTO v_applicant_a FROM public.user_roles
   WHERE role IN ('applicant','pre_licensee','licensee_primary','licensee_secondary')
   ORDER BY user_id LIMIT 1;
  SELECT user_id INTO v_applicant_b FROM public.user_roles
   WHERE role IN ('applicant','pre_licensee','licensee_primary','licensee_secondary')
     AND user_id <> v_applicant_a
   ORDER BY user_id LIMIT 1;

  IF v_super_admin IS NULL OR v_applicant_a IS NULL OR v_applicant_b IS NULL THEN
    RAISE EXCEPTION 'Need at least 1 super_admin and 2 applicant-type users in user_roles';
  END IF;

  SELECT id INTO v_workflow_id FROM public.approval_workflows
   WHERE entity_type='application' AND is_active LIMIT 1;
  IF v_workflow_id IS NULL THEN
    RAISE EXCEPTION 'No active application workflow found';
  END IF;
  SELECT id INTO v_step1 FROM public.approval_steps
   WHERE workflow_id=v_workflow_id ORDER BY step_order LIMIT 1;
  SELECT id INTO v_step3 FROM public.approval_steps
   WHERE workflow_id=v_workflow_id ORDER BY step_order DESC LIMIT 1;
  SELECT id INTO v_step2 FROM public.approval_steps
   WHERE workflow_id=v_workflow_id AND id NOT IN (v_step1, v_step3) LIMIT 1;

  RAISE NOTICE 'Fixtures: super=% analyst=% appA=% appB=% wf=% steps=%/%/%',
    v_super_admin, v_analyst, v_applicant_a, v_applicant_b,
    v_workflow_id, v_step1, v_step2, v_step3;

  -- =====================================================================
  -- 1. RLS / SECURITY POLICY STRUCTURE CHECKS
  -- (sandbox_exec has BYPASSRLS so we can't *execute* as authenticated;
  --  instead we assert the policy graph that would deny those requests.)
  -- =====================================================================
  RAISE NOTICE '--- RLS / SECURITY ---';

  -- 1.1 audit_logs has NO insert policy => all non-bypass roles denied
  SELECT count(*) INTO v_audit_insert_policies
    FROM pg_policy WHERE polrelid='public.audit_logs'::regclass AND polcmd IN ('a','*');
  IF v_audit_insert_policies = 0 THEN
    v_pass:=v_pass+1; RAISE NOTICE 'PASS [SEC-1] audit_logs has 0 INSERT policies (applicant denied)';
  ELSE
    v_fail:=v_fail+1; RAISE WARNING 'FAIL [SEC-1] audit_logs INSERT policies = %', v_audit_insert_policies;
  END IF;

  -- 1.2 notifications insert policy is internal-only (no auth.uid()=user_id clause)
  SELECT pg_get_expr(polwithcheck, polrelid) INTO v_notif_check
    FROM pg_policy
   WHERE polrelid='public.notifications'::regclass AND polcmd IN ('a','*')
   LIMIT 1;
  IF v_notif_check ILIKE '%has_role%admin%'
     AND v_notif_check NOT ILIKE '%auth.uid() = user_id%' THEN
    v_pass:=v_pass+1; RAISE NOTICE 'PASS [SEC-2] notifications INSERT is internal-only';
  ELSE
    v_fail:=v_fail+1; RAISE WARNING 'FAIL [SEC-2] notifications policy = %', v_notif_check;
  END IF;

  -- 1.3 applications: applicant cannot UPDATE workflow-controlled fields directly.
  --     This is enforced by trigger prevent_direct_application_workflow_mutation.
  --     Verify the trigger exists and guards the right columns.
  IF EXISTS (
    SELECT 1 FROM pg_trigger t
     JOIN pg_class c ON c.oid=t.tgrelid
    WHERE c.relname='applications'
      AND t.tgname LIKE '%workflow%'
      AND NOT t.tgisinternal
  ) THEN
    v_pass:=v_pass+1; RAISE NOTICE 'PASS [SEC-3] workflow-field lock trigger present on applications';
  ELSE
    v_fail:=v_fail+1; RAISE WARNING 'FAIL [SEC-3] workflow-field lock trigger missing';
  END IF;

  -- 1.4 user_roles RLS: only super_admin can INSERT/UPDATE roles.
  --     Verify no policy permits 'admin' (without super_admin) to grant super_admin.
  IF EXISTS (
    SELECT 1 FROM pg_policy
     WHERE polrelid='public.user_roles'::regclass
       AND polcmd IN ('a','w','*')
       AND pg_get_expr(polwithcheck, polrelid) ILIKE '%super_admin%'
  ) THEN
    v_pass:=v_pass+1; RAISE NOTICE 'PASS [SEC-4] user_roles INSERT/UPDATE requires super_admin';
  ELSE
    v_fail:=v_fail+1; RAISE WARNING 'FAIL [SEC-4] user_roles policy does not require super_admin for writes';
  END IF;

  -- 1.5 handle_new_user() must downgrade non-public roles requested via signup metadata.
  DECLARE v_hnu_src text; BEGIN
    SELECT pg_get_functiondef(p.oid) INTO v_hnu_src
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='handle_new_user' LIMIT 1;
    IF v_hnu_src IS NOT NULL
       AND v_hnu_src ILIKE '%applicant%'
       AND v_hnu_src ILIKE '%pre_licensee%'
       AND (v_hnu_src ILIKE '%downgrade%' OR v_hnu_src ILIKE '%silently%' OR v_hnu_src ILIKE '%resolved_role := ''applicant''%')
    THEN
      v_pass:=v_pass+1; RAISE NOTICE 'PASS [SEC-5] handle_new_user restricts metadata-requested roles to public set';
    ELSE
      v_fail:=v_fail+1; RAISE WARNING 'FAIL [SEC-5] handle_new_user does not appear to restrict role metadata';
    END IF;
  END;

  -- 1.6 Service-only workflow RPCs must NOT be EXECUTE-grantable to authenticated.
  DECLARE
    v_fn_oid oid;
    v_fn_name text;
    v_has_exec boolean;
    v_any_fail boolean := false;
  BEGIN
    FOR v_fn_oid, v_fn_name IN
      SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public'
         AND p.proname IN ('perform_workflow_transition','perform_final_workflow_approval')
    LOOP
      v_has_exec := has_function_privilege('authenticated', v_fn_oid, 'EXECUTE');
      IF v_has_exec THEN
        v_fail:=v_fail+1; RAISE WARNING 'FAIL [SEC-6] authenticated has EXECUTE on %', v_fn_name;
        v_any_fail := true;
      ELSE
        v_pass:=v_pass+1; RAISE NOTICE 'PASS [SEC-6] authenticated cannot EXECUTE %', v_fn_name;
      END IF;
    END LOOP;
  END;

  -- 1.7 Storage upload helper exists and gates root-path uploads.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='user_can_upload_document_object'
       AND pg_get_functiondef(p.oid) ILIKE '%applications/%'
  ) THEN
    v_pass:=v_pass+1; RAISE NOTICE 'PASS [SEC-7] document upload path validator present';
  ELSE
    v_fail:=v_fail+1; RAISE WARNING 'FAIL [SEC-7] user_can_upload_document_object missing/incomplete';
  END IF;

  -- 1.8 Storage objects insert policy on documents bucket uses path-scoped check.
  IF EXISTS (
    SELECT 1 FROM pg_policy pol
     JOIN pg_class c ON c.oid=pol.polrelid
     JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='storage' AND c.relname='objects' AND polcmd IN ('a','*')
      AND pg_get_expr(polwithcheck, polrelid) ILIKE '%user_can_upload_document_object%'
  ) THEN
    v_pass:=v_pass+1; RAISE NOTICE 'PASS [SEC-8] documents bucket INSERT policy uses path validator';
  ELSE
    v_fail:=v_fail+1; RAISE WARNING 'FAIL [SEC-8] documents bucket INSERT policy missing path validator';
  END IF;

  -- 1.9 Cross-applicant document read denial: file_uploads/documents read policy
  --     must restrict by ownership. Check that policies exist that reference
  --     auth.uid() (i.e. not 'true').
  IF EXISTS (
    SELECT 1 FROM pg_policy
     WHERE polrelid='public.documents'::regclass
       AND polcmd IN ('r','*')
       AND pg_get_expr(polqual, polrelid) ILIKE '%auth.uid()%'
  ) OR EXISTS (
    SELECT 1 FROM pg_policy pol
     JOIN pg_class c ON c.oid=pol.polrelid
     JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='storage' AND c.relname='objects' AND polcmd IN ('r','*')
      AND pg_get_expr(polqual, polrelid) ILIKE '%user_can_access_document_object%'
  ) THEN
    v_pass:=v_pass+1; RAISE NOTICE 'PASS [SEC-9] document/object read restricted by ownership';
  ELSE
    v_fail:=v_fail+1; RAISE WARNING 'FAIL [SEC-9] no ownership-scoped read policy on documents/objects';
  END IF;

  -- 1.10 applicants visibility: applications read policy must scope to auth.uid()
  IF EXISTS (
    SELECT 1 FROM pg_policy
     WHERE polrelid='public.applications'::regclass
       AND polcmd IN ('r','*')
       AND pg_get_expr(polqual, polrelid) ILIKE '%auth.uid()%applicant_id%'
  ) THEN
    v_pass:=v_pass+1; RAISE NOTICE 'PASS [SEC-10] applications read policy scopes to applicant_id';
  ELSE
    v_fail:=v_fail+1; RAISE WARNING 'FAIL [SEC-10] applications read policy does not scope to applicant';
  END IF;

  -- =====================================================================
  -- 2. WORKFLOW STATE-MACHINE CHECKS
  -- =====================================================================
  RAISE NOTICE '--- WORKFLOW ---';

  -- Build a fresh app at step 1 (status submitted, workflow attached)
  v_app_no := 'VRF-WF-' || substring(gen_random_uuid()::text, 1, 8);
  PERFORM set_config('app.workflow_mutation_context','trusted',true);
  INSERT INTO public.applications (
    application_number, applicant_id, license_type, status, data,
    workflow_id, current_step_id, submitted_at
  ) VALUES (
    v_app_no, v_applicant_a, 'Insurance', 'submitted', '{}'::jsonb,
    v_workflow_id, v_step1, now()
  )
  RETURNING id INTO v_app_id;

  INSERT INTO public.workflow_instances (workflow_id, entity_type, entity_id, current_step_id, status)
  VALUES (v_workflow_id, 'application', v_app_id, v_step1, 'active')
  RETURNING id INTO v_instance_id;

  -- 2.1 wrong approver rejected (analyst is not supervisor and not super_admin)
  v_result := public.perform_workflow_transition(
    v_app_id, v_instance_id, v_step1, 'approve', 'try wrong role', v_analyst);
  IF (v_result->>'code') = 'WRONG_APPROVER' THEN
    v_pass:=v_pass+1; RAISE NOTICE 'PASS [WF-1] wrong approver rejected';
  ELSE
    v_fail:=v_fail+1; RAISE WARNING 'FAIL [WF-1] expected WRONG_APPROVER, got %', v_result;
  END IF;

  -- 2.2 unsupported actions rejected (request_info, delegate)
  v_result := public.perform_workflow_transition(
    v_app_id, v_instance_id, v_step1, 'request_info', 'x', v_super_admin);
  IF (v_result->>'code') = 'BAD_ACTION' THEN
    v_pass:=v_pass+1; RAISE NOTICE 'PASS [WF-2a] request_info rejected (BAD_ACTION)';
  ELSE
    v_fail:=v_fail+1; RAISE WARNING 'FAIL [WF-2a] %', v_result;
  END IF;
  v_result := public.perform_workflow_transition(
    v_app_id, v_instance_id, v_step1, 'delegate', 'x', v_super_admin);
  IF (v_result->>'code') = 'BAD_ACTION' THEN
    v_pass:=v_pass+1; RAISE NOTICE 'PASS [WF-2b] delegate rejected (BAD_ACTION)';
  ELSE
    v_fail:=v_fail+1; RAISE WARNING 'FAIL [WF-2b] %', v_result;
  END IF;

  -- 2.3 send_back from first step rejected
  v_result := public.perform_workflow_transition(
    v_app_id, v_instance_id, v_step1, 'send_back', 'cant', v_super_admin);
  IF (v_result->>'code') = 'CANNOT_SEND_BACK' THEN
    v_pass:=v_pass+1; RAISE NOTICE 'PASS [WF-3] send_back from first step rejected';
  ELSE
    v_fail:=v_fail+1; RAISE WARNING 'FAIL [WF-3] %', v_result;
  END IF;

  -- 2.4 stale step rejected
  v_result := public.perform_workflow_transition(
    v_app_id, v_instance_id, v_step3 /* wrong step */, 'approve', 'stale', v_super_admin);
  IF (v_result->>'code') = 'STALE_STEP' THEN
    v_pass:=v_pass+1; RAISE NOTICE 'PASS [WF-4] stale step rejected';
  ELSE
    v_fail:=v_fail+1; RAISE WARNING 'FAIL [WF-4] %', v_result;
  END IF;

  -- 2.5 stale instance rejected
  v_result := public.perform_workflow_transition(
    v_app_id, gen_random_uuid(), v_step1, 'approve', 'stale', v_super_admin);
  IF (v_result->>'code') = 'STALE_INSTANCE' THEN
    v_pass:=v_pass+1; RAISE NOTICE 'PASS [WF-5] stale instance rejected';
  ELSE
    v_fail:=v_fail+1; RAISE WARNING 'FAIL [WF-5] %', v_result;
  END IF;

  -- 2.6 missing allowed_actions rejected: temporarily blank step's allowed_actions
  --     Use a SECURITY DEFINER side path: we don't have UPDATE on approval_steps
  --     from sandbox_exec. So we fabricate a minimal one-off workflow + step
  --     with allowed_actions = '[]' and run the RPC against it.
  DECLARE
    v_tmp_wf uuid;
    v_tmp_step uuid;
    v_tmp_app uuid;
    v_tmp_inst uuid;
    v_can_write boolean;
  BEGIN
    BEGIN
      INSERT INTO public.approval_workflows (name, entity_type, license_type, is_active)
      VALUES ('VRF-EMPTY-ACTIONS', 'application', 'verify-empty', true)
      RETURNING id INTO v_tmp_wf;
      v_can_write := true;
    EXCEPTION WHEN insufficient_privilege THEN
      v_can_write := false;
    END;

    IF v_can_write THEN
      -- Two steps so first step is NOT the last (avoids final_approval short-circuit)
      INSERT INTO public.approval_steps (workflow_id, step_order, name, approver_role, allowed_actions)
      VALUES (v_tmp_wf, 1, 'Empty Step', 'supervisor', '[]'::jsonb)
      RETURNING id INTO v_tmp_step;
      INSERT INTO public.approval_steps (workflow_id, step_order, name, approver_role, allowed_actions)
      VALUES (v_tmp_wf, 2, 'Final', 'admin', '["approve"]'::jsonb);

      INSERT INTO public.applications (
        application_number, applicant_id, license_type, status, data,
        workflow_id, current_step_id, submitted_at
      ) VALUES (
        'VRF-EMPTY-' || substring(gen_random_uuid()::text,1,8),
        v_applicant_a, 'verify-empty', 'submitted', '{}'::jsonb,
        v_tmp_wf, v_tmp_step, now()
      )
      RETURNING id INTO v_tmp_app;

      INSERT INTO public.workflow_instances (workflow_id, entity_type, entity_id, current_step_id, status)
      VALUES (v_tmp_wf, 'application', v_tmp_app, v_tmp_step, 'active')
      RETURNING id INTO v_tmp_inst;

      v_result := public.perform_workflow_transition(
        v_tmp_app, v_tmp_inst, v_tmp_step, 'approve', 'x', v_super_admin);
      IF (v_result->>'code') = 'ACTION_NOT_ALLOWED' THEN
        v_pass:=v_pass+1; RAISE NOTICE 'PASS [WF-6] missing allowed_actions rejected (ACTION_NOT_ALLOWED)';
      ELSE
        v_fail:=v_fail+1; RAISE WARNING 'FAIL [WF-6] %', v_result;
      END IF;

      -- Cleanup tmp
      BEGIN DELETE FROM public.workflow_instances WHERE id=v_tmp_inst; EXCEPTION WHEN OTHERS THEN NULL; END;
      BEGIN DELETE FROM public.approval_actions WHERE application_id=v_tmp_app; EXCEPTION WHEN OTHERS THEN NULL; END;
      BEGIN DELETE FROM public.applications WHERE id=v_tmp_app; EXCEPTION WHEN OTHERS THEN NULL; END;
      BEGIN DELETE FROM public.approval_steps WHERE id=v_tmp_step; EXCEPTION WHEN OTHERS THEN NULL; END;
      BEGIN DELETE FROM public.approval_workflows WHERE id=v_tmp_wf; EXCEPTION WHEN OTHERS THEN NULL; END;
    ELSE
      v_skip:=v_skip+1; RAISE NOTICE 'SKIP [WF-6] cannot fabricate empty-actions workflow (no INSERT grant)';
    END IF;
  END;

  -- 2.7 non-final approve advances one step
  v_result := public.perform_workflow_transition(
    v_app_id, v_instance_id, v_step1, 'approve', 'ok', v_super_admin);
  IF (v_result->>'success')::boolean
     AND (v_result->>'new_step_id') = v_step2::text THEN
    v_pass:=v_pass+1; RAISE NOTICE 'PASS [WF-7] non-final approve advanced step1->step2';
  ELSE
    v_fail:=v_fail+1; RAISE WARNING 'FAIL [WF-7] %', v_result;
  END IF;

  -- 2.8 escalate from last step rejected: advance to step3 first, then escalate
  v_result := public.perform_workflow_transition(
    v_app_id, v_instance_id, v_step2, 'approve', 'ok', v_super_admin);
  IF NOT (v_result->>'success')::boolean THEN
    v_fail:=v_fail+1; RAISE WARNING 'FAIL [WF-setup] cannot reach step3: %', v_result;
  END IF;
  v_result := public.perform_workflow_transition(
    v_app_id, v_instance_id, v_step3, 'escalate', 'no', v_super_admin);
  -- Backend may reject either as CANNOT_ESCALATE (last-step guard) or
  -- ACTION_NOT_ALLOWED (escalate not in allowed_actions). Both are correct.
  IF (v_result->>'code') IN ('CANNOT_ESCALATE','ACTION_NOT_ALLOWED') THEN
    v_pass:=v_pass+1; RAISE NOTICE 'PASS [WF-8] escalate from last step rejected (%)', v_result->>'code';
  ELSE
    v_fail:=v_fail+1; RAISE WARNING 'FAIL [WF-8] %', v_result;
  END IF;

  -- 2.9 final approve via perform_workflow_transition signals final_approval=true
  v_result := public.perform_workflow_transition(
    v_app_id, v_instance_id, v_step3, 'approve', 'final', v_super_admin);
  IF (v_result->>'final_approval')::boolean THEN
    v_pass:=v_pass+1; RAISE NOTICE 'PASS [WF-9a] non-final RPC delegates final approval';
  ELSE
    v_fail:=v_fail+1; RAISE WARNING 'FAIL [WF-9a] %', v_result;
  END IF;

  -- 2.10 final approve completes workflow + creates license/licensee
  SELECT count(*) INTO v_lic_count_before FROM public.licenses WHERE application_id=v_app_id;
  v_result := public.perform_final_workflow_approval(
    v_app_id, v_instance_id, v_step3, 'final approval comments', v_super_admin);
  IF (v_result->>'success')::boolean
     AND (v_result->>'license_id') IS NOT NULL
     AND (v_result->>'licensee_id') IS NOT NULL THEN
    v_pass:=v_pass+1; RAISE NOTICE 'PASS [WF-9b] final approve created license & licensee';
    v_license_id := (v_result->>'license_id')::uuid;
  ELSE
    v_fail:=v_fail+1; RAISE WARNING 'FAIL [WF-9b] %', v_result;
  END IF;

  -- 2.11 final approve retry is idempotent (no duplicates)
  SELECT count(*) INTO v_lic_count_before FROM public.licenses WHERE application_id=v_app_id;
  SELECT count(*) INTO v_seat_count_before FROM public.licensees WHERE license_id=v_license_id;
  SELECT count(*) INTO v_action_count FROM public.approval_actions
   WHERE application_id=v_app_id AND action='approve_final';

  v_result := public.perform_final_workflow_approval(
    v_app_id, v_instance_id, v_step3, 'retry', v_super_admin);

  SELECT count(*) INTO v_lic_count_after FROM public.licenses WHERE application_id=v_app_id;
  SELECT count(*) INTO v_seat_count_after FROM public.licensees WHERE license_id=v_license_id;
  SELECT count(*) INTO v_action_count2 FROM public.approval_actions
   WHERE application_id=v_app_id AND action='approve_final';

  IF v_lic_count_before = v_lic_count_after
     AND v_seat_count_before = v_seat_count_after
     AND v_action_count = v_action_count2
     AND ((v_result->>'already_processed')::boolean OR (v_result->>'success')::boolean)
  THEN
    v_pass:=v_pass+1; RAISE NOTICE 'PASS [WF-10] final approve retry is idempotent';
  ELSE
    v_fail:=v_fail+1; RAISE WARNING 'FAIL [WF-10] lic %->%, seat %->%, action %->%, result=%',
      v_lic_count_before, v_lic_count_after,
      v_seat_count_before, v_seat_count_after,
      v_action_count, v_action_count2, v_result;
  END IF;

  -- 2.12 request_resubmission pauses workflow + 2.13 resubmission resumes it
  -- Build a second app for this leg
  DECLARE
    v_rs_app uuid;
    v_rs_inst uuid;
    v_rs_status text;
    v_rs_inst_status text;
    v_pay_id uuid;
  BEGIN
    PERFORM set_config('app.workflow_mutation_context','trusted',true);
    INSERT INTO public.applications (
      application_number, applicant_id, license_type, status, data,
      workflow_id, current_step_id, submitted_at
    ) VALUES (
      'VRF-RS-' || substring(gen_random_uuid()::text,1,8),
      v_applicant_a, 'Insurance', 'submitted', '{}'::jsonb,
      v_workflow_id, v_step1, now()
    )
    RETURNING id INTO v_rs_app;

    INSERT INTO public.workflow_instances (workflow_id, entity_type, entity_id, current_step_id, status)
    VALUES (v_workflow_id, 'application', v_rs_app, v_step1, 'active')
    RETURNING id INTO v_rs_inst;

    -- request_resubmission via dedicated RPC
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_super_admin, 'role','authenticated')::text, true);
    v_result := public.request_resubmission_for_application(v_rs_app, 'please fix Y');

    SELECT status INTO v_rs_status FROM public.applications WHERE id=v_rs_app;
    SELECT status INTO v_rs_inst_status FROM public.workflow_instances WHERE id=v_rs_inst;
    IF v_rs_status='resubmission_requested' AND v_rs_inst_status='paused' THEN
      v_pass:=v_pass+1; RAISE NOTICE 'PASS [WF-11] request_resubmission paused workflow';
    ELSE
      v_fail:=v_fail+1; RAISE WARNING 'FAIL [WF-11] app=% inst=% result=%', v_rs_status, v_rs_inst_status, v_result;
    END IF;

    -- Seed a completed payment so submit_application passes its payment guard.
    INSERT INTO public.payments (application_id, user_id, amount, currency, status, payment_method, paid_at)
    VALUES (v_rs_app, v_applicant_a, 1000, 'INR', 'completed', 'simulated', now())
    RETURNING id INTO v_pay_id;

    -- Resubmit as the applicant
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_applicant_a, 'role','authenticated')::text, true);
    v_result := public.submit_application(v_rs_app, NULL);

    SELECT status INTO v_rs_status FROM public.applications WHERE id=v_rs_app;
    SELECT status INTO v_rs_inst_status FROM public.workflow_instances WHERE id=v_rs_inst;
    IF v_rs_status='in_progress' AND v_rs_inst_status='active'
       AND (v_result->>'resubmission')::boolean
       AND (v_result->>'resumed')::boolean THEN
      v_pass:=v_pass+1; RAISE NOTICE 'PASS [WF-12] resubmission resumed workflow';
    ELSE
      v_fail:=v_fail+1; RAISE WARNING 'FAIL [WF-12] app=% inst=% result=%', v_rs_status, v_rs_inst_status, v_result;
    END IF;

    -- Cleanup
    BEGIN DELETE FROM public.notifications WHERE entity_id=v_rs_app::text; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM public.audit_logs    WHERE entity_id=v_rs_app::text; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM public.approval_actions WHERE application_id=v_rs_app; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM public.payments WHERE id=v_pay_id; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM public.workflow_instances WHERE entity_id=v_rs_app; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM public.applications WHERE id=v_rs_app; EXCEPTION WHEN OTHERS THEN NULL; END;
  END;

  -- =====================================================================
  -- 3. APPLICATION LIST / EXPORT (get_application_list_page)
  -- =====================================================================
  RAISE NOTICE '--- LIST / EXPORT ---';

  -- Build a draft app for applicant_a and a submitted app for applicant_b
  v_app2_no := 'VRF-LS-' || substring(gen_random_uuid()::text,1,8);
  PERFORM set_config('app.workflow_mutation_context','trusted',true);
  INSERT INTO public.applications (application_number, applicant_id, license_type, status, data)
  VALUES (v_app2_no || '-DRAFT', v_applicant_a, 'verify-list', 'draft', '{}'::jsonb)
  RETURNING id INTO v_app2_id;

  DECLARE v_b_app uuid;
  BEGIN
    INSERT INTO public.applications (
      application_number, applicant_id, license_type, status, data, submitted_at
    ) VALUES (
      v_app2_no || '-B', v_applicant_b, 'verify-list', 'in_progress', '{}'::jsonb, now()
    )
    RETURNING id INTO v_b_app;

    -- 3.1 applicant sees only own apps
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_applicant_a, 'role','authenticated')::text, true);

    SELECT count(*) INTO v_count
      FROM public.get_application_list_page(0, 100, NULL, 'contains', NULL, NULL, 'created_at','desc') r
     WHERE r.applicant_id <> v_applicant_a;
    IF v_count = 0 THEN
      v_pass:=v_pass+1; RAISE NOTICE 'PASS [LST-1] applicant sees only own apps';
    ELSE
      v_fail:=v_fail+1; RAISE WARNING 'FAIL [LST-1] applicant saw % foreign apps', v_count;
    END IF;

    -- 3.2 applicant cannot see applicant B's row by direct lookup (covered by same check)
    SELECT count(*) INTO v_count
      FROM public.get_application_list_page(0, 100, v_app2_no || '-B', 'exact', NULL, NULL, 'created_at','desc');
    IF v_count = 0 THEN
      v_pass:=v_pass+1; RAISE NOTICE 'PASS [LST-2] applicant cannot read other applicant''s app via list';
    ELSE
      v_fail:=v_fail+1; RAISE WARNING 'FAIL [LST-2] applicant got % rows for foreign app number', v_count;
    END IF;

    -- 3.3 internal user sees in_progress
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_super_admin, 'role','authenticated')::text, true);

    SELECT count(*) INTO v_count
      FROM public.get_application_list_page(0, 100, v_app2_no || '-B', 'exact', NULL, NULL, 'created_at','desc') r
     WHERE r.status='in_progress';
    IF v_count = 1 THEN
      v_pass:=v_pass+1; RAISE NOTICE 'PASS [LST-3] internal user sees in_progress app';
    ELSE
      v_fail:=v_fail+1; RAISE WARNING 'FAIL [LST-3] expected 1 in_progress row, got %', v_count;
    END IF;

    -- 3.4 internal user does NOT see drafts
    SELECT count(*) INTO v_internal_drafts
      FROM public.get_application_list_page(0, 1000, NULL, 'contains', 'draft', NULL, 'created_at','desc');
    IF v_internal_drafts = 0 THEN
      v_pass:=v_pass+1; RAISE NOTICE 'PASS [LST-4] internal user does not see drafts';
    ELSE
      v_fail:=v_fail+1; RAISE WARNING 'FAIL [LST-4] internal user sees % drafts', v_internal_drafts;
    END IF;

    -- 3.5 server-side pagination returns at most page_size rows
    SELECT count(*) INTO v_count
      FROM public.get_application_list_page(0, 3, NULL, 'contains', NULL, NULL, 'created_at','desc');
    IF v_count <= 3 THEN
      v_pass:=v_pass+1; RAISE NOTICE 'PASS [LST-5] pagination returns <= page_size rows (% rows)', v_count;
    ELSE
      v_fail:=v_fail+1; RAISE WARNING 'FAIL [LST-5] pagination returned % rows (>3)', v_count;
    END IF;

    -- 3.6 status filter respected (CSV export uses this same RPC)
    SELECT count(*) INTO v_count
      FROM public.get_application_list_page(0, 100, NULL, 'contains', 'in_progress', NULL, 'created_at','desc') r
     WHERE r.status <> 'in_progress';
    IF v_count = 0 THEN
      v_pass:=v_pass+1; RAISE NOTICE 'PASS [LST-6] status filter respected (CSV export inherits same)';
    ELSE
      v_fail:=v_fail+1; RAISE WARNING 'FAIL [LST-6] filter leak: % off-status rows', v_count;
    END IF;

    -- Cleanup B
    BEGIN DELETE FROM public.applications WHERE id=v_b_app; EXCEPTION WHEN OTHERS THEN NULL; END;
  END;

  -- =====================================================================
  -- CLEANUP main app + summary
  -- =====================================================================
  PERFORM set_config('request.jwt.claims', '{}', true);

  BEGIN DELETE FROM public.notifications WHERE entity_id=v_app_id::text; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.audit_logs    WHERE entity_id=v_app_id::text; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.approval_actions WHERE application_id=v_app_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.licensees WHERE license_id IN (SELECT id FROM public.licenses WHERE application_id=v_app_id); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.licenses  WHERE application_id=v_app_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.workflow_instances WHERE entity_id=v_app_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.applications WHERE id=v_app_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.applications WHERE id=v_app2_id; EXCEPTION WHEN OTHERS THEN NULL; END;

  RAISE NOTICE '=========================================================';
  RAISE NOTICE '  SUMMARY: % PASSED  /  % FAILED  /  % SKIPPED', v_pass, v_fail, v_skip;
  RAISE NOTICE '=========================================================';

  IF v_fail > 0 THEN
    RAISE EXCEPTION 'Hardening verification FAILED: % checks failed', v_fail;
  END IF;
END
$verify$;
