CREATE OR REPLACE FUNCTION public.cancel_application(_application_id uuid, _reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_app record;
  v_now timestamptz := now();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','Not authenticated','code','UNAUTHORIZED','http',401);
  END IF;

  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);

  SELECT id, applicant_id, status, application_number
    INTO v_app
    FROM public.applications
   WHERE id = _application_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Application not found','code','NOT_FOUND','http',404);
  END IF;

  IF v_app.applicant_id <> v_uid THEN
    RETURN jsonb_build_object('error','You cannot cancel this application','code','FORBIDDEN','http',403);
  END IF;

  IF v_app.status NOT IN ('draft','in_progress','resubmission_requested','query_raised','submitted') THEN
    RETURN jsonb_build_object('error',format('Cannot cancel application in ''%s'' status', v_app.status),
                              'code','INVALID_STATUS','http',409);
  END IF;

  UPDATE public.applications
     SET status = 'cancelled', cancelled_at = v_now, updated_at = v_now
   WHERE id = _application_id;

  UPDATE public.workflow_instances
     SET status = 'cancelled', completed_at = v_now, updated_at = v_now
   WHERE entity_id = _application_id
     AND entity_type = 'application'
     AND status = 'active';

  INSERT INTO public.approval_actions (
    application_id, actor_id, action, action_type, comments, responded_at
  ) VALUES (
    _application_id, v_uid, 'cancelled', 'cancel',
    COALESCE(NULLIF(trim(_reason),''),'Application cancelled by applicant'), v_now
  );

  PERFORM public.create_audit_log(
    v_uid, 'application_cancelled', 'application', _application_id::text, NULL,
    jsonb_build_object('reason', _reason), NULL
  );

  RETURN jsonb_build_object('success', true, 'http', 200, 'application_id', _application_id);
END;
$function$;