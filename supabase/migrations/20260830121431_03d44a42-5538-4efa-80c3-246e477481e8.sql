REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.ubo_policies FROM authenticated;
REVOKE ALL ON public.ubo_policies FROM anon;
REVOKE ALL ON FUNCTION public.entity_ownership_network_core(uuid,date,int,int) FROM anon, authenticated;