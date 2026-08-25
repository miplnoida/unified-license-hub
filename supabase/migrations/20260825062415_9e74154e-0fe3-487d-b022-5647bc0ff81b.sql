REVOKE EXECUTE ON FUNCTION public.support_is_staff(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.support_is_staff(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.generate_support_ticket_number() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.generate_support_ticket_number() TO authenticated, service_role;