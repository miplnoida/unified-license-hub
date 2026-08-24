ALTER VIEW public.v_available_business_types SET (security_invoker = true);
ALTER VIEW public.v_available_authorization_classes SET (security_invoker = true);

CREATE OR REPLACE FUNCTION public.classification_norm(_v text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT lower(regexp_replace(btrim(coalesce(_v,'')), '\s+', ' ', 'g'))
$$;

CREATE OR REPLACE FUNCTION public.current_regulatory_profile()
RETURNS public.regulatory_profiles
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT * FROM public.regulatory_profiles WHERE is_current AND status = 'active' LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.current_regulatory_profile() TO authenticated, anon;