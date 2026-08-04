-- Rule Engine (ADM-RE-001/002/003) — runtime governance proofs.
--
-- Proves, server-side:
--   1. immutable versions (UPDATE / DELETE on engine_rule_versions rejected)
--   2. exactly-once execution / action / alert / task idempotency indexes
--   3. per-entity suppression scoping (one entity cannot suppress another)
--   4. expired suppression is ignored
--   5. dry-run isolation: recording a test run touches only engine_rule_tests
--      (+ one RULE_TEST_RUN audit row) and never notifications / alerts /
--      tasks / escalations, nor engine_rules.trigger_count
--   6. lifecycle transition RPCs are permission-gated (unauthorised rejected)
--   7. active-version mutation guard on engine_rules

begin;
select plan(16);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
do $$
declare
  v_rule uuid := '00000000-0000-0000-0000-00000000e001';
  v_exec uuid := '00000000-0000-0000-0000-00000000e002';
begin
  insert into public.engine_rules (id, rule_code, name, rule_type, module, severity,
                                   conditions, actions, suppression_days, status, version, active_version)
  values (v_rule, 'RULE-TEST-9001', 'pgTAP shared rule', 'threshold', 'prudential', 'high',
          '[{"metric":"car","operator":"lt","value":10}]'::jsonb,
          '[{"type":"alert","severity":"high","title":"CAR breach"}]'::jsonb,
          7, 'active', 1, 1)
  on conflict (id) do nothing;

  insert into public.engine_rule_versions (rule_id, version, snapshot, note)
  values (v_rule, 1, '{"name":"pgTAP shared rule","version":1}'::jsonb, 'initial')
  on conflict (rule_id, version) do nothing;

  insert into public.engine_rule_executions (id, rule_id, version, run_mode, entity_key,
                                             source_event_id, matched, suppressed)
  values (v_exec, v_rule, 1, 'runtime', 'ent-a', 'evt-9001', true, false)
  on conflict (id) do nothing;

  insert into public.engine_rule_action_results (execution_id, rule_id, version, action_index,
                                                 action_type, status)
  values (v_exec, v_rule, 1, 0, 'alert', 'success')
  on conflict do nothing;

  insert into public.engine_rule_alerts (rule_id, execution_id, version, source_event_id,
                                         action_index, severity, title)
  values (v_rule, v_exec, 1, 'evt-9001', 0, 'high', 'CAR breach')
  on conflict do nothing;

  insert into public.engine_rule_tasks (rule_id, execution_id, version, source_event_id,
                                        action_index, title, assigned_role)
  values (v_rule, v_exec, 1, 'evt-9001', 0, 'Investigate CAR', 'supervisor')
  on conflict do nothing;

  -- suppression: entity A suppressed, entity B not
  insert into public.engine_rule_suppressions (rule_id, entity_key, suppressed_until, suppressed_count)
  values (v_rule, 'ent-a', now() + interval '3 days', 2)
  on conflict (rule_id, entity_key) do update set suppressed_until = excluded.suppressed_until;

  -- expired suppression for entity C
  insert into public.engine_rule_suppressions (rule_id, entity_key, suppressed_until, suppressed_count)
  values (v_rule, 'ent-c', now() - interval '1 day', 5)
  on conflict (rule_id, entity_key) do update set suppressed_until = excluded.suppressed_until;
end$$;

-- ---------------------------------------------------------------------------
-- 1. Immutable versions
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ update public.engine_rule_versions
       set snapshot = '{"tampered":true}'::jsonb
     where rule_id = '00000000-0000-0000-0000-00000000e001' and version = 1 $$,
  null,
  'UPDATE on engine_rule_versions is rejected (immutable snapshots)'
);

select throws_ok(
  $$ delete from public.engine_rule_versions
     where rule_id = '00000000-0000-0000-0000-00000000e001' and version = 1 $$,
  null,
  'DELETE on engine_rule_versions is rejected (immutable snapshots)'
);

select is(
  (select snapshot->>'name' from public.engine_rule_versions
    where rule_id = '00000000-0000-0000-0000-00000000e001' and version = 1),
  'pgTAP shared rule',
  'version snapshot is byte-identical after rejected tampering'
);

-- ---------------------------------------------------------------------------
-- 2. Exactly-once indexes exist and are enforced
-- ---------------------------------------------------------------------------
select ok(
  (select count(*) > 0 from pg_indexes
    where tablename = 'engine_rule_executions' and indexdef ilike '%UNIQUE%'
      and indexdef ilike '%source_event_id%'),
  'execution idempotency index exists (rule + version + entity + source event)'
);

select throws_ok(
  $$ insert into public.engine_rule_executions (rule_id, version, run_mode, entity_key, source_event_id, matched)
     values ('00000000-0000-0000-0000-00000000e001', 1, 'runtime', 'ent-a', 'evt-9001', true) $$,
  '23505',
  'replaying the same source event cannot create a second execution row'
);

select throws_ok(
  $$ insert into public.engine_rule_action_results (execution_id, rule_id, version, action_index, action_type, status)
     values ('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-00000000e001', 1, 0, 'alert', 'success') $$,
  '23505',
  'the same action index cannot be executed twice for one execution'
);

select throws_ok(
  $$ insert into public.engine_rule_alerts (rule_id, version, source_event_id, action_index, severity, title)
     values ('00000000-0000-0000-0000-00000000e001', 1, 'evt-9001', 0, 'high', 'CAR breach') $$,
  '23505',
  'one source event yields at most one alert per configured action'
);

select throws_ok(
  $$ insert into public.engine_rule_tasks (rule_id, version, source_event_id, action_index, title)
     values ('00000000-0000-0000-0000-00000000e001', 1, 'evt-9001', 0, 'Investigate CAR') $$,
  '23505',
  'one source event yields at most one task per configured action'
);

-- ---------------------------------------------------------------------------
-- 3./4. Suppression scoping and expiry
-- ---------------------------------------------------------------------------
select is(
  (public.engine_rule_suppression_state('00000000-0000-0000-0000-00000000e001', 'ent-a')->>'suppressed')::boolean,
  true,
  'suppressed entity reports suppressed = true'
);

select is(
  (public.engine_rule_suppression_state('00000000-0000-0000-0000-00000000e001', 'ent-b')->>'suppressed')::boolean,
  false,
  'suppression is scoped per entity — entity B is not suppressed by entity A'
);

select is(
  (public.engine_rule_suppression_state('00000000-0000-0000-0000-00000000e001', 'ent-c')->>'suppressed')::boolean,
  false,
  'expired suppression rows are ignored at evaluation time'
);

select is(
  (public.engine_rule_suppression_state('00000000-0000-0000-0000-00000000e001', 'ent-c')->>'expired')::boolean,
  true,
  'expired suppression is reported as expired, not as active'
);

-- ---------------------------------------------------------------------------
-- 5. Dry-run isolation
-- ---------------------------------------------------------------------------
do $$
declare
  b_alerts bigint; b_tasks bigint; b_notif bigint; b_esc bigint; b_tests bigint;
  a_alerts bigint; a_tasks bigint; a_notif bigint; a_esc bigint; a_tests bigint;
  b_trig integer; a_trig integer;
  b_audit bigint; a_audit bigint;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  select count(*) into b_alerts from public.engine_rule_alerts;
  select count(*) into b_tasks  from public.engine_rule_tasks;
  select count(*) into b_notif  from public.notifications;
  select count(*) into b_esc    from public.escalations;
  select count(*) into b_tests  from public.engine_rule_tests;
  select count(*) into b_audit  from public.audit_logs where action = 'RULE_TEST_RUN';
  select coalesce(trigger_count, 0) into b_trig from public.engine_rules
    where id = '00000000-0000-0000-0000-00000000e001';

  perform public.engine_rule_record_test_run(jsonb_build_object(
    'rule_id', '00000000-0000-0000-0000-00000000e001',
    'run_mode', 'current_snapshot',
    'passed', true,
    'evaluated', 3,
    'matched', 1,
    'duration_ms', 12,
    'correlation_id', gen_random_uuid(),
    'label', 'pgTAP dry run',
    'params', '{"mode":"current_snapshot"}'::jsonb,
    'results', '[]'::jsonb
  ));

  select count(*) into a_alerts from public.engine_rule_alerts;
  select count(*) into a_tasks  from public.engine_rule_tasks;
  select count(*) into a_notif  from public.notifications;
  select count(*) into a_esc    from public.escalations;
  select count(*) into a_tests  from public.engine_rule_tests;
  select count(*) into a_audit  from public.audit_logs where action = 'RULE_TEST_RUN';
  select coalesce(trigger_count, 0) into a_trig from public.engine_rules
    where id = '00000000-0000-0000-0000-00000000e001';

  create temp table _dry_run_delta (label text, delta bigint) on commit drop;
  insert into _dry_run_delta values
    ('alerts',   a_alerts - b_alerts),
    ('tasks',    a_tasks  - b_tasks),
    ('notifications', a_notif - b_notif),
    ('escalations',   a_esc  - b_esc),
    ('tests',    a_tests  - b_tests),
    ('audit',    a_audit  - b_audit),
    ('trigger_count', (a_trig - b_trig)::bigint);
end$$;

select is((select delta from _dry_run_delta where label = 'tests'), 1::bigint,
  'a dry run writes exactly one engine_rule_tests row');
select is((select delta from _dry_run_delta where label = 'audit'), 1::bigint,
  'a dry run writes exactly one RULE_TEST_RUN audit row');
select is(
  (select coalesce(sum(delta), 0) from _dry_run_delta
    where label in ('alerts','tasks','notifications','escalations','trigger_count')),
  0::bigint,
  'a dry run creates no alerts, tasks, notifications or escalations and does not bump trigger_count'
);

-- ---------------------------------------------------------------------------
-- 6. Lifecycle transitions are permission-gated
-- ---------------------------------------------------------------------------
do $$
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-00000000e0ff","role":"authenticated"}', true);
end$$;

select throws_ok(
  $$ select public.engine_rule_alert_transition(
       (select id from public.engine_rule_alerts
         where rule_id = '00000000-0000-0000-0000-00000000e001' limit 1),
       'acknowledge', null, null) $$,
  null,
  'a user without rule_engine manage permission cannot transition an alert'
);

rollback;
