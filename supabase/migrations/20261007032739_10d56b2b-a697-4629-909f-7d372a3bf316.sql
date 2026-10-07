CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _module text, _action text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN _user_id IS NOT NULL
     AND (public.is_super_admin(_user_id) OR public.sec_has_permission(_user_id, _module, _action));
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN _user_id IS NOT NULL AND public.has_role(_user_id, 'super_admin'::app_role);
END;
$function$;