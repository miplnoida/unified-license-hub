-- =====================================================================
-- Post-licence (PLS) workflow routing repair — idempotent.
-- =====================================================================

-- A. Backfill regulator scope on the PLS service workflows only.
UPDATE public.approval_workflows w
   SET regulator_id = sec.regulator_id,
       updated_at = now()
  FROM public.services s
  JOIN public.sub_sectors ss ON ss.id = s.sub_sector_id
  JOIN public.sectors sec ON sec.id = ss.sector_id
 WHERE w.service_id = s.id
   AND w.regulator_id IS NULL
   AND w.entity_type = 'post_application'
   AND w.name LIKE 'PLS - %'
   AND sec.regulator_id IS NOT NULL;

-- B. Correct step roles on PLS workflows only.
WITH pls AS (
  SELECT id FROM public.approval_workflows
   WHERE entity_type = 'post_application' AND name LIKE 'PLS - %'
)
UPDATE public.approval_steps s
   SET approver_role = 'super_admin'::app_role
  FROM pls
 WHERE s.workflow_id = pls.id
   AND s.name = 'Final Approval'
   AND s.approver_role <> 'super_admin'::app_role;

WITH pls AS (
  SELECT id FROM public.approval_workflows
   WHERE entity_type = 'post_application' AND name LIKE 'PLS - %'
)
UPDATE public.approval_steps s
   SET approver_role = 'supervisor'::app_role
  FROM pls
 WHERE s.workflow_id = pls.id
   AND s.name = 'Fit & Proper Assessment'
   AND s.approver_role <> 'supervisor'::app_role;

-- C. Start / terminal flags (convention alignment; the application engine
--    still treats max(step_order) as the decisive final step).
WITH pls AS (
  SELECT id FROM public.approval_workflows
   WHERE entity_type = 'post_application' AND name LIKE 'PLS - %'
), bounds AS (
  SELECT s.workflow_id,
         min(s.step_order) AS first_order,
         max(s.step_order) AS last_order
    FROM public.approval_steps s
    JOIN pls ON pls.id = s.workflow_id
   GROUP BY s.workflow_id
)
UPDATE public.approval_steps s
   SET is_start = (s.step_order = b.first_order),
       is_terminal = (s.step_order = b.last_order)
  FROM bounds b
 WHERE s.workflow_id = b.workflow_id
   AND (s.is_start IS DISTINCT FROM (s.step_order = b.first_order)
        OR s.is_terminal IS DISTINCT FROM (s.step_order = b.last_order));

-- D. Resolver: add service + sub-sector tiers without changing existing
--    behaviour for pre-licence / legacy configs.
CREATE OR REPLACE FUNCTION public._resolve_application_workflow(
  _license_type text,
  _regulator_id uuid,
  _sector_id uuid,
  _category_id uuid,
  _is_post_license boolean,
  _service_id uuid,
  _sub_sector_id uuid
)
RETURNS TABLE(workflow_id uuid, first_step_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_wf_id uuid;
  v_step_id uuid;
  v_eff_reg uuid;
  v_lt text := lower(coalesce(_license_type, ''));
  v_entity_types text[];
  v_is_post boolean := COALESCE(_is_post_license, false);
  v_sub_sector_id uuid := _sub_sector_id;
BEGIN
  v_eff_reg := public._resolve_effective_regulator(_regulator_id, _sector_id, _category_id);

  v_entity_types := CASE WHEN v_is_post
                         THEN ARRAY['post_application','application']
                         ELSE ARRAY['pre_application','application'] END;

  -- Derive sub_sector from category when not passed in.
  IF v_sub_sector_id IS NULL AND _category_id IS NOT NULL THEN
    SELECT sub_sector_id INTO v_sub_sector_id FROM public.categories WHERE id = _category_id;
  END IF;

  -- TAXONOMY-FIRST MATCH (license_type ignored): most specific wins.
  -- service > category > sub_sector > sector > regulator-only.

  IF v_eff_reg IS NOT NULL AND _service_id IS NOT NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type = ANY(v_entity_types) AND aw.is_active = true
       AND aw.regulator_id = v_eff_reg AND aw.service_id = _service_id
     ORDER BY array_position(v_entity_types, aw.entity_type), aw.updated_at DESC
     LIMIT 1;
  END IF;

  IF v_wf_id IS NULL AND v_eff_reg IS NOT NULL AND _category_id IS NOT NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type = ANY(v_entity_types) AND aw.is_active = true
       AND aw.regulator_id = v_eff_reg AND aw.category_id = _category_id
       AND aw.service_id IS NULL
     ORDER BY array_position(v_entity_types, aw.entity_type), aw.updated_at DESC
     LIMIT 1;
  END IF;

  IF v_wf_id IS NULL AND v_eff_reg IS NOT NULL AND v_sub_sector_id IS NOT NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type = ANY(v_entity_types) AND aw.is_active = true
       AND aw.regulator_id = v_eff_reg AND aw.sub_sector_id = v_sub_sector_id
       AND aw.category_id IS NULL AND aw.service_id IS NULL
     ORDER BY array_position(v_entity_types, aw.entity_type), aw.updated_at DESC
     LIMIT 1;
  END IF;

  IF v_wf_id IS NULL AND v_eff_reg IS NOT NULL AND _sector_id IS NOT NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type = ANY(v_entity_types) AND aw.is_active = true
       AND aw.regulator_id = v_eff_reg AND aw.sector_id = _sector_id
       AND aw.sub_sector_id IS NULL AND aw.category_id IS NULL AND aw.service_id IS NULL
     ORDER BY array_position(v_entity_types, aw.entity_type), aw.updated_at DESC
     LIMIT 1;
  END IF;

  IF v_wf_id IS NULL AND v_eff_reg IS NOT NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type = ANY(v_entity_types) AND aw.is_active = true
       AND aw.regulator_id = v_eff_reg
       AND aw.sector_id IS NULL AND aw.sub_sector_id IS NULL
       AND aw.category_id IS NULL AND aw.service_id IS NULL
     ORDER BY array_position(v_entity_types, aw.entity_type), aw.updated_at DESC
     LIMIT 1;
  END IF;

  -- LEGACY license_type prefix match (back-compat for older configs).
  IF v_wf_id IS NULL AND v_eff_reg IS NOT NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type = ANY(v_entity_types) AND aw.is_active = true
       AND aw.regulator_id = v_eff_reg
       AND aw.license_type <> '' AND lower(aw.license_type) <> 'general'
       AND (v_lt = lower(aw.license_type)
            OR v_lt LIKE lower(aw.license_type) || ' %'
            OR v_lt LIKE lower(aw.license_type) || '\_%' ESCAPE '\'
            OR v_lt LIKE lower(aw.license_type) || '-%')
     ORDER BY array_position(v_entity_types, aw.entity_type),
              (aw.category_id IS NULL), (aw.sub_sector_id IS NULL), (aw.sector_id IS NULL),
              length(aw.license_type) DESC
     LIMIT 1;
  END IF;

  IF v_wf_id IS NULL THEN RETURN; END IF;

  SELECT s.id INTO v_step_id FROM public.approval_steps s
   WHERE s.workflow_id = v_wf_id ORDER BY s.step_order ASC LIMIT 1;

  workflow_id := v_wf_id;
  first_step_id := v_step_id;
  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public._resolve_application_workflow(text, uuid, uuid, uuid, boolean, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._resolve_application_workflow(text, uuid, uuid, uuid, boolean, uuid, uuid) TO authenticated, service_role;

-- Existing 5-arg overload now delegates (identical behaviour when no service
-- or sub-sector is known). The original DEFAULT is preserved.
CREATE OR REPLACE FUNCTION public._resolve_application_workflow(
  _license_type text,
  _regulator_id uuid,
  _sector_id uuid,
  _category_id uuid,
  _is_post_license boolean DEFAULT false
)
RETURNS TABLE(workflow_id uuid, first_step_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT r.workflow_id, r.first_step_id
    FROM public._resolve_application_workflow(
           _license_type, _regulator_id, _sector_id, _category_id,
           _is_post_license, NULL::uuid, NULL::uuid) r;
$function$;

-- E. Callers pass service + sub-sector through.
CREATE OR REPLACE FUNCTION public.repair_application_workflow(_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_app record;
  v_sector uuid;
  v_sub_sector uuid;
  v_service uuid;
  v_category uuid;
  v_is_post boolean;
  v_eff_reg uuid;
  v_wf_id uuid;
  v_step_id uuid;
  v_existing record;
  v_new_instance uuid;
BEGIN
  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);

  SELECT id, status, license_type, regulator_id, data, workflow_id, current_step_id
    INTO v_app
    FROM public.applications
   WHERE id = _application_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_app.status NOT IN ('submitted','in_progress','resubmission_requested',
                          'resubmission_required','returned_for_correction',
                          'info_requested','query_raised','in_review',
                          'pending_review','under_review','forwarded','awaiting_approval') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'status_not_eligible', 'status', v_app.status);
  END IF;

  -- already attached?
  SELECT id, workflow_id, current_step_id, status INTO v_existing
    FROM public.workflow_instances
   WHERE entity_id = _application_id
     AND entity_type = 'application'
     AND status IN ('active','paused')
   ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    IF v_app.workflow_id IS NULL OR v_app.current_step_id IS NULL THEN
      UPDATE public.applications
         SET workflow_id = COALESCE(workflow_id, v_existing.workflow_id),
             current_step_id = COALESCE(current_step_id, v_existing.current_step_id),
             updated_at = now()
       WHERE id = _application_id;
    END IF;
    RETURN jsonb_build_object('ok', true, 'instance_id', v_existing.id, 'created', false);
  END IF;

  v_sector := NULLIF(v_app.data->>'sector_id','')::uuid;
  v_sub_sector := NULLIF(v_app.data->>'sub_sector_id','')::uuid;
  v_service := NULLIF(v_app.data->>'service_id','')::uuid;
  v_category := NULLIF(v_app.data->>'category_id','')::uuid;
  v_is_post := v_service IS NOT NULL OR (v_app.data->>'type') = 'post_license';

  v_eff_reg := public._resolve_effective_regulator(v_app.regulator_id, v_sector, v_category);

  SELECT r.workflow_id, r.first_step_id INTO v_wf_id, v_step_id
    FROM public._resolve_application_workflow(
           v_app.license_type, v_eff_reg, v_sector, v_category, v_is_post,
           v_service, v_sub_sector) r;

  IF v_wf_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_matching_workflow');
  END IF;

  INSERT INTO public.workflow_instances (workflow_id, entity_type, entity_id, current_step_id, status)
  VALUES (v_wf_id, 'application', _application_id, v_step_id, 'active')
  RETURNING id INTO v_new_instance;

  UPDATE public.applications
     SET workflow_id = COALESCE(workflow_id, v_wf_id),
         current_step_id = COALESCE(current_step_id, v_step_id),
         regulator_id = COALESCE(v_eff_reg, regulator_id),
         updated_at = now()
   WHERE id = _application_id;

  RETURN jsonb_build_object('ok', true, 'instance_id', v_new_instance, 'workflow_id', v_wf_id, 'created', true);
END;
$function$;

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
  v_sub_sector_id uuid;
  v_service_id uuid;
  v_category_id uuid;
  v_workflow_id uuid;
  v_first_step_id uuid;
  v_existing_instance record;
  v_new_instance_id uuid;
  v_action_label text;
  v_audit_action text;
  v_app_status_target text;
  v_effective_regulator uuid;
  v_is_post_license boolean;
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

  v_is_resub := v_app.status IN (
    'resubmission_requested','resubmission_required',
    'returned_for_correction','info_requested',
    'query_raised'
  );
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
  v_sub_sector_id := NULLIF(v_app.data->>'sub_sector_id','')::uuid;
  v_service_id := NULLIF(v_app.data->>'service_id','')::uuid;
  v_category_id := NULLIF(v_app.data->>'category_id','')::uuid;
  v_is_post_license := v_service_id IS NOT NULL OR (v_app.data->>'type') = 'post_license';

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
             v_app.license_type, v_effective_regulator, v_sector_id, v_category_id,
             v_is_post_license, v_service_id, v_sub_sector_id) r;

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
         current_step_id = v_first_step_id,
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
  v_audit_action := CASE WHEN v_is_resub THEN 'resubmitted' ELSE 'submitted' END;

  INSERT INTO public.audit_logs (
    entity_type, entity_id, action, user_id, new_value, metadata
  ) VALUES (
    'application',
    _application_id::text,
    'application.' || v_audit_action,
    v_uid,
    jsonb_build_object('status', v_app_status_target),
    jsonb_build_object(
      'source', 'submit_application_rpc',
      'application_id', _application_id,
      'application_number', v_app.application_number,
      'workflow_id', v_workflow_id,
      'first_step_id', v_first_step_id,
      'is_resubmission', v_is_resub,
      'previous_status', v_app.status,
      'resumed', v_is_resub
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'application_id', _application_id,
    'application_number', v_app.application_number,
    'status', v_app_status_target,
    'workflow_id', v_workflow_id,
    'first_step_id', v_first_step_id,
    'is_resubmission', v_is_resub,
    'resumed', v_is_resub,
    'workflow_attached', v_workflow_id IS NOT NULL,
    'previous_status', v_app.status
  );
END;
$function$;