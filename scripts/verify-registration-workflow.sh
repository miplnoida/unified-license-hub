#!/usr/bin/env bash
# Live DB integration check for the Registration approval workflow.
# Proves end-to-end that:
#   1. inserting a registration triggers start_registration_workflow, which
#      creates a workflow_instances row with entity_type='registration';
#   2. perform_registration_workflow_transition advances the configured steps
#      and writes approval_actions tagged with entity_type='registration';
#   3. final approval marks the registration 'approved' and the
#      workflow_instance 'completed';
#   4. rollback at the end leaves no test data behind.
#
# Requires PG* env vars to be set (the Lovable Cloud sandbox sets them).
# Usage: bash scripts/verify-registration-workflow.sh
set -euo pipefail

psql -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;

-- 1. Set up an isolated regulator/sector/sub-sector/category for the test.
DO $$
DECLARE
  v_reg_uid uuid := gen_random_uuid();          -- regulator id
  v_role_id uuid;
  v_sector_id uuid := gen_random_uuid();
  v_sub_id uuid := gen_random_uuid();
  v_cat_id uuid := gen_random_uuid();
  v_workflow_id uuid;
  v_step1 uuid := gen_random_uuid();
  v_step2 uuid := gen_random_uuid();
  v_user_id uuid := gen_random_uuid();
  v_registration_id uuid;
  v_instance_id uuid;
  v_action_count int;
  v_status text;
  v_actor uuid;
  v_result jsonb;
BEGIN
  -- Borrow an existing super_admin to satisfy SECURITY DEFINER checks indirectly.
  SELECT user_id INTO v_actor FROM public.user_roles WHERE role = 'super_admin'::app_role LIMIT 1;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'no super_admin user exists; cannot run integration check';
  END IF;

  -- Borrow any role for approver.
  SELECT id INTO v_role_id FROM public.roles ORDER BY created_at LIMIT 1;
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'no roles configured';
  END IF;

  INSERT INTO public.regulators(id, name, code, status)
  VALUES (v_reg_uid, '__test_reg__', '__TR_'||substr(v_reg_uid::text,1,8), 'active');

  INSERT INTO public.sectors(id, name, regulator_id) VALUES (v_sector_id, '__test_sec__', v_reg_uid);
  INSERT INTO public.sub_sectors(id, name, sector_id) VALUES (v_sub_id, '__test_sub__', v_sector_id);
  INSERT INTO public.categories(id, name, sub_sector_id) VALUES (v_cat_id, '__test_cat__', v_sub_id);

  -- 2. Create a 2-step registration workflow scoped to this sector.
  INSERT INTO public.approval_workflows(name, license_type, entity_type, sector_id, regulator_id, is_active)
  VALUES ('__test_reg_wf__', 'registration', 'registration', v_sector_id, v_reg_uid, true)
  RETURNING id INTO v_workflow_id;

  INSERT INTO public.approval_steps(id, workflow_id, step_order, name, approver_role, approver_role_id, allowed_actions)
  VALUES
    (v_step1, v_workflow_id, 1, 'Review',
     'admin'::app_role, v_role_id, '["approve","reject","send_back","request_resubmission"]'::jsonb),
    (v_step2, v_workflow_id, 2, 'Final',
     'super_admin'::app_role, v_role_id, '["approve","reject"]'::jsonb);

  -- 3. Insert a registration — trigger should auto-start the workflow.
  INSERT INTO public.registrations(
    user_id, sector_id, sub_sector_id, category_id,
    applicant_name, mailing_address, physical_address, same_as_mailing,
    first_name, last_name, telephone, email, status
  ) VALUES (
    v_user_id, v_sector_id, v_sub_id, v_cat_id,
    '__test_applicant__', '{}'::jsonb, '{}'::jsonb, true,
    'Test', 'User', '0000000000', 'test+integration@example.com', 'pending_review'
  ) RETURNING id INTO v_registration_id;

  -- 4. Assert: a workflow_instance was created for this registration.
  SELECT id INTO v_instance_id FROM public.workflow_instances
   WHERE entity_id = v_registration_id AND entity_type = 'registration';
  IF v_instance_id IS NULL THEN
    RAISE EXCEPTION '[FAIL] no workflow_instance created on registration insert';
  END IF;
  RAISE NOTICE '[OK] workflow_instance created: %', v_instance_id;

  -- 5. Drive the transition RPC: approve step 1, expect advance to step 2.
  v_result := public.perform_registration_workflow_transition(
    v_registration_id, v_instance_id, v_step1, 'approve', 'looks good', v_actor
  );
  IF v_result->>'error' IS NOT NULL THEN
    RAISE EXCEPTION '[FAIL] step1 approve errored: %', v_result;
  END IF;
  SELECT current_step_id, status INTO v_instance_id, v_status
    FROM public.workflow_instances WHERE id = (v_result->>'instance_id')::uuid;
  IF v_instance_id <> v_step2 THEN
    RAISE EXCEPTION '[FAIL] expected advance to step2; got %', v_instance_id;
  END IF;
  RAISE NOTICE '[OK] approve advanced from step1 -> step2';

  -- 6. Final approve.
  v_result := public.perform_registration_workflow_transition(
    v_registration_id, (v_result->>'instance_id')::uuid, v_step2, 'approve', 'final', v_actor
  );
  IF v_result->>'error' IS NOT NULL THEN
    RAISE EXCEPTION '[FAIL] final approve errored: %', v_result;
  END IF;

  SELECT status INTO v_status FROM public.registrations WHERE id = v_registration_id;
  IF v_status <> 'approved' THEN
    RAISE EXCEPTION '[FAIL] registration status expected approved; got %', v_status;
  END IF;
  RAISE NOTICE '[OK] registration marked approved';

  SELECT status INTO v_status FROM public.workflow_instances
   WHERE entity_id = v_registration_id AND entity_type = 'registration';
  IF v_status <> 'completed' THEN
    RAISE EXCEPTION '[FAIL] workflow_instance expected completed; got %', v_status;
  END IF;
  RAISE NOTICE '[OK] workflow_instance completed';

  -- 7. approval_actions must contain both step transitions tagged registration.
  SELECT count(*) INTO v_action_count FROM public.approval_actions
   WHERE entity_id = v_registration_id AND entity_type = 'registration';
  IF v_action_count <> 2 THEN
    RAISE EXCEPTION '[FAIL] expected 2 approval_actions; got %', v_action_count;
  END IF;
  RAISE NOTICE '[OK] approval_actions count = 2';

  RAISE NOTICE '=== registration workflow integration: PASSED ===';
END $$;

ROLLBACK;
SQL
