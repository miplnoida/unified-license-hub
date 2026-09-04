REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.dms_ingest_sessions FROM authenticated;
REVOKE ALL ON public.dms_ingest_sessions FROM anon;
GRANT SELECT ON public.dms_ingest_sessions TO authenticated;
GRANT ALL ON public.dms_ingest_sessions TO service_role;
