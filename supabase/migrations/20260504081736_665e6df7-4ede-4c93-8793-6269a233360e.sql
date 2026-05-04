
-- ============================================================================
-- 1. Schema additions
-- ============================================================================
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- Prevent more than one active workflow instance per entity
CREATE UNIQUE INDEX IF NOT EXISTS uq_workflow_instances_active_entity
  ON public.workflow_instances (entity_type, entity_id)
  WHERE status = 'active';

-- ============================================================================
-- 2. Server-controlled audit/notification helpers
-- ============================================================================

-- Drop broad authenticated insert policies — only service-role / SECURITY
-- DEFINER functions may insert from now on.
DROP POLICY IF EXISTS "Users can insert own audit rows" ON public.audit_logs;
DROP POLICY IF EXISTS "Users insert own notifications" ON public.notifications;

-- Helper: server-only audit writer.
CREATE OR REPLACE FUNCTION public.create_audit_log(
  _user_id uuid,
  _action text,
  _entity_type text,
  _entity_id text DEFAULT NULL,
  _old_value jsonb DEFAULT NULL,
  _new_value jsonb DEFAULT NULL,
  _metadata jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, metadata)
  VALUES (_user_id, _action, _entity_type, _entity_id, _old_value, _new_value, _metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_audit_log(uuid,text,text,text,jsonb,jsonb,jsonb) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.create_audit_log(uuid,text,text,text,jsonb,jsonb,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.create_notification(
  _user_id uuid,
  _title text,
  _message text,
  _type text DEFAULT 'info',
  _entity_type text DEFAULT NULL,
  _entity_id text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.notifications (user_id, title, message, type, entity_type, entity_id)
  VALUES (_user_id, _title, _message, _type, _entity_type, _entity_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_notification(uuid,text,text,text,text,text) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.create_notification(uuid,text,text,text,text,text) TO service_role;

-- ============================================================================
-- 3. Storage: documents bucket — per-user upload restriction
-- ============================================================================
DROP POLICY IF EXISTS "Documents bucket: authenticated upload" ON storage.objects;

CREATE POLICY "Documents bucket: per-user upload"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND (
    -- user uploads under their own first-folder = uid()
    (storage.foldername(name))[1] = (auth.uid())::text
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
    OR public.has_role(auth.uid(), 'licensing_officer'::app_role)
  )
);

-- ============================================================================
-- 4. Signup role hardening — only safe self-registration roles
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  requested_role text;
  bootstrap_email text;
  resolved_role app_role;
  is_bootstrap boolean := false;
BEGIN
  requested_role := COALESCE(NEW.raw_user_meta_data->>'role', 'applicant');

  IF requested_role = 'pre_licensee' THEN
    INSERT INTO public.pre_license_users (id, full_name, email, entity_name)
    VALUES (NEW.id,
            COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
            COALESCE(NEW.email, ''),
            COALESCE(NEW.raw_user_meta_data->>'entity_name', ''));
  ELSE
    INSERT INTO public.profiles (id, full_name, email, user_type, entity_name, role)
    VALUES (NEW.id,
            COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
            COALESCE(NEW.email, ''),
            COALESCE((NEW.raw_user_meta_data->>'user_type')::public.user_type, 'primary'),
            COALESCE(NEW.raw_user_meta_data->>'entity_name', ''),
            CASE WHEN requested_role IN ('applicant','pre_licensee') THEN requested_role ELSE 'applicant' END);
  END IF;

  -- Env-gated bootstrap super-admin
  SELECT trim(both '"' from value::text)
    INTO bootstrap_email
    FROM public.site_settings
   WHERE key = 'super_admin_bootstrap_email'
   LIMIT 1;

  IF bootstrap_email IS NOT NULL
     AND length(bootstrap_email) > 0
     AND lower(bootstrap_email) = lower(COALESCE(NEW.email, '')) THEN
    resolved_role := 'super_admin'::app_role;
    is_bootstrap := true;
  ELSE
    -- Self-registration may ONLY assign safe public roles.
    -- Anything else (admin, supervisor, licensing_officer, analyst, etc.)
    -- is silently downgraded to 'applicant'.
    IF requested_role IN ('applicant', 'pre_licensee') THEN
      BEGIN
        resolved_role := requested_role::app_role;
      EXCEPTION WHEN OTHERS THEN
        resolved_role := 'applicant'::app_role;
      END;
    ELSE
      resolved_role := 'applicant'::app_role;
    END IF;
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, resolved_role);

  IF is_bootstrap THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value)
    VALUES (NEW.id, 'bootstrap_super_admin_assigned', 'user', NEW.id::text,
            jsonb_build_object('email', NEW.email));
  END IF;

  RETURN NEW;
END;
$function$;

-- ============================================================================
-- 5. Block direct mutation of workflow-controlled application columns
-- ============================================================================
CREATE OR REPLACE FUNCTION public.prevent_direct_application_workflow_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trusted text;
BEGIN
  -- Trusted RPCs set this GUC for the duration of their transaction.
  v_trusted := current_setting('app.workflow_mutation_context', true);
  IF v_trusted = 'trusted' THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.current_step_id IS DISTINCT FROM OLD.current_step_id
     OR NEW.workflow_id IS DISTINCT FROM OLD.workflow_id
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.rejected_at IS DISTINCT FROM OLD.rejected_at
     OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
     OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
  THEN
    RAISE EXCEPTION 'WORKFLOW_FIELD_LOCKED: applications.% can only be changed via approved RPCs',
      CASE
        WHEN NEW.status IS DISTINCT FROM OLD.status THEN 'status'
        WHEN NEW.current_step_id IS DISTINCT FROM OLD.current_step_id THEN 'current_step_id'
        WHEN NEW.workflow_id IS DISTINCT FROM OLD.workflow_id THEN 'workflow_id'
        WHEN NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN 'approved_at'
        WHEN NEW.rejected_at IS DISTINCT FROM OLD.rejected_at THEN 'rejected_at'
        WHEN NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN 'submitted_at'
        ELSE 'cancelled_at'
      END
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_direct_application_workflow_mutation ON public.applications;
CREATE TRIGGER trg_prevent_direct_application_workflow_mutation
  BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.prevent_direct_application_workflow_mutation();

-- Mark existing workflow-controlling functions as trusted by setting the GUC
-- inside their bodies. Update perform_workflow_transition to set the flag.
CREATE OR REPLACE FUNCTION public.perform_workflow_transition(_application_id uuid, _instance_id uuid, _step_id uuid, _action_type text, _comments text, _actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_app record;
  v_instance record;
  v_step record;
  v_steps_total int;
  v_current_idx int;
  v_next_step record;
  v_prev_step record;
  v_is_last boolean;
  v_is_first boolean;
  v_actor_roles text[];
  v_is_super boolean;
  v_allowed_actions text[];
  v_new_step_id uuid;
  v_new_app_status text;
  v_new_instance_status text;
  v_now timestamptz := now();
BEGIN
  -- Mark this transaction as a trusted workflow mutation context.
  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);

  IF _actor_id IS NULL THEN
    RETURN jsonb_build_object('error','UNAUTHORIZED','code','UNAUTHORIZED','http',401);
  END IF;
  IF _action_type NOT IN ('approve','reject','send_back','escalate','request_resubmission') THEN
    RETURN jsonb_build_object('error','Invalid action_type','code','BAD_REQUEST','http',400);
  END IF;
  IF _action_type IN ('approve','reject','request_resubmission')
     AND (_comments IS NULL OR length(trim(_comments)) = 0) THEN
    RETURN jsonb_build_object('error','Remarks are mandatory for this action','code','REMARKS_REQUIRED','http',422);
  END IF;

  SELECT array_agg(DISTINCT r) INTO v_actor_roles FROM (
    SELECT role::text AS r FROM public.user_roles WHERE user_id = _actor_id
    UNION
    SELECT system_role AS r
      FROM public.user_dynamic_roles udr
      JOIN public.roles ro ON ro.id = udr.role_id
     WHERE udr.user_id = _actor_id AND ro.system_role IS NOT NULL
  ) sub;
  v_actor_roles := COALESCE(v_actor_roles, ARRAY[]::text[]);
  v_is_super := 'super_admin' = ANY(v_actor_roles);

  IF NOT (v_is_super
          OR 'admin' = ANY(v_actor_roles)
          OR 'supervisor' = ANY(v_actor_roles)
          OR 'licensing_officer' = ANY(v_actor_roles)
          OR 'analyst' = ANY(v_actor_roles)) THEN
    RETURN jsonb_build_object('error','You do not have permission to act on workflows','code','FORBIDDEN','http',403);
  END IF;

  SELECT id, applicant_id, status, application_number, workflow_id
    INTO v_app
    FROM public.applications
   WHERE id = _application_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Application not found','code','NOT_FOUND','http',404);
  END IF;

  IF v_app.status NOT IN ('submitted','in_progress') THEN
    RETURN jsonb_build_object('error',format('Cannot act on application in ''%s'' status', v_app.status),
                              'code','INVALID_STATUS','http',409);
  END IF;

  SELECT id, workflow_id, current_step_id, status
    INTO v_instance
    FROM public.workflow_instances
   WHERE entity_id = _application_id
     AND entity_type = 'application'
     AND status = 'active'
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','No active workflow instance for this application','code','NO_ACTIVE_INSTANCE','http',409);
  END IF;

  IF _instance_id IS NOT NULL AND _instance_id <> v_instance.id THEN
    RETURN jsonb_build_object('error','Stale workflow instance — please refresh','code','STALE_INSTANCE','http',409);
  END IF;
  IF v_instance.current_step_id IS NULL THEN
    RETURN jsonb_build_object('error','Workflow has no current step','code','NO_CURRENT_STEP','http',409);
  END IF;
  IF _step_id IS NOT NULL AND _step_id <> v_instance.current_step_id THEN
    RETURN jsonb_build_object('error','Stale step — page is out of date, please refresh','code','STALE_STEP','http',409);
  END IF;

  SELECT id, step_order, name, approver_role, allowed_actions
    INTO v_step
    FROM public.approval_steps
   WHERE id = v_instance.current_step_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Current step not found','code','STEP_NOT_FOUND','http',409);
  END IF;

  SELECT count(*),
         (SELECT count(*) FROM public.approval_steps s2
          WHERE s2.workflow_id = v_instance.workflow_id AND s2.step_order < v_step.step_order)
    INTO v_steps_total, v_current_idx
    FROM public.approval_steps
   WHERE workflow_id = v_instance.workflow_id;

  v_is_first := (v_current_idx = 0);
  v_is_last  := (v_current_idx = v_steps_total - 1);

  IF NOT v_is_super AND NOT (v_step.approver_role::text = ANY(v_actor_roles)) THEN
    RETURN jsonb_build_object('error',format('Only %s can act on this step', v_step.approver_role),
                              'code','WRONG_APPROVER','http',403);
  END IF;

  v_allowed_actions := ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_step.allowed_actions, '[]'::jsonb)));
  IF NOT (_action_type = ANY(v_allowed_actions)) THEN
    RETURN jsonb_build_object('error',format('Action ''%s'' is not allowed on this step', _action_type),
                              'code','ACTION_NOT_ALLOWED','http',422);
  END IF;
  IF _action_type = 'send_back' AND v_is_first THEN
    RETURN jsonb_build_object('error','Cannot send back from the first step','code','CANNOT_SEND_BACK','http',422);
  END IF;
  IF _action_type = 'escalate' AND v_is_last THEN
    RETURN jsonb_build_object('error','Cannot escalate from the last step','code','CANNOT_ESCALATE','http',422);
  END IF;

  -- Final approval is delegated to perform_final_workflow_approval.
  IF _action_type = 'approve' AND v_is_last THEN
    RETURN jsonb_build_object('final_approval', true, 'http', 200);
  END IF;

  v_new_step_id := v_step.id;
  v_new_app_status := NULL;
  v_new_instance_status := NULL;

  IF _action_type IN ('approve','escalate') THEN
    SELECT id INTO v_next_step FROM public.approval_steps
     WHERE workflow_id = v_instance.workflow_id AND step_order > v_step.step_order
     ORDER BY step_order ASC LIMIT 1;
    IF FOUND THEN
      v_new_step_id := v_next_step.id;
      v_new_app_status := 'in_progress';
      UPDATE public.workflow_instances SET current_step_id = v_next_step.id, updated_at = v_now WHERE id = v_instance.id;
    END IF;
  ELSIF _action_type = 'send_back' THEN
    SELECT id INTO v_prev_step FROM public.approval_steps
     WHERE workflow_id = v_instance.workflow_id AND step_order < v_step.step_order
     ORDER BY step_order DESC LIMIT 1;
    IF FOUND THEN
      v_new_step_id := v_prev_step.id;
      v_new_app_status := 'in_progress';
      UPDATE public.workflow_instances SET current_step_id = v_prev_step.id, updated_at = v_now WHERE id = v_instance.id;
    END IF;
  ELSIF _action_type = 'reject' THEN
    v_new_app_status := 'rejected';
    v_new_instance_status := 'rejected';
    UPDATE public.workflow_instances
       SET status = 'rejected', completed_at = v_now, updated_at = v_now
     WHERE id = v_instance.id;
  ELSIF _action_type = 'request_resubmission' THEN
    v_new_app_status := 'resubmission_requested';
    v_new_instance_status := 'paused';
    UPDATE public.workflow_instances
       SET status = 'paused', updated_at = v_now
     WHERE id = v_instance.id;
  END IF;

  INSERT INTO public.approval_actions (
    application_id, step_id, workflow_instance_id, actor_id,
    action, action_type, comments, responded_at
  ) VALUES (
    _application_id, v_step.id, v_instance.id, _actor_id,
    _action_type, _action_type, NULLIF(trim(_comments),''), v_now
  );

  UPDATE public.applications
     SET current_step_id = v_new_step_id,
         status = COALESCE(v_new_app_status, status),
         rejected_at = CASE WHEN v_new_app_status = 'rejected' THEN v_now ELSE rejected_at END,
         updated_at = v_now
   WHERE id = _application_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value)
  VALUES (
    _actor_id,
    'workflow_' || _action_type,
    'workflow_instance',
    v_instance.id::text,
    jsonb_build_object(
      'application_id', _application_id,
      'step_id', v_step.id,
      'next_step_id', v_new_step_id,
      'instance_status', COALESCE(v_new_instance_status,'active')
    )
  );

  IF _action_type IN ('reject','request_resubmission') THEN
    INSERT INTO public.notifications (user_id, title, message, type, entity_type, entity_id)
    VALUES (
      v_app.applicant_id,
      CASE WHEN _action_type='reject'
           THEN 'Application Rejected: ' || v_app.application_number
           ELSE 'Resubmission Requested: ' || v_app.application_number END,
      COALESCE(_comments,
               CASE WHEN _action_type='reject'
                    THEN 'Your application was rejected.'
                    ELSE 'Please review and resubmit.' END),
      CASE WHEN _action_type='reject' THEN 'error' ELSE 'warning' END,
      'application',
      _application_id::text
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'http', 200,
    'action', _action_type,
    'new_step_id', v_new_step_id,
    'application_status', COALESCE(v_new_app_status, v_app.status),
    'instance_status', COALESCE(v_new_instance_status,'active')
  );
END;
$function$;

-- Lock down execute permissions: only service_role may call.
REVOKE ALL ON FUNCTION public.perform_workflow_transition(uuid,uuid,uuid,text,text,uuid) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.perform_workflow_transition(uuid,uuid,uuid,text,text,uuid) TO service_role;

COMMENT ON FUNCTION public.perform_workflow_transition(uuid,uuid,uuid,text,text,uuid) IS
'Atomic workflow step transition. _actor_id is trusted because this RPC may only be invoked by service_role from edge functions that have already validated the caller''s JWT.';

-- ============================================================================
-- 6. perform_final_workflow_approval — atomic final approval RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION public.perform_final_workflow_approval(
  _application_id uuid,
  _instance_id uuid,
  _step_id uuid,
  _comments text,
  _actor_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app record;
  v_instance record;
  v_step record;
  v_steps_total int;
  v_current_idx int;
  v_actor_roles text[];
  v_is_super boolean;
  v_allowed_actions text[];
  v_now timestamptz := now();
  v_app_data jsonb;
  v_license record;
  v_licensee_id uuid;
  v_existing_license_id uuid;
  v_entity_name text;
BEGIN
  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);

  IF _actor_id IS NULL THEN
    RETURN jsonb_build_object('error','UNAUTHORIZED','code','UNAUTHORIZED','http',401);
  END IF;

  IF _comments IS NULL OR length(trim(_comments)) = 0 THEN
    RETURN jsonb_build_object('error','Remarks are mandatory for approval','code','REMARKS_REQUIRED','http',422);
  END IF;

  SELECT array_agg(DISTINCT r) INTO v_actor_roles FROM (
    SELECT role::text AS r FROM public.user_roles WHERE user_id = _actor_id
    UNION
    SELECT system_role AS r FROM public.user_dynamic_roles udr
      JOIN public.roles ro ON ro.id = udr.role_id
     WHERE udr.user_id = _actor_id AND ro.system_role IS NOT NULL
  ) sub;
  v_actor_roles := COALESCE(v_actor_roles, ARRAY[]::text[]);
  v_is_super := 'super_admin' = ANY(v_actor_roles);

  -- Lock application
  SELECT id, applicant_id, application_number, status, license_type,
         regulator_id, workflow_id, data, approved_at
    INTO v_app
    FROM public.applications
   WHERE id = _application_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Application not found','code','NOT_FOUND','http',404);
  END IF;

  -- Idempotency: already approved → return existing license/licensee.
  IF v_app.status = 'approved' THEN
    SELECT id, license_number INTO v_license
      FROM public.licenses WHERE application_id = _application_id LIMIT 1;
    SELECT id INTO v_licensee_id
      FROM public.licensees WHERE license_id = v_license.id LIMIT 1;
    RETURN jsonb_build_object(
      'success', true,
      'http', 200,
      'already_processed', true,
      'application_id', _application_id,
      'license_id', v_license.id,
      'license_number', v_license.license_number,
      'licensee_id', v_licensee_id,
      'applicant_id', v_app.applicant_id
    );
  END IF;

  IF v_app.status NOT IN ('submitted','in_progress') THEN
    RETURN jsonb_build_object('error',format('Cannot approve application in ''%s'' status', v_app.status),
                              'code','INVALID_STATUS','http',409);
  END IF;

  -- Lock active workflow instance
  SELECT id, workflow_id, current_step_id, status
    INTO v_instance
    FROM public.workflow_instances
   WHERE entity_id = _application_id
     AND entity_type = 'application'
     AND status = 'active'
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','No active workflow instance','code','NO_ACTIVE_INSTANCE','http',409);
  END IF;
  IF _instance_id IS NOT NULL AND _instance_id <> v_instance.id THEN
    RETURN jsonb_build_object('error','Stale workflow instance','code','STALE_INSTANCE','http',409);
  END IF;
  IF _step_id IS NOT NULL AND _step_id <> v_instance.current_step_id THEN
    RETURN jsonb_build_object('error','Stale step','code','STALE_STEP','http',409);
  END IF;

  SELECT id, step_order, approver_role, allowed_actions
    INTO v_step FROM public.approval_steps WHERE id = v_instance.current_step_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Current step not found','code','STEP_NOT_FOUND','http',409);
  END IF;

  -- Verify last step
  SELECT count(*),
         (SELECT count(*) FROM public.approval_steps s2
          WHERE s2.workflow_id = v_instance.workflow_id AND s2.step_order < v_step.step_order)
    INTO v_steps_total, v_current_idx
    FROM public.approval_steps WHERE workflow_id = v_instance.workflow_id;

  IF v_current_idx <> v_steps_total - 1 THEN
    RETURN jsonb_build_object('error','Final approval requires last workflow step','code','NOT_LAST_STEP','http',422);
  END IF;

  -- Approver role check
  IF NOT v_is_super AND NOT (v_step.approver_role::text = ANY(v_actor_roles)) THEN
    RETURN jsonb_build_object('error',format('Only %s can act on this step', v_step.approver_role),
                              'code','WRONG_APPROVER','http',403);
  END IF;

  -- allowed_actions must include 'approve'
  v_allowed_actions := ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_step.allowed_actions, '[]'::jsonb)));
  IF NOT ('approve' = ANY(v_allowed_actions)) THEN
    RETURN jsonb_build_object('error','Approve is not allowed on this step','code','ACTION_NOT_ALLOWED','http',422);
  END IF;

  v_app_data := COALESCE(v_app.data, '{}'::jsonb);

  -- Update application → approved
  UPDATE public.applications
     SET status = 'approved', approved_at = v_now, updated_at = v_now
   WHERE id = _application_id;

  -- Complete workflow instance
  UPDATE public.workflow_instances
     SET status = 'completed', completed_at = v_now, updated_at = v_now
   WHERE id = v_instance.id;

  -- Idempotent license creation (uq_licenses_application_id)
  INSERT INTO public.licenses (
    application_id, holder_id, license_type, regulator_id,
    sector_id, sub_sector_id, category_id
  ) VALUES (
    _application_id, v_app.applicant_id, v_app.license_type, v_app.regulator_id,
    NULLIF(v_app_data->>'sector_id','')::uuid,
    NULLIF(v_app_data->>'sub_sector_id','')::uuid,
    NULLIF(v_app_data->>'category_id','')::uuid
  )
  ON CONFLICT (application_id) WHERE application_id IS NOT NULL DO NOTHING
  RETURNING id, license_number INTO v_license;

  -- If conflict swallowed the insert, fetch the existing row
  IF v_license.id IS NULL THEN
    SELECT id, license_number INTO v_license
      FROM public.licenses WHERE application_id = _application_id LIMIT 1;
  END IF;

  -- Idempotent licensee creation
  v_entity_name := COALESCE(
    NULLIF(v_app_data->>'entity_name',''),
    NULLIF(v_app_data->>'applicant_name',''),
    v_app.license_type
  );

  INSERT INTO public.licensees (
    name, license_id, sector_id, sub_sector_id, category_id, status
  ) VALUES (
    v_entity_name, v_license.id,
    NULLIF(v_app_data->>'sector_id','')::uuid,
    NULLIF(v_app_data->>'sub_sector_id','')::uuid,
    NULLIF(v_app_data->>'category_id','')::uuid,
    'active'
  )
  ON CONFLICT (license_id) WHERE license_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_licensee_id;

  IF v_licensee_id IS NULL THEN
    SELECT id INTO v_licensee_id FROM public.licensees WHERE license_id = v_license.id LIMIT 1;
  END IF;

  -- Approval action
  INSERT INTO public.approval_actions (
    application_id, step_id, workflow_instance_id, actor_id,
    action, action_type, comments, responded_at
  ) VALUES (
    _application_id, v_step.id, v_instance.id, _actor_id,
    'approve', 'approve', NULLIF(trim(_comments),''), v_now
  );

  -- Audit
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value)
  VALUES (
    _actor_id, 'application_final_approved', 'application', _application_id::text,
    jsonb_build_object(
      'license_id', v_license.id,
      'license_number', v_license.license_number,
      'licensee_id', v_licensee_id
    )
  );

  -- Applicant notification
  INSERT INTO public.notifications (user_id, title, message, type, entity_type, entity_id)
  VALUES (
    v_app.applicant_id,
    'Application Approved: ' || v_app.application_number,
    'Your application has been approved. License Number: ' || v_license.license_number,
    'success', 'application', _application_id::text
  );

  RETURN jsonb_build_object(
    'success', true,
    'http', 200,
    'application_id', _application_id,
    'license_id', v_license.id,
    'license_number', v_license.license_number,
    'licensee_id', v_licensee_id,
    'applicant_id', v_app.applicant_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.perform_final_workflow_approval(uuid,uuid,uuid,text,uuid) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.perform_final_workflow_approval(uuid,uuid,uuid,text,uuid) TO service_role;

COMMENT ON FUNCTION public.perform_final_workflow_approval(uuid,uuid,uuid,text,uuid) IS
'Atomic final approval. Locks app + workflow instance; idempotently creates license & licensee; writes action, audit, notification. Service-role only.';

-- ============================================================================
-- 7. cancel_application — applicant cancellation RPC (auth.uid()-based)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.cancel_application(
  _application_id uuid,
  _reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  IF v_app.status NOT IN ('draft','resubmission_requested','query_raised','submitted') THEN
    RETURN jsonb_build_object('error',format('Cannot cancel application in ''%s'' status', v_app.status),
                              'code','INVALID_STATUS','http',409);
  END IF;

  UPDATE public.applications
     SET status = 'cancelled', cancelled_at = v_now, updated_at = v_now
   WHERE id = _application_id;

  -- Pause/close any active workflow instance
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

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value)
  VALUES (v_uid, 'application_cancelled', 'application', _application_id::text,
          jsonb_build_object('reason', _reason));

  RETURN jsonb_build_object('success', true, 'http', 200, 'application_id', _application_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_application(uuid,text) TO authenticated;

COMMENT ON FUNCTION public.cancel_application(uuid,text) IS
'Applicant-callable cancellation. Uses auth.uid(); validates ownership and safe status; pauses workflow; writes action and audit row.';
