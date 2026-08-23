-- P01 hardening: the registration workflow actor is the authenticated caller.
-- A caller-supplied _actor_id may not differ from auth.uid() (actor spoofing),
-- and NULL now resolves to the caller instead of failing the action.
create or replace function public.perform_registration_workflow_transition(
  _registration_id uuid,
  _instance_id uuid,
  _step_id uuid,
  _action_type text,
  _comments text,
  _actor_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
DECLARE
  v_actor uuid;
  v_result jsonb;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('error','UNAUTHORIZED','code','UNAUTHORIZED','http',401);
  END IF;
  IF _actor_id IS NOT NULL AND _actor_id <> v_actor THEN
    RETURN jsonb_build_object('error','Actor mismatch','code','ACTOR_MISMATCH','http',403);
  END IF;
  v_result := public.perform_registration_workflow_transition_internal(
    _registration_id, _instance_id, _step_id, _action_type, _comments, v_actor);
  RETURN v_result;
END;
$fn$;