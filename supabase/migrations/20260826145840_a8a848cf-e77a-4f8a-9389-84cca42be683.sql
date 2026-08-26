-- MC-09: the internal helpers must not be reachable without signing in.
REVOKE ALL ON FUNCTION public.conduct_emerging_risk_require(text[]) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.conduct_emerging_risk_guard(uuid, text[]) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.conduct_emerging_risk_next_reference() FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.conduct_emerging_risk_create(jsonb) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.conduct_emerging_risk_transition(uuid, text, text) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.conduct_emerging_risk_link_record(uuid, text, uuid, text, text) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.conduct_cross_entity_snapshot(uuid, integer, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.conduct_emerging_risk_create(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_emerging_risk_transition(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_emerging_risk_link_record(uuid, text, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_cross_entity_snapshot(uuid, integer, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_emerging_risk_require(text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_emerging_risk_guard(uuid, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_emerging_risk_next_reference() TO service_role;