REVOKE ALL ON TABLE public.audit_timeline FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.audit_timeline TO authenticated;
GRANT ALL ON TABLE public.audit_timeline TO service_role;