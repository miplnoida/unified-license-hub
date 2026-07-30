CREATE OR REPLACE FUNCTION public.reinstate_application_after_appeal(
  _appeal_id uuid,
  _remarks text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_appeal record;
  v_app record;
  v_actor_roles text[];
  v_instance_id uuid;
BEGIN
  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','Not authenticated','code','UNAUTHORIZED','http',401);
  END IF;

  SELECT array_agg(DISTINCT r) INTO v_actor_roles FROM (
    SELECT role::text AS r FROM public.user_roles WHERE user_id = v_uid
    UNION
    SELECT ro.system_role AS r
      FROM public.user_dynamic_roles udr
      JOIN public.roles ro ON ro.id = udr.role_id
     WHERE udr.user_id = v_uid AND ro.system_role IS NOT NULL
  ) sub;
  v_actor_roles := COALESCE(v_actor_roles, ARRAY[]::text[]);

  IF NOT (
    public.has_permission(v_uid, 'license_appeals', 'decide')
    OR v_actor_roles && ARRAY['super_admin','admin','supervisor','licensing_officer']::text[]
  ) THEN
    RETURN jsonb_build_object('error','You are not allowed to decide appeals','code','FORBIDDEN','http',403);
  END IF;

  SELECT * INTO v_appeal FROM public.license_appeals WHERE id = _appeal_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Appeal not found','code','NOT_FOUND','http',404);
  END IF;

  SELECT id, applicant_id, application_number, status
    INTO v_app
    FROM public.applications
   WHERE id = v_appeal.application_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Application not found','code','NOT_FOUND','http',404);
  END IF;

  IF v_app.status <> 'rejected' THEN
    RETURN jsonb_build_object(
      'success', true, 'http', 200, 'skipped', true,
      'reason', format('Application is already ''%s''', v_app.status),
      'application_id', v_app.id, 'status', v_app.status
    );
  END IF;

  -- Guard: never create a second active workflow for the same entity.
  IF EXISTS (
    SELECT 1 FROM public.workflow_instances
     WHERE entity_type = 'application' AND entity_id = v_app.id
       AND status IN ('active','paused')
  ) THEN
    v_instance_id := NULL;
  ELSE
    UPDATE public.workflow_instances
       SET status = 'active', completed_at = NULL, updated_at = v_now
     WHERE id = (
       SELECT id FROM public.workflow_instances
        WHERE entity_type = 'application' AND entity_id = v_app.id
          AND status = 'rejected'
        ORDER BY updated_at DESC
        LIMIT 1
     )
    RETURNING id INTO v_instance_id;
  END IF;

  UPDATE public.applications
     SET status = 'in_progress', rejected_at = NULL, updated_at = v_now
   WHERE id = v_app.id;

  INSERT INTO public.approval_actions (
    application_id, actor_id, action, action_type, comments, responded_at, workflow_instance_id
  ) VALUES (
    v_app.id, v_uid, 'reinstated', 'save_comment',
    COALESCE(NULLIF(trim(_remarks), ''), 'Application reinstated for reconsideration after the appeal was considered'),
    v_now, v_instance_id
  );

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value)
  VALUES (
    v_uid, 'application_reinstated_after_appeal', 'application', v_app.id::text,
    jsonb_build_object(
      'appeal_id', v_appeal.id,
      'appeal_reference', v_appeal.appeal_reference,
      'remarks', _remarks,
      'previous_status', 'rejected',
      'new_status', 'in_progress'
    )
  );

  INSERT INTO public.license_appeal_events (appeal_id, event_type, description, actor_id, metadata)
  VALUES (
    v_appeal.id, 'application_reinstated',
    format('Application %s reinstated for reconsideration after the appeal was considered', v_app.application_number),
    v_uid,
    jsonb_build_object('application_id', v_app.id)
  );

  INSERT INTO public.notifications (user_id, title, message, type, entity_type, entity_id)
  VALUES (
    v_app.applicant_id,
    'Appeal considered: ' || v_app.application_number,
    'Your appeal was accepted for consideration and application ' || v_app.application_number
      || ' is back under review.',
    'success', 'application', v_app.id::text
  );

  RETURN jsonb_build_object(
    'success', true, 'http', 200,
    'application_id', v_app.id,
    'application_number', v_app.application_number,
    'status', 'in_progress',
    'workflow_instance_id', v_instance_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reinstate_application_after_appeal(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reinstate_application_after_appeal(uuid, text) TO authenticated;