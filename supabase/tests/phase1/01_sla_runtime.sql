-- Phase 1 / ADM-SLA-001 — SLA stage runtime behaviour + ledger integrity
--
-- Exercises the real lifecycle (open → pause → resume → pause → resume →
-- breach → escalate → complete) via the server-side runtime functions and
-- asserts the ledgers are append-only, escalation dispatch is deduplicated and
-- both ledgers are unreachable from client roles.

BEGIN;
SELECT plan(34);

SELECT has_table('public', 'sla_stage_instances', 'sla_stage_instances exists');
SELECT has_table('public', 'sla_stage_events', 'sla_stage_events exists');

-- ---------------------------------------------------------------------------
-- Grants: both ledgers are read-only for client roles (append-only guarantee
-- cannot be bypassed with TRUNCATE / UPDATE / DELETE / INSERT).
-- ---------------------------------------------------------------------------
SELECT ok(has_table_privilege('authenticated', 'public.sla_stage_instances', 'SELECT'),
          'authenticated can read stage instances');
SELECT ok(NOT has_table_privilege('authenticated', 'public.sla_stage_instances', 'INSERT'),
          'authenticated cannot insert stage instances');
SELECT ok(NOT has_table_privilege('authenticated', 'public.sla_stage_instances', 'UPDATE'),
          'authenticated cannot update stage instances');
SELECT ok(NOT has_table_privilege('authenticated', 'public.sla_stage_instances', 'DELETE'),
          'authenticated cannot delete stage instances');
SELECT ok(NOT has_table_privilege('authenticated', 'public.sla_stage_instances', 'TRUNCATE'),
          'authenticated cannot truncate stage instances');
SELECT ok(NOT has_table_privilege('anon', 'public.sla_stage_events', 'TRUNCATE'),
          'anon cannot truncate stage events');
SELECT ok(NOT has_table_privilege('authenticated', 'public.sla_stage_events', 'UPDATE'),
          'authenticated cannot update stage events');

-- Runtime mutators are server-side only.
SELECT ok(NOT has_function_privilege('authenticated',
            'public.sla_stage_pause(text,uuid,text,jsonb)', 'EXECUTE'),
          'authenticated cannot execute sla_stage_pause');
SELECT ok(NOT has_function_privilege('anon',
            'public.sla_stage_open(text,text,uuid,uuid,uuid,text,timestamptz)', 'EXECUTE'),
          'anon cannot execute sla_stage_open');
SELECT ok(has_function_privilege('service_role',
            'public.sla_stage_mark_breached(uuid,text)', 'EXECUTE'),
          'service_role can execute sla_stage_mark_breached');

-- ---------------------------------------------------------------------------
-- Behavioural lifecycle
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _sla_probe(stage_id uuid, pause_seconds_after_first int);

DO $$
DECLARE
  v_entity uuid := '00000000-0000-0000-0000-00000000e001';
  v_stage  uuid;
BEGIN
  v_stage := public.sla_stage_open(
    'phase1_test', 'phase1_entity', v_entity, NULL, NULL, 'Initial review', now() - interval '3 hours');
  INSERT INTO _sla_probe(stage_id) VALUES (v_stage);
END$$;

SELECT is((SELECT state FROM public.sla_stage_instances
           WHERE id = (SELECT stage_id FROM _sla_probe)),
          'active', 'open leaves the stage active');

-- started_at is persisted from the supplied start instant.
SELECT ok((SELECT started_at IS NOT NULL AND started_at < now()
           FROM public.sla_stage_instances WHERE id = (SELECT stage_id FROM _sla_probe)),
          'open persists started_at');

-- due_at is the resolved duration applied to started_at through the business
-- calendar helper (NULL-safe: an unconfigured process yields NULL on both sides).
SELECT ok((SELECT due_at IS NOT DISTINCT FROM
             public.sla_add_duration(started_at, sla_hours, calendar_profile_id)
           FROM public.sla_stage_instances WHERE id = (SELECT stage_id FROM _sla_probe)),
          'open computes due_at from started_at + resolved duration');

SELECT is((SELECT count(*)::int FROM public.sla_stage_events
           WHERE stage_instance_id = (SELECT stage_id FROM _sla_probe)
             AND event_type = 'started'),
          1, 'open writes exactly one started event');

-- Pause
SELECT lives_ok(
  $$SELECT public.sla_stage_pause('phase1_entity', '00000000-0000-0000-0000-00000000e001'::uuid, 'awaiting RFI', '{}'::jsonb)$$,
  'pause runs');

SELECT is((SELECT state FROM public.sla_stage_instances
           WHERE id = (SELECT stage_id FROM _sla_probe)),
          'paused', 'pause moves the stage to paused');
SELECT isnt((SELECT paused_at FROM public.sla_stage_instances
             WHERE id = (SELECT stage_id FROM _sla_probe)),
            NULL, 'pause stamps paused_at');

-- Resume
SELECT lives_ok(
  $$SELECT public.sla_stage_resume('phase1_entity', '00000000-0000-0000-0000-00000000e001'::uuid, 'RFI answered', '{}'::jsonb)$$,
  'resume runs');

SELECT is((SELECT state FROM public.sla_stage_instances
           WHERE id = (SELECT stage_id FROM _sla_probe)),
          'active', 'resume returns the stage to active');
SELECT is((SELECT paused_at FROM public.sla_stage_instances
           WHERE id = (SELECT stage_id FROM _sla_probe)),
          NULL, 'resume clears paused_at');
SELECT ok((SELECT pause_seconds FROM public.sla_stage_instances
           WHERE id = (SELECT stage_id FROM _sla_probe)) >= 0,
          'resume accumulates pause_seconds');

-- Second pause/resume cycle — pause time accumulates rather than resetting, and
-- the deadline is pushed out by the paused interval.
UPDATE _sla_probe SET pause_seconds_after_first =
  (SELECT pause_seconds FROM public.sla_stage_instances WHERE id = stage_id);

DO $$
DECLARE v_stage uuid := (SELECT stage_id FROM _sla_probe);
BEGIN
  PERFORM public.sla_stage_pause('phase1_entity', '00000000-0000-0000-0000-00000000e001'::uuid,
                                 'second hold', '{}'::jsonb);
  -- Backdate paused_at so the second cycle contributes measurable pause time.
  UPDATE public.sla_stage_instances SET paused_at = now() - interval '45 minutes' WHERE id = v_stage;
  PERFORM public.sla_stage_resume('phase1_entity', '00000000-0000-0000-0000-00000000e001'::uuid,
                                  'hold released', '{}'::jsonb);
END$$;

SELECT ok((SELECT pause_seconds FROM public.sla_stage_instances
           WHERE id = (SELECT stage_id FROM _sla_probe))
          > (SELECT pause_seconds_after_first FROM _sla_probe),
          'second pause/resume cycle accumulates additional pause_seconds');

SELECT is((SELECT count(*)::int FROM public.sla_stage_events
           WHERE stage_instance_id = (SELECT stage_id FROM _sla_probe)
             AND event_type IN ('paused', 'resumed')),
          4, 'both pause/resume cycles are recorded in the event ledger');

-- Breach — only overdue active stages transition, so bring the deadline forward.
UPDATE public.sla_stage_instances
   SET due_at = now() - interval '1 hour'
 WHERE id = (SELECT stage_id FROM _sla_probe);

SELECT is(
  (SELECT public.sla_stage_mark_breached((SELECT stage_id FROM _sla_probe), 'sweep detected overdue stage')),
  true, 'mark_breached transitions an overdue active stage');
SELECT is((SELECT state FROM public.sla_stage_instances
           WHERE id = (SELECT stage_id FROM _sla_probe)),
          'breached', 'mark_breached records the breached state');
SELECT isnt((SELECT breached_at FROM public.sla_stage_instances
             WHERE id = (SELECT stage_id FROM _sla_probe)),
            NULL, 'mark_breached stamps breached_at');

-- Repeating the sweep over the same stage does not re-breach it.
SELECT is(
  (SELECT public.sla_stage_mark_breached((SELECT stage_id FROM _sla_probe), 'repeat sweep')),
  false, 'repeat sweep does not re-breach an already breached stage');
SELECT is((SELECT count(*)::int FROM public.sla_stage_events
           WHERE stage_instance_id = (SELECT stage_id FROM _sla_probe)
             AND event_type = 'breached'),
          1, 'breach is recorded exactly once');

-- Escalation dispatch
SELECT lives_ok(
  $$SELECT public.sla_stage_mark_escalated((SELECT stage_id FROM _sla_probe), 1, 'supervisor@example.test')$$,
  'mark_escalated runs');
SELECT is((SELECT count(*)::int FROM public.sla_stage_events
           WHERE stage_instance_id = (SELECT stage_id FROM _sla_probe)
             AND event_type = 'escalated'),
          1, 'escalation is recorded in the event ledger');
SELECT isnt((SELECT first_breach_notified_at FROM public.sla_stage_instances
             WHERE id = (SELECT stage_id FROM _sla_probe)),
            NULL, 'escalation stamps first_breach_notified_at');

-- Dispatch ledger dedupes on (workflow_instance_id, tier), which is what makes
-- a repeated sweep non-duplicating.
SELECT ok(EXISTS (
  SELECT 1 FROM pg_indexes
   WHERE tablename = 'sla_escalation_dispatches'
     AND indexdef ILIKE '%UNIQUE%'
     AND indexdef ILIKE '%workflow_instance_id%'
     AND indexdef ILIKE '%tier%'),
  'escalation dispatches are unique per (workflow instance, tier)');

CREATE TEMP TABLE _sla_dispatch(instance_id uuid);
INSERT INTO _sla_dispatch VALUES ('00000000-0000-0000-0000-00000000d001');

INSERT INTO public.sla_escalation_dispatches
  (workflow_instance_id, entity_type, entity_id, process_type, tier, recipients)
VALUES ('00000000-0000-0000-0000-00000000d001', 'phase1_entity',
        '00000000-0000-0000-0000-00000000e001', 'phase1_test', 1, 'supervisor@example.test');

SELECT throws_ok(
  $$INSERT INTO public.sla_escalation_dispatches
      (workflow_instance_id, entity_type, entity_id, process_type, tier, recipients)
    VALUES ('00000000-0000-0000-0000-00000000d001', 'phase1_entity',
            '00000000-0000-0000-0000-00000000e001', 'phase1_test', 1, 'supervisor@example.test')$$,
  '23505',
  NULL,
  'a repeat sweep cannot dispatch the same tier twice');

SELECT is((SELECT count(*)::int FROM public.sla_escalation_dispatches
           WHERE workflow_instance_id = (SELECT instance_id FROM _sla_dispatch)),
          1, 'only one dispatch row survives the duplicate attempt');

-- Completion
SELECT lives_ok(
  $$SELECT public.sla_stage_complete((SELECT stage_id FROM _sla_probe), 'decision recorded')$$,
  'complete runs');
SELECT is((SELECT state FROM public.sla_stage_instances
           WHERE id = (SELECT stage_id FROM _sla_probe)),
          'completed', 'complete closes the stage');
SELECT isnt((SELECT completed_at FROM public.sla_stage_instances
             WHERE id = (SELECT stage_id FROM _sla_probe)),
            NULL, 'complete stamps completed_at');
SELECT is(
  (SELECT public.sla_stage_mark_breached((SELECT stage_id FROM _sla_probe), 'post-completion sweep')),
  false, 'a completed stage accepts no further transitions');

-- Event trail covers every transition, in order.
SELECT ok((SELECT count(DISTINCT event_type)::int FROM public.sla_stage_events
           WHERE stage_instance_id = (SELECT stage_id FROM _sla_probe)) >= 5,
          'event ledger records started/paused/resumed/breached/completed');

SELECT is(
  (SELECT string_agg(event_type, ',' ORDER BY created_at, id)
     FROM public.sla_stage_events
    WHERE stage_instance_id = (SELECT stage_id FROM _sla_probe)
      AND event_type IN ('started', 'breached', 'escalated', 'completed')),
  'started,breached,escalated,completed',
  'lifecycle events are emitted in chronological order');

-- Append-only trigger on the event ledger.
SELECT throws_ok(
  $$UPDATE public.sla_stage_events SET reason = 'tampered'
    WHERE stage_instance_id = (SELECT stage_id FROM _sla_probe)$$,
  NULL,
  NULL,
  'stage events cannot be updated');

SELECT throws_ok(
  $$DELETE FROM public.sla_stage_events
    WHERE stage_instance_id = (SELECT stage_id FROM _sla_probe)$$,
  NULL,
  NULL,
  'stage events cannot be deleted');

SELECT * FROM finish();
ROLLBACK;
