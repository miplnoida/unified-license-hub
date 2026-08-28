ALTER VIEW public.v_f4_privilege_census SET (security_invoker = true);
ALTER VIEW public.v_licensing_provisioning_health SET (security_invoker = true);

REVOKE ALL ON FUNCTION public.enforce_licensee_license_id_legacy() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_applications_enqueue_provisioning() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_application_status_vocabulary() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.licensing_provisioning_assert_worker() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.f4_estate_tables() FROM PUBLIC, anon;