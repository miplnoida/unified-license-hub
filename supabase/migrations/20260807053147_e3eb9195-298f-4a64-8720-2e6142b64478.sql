-- Phase 1 hardening: append-only integrity + server-controlled security events

-- 1. TRUNCATE (and any residual UPDATE/DELETE) bypasses RLS. Revoke it so the
--    append-only guarantees on these ledgers actually hold for app clients.
REVOKE TRUNCATE, UPDATE, DELETE ON public.decision_artifacts FROM anon, authenticated;
REVOKE TRUNCATE, UPDATE, DELETE ON public.rule_overrides FROM anon, authenticated;
REVOKE TRUNCATE, UPDATE, DELETE ON public.security_event_logs FROM anon, authenticated;
REVOKE TRUNCATE, UPDATE, DELETE ON public.sla_stage_instances FROM anon, authenticated;
REVOKE TRUNCATE, UPDATE, DELETE ON public.sla_stage_events FROM anon, authenticated;

-- SLA ledgers are written only by SECURITY DEFINER runtime functions / service role.
REVOKE INSERT ON public.sla_stage_instances FROM anon, authenticated;
REVOKE INSERT ON public.sla_stage_events FROM anon, authenticated;

-- decision_artifacts are written only through issue_decision_artifact().
REVOKE INSERT ON public.decision_artifacts FROM anon, authenticated;
REVOKE SELECT, INSERT ON public.decision_artifacts FROM anon;
REVOKE SELECT, INSERT ON public.rule_overrides FROM anon;

GRANT ALL ON public.decision_artifacts TO service_role;
GRANT ALL ON public.rule_overrides TO service_role;
GRANT ALL ON public.security_event_logs TO service_role;
GRANT ALL ON public.sla_stage_instances TO service_role;
GRANT ALL ON public.sla_stage_events TO service_role;

-- 2. Explicit deny-write policies so intent is readable on the SLA ledgers.
DROP POLICY IF EXISTS sla_stage_instances_no_client_write ON public.sla_stage_instances;
CREATE POLICY sla_stage_instances_no_client_write
  ON public.sla_stage_instances FOR INSERT TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS sla_stage_instances_no_update ON public.sla_stage_instances;
CREATE POLICY sla_stage_instances_no_update
  ON public.sla_stage_instances FOR UPDATE TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS sla_stage_instances_no_delete ON public.sla_stage_instances;
CREATE POLICY sla_stage_instances_no_delete
  ON public.sla_stage_instances FOR DELETE TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS sla_stage_events_no_client_write ON public.sla_stage_events;
CREATE POLICY sla_stage_events_no_client_write
  ON public.sla_stage_events FOR INSERT TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS sla_stage_events_no_update ON public.sla_stage_events;
CREATE POLICY sla_stage_events_no_update
  ON public.sla_stage_events FOR UPDATE TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS sla_stage_events_no_delete ON public.sla_stage_events;
CREATE POLICY sla_stage_events_no_delete
  ON public.sla_stage_events FOR DELETE TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS decision_artifacts_no_client_insert ON public.decision_artifacts;
CREATE POLICY decision_artifacts_no_client_insert
  ON public.decision_artifacts FOR INSERT TO anon, authenticated
  WITH CHECK (false);

-- 3. Security events must never be attributable to a caller-supplied actor from
--    a client. Restrict every log_security_event_as_actor overload to server roles.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'log_security_event_as_actor'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- SLA runtime mutators are server-side only as well.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('sla_stage_open','sla_stage_pause','sla_stage_resume','sla_stage_complete',
                        'sla_stage_mark_breached','sla_stage_mark_escalated','sla_stage_log_event')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;