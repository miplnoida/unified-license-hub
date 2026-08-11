CREATE OR REPLACE FUNCTION public.create_complaint(_payload jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.create_complaint(
    COALESCE(
      NULLIF(_payload->>'variant',''),
      CASE WHEN COALESCE(_payload->>'intake_source','') IN ('internal','staff_intake')
           THEN 'internal' ELSE 'licensee' END
    ),
    _payload
  );
$function$;