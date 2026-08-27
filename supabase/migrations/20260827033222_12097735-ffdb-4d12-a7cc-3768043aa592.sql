-- Convergence hardening: project default privileges grant ALL on newly created
-- public tables to anon/authenticated. Revoke and re-grant read-only where intended.
-- Authoritative writes stay inside governed SECURITY DEFINER RPCs.

REVOKE ALL ON public.regulator_operating_scopes FROM anon, authenticated;
REVOKE ALL ON public.decision_authority_rules FROM anon, authenticated;
REVOKE ALL ON public.decision_authority_observations FROM anon, authenticated;
REVOKE ALL ON public.work_allocation_policies FROM anon, authenticated;
REVOKE ALL ON public.regulatory_service_tasks FROM anon, authenticated;
REVOKE ALL ON public.service_providers FROM anon, authenticated;
REVOKE ALL ON public.service_provider_members FROM anon, authenticated;
REVOKE ALL ON public.provider_engagements FROM anon, authenticated;
REVOKE ALL ON public.provider_work_packages FROM anon, authenticated;
REVOKE ALL ON public.provider_work_package_events FROM anon, authenticated;

GRANT SELECT ON public.regulator_operating_scopes TO authenticated;
GRANT SELECT ON public.decision_authority_rules TO authenticated;
GRANT SELECT ON public.decision_authority_observations TO authenticated;
GRANT SELECT ON public.work_allocation_policies TO authenticated;
GRANT SELECT ON public.regulatory_service_tasks TO authenticated;
GRANT SELECT ON public.service_providers TO authenticated;
GRANT SELECT ON public.service_provider_members TO authenticated;
GRANT SELECT ON public.provider_engagements TO authenticated;
GRANT SELECT ON public.provider_work_packages TO authenticated;
GRANT SELECT ON public.provider_work_package_events TO authenticated;

GRANT ALL ON public.regulator_operating_scopes,
             public.decision_authority_rules,
             public.decision_authority_observations,
             public.work_allocation_policies,
             public.regulatory_service_tasks,
             public.service_providers,
             public.service_provider_members,
             public.provider_engagements,
             public.provider_work_packages,
             public.provider_work_package_events TO service_role;