REVOKE ALL ON FUNCTION public.compat_view_write_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.legacy_supervisory_plan_write_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.examination_provenance_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compat_view_write_guard() TO service_role;
GRANT EXECUTE ON FUNCTION public.legacy_supervisory_plan_write_guard() TO service_role;
GRANT EXECUTE ON FUNCTION public.examination_provenance_guard() TO service_role;