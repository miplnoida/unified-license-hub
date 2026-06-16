
CREATE OR REPLACE FUNCTION public.resume_registration_workflow(
  _registration_id uuid,
  _actor_id uuid,
  _comments text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reg record;
  v_instance record;
  v_now timestamptz := now();
BEGIN
  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);

  IF _actor_id IS NULL THEN
    RETURN jsonb_build_object('error','UNAUTHORIZED','code','UNAUTHORIZED','http',401);
  END IF;

  SELECT id, status, user_id, registration_reference
    INTO v_reg
    FROM public.registrations
   WHERE id = _registration_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Registration not found','code','NOT_FOUND','http',404);
  END IF;

  -- Only the owning applicant may resume their own paused workflow via this RPC.
  IF v_reg.user_id IS DISTINCT FROM _actor_id THEN
    RETURN jsonb_build_object('error','Only the applicant can resume this workflow','code','FORBIDDEN','http',403);
  END IF;

  SELECT id, workflow_id, workflow_version_id, current_step_id, status
    INTO v_instance
    FROM public.workflow_instances
   WHERE entity_id = _registration_id
     AND entity_type = 'registration'
     AND status IN ('active','paused')
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  -- No instance: nothing to resume (registration may never have been routed yet).
  IF NOT FOUND THEN
    UPDATE public.registrations
       SET status = 'pending_review', updated_at = v_now
     WHERE id = _registration_id;
    RETURN jsonb_build_object('success', true, 'resumed', false, 'matched', false, 'http', 200);
  END IF;

  IF v_instance.status = 'paused' THEN
    UPDATE public.workflow_instances
       SET status = 'active', updated_at = v_now
     WHERE id = v_instance.id;
  END IF;

  -- Set registration back to in_progress so the approver UI no longer renders the paused/awaiting-applicant state.
  UPDATE public.registrations
     SET status = 'in_progress', updated_at = v_now
   WHERE id = _registration_id;

  -- Audit trail: record an applicant-side resubmission action against the current step.
  IF v_instance.current_step_id IS NOT NULL THEN
    INSERT INTO public.approval_actions (
      workflow_instance_id, step_id, actor_id, action, action_type, comments,
      entity_type, entity_id, workflow_version_id
    ) VALUES (
      v_instance.id, v_instance.current_step_id, _actor_id,
      'resubmit', 'resubmit', COALESCE(_comments, 'Applicant resubmitted registration'),
      'registration', _registration_id, v_instance.workflow_version_id
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'resumed', true,
    'matched', true,
    'instance_id', v_instance.id,
    'workflow_id', v_instance.workflow_id,
    'current_step_id', v_instance.current_step_id,
    'http', 200
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resume_registration_workflow(uuid, uuid, text) TO authenticated, service_role;
