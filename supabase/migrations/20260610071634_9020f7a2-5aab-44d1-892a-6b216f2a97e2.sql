ALTER TYPE public.return_workflow_status ADD VALUE IF NOT EXISTS 'REJ';

CREATE INDEX IF NOT EXISTS idx_return_audit_log_return_created
  ON public.return_audit_log (return_id, created_at DESC);

DROP POLICY IF EXISTS "Read audit log" ON public.return_audit_log;
CREATE POLICY "Read audit log"
ON public.return_audit_log
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.returns_filed r
    WHERE r.id = return_audit_log.return_id
      AND (
        r.created_by = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND (p.licensee_id = r.entity_id OR p.licensee_id = r.on_behalf_of_licensee_id)
        )
        OR EXISTS (
          SELECT 1
          FROM public.entity_user_access eua
          WHERE eua.user_id = auth.uid()
            AND eua.entity_id = COALESCE(r.on_behalf_of_licensee_id, r.entity_id)
            AND eua.is_active = true
        )
        OR public.has_role(auth.uid(), 'super_admin')
        OR public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'supervisor')
        OR public.has_role(auth.uid(), 'licensing_officer')
        OR public.has_role(auth.uid(), 'analyst')
      )
  )
);

DROP POLICY IF EXISTS "Insert audit log" ON public.return_audit_log;
CREATE POLICY "Insert audit log"
ON public.return_audit_log
FOR INSERT
TO authenticated
WITH CHECK (
  performed_by = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.returns_filed r
    WHERE r.id = return_audit_log.return_id
      AND (
        r.created_by = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND (p.licensee_id = r.entity_id OR p.licensee_id = r.on_behalf_of_licensee_id)
        )
        OR EXISTS (
          SELECT 1
          FROM public.entity_user_access eua
          WHERE eua.user_id = auth.uid()
            AND eua.entity_id = COALESCE(r.on_behalf_of_licensee_id, r.entity_id)
            AND eua.is_active = true
        )
        OR public.has_role(auth.uid(), 'super_admin')
        OR public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'supervisor')
        OR public.has_role(auth.uid(), 'licensing_officer')
        OR public.has_role(auth.uid(), 'analyst')
      )
  )
);

CREATE OR REPLACE FUNCTION public.start_return_workflow(_return_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workflow_id uuid;
  v_first_step uuid;
  v_instance_id uuid;
  v_existing_instance uuid;
  v_existing_step uuid;
  v_existing_status text;
  v_ret record;
BEGIN
  SELECT id, workflow_id, current_step_id, workflow_status
    INTO v_ret
    FROM public.returns_filed
   WHERE id = _return_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Return not found','code','NOT_FOUND','http',404);
  END IF;

  SELECT id, current_step_id, status
    INTO v_existing_instance, v_existing_step, v_existing_status
    FROM public.workflow_instances
   WHERE entity_id = _return_id
     AND entity_type = 'return'
     AND status IN ('active','paused')
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_existing_instance IS NOT NULL THEN
    SELECT workflow_id INTO v_workflow_id FROM public.workflow_instances WHERE id = v_existing_instance;
    UPDATE public.returns_filed
       SET current_step_id = COALESCE(v_existing_step, current_step_id),
           workflow_id = COALESCE(v_workflow_id, workflow_id),
           updated_at = now()
     WHERE id = _return_id;

    RETURN jsonb_build_object(
      'success', true,
      'reused', true,
      'instance_id', v_existing_instance,
      'workflow_id', v_workflow_id,
      'step_id', v_existing_step,
      'http', 200
    );
  END IF;

  v_workflow_id := v_ret.workflow_id;
  IF v_workflow_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'no_workflow', true, 'http', 200);
  END IF;

  SELECT id INTO v_first_step
    FROM public.approval_steps
   WHERE workflow_id = v_workflow_id
   ORDER BY step_order ASC
   LIMIT 1;

  IF v_first_step IS NULL THEN
    RETURN jsonb_build_object('error','Workflow has no steps','code','NO_STEPS','http',422);
  END IF;

  INSERT INTO public.workflow_instances (workflow_id, entity_type, entity_id, current_step_id, status, started_at)
  VALUES (v_workflow_id, 'return', _return_id, v_first_step, 'active', now())
  RETURNING id INTO v_instance_id;

  UPDATE public.returns_filed
     SET current_step_id = v_first_step,
         updated_at = now()
   WHERE id = _return_id;

  INSERT INTO public.return_audit_log
    (return_id, action, previous_status, new_status, comments, performed_by,
     previous_step_id, new_step_id, actor_role, metadata, event_key, source)
  VALUES
    (_return_id, 'workflow_started', v_ret.workflow_status::text, v_ret.workflow_status::text,
     'Workflow started', NULL, v_ret.current_step_id, v_first_step, NULL,
     jsonb_build_object('workflow_id', v_workflow_id, 'instance_id', v_instance_id),
     'return.workflow_started', 'rpc:start_return_workflow'),
    (_return_id, 'workflow_step_assigned', v_ret.workflow_status::text, v_ret.workflow_status::text,
     'Initial workflow step assigned', NULL, v_ret.current_step_id, v_first_step, NULL,
     jsonb_build_object('workflow_id', v_workflow_id, 'instance_id', v_instance_id, 'step_id', v_first_step),
     'return.workflow_step_assigned', 'rpc:start_return_workflow');

  RETURN jsonb_build_object(
    'success', true,
    'reused', false,
    'instance_id', v_instance_id,
    'workflow_id', v_workflow_id,
    'step_id', v_first_step,
    'http', 200
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resubmit_return(_return_id uuid, _actor_id uuid, _comments text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ret record;
  v_instance record;
  v_first_step uuid;
  v_closed_count int := 0;
BEGIN
  IF _actor_id IS NULL THEN
    RETURN jsonb_build_object('error','UNAUTHORIZED','code','UNAUTHORIZED','http',401);
  END IF;

  SELECT id, workflow_status, workflow_id, current_step_id
    INTO v_ret
    FROM public.returns_filed
   WHERE id = _return_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Return not found','code','NOT_FOUND','http',404);
  END IF;

  IF upper(v_ret.workflow_status::text) <> 'TBR' THEN
    RETURN jsonb_build_object('error','Return is not awaiting resubmission','code','INVALID_STATUS','http',409);
  END IF;

  WITH closed AS (
    UPDATE public.return_requests
       SET status = 'resolved', resolved_at = now()
     WHERE return_id = _return_id
       AND status = 'active'
     RETURNING id
  )
  SELECT count(*) INTO v_closed_count FROM closed;

  SELECT id, workflow_id, current_step_id, status
    INTO v_instance
    FROM public.workflow_instances
   WHERE entity_id = _return_id
     AND entity_type = 'return'
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    SELECT id INTO v_first_step
      FROM public.approval_steps
     WHERE workflow_id = v_instance.workflow_id
     ORDER BY step_order ASC
     LIMIT 1;

    UPDATE public.workflow_instances
       SET status = 'active',
           current_step_id = v_first_step,
           completed_at = NULL,
           updated_at = now()
     WHERE id = v_instance.id;

    UPDATE public.returns_filed
       SET workflow_status = 'SUB'::public.return_workflow_status,
           workflow_id = v_instance.workflow_id,
           current_step_id = v_first_step,
           submit_date = now(),
           updated_by = _actor_id,
           updated_at = now()
     WHERE id = _return_id;

    INSERT INTO public.return_audit_log
      (return_id, action, previous_status, new_status, comments, performed_by,
       previous_step_id, new_step_id, actor_role, metadata, event_key, source)
    VALUES
      (_return_id, 'workflow_step_assigned', 'TBR', 'SUB',
       'Workflow reopened at first step on resubmission', _actor_id,
       v_ret.current_step_id, v_first_step, 'licensee',
       jsonb_build_object('workflow_id', v_instance.workflow_id, 'instance_id', v_instance.id),
       'return.workflow_step_assigned', 'rpc:resubmit_return');

    IF v_first_step IS DISTINCT FROM v_ret.current_step_id THEN
      INSERT INTO public.return_audit_log
        (return_id, action, previous_status, new_status, comments, performed_by,
         previous_step_id, new_step_id, actor_role, metadata, event_key, source)
      VALUES
        (_return_id, 'workflow_step_changed', 'TBR', 'SUB',
         'Workflow step changed on resubmission', _actor_id,
         v_ret.current_step_id, v_first_step, 'licensee',
         jsonb_build_object('workflow_id', v_instance.workflow_id, 'instance_id', v_instance.id),
         'return.workflow_step_changed', 'rpc:resubmit_return');
    END IF;
  ELSE
    UPDATE public.returns_filed
       SET workflow_status = 'SUB'::public.return_workflow_status,
           submit_date = now(),
           updated_by = _actor_id,
           updated_at = now()
     WHERE id = _return_id;
  END IF;

  INSERT INTO public.return_audit_log
    (return_id, action, previous_status, new_status, comments, performed_by, actor_role, metadata, event_key, source)
  VALUES
    (_return_id, 'return_resubmitted', v_ret.workflow_status::text, 'SUB',
     COALESCE(_comments, 'Return resubmitted by licensee'), _actor_id,
     'licensee', '{}'::jsonb, 'return.resubmitted', 'rpc:resubmit_return'),
    (_return_id, 'status_changed', v_ret.workflow_status::text, 'SUB',
     'Status transition on resubmission', _actor_id,
     'licensee', jsonb_build_object('from', v_ret.workflow_status::text, 'to', 'SUB'),
     'return.status_changed', 'rpc:resubmit_return');

  IF v_closed_count > 0 THEN
    INSERT INTO public.return_audit_log
      (return_id, action, previous_status, new_status, comments, performed_by, actor_role, metadata, event_key, source)
    VALUES
      (_return_id, 'edit_request_closed', v_ret.workflow_status::text, 'SUB',
       'Active edit request resolved on resubmission', _actor_id,
       'licensee', jsonb_build_object('closed_count', v_closed_count),
       'return.edit_request_closed', 'rpc:resubmit_return');
  END IF;

  RETURN jsonb_build_object('success', true, 'http', 200, 'edit_requests_closed', v_closed_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.perform_return_workflow_transition(
  _return_id uuid,
  _instance_id uuid,
  _step_id uuid,
  _action_type text,
  _comments text,
  _actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ret record;
  v_instance record;
  v_step record;
  v_auth jsonb;
  v_allowed_actions text[];
  v_steps_total int;
  v_current_idx int;
  v_is_last boolean;
  v_next_step record;
  v_prev_step record;
  v_new_step_id uuid;
  v_new_status text;
  v_new_instance_status text;
  v_now timestamptz := now();
  v_prev_status text;
  v_prev_step_id uuid;
  v_action_key text;
  v_event_key text;
  v_actor_role text;
BEGIN
  IF _actor_id IS NULL THEN
    RETURN jsonb_build_object('error','UNAUTHORIZED','code','UNAUTHORIZED','http',401);
  END IF;

  IF _action_type NOT IN ('approve','reject','send_back','escalate','request_resubmission') THEN
    RETURN jsonb_build_object('error','Invalid action_type','code','BAD_ACTION','http',400);
  END IF;

  IF _action_type IN ('approve','reject','request_resubmission')
     AND (_comments IS NULL OR length(trim(_comments)) = 0) THEN
    RETURN jsonb_build_object('error','Remarks are mandatory for this action','code','REMARKS_REQUIRED','http',422);
  END IF;

  SELECT id, unique_id, workflow_status, workflow_id, current_step_id
    INTO v_ret
    FROM public.returns_filed
   WHERE id = _return_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Return not found','code','NOT_FOUND','http',404);
  END IF;

  v_prev_status := v_ret.workflow_status::text;
  v_prev_step_id := v_ret.current_step_id;

  IF upper(v_prev_status) <> 'SUB' THEN
    RETURN jsonb_build_object('error', format('Return is in ''%s'' status', v_ret.workflow_status), 'code','INVALID_STATUS','http',409);
  END IF;

  SELECT id, workflow_id, current_step_id, status
    INTO v_instance
    FROM public.workflow_instances
   WHERE entity_id = _return_id
     AND entity_type = 'return'
     AND status = 'active'
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','No active workflow instance','code','NO_ACTIVE_INSTANCE','http',409);
  END IF;

  IF _instance_id IS NOT NULL AND _instance_id <> v_instance.id THEN
    RETURN jsonb_build_object('error','Stale workflow instance','code','STALE_INSTANCE','http',409);
  END IF;

  SELECT s.* INTO v_step FROM public.approval_steps s WHERE s.id = v_instance.current_step_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Current step missing','code','BAD_STEP','http',409);
  END IF;

  IF _step_id IS NOT NULL AND _step_id <> v_step.id THEN
    RETURN jsonb_build_object('error','Stale step','code','STALE_STEP','http',409);
  END IF;

  SELECT public.user_can_act_on_workflow_step(_actor_id, v_step.id) INTO v_auth;
  IF NOT COALESCE((v_auth->>'can_act')::boolean, false) THEN
    RETURN jsonb_build_object('error','You are not authorized to act on this step','code','FORBIDDEN','http',403);
  END IF;

  v_allowed_actions := COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_auth->'allowed_actions')), ARRAY[]::text[]);
  IF NOT (_action_type = ANY(v_allowed_actions)) THEN
    RETURN jsonb_build_object('error', format('Action ''%s'' not allowed at this step', _action_type), 'code','ACTION_NOT_ALLOWED','http',403);
  END IF;

  v_actor_role := NULLIF(COALESCE(v_auth->>'required_role_name', v_auth->>'required_role_id'), '');

  SELECT count(*) INTO v_steps_total FROM public.approval_steps WHERE workflow_id = v_instance.workflow_id;
  SELECT count(*) INTO v_current_idx
    FROM public.approval_steps
   WHERE workflow_id = v_instance.workflow_id
     AND step_order <= v_step.step_order;
  v_is_last := v_current_idx = v_steps_total;

  SELECT * INTO v_next_step
    FROM public.approval_steps
   WHERE workflow_id = v_instance.workflow_id
     AND step_order > v_step.step_order
   ORDER BY step_order ASC
   LIMIT 1;

  SELECT * INTO v_prev_step
    FROM public.approval_steps
   WHERE workflow_id = v_instance.workflow_id
     AND step_order < v_step.step_order
   ORDER BY step_order DESC
   LIMIT 1;

  IF _action_type = 'send_back' AND v_prev_step.id IS NULL THEN
    RETURN jsonb_build_object('error','Cannot send back from the first step','code','CANNOT_SEND_BACK','http',422);
  END IF;

  IF _action_type = 'escalate' AND v_next_step.id IS NULL THEN
    RETURN jsonb_build_object('error','Cannot escalate from the last step','code','CANNOT_ESCALATE','http',422);
  END IF;

  IF _action_type = 'approve' THEN
    IF v_is_last THEN
      v_new_step_id := v_step.id;
      v_new_status := 'VAL';
      v_new_instance_status := 'completed';
      v_action_key := 'return_approved';
      v_event_key := 'return.approved';
    ELSE
      v_new_step_id := v_next_step.id;
      v_new_status := v_prev_status;
      v_action_key := 'workflow_step_approved';
      v_event_key := 'return.workflow_step_approved';
    END IF;
  ELSIF _action_type = 'reject' THEN
    v_new_step_id := v_step.id;
    v_new_status := 'REJ';
    v_new_instance_status := 'completed';
    v_action_key := 'return_rejected';
    v_event_key := 'return.rejected';
  ELSIF _action_type = 'send_back' THEN
    v_new_step_id := v_prev_step.id;
    v_new_status := v_prev_status;
    v_action_key := 'return_sent_back';
    v_event_key := 'return.send_back';
  ELSIF _action_type = 'request_resubmission' THEN
    v_new_step_id := v_step.id;
    v_new_status := 'TBR';
    v_new_instance_status := 'paused';
    v_action_key := 'edit_requested';
    v_event_key := 'return.edit_requested';

    INSERT INTO public.return_requests (return_id, reasons, status, requested_by)
    VALUES (_return_id, _comments, 'active', _actor_id);
  ELSIF _action_type = 'escalate' THEN
    v_new_step_id := v_next_step.id;
    v_new_status := v_prev_status;
    v_action_key := 'workflow_step_escalated';
    v_event_key := 'return.workflow_step_escalated';
  END IF;

  INSERT INTO public.approval_actions
    (entity_type, entity_id, application_id, workflow_instance_id, step_id, actor_id, action, action_type, comments)
  VALUES
    ('return', _return_id, NULL, v_instance.id, v_step.id, _actor_id, _action_type, _action_type, _comments);

  INSERT INTO public.return_audit_log
    (return_id, action, previous_status, new_status, comments, performed_by,
     previous_step_id, new_step_id, actor_role, metadata, event_key, source)
  VALUES
    (_return_id, v_action_key, v_prev_status, COALESCE(v_new_status, v_prev_status),
     _comments, _actor_id,
     v_prev_step_id, v_new_step_id, v_actor_role,
     jsonb_build_object(
       'workflow_id', v_instance.workflow_id,
       'instance_id', v_instance.id,
       'action_type', _action_type,
       'is_final', v_is_last,
       'step_order', v_step.step_order
     ),
     v_event_key, 'rpc:perform_return_workflow_transition');

  IF v_new_step_id IS DISTINCT FROM v_prev_step_id AND _action_type IN ('approve', 'send_back', 'escalate') THEN
    INSERT INTO public.return_audit_log
      (return_id, action, previous_status, new_status, comments, performed_by,
       previous_step_id, new_step_id, actor_role, metadata, event_key, source)
    VALUES
      (_return_id, 'workflow_step_changed', v_prev_status, COALESCE(v_new_status, v_prev_status),
       CASE
         WHEN _action_type = 'send_back' THEN 'Workflow sent back to previous step'
         WHEN _action_type = 'escalate' THEN 'Workflow escalated to next step'
         ELSE 'Workflow step changed'
       END,
       _actor_id,
       v_prev_step_id, v_new_step_id, v_actor_role,
       jsonb_build_object('workflow_id', v_instance.workflow_id, 'instance_id', v_instance.id, 'action_type', _action_type),
       'return.workflow_step_changed', 'rpc:perform_return_workflow_transition');
  END IF;

  IF v_new_step_id IS DISTINCT FROM v_prev_step_id AND _action_type = 'approve' AND NOT v_is_last THEN
    INSERT INTO public.return_audit_log
      (return_id, action, previous_status, new_status, comments, performed_by,
       previous_step_id, new_step_id, actor_role, metadata, event_key, source)
    VALUES
      (_return_id, 'workflow_step_moved', v_prev_status, COALESCE(v_new_status, v_prev_status),
       'Workflow advanced to next step', _actor_id,
       v_prev_step_id, v_new_step_id, v_actor_role,
       jsonb_build_object('workflow_id', v_instance.workflow_id, 'instance_id', v_instance.id),
       'return.workflow_step_moved', 'rpc:perform_return_workflow_transition');
  END IF;

  IF v_new_status IS NOT NULL AND v_new_status <> v_prev_status THEN
    INSERT INTO public.return_audit_log
      (return_id, action, previous_status, new_status, comments, performed_by, actor_role, metadata, event_key, source)
    VALUES
      (_return_id, 'status_changed', v_prev_status, v_new_status,
       'Status changed by workflow action', _actor_id, v_actor_role,
       jsonb_build_object('from', v_prev_status, 'to', v_new_status, 'action_type', _action_type),
       'return.status_changed', 'rpc:perform_return_workflow_transition');

    IF v_new_status = 'TBR' THEN
      INSERT INTO public.return_audit_log
        (return_id, action, previous_status, new_status, comments, performed_by, actor_role, metadata, event_key, source)
      VALUES
        (_return_id, 'status_changed_to_tbr', v_prev_status, 'TBR',
         COALESCE(_comments, 'Return moved to TBR'), _actor_id, v_actor_role,
         jsonb_build_object('action_type', _action_type),
         'return.status_changed_to_tbr', 'rpc:perform_return_workflow_transition');
    END IF;
  END IF;

  UPDATE public.workflow_instances
     SET current_step_id = v_new_step_id,
         status = COALESCE(v_new_instance_status, status),
         completed_at = CASE WHEN COALESCE(v_new_instance_status, '') = 'completed' THEN v_now ELSE completed_at END,
         updated_at = v_now
   WHERE id = v_instance.id;

  IF v_new_status IS NOT NULL THEN
    UPDATE public.returns_filed
       SET workflow_status = v_new_status::public.return_workflow_status,
           current_step_id = CASE WHEN v_new_instance_status = 'completed' THEN NULL ELSE v_new_step_id END,
           updated_by = _actor_id,
           updated_at = v_now
     WHERE id = _return_id;
  ELSE
    UPDATE public.returns_filed
       SET current_step_id = v_new_step_id,
           updated_by = _actor_id,
           updated_at = v_now
     WHERE id = _return_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'action_type', _action_type,
    'action_key', v_action_key,
    'event_key', v_event_key,
    'return_id', _return_id,
    'unique_id', v_ret.unique_id,
    'new_step_id', v_new_step_id,
    'previous_step_id', v_prev_step_id,
    'new_status', COALESCE(v_new_status, v_prev_status),
    'previous_status', v_prev_status,
    'instance_id', v_instance.id,
    'http', 200
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_return_workflow(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resubmit_return(uuid,uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.perform_return_workflow_transition(uuid,uuid,uuid,text,text,uuid) TO authenticated, service_role;