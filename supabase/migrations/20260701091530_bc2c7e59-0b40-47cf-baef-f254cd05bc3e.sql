-- Tighten audit table/view grants and audit RPC execution grants.
-- No tables are created in this migration.

REVOKE ALL ON TABLE public.audit_logs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.compliance_audit_logs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.security_event_logs FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.audit_logs TO authenticated;
GRANT SELECT ON TABLE public.compliance_audit_logs TO authenticated;
GRANT SELECT ON TABLE public.security_event_logs TO authenticated;

GRANT ALL ON TABLE public.audit_logs TO service_role;
GRANT ALL ON TABLE public.compliance_audit_logs TO service_role;
GRANT ALL ON TABLE public.security_event_logs TO service_role;

REVOKE ALL ON TABLE public.audit_timeline FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.audit_timeline TO authenticated;
GRANT ALL ON TABLE public.audit_timeline TO service_role;

REVOKE ALL ON FUNCTION public.log_compliance_audit(compliance_audit_action, text, text, jsonb, jsonb, text, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.log_security_event(security_event_type, text, text, text, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.log_self_audit(text, text, text, jsonb, jsonb, jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.log_compliance_audit(compliance_audit_action, text, text, jsonb, jsonb, text, text, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_security_event(security_event_type, text, text, text, jsonb, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_self_audit(text, text, text, jsonb, jsonb, jsonb) TO authenticated, service_role;