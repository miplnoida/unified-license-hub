REVOKE ALL ON FUNCTION public.get_return_revisions(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_return_revisions(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_return_revisions(uuid) TO authenticated;