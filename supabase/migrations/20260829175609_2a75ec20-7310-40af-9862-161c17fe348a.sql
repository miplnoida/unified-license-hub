-- F6-X privilege hygiene: browser roles keep read-only access to the monetary
-- master data and may never truncate, reference or attach triggers to it.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.currencies FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.monetary_configs FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.fx_rates FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.fx_conversions FROM authenticated;

REVOKE ALL ON public.currencies FROM anon;
REVOKE ALL ON public.monetary_configs FROM anon;
REVOKE ALL ON public.fx_rates FROM anon;
REVOKE ALL ON public.fx_conversions FROM anon;

GRANT SELECT ON public.currencies TO authenticated;
GRANT SELECT ON public.monetary_configs TO authenticated;
GRANT SELECT ON public.fx_rates TO authenticated;
GRANT SELECT ON public.fx_conversions TO authenticated;

GRANT ALL ON public.currencies TO service_role;
GRANT ALL ON public.monetary_configs TO service_role;
GRANT ALL ON public.fx_rates TO service_role;
GRANT ALL ON public.fx_conversions TO service_role;