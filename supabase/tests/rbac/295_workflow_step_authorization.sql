-- Workflow step authorization hardening regression tests.
-- Guards the fix for: "a user whose role is NOT assigned to the current
-- approval step could still perform workflow actions" (notably `reject`).
begin;
select plan(6);

-- The internal-staff bypass must be gone from every transition function.
select is(
  (select count(*)::int from pg_proc
    where proname in ('perform_workflow_transition','perform_registration_workflow_transition')
      and prosrc like '%Only internal staff can reject%'),
  0,
  'no transition function grants reject to internal staff without role match');

-- Every transition function audits denials.
select is(
  (select count(*)::int from pg_proc
    where proname in ('perform_workflow_transition','perform_registration_workflow_transition',
                      'perform_return_workflow_transition','perform_final_workflow_approval')
      and prosrc like '%log_workflow_authz_denial%'),
  4,
  'all four transition functions audit authorization denials');

-- System-role equivalence is opt-in per step.
select ok(
  (select prosrc like '%allow_system_role_equivalence%'
     from pg_proc where proname = 'user_can_act_on_workflow_step'),
  'named-role steps only match on system_role when explicitly opted in');

do $$
declare
  v_wf uuid;
  v_role uuid;
  v_step uuid;
  v_approver uuid := '00000000-0000-0000-0000-0000000095a1';
  v_stranger uuid := '00000000-0000-0000-0000-0000000095b2';
  v_auth jsonb;
begin
  insert into public.roles(name, system_role)
    values ('ZZ Test Approver Role', 'analyst')
    returning id into v_role;

  insert into public.approval_workflows(name, entity_type, is_active)
    values ('ZZ Test Workflow', 'application', false)
    returning id into v_wf;

  insert into public.approval_steps(workflow_id, step_order, name, approver_role,
                                    approver_role_id, allowed_actions)
    values (v_wf, 1, 'ZZ Step', 'analyst', v_role,
            '["approve","reject","send_back"]'::jsonb)
    returning id into v_step;

  -- Approver holds the configured dynamic role.
  insert into public.user_dynamic_roles(user_id, role_id) values (v_approver, v_role);
  -- Stranger only holds the equivalent legacy system role.
  insert into public.user_roles(user_id, role) values (v_stranger, 'analyst')
    on conflict do nothing;

  v_auth := public.user_can_act_on_workflow_step(v_stranger, v_step);
  perform ok(not (v_auth->>'can_act')::boolean,
    'non-assigned analyst cannot act on a named-role step');
  perform ok(not (v_auth->>'can_reject')::boolean,
    'non-assigned analyst cannot reject (the reported vulnerability)');

  v_auth := public.user_can_act_on_workflow_step(v_approver, v_step);
  perform ok((v_auth->>'can_act')::boolean and (v_auth->>'can_reject')::boolean,
    'configured approver retains approve/reject rights');
end$$;

select * from finish();
rollback;
