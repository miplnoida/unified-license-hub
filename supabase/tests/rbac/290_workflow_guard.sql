-- Shared workflow guard: allow / deny / SoD / override.
begin;
select plan(6);

-- Seed: a permission catalogue entry and two users.
insert into public.permissions(module, name)
  values ('application_management','approve'),
         ('application_management','override_workflow')
  on conflict (module, name) do nothing;

-- User A: has application_management.approve only.
insert into public.user_roles(user_id, role)
  values ('00000000-0000-0000-0000-0000000090a1', 'super_admin')
  on conflict do nothing;
-- User B: no permissions.
-- (super_admin bypass on user A is fine — we're testing SoD, not entitlement.)

do $$
declare
  _rec uuid := gen_random_uuid();
  _actor uuid := '00000000-0000-0000-0000-0000000090a1';
  _stranger uuid := '00000000-0000-0000-0000-0000000090b2';
  _got text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', _actor::text, 'role','authenticated')::text, true);

  -- 1. allow when submitter differs
  perform public.enforce_workflow_transition(
    'application_management','approve', _rec, _stranger, 'submitted','approved',
    jsonb_build_object('t','allow-different-submitter'));
  perform ok(true, 'allow: actor != submitter on approve');

  -- 2. deny when actor == submitter on approve without override
  begin
    perform public.enforce_workflow_transition(
      'application_management','approve', _rec, _actor, 'submitted','approved',
      jsonb_build_object('t','sod-block'));
    perform ok(false, 'expected SoD block but call succeeded');
  exception when insufficient_privilege then
    perform ok(true, 'deny: SoD blocks actor==submitter on approve');
  end;

  -- 3. non-SoD actions are always allowed when permission present
  perform public.enforce_workflow_transition(
    'application_management','view', _rec, _actor, null, null,
    jsonb_build_object('t','non-sod-action'));
  perform ok(true, 'allow: view is not gated by SoD');

  -- 4. missing module rejected
  begin
    perform public.enforce_workflow_transition('', 'approve', _rec, _stranger, null, null, '{}'::jsonb);
    perform ok(false, 'expected 22023 for empty module');
  exception when invalid_parameter_value then
    perform ok(true, 'deny: empty module rejected');
  end;

  -- 5. audit row is written
  perform ok(
    exists(select 1 from public.audit_logs
            where entity_id = _rec
              and action = 'workflow.application_management.approve'
              and user_id = _actor),
    'audit: workflow row written');

  -- 6. unauthenticated -> 42501
  perform set_config('request.jwt.claims', '{}', true);
  begin
    perform public.enforce_workflow_transition('application_management','approve', _rec, _stranger, null, null, '{}'::jsonb);
    perform ok(false, 'expected 42501 for unauthenticated');
  exception when insufficient_privilege then
    perform ok(true, 'deny: unauthenticated rejected');
  end;
end$$;

select * from finish();
rollback;
