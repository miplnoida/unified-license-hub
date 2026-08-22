-- ============================================================================
-- Phase 1: governed write surface for workflow notification + step config
-- ============================================================================

-- Shared authorisation guard for workflow configuration writes.
CREATE OR REPLACE FUNCTION public.assert_workflow_config_writer()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  IF NOT (public.has_permission(_uid,'workflow_management','edit')
          OR public.has_permission(_uid,'workflow_management','manage_config')
          OR public.has_permission(_uid,'workflow_management','publish')
          OR public.is_super_admin(_uid)) THEN
    RAISE EXCEPTION 'Workflow configuration permission required' USING ERRCODE='42501';
  END IF;
  RETURN _uid;
END $$;

-- ---------------------------------------------------------------------------
-- Structural guard: allowed_actions can never drift from approval_step_actions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_sync_step_allowed_actions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _step uuid := coalesce(NEW.step_id, OLD.step_id);
DECLARE _allowed text[];
BEGIN
  SELECT array_agg(DISTINCT x.action_type ORDER BY x.action_type)
    INTO _allowed
    FROM public.approval_step_actions x
   WHERE x.step_id = _step AND x.is_enabled;
  UPDATE public.approval_steps
     SET allowed_actions = to_jsonb(coalesce(_allowed, ARRAY[]::text[]))
   WHERE id = _step;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_sync_step_allowed_actions ON public.approval_step_actions;
CREATE TRIGGER trg_sync_step_allowed_actions
AFTER INSERT OR UPDATE OR DELETE ON public.approval_step_actions
FOR EACH ROW EXECUTE FUNCTION public.tg_sync_step_allowed_actions();

-- ---------------------------------------------------------------------------
-- Recipient config validation shared by action + entry notification writers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_notification_recipient_config(
  _recipient_type text, _recipient_config jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE _cfg jsonb := coalesce(_recipient_config, '{}'::jsonb);
DECLARE _txt text;
BEGIN
  IF _recipient_type = 'custom_email' THEN
    _txt := lower(btrim(coalesce(_cfg->>'email','')));
    IF _txt = '' THEN
      RAISE EXCEPTION 'Custom email recipient requires an email address' USING ERRCODE='22023';
    END IF;
    IF _txt !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' THEN
      RAISE EXCEPTION 'Custom email recipient address is not a valid email' USING ERRCODE='22023';
    END IF;
    _cfg := _cfg || jsonb_build_object('email', _txt);

  ELSIF _recipient_type = 'role' THEN
    _txt := btrim(coalesce(_cfg->>'role', _cfg->>'role_name',''));
    IF _txt = '' AND nullif(_cfg->>'role_id','') IS NULL THEN
      RAISE EXCEPTION 'Role recipient requires a role selection' USING ERRCODE='22023';
    END IF;
    -- Prefer stable role identity: resolve a name to its role_id when unambiguous.
    IF nullif(_cfg->>'role_id','') IS NULL AND _txt <> '' THEN
      _cfg := _cfg || jsonb_build_object('role', _txt, 'role_name', _txt);
    END IF;

  ELSIF _recipient_type = 'named_user' THEN
    IF nullif(_cfg->>'user_id','') IS NULL
       AND coalesce(jsonb_array_length(_cfg->'user_ids'),0) = 0 THEN
      RAISE EXCEPTION 'Named user recipient requires a user selection' USING ERRCODE='22023';
    END IF;
  END IF;

  RETURN _cfg;
END $$;

-- ---------------------------------------------------------------------------
-- Per-action notification bindings
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approval_action_notification_save(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := public.assert_workflow_config_writer();
  _id uuid := nullif(_payload->>'id','')::uuid;
  _step_id uuid := nullif(_payload->>'step_id','')::uuid;
  _action_type text := nullif(btrim(coalesce(_payload->>'action_type','')),'');
  _event_key text := nullif(btrim(coalesce(_payload->>'event_key','')),'');
  _recipient_type text := nullif(btrim(coalesce(_payload->>'recipient_type','')),'');
  _cfg jsonb;
  _template_id uuid := nullif(_payload->>'template_id','')::uuid;
  _row public.approval_action_notifications;
BEGIN
  IF _id IS NOT NULL AND _step_id IS NULL THEN
    SELECT step_id INTO _step_id FROM public.approval_action_notifications WHERE id = _id;
  END IF;
  IF _step_id IS NULL OR _action_type IS NULL OR _event_key IS NULL OR _recipient_type IS NULL THEN
    RAISE EXCEPTION 'step_id, action_type, event_key and recipient_type are required'
      USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.approval_steps WHERE id = _step_id) THEN
    RAISE EXCEPTION 'Step not found' USING ERRCODE='P0002';
  END IF;
  IF _action_type NOT IN ('approve','reject','send_back','escalate',
                          'request_resubmission','return_for_correction',
                          'request_more_info','save_comment') THEN
    RAISE EXCEPTION 'Unsupported action_type: %', _action_type USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.approval_step_actions
     WHERE step_id = _step_id AND action_type = _action_type
  ) THEN
    RAISE EXCEPTION 'Configure the "%" action on this step before binding a notification to it', _action_type
      USING ERRCODE='22023';
  END IF;

  _cfg := public.validate_notification_recipient_config(_recipient_type, _payload->'recipient_config');

  IF _template_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE id = _template_id) THEN
      RAISE EXCEPTION 'Selected notification template does not exist' USING ERRCODE='P0002';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE id = _template_id AND is_active) THEN
      RAISE EXCEPTION 'Selected notification template is inactive' USING ERRCODE='22023';
    END IF;
  END IF;

  IF _id IS NOT NULL THEN
    UPDATE public.approval_action_notifications SET
      step_id = _step_id,
      action_type = _action_type,
      event_key = _event_key,
      recipient_type = _recipient_type::workflow_notification_recipient,
      recipient_config = _cfg,
      template_id = _template_id,
      is_enabled = coalesce((_payload->>'is_enabled')::boolean, true),
      updated_at = now()
    WHERE id = _id
    RETURNING * INTO _row;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Notification binding not found' USING ERRCODE='P0002';
    END IF;
  ELSE
    INSERT INTO public.approval_action_notifications
      (step_id, action_type, event_key, recipient_type, recipient_config, template_id, is_enabled)
    VALUES (_step_id, _action_type, _event_key,
            _recipient_type::workflow_notification_recipient, _cfg, _template_id,
            coalesce((_payload->>'is_enabled')::boolean, true))
    RETURNING * INTO _row;
  END IF;

  PERFORM public.log_compliance_audit('UPDATE'::compliance_audit_action,
    'approval_action_notifications', _row.id::text, NULL,
    to_jsonb(_row), 'Workflow action notification saved');

  RETURN to_jsonb(_row);
END $$;

CREATE OR REPLACE FUNCTION public.approval_action_notification_delete(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := public.assert_workflow_config_writer();
  _row public.approval_action_notifications;
BEGIN
  SELECT * INTO _row FROM public.approval_action_notifications WHERE id = _id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('deleted', 0);
  END IF;
  DELETE FROM public.approval_action_notifications WHERE id = _id;

  PERFORM public.log_compliance_audit('DELETE'::compliance_audit_action,
    'approval_action_notifications', _id::text, to_jsonb(_row), NULL,
    'Workflow action notification removed');

  RETURN jsonb_build_object('deleted', 1, 'step_id', _row.step_id);
END $$;

-- ---------------------------------------------------------------------------
-- Step-entry notifications
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approval_step_entry_notification_save(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := public.assert_workflow_config_writer();
  _id uuid := nullif(_payload->>'id','')::uuid;
  _step_id uuid := nullif(_payload->>'step_id','')::uuid;
  _event_key text := nullif(btrim(coalesce(_payload->>'event_key','')),'');
  _recipient_type text := nullif(btrim(coalesce(_payload->>'recipient_type','')),'');
  _cfg jsonb;
  _template_id uuid := nullif(_payload->>'template_id','')::uuid;
  _row public.approval_step_entry_notifications;
BEGIN
  IF _id IS NOT NULL AND _step_id IS NULL THEN
    SELECT step_id INTO _step_id FROM public.approval_step_entry_notifications WHERE id = _id;
  END IF;
  IF _step_id IS NULL OR _event_key IS NULL OR _recipient_type IS NULL THEN
    RAISE EXCEPTION 'step_id, event_key and recipient_type are required' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.approval_steps WHERE id = _step_id) THEN
    RAISE EXCEPTION 'Step not found' USING ERRCODE='P0002';
  END IF;

  _cfg := public.validate_notification_recipient_config(_recipient_type, _payload->'recipient_config');

  IF _template_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE id = _template_id) THEN
      RAISE EXCEPTION 'Selected notification template does not exist' USING ERRCODE='P0002';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE id = _template_id AND is_active) THEN
      RAISE EXCEPTION 'Selected notification template is inactive' USING ERRCODE='22023';
    END IF;
  END IF;

  IF _id IS NOT NULL THEN
    UPDATE public.approval_step_entry_notifications SET
      step_id = _step_id,
      event_key = _event_key,
      recipient_type = _recipient_type,
      recipient_config = _cfg,
      template_id = _template_id,
      is_enabled = coalesce((_payload->>'is_enabled')::boolean, true),
      updated_at = now()
    WHERE id = _id
    RETURNING * INTO _row;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Notification binding not found' USING ERRCODE='P0002';
    END IF;
  ELSE
    INSERT INTO public.approval_step_entry_notifications
      (step_id, event_key, recipient_type, recipient_config, template_id, is_enabled)
    VALUES (_step_id, _event_key, _recipient_type, _cfg, _template_id,
            coalesce((_payload->>'is_enabled')::boolean, true))
    RETURNING * INTO _row;
  END IF;

  PERFORM public.log_compliance_audit('UPDATE'::compliance_audit_action,
    'approval_step_entry_notifications', _row.id::text, NULL,
    to_jsonb(_row), 'Workflow step entry notification saved');

  RETURN to_jsonb(_row);
END $$;

CREATE OR REPLACE FUNCTION public.approval_step_entry_notification_delete(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := public.assert_workflow_config_writer();
  _row public.approval_step_entry_notifications;
BEGIN
  SELECT * INTO _row FROM public.approval_step_entry_notifications WHERE id = _id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('deleted', 0);
  END IF;
  DELETE FROM public.approval_step_entry_notifications WHERE id = _id;

  PERFORM public.log_compliance_audit('DELETE'::compliance_audit_action,
    'approval_step_entry_notifications', _id::text, to_jsonb(_row), NULL,
    'Workflow step entry notification removed');

  RETURN jsonb_build_object('deleted', 1, 'step_id', _row.step_id);
END $$;

-- ---------------------------------------------------------------------------
-- Governed step writer: allowed_actions is NEVER taken from the client
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approval_step_save(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := public.assert_workflow_config_writer();
  _id uuid := nullif(_payload->>'id','')::uuid;
  _workflow_id uuid := nullif(_payload->>'workflow_id','')::uuid;
  _row public.approval_steps;
  _existing public.approval_steps;
BEGIN
  IF _id IS NOT NULL THEN
    SELECT * INTO _existing FROM public.approval_steps WHERE id = _id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Step not found' USING ERRCODE='P0002';
    END IF;

    UPDATE public.approval_steps s SET
      step_order = coalesce((_payload->>'step_order')::int, s.step_order),
      name = coalesce(nullif(btrim(coalesce(_payload->>'name','')),''), s.name),
      description = CASE WHEN _payload ? 'description'
                         THEN nullif(_payload->>'description','') ELSE s.description END,
      approver_role = coalesce(nullif(_payload->>'approver_role','')::app_role, s.approver_role),
      approver_role_id = CASE WHEN _payload ? 'approver_role_id'
                              THEN nullif(_payload->>'approver_role_id','')::uuid
                              ELSE s.approver_role_id END,
      approver_type = coalesce(nullif(_payload->>'approver_type',''), s.approver_type),
      approver_config = coalesce(_payload->'approver_config', s.approver_config),
      step_type = coalesce(nullif(_payload->>'step_type',''), s.step_type),
      condition = CASE WHEN _payload ? 'condition' THEN _payload->'condition' ELSE s.condition END,
      is_required = coalesce((_payload->>'is_required')::boolean, s.is_required),
      sla_hours = CASE WHEN _payload ? 'sla_hours'
                       THEN nullif(_payload->>'sla_hours','')::int ELSE s.sla_hours END,
      sla_warning_threshold_percent = CASE WHEN _payload ? 'sla_warning_threshold_percent'
                       THEN nullif(_payload->>'sla_warning_threshold_percent','')::int
                       ELSE s.sla_warning_threshold_percent END,
      sla_pause_on_rfi = coalesce((_payload->>'sla_pause_on_rfi')::boolean, s.sla_pause_on_rfi),
      sla_warning_template_id = CASE WHEN _payload ? 'sla_warning_template_id'
                       THEN nullif(_payload->>'sla_warning_template_id','')::uuid
                       ELSE s.sla_warning_template_id END,
      sla_breach_template_id = CASE WHEN _payload ? 'sla_breach_template_id'
                       THEN nullif(_payload->>'sla_breach_template_id','')::uuid
                       ELSE s.sla_breach_template_id END,
      escalation_role = CASE WHEN _payload ? 'escalation_role'
                       THEN nullif(_payload->>'escalation_role','') ELSE s.escalation_role END,
      escalation_after_hours = CASE WHEN _payload ? 'escalation_after_hours'
                       THEN nullif(_payload->>'escalation_after_hours','')::int
                       ELSE s.escalation_after_hours END,
      auto_approve_on_timeout = coalesce((_payload->>'auto_approve_on_timeout')::boolean, s.auto_approve_on_timeout),
      step_entry_notifications_enabled = coalesce((_payload->>'step_entry_notifications_enabled')::boolean,
                                                 s.step_entry_notifications_enabled),
      require_digital_signature = coalesce((_payload->>'require_digital_signature')::boolean, s.require_digital_signature),
      is_legal_compliance_stage = coalesce((_payload->>'is_legal_compliance_stage')::boolean, s.is_legal_compliance_stage),
      step_key = CASE WHEN _payload ? 'step_key' THEN nullif(_payload->>'step_key','') ELSE s.step_key END,
      is_start = coalesce((_payload->>'is_start')::boolean, s.is_start),
      is_terminal = coalesce((_payload->>'is_terminal')::boolean, s.is_terminal),
      complainant_visible = coalesce((_payload->>'complainant_visible')::boolean, s.complainant_visible),
      licensee_visible = coalesce((_payload->>'licensee_visible')::boolean, s.licensee_visible),
      assignment_rule = coalesce(_payload->'assignment_rule', s.assignment_rule),
      public_label = CASE WHEN _payload ? 'public_label' THEN nullif(_payload->>'public_label','') ELSE s.public_label END
    WHERE s.id = _id
    RETURNING s.* INTO _row;

    PERFORM public.log_compliance_audit('UPDATE'::compliance_audit_action,
      'approval_steps', _row.id::text, to_jsonb(_existing), to_jsonb(_row),
      'Workflow step updated');
  ELSE
    IF _workflow_id IS NULL THEN
      RAISE EXCEPTION 'workflow_id is required' USING ERRCODE='22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.approval_workflows WHERE id = _workflow_id) THEN
      RAISE EXCEPTION 'Workflow not found' USING ERRCODE='P0002';
    END IF;

    INSERT INTO public.approval_steps (
      workflow_id, step_order, name, description, approver_role, approver_role_id,
      approver_type, approver_config, step_type, condition, is_required,
      sla_hours, sla_warning_threshold_percent, sla_pause_on_rfi,
      escalation_role, escalation_after_hours, auto_approve_on_timeout,
      step_entry_notifications_enabled, require_digital_signature,
      is_legal_compliance_stage, step_key, is_start, is_terminal,
      complainant_visible, licensee_visible, allowed_actions
    ) VALUES (
      _workflow_id,
      coalesce((_payload->>'step_order')::int,
               (SELECT coalesce(max(step_order),0)+1 FROM public.approval_steps WHERE workflow_id=_workflow_id)),
      coalesce(nullif(btrim(coalesce(_payload->>'name','')),''), 'Step'),
      nullif(_payload->>'description',''),
      coalesce(nullif(_payload->>'approver_role','')::app_role, 'admin'::app_role),
      nullif(_payload->>'approver_role_id','')::uuid,
      coalesce(nullif(_payload->>'approver_type',''),'role_based_user'),
      coalesce(_payload->'approver_config','{}'::jsonb),
      coalesce(nullif(_payload->>'step_type',''),'sequential'),
      _payload->'condition',
      coalesce((_payload->>'is_required')::boolean, true),
      coalesce(nullif(_payload->>'sla_hours','')::int, 48),
      coalesce(nullif(_payload->>'sla_warning_threshold_percent','')::int, 80),
      coalesce((_payload->>'sla_pause_on_rfi')::boolean, false),
      nullif(_payload->>'escalation_role',''),
      nullif(_payload->>'escalation_after_hours','')::int,
      coalesce((_payload->>'auto_approve_on_timeout')::boolean, false),
      coalesce((_payload->>'step_entry_notifications_enabled')::boolean, true),
      coalesce((_payload->>'require_digital_signature')::boolean, false),
      coalesce((_payload->>'is_legal_compliance_stage')::boolean, false),
      nullif(_payload->>'step_key',''),
      coalesce((_payload->>'is_start')::boolean, false),
      coalesce((_payload->>'is_terminal')::boolean, false),
      coalesce((_payload->>'complainant_visible')::boolean, true),
      coalesce((_payload->>'licensee_visible')::boolean, true),
      '[]'::jsonb
    )
    RETURNING * INTO _row;

    PERFORM public.log_compliance_audit('CREATE'::compliance_audit_action,
      'approval_steps', _row.id::text, NULL, to_jsonb(_row), 'Workflow step created');
  END IF;

  RETURN to_jsonb(_row);
END $$;

CREATE OR REPLACE FUNCTION public.approval_step_delete(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := public.assert_workflow_config_writer();
  _row public.approval_steps;
  _wf uuid;
  _i int := 0;
  _s record;
BEGIN
  SELECT * INTO _row FROM public.approval_steps WHERE id = _id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('deleted', 0);
  END IF;
  _wf := _row.workflow_id;

  IF EXISTS (SELECT 1 FROM public.workflow_instances
              WHERE current_step_id = _id AND status = 'active') THEN
    RAISE EXCEPTION 'This step is the current step of an in-flight workflow and cannot be deleted'
      USING ERRCODE='22023';
  END IF;

  DELETE FROM public.approval_action_notifications WHERE step_id = _id;
  DELETE FROM public.approval_step_entry_notifications WHERE step_id = _id;
  DELETE FROM public.approval_step_actions WHERE step_id = _id;
  UPDATE public.approval_step_actions SET next_step_mode = 'next', next_step_id = NULL
   WHERE next_step_id = _id;
  DELETE FROM public.approval_steps WHERE id = _id;

  FOR _s IN SELECT id FROM public.approval_steps WHERE workflow_id = _wf ORDER BY step_order LOOP
    _i := _i + 1;
    UPDATE public.approval_steps SET step_order = _i WHERE id = _s.id;
  END LOOP;

  PERFORM public.log_compliance_audit('DELETE'::compliance_audit_action,
    'approval_steps', _id::text, to_jsonb(_row), NULL, 'Workflow step removed');

  RETURN jsonb_build_object('deleted', 1, 'workflow_id', _wf);
END $$;

-- Governed bulk step insert for workflow template cloning.
CREATE OR REPLACE FUNCTION public.approval_steps_snapshot_insert(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := public.assert_workflow_config_writer();
  _step jsonb;
  _ids jsonb := '[]'::jsonb;
  _new jsonb;
BEGIN
  FOR _step IN SELECT * FROM jsonb_array_elements(coalesce(_payload->'steps','[]'::jsonb)) LOOP
    _new := public.approval_step_save(_step);
    _ids := _ids || jsonb_build_array(jsonb_build_object(
      'id', _new->>'id', 'step_order', (_new->>'step_order')::int));
  END LOOP;
  RETURN jsonb_build_object('steps', _ids);
END $$;

-- ---------------------------------------------------------------------------
-- Close the browser write surface
-- ---------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON public.approval_steps FROM authenticated;
GRANT SELECT ON public.approval_steps TO authenticated;
GRANT ALL ON public.approval_steps TO service_role;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT format('public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid)) sig
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname IN (
         'approval_action_notification_save','approval_action_notification_delete',
         'approval_step_entry_notification_save','approval_step_entry_notification_delete',
         'approval_step_save','approval_step_delete','approval_steps_snapshot_insert',
         'assert_workflow_config_writer','validate_notification_recipient_config')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;