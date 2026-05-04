
-- =====================================================================
-- P0: Storage bucket lockdown for 'documents'
-- =====================================================================

-- Helper: can the current user access a stored object based on the
-- documents/file_uploads metadata row that points to the same file_path?
CREATE OR REPLACE FUNCTION public.user_can_access_document_object(_object_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  rec record;
BEGIN
  IF uid IS NULL THEN
    RETURN false;
  END IF;

  -- Internal review/admin roles always allowed
  IF public.has_role(uid, 'super_admin'::app_role)
     OR public.has_role(uid, 'admin'::app_role)
     OR public.has_role(uid, 'supervisor'::app_role)
     OR public.has_role(uid, 'licensing_officer'::app_role)
     OR public.has_role(uid, 'analyst'::app_role) THEN
    RETURN true;
  END IF;

  -- Lookup metadata row in documents (legacy) or file_uploads (secure path)
  SELECT uploaded_by, entity_type, entity_id::text AS entity_id
    INTO rec
    FROM public.documents
   WHERE file_path = _object_name
   LIMIT 1;

  IF NOT FOUND THEN
    SELECT uploaded_by, entity_type, entity_id::text AS entity_id
      INTO rec
      FROM public.file_uploads
     WHERE file_path = _object_name
     LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    -- No metadata row → deny by default
    RETURN false;
  END IF;

  IF rec.uploaded_by = uid THEN
    RETURN true;
  END IF;

  -- If the file is attached to an application, allow the applicant
  IF rec.entity_type = 'application' AND rec.entity_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.applications
      WHERE id::text = rec.entity_id AND applicant_id = uid
    );
  END IF;

  RETURN false;
END;
$$;

-- Replace the broad "Auth users read docs" policy with an entity-aware one.
DROP POLICY IF EXISTS "Auth users read docs" ON storage.objects;
DROP POLICY IF EXISTS "Auth users upload docs" ON storage.objects;

CREATE POLICY "Documents bucket: entity-aware read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'documents'
  AND public.user_can_access_document_object(name)
);

CREATE POLICY "Documents bucket: authenticated upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Documents bucket: owner or admin delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'documents'
  AND (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.documents
      WHERE file_path = storage.objects.name AND uploaded_by = auth.uid()
    )
  )
);

-- =====================================================================
-- P0: user_roles — only super_admin may modify
-- =====================================================================

DROP POLICY IF EXISTS "Super admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Super admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Super admins can delete roles" ON public.user_roles;

CREATE POLICY "Only super_admin can insert roles"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Only super_admin can update roles"
ON public.user_roles FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Only super_admin can delete roles"
ON public.user_roles FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- =====================================================================
-- P0: handle_new_user — remove first-user auto super_admin, env-gated bootstrap
-- =====================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role text;
  bootstrap_email text;
  resolved_role app_role;
BEGIN
  user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'applicant');

  IF user_role = 'pre_licensee' THEN
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
            user_role);
  END IF;

  -- Env-gated bootstrap: only the email configured in site_settings
  -- gets super_admin on signup. There is no automatic first-user promotion.
  SELECT trim(both '"' from value::text)
    INTO bootstrap_email
    FROM public.site_settings
   WHERE key = 'super_admin_bootstrap_email'
   LIMIT 1;

  IF bootstrap_email IS NOT NULL
     AND length(bootstrap_email) > 0
     AND lower(bootstrap_email) = lower(COALESCE(NEW.email, '')) THEN
    resolved_role := 'super_admin'::app_role;
  ELSE
    -- Use the requested role from metadata, falling back to applicant.
    BEGIN
      resolved_role := COALESCE(NULLIF(user_role, '')::app_role, 'applicant'::app_role);
    EXCEPTION WHEN OTHERS THEN
      resolved_role := 'applicant'::app_role;
    END;
    -- Never grant super_admin via metadata
    IF resolved_role = 'super_admin'::app_role THEN
      resolved_role := 'applicant'::app_role;
    END IF;
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, resolved_role);
  RETURN NEW;
END;
$$;

-- =====================================================================
-- P0: Tighten broad RLS policies
-- =====================================================================

-- applications: ensure UPDATE WITH CHECK mirrors USING (no status escalation)
DROP POLICY IF EXISTS "Update apps" ON public.applications;
CREATE POLICY "Update apps"
ON public.applications FOR UPDATE TO authenticated
USING (
  ( (auth.uid() = applicant_id)
    AND (status = ANY (ARRAY['draft','resubmission_requested','query_raised'])) )
  OR public.has_role(auth.uid(),'super_admin'::app_role)
  OR public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'supervisor'::app_role)
  OR public.has_role(auth.uid(),'licensing_officer'::app_role)
)
WITH CHECK (
  ( (auth.uid() = applicant_id)
    AND (status = ANY (ARRAY['draft','resubmission_requested','query_raised'])) )
  OR public.has_role(auth.uid(),'super_admin'::app_role)
  OR public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'supervisor'::app_role)
  OR public.has_role(auth.uid(),'licensing_officer'::app_role)
);

-- audit_logs: only insert rows about the acting user; service role bypasses RLS.
DROP POLICY IF EXISTS "Authenticated can insert audit logs" ON public.audit_logs;
CREATE POLICY "Users can insert own audit rows"
ON public.audit_logs FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

-- notifications: only allow inserting notifications addressed to oneself.
DROP POLICY IF EXISTS "Insert notifications" ON public.notifications;
CREATE POLICY "Users insert own notifications"
ON public.notifications FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

-- approval_workflows / approval_steps / delegation_rules: limit SELECT to internal staff.
DROP POLICY IF EXISTS "Auth users read workflows" ON public.approval_workflows;
CREATE POLICY "Internal users read workflows"
ON public.approval_workflows FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'super_admin'::app_role)
  OR public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'supervisor'::app_role)
  OR public.has_role(auth.uid(),'licensing_officer'::app_role)
  OR public.has_role(auth.uid(),'analyst'::app_role)
);

DROP POLICY IF EXISTS "Auth users read steps" ON public.approval_steps;
CREATE POLICY "Internal users read steps"
ON public.approval_steps FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'super_admin'::app_role)
  OR public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'supervisor'::app_role)
  OR public.has_role(auth.uid(),'licensing_officer'::app_role)
  OR public.has_role(auth.uid(),'analyst'::app_role)
);

DROP POLICY IF EXISTS "Auth users read delegation rules" ON public.delegation_rules;
CREATE POLICY "Internal users read delegation rules"
ON public.delegation_rules FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'super_admin'::app_role)
  OR public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'supervisor'::app_role)
  OR public.has_role(auth.uid(),'licensing_officer'::app_role)
);

-- workflow_instances: clients should not create instances directly.
DROP POLICY IF EXISTS "Authenticated users can create workflow instances" ON public.workflow_instances;
DROP POLICY IF EXISTS "Auth users read workflow instances" ON public.workflow_instances;

CREATE POLICY "Internal users read workflow instances"
ON public.workflow_instances FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'super_admin'::app_role)
  OR public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'supervisor'::app_role)
  OR public.has_role(auth.uid(),'licensing_officer'::app_role)
  OR public.has_role(auth.uid(),'analyst'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.applications a
    WHERE a.id = workflow_instances.entity_id
      AND a.applicant_id = auth.uid()
  )
);

-- =====================================================================
-- P1: idempotent final approval — unique constraints
-- =====================================================================

-- One license per application (where set)
CREATE UNIQUE INDEX IF NOT EXISTS uq_licenses_application_id
  ON public.licenses (application_id)
  WHERE application_id IS NOT NULL;

-- One licensee per license (where set)
CREATE UNIQUE INDEX IF NOT EXISTS uq_licensees_license_id
  ON public.licensees (license_id)
  WHERE license_id IS NOT NULL;

-- =====================================================================
-- P2: Indexes for common query paths
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_workflow_instances_entity_status
  ON public.workflow_instances (entity_type, entity_id, status);

CREATE INDEX IF NOT EXISTS idx_approval_actions_application_created
  ON public.approval_actions (application_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_approval_actions_application_action_type
  ON public.approval_actions (application_id, action_type);

CREATE INDEX IF NOT EXISTS idx_approval_workflows_scope
  ON public.approval_workflows (entity_type, is_active, license_type, regulator_id, sector_id, category_id);

CREATE INDEX IF NOT EXISTS idx_applications_applicant_status_created
  ON public.applications (applicant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_application
  ON public.payments (application_id);

-- =====================================================================
-- P1: Atomic workflow transition RPC
-- =====================================================================
-- Performs an entire workflow action in one transaction, with row-level
-- locking on workflow_instances. allowed_actions is authoritative — there
-- are no synthetic bypasses. The actor identity must be passed in by a
-- trusted edge function (validated via Supabase auth before invocation).

CREATE OR REPLACE FUNCTION public.perform_workflow_transition(
  _application_id uuid,
  _instance_id uuid,
  _step_id uuid,
  _action_type text,
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

  -- Resolve actor's effective system roles
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

  -- Lock application + instance rows
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

  -- Load current step + counts
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

  -- Approver role check
  IF NOT v_is_super AND NOT (v_step.approver_role::text = ANY(v_actor_roles)) THEN
    RETURN jsonb_build_object('error',format('Only %s can act on this step', v_step.approver_role),
                              'code','WRONG_APPROVER','http',403);
  END IF;

  -- allowed_actions is authoritative; no synthetic bypass.
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

  -- Final approval is handled outside this function (license/licensee creation
  -- needs auth admin APIs). The edge function calls approve-pre-licensee instead.
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

  -- Insert action record
  INSERT INTO public.approval_actions (
    application_id, step_id, workflow_instance_id, actor_id,
    action, action_type, comments, responded_at
  ) VALUES (
    _application_id, v_step.id, v_instance.id, _actor_id,
    _action_type, _action_type, NULLIF(trim(_comments),''), v_now
  );

  -- Update application
  UPDATE public.applications
     SET current_step_id = v_new_step_id,
         status = COALESCE(v_new_app_status, status),
         rejected_at = CASE WHEN v_new_app_status = 'rejected' THEN v_now ELSE rejected_at END,
         updated_at = v_now
   WHERE id = _application_id;

  -- Audit
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

  -- Notify applicant on reject / resubmission
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
$$;

REVOKE ALL ON FUNCTION public.perform_workflow_transition(uuid,uuid,uuid,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.perform_workflow_transition(uuid,uuid,uuid,text,text,uuid) TO service_role;
