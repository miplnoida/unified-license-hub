REVOKE ALL ON FUNCTION public.supervisory_policy_component_capability(text) FROM anon;
REVOKE ALL ON FUNCTION public.supervisory_policy_vocabulary(text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.supervisory_policy_component_content_hash(text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.supervisory_policy_component_content_hash(text, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.supervisory_policy_profile_compatibility(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.supervisory_policy_profile_effective(text, uuid, uuid, uuid, date) FROM anon;
REVOKE ALL ON FUNCTION public.supervisory_assessment_policy_basis(uuid) FROM anon;