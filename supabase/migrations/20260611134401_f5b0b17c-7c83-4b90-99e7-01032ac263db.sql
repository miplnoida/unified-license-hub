
-- ============================================================
-- WORKFLOW VERSIONING + REGISTRATION NOTIFICATION SEEDERS
-- ============================================================

-- 1. approval_workflow_versions: immutable snapshots of a workflow at publish time
CREATE TABLE IF NOT EXISTS public.approval_workflow_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     uuid NOT NULL REFERENCES public.approval_workflows(id) ON DELETE CASCADE,
  version_number  integer NOT NULL,
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  snapshot        jsonb NOT NULL,
  notes           text,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  published_at    timestamptz,
  UNIQUE (workflow_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_awv_workflow ON public.approval_workflow_versions(workflow_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_awv_status ON public.approval_workflow_versions(workflow_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.approval_workflow_versions TO authenticated;
GRANT ALL ON public.approval_workflow_versions TO service_role;

ALTER TABLE public.approval_workflow_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read workflow versions"
  ON public.approval_workflow_versions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins manage workflow versions"
  ON public.approval_workflow_versions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. approval_workflows: pointers to current/draft version
ALTER TABLE public.approval_workflows
  ADD COLUMN IF NOT EXISTS current_published_version_id uuid REFERENCES public.approval_workflow_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS draft_version_id uuid REFERENCES public.approval_workflow_versions(id) ON DELETE SET NULL;

-- 3. workflow_instances: pin to a version + snapshot for in-progress execution
ALTER TABLE public.workflow_instances
  ADD COLUMN IF NOT EXISTS workflow_version_id uuid REFERENCES public.approval_workflow_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS version_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS current_step_key text;

CREATE INDEX IF NOT EXISTS idx_workflow_instances_version ON public.workflow_instances(workflow_version_id);

-- 4. approval_actions: track which version processed each action
ALTER TABLE public.approval_actions
  ADD COLUMN IF NOT EXISTS workflow_version_id uuid REFERENCES public.approval_workflow_versions(id) ON DELETE SET NULL;

-- 5. Build a v2 snapshot for an existing workflow (server-side equivalent of the TS builder)
CREATE OR REPLACE FUNCTION public.build_workflow_snapshot(_workflow_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'version', 2,
    'steps', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'local_id', s.id::text,
            'step_order', s.step_order,
            'name', s.name,
            'description', s.description,
            'approver_role', s.approver_role::text,
            'approver_role_id', s.approver_role_id,
            'approver_type', s.approver_type,
            'approver_config', s.approver_config,
            'sla_hours', s.sla_hours,
            'auto_approve_on_timeout', s.auto_approve_on_timeout,
            'allowed_actions', s.allowed_actions,
            'actions', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'action_type', a.action_type,
                'label', a.label,
                'require_comments', a.require_comments,
                'result_status_override', a.result_status_override,
                'next_step_mode', a.next_step_mode,
                'next_step_local_id', a.next_step_id::text,
                'end_state', a.end_state,
                'sort_order', a.sort_order,
                'is_enabled', a.is_enabled
              ) ORDER BY a.sort_order)
              FROM public.approval_step_actions a WHERE a.step_id = s.id
            ), '[]'::jsonb),
            'entry_notifications', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'event_key', n.event_key,
                'recipient_type', n.recipient_type,
                'recipient_config', n.recipient_config,
                'template_id', n.template_id,
                'is_enabled', n.is_enabled
              ))
              FROM public.approval_step_entry_notifications n WHERE n.step_id = s.id
            ), '[]'::jsonb),
            'action_notifications', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'action_type', n.action_type,
                'event_key', n.event_key,
                'recipient_type', n.recipient_type::text,
                'recipient_config', n.recipient_config,
                'template_id', n.template_id,
                'is_enabled', n.is_enabled
              ))
              FROM public.approval_action_notifications n WHERE n.step_id = s.id
            ), '[]'::jsonb)
          ) ORDER BY s.step_order
        )
        FROM public.approval_steps s WHERE s.workflow_id = _workflow_id
      ),
      '[]'::jsonb
    )
  )
$$;

GRANT EXECUTE ON FUNCTION public.build_workflow_snapshot(uuid) TO authenticated, service_role;

-- 6. Publish a new version (snapshots live state). If no draft exists, snapshot current live state.
CREATE OR REPLACE FUNCTION public.publish_workflow_version(_workflow_id uuid, _notes text DEFAULT NULL)
RETURNS public.approval_workflow_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _next_num integer;
  _snapshot jsonb;
  _row public.approval_workflow_versions;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(MAX(version_number),0) + 1 INTO _next_num
    FROM public.approval_workflow_versions WHERE workflow_id = _workflow_id;

  _snapshot := public.build_workflow_snapshot(_workflow_id);

  INSERT INTO public.approval_workflow_versions
    (workflow_id, version_number, status, snapshot, notes, created_by, published_at)
  VALUES
    (_workflow_id, _next_num, 'published', _snapshot, _notes, auth.uid(), now())
  RETURNING * INTO _row;

  UPDATE public.approval_workflows
     SET current_published_version_id = _row.id,
         draft_version_id = NULL,
         updated_at = now()
   WHERE id = _workflow_id;

  RETURN _row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.publish_workflow_version(uuid, text) TO authenticated;

-- 7. Backfill: create v1 'published' for every existing workflow, pin existing instances
DO $$
DECLARE
  _wf RECORD;
  _ver_id uuid;
BEGIN
  FOR _wf IN SELECT id FROM public.approval_workflows WHERE current_published_version_id IS NULL LOOP
    INSERT INTO public.approval_workflow_versions
      (workflow_id, version_number, status, snapshot, notes, published_at)
    VALUES
      (_wf.id, 1, 'published', public.build_workflow_snapshot(_wf.id), 'Auto-created from existing workflow', now())
    RETURNING id INTO _ver_id;

    UPDATE public.approval_workflows
       SET current_published_version_id = _ver_id
     WHERE id = _wf.id;

    UPDATE public.workflow_instances wi
       SET workflow_version_id = _ver_id,
           version_snapshot = (SELECT snapshot FROM public.approval_workflow_versions WHERE id = _ver_id),
           current_step_key = wi.current_step_id::text
     WHERE wi.workflow_id = _wf.id
       AND wi.workflow_version_id IS NULL;
  END LOOP;
END $$;

-- 8. Auto-pin newly created workflow instances to the workflow's current published version
CREATE OR REPLACE FUNCTION public.pin_workflow_instance_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ver_id uuid;
  _snap jsonb;
BEGIN
  IF NEW.workflow_version_id IS NOT NULL THEN
    IF NEW.version_snapshot IS NULL THEN
      SELECT snapshot INTO NEW.version_snapshot FROM public.approval_workflow_versions WHERE id = NEW.workflow_version_id;
    END IF;
    IF NEW.current_step_key IS NULL AND NEW.current_step_id IS NOT NULL THEN
      NEW.current_step_key := NEW.current_step_id::text;
    END IF;
    RETURN NEW;
  END IF;

  SELECT current_published_version_id INTO _ver_id FROM public.approval_workflows WHERE id = NEW.workflow_id;
  IF _ver_id IS NOT NULL THEN
    SELECT snapshot INTO _snap FROM public.approval_workflow_versions WHERE id = _ver_id;
    NEW.workflow_version_id := _ver_id;
    NEW.version_snapshot := _snap;
    IF NEW.current_step_key IS NULL AND NEW.current_step_id IS NOT NULL THEN
      NEW.current_step_key := NEW.current_step_id::text;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pin_workflow_instance_version ON public.workflow_instances;
CREATE TRIGGER trg_pin_workflow_instance_version
BEFORE INSERT ON public.workflow_instances
FOR EACH ROW EXECUTE FUNCTION public.pin_workflow_instance_version();

-- 9. Stamp approval_actions with the instance's pinned version
CREATE OR REPLACE FUNCTION public.stamp_approval_action_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.workflow_version_id IS NULL AND NEW.workflow_instance_id IS NOT NULL THEN
    SELECT workflow_version_id INTO NEW.workflow_version_id
      FROM public.workflow_instances WHERE id = NEW.workflow_instance_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_approval_action_version ON public.approval_actions;
CREATE TRIGGER trg_stamp_approval_action_version
BEFORE INSERT ON public.approval_actions
FOR EACH ROW EXECUTE FUNCTION public.stamp_approval_action_version();

-- ============================================================
-- REGISTRATION NOTIFICATION EVENT SEEDERS (idempotent)
-- ============================================================
INSERT INTO public.notification_event_configs
  (event_key, description, title_template, message_template, email_subject_template, email_body_template, channels, recipient_rules, notification_type)
VALUES
  ('registration.workflow_started',
    'Triggered when a registration workflow starts',
    'Registration {{registration_reference}} workflow started',
    'Workflow {{workflow_name}} (v{{workflow_version}}) started for registration {{registration_reference}}.',
    'Registration {{registration_reference}} — workflow started',
    'Hello,\n\nWorkflow {{workflow_name}} (v{{workflow_version}}) has been started for registration {{registration_reference}}.\n\nApplicant: {{applicant_name}}\nCurrent step: {{step_name}}\n',
    ARRAY['in_app','email'], '[]'::jsonb, 'info'),
  ('registration.step_assigned',
    'Triggered when a registration step is assigned to a reviewer',
    'New registration assigned: {{registration_reference}}',
    'You have a new registration {{registration_reference}} pending at step {{step_name}}.',
    'New registration assigned: {{registration_reference}}',
    'You have been assigned to review registration {{registration_reference}} at step {{step_name}} (workflow {{workflow_name}} v{{workflow_version}}).',
    ARRAY['in_app','email'], '[]'::jsonb, 'info'),
  ('registration.step_entered',
    'Triggered when a registration enters a new workflow step',
    'Registration {{registration_reference}} reached step {{step_name}}',
    'Registration {{registration_reference}} is now at step {{step_name}}.',
    'Registration {{registration_reference}} — step {{step_name}}',
    'Registration {{registration_reference}} entered step {{step_name}} of workflow {{workflow_name}} (v{{workflow_version}}).',
    ARRAY['in_app','email'], '[]'::jsonb, 'info'),
  ('registration.pending_review',
    'Triggered when a registration is pending review',
    'Registration {{registration_reference}} pending review',
    'Registration {{registration_reference}} is pending review at {{step_name}}.',
    'Registration {{registration_reference}} pending your review',
    'Registration {{registration_reference}} from {{applicant_name}} is pending your review at step {{step_name}}.',
    ARRAY['in_app','email'], '[]'::jsonb, 'info'),
  ('registration.approved_step',
    'Triggered when a registration step is approved',
    'Registration {{registration_reference}} — step approved',
    'Step {{step_name}} approved for registration {{registration_reference}} by {{reviewer_name}}.',
    'Registration {{registration_reference}} — step approved',
    '{{reviewer_name}} approved step {{step_name}} for registration {{registration_reference}}.\nRemarks: {{reviewer_comments}}',
    ARRAY['in_app','email'], '[]'::jsonb, 'success'),
  ('registration.send_back',
    'Triggered when a registration step is sent back',
    'Registration {{registration_reference}} sent back',
    'Registration {{registration_reference}} was sent back at step {{step_name}}.',
    'Registration {{registration_reference}} sent back',
    '{{reviewer_name}} sent registration {{registration_reference}} back at step {{step_name}}.\nRemarks: {{reviewer_comments}}',
    ARRAY['in_app','email'], '[]'::jsonb, 'warning'),
  ('registration.resubmission_requested',
    'Triggered when a registration resubmission is requested',
    'Registration {{registration_reference}} — resubmission requested',
    'Resubmission requested for registration {{registration_reference}}.',
    'Action required: resubmit registration {{registration_reference}}',
    'Resubmission has been requested for registration {{registration_reference}}.\nReviewer: {{reviewer_name}}\nRemarks: {{reviewer_comments}}\n\nPlease update and resubmit at {{portal_url}}/register.',
    ARRAY['in_app','email'], '[]'::jsonb, 'warning'),
  ('registration.returned_for_correction',
    'Triggered when a registration is returned for correction',
    'Registration {{registration_reference}} returned for correction',
    'Registration {{registration_reference}} requires correction at step {{step_name}}.',
    'Registration {{registration_reference}} returned for correction',
    'Registration {{registration_reference}} was returned for correction by {{reviewer_name}}.\nRemarks: {{reviewer_comments}}',
    ARRAY['in_app','email'], '[]'::jsonb, 'warning'),
  ('registration.more_info_requested',
    'Triggered when more information is requested on a registration',
    'More information required: {{registration_reference}}',
    'More information requested for registration {{registration_reference}}.',
    'More information required for registration {{registration_reference}}',
    '{{reviewer_name}} requested more information for registration {{registration_reference}}.\nRemarks: {{reviewer_comments}}',
    ARRAY['in_app','email'], '[]'::jsonb, 'warning'),
  ('registration.escalated',
    'Triggered when a registration is escalated',
    'Registration {{registration_reference}} escalated',
    'Registration {{registration_reference}} has been escalated at step {{step_name}}.',
    'Registration {{registration_reference}} escalated',
    'Registration {{registration_reference}} has been escalated at step {{step_name}} by {{reviewer_name}}.',
    ARRAY['in_app','email'], '[]'::jsonb, 'warning'),
  ('registration.final_approved',
    'Triggered when a registration is finally approved',
    'Registration {{registration_reference}} approved',
    'Registration {{registration_reference}} has been approved.',
    'Your registration {{registration_reference}} has been approved',
    'Congratulations {{applicant_name}},\n\nYour registration {{registration_reference}} has been approved.\nYou can now access the portal at {{portal_url}}.',
    ARRAY['in_app','email'], '[]'::jsonb, 'success'),
  ('registration.final_rejected',
    'Triggered when a registration is finally rejected',
    'Registration {{registration_reference}} rejected',
    'Registration {{registration_reference}} has been rejected.',
    'Your registration {{registration_reference}} was rejected',
    'Dear {{applicant_name}},\n\nYour registration {{registration_reference}} has been rejected.\nReason: {{reviewer_comments}}',
    ARRAY['in_app','email'], '[]'::jsonb, 'error'),
  ('registration.correction_required',
    'Sent to the applicant when correction is required',
    'Correction required for registration {{registration_reference}}',
    'Please update your registration {{registration_reference}}.',
    'Action required: update registration {{registration_reference}}',
    'Dear {{applicant_name}},\n\nYour registration {{registration_reference}} requires updates.\nRemarks: {{reviewer_comments}}\n\nUpdate it at {{portal_url}}/register.',
    ARRAY['in_app','email'], '[]'::jsonb, 'warning'),
  ('registration.resubmitted',
    'Triggered when a registration is resubmitted',
    'Registration {{registration_reference}} resubmitted',
    'Registration {{registration_reference}} was resubmitted by {{applicant_name}}.',
    'Registration {{registration_reference}} resubmitted',
    'Registration {{registration_reference}} was resubmitted by {{applicant_name}} on {{submitted_date}}.',
    ARRAY['in_app','email'], '[]'::jsonb, 'info'),
  ('registration.new_submission',
    'Notifies admins of a new registration submission',
    'New registration submitted: {{registration_reference}}',
    'A new registration {{registration_reference}} was submitted by {{applicant_name}}.',
    'New registration submitted: {{registration_reference}}',
    'A new registration {{registration_reference}} was submitted by {{applicant_name}} ({{email}}) on {{submitted_date}}.',
    ARRAY['in_app','email'], '[]'::jsonb, 'info'),
  ('registration.action_taken',
    'Triggered when any workflow action is taken on a registration',
    'Action {{action_name}} on registration {{registration_reference}}',
    '{{reviewer_name}} performed {{action_name}} on registration {{registration_reference}}.',
    'Registration {{registration_reference}} — action taken',
    '{{reviewer_name}} performed {{action_name}} on registration {{registration_reference}} at step {{step_name}}.\nRemarks: {{reviewer_comments}}',
    ARRAY['in_app'], '[]'::jsonb, 'info'),
  ('registration.workflow_completed',
    'Triggered when a registration workflow completes',
    'Registration workflow completed: {{registration_reference}}',
    'Workflow {{workflow_name}} (v{{workflow_version}}) completed for registration {{registration_reference}} with status {{status}}.',
    'Registration workflow completed: {{registration_reference}}',
    'Workflow {{workflow_name}} v{{workflow_version}} for registration {{registration_reference}} completed with status {{status}}.',
    ARRAY['in_app','email'], '[]'::jsonb, 'info')
ON CONFLICT (event_key) DO UPDATE SET
  description = EXCLUDED.description,
  title_template = EXCLUDED.title_template,
  message_template = EXCLUDED.message_template,
  email_subject_template = EXCLUDED.email_subject_template,
  email_body_template = EXCLUDED.email_body_template,
  channels = EXCLUDED.channels,
  updated_at = now();
