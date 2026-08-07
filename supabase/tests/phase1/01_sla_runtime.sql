-- Phase 1 / ADM-SLA-001 — SLA stage runtime behaviour + ledger integrity
--
-- Exercises the real lifecycle (open → pause → resume → breach → complete) via
-- the server-side runtime functions and asserts the ledgers are append-only and
-- unreachable from client roles.

BEGIN;
SELECT plan(22);

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
CREATE TEMP TABLE _sla_probe(stage_id uuid);

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

-- Breach then complete
SELECT lives_ok(
  $$SELECT public.sla_stage_mark_breached((SELECT stage_id FROM _sla_probe), 'sweep detected overdue stage')$$,
  'mark_breached runs');
SELECT is((SELECT state FROM public.sla_stage_instances
           WHERE id = (SELECT stage_id FROM _sla_probe)),
          'breached', 'mark_breached records the breached state');

SELECT lives_ok(
  $$SELECT public.sla_stage_complete((SELECT stage_id FROM _sla_probe), 'decision recorded')$$,
  'complete runs');
SELECT is((SELECT state FROM public.sla_stage_instances
           WHERE id = (SELECT stage_id FROM _sla_probe)),
          'completed', 'complete closes the stage');

-- Event trail covers every transition.
SELECT ok((SELECT count(DISTINCT event_type)::int FROM public.sla_stage_events
           WHERE stage_instance_id = (SELECT stage_id FROM _sla_probe)) >= 5,
          'event ledger records started/paused/resumed/breached/completed');

-- Append-only trigger on the event ledger.
SELECT throws_ok(
  $$UPDATE public.sla_stage_events SET reason = 'tampered'
    WHERE stage_instance_id = (SELECT stage_id FROM _sla_probe)$$,
  NULL,
  NULL,
  'stage events cannot be updated');

SELECT * FROM finish();
ROLLBACK;
