-- Harness routines are server/service-context only: remove signed-in EXECUTE.
REVOKE EXECUTE ON FUNCTION public.cert_v2_cascade_delete(text, uuid[], integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cert_v2_register_legacy_baseline(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cert_v2_repair_web_user_links() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cert_v2_integrity_gate() FROM anon;
GRANT EXECUTE ON FUNCTION public.cert_v2_integrity_gate() TO authenticated;