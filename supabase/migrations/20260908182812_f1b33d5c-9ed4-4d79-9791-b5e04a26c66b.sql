REVOKE EXECUTE ON FUNCTION public.supervisory_methodology_require_authoring(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.supervisory_methodology_require_authoring(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.supervisory_methodology_require_authoring(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_methodology_require_authoring(uuid) TO service_role;