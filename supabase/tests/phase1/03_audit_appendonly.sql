-- Phase 1 / AUD-SEC-001 + AUD-OVR-001 — audit ledger integrity
--
-- Security event log and override registry must be append-only for every client
-- role, redact credential-like payload keys, and refuse actor spoofing.

BEGIN;
SELECT plan(21);

SELECT has_table('public', 'security_event_logs', 'security_event_logs exists');
SELECT has_table('public', 'rule_overrides', 'rule_overrides exists');
SELECT has_column('public', 'security_event_logs', 'severity', 'security log has severity');
SELECT has_column('public', 'security_event_logs', 'module', 'security log has module');
SELECT has_column('public', 'security_event_logs', 'correlation_id', 'security log has correlation_id');
SELECT has_column('public', 'rule_overrides', 'evidence_refs', 'override register has evidence_refs');
SELECT has_column('public', 'rule_overrides', 'correlation_id', 'override register has correlation_id');

-- ---------------------------------------------------------------------------
-- Append-only grants
-- ---------------------------------------------------------------------------
SELECT ok(NOT has_table_privilege('authenticated', 'public.security_event_logs', 'UPDATE'),
          'authenticated cannot update security events');
SELECT ok(NOT has_table_privilege('authenticated', 'public.security_event_logs', 'DELETE'),
          'authenticated cannot delete security events');
SELECT ok(NOT has_table_privilege('authenticated', 'public.security_event_logs', 'TRUNCATE'),
          'authenticated cannot truncate security events');
SELECT ok(NOT has_table_privilege('anon', 'public.security_event_logs', 'SELECT'),
          'anon cannot read security events');
SELECT ok(NOT has_table_privilege('authenticated', 'public.rule_overrides', 'UPDATE'),
          'authenticated cannot update overrides');
SELECT ok(NOT has_table_privilege('authenticated', 'public.rule_overrides', 'DELETE'),
          'authenticated cannot delete overrides');
SELECT ok(NOT has_table_privilege('authenticated', 'public.rule_overrides', 'TRUNCATE'),
          'authenticated cannot truncate overrides');
SELECT ok(NOT has_table_privilege('anon', 'public.rule_overrides', 'SELECT'),
          'anon cannot read overrides');

-- Actor-spoofing surface is server-only.
SELECT ok(NOT has_function_privilege('authenticated',
            'public.log_security_event_as_actor(uuid,security_event_type,text,inet,text,jsonb,jsonb,text,text,text,text,text,text)',
            'EXECUTE'),
          'authenticated cannot log security events as another actor');
SELECT ok(has_function_privilege('service_role',
            'public.log_security_event_as_actor(uuid,security_event_type,text,inet,text,jsonb,jsonb,text,text,text,text,text,text)',
            'EXECUTE'),
          'service_role can log security events as an actor');

-- ---------------------------------------------------------------------------
-- Redaction
-- ---------------------------------------------------------------------------
SELECT is(
  public.redact_sensitive_jsonb(
    '{"api_key":"abc123","access_token":"t","note":"visible"}'::jsonb) ->> 'api_key',
  '[redacted]', 'api_key redacted');
SELECT is(
  public.redact_sensitive_jsonb(
    '{"api_key":"abc123","access_token":"t","note":"visible"}'::jsonb) ->> 'note',
  'visible', 'non-sensitive keys preserved');

-- ---------------------------------------------------------------------------
-- Behavioural: logged events are immutable and redacted on write.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _sec_probe(event_id uuid);

DO $$
DECLARE
  v_actor uuid := '00000000-0000-0000-0000-0000000f0001';
  v_id uuid;
BEGIN
  INSERT INTO public.user_roles (user_id, role) VALUES (v_actor, 'admin') ON CONFLICT DO NOTHING;
  v_id := public.log_security_event_as_actor(
    v_actor, 'ACCESS_DENIED'::security_event_type, 'phase1_probe', NULL, NULL,
    '{"password":"hunter2","reason":"phase1"}'::jsonb, '{}'::jsonb,
    'high', 'license_management', 'issue', 'decision_artifact', 'probe', 'corr-phase1');
  INSERT INTO _sec_probe(event_id) VALUES (v_id);
END$$;

SELECT is((SELECT detail ->> 'password' FROM public.security_event_logs
           WHERE id = (SELECT event_id FROM _sec_probe)),
          '[redacted]', 'credential key redacted at write time');
SELECT is((SELECT severity FROM public.security_event_logs
           WHERE id = (SELECT event_id FROM _sec_probe)),
          'high', 'severity persisted');
SELECT is((SELECT correlation_id FROM public.security_event_logs
           WHERE id = (SELECT event_id FROM _sec_probe)),
          'corr-phase1', 'correlation id persisted');

SELECT throws_ok(
  $$DELETE FROM public.security_event_logs WHERE id = (SELECT event_id FROM _sec_probe)$$,
  NULL, NULL, 'security events cannot be deleted');

SELECT * FROM finish();
ROLLBACK;
