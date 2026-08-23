-- Registration transitions run through a service_role edge wrapper too; resolve
-- the actor with the shared guard so both paths work and neither can spoof.
create or replace function public.perform_registration_workflow_transition(
  _registration_id uuid,
  _instance_id uuid,
  _step_id uuid,
  _action_type text,
  _comments text default null,
  _actor_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
DECLARE
  v_actor uuid;
BEGIN
  BEGIN
    v_actor := public.workflow_resolve_actor(_actor_id);
  EXCEPTION WHEN insufficient_privilege THEN
    RETURN jsonb_build_object('error', SQLERRM, 'code', SQLERRM,
                              'http', CASE WHEN SQLERRM = 'UNAUTHORIZED' THEN 401 ELSE 403 END);
  END;

  RETURN public.perform_registration_workflow_transition_internal(
    _registration_id, _instance_id, _step_id, _action_type, _comments, v_actor);
END;
$fn$;