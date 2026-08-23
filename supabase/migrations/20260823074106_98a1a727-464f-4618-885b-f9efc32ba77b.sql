REVOKE EXECUTE ON FUNCTION public.cert_v2_exec_unguarded(text, text, uuid[]) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cert_v2_cascade_delete(text, uuid[], integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cert_v2_pk_column(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cert_v2_register_legacy_baseline(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cert_v2_repair_web_user_links() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cert_v2_reset(text) FROM anon;