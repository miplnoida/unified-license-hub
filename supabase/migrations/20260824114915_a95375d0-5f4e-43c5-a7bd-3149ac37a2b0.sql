CREATE OR REPLACE FUNCTION public.is_doc_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.is_internal_staff(_user_id);
$function$;