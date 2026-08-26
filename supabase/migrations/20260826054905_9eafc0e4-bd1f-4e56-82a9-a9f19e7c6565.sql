CREATE OR REPLACE FUNCTION public.guard_public_complaint_attachment_rpc()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
  RETURN;
END;
$function$;
REVOKE ALL ON FUNCTION public.guard_public_complaint_attachment_rpc() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_public_complaint_attachment_rpc() TO service_role;
DROP FUNCTION public.guard_public_complaint_attachment_rpc();