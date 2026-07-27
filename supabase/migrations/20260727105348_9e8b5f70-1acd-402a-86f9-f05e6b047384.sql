REVOKE EXECUTE ON FUNCTION public.create_complaint(jsonb) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_complaint(text, jsonb) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_complaint_with_attachments(text, jsonb, uuid[], text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finalize_complaint_with_attachments(uuid, uuid[]) FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_complaint(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_complaint(text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_complaint_with_attachments(text, jsonb, uuid[], text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_complaint_with_attachments(uuid, uuid[]) TO authenticated, service_role;