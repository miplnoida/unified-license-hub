
REVOKE INSERT, UPDATE, DELETE ON public.compliance_returns FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.compliance_returns FROM anon;
GRANT SELECT ON public.compliance_returns TO authenticated;
GRANT ALL ON public.compliance_returns TO service_role;
