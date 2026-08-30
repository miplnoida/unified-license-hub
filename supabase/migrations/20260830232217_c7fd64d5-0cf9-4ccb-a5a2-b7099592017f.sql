-- Data API grants were missing for the CAMELS component rating table even though
-- INSERT/UPDATE/DELETE policies exist for it, so authorised prudential actors
-- could not write ratings at all.
GRANT INSERT, UPDATE, DELETE ON public.prudential_assessment_component_ratings TO authenticated;
GRANT ALL ON public.prudential_assessment_component_ratings TO service_role;

-- Defence in depth: anonymous callers hold no policy on these prudential
-- configuration tables, so their write grants are dead privilege.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.prudential_ewi_rules FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.prudential_assessment_components FROM anon;
