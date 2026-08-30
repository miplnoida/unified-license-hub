-- SR-22: public.entity_user_access had no Data-API grants, so every
-- SECURITY INVOKER read path (sup_dashboard_summary, sup_entity_supervisory_state)
-- and the Entity 360 Primary User card failed with 42501
-- "permission denied for table entity_user_access".
-- RLS (eua_select / eua_admin_write) already scopes visibility; only the
-- missing GRANT is added. No write privilege is granted to `authenticated`:
-- provisioning stays with the service-role edge functions.
GRANT SELECT ON public.entity_user_access TO authenticated;
GRANT ALL ON public.entity_user_access TO service_role;