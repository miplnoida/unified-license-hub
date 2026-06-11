CREATE OR REPLACE FUNCTION public.user_can_act_on_workflow_step(_user_id uuid, _step_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_step record;
  v_actor_system_roles text[];
  v_actor_dynamic_role_ids uuid[];
  v_required_role_name text;
  v_required_system_role text;
  v_role_match boolean := false;
  v_reason text := 'WRONG_APPROVER';
  v_internal_roles text[] := ARRAY['super_admin','admin','supervisor','licensing_officer','analyst','developer'];
  v_is_internal boolean := false;
  v_allowed text[];
  v_steps_total int := 0;
  v_current_idx int := 0;
  v_is_last boolean := false;
  v_is_first boolean := false;
  v_can_add_remark boolean := false;
  v_can_reject boolean := false;
  v_can_forward boolean := false;
  v_can_approve boolean := false;
  v_can_send_back boolean := false;
  v_can_escalate boolean := false;
  v_can_request_resubmission boolean := false;
  v_can_return_for_correction boolean := false;
  v_can_request_more_info boolean := false;
BEGIN
  IF _user_id IS NULL OR _step_id IS NULL THEN
    RETURN jsonb_build_object('can_act', false, 'reason', 'BAD_INPUT');
  END IF;

  SELECT id, approver_role, approver_role_id, allowed_actions, name, step_order, workflow_id
    INTO v_step FROM public.approval_steps WHERE id = _step_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('can_act', false, 'reason', 'STEP_NOT_FOUND');
  END IF;

  SELECT array_agg(DISTINCT r) INTO v_actor_system_roles FROM (
    SELECT role::text AS r FROM public.user_roles WHERE user_id = _user_id
    UNION
    SELECT ro.system_role FROM public.user_dynamic_roles udr
      JOIN public.roles ro ON ro.id = udr.role_id
     WHERE udr.user_id = _user_id AND ro.system_role IS NOT NULL
  ) sub;
  v_actor_system_roles := COALESCE(v_actor_system_roles, ARRAY[]::text[]);

  SELECT array_agg(DISTINCT role_id) INTO v_actor_dynamic_role_ids
    FROM public.user_dynamic_roles WHERE user_id = _user_id;
  v_actor_dynamic_role_ids := COALESCE(v_actor_dynamic_role_ids, ARRAY[]::uuid[]);

  v_is_internal := EXISTS (
    SELECT 1 FROM unnest(v_actor_system_roles) AS r WHERE r = ANY(v_internal_roles)
  );

  IF v_step.approver_role_id IS NOT NULL THEN
    SELECT name, system_role INTO v_required_role_name, v_required_system_role
      FROM public.roles WHERE id = v_step.approver_role_id;
    IF v_step.approver_role_id = ANY(v_actor_dynamic_role_ids) THEN
      v_role_match := true; v_reason := 'DYNAMIC_ROLE_MATCH';
    ELSIF v_required_system_role IS NOT NULL
       AND v_required_system_role = ANY(v_actor_system_roles) THEN
      v_role_match := true; v_reason := 'SYSTEM_ROLE_EQUIVALENT_MATCH';
    END IF;
    IF NOT v_role_match AND 'super_admin' = ANY(v_actor_system_roles) THEN
      v_role_match := true; v_reason := 'SUPER_ADMIN_OVERRIDE';
    END IF;
  ELSE
    v_required_role_name := v_step.approver_role::text;
    v_required_system_role := v_step.approver_role::text;
    IF v_step.approver_role::text = ANY(v_actor_system_roles) THEN
      v_role_match := true; v_reason := 'LEGACY_SYSTEM_ROLE_MATCH';
    ELSIF 'super_admin' = ANY(v_actor_system_roles) THEN
      v_role_match := true; v_reason := 'SUPER_ADMIN_OVERRIDE';
    END IF;
  END IF;

  SELECT count(*),
         (SELECT count(*) FROM public.approval_steps s2
          WHERE s2.workflow_id = v_step.workflow_id AND s2.step_order < v_step.step_order)
    INTO v_steps_total, v_current_idx
    FROM public.approval_steps WHERE workflow_id = v_step.workflow_id;
  v_is_first := (v_current_idx = 0);
  v_is_last  := (v_steps_total > 0 AND v_current_idx = v_steps_total - 1);

  v_allowed := ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_step.allowed_actions, '[]'::jsonb)));

  v_can_add_remark := v_is_internal;
  v_can_reject := v_is_internal AND ('reject' = ANY(v_allowed));
  IF v_role_match THEN
    IF 'approve' = ANY(v_allowed) THEN
      IF v_is_last THEN v_can_approve := true; ELSE v_can_forward := true; END IF;
    END IF;
    v_can_send_back := (NOT v_is_first) AND ('send_back' = ANY(v_allowed));
    v_can_escalate := (NOT v_is_last) AND ('escalate' = ANY(v_allowed));
    v_can_request_resubmission := ('request_resubmission' = ANY(v_allowed));
    v_can_return_for_correction := ('return_for_correction' = ANY(v_allowed));
    v_can_request_more_info := ('request_more_info' = ANY(v_allowed));
  END IF;

  RETURN jsonb_build_object(
    'can_act', v_role_match,
    'reason', v_reason,
    'step_id', v_step.id,
    'step_name', v_step.name,
    'step_order', v_step.step_order,
    'is_first_step', v_is_first,
    'is_last_step', v_is_last,
    'required_role_id', v_step.approver_role_id,
    'required_role_name', v_required_role_name,
    'required_system_role', v_required_system_role,
    'legacy_approver_role', v_step.approver_role::text,
    'actor_system_roles', to_jsonb(v_actor_system_roles),
    'actor_dynamic_role_ids', to_jsonb(v_actor_dynamic_role_ids),
    'is_internal', v_is_internal,
    'allowed_actions', COALESCE(v_step.allowed_actions, '[]'::jsonb),
    'can_add_remark', v_can_add_remark,
    'can_reject', v_can_reject,
    'can_forward', v_can_forward,
    'can_approve', v_can_approve,
    'can_send_back', v_can_send_back,
    'can_escalate', v_can_escalate,
    'can_request_resubmission', v_can_request_resubmission,
    'can_return_for_correction', v_can_return_for_correction,
    'can_request_more_info', v_can_request_more_info
  );
END;
$function$;

DROP POLICY IF EXISTS "Update apps" ON public.applications;
CREATE POLICY "Update apps"
ON public.applications
FOR UPDATE
TO public
USING (
  (
    auth.uid() = applicant_id
    AND status = ANY (ARRAY['draft'::text, 'in_progress'::text, 'resubmission_requested'::text, 'resubmission_required'::text, 'query_raised'::text, 'returned_for_correction'::text, 'info_requested'::text])
  )
  OR (
    user_licensee_id(auth.uid()) IS NOT NULL
    AND id IN (
      SELECT application_ids_for_licensee(user_licensee_id(auth.uid())) AS application_ids_for_licensee
    )
    AND status = ANY (ARRAY['draft'::text, 'in_progress'::text, 'resubmission_requested'::text, 'resubmission_required'::text, 'query_raised'::text, 'returned_for_correction'::text, 'info_requested'::text])
  )
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
  OR has_role(auth.uid(), 'licensing_officer'::app_role)
)
WITH CHECK (
  (
    auth.uid() = applicant_id
    AND status = ANY (ARRAY['draft'::text, 'in_progress'::text, 'resubmission_requested'::text, 'resubmission_required'::text, 'query_raised'::text, 'returned_for_correction'::text, 'info_requested'::text])
  )
  OR (
    user_licensee_id(auth.uid()) IS NOT NULL
    AND id IN (
      SELECT application_ids_for_licensee(user_licensee_id(auth.uid())) AS application_ids_for_licensee
    )
    AND status = ANY (ARRAY['draft'::text, 'in_progress'::text, 'resubmission_requested'::text, 'resubmission_required'::text, 'query_raised'::text, 'returned_for_correction'::text, 'info_requested'::text])
  )
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
  OR has_role(auth.uid(), 'licensing_officer'::app_role)
);