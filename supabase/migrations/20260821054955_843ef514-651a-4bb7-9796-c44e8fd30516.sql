-- FINAL CERTIFICATION CLOSURE: explicit deny-all on service-only token table
CREATE POLICY "worker_invocation_tokens_no_client_access"
ON public.worker_invocation_tokens
FOR ALL
TO authenticated, anon
USING (false)
WITH CHECK (false);

REVOKE ALL ON public.worker_invocation_tokens FROM anon, authenticated;
GRANT ALL ON public.worker_invocation_tokens TO service_role;