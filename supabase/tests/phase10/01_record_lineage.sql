-- ============================================================
-- PHASE 10 / TEST 01 — DATA LINEAGE BEHAVIOUR
-- Proves record_lineage merges both audit sources, computes
-- field-level diffs, and is denied to unauthorized callers.
-- ============================================================
BEGIN;
SELECT plan(16);

-- ---------- structure ----------
SELECT has_function('public', 'record_lineage', ARRAY['text', 'text', 'integer'],
  'record_lineage(object_type, object_id, limit) exists');
SELECT has_function('public', 'jsonb_changed_fields', ARRAY['jsonb', 'jsonb'],
  'jsonb_changed_fields diff helper exists');
SELECT has_function('public', 'can_view_lineage', ARRAY['uuid'],
  'can_view_lineage authorization helper exists');
SELECT is(
  (SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'record_lineage'),
  true, 'record_lineage is SECURITY DEFINER');

-- ---------- diff helper ----------
SELECT is(
  public.jsonb_changed_fields('{"a":1,"b":2}'::jsonb, '{"a":1,"b":3}'::jsonb),
  ARRAY['b']::text[], 'diff returns only the changed key');
SELECT is(
  public.jsonb_changed_fields('{"a":1}'::jsonb, '{"a":1}'::jsonb),
  ARRAY[]::text[], 'identical payloads produce no changed fields');
SELECT is(
  public.jsonb_changed_fields(NULL, '{"a":1}'::jsonb),
  ARRAY['a']::text[], 'insert (null before) reports the new key');
SELECT is(
  public.jsonb_changed_fields('{"a":1}'::jsonb, NULL),
  ARRAY['a']::text[], 'delete (null after) reports the removed key');

-- ---------- fixtures ----------
CREATE TEMP TABLE _p10 AS
SELECT gen_random_uuid() AS admin_id,
       gen_random_uuid() AS stranger_id,
       gen_random_uuid()::text AS obj_id;

INSERT INTO auth.users (id, email)
SELECT admin_id, 'p10-admin@test.local' FROM _p10
UNION ALL SELECT stranger_id, 'p10-stranger@test.local' FROM _p10;

INSERT INTO public.user_roles (user_id, role)
SELECT admin_id, 'super_admin'::app_role FROM _p10;

INSERT INTO public.compliance_audit_logs
  (user_id, user_role, action_type, object_type, object_id, before_value, after_value, justification, timestamp)
SELECT admin_id, 'super_admin', 'UPDATE'::compliance_audit_action, 'p10_widget', obj_id,
       '{"status":"draft","amount":10}'::jsonb,
       '{"status":"approved","amount":10}'::jsonb,
       'Approved after review', now() - interval '1 hour'
FROM _p10;

INSERT INTO public.audit_logs
  (user_id, user_role, action, entity_type, entity_id, old_value, new_value, created_at)
SELECT admin_id, 'super_admin', 'create', 'p10_widget', obj_id,
       NULL, '{"status":"draft","amount":10}'::jsonb, now() - interval '2 hours'
FROM _p10;

-- ---------- authorized read ----------
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT admin_id::text FROM _p10), 'role', 'authenticated')::text, true);

SELECT is(
  (SELECT count(*)::int FROM public.record_lineage('p10_widget', (SELECT obj_id FROM _p10))),
  2, 'lineage merges compliance + activity log rows for the record');

SELECT is(
  (SELECT array_agg(source ORDER BY event_at)
     FROM public.record_lineage('p10_widget', (SELECT obj_id FROM _p10))),
  ARRAY['audit_logs', 'compliance_audit_logs']::text[],
  'both audit sources are labelled and chronologically ordered');

SELECT is(
  (SELECT changed_fields FROM public.record_lineage('p10_widget', (SELECT obj_id FROM _p10))
     WHERE source = 'compliance_audit_logs'),
  ARRAY['status']::text[], 'only the status field is reported as changed on the update event');

SELECT is(
  (SELECT justification FROM public.record_lineage('p10_widget', (SELECT obj_id FROM _p10))
     WHERE source = 'compliance_audit_logs'),
  'Approved after review', 'justification is surfaced with the lineage event');

SELECT is(
  (SELECT count(*)::int FROM public.record_lineage('p10_widget', gen_random_uuid()::text)),
  0, 'unrelated record id returns no lineage (no cross-record leakage)');

-- ---------- unauthorized reads ----------
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT stranger_id::text FROM _p10), 'role', 'authenticated')::text, true);
SELECT throws_ok(
  format('SELECT * FROM public.record_lineage(%L, %L)', 'p10_widget', (SELECT obj_id FROM _p10)),
  NULL, NULL, 'a user without audit permission cannot read lineage even with the record id');

RESET role;
SELECT set_config('request.jwt.claims', NULL, true);
SET LOCAL role anon;
SELECT throws_ok(
  format('SELECT * FROM public.record_lineage(%L, %L)', 'p10_widget', (SELECT obj_id FROM _p10)),
  NULL, NULL, 'anonymous callers are denied lineage access');
RESET role;

SELECT * FROM finish();
ROLLBACK;
