-- GAP-F0-16: final approval must resolve the acting user server-side.
-- Previously _actor_id was trusted as supplied by the caller, so any signed-in
-- user could present another user's id as the approver.
CREATE OR REPLACE FUNCTION public.perform_final_workflow_approval(
  _application_id uuid,
  _instance_id uuid,
  _step_id uuid,
  _comments text,
  _actor_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_result jsonb;
BEGIN
  BEGIN
    _actor_id := public.workflow_resolve_actor(_actor_id);
  EXCEPTION WHEN insufficient_privilege THEN
    RETURN jsonb_build_object('error', SQLERRM, 'code', SQLERRM,
                              'http', CASE WHEN SQLERRM = 'UNAUTHORIZED' THEN 401 ELSE 403 END);
  END;

  v_result := public.perform_final_workflow_approval_governed(
    _application_id, _instance_id, _step_id, _comments, _actor_id);
  RETURN v_result;
END
$fn$;

REVOKE ALL ON FUNCTION public.perform_final_workflow_approval(uuid, uuid, uuid, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.perform_final_workflow_approval(uuid, uuid, uuid, text, uuid)
  TO authenticated, service_role, app_certification_runner;