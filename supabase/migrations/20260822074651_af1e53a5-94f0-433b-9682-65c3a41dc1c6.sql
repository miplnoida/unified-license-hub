-- 1. Natural-key uniqueness so upserts can never duplicate an action on a step.
CREATE UNIQUE INDEX IF NOT EXISTS ux_approval_step_actions_step_action_type
  ON public.approval_step_actions (step_id, action_type);

-- 2. Governed save RPC (upsert on (step_id, action_type)).
CREATE OR REPLACE FUNCTION public.approval_step_action_save(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _step_id uuid := nullif(_payload->>'step_id','')::uuid;
  _action_type text := nullif(_payload->>'action_type','');
  _mode text := coalesce(nullif(_payload->>'next_step_mode',''),'next');
  _next_step_id uuid := nullif(_payload->>'next_step_id','')::uuid;
  _end_state text := nullif(_payload->>'end_state','');
  _row public.approval_step_actions;
  _allowed text[];
  _entity_type text;
  _event_key text;
  _template_id uuid;
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

  IF _step_id IS NULL OR _action_type IS NULL THEN
    RAISE EXCEPTION 'step_id and action_type are required' USING ERRCODE='22023';
  END IF;
  IF _action_type NOT IN ('approve','reject','send_back','escalate',
                          'request_resubmission','return_for_correction',
                          'request_more_info','save_comment') THEN
    RAISE EXCEPTION 'Unsupported action_type: %', _action_type USING ERRCODE='22023';
  END IF;
  IF _mode NOT IN ('next','specific_step','previous','return_to_applicant','end_workflow','keep') THEN
    RAISE EXCEPTION 'Unsupported next_step_mode: %', _mode USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.approval_steps WHERE id = _step_id) THEN
    RAISE EXCEPTION 'Step not found' USING ERRCODE='P0002';
  END IF;

  IF _mode = 'specific_step' THEN
    IF _next_step_id IS NULL THEN
      RAISE EXCEPTION 'Choose the target step for "Move to Specific Step".' USING ERRCODE='22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.approval_steps t
      JOIN public.approval_steps s ON s.workflow_id = t.workflow_id
      WHERE t.id = _next_step_id AND s.id = _step_id
    ) THEN
      RAISE EXCEPTION 'Target step must belong to the same workflow' USING ERRCODE='22023';
    END IF;
  ELSE
    _next_step_id := NULL;
  END IF;

  IF _mode = 'end_workflow' THEN
    IF _end_state IS NULL OR _end_state NOT IN ('approved','rejected','cancelled') THEN
      RAISE EXCEPTION 'Choose an end state (Approved / Rejected / Cancelled) for "End Workflow".' USING ERRCODE='22023';
    END IF;
  ELSE
    _end_state := NULL;
  END IF;

  INSERT INTO public.approval_step_actions AS a (
    step_id, action_type, label, require_comments, result_status_override,
    next_step_mode, next_step_id, end_state, sort_order, is_enabled,
    require_digital_signature, signature_data_url
  ) VALUES (
    _step_id,
    _action_type,
    nullif(btrim(coalesce(_payload->>'label','')),''),
    coalesce((_payload->>'require_comments')::boolean, false),
    nullif(btrim(coalesce(_payload->>'result_status_override','')),''),
    _mode,
    _next_step_id,
    _end_state,
    coalesce((_payload->>'sort_order')::int, 0),
    coalesce((_payload->>'is_enabled')::boolean, true),
    coalesce((_payload->>'require_digital_signature')::boolean, false),
    CASE WHEN coalesce((_payload->>'require_digital_signature')::boolean,false)
         THEN nullif(_payload->>'signature_data_url','') ELSE NULL END
  )
  ON CONFLICT (step_id, action_type) DO UPDATE SET
    label = EXCLUDED.label,
    require_comments = EXCLUDED.require_comments,
    result_status_override = EXCLUDED.result_status_override,
    next_step_mode = EXCLUDED.next_step_mode,
    next_step_id = EXCLUDED.next_step_id,
    end_state = EXCLUDED.end_state,
    sort_order = EXCLUDED.sort_order,
    is_enabled = EXCLUDED.is_enabled,
    require_digital_signature = EXCLUDED.require_digital_signature,
    signature_data_url = EXCLUDED.signature_data_url,
    updated_at = now()
  RETURNING a.* INTO _row;

  -- Keep the runtime gate (approval_steps.allowed_actions) in lock-step.
  SELECT array_agg(DISTINCT x.action_type)
    INTO _allowed
    FROM public.approval_step_actions x
   WHERE x.step_id = _step_id AND x.is_enabled;
  UPDATE public.approval_steps
     SET allowed_actions = to_jsonb(coalesce(_allowed, ARRAY[]::text[]))
   WHERE id = _step_id;

  -- Seed a default action notification when one is not configured yet.
  IF _row.is_enabled THEN
    SELECT w.entity_type INTO _entity_type
      FROM public.approval_steps s
      JOIN public.approval_workflows w ON w.id = s.workflow_id
     WHERE s.id = _step_id;

    _event_key := CASE
      WHEN _entity_type = 'registration' THEN 'registration_' || _action_type
      WHEN _entity_type = 'return' THEN 'return_' || _action_type
      WHEN _entity_type = 'complaint' THEN 'complaint_' || _action_type
      ELSE 'application_' || _action_type
    END;

    IF NOT EXISTS (
      SELECT 1 FROM public.approval_action_notifications n
       WHERE n.step_id = _step_id AND n.action_type = _action_type AND n.event_key = _event_key
    ) THEN
      SELECT t.id INTO _template_id
        FROM public.notification_templates t
       WHERE t.event_type = _event_key AND t.channel = 'email' AND t.is_active
       ORDER BY t.created_at ASC LIMIT 1;
      IF _template_id IS NOT NULL THEN
        INSERT INTO public.approval_action_notifications
          (step_id, action_type, event_key, recipient_type, recipient_config, template_id, is_enabled)
        VALUES (_step_id, _action_type, _event_key, 'applicant', '{}'::jsonb, _template_id, true)
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  END IF;

  PERFORM public.log_compliance_audit('UPDATE'::compliance_audit_action,
    'approval_step_actions', _row.id::text, NULL,
    to_jsonb(_row), 'Workflow step action saved');

  RETURN to_jsonb(_row);
END $$;

-- 3. Governed delete RPC.
CREATE OR REPLACE FUNCTION public.approval_step_action_delete(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _row public.approval_step_actions;
  _allowed text[];
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

  SELECT * INTO _row FROM public.approval_step_actions WHERE id = _id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('deleted', 0);
  END IF;

  DELETE FROM public.approval_action_notifications
   WHERE step_id = _row.step_id AND action_type = _row.action_type;
  DELETE FROM public.approval_step_actions WHERE id = _id;

  SELECT array_agg(DISTINCT x.action_type)
    INTO _allowed
    FROM public.approval_step_actions x
   WHERE x.step_id = _row.step_id AND x.is_enabled;
  UPDATE public.approval_steps
     SET allowed_actions = to_jsonb(coalesce(_allowed, ARRAY[]::text[]))
   WHERE id = _row.step_id;

  PERFORM public.log_compliance_audit('DELETE'::compliance_audit_action,
    'approval_step_actions', _id::text, to_jsonb(_row), NULL,
    'Workflow step action removed');

  RETURN jsonb_build_object('deleted', 1, 'step_id', _row.step_id);
END $$;

-- 4. Execute grants: authenticated + service_role only.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT format('public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid)) sig
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname IN ('approval_step_action_save','approval_step_action_delete')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- 5. Idempotent backfill: mirror existing approval_steps.allowed_actions into
--    per-action config rows using routing identical to the legacy runtime path.
INSERT INTO public.approval_step_actions
  (step_id, action_type, label, require_comments, next_step_mode, end_state, sort_order, is_enabled)
SELECT s.id,
       act.action_type,
       NULL,
       act.action_type IN ('approve','reject','request_resubmission','return_for_correction','request_more_info','save_comment'),
       CASE act.action_type
         WHEN 'reject' THEN 'end_workflow'
         WHEN 'send_back' THEN 'previous'
         WHEN 'request_resubmission' THEN 'return_to_applicant'
         WHEN 'return_for_correction' THEN 'return_to_applicant'
         WHEN 'request_more_info' THEN 'return_to_applicant'
         WHEN 'save_comment' THEN 'keep'
         ELSE 'next'
       END,
       CASE WHEN act.action_type = 'reject' THEN 'rejected' ELSE NULL END,
       act.ord - 1,
       true
  FROM public.approval_steps s
  CROSS JOIN LATERAL (
    SELECT value::text AS action_type, ordinality AS ord
      FROM jsonb_array_elements_text(coalesce(s.allowed_actions,'[]'::jsonb)) WITH ORDINALITY AS t(value, ordinality)
  ) act
 WHERE act.action_type IN ('approve','reject','send_back','escalate',
                           'request_resubmission','return_for_correction',
                           'request_more_info','save_comment')
ON CONFLICT (step_id, action_type) DO NOTHING;