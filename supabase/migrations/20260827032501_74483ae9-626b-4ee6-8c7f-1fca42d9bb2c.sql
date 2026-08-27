-- Close the pre-existing "RLS disabled in public" linter error on a leftover
-- certification diagnostic table. It has no Data API grants, so enabling RLS
-- with no policies keeps it service-role/owner only.
ALTER TABLE public.cert_v2_diag ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cert_v2_diag FROM anon, authenticated;
GRANT ALL ON public.cert_v2_diag TO service_role;