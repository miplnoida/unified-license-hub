
GRANT SELECT ON public.sectors TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sectors TO authenticated;
GRANT ALL ON public.sectors TO service_role;

GRANT SELECT ON public.sub_sectors TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sub_sectors TO authenticated;
GRANT ALL ON public.sub_sectors TO service_role;

GRANT SELECT ON public.categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;

GRANT SELECT ON public.services TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT ALL ON public.services TO service_role;
