
-- 1) Seed notification templates (idempotent)
INSERT INTO public.notification_templates (name, event_type, channel, subject, body, is_active)
SELECT 'Complaint Filed (Email)', 'complaint.filed', 'email',
  'We received your complaint {{complaint_number}}',
  'Hello,\n\nWe have received your complaint {{complaint_number}} — "{{subject}}".\nOur team will review it and respond by {{sla_due_at}}.\n\nRegards,\nRegulator',
  true
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE event_type='complaint.filed' AND channel='email');

INSERT INTO public.notification_templates (name, event_type, channel, subject, body, is_active)
SELECT 'Complaint Filed', 'complaint.filed', 'in_app',
  'Complaint {{complaint_number}} received',
  'Your complaint "{{subject}}" was received. SLA due {{sla_due_at}}.',
  true
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE event_type='complaint.filed' AND channel='in_app');

INSERT INTO public.notification_templates (name, event_type, channel, subject, body, is_active)
SELECT 'Complaint Assigned (Email)', 'complaint.assigned', 'email',
  'Complaint {{complaint_number}} assigned to you',
  'Complaint {{complaint_number}} — "{{subject}}" has been assigned. SLA due {{sla_due_at}}.',
  true
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE event_type='complaint.assigned' AND channel='email');

INSERT INTO public.notification_templates (name, event_type, channel, subject, body, is_active)
SELECT 'Complaint Assigned', 'complaint.assigned', 'in_app',
  'Complaint {{complaint_number}} assigned',
  'Complaint "{{subject}}" assigned to you. SLA due {{sla_due_at}}.',
  true
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE event_type='complaint.assigned' AND channel='in_app');

-- 2) Trigger function: start workflow + notifications on complaint insert
CREATE OR REPLACE FUNCTION public.start_complaint_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workflow_id uuid;
  v_first_step_id uuid;
  v_first_step_role text;
  v_instance_id uuid;
  v_assignee_user_id uuid;
BEGIN
  -- Resolve best-matching active complaint workflow (regulator + optional sector match)
  SELECT w.id INTO v_workflow_id
  FROM public.approval_workflows w
  WHERE w.entity_type = 'complaint'
    AND w.is_active = true
    AND (w.regulator_id IS NULL OR w.regulator_id = NEW.regulator_id)
  ORDER BY
    (w.regulator_id IS NOT NULL)::int DESC,
    w.updated_at DESC NULLS LAST
  LIMIT 1;

  IF v_workflow_id IS NOT NULL THEN
    SELECT s.id, s.approver_role INTO v_first_step_id, v_first_step_role
    FROM public.approval_steps s
    WHERE s.workflow_id = v_workflow_id
    ORDER BY s.step_order ASC
    LIMIT 1;

    IF v_first_step_id IS NOT NULL THEN
      INSERT INTO public.workflow_instances (workflow_id, entity_type, entity_id, current_step_id, status, started_at)
      VALUES (v_workflow_id, 'complaint', NEW.id, v_first_step_id, 'active', now())
      RETURNING id INTO v_instance_id;

      -- Dynamic assignment: override any static triage team with the workflow role
      IF v_first_step_role IS NOT NULL THEN
        UPDATE public.complaints
        SET assigned_team = v_first_step_role
        WHERE id = NEW.id;

        -- In-app notify all users holding this role
        INSERT INTO public.notifications (user_id, title, message, type, entity_type, entity_id, channel, delivery_status)
        SELECT ur.user_id,
               'Complaint ' || NEW.complaint_number || ' assigned',
               'Complaint "' || NEW.subject || '" is assigned to you. SLA due ' || COALESCE(to_char(NEW.sla_due_at,'YYYY-MM-DD HH24:MI'),'—'),
               'complaint.assigned',
               'complaint',
               NEW.id::text,
               'in_app',
               'delivered'
        FROM public.user_roles ur
        WHERE ur.role::text = v_first_step_role;
      END IF;
    END IF;
  END IF;

  -- Acknowledgement notification to complainant (in-app)
  IF NEW.complainant_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message, type, entity_type, entity_id, channel, delivery_status)
    VALUES (
      NEW.complainant_id,
      'Complaint ' || NEW.complaint_number || ' received',
      'Your complaint "' || NEW.subject || '" was received. SLA due ' || COALESCE(to_char(NEW.sla_due_at,'YYYY-MM-DD HH24:MI'),'—'),
      'complaint.filed',
      'complaint',
      NEW.id::text,
      'in_app',
      'delivered'
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block complaint intake; log via NOTICE
  RAISE NOTICE 'start_complaint_workflow error: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_start_complaint_workflow ON public.complaints;
CREATE TRIGGER trg_start_complaint_workflow
AFTER INSERT ON public.complaints
FOR EACH ROW EXECUTE FUNCTION public.start_complaint_workflow();
