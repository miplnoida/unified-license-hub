
-- 1. returns_filed gains workflow columns
ALTER TABLE public.returns_filed
  ADD COLUMN IF NOT EXISTS workflow_id uuid REFERENCES public.approval_workflows(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_step_id uuid REFERENCES public.approval_steps(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_returns_filed_workflow_id ON public.returns_filed(workflow_id);
CREATE INDEX IF NOT EXISTS idx_returns_filed_current_step_id ON public.returns_filed(current_step_id);

-- 2. Generalize approval_actions for multi-entity usage
ALTER TABLE public.approval_actions
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id uuid;

UPDATE public.approval_actions
   SET entity_type = COALESCE(entity_type, 'application'),
       entity_id   = COALESCE(entity_id, application_id)
 WHERE entity_type IS NULL OR entity_id IS NULL;

ALTER TABLE public.approval_actions ALTER COLUMN entity_type SET DEFAULT 'application';
ALTER TABLE public.approval_actions ALTER COLUMN entity_type SET NOT NULL;
ALTER TABLE public.approval_actions ALTER COLUMN application_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_approval_actions_entity ON public.approval_actions(entity_type, entity_id);

-- 3. Resolver: pick a return-scoped workflow for a given return
CREATE OR REPLACE FUNCTION public.resolve_return_workflow(_return_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_sector uuid;
  v_sub uuid;
  v_return_type uuid;
  v_regulator uuid;
  v_workflow_id uuid;
BEGIN
  SELECT rf.sector_id, rf.subsector_id, rc.return_type_id, s.regulator_id
    INTO v_sector, v_sub, v_return_type, v_regulator
    FROM public.returns_filed rf
    LEFT JOIN public.return_configs rc ON rc.id = rf.return_configuration_id
    LEFT JOIN public.sectors s ON s.id = rf.sector_id
   WHERE rf.id = _return_id;

  -- Most specific match first: regulator + sector + subsector
  SELECT id INTO v_workflow_id FROM public.approval_workflows
   WHERE entity_type = 'return' AND is_active = true
     AND (regulator_id = v_regulator OR regulator_id IS NULL)
     AND (sector_id = v_sector OR sector_id IS NULL)
     AND (category_id = v_sub OR category_id IS NULL)
   ORDER BY (regulator_id = v_regulator)::int DESC,
            (sector_id = v_sector)::int DESC,
            (category_id = v_sub)::int DESC,
            created_at ASC
   LIMIT 1;

  RETURN v_workflow_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.resolve_return_workflow(uuid) TO authenticated, service_role;

-- 4. Start a workflow instance for a return (idempotent)
CREATE OR REPLACE FUNCTION public.start_return_workflow(_return_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_workflow_id uuid;
  v_first_step uuid;
  v_instance_id uuid;
  v_existing_instance uuid;
BEGIN
  -- Reuse an active/paused instance if any
  SELECT id INTO v_existing_instance
    FROM public.workflow_instances
   WHERE entity_id = _return_id AND entity_type = 'return' AND status IN ('active','paused')
   ORDER BY created_at DESC LIMIT 1;

  IF v_existing_instance IS NOT NULL THEN
    SELECT workflow_id, current_step_id INTO v_workflow_id, v_first_step
      FROM public.workflow_instances WHERE id = v_existing_instance;
    UPDATE public.returns_filed
       SET workflow_id = v_workflow_id, current_step_id = v_first_step
     WHERE id = _return_id;
    RETURN jsonb_build_object('instance_id', v_existing_instance, 'workflow_id', v_workflow_id, 'step_id', v_first_step, 'resumed', true);
  END IF;

  v_workflow_id := public.resolve_return_workflow(_return_id);
  IF v_workflow_id IS NULL THEN
    RETURN jsonb_build_object('matched', false);
  END IF;

  SELECT id INTO v_first_step FROM public.approval_steps
   WHERE workflow_id = v_workflow_id ORDER BY step_order ASC LIMIT 1;
  IF v_first_step IS NULL THEN
    RETURN jsonb_build_object('matched', false, 'reason', 'no_steps');
  END IF;

  INSERT INTO public.workflow_instances (workflow_id, entity_type, entity_id, current_step_id, status)
  VALUES (v_workflow_id, 'return', _return_id, v_first_step, 'active')
  RETURNING id INTO v_instance_id;

  UPDATE public.returns_filed
     SET workflow_id = v_workflow_id, current_step_id = v_first_step
   WHERE id = _return_id;

  RETURN jsonb_build_object('instance_id', v_instance_id, 'workflow_id', v_workflow_id, 'step_id', v_first_step, 'resumed', false, 'matched', true);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.start_return_workflow(uuid) TO authenticated, service_role;

-- 5. Atomic transition for a return
CREATE OR REPLACE FUNCTION public.perform_return_workflow_transition(
  _return_id uuid, _instance_id uuid, _step_id uuid,
  _action_type text, _comments text, _actor_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_ret record;
  v_instance record;
  v_step record;
  v_auth jsonb;
  v_allowed_actions text[];
  v_steps_total int;
  v_current_idx int;
  v_is_first boolean;
  v_is_last boolean;
  v_next_step record;
  v_prev_step record;
  v_new_step_id uuid;
  v_new_status text;
  v_new_instance_status text;
  v_now timestamptz := now();
  v_role_match boolean;
  v_is_internal boolean;
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
    INTO v_ret FROM public.returns_filed WHERE id = _return_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Return not found','code','NOT_FOUND','http',404);
  END IF;

  IF upper(v_ret.workflow_status::text) NOT IN ('SUB') THEN
    RETURN jsonb_build_object('error',format('Return is in ''%s'' status', v_ret.workflow_status),
                              'code','INVALID_STATUS','http',409);
  END IF;

  SELECT id, workflow_id, current_step_id, status INTO v_instance
    FROM public.workflow_instances
   WHERE entity_id = _return_id AND entity_type = 'return' AND status = 'active'
   ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','No active workflow instance','code','NO_ACTIVE_INSTANCE','http',409);
  END IF;
  IF _instance_id IS NOT NULL AND _instance_id <> v_instance.id THEN
    RETURN jsonb_build_object('error','Stale workflow instance','code','STALE_INSTANCE','http',409);
  END IF;
  IF _step_id IS NOT NULL AND _step_id <> v_instance.current_step_id THEN
    RETURN jsonb_build_object('error','Stale step','code','STALE_STEP','http',409);
  END IF;

  SELECT id, step_order, name, approver_role, approver_role_id, allowed_actions
    INTO v_step FROM public.approval_steps WHERE id = v_instance.current_step_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Current step not found','code','STEP_NOT_FOUND','http',409);
  END IF;

  SELECT count(*),
         (SELECT count(*) FROM public.approval_steps s2
          WHERE s2.workflow_id = v_instance.workflow_id AND s2.step_order < v_step.step_order)
    INTO v_steps_total, v_current_idx
    FROM public.approval_steps WHERE workflow_id = v_instance.workflow_id;
  v_is_first := (v_current_idx = 0);
  v_is_last  := (v_current_idx = v_steps_total - 1);

  v_auth := public.user_can_act_on_workflow_step(_actor_id, v_step.id);
  v_role_match := COALESCE((v_auth->>'can_act')::boolean, false);
  v_is_internal := COALESCE((v_auth->>'is_internal')::boolean, false);

  IF _action_type = 'reject' THEN
    IF NOT v_is_internal THEN
      RETURN jsonb_build_object('error','Only internal staff can reject this return',
                                'code','FORBIDDEN','http',403,'diagnostic',v_auth);
    END IF;
  ELSIF NOT v_role_match THEN
    RETURN jsonb_build_object(
      'error', format('Only %s can act on this step',
                      COALESCE(v_auth->>'required_role_name', v_step.approver_role::text)),
      'code','WRONG_APPROVER','http',403,
      'diagnostic', v_auth
    );
  END IF;

  v_allowed_actions := ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_step.allowed_actions, '[]'::jsonb)));
  IF NOT (_action_type = ANY(v_allowed_actions)) THEN
    RETURN jsonb_build_object('error',format('Action ''%s'' is not allowed on this step', _action_type),
                              'code','ACTION_NOT_ALLOWED','http',422);
  END IF;
  IF _action_type = 'send_back' AND v_is_first THEN
    RETURN jsonb_build_object('error','Cannot send back from the first step','code','CANNOT_SEND_BACK','http',422);
  END IF;
  IF _action_type = 'escalate' AND v_is_last THEN
    RETURN jsonb_build_object('error','Cannot escalate from the last step','code','CANNOT_ESCALATE','http',422);
  END IF;

  v_new_step_id := v_step.id;
  v_new_status := NULL;
  v_new_instance_status := NULL;

  IF _action_type = 'approve' THEN
    IF v_is_last THEN
      v_new_status := 'VAL';
      v_new_instance_status := 'completed';
    ELSE
      SELECT id INTO v_next_step FROM public.approval_steps
       WHERE workflow_id = v_instance.workflow_id AND step_order > v_step.step_order
       ORDER BY step_order ASC LIMIT 1;
      IF FOUND THEN v_new_step_id := v_next_step.id; END IF;
    END IF;
  ELSIF _action_type = 'reject' THEN
    v_new_status := 'TBR';
    v_new_instance_status := 'completed';
    -- Track as edit request so licensee sees the reason
    INSERT INTO public.return_requests (return_id, reasons, status, requested_by)
    VALUES (_return_id, _comments, 'active', _actor_id);
  ELSIF _action_type = 'send_back' THEN
    SELECT id INTO v_prev_step FROM public.approval_steps
     WHERE workflow_id = v_instance.workflow_id AND step_order < v_step.step_order
     ORDER BY step_order DESC LIMIT 1;
    IF FOUND THEN v_new_step_id := v_prev_step.id; END IF;
  ELSIF _action_type = 'escalate' THEN
    SELECT id INTO v_next_step FROM public.approval_steps
     WHERE workflow_id = v_instance.workflow_id AND step_order > v_step.step_order
     ORDER BY step_order ASC LIMIT 1;
    IF FOUND THEN v_new_step_id := v_next_step.id; END IF;
  ELSIF _action_type = 'request_resubmission' THEN
    v_new_status := 'TBR';
    v_new_instance_status := 'paused';
    INSERT INTO public.return_requests (return_id, reasons, status, requested_by)
    VALUES (_return_id, _comments, 'active', _actor_id);
  END IF;

  INSERT INTO public.approval_actions (
    entity_type, entity_id, application_id, workflow_instance_id, step_id,
    actor_id, action, action_type, comments
  ) VALUES (
    'return', _return_id, NULL, v_instance.id, v_step.id,
    _actor_id, _action_type, _action_type, _comments
  );

  -- Mirror to legacy return_audit_log for back-compat
  INSERT INTO public.return_audit_log (return_id, action, previous_status, new_status, comments, performed_by)
  VALUES (_return_id, _action_type, v_ret.workflow_status::text, COALESCE(v_new_status, v_ret.workflow_status::text), _comments, _actor_id);

  UPDATE public.workflow_instances
     SET current_step_id = v_new_step_id,
         status = COALESCE(v_new_instance_status, status),
         completed_at = CASE WHEN COALESCE(v_new_instance_status,'') = 'completed' THEN v_now ELSE completed_at END,
         updated_at = v_now
   WHERE id = v_instance.id;

  IF v_new_status IS NOT NULL THEN
    UPDATE public.returns_filed
       SET workflow_status = v_new_status::workflow_status_enum,
           current_step_id = CASE WHEN v_new_instance_status = 'completed' THEN NULL ELSE v_new_step_id END,
           updated_by = _actor_id,
           updated_at = v_now
     WHERE id = _return_id;
  ELSE
    UPDATE public.returns_filed
       SET current_step_id = v_new_step_id, updated_by = _actor_id, updated_at = v_now
     WHERE id = _return_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'action_type', _action_type,
    'return_id', _return_id,
    'unique_id', v_ret.unique_id,
    'new_step_id', v_new_step_id,
    'new_status', COALESCE(v_new_status, v_ret.workflow_status::text),
    'instance_id', v_instance.id,
    'http', 200
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.perform_return_workflow_transition(uuid,uuid,uuid,text,text,uuid) TO authenticated, service_role;

-- 6. Resubmission helper for licensee
CREATE OR REPLACE FUNCTION public.resubmit_return(_return_id uuid, _actor_id uuid, _comments text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_ret record;
  v_instance record;
  v_first_step uuid;
BEGIN
  IF _actor_id IS NULL THEN
    RETURN jsonb_build_object('error','UNAUTHORIZED','code','UNAUTHORIZED','http',401);
  END IF;

  SELECT id, workflow_status, workflow_id INTO v_ret
    FROM public.returns_filed WHERE id = _return_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Return not found','code','NOT_FOUND','http',404);
  END IF;

  -- Close any active edit request
  UPDATE public.return_requests
     SET status = 'resolved', resolved_at = now()
   WHERE return_id = _return_id AND status = 'active';

  -- Reopen / restart the workflow instance
  SELECT id, workflow_id INTO v_instance
    FROM public.workflow_instances
   WHERE entity_id = _return_id AND entity_type = 'return'
   ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

  IF FOUND THEN
    SELECT id INTO v_first_step FROM public.approval_steps
     WHERE workflow_id = v_instance.workflow_id ORDER BY step_order ASC LIMIT 1;
    UPDATE public.workflow_instances
       SET status = 'active', current_step_id = v_first_step, completed_at = NULL, updated_at = now()
     WHERE id = v_instance.id;
    UPDATE public.returns_filed
       SET workflow_status = 'SUB'::workflow_status_enum,
           workflow_id = v_instance.workflow_id,
           current_step_id = v_first_step,
           submit_date = now(), updated_by = _actor_id, updated_at = now()
     WHERE id = _return_id;
  ELSE
    UPDATE public.returns_filed
       SET workflow_status = 'SUB'::workflow_status_enum,
           submit_date = now(), updated_by = _actor_id, updated_at = now()
     WHERE id = _return_id;
  END IF;

  INSERT INTO public.return_audit_log (return_id, action, previous_status, new_status, comments, performed_by)
  VALUES (_return_id, 'resubmitted', v_ret.workflow_status::text, 'SUB', _comments, _actor_id);

  RETURN jsonb_build_object('success', true, 'http', 200);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.resubmit_return(uuid,uuid,text) TO authenticated, service_role;
