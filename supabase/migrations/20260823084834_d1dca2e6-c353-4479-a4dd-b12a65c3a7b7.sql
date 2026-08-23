CREATE OR REPLACE FUNCTION public.cert_v2_table_classification()
 RETURNS TABLE(table_name text, category text, reason text, row_count bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  -- worker_invocation_tokens holds single-use, self-expiring tokens minted by the
  -- platform's own pg_cron schedulers every minute. It is ephemeral infrastructure,
  -- never business runtime, and can never be observed at zero on a live database.
  RETURN QUERY
    SELECT b.table_name,
           CASE WHEN b.table_name = 'worker_invocation_tokens'
                THEN 'INFRA_EPHEMERAL_KEEP' ELSE b.category END,
           CASE WHEN b.table_name = 'worker_invocation_tokens'
                THEN 'Ephemeral scheduler invocation tokens (self-expiring, minted by pg_cron)'
                ELSE b.reason END,
           b.row_count
      FROM public.cert_v2_table_classification_base() b
     ORDER BY 2, 1;
END;
$function$;
REVOKE ALL ON FUNCTION public.cert_v2_table_classification() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cert_v2_table_classification() TO service_role;