-- Phase 1 / AUD-SEC-001 + AUD-OVR-001 — audit ledger integrity
--
-- Security event log and override registry must be append-only for every client
-- role, redact credential-like payload keys, and refuse actor spoofing.

BEGIN;
SELECT plan(29);

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


-- ---------------------------------------------------------------------------
-- AUD-OVR-001 — override registry: justified appends only, never mutations.
-- ---------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f0001","role":"authenticated"}';

CREATE TEMP TABLE _ovr_probe(override_id uuid);

SELECT throws_ok(
  $$SELECT public.log_rule_override('licensing', 'application',
      '00000000-0000-0000-0000-0000000f0002', 'sufficiency.blocker',
      '{"status":"fail"}'::jsonb, '{"status":"overridden"}'::jsonb, 'too short', '{}'::jsonb)$$,
  NULL, NULL, 'an override without a substantive justification is refused');

SELECT throws_ok(
  $$SELECT public.log_rule_override('licensing', 'application',
      '00000000-0000-0000-0000-0000000f0002', '   ',
      '{"status":"fail"}'::jsonb, '{"status":"overridden"}'::jsonb,
      'Supervisory committee accepted the residual risk.', '{}'::jsonb)$$,
  NULL, NULL, 'an override without a rule key is refused');

DO $$
DECLARE v_id uuid;
BEGIN
  v_id := public.log_rule_override('licensing', 'application',
    '00000000-0000-0000-0000-0000000f0002', 'sufficiency.blocker',
    '{"status":"fail"}'::jsonb, '{"status":"overridden"}'::jsonb,
    'Supervisory committee accepted the residual risk on file.',
    jsonb_build_object('correlation_id', 'corr-phase1-ovr'));
  INSERT INTO _ovr_probe(override_id) VALUES (v_id);
END$$;

SELECT is((SELECT user_id FROM public.rule_overrides
           WHERE id = (SELECT override_id FROM _ovr_probe)),
          '00000000-0000-0000-0000-0000000f0001'::uuid,
          'override is attributed to the acting user, not the caller-supplied actor');

SELECT is((SELECT count(*)::int FROM public.audit_logs
           WHERE action = 'RULE_OVERRIDE'
             AND metadata ->> 'override_id' = (SELECT override_id::text FROM _ovr_probe)),
          1, 'override writes a matching audit trail entry');

SELECT throws_ok(
  $$UPDATE public.rule_overrides SET reason = 'rewritten justification'
     WHERE id = (SELECT override_id FROM _ovr_probe)$$,
  NULL, NULL, 'overrides cannot be updated');

SELECT throws_ok(
  $$DELETE FROM public.rule_overrides WHERE id = (SELECT override_id FROM _ovr_probe)$$,
  NULL, NULL, 'overrides cannot be deleted');

SELECT * FROM finish();
ROLLBACK;
