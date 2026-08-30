REVOKE MAINTAIN ON public.ubo_policies FROM authenticated;
REVOKE ALL ON public.party_kinds FROM anon, authenticated;
GRANT SELECT ON public.party_kinds TO anon, authenticated;
GRANT ALL ON public.party_kinds TO service_role;