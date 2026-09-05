REVOKE EXECUTE ON FUNCTION public.supervisory_engagement_types() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.supervisory_intervention_execution_contract(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.supervisory_intervention_execution_capabilities(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_engagement_types() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_intervention_execution_contract(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_intervention_execution_capabilities(uuid) TO authenticated, service_role;