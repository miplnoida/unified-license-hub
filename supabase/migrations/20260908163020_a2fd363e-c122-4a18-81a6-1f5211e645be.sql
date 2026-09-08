REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.supervisory_policy_profile FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.supervisory_policy_profile_binding FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.supervisory_policy_profile_requirement FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.supervisory_policy_profile_event FROM authenticated;
GRANT SELECT ON public.supervisory_policy_profile TO authenticated;
GRANT SELECT ON public.supervisory_policy_profile_binding TO authenticated;
GRANT SELECT ON public.supervisory_policy_profile_requirement TO authenticated;
GRANT SELECT ON public.supervisory_policy_profile_event TO authenticated;