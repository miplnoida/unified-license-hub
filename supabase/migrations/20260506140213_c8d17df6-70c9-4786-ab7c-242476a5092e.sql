-- Helper: idempotently create license + licensee for an application,
-- but ONLY when the application is approved AND a successful payment exists.
-- Both events (approval + payment verification) call this; whichever happens
-- last actually creates the entity.

CREATE OR REPLACE FUNCTION public.provision_application_entity(_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_app record;
  v_app_data jsonb;
  v_license record;
  v_licensee_id uuid;
  v_entity_name text;
  v_paid boolean;
BEGIN
  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);

  SELECT id, applicant_id, application_number, status, license_type,
         regulator_id, data
    INTO v_app FROM public.applications WHERE id = _application_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Application not found','code','NOT_FOUND','http',404);
  END IF;

  IF v_app.status <> 'approved' THEN
    RETURN jsonb_build_object('success', false, 'code','AWAITING_APPROVAL','http',200,
                              'application_id', _application_id);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.payments
     WHERE application_id = _application_id
       AND status IN ('success','completed','paid','verified')
  ) INTO v_paid;

  IF NOT v_paid THEN
    RETURN jsonb_build_object('success', false, 'code','AWAITING_PAYMENT','http',200,
                              'application_id', _application_id);
  END IF;

  v_app_data := COALESCE(v_app.data, '{}'::jsonb);

  -- License (idempotent)
  SELECT id, license_number INTO v_license
    FROM public.licenses WHERE application_id = _application_id LIMIT 1;
  IF v_license.id IS NULL THEN
    INSERT INTO public.licenses (application_id, holder_id, license_type, regulator_id,
      sector_id, sub_sector_id, category_id)
    VALUES (_application_id, v_app.applicant_id, v_app.license_type, v_app.regulator_id,
      NULLIF(v_app_data->>'sector_id','')::uuid,
      NULLIF(v_app_data->>'sub_sector_id','')::uuid,
      NULLIF(v_app_data->>'category_id','')::uuid)
    RETURNING id, license_number INTO v_license;
  END IF;

  -- Licensee / Entity (idempotent)
  SELECT id INTO v_licensee_id
    FROM public.licensees WHERE license_id = v_license.id LIMIT 1;
  IF v_licensee_id IS NULL THEN
    v_entity_name := COALESCE(NULLIF(v_app_data->>'entity_name',''),
                              NULLIF(v_app_data->>'applicant_name',''),
                              v_app.license_type);
    INSERT INTO public.licensees (name, license_id, sector_id, sub_sector_id, category_id, status)
    VALUES (v_entity_name, v_license.id,
      NULLIF(v_app_data->>'sector_id','')::uuid,
      NULLIF(v_app_data->>'sub_sector_id','')::uuid,
      NULLIF(v_app_data->>'category_id','')::uuid, 'active')
    RETURNING id INTO v_licensee_id;
  END IF;

  PERFORM public.create_audit_log(v_app.applicant_id, 'entity_provisioned', 'licensee',
    v_licensee_id::text, NULL,
    jsonb_build_object('license_id',v_license.id,'license_number',v_license.license_number,
                       'application_id',_application_id), NULL);

  RETURN jsonb_build_object('success', true, 'http', 200,
    'application_id', _application_id,
    'license_id', v_license.id,
    'license_number', v_license.license_number,
    'licensee_id', v_licensee_id,
    'applicant_id', v_app.applicant_id);
END;
$$;

REVOKE ALL ON FUNCTION public.provision_application_entity(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provision_application_entity(uuid) TO authenticated, service_role;

-- Replace perform_final_workflow_approval to skip license/licensee creation
-- when no successful payment exists yet. Provisioning is delegated to the
-- helper above and will happen later (when payment is verified).
CREATE OR REPLACE FUNCTION public.perform_final_workflow_approval(_application_id uuid, _instance_id uuid, _step_id uuid, _comments text, _actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_app record; v_instance record; v_step record;
  v_steps_total int; v_current_idx int;
  v_auth jsonb;
  v_allowed_actions text[];
  v_now timestamptz := now();
  v_provision jsonb;
  v_license_id uuid; v_license_number text; v_licensee_id uuid;
BEGIN
  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);

  IF _actor_id IS NULL THEN
    RETURN jsonb_build_object('error','UNAUTHORIZED','code','UNAUTHORIZED','http',401);
  END IF;
  IF _comments IS NULL OR length(trim(_comments)) = 0 THEN
    RETURN jsonb_build_object('error','Remarks are mandatory for approval','code','REMARKS_REQUIRED','http',422);
  END IF;

  SELECT id, applicant_id, application_number, status, license_type,
         regulator_id, workflow_id, data, approved_at
    INTO v_app FROM public.applications WHERE id=_application_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Application not found','code','NOT_FOUND','http',404);
  END IF;

  IF v_app.status = 'approved' THEN
    -- Already approved — try (re)provisioning; safe even if payment still pending.
    v_provision := public.provision_application_entity(_application_id);
    RETURN jsonb_build_object('success',true,'http',200,'already_processed',true,
      'application_id',_application_id,
      'applicant_id',v_app.applicant_id,
      'provision', v_provision);
  END IF;

  IF v_app.status NOT IN ('submitted','in_progress') THEN
    RETURN jsonb_build_object('error',format('Cannot approve application in ''%s'' status', v_app.status),
                              'code','INVALID_STATUS','http',409);
  END IF;

  SELECT id, workflow_id, current_step_id, status INTO v_instance
    FROM public.workflow_instances
   WHERE entity_id=_application_id AND entity_type='application' AND status='active'
   ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','No active workflow instance','code','NO_ACTIVE_INSTANCE','http',409);
  END IF;
  IF _instance_id IS NOT NULL AND _instance_id<>v_instance.id THEN
    RETURN jsonb_build_object('error','Stale workflow instance','code','STALE_INSTANCE','http',409);
  END IF;
  IF _step_id IS NOT NULL AND _step_id<>v_instance.current_step_id THEN
    RETURN jsonb_build_object('error','Stale step','code','STALE_STEP','http',409);
  END IF;

  SELECT id, step_order, approver_role, approver_role_id, allowed_actions
    INTO v_step FROM public.approval_steps WHERE id=v_instance.current_step_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Current step not found','code','STEP_NOT_FOUND','http',409);
  END IF;

  SELECT count(*),
         (SELECT count(*) FROM public.approval_steps s2
          WHERE s2.workflow_id=v_instance.workflow_id AND s2.step_order<v_step.step_order)
    INTO v_steps_total, v_current_idx
    FROM public.approval_steps WHERE workflow_id=v_instance.workflow_id;

  IF v_current_idx <> v_steps_total - 1 THEN
    RETURN jsonb_build_object('error','Final approval requires last workflow step','code','NOT_LAST_STEP','http',422);
  END IF;

  v_auth := public.user_can_act_on_workflow_step(_actor_id, v_step.id);
  IF NOT (v_auth->>'can_act')::boolean THEN
    RETURN jsonb_build_object('error',
      format('Only %s can act on this step', COALESCE(v_auth->>'required_role_name', v_step.approver_role::text)),
      'code','WRONG_APPROVER','http',403,
      'diagnostic', v_auth);
  END IF;

  v_allowed_actions := ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_step.allowed_actions, '[]'::jsonb)));
  IF NOT ('approve' = ANY(v_allowed_actions)) THEN
    RETURN jsonb_build_object('error','Approve is not allowed on this step','code','ACTION_NOT_ALLOWED','http',422);
  END IF;

  UPDATE public.applications SET status='approved', approved_at=v_now, updated_at=v_now WHERE id=_application_id;
  UPDATE public.workflow_instances SET status='completed', completed_at=v_now, updated_at=v_now WHERE id=v_instance.id;

  -- Try provisioning entity now (only succeeds if payment is also verified).
  v_provision := public.provision_application_entity(_application_id);
  v_license_id    := NULLIF(v_provision->>'license_id','')::uuid;
  v_license_number := v_provision->>'license_number';
  v_licensee_id   := NULLIF(v_provision->>'licensee_id','')::uuid;

  INSERT INTO public.approval_actions (application_id, step_id, workflow_instance_id, actor_id,
    action, action_type, comments, responded_at)
  VALUES (_application_id, v_step.id, v_instance.id, _actor_id,
    'approve_final', 'approve', NULLIF(trim(_comments),''), v_now)
  ON CONFLICT (application_id) WHERE action='approve_final' DO NOTHING;

  PERFORM public.create_audit_log(_actor_id, 'application_final_approved', 'application',
    _application_id::text, NULL,
    jsonb_build_object('license_id',v_license_id,'license_number',v_license_number,
                       'licensee_id',v_licensee_id, 'auth', v_auth,
                       'provision', v_provision), NULL);

  PERFORM public.create_notification(v_app.applicant_id,
    'Application Approved: ' || v_app.application_number,
    CASE WHEN v_license_number IS NOT NULL
         THEN 'Your application has been approved. License Number: ' || v_license_number
         ELSE 'Your application has been approved. Your license will be issued once payment is verified.' END,
    'success', 'application', _application_id::text);

  RETURN jsonb_build_object('success',true,'http',200,
    'application_id',_application_id,
    'license_id',v_license_id,
    'license_number',v_license_number,
    'licensee_id',v_licensee_id,
    'applicant_id',v_app.applicant_id,
    'provision', v_provision);
END;
$function$;