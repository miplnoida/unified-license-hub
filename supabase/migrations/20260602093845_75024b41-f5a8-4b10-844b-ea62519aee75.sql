-- Tighten workflow-step authorization: remove the unconditional super_admin
-- bypass that was letting super admins (and anyone elevated via super_admin)
-- act on any workflow step regardless of the step's configured approver.
--
-- After this migration:
--   * A user can act on a step ONLY when their dynamic role matches
--     approval_steps.approver_role_id (preferred), OR
--   * For legacy steps with approver_role_id IS NULL, their effective system
--     role matches approval_steps.approver_role.
--
-- This is consumed by both:
--   * perform_workflow_transition (backend enforcement)
--   * WorkflowPanel via the user_can_act_on_workflow_step RPC (UI gating)
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
  v_can boolean := false;
  v_reason text := 'WRONG_APPROVER';
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

  -- NOTE: Intentionally NO super_admin override. A super_admin must be assigned
  -- to the step's configured role (dynamic or legacy) just like any other user.
  IF v_step.approver_role_id IS NOT NULL THEN
    SELECT name, system_role INTO v_required_role_name, v_required_system_role
      FROM public.roles WHERE id = v_step.approver_role_id;
    IF v_step.approver_role_id = ANY(v_actor_dynamic_role_ids) THEN
      v_can := true; v_reason := 'DYNAMIC_ROLE_MATCH';
    END IF;
  ELSE
    v_required_role_name := v_step.approver_role::text;
    v_required_system_role := v_step.approver_role::text;
    IF v_step.approver_role::text = ANY(v_actor_system_roles) THEN
      v_can := true; v_reason := 'LEGACY_SYSTEM_ROLE_MATCH';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'can_act', v_can,
    'reason', v_reason,
    'step_id', v_step.id,
    'step_name', v_step.name,
    'required_role_id', v_step.approver_role_id,
    'required_role_name', v_required_role_name,
    'required_system_role', v_required_system_role,
    'legacy_approver_role', v_step.approver_role::text,
    'actor_system_roles', to_jsonb(v_actor_system_roles),
    'actor_dynamic_role_ids', to_jsonb(v_actor_dynamic_role_ids),
    'allowed_actions', COALESCE(v_step.allowed_actions, '[]'::jsonb)
  );
END;
$function$;