-- Phase 1 — governed write surface for workflow configuration
--
-- Guards three invariants:
--   1. `authenticated` has NO direct DML on the workflow-config tables; every
--      write must go through a governed SECURITY DEFINER RPC.
--   2. The governed RPCs are executable by `authenticated`/`service_role` only,
--      never by `anon` or PUBLIC.
--   3. `approval_steps.allowed_actions` can never drift from the enabled
--      `approval_step_actions` rows (trigger-enforced), so View Mode and Edit
--      Mode always read the same effective action list.

BEGIN;
SELECT plan(21);

-- 1. No direct DML for the browser role on config tables ---------------------
WITH t(tbl) AS (
  VALUES ('public.approval_steps'),
         ('public.approval_step_actions'),
         ('public.approval_action_notifications'),
         ('public.approval_step_entry_notifications')
)
SELECT is(
  has_table_privilege('authenticated', tbl, 'INSERT')
    OR has_table_privilege('authenticated', tbl, 'UPDATE')
    OR has_table_privilege('authenticated', tbl, 'DELETE'),
  false,
  'authenticated has no direct DML on ' || tbl)
FROM t;

-- Read access is retained (the builder still needs to load config).
WITH t(tbl) AS (
  VALUES ('public.approval_steps'),
         ('public.approval_step_actions'),
         ('public.approval_action_notifications'),
         ('public.approval_step_entry_notifications')
)
SELECT is(has_table_privilege('authenticated', tbl, 'SELECT'), true,
          'authenticated can still read ' || tbl)
FROM t;

-- 2. RPC exposure ------------------------------------------------------------
WITH sigs(sig) AS (
  VALUES ('public.approval_step_save(jsonb)'),
         ('public.approval_step_delete(uuid)'),
         ('public.approval_steps_snapshot_insert(jsonb)'),
         ('public.approval_action_notification_save(jsonb)'),
         ('public.approval_action_notification_delete(uuid)'),
         ('public.approval_step_entry_notification_save(jsonb)'),
         ('public.approval_step_entry_notification_delete(uuid)')
)
SELECT is(has_function_privilege('anon', sig, 'EXECUTE'), false,
          'anon cannot EXECUTE ' || sig)
FROM sigs;

WITH sigs(sig) AS (
  VALUES ('public.approval_step_save(jsonb)'),
         ('public.approval_step_delete(uuid)'),
         ('public.approval_steps_snapshot_insert(jsonb)'),
         ('public.approval_action_notification_save(jsonb)'),
         ('public.approval_action_notification_delete(uuid)'),
         ('public.approval_step_entry_notification_save(jsonb)'),
         ('public.approval_step_entry_notification_delete(uuid)')
)
SELECT is(has_function_privilege('authenticated', sig, 'EXECUTE'), true,
          'authenticated retains EXECUTE on ' || sig)
FROM sigs;

-- 3. allowed_actions never drifts from approval_step_actions -----------------
SELECT is(
  (SELECT count(*)::int FROM pg_trigger
    WHERE tgrelid = 'public.approval_step_actions'::regclass
      AND tgname = 'trg_sync_step_allowed_actions'), 1,
  'allowed_actions sync trigger is installed on approval_step_actions');

SELECT is(
  (SELECT count(*)::int
     FROM public.approval_steps s
    WHERE coalesce((SELECT array_agg(x ORDER BY x)
                      FROM jsonb_array_elements_text(s.allowed_actions) x), '{}')
       <> coalesce((SELECT array_agg(a.action_type ORDER BY a.action_type)
                      FROM public.approval_step_actions a
                     WHERE a.step_id = s.id AND a.is_enabled), '{}')
      AND EXISTS (SELECT 1 FROM public.approval_step_actions a2 WHERE a2.step_id = s.id)),
  0,
  'no step with configured actions drifts from allowed_actions');

SELECT * FROM finish();
ROLLBACK;
