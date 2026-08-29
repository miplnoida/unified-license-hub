REVOKE ALL ON FUNCTION public.set_application_fp_subject(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_application_fp_subject(uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_application_fp_subject(uuid, uuid, text) TO authenticated;