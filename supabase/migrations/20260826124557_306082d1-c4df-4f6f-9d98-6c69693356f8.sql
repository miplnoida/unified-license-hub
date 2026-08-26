-- MC-07.2 hardening: the project grants broad default privileges on new public tables,
-- so revoke them explicitly and re-grant read-only access.

REVOKE ALL ON public.conduct_ai_use_cases      FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.conduct_ai_insights       FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.conduct_ai_review_events  FROM anon, authenticated, PUBLIC;

GRANT SELECT ON public.conduct_ai_use_cases     TO authenticated;
GRANT SELECT ON public.conduct_ai_insights      TO authenticated;
GRANT SELECT ON public.conduct_ai_review_events TO authenticated;

GRANT ALL ON public.conduct_ai_use_cases     TO service_role;
GRANT ALL ON public.conduct_ai_insights      TO service_role;
GRANT ALL ON public.conduct_ai_review_events TO service_role;