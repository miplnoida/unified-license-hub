REVOKE EXECUTE ON FUNCTION public.supervisory_risk_monitoring_schedule_internal(uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.supervisory_risk_monitoring_events_internal(uuid, text, timestamptz) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.supervisory_risk_monitoring_writer_guard() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.supervisory_risk_monitoring_immutable_guard() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.supervisory_risk_monitoring_view(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.supervisory_risk_monitoring_due_list(text, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.supervisory_risk_monitoring_require_reassessment(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.supervisory_risk_monitoring_reschedule(jsonb) FROM anon;