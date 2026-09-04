-- ===========================================================
-- W1A: governed replacements for W1-relevant client writes
-- ===========================================================

-- 1. Maker-checker kernel -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.maker_checker_evaluate(
  _module_key text,
  _object_type text,
  _object_id uuid,
  _decision_type text,
  _maker_id uuid,
  _checker_id uuid DEFAULT NULL,
  _break_glass boolean DEFAULT false,
  _rationale text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_checker uuid := COALESCE(_checker_id, auth.uid());
  v_rule record;
  v_required boolean := true;
  v_delegated boolean := false;
  v_basis text := 'default_segregation';
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF _maker_id IS NULL OR _object_type IS NULL OR _decision_type IS NULL THEN
    RAISE EXCEPTION 'maker_object_and_decision_required';
  END IF;

  SELECT r.* INTO v_rule
    FROM public.decision_authority_rules r
   WHERE r.decision_type = _decision_type
     AND r.status = 'active'
     AND (r.effective_from IS NULL OR r.effective_from <= CURRENT_DATE)
     AND (r.effective_to IS NULL OR r.effective_to >= CURRENT_DATE)
   ORDER BY r.effective_from DESC NULLS LAST
   LIMIT 1;

  IF v_rule.id IS NOT NULL THEN
    v_required := COALESCE(v_rule.requires_maker_checker, true);
    v_basis := 'decision_authority_rule';
  END IF;

  -- An active delegation from the maker to the checker is authority, not a bypass.
  SELECT EXISTS (
    SELECT 1 FROM public.delegation_rules d
     WHERE d.is_active
       AND d.delegate_from_user_id = _maker_id
       AND d.delegate_to_user_id = v_checker
       AND (d.effective_from IS NULL OR d.effective_from <= now())
       AND (d.effective_until IS NULL OR d.effective_until >= now())
  ) INTO v_delegated;

  RETURN jsonb_build_object(
    'module_key', _module_key,
    'object_type', _object_type,
    'object_id', _object_id,
    'decision_type', _decision_type,
    'maker_id', _maker_id,
    'checker_id', v_checker,
    'maker_checker_required', v_required,
    'authority_basis', v_basis,
    'authority_rule_id', v_rule.id,
    'delegated_authority', v_delegated,
    'break_glass', COALESCE(_break_glass, false),
    'rationale', NULLIF(btrim(COALESCE(_rationale, '')), ''),
    'permitted', CASE
      WHEN NOT v_required THEN true
      WHEN _maker_id <> v_checker THEN true
      WHEN COALESCE(_break_glass, false) AND NULLIF(btrim(COALESCE(_rationale, '')), '') IS NOT NULL THEN true
      ELSE false
    END,
    'refusal_reason', CASE
      WHEN v_required AND _maker_id = v_checker
           AND NOT (COALESCE(_break_glass, false) AND NULLIF(btrim(COALESCE(_rationale, '')), '') IS NOT NULL)
      THEN 'checker_must_differ_from_maker'
      ELSE NULL
    END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.maker_checker_evaluate(text, text, uuid, text, uuid, uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.maker_checker_evaluate(text, text, uuid, text, uuid, uuid, boolean, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.maker_checker_evaluate(text, text, uuid, text, uuid, uuid, boolean, text)
  TO authenticated, service_role;


-- 2. Workflow instance start --------------------------------------------------
CREATE OR REPLACE FUNCTION public.workflow_instance_start(
  _workflow_id uuid,
  _entity_type text,
  _entity_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_step uuid;
  v_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT public.has_permission(v_actor, 'workflow_management', 'workflow_action') THEN
    RAISE EXCEPTION 'not_authorised_to_start_workflow';
  END IF;
  IF _workflow_id IS NULL OR _entity_type IS NULL OR _entity_id IS NULL THEN
    RAISE EXCEPTION 'workflow_and_record_required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.approval_workflows w WHERE w.id = _workflow_id) THEN
    RAISE EXCEPTION 'unknown_workflow';
  END IF;

  SELECT s.id INTO v_step
    FROM public.approval_steps s
   WHERE s.workflow_id = _workflow_id
   ORDER BY s.step_order
   LIMIT 1;

  INSERT INTO public.workflow_instances (workflow_id, entity_type, entity_id, current_step_id, status)
  VALUES (_workflow_id, _entity_type, _entity_id, v_step, 'active')
  RETURNING id INTO v_id;

  INSERT INTO public.compliance_audit_logs (user_id, action, table_name, record_id, new_values)
  VALUES (v_actor, 'WORKFLOW_TRANSITION', 'workflow_instances', v_id,
          jsonb_build_object('workflow_id', _workflow_id, 'entity_type', _entity_type,
                             'entity_id', _entity_id, 'current_step_id', v_step, 'status', 'active'));
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.workflow_instance_start(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.workflow_instance_start(uuid, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.workflow_instance_start(uuid, text, uuid) TO authenticated, service_role;


-- 3. Delegation rule administration ------------------------------------------
CREATE OR REPLACE FUNCTION public.delegation_rule_upsert(
  _rule jsonb,
  _rule_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_id uuid;
  v_from uuid := NULLIF(_rule->>'delegate_from_user_id','')::uuid;
  v_to uuid := NULLIF(_rule->>'delegate_to_user_id','')::uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.has_permission(v_actor, 'workflow_management', 'manage_config') THEN
    RAISE EXCEPTION 'not_authorised_to_manage_delegation';
  END IF;
  IF NULLIF(btrim(COALESCE(_rule->>'name','')),'') IS NULL THEN
    RAISE EXCEPTION 'delegation_name_required';
  END IF;
  IF v_from IS NOT NULL AND v_to IS NOT NULL AND v_from = v_to THEN
    RAISE EXCEPTION 'delegation_to_self_not_permitted';
  END IF;

  IF _rule_id IS NULL THEN
    INSERT INTO public.delegation_rules (
      name, description, condition, target_role, target_user_id, is_active,
      delegate_from_user_id, delegate_to_user_id, effective_from, effective_until)
    VALUES (
      _rule->>'name', _rule->>'description', COALESCE(_rule->'condition','{}'::jsonb),
      NULLIF(_rule->>'target_role',''), NULLIF(_rule->>'target_user_id','')::uuid,
      COALESCE((_rule->>'is_active')::boolean, true), v_from, v_to,
      NULLIF(_rule->>'effective_from','')::timestamptz,
      NULLIF(_rule->>'effective_until','')::timestamptz)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.delegation_rules SET
      name = _rule->>'name',
      description = _rule->>'description',
      condition = COALESCE(_rule->'condition', condition),
      target_role = NULLIF(_rule->>'target_role',''),
      target_user_id = NULLIF(_rule->>'target_user_id','')::uuid,
      is_active = COALESCE((_rule->>'is_active')::boolean, is_active),
      delegate_from_user_id = v_from,
      delegate_to_user_id = v_to,
      effective_from = NULLIF(_rule->>'effective_from','')::timestamptz,
      effective_until = NULLIF(_rule->>'effective_until','')::timestamptz
     WHERE id = _rule_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'unknown_delegation_rule'; END IF;
  END IF;

  INSERT INTO public.compliance_audit_logs (user_id, action, table_name, record_id, new_values)
  VALUES (v_actor, CASE WHEN _rule_id IS NULL THEN 'CREATE' ELSE 'UPDATE' END::compliance_audit_action,
          'delegation_rules', v_id, _rule);
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delegation_rule_set_active(_rule_id uuid, _is_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.has_permission(v_actor, 'workflow_management', 'manage_config') THEN
    RAISE EXCEPTION 'not_authorised_to_manage_delegation';
  END IF;
  UPDATE public.delegation_rules SET is_active = _is_active WHERE id = _rule_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown_delegation_rule'; END IF;
  INSERT INTO public.compliance_audit_logs (user_id, action, table_name, record_id, new_values)
  VALUES (v_actor, 'UPDATE', 'delegation_rules', _rule_id, jsonb_build_object('is_active', _is_active));
END;
$function$;

CREATE OR REPLACE FUNCTION public.delegation_rule_delete(_rule_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_actor uuid := auth.uid(); v_old jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.has_permission(v_actor, 'workflow_management', 'manage_config') THEN
    RAISE EXCEPTION 'not_authorised_to_manage_delegation';
  END IF;
  SELECT to_jsonb(d) INTO v_old FROM public.delegation_rules d WHERE d.id = _rule_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'unknown_delegation_rule'; END IF;
  DELETE FROM public.delegation_rules WHERE id = _rule_id;
  INSERT INTO public.compliance_audit_logs (user_id, action, table_name, record_id, old_values)
  VALUES (v_actor, 'DELETE', 'delegation_rules', _rule_id, v_old);
END;
$function$;

REVOKE ALL ON FUNCTION public.delegation_rule_upsert(jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delegation_rule_upsert(jsonb, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.delegation_rule_upsert(jsonb, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.delegation_rule_set_active(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delegation_rule_set_active(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.delegation_rule_set_active(uuid, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.delegation_rule_delete(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delegation_rule_delete(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.delegation_rule_delete(uuid) TO authenticated, service_role;


-- 4. Workflow-generated applicant notification -------------------------------
CREATE OR REPLACE FUNCTION public.workflow_notification_emit(
  _entity_type text,
  _entity_id uuid,
  _title text,
  _message text,
  _type text DEFAULT 'workflow',
  _route text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_recipient uuid;
  v_id uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.has_permission(v_actor, 'workflow_management', 'workflow_action') THEN
    RAISE EXCEPTION 'not_authorised_to_notify_on_workflow';
  END IF;
  IF NULLIF(btrim(COALESCE(_title,'')),'') IS NULL THEN RAISE EXCEPTION 'title_required'; END IF;

  IF _entity_type = 'application' THEN
    SELECT a.applicant_id INTO v_recipient FROM public.applications a WHERE a.id = _entity_id;
  ELSE
    RAISE EXCEPTION 'unsupported_record_type';
  END IF;

  IF v_recipient IS NULL THEN
    RETURN NULL;  -- nothing to notify; never fabricate a recipient
  END IF;

  INSERT INTO public.notifications (
    user_id, title, message, type, channel, entity_type, entity_id, source_route)
  VALUES (v_recipient, _title, _message, COALESCE(_type,'workflow'), 'in_app',
          _entity_type, _entity_id, _route)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.workflow_notification_emit(text, uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.workflow_notification_emit(text, uuid, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.workflow_notification_emit(text, uuid, text, text, text, text)
  TO authenticated, service_role;


-- 5. Return activity history append ------------------------------------------
CREATE OR REPLACE FUNCTION public.return_activity_log_append(_entry jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_return uuid := NULLIF(_entry->>'return_id','')::uuid;
  v_id uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF v_return IS NULL THEN RAISE EXCEPTION 'return_required'; END IF;
  IF NULLIF(btrim(COALESCE(_entry->>'action','')),'') IS NULL THEN RAISE EXCEPTION 'action_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.compliance_returns r WHERE r.id = v_return) THEN
    RAISE EXCEPTION 'unknown_return';
  END IF;

  INSERT INTO public.return_audit_log (
    return_id, action, previous_status, new_status, previous_step_id, new_step_id,
    comments, performed_by, actor_role, metadata, event_key, source)
  VALUES (
    v_return, _entry->>'action', NULLIF(_entry->>'previous_status',''), NULLIF(_entry->>'new_status',''),
    NULLIF(_entry->>'previous_step_id','')::uuid, NULLIF(_entry->>'new_step_id','')::uuid,
    NULLIF(_entry->>'comments',''), v_actor, NULLIF(_entry->>'actor_role',''),
    COALESCE(_entry->'metadata','{}'::jsonb), NULLIF(_entry->>'event_key',''),
    COALESCE(NULLIF(_entry->>'source',''), 'client'))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.return_activity_log_append(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.return_activity_log_append(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.return_activity_log_append(jsonb) TO authenticated, service_role;