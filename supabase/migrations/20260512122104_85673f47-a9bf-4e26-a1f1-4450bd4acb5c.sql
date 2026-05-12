CREATE OR REPLACE FUNCTION public.submit_application(_application_id uuid, _ack_text text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_app record;
  v_now timestamptz := now();
  v_is_resub boolean;
  v_payment_count int;
  v_sector_id uuid;
  v_category_id uuid;
  v_workflow_id uuid;
  v_first_step_id uuid;
  v_existing_instance record;
  v_new_instance_id uuid;
  v_action_label text;
  v_audit_action text;
  v_app_status_target text;
  v_effective_regulator uuid;
BEGIN
  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','Not authenticated','code','UNAUTHORIZED','http',401);
  END IF;

  SELECT id, applicant_id, application_number, status, license_type,
         regulator_id, data
    INTO v_app
    FROM public.applications
   WHERE id = _application_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Application not found','code','NOT_FOUND','http',404);
  END IF;

  IF v_app.applicant_id <> v_uid THEN
    RETURN jsonb_build_object('error','You do not own this application','code','FORBIDDEN','http',403);
  END IF;

  v_is_resub := v_app.status IN ('resubmission_requested','query_raised');
  IF v_app.status NOT IN ('draft', 'in_progress') AND NOT v_is_resub THEN
    RETURN jsonb_build_object(
      'error', format('Application is in ''%s'' status — cannot submit', v_app.status),
      'code','INVALID_STATUS','http',409
    );
  END IF;

  SELECT count(*) INTO v_payment_count
    FROM public.payments
   WHERE application_id = _application_id
     AND status IN ('completed','success','paid');
  IF v_payment_count = 0 THEN
    RETURN jsonb_build_object(
      'error','No completed payment found — please complete payment first',
      'code','PAYMENT_REQUIRED','http',402
    );
  END IF;

  v_sector_id := NULLIF(v_app.data->>'sector_id','')::uuid;
  v_category_id := NULLIF(v_app.data->>'category_id','')::uuid;

  v_effective_regulator := public._resolve_effective_regulator(
    v_app.regulator_id, v_sector_id, v_category_id
  );

  SELECT id, workflow_id, current_step_id, status
    INTO v_existing_instance
    FROM public.workflow_instances
   WHERE entity_id = _application_id
     AND entity_type = 'application'
     AND status IN ('active','paused')
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    v_workflow_id := v_existing_instance.workflow_id;
    v_first_step_id := v_existing_instance.current_step_id;
    IF v_existing_instance.status = 'paused' THEN
      UPDATE public.workflow_instances
         SET status = 'active', updated_at = v_now
       WHERE id = v_existing_instance.id;
    END IF;
  ELSE
    SELECT r.workflow_id, r.first_step_id INTO v_workflow_id, v_first_step_id
      FROM public._resolve_application_workflow(
             v_app.license_type, v_effective_regulator, v_sector_id, v_category_id) r;

    IF v_workflow_id IS NOT NULL THEN
      INSERT INTO public.workflow_instances (
        workflow_id, entity_type, entity_id, current_step_id, status
      ) VALUES (
        v_workflow_id, 'application', _application_id, v_first_step_id, 'active'
      )
      RETURNING id INTO v_new_instance_id;
    END IF;
  END IF;

  v_app_status_target := 'submitted';

  UPDATE public.applications
     SET status = v_app_status_target,
         submitted_at = COALESCE(submitted_at, v_now),
         workflow_id = COALESCE(workflow_id, v_workflow_id),
         current_step_id = COALESCE(current_step_id, v_first_step_id),
         regulator_id = COALESCE(v_effective_regulator, regulator_id),
         ack_by = CASE WHEN _ack_text IS NOT NULL THEN v_uid ELSE ack_by END,
         ack_at = CASE WHEN _ack_text IS NOT NULL THEN v_now ELSE ack_at END,
         ack_text = CASE WHEN _ack_text IS NOT NULL
                         THEN substring(_ack_text from 1 for 4000)
                         ELSE ack_text END,
         updated_at = v_now
   WHERE id = _application_id;

  UPDATE public.form_responses
     SET status = 'submitted', submitted_at = v_now
   WHERE entity_id = _application_id
     AND entity_type = 'application';

  v_action_label := CASE WHEN v_is_resub THEN 'resubmitted' ELSE 'submitted' END;
  v_audit_action := CASE WHEN v_is_resub THEN 'application_resubmitted' ELSE 'application_submitted' END;

  INSERT INTO public.approval_actions (
    application_id, actor_id, action, action_type, comments, responded_at
  ) VALUES (
    _application_id, v_uid, v_action_label, v_action_label, NULL, v_now
  );

  PERFORM public.create_audit_log(
    v_uid, v_audit_action, 'application', _application_id::text, NULL,
    jsonb_build_object(
      'status', v_app_status_target,
      'workflow_attached', v_workflow_id IS NOT NULL,
      'resumed', v_existing_instance IS NOT NULL,
      'resubmission', v_is_resub,
      'effective_regulator_id', v_effective_regulator
    ),
    NULL
  );

  PERFORM public.create_notification(
    v_uid,
    CASE WHEN v_is_resub
         THEN 'Application Resubmitted: ' || v_app.application_number
         ELSE 'Application Submitted: ' || v_app.application_number END,
    CASE WHEN v_is_resub
         THEN 'Your application has been resubmitted and is back under review.'
         ELSE 'Your application has been submitted and is now under review.' END,
    'success', 'application', _application_id::text
  );

  RETURN jsonb_build_object(
    'success', true,
    'http', 200,
    'application_id', _application_id,
    'status', v_app_status_target,
    'workflow_attached', v_workflow_id IS NOT NULL,
    'workflow_id', v_workflow_id,
    'resumed', v_existing_instance IS NOT NULL,
    'resubmission', v_is_resub,
    'effective_regulator_id', v_effective_regulator,
    'message', CASE
      WHEN v_is_resub AND v_workflow_id IS NOT NULL THEN 'Application resubmitted and workflow resumed'
      WHEN v_is_resub THEN 'Application resubmitted successfully'
      WHEN v_workflow_id IS NOT NULL THEN 'Application submitted and routed to approval workflow'
      ELSE 'Application submitted successfully'
    END
  );
END;
$function$;

DO $$
DECLARE
  rec record;
BEGIN
  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);

  FOR rec IN
    SELECT a.id
      FROM public.applications a
     WHERE a.status = 'draft'
       AND lower(coalesce(a.status, '')) NOT IN ('submitted','approved','rejected','cancelled','withdrawn')
       AND (
         EXISTS (
           SELECT 1
             FROM public.form_responses fr
            WHERE fr.entity_id = a.id
              AND fr.entity_type = 'application'
              AND fr.response_data IS NOT NULL
              AND jsonb_typeof(fr.response_data) = 'object'
              AND fr.response_data <> '{}'::jsonb
         )
         OR EXISTS (
           SELECT 1
             FROM jsonb_each(coalesce(a.data->'forms_data', '{}'::jsonb)) kv
            WHERE jsonb_typeof(kv.value) = 'object'
              AND kv.value <> '{}'::jsonb
         )
       )
     ORDER BY a.updated_at DESC NULLS LAST, a.created_at DESC
  LOOP
    BEGIN
      UPDATE public.applications
         SET status = 'in_progress', updated_at = now()
       WHERE id = rec.id
         AND status = 'draft';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipping % : %', rec.id, SQLERRM;
    END;
  END LOOP;
END $$;