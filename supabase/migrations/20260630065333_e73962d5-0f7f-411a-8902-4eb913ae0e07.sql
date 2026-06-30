
CREATE OR REPLACE FUNCTION public.perform_manual_application_approval(
  _application_id uuid,
  _comments text,
  _actor_id uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_app record;
  v_caller_role text;
  v_now timestamptz := now();
  v_provision jsonb;
  v_license_id uuid;
  v_license_number text;
  v_licensee_id uuid;
BEGIN
  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);

  IF _actor_id IS NULL THEN
    RETURN jsonb_build_object('error','UNAUTHORIZED','code','UNAUTHORIZED','http',401);
  END IF;

  -- Caller must be internal staff.
  SELECT public.get_user_role(_actor_id) INTO v_caller_role;
  IF v_caller_role IS NULL
     OR v_caller_role NOT IN ('super_admin','admin','supervisor','licensing_officer') THEN
    RETURN jsonb_build_object('error','Insufficient permissions','code','FORBIDDEN','http',403);
  END IF;

  IF _comments IS NULL OR length(trim(_comments)) = 0 THEN
    RETURN jsonb_build_object('error','Remarks are mandatory for approval','code','REMARKS_REQUIRED','http',422);
  END IF;

  SELECT id, applicant_id, application_number, status, license_type,
         regulator_id, workflow_id, data, approved_at
    INTO v_app
    FROM public.applications
   WHERE id = _application_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Application not found','code','NOT_FOUND','http',404);
  END IF;

  IF v_app.status = 'approved' THEN
    -- Idempotent: re-run provisioning so the license/licensee exist.
    v_provision := public.provision_application_entity(_application_id);
    RETURN jsonb_build_object(
      'success', true, 'http', 200, 'already_processed', true,
      'application_id', _application_id,
      'application_number', v_app.application_number,
      'applicant_id', v_app.applicant_id,
      'license_id', NULLIF(v_provision->>'license_id','')::uuid,
      'license_number', v_provision->>'license_number',
      'licensee_id', NULLIF(v_provision->>'licensee_id','')::uuid,
      'provision', v_provision
    );
  END IF;

  IF v_app.status IN ('rejected','cancelled','withdrawn') THEN
    RETURN jsonb_build_object(
      'error', format('Cannot approve application in ''%s'' status', v_app.status),
      'code','INVALID_STATUS','http',409
    );
  END IF;

  UPDATE public.applications
     SET status = 'approved', approved_at = v_now, updated_at = v_now
   WHERE id = _application_id;

  -- Cancel any open workflow instances so they don't linger.
  UPDATE public.workflow_instances
     SET status = 'completed', completed_at = v_now, updated_at = v_now
   WHERE entity_id = _application_id
     AND entity_type = 'application'
     AND status = 'active';

  v_provision      := public.provision_application_entity(_application_id);
  v_license_id     := NULLIF(v_provision->>'license_id','')::uuid;
  v_license_number := v_provision->>'license_number';
  v_licensee_id    := NULLIF(v_provision->>'licensee_id','')::uuid;

  INSERT INTO public.approval_actions (
    application_id, step_id, workflow_instance_id, actor_id,
    action, action_type, comments, responded_at
  )
  VALUES (
    _application_id, NULL, NULL, _actor_id,
    'approve_final', 'approve', NULLIF(trim(_comments),''), v_now
  )
  ON CONFLICT (application_id) WHERE action='approve_final' DO NOTHING;

  PERFORM public.create_audit_log(
    _actor_id, 'application_manual_approved', 'application',
    _application_id::text, NULL,
    jsonb_build_object(
      'license_id', v_license_id,
      'license_number', v_license_number,
      'licensee_id', v_licensee_id,
      'provision', v_provision,
      'reason', 'no_workflow_configured'
    ), NULL
  );

  PERFORM public.create_notification(
    v_app.applicant_id,
    'Application Approved: ' || v_app.application_number,
    CASE WHEN v_license_number IS NOT NULL
         THEN 'Your application has been approved. License Number: ' || v_license_number
         ELSE 'Your application has been approved. Your license will be issued once payment is verified.'
    END,
    'success', 'application', _application_id::text
  );

  RETURN jsonb_build_object(
    'success', true, 'http', 200,
    'application_id', _application_id,
    'application_number', v_app.application_number,
    'applicant_id', v_app.applicant_id,
    'license_id', v_license_id,
    'license_number', v_license_number,
    'licensee_id', v_licensee_id,
    'provision', v_provision
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.perform_manual_application_approval(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.perform_manual_application_approval(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.perform_manual_application_approval(uuid, text, uuid) TO service_role;
