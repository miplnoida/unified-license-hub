-- pgTAP: Rule Engine — dry-run isolation proof (ADM-RE-003)
--
-- A rule test must never touch production. This suite snapshots every table a
-- real evaluation would write to, runs a specialised module test as an
-- authorised administrator, and asserts that only the test-history table grew.

BEGIN;
SELECT plan(14);

-- ---------------------------------------------------------------------------
-- Fixtures: one super_admin caller and one escalation rule to test against.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE re_fx(k text primary key, v text);

DO $$
DECLARE v_user uuid := '00000000-0000-0000-0000-0000000re001'; v_rule uuid;
BEGIN
  INSERT INTO public.user_roles(user_id, role) VALUES (v_user, 'super_admin')
    ON CONFLICT DO NOTHING;

  INSERT INTO public.escalation_rules(
    name, source_module, escalation_type, default_severity, initial_recipient_role,
    tier1_recipient_role, tier1_ack_threshold_minutes, is_active)
  VALUES ('RE dry-run probe', 'complaints', 'sla_breach', 'high', 'supervisor',
          'supervisor', 60, true)
  RETURNING id INTO v_rule;

  INSERT INTO re_fx VALUES ('user', v_user::text), ('rule', v_rule::text);
END$$;

-- Baseline of every production surface a live escalation evaluation writes to.
CREATE TEMP TABLE re_before AS
SELECT 'escalations' AS t, count(*) AS n FROM public.escalations
UNION ALL SELECT 'escalation_tier_events', count(*) FROM public.escalation_tier_events
UNION ALL SELECT 'escalation_notification_events', count(*) FROM public.escalation_notification_events
UNION ALL SELECT 'escalation_ownership_events', count(*) FROM public.escalation_ownership_events
UNION ALL SELECT 'notifications', count(*) FROM public.notifications
UNION ALL SELECT 'notification_outbox', count(*) FROM public.notification_outbox
UNION ALL SELECT 'notification_event_queue', count(*) FROM public.notification_event_queue
UNION ALL SELECT 'engine_rule_executions', count(*) FROM public.engine_rule_executions
UNION ALL SELECT 'engine_rule_alerts', count(*) FROM public.engine_rule_alerts
UNION ALL SELECT 'engine_rule_tasks', count(*) FROM public.engine_rule_tasks
UNION ALL SELECT 'engine_rule_action_results', count(*) FROM public.engine_rule_action_results
UNION ALL SELECT 'engine_rule_suppressions', count(*) FROM public.engine_rule_suppressions
UNION ALL SELECT 'module_rule_tests', count(*) FROM public.module_rule_tests;

-- ---------------------------------------------------------------------------
-- Run the specialised tester as the authorised administrator.
-- ---------------------------------------------------------------------------
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT v FROM re_fx WHERE k = 'user'), 'role', 'authenticated')::text,
  true);

SELECT lives_ok(
  format($$SELECT public.rule_module_test('escalation', %L::uuid,
    '{"elapsed_minutes": 120, "acknowledged": false, "tier": 1}'::jsonb)$$,
    (SELECT v FROM re_fx WHERE k = 'rule')),
  'authorised administrator can run the escalation tester');

SELECT ok(
  (SELECT (public.rule_module_test('escalation', (SELECT v FROM re_fx WHERE k = 'rule')::uuid,
     '{"elapsed_minutes": 120, "acknowledged": false, "tier": 1}'::jsonb)) ->> 'side_effects' = 'none'),
  'the tester reports side_effects = none');

RESET role;
SELECT set_config('request.jwt.claims', NULL, true);

-- ---------------------------------------------------------------------------
-- Only the test-history table may have grown.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE re_after AS
SELECT 'escalations' AS t, count(*) AS n FROM public.escalations
UNION ALL SELECT 'escalation_tier_events', count(*) FROM public.escalation_tier_events
UNION ALL SELECT 'escalation_notification_events', count(*) FROM public.escalation_notification_events
UNION ALL SELECT 'escalation_ownership_events', count(*) FROM public.escalation_ownership_events
UNION ALL SELECT 'notifications', count(*) FROM public.notifications
UNION ALL SELECT 'notification_outbox', count(*) FROM public.notification_outbox
UNION ALL SELECT 'notification_event_queue', count(*) FROM public.notification_event_queue
UNION ALL SELECT 'engine_rule_executions', count(*) FROM public.engine_rule_executions
UNION ALL SELECT 'engine_rule_alerts', count(*) FROM public.engine_rule_alerts
UNION ALL SELECT 'engine_rule_tasks', count(*) FROM public.engine_rule_tasks
UNION ALL SELECT 'engine_rule_action_results', count(*) FROM public.engine_rule_action_results
UNION ALL SELECT 'engine_rule_suppressions', count(*) FROM public.engine_rule_suppressions
UNION ALL SELECT 'module_rule_tests', count(*) FROM public.module_rule_tests;

SELECT is(
  (SELECT a.n FROM re_after a JOIN re_before b USING (t) WHERE t = 'escalations'),
  (SELECT b.n FROM re_before b WHERE t = 'escalations'),
  'no escalation was created by a dry run');

SELECT is((SELECT n FROM re_after WHERE t = 'escalation_tier_events'),
          (SELECT n FROM re_before WHERE t = 'escalation_tier_events'),
          'no tier event was created by a dry run');
SELECT is((SELECT n FROM re_after WHERE t = 'escalation_notification_events'),
          (SELECT n FROM re_before WHERE t = 'escalation_notification_events'),
          'no escalation notification event was created by a dry run');
SELECT is((SELECT n FROM re_after WHERE t = 'escalation_ownership_events'),
          (SELECT n FROM re_before WHERE t = 'escalation_ownership_events'),
          'no ownership event was created by a dry run');
SELECT is((SELECT n FROM re_after WHERE t = 'notifications'),
          (SELECT n FROM re_before WHERE t = 'notifications'),
          'no in-app notification was created by a dry run');
SELECT is((SELECT n FROM re_after WHERE t = 'notification_outbox'),
          (SELECT n FROM re_before WHERE t = 'notification_outbox'),
          'nothing was queued for email delivery by a dry run');
SELECT is((SELECT n FROM re_after WHERE t = 'notification_event_queue'),
          (SELECT n FROM re_before WHERE t = 'notification_event_queue'),
          'no notification event was enqueued by a dry run');
SELECT is((SELECT n FROM re_after WHERE t = 'engine_rule_executions'),
          (SELECT n FROM re_before WHERE t = 'engine_rule_executions'),
          'no runtime execution row was recorded by a dry run');
SELECT is((SELECT n FROM re_after WHERE t = 'engine_rule_alerts'),
          (SELECT n FROM re_before WHERE t = 'engine_rule_alerts'),
          'no alert was raised by a dry run');
SELECT is((SELECT n FROM re_after WHERE t = 'engine_rule_tasks'),
          (SELECT n FROM re_before WHERE t = 'engine_rule_tasks'),
          'no task was created by a dry run');
SELECT is((SELECT n FROM re_after WHERE t = 'engine_rule_action_results'),
          (SELECT n FROM re_before WHERE t = 'engine_rule_action_results'),
          'no action result was recorded by a dry run');
SELECT is((SELECT n FROM re_after WHERE t = 'engine_rule_suppressions'),
          (SELECT n FROM re_before WHERE t = 'engine_rule_suppressions'),
          'no suppression record was written by a dry run');

SELECT ok(
  (SELECT a.n FROM re_after a WHERE t = 'module_rule_tests')
  > (SELECT b.n FROM re_before b WHERE t = 'module_rule_tests'),
  'the dry run is recorded in module_rule_tests (the only table that grew)');

SELECT * FROM finish();
ROLLBACK;
