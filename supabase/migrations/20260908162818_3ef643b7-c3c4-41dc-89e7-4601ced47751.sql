REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.supervisory_policy_domain_component_requirement FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.supervisory_policy_component_type FROM authenticated;
GRANT SELECT ON public.supervisory_policy_domain_component_requirement TO authenticated;
GRANT SELECT ON public.supervisory_policy_component_type TO authenticated;