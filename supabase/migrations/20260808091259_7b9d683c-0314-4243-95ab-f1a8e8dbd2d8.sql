CREATE OR REPLACE FUNCTION public.reconcile_stale_ai_assessments(_application_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count integer := 0;
BEGIN
  UPDATE public.application_ai_assessments a
     SET status = 'failed',
         error_message = 'Generation did not complete (timed out)'
   WHERE a.status = 'pending'
     AND a.created_at < now() - interval '10 minutes'
     AND (_application_id IS NULL OR a.application_id = _application_id)
     AND public.can_read_application(auth.uid(), a.application_id);
  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reconcile_stale_ai_assessments(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_stale_ai_assessments(uuid) TO authenticated, service_role;